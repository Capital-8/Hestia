// Projeto de referência das massas (fixtureMassa.ts, A.10) para o portão visual da fase 2, e a contagem do que o kernel Rust devolve.
//   npx vite-node tests/e2e/massa-fixture.mts gerar /tmp/hestia-massa-fixture.json
//   npx vite-node tests/e2e/massa-fixture.mts contar <projeto.json> '<linha de corte em JSON>'
// `contar` imprime uma linha `CONTAGEM {...}` com, por massa, as linhas e os pontos da planta (consulta 141, nível 0, como a planta do app)
// e do corte (consulta 143, a linha dada). O bundle de produção não expõe o serviço de massa, então a contagem roda aqui, em Node, com o mesmo
// wasm do app (`packages/geom/assets/geom_wasm.wasm`, ou `KERNEL_WASM_PATH`).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CORTE_PADRAO_PLANTA_MASSA, iniciarDespachoKernel, servicoMassa } from '@hestia/engine';
import { levelElevation, viewRangeOf, type Id, type Project } from '@hestia/model';
import { projetoComMassas } from '../../packages/engine/src/fixtureMassa.ts';
import { caminhoDoWasm } from '../../packages/geom/src/kernel/caminhoWasm.ts';

interface LinhaDeCorte {
  a: { x: number; y: number };
  b: { x: number; y: number };
  depth: number;
}

interface Contagem {
  linhas: number;
  pontos: number;
}

const [modo, entrada, extra] = process.argv.slice(2);

/** Carrega o wasm como o app faz (`iniciarDespachoKernel`) e espera o serviço ficar pronto. Falso se o binário não existe ou não sobe. */
async function kernelPronto(): Promise<boolean> {
  const caminho = caminhoDoWasm();
  if (!existsSync(caminho)) return false;
  await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => readFileSync(caminho));
  for (let i = 0; i < 100 && !servicoMassa().pronto(); i++) await new Promise((r) => setTimeout(r, 100));
  return servicoMassa().pronto();
}

/** Soma linhas e pontos por massa (o corte tem uma linha por anel e por cópia). */
function porMassa(linhas: ReadonlyArray<{ massaId: Id; pontos: unknown[] }>): Record<string, Contagem> {
  const out: Record<string, Contagem> = {};
  for (const l of linhas) {
    const c = (out[l.massaId] ??= { linhas: 0, pontos: 0 });
    c.linhas++;
    c.pontos += l.pontos.length;
  }
  return out;
}

if (modo === 'gerar') {
  if (!entrada) throw new Error('uso: gerar <saida.json>');
  writeFileSync(entrada, JSON.stringify(projetoComMassas()));
  console.log(`GERADO ${entrada}`);
  process.exit(0);
}

if (modo === 'contar') {
  if (!entrada || !extra) throw new Error("uso: contar <projeto.json> '<linha de corte em JSON>'");
  const p = JSON.parse(readFileSync(entrada, 'utf8')) as Project;
  const corte = JSON.parse(extra) as LinhaDeCorte;
  if (!(await kernelPronto())) {
    console.log(`CONTAGEM ${JSON.stringify({ kernel: false, ultimoErro: servicoMassa().ultimoErro() })}`);
    process.exit(1);
  }
  const nivel = p.levels.find((l) => l.id === 'lv_0');
  if (!nivel) throw new Error('nível lv_0 ausente no projeto');
  const cota = levelElevation(p, nivel.id);
  const faixa = viewRangeOf(p, nivel.id);
  const planta = servicoMassa().planta(p, null, cota + CORTE_PADRAO_PLANTA_MASSA, cota + faixa.bottom, cota + faixa.top);
  const cortado = servicoMassa().corte(p, null, corte.a.x, corte.a.y, corte.b.x - corte.a.x, corte.b.y - corte.a.y, corte.depth);
  if (!planta || !cortado) {
    console.log(`CONTAGEM ${JSON.stringify({ kernel: true, ultimoErro: servicoMassa().ultimoErro(), planta: planta === null, corte: cortado === null })}`);
    process.exit(1);
  }
  const massas = Object.values(p.elements)
    .filter((e) => e.kind === 'mass')
    .map((e) => e.id);
  console.log(`CONTAGEM ${JSON.stringify({ kernel: true, massas, planta: porMassa(planta), corte: porMassa(cortado) })}`);
  process.exit(0);
}

throw new Error('modo desconhecido: use gerar ou contar');
