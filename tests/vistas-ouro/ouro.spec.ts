import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { abrirProjeto, chavesDasVistas, saidasDaVista, saidasDoProjeto } from './adaptador.ts';
import { relatorio } from './comparar.ts';

/**
 * Ouro das vistas de planta (docs/vistas/PLANO-MESTRE.md, seção 5): compara a saída atual do programa (desenho, DXF,
 * pranchas, seleção, ocultos, avisos e quantitativos) com a gravada em `tests/vistas-ouro/ouro/`.
 *
 * Regravar: `npm run test:vistas-ouro -- --gravar` (ou `VISTAS_OURO_GRAVAR=1`). NÃO regrave para fazer passar.
 */

const raiz = fileURLToPath(new URL('./', import.meta.url));
const GRAVAR = process.env.VISTAS_OURO_GRAVAR === '1';
const arquivoSeguro = (s: string): string => s.replace(/[^A-Za-z0-9_.-]/g, '_');

const projetos = readdirSync(`${raiz}projetos`).filter((f) => f.endsWith('.json')).sort();

/** Todas as saídas de um projeto: nome do arquivo de ouro → texto. */
function saidasDoArquivo(arquivo: string): Map<string, string> {
  const p = abrirProjeto(JSON.parse(readFileSync(`${raiz}projetos/${arquivo}`, 'utf8')));
  const out = new Map<string, string>();
  for (const [saida, texto] of Object.entries(saidasDoProjeto(p))) out.set(`projeto.${saida}.txt`, texto);
  for (const chave of chavesDasVistas(p)) {
    for (const [saida, texto] of Object.entries(saidasDaVista(p, chave))) out.set(`${arquivoSeguro(chave)}.${saida}.txt`, texto);
  }
  return out;
}

const lerGravado = (pasta: string): Map<string, string> =>
  new Map(existsSync(pasta) ? readdirSync(pasta).filter((f) => f.endsWith('.txt')).map((f) => [f, readFileSync(`${pasta}/${f}`, 'utf8')] as const) : []);

describe(GRAVAR ? 'ouro das vistas (GRAVANDO)' : 'ouro das vistas', () => {
  for (const arquivo of projetos) {
    const nome = arquivo.replace(/\.json$/, '');
    it(nome, () => {
      const pasta = `${raiz}ouro/${nome}`;
      const atual = saidasDoArquivo(arquivo);
      if (GRAVAR) {
        rmSync(pasta, { recursive: true, force: true });
        mkdirSync(pasta, { recursive: true });
        for (const [f, t] of atual) writeFileSync(`${pasta}/${f}`, t);
        return;
      }
      const gravado = lerGravado(pasta);
      expect(gravado.size, `sem ouro gravado para ${nome}: rode com --gravar (só na Fase 0)`).toBeGreaterThan(0);
      const falha = relatorio(nome, gravado, atual);
      if (falha) throw new Error(`O ouro de ${nome} mudou:\n${falha}\n\nSe a mudança não está prevista no plano, é defeito: não regrave.`);
    });
  }
});
