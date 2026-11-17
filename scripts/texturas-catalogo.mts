/**
 * Gera o catálogo de texturas online (catalogo.json + atlas de miniaturas) a partir do bucket R2.
 *
 * Uso: npx vite-node scripts/texturas-catalogo.mts -- [--saida <pasta>] [--sem-miniaturas]
 *   (ou: npm run texturas:catalogo -- [--saida <pasta>] [--sem-miniaturas])
 * Credenciais: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL em process.env
 * ou em C:\Users\Eng\.hestia\r2.env. O script só LÊ do bucket; o envio de `textures/_catalogo` é manual.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CATALOGO_MINIATURAS, montarCatalogo, urlTextura, type TexturaItem } from '../packages/io/src/texturasCatalogo.ts';
import { lerConfigR2, listarObjetos } from './lib/r2.mts';

const LADO = 96;
const COLUNAS = 24;
const CONCORRENCIA = 6;
const ARQ_ENV = path.join(os.homedir(), '.hestia', 'r2.env');

const args = process.argv.slice(2);
const valorDe = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const semMiniaturas = args.includes('--sem-miniaturas');
const saida = path.resolve(valorDe('--saida') ?? path.join(os.homedir(), '.hestia', 'catalogo-texturas'));
const pastaCatalogo = path.join(saida, 'textures', '_catalogo');
const cache = path.join(os.tmpdir(), 'hestia-texturas-cache');

/** Executável do Chromium instalado pelo Playwright (o mais recente). */
function acharChromium(): string {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const pastas = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
  for (const d of pastas) {
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const exe = path.join(base, d, sub, 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('Chromium do Playwright não encontrado em %LOCALAPPDATA%\\ms-playwright');
}

/** Baixa o Color.jpg para o cache (com retomada: arquivo já baixado é reaproveitado). Devolve o caminho ou null. */
async function baixar(url: string, destino: string): Promise<string | null> {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) return destino;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(`${destino}.parcial`, buf);
      fs.renameSync(`${destino}.parcial`, destino);
      return destino;
    } catch {
      await new Promise((ok) => setTimeout(ok, 500 * (tentativa + 1)));
    }
  }
  return null;
}

/** Executa `fn` sobre os itens com no máximo `n` em paralelo. */
async function paralelo<T>(itens: readonly T[], n: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let prox = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (prox < itens.length) {
        const i = prox++;
        await fn(itens[i]!, i);
      }
    }),
  );
}

/** Baixa as cores, reduz (recorte central quadrado) e compõe o atlas JPEG. Devolve os índices que ganharam ícone. */
async function gerarAtlas(cfgPublica: string, itens: TexturaItem[]): Promise<{ jpeg: Buffer; ok: Set<number> }> {
  fs.mkdirSync(cache, { recursive: true });
  const arquivos: Array<string | null> = new Array(itens.length).fill(null);
  let feitos = 0;
  await paralelo(itens, CONCORRENCIA, async (it, i) => {
    arquivos[i] = await baixar(urlTextura(cfgPublica, it.mapas.cor), path.join(cache, `${it.id}.jpg`));
    feitos++;
    if (feitos % 50 === 0 || feitos === itens.length) console.log(`  download ${feitos}/${itens.length}`);
  });

  const navegador = await chromium.launch({ executablePath: acharChromium(), headless: true });
  try {
    const pagina = await navegador.newPage();
    await pagina.goto('about:blank');
    const linhas = Math.ceil(itens.length / COLUNAS);
    await pagina.evaluate(
      ([w, h]) => {
        const c = document.createElement('canvas');
        c.width = w!;
        c.height = h!;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, w!, h!);
        (window as unknown as { __atlas: HTMLCanvasElement }).__atlas = c;
      },
      [COLUNAS * LADO, linhas * LADO],
    );
    const ok = new Set<number>();
    for (let i = 0; i < itens.length; i++) {
      const arq = arquivos[i];
      if (!arq) continue;
      const b64 = fs.readFileSync(arq).toString('base64');
      const deu = await pagina.evaluate(
        async ([dados, x, y, lado]) => {
          try {
            const bin = Uint8Array.from(atob(dados as string), (ch) => ch.charCodeAt(0));
            const img = await createImageBitmap(new Blob([bin], { type: 'image/jpeg' }));
            const l = Math.min(img.width, img.height);
            const ctx = (window as unknown as { __atlas: HTMLCanvasElement }).__atlas.getContext('2d')!;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, (img.width - l) / 2, (img.height - l) / 2, l, l, x as number, y as number, lado as number, lado as number);
            img.close();
            return true;
          } catch {
            return false;
          }
        },
        [b64, (i % COLUNAS) * LADO, Math.floor(i / COLUNAS) * LADO, LADO],
      );
      if (deu) ok.add(i);
      else console.warn(`  falha ao decodificar ${itens[i]!.id}`);
      if ((i + 1) % 100 === 0) console.log(`  composição ${i + 1}/${itens.length}`);
    }
    const url = await pagina.evaluate(() => (window as unknown as { __atlas: HTMLCanvasElement }).__atlas.toDataURL('image/jpeg', 0.8));
    return { jpeg: Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), ok };
  } finally {
    await navegador.close();
  }
}

async function main(): Promise<void> {
  const cfg = lerConfigR2(ARQ_ENV);
  console.log('Listando textures/ no bucket...');
  const chaves = await listarObjetos(cfg, 'textures/', (n) => process.stdout.write(`\r  ${n} objetos`));
  console.log('');
  const miniaturas = { arquivo: CATALOGO_MINIATURAS, lado: LADO, colunas: COLUNAS };
  const catalogo = montarCatalogo(chaves, semMiniaturas ? {} : { miniaturas });
  console.log(`${catalogo.itens.length} texturas.`);

  fs.mkdirSync(pastaCatalogo, { recursive: true });
  const arqAtlas = path.join(pastaCatalogo, 'miniaturas.jpg');
  if (semMiniaturas) {
    fs.rmSync(arqAtlas, { force: true });
  } else {
    console.log('Gerando atlas de miniaturas...');
    const { jpeg, ok } = await gerarAtlas(cfg.publicUrl, catalogo.itens);
    // Texturas sem miniatura (download/decodificação falhou) ficam sem `icone`; as demais mantêm a posição na grade.
    catalogo.itens.forEach((it, i) => {
      if (!ok.has(i)) delete it.icone;
    });
    fs.writeFileSync(arqAtlas, jpeg);
    console.log(`Atlas: ${ok.size}/${catalogo.itens.length} miniaturas, ${(jpeg.length / 1024).toFixed(0)} KB.`);
  }
  const arqJson = path.join(pastaCatalogo, 'catalogo.json');
  fs.writeFileSync(arqJson, JSON.stringify(catalogo));

  console.log(`\nGerado:\n  ${arqJson}${semMiniaturas ? '' : `\n  ${arqAtlas}`}`);
  console.log(`\nEnvio ao bucket (manual; a chave daqui é só leitura): envie a pasta\n  ${pastaCatalogo}\npara \`textures/_catalogo/\` no bucket (painel do R2 > Upload, ou \`rclone copy "${path.join(saida, 'textures', '_catalogo')}" r2:<bucket>/textures/_catalogo\`).`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
