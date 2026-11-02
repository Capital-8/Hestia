// Núcleo do harness do kernel v2 (decisão 0046 §5): converte as paredes de cada pavimento para a seção `paredes`,
// roda as consultas da Fase 0 no wasm (ou no falso, no autoteste) e na referência TypeScript de força bruta,
// compara e mede (codificação+upload, execução, leitura e total COM a travessia da fronteira).
import { performance } from 'node:perf_hooks';
import { totalThickness, type Project } from '@hestia/model';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { gerenciadorFalso } from '../packages/geom/src/kernel/v2/falso.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeParedes } from '../packages/geom/src/kernel/v2/paredes.ts';
import {
  referenciaEstatisticasNivel,
  referenciaParedesNaCaixa,
  referenciaParesProximos,
  type LinhaParede,
} from '../packages/geom/src/kernel/v2/referencia.ts';

export const TOLERANCIA_F64 = 1e-9;

export interface LinhaDaTabela {
  pavimento: string;
  paredes: number;
  consulta: string;
  chamadas: number;
  refMs: number;
  codificacaoMs: number;
  execucaoMs: number;
  leituraMs: number;
  totalMs: number;
  ok: boolean;
}

export interface ResultadoHarness {
  modo: string;
  paredes: LinhaParede[];
  ignoradas: number;
  upload: { paredes: number; codificacaoMs: number; execucaoMs: number; totalMs: number };
  linhas: LinhaDaTabela[];
  divergencias: string[];
}

/** Paredes de todos os pavimentos como linhas da seção `paredes` (ids internados, níveis = índice do pavimento). */
export function paredesDoProjeto(projeto: Project): { paredes: LinhaParede[]; ignoradas: number; nomes: string[] } {
  const indiceNivel = new Map(projeto.levels.map((l, i) => [l.id, i] as const));
  const paredes: LinhaParede[] = [];
  let ignoradas = 0;
  let proximoId = 1;
  for (const el of Object.values(projeto.elements)) {
    if (el.kind !== 'wall') continue;
    const nivel = indiceNivel.get(el.levelId);
    const tipo = projeto.wallTypes[el.typeId];
    if (nivel === undefined || !tipo) {
      ignoradas++;
      continue;
    }
    paredes.push({ id: proximoId++, nivel, ax: el.a.x, ay: el.a.y, bx: el.b.x, by: el.b.y, espessura: totalThickness(tipo) });
  }
  return { paredes, ignoradas, nomes: projeto.levels.map((l) => l.name || l.id) };
}

const iguaisF64 = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCIA_F64 * Math.max(1, Math.abs(a), Math.abs(b));
const iguaisInt = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

type Caixa = [number, number, number, number];

/** Caixas de teste de um pavimento: tudo, metade esquerda, metade inferior, pequena central e uma vazia. */
export function caixasDeTeste(bbox: Caixa): Caixa[] {
  const [x0, y0, x1, y1] = bbox;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = Math.max((x1 - x0) * 0.05, 0.5);
  const dy = Math.max((y1 - y0) * 0.05, 0.5);
  return [
    [x0 - 1, y0 - 1, x1 + 1, y1 + 1],
    [x0 - 1, y0 - 1, mx, y1 + 1],
    [x0 - 1, y0 - 1, x1 + 1, my],
    [mx - dx, my - dy, mx + dx, my + dy],
    [x1 + 1000, y1 + 1000, x1 + 1001, y1 + 1001],
  ];
}

export interface OpcoesHarness {
  projeto: Project;
  /** Bytes do wasm real; sem eles usa o falso (autoteste do harness). */
  wasm?: ArrayBuffer | Uint8Array;
  /** Gerenciador pronto (testes do harness); tem precedência sobre `wasm`. */
  gerenciador?: GerenciadorKernelV2;
}

export async function executarHarness({ projeto, wasm, gerenciador }: OpcoesHarness): Promise<ResultadoHarness> {
  const { paredes, ignoradas, nomes } = paredesDoProjeto(projeto);
  const ger = gerenciador ?? (wasm ? await GerenciadorKernelV2.dosBytes(wasm) : gerenciadorFalso().ger);
  const inicial = ger.instancia().exports.memoria_usada();
  const divergencias: string[] = [];

  const t0 = performance.now();
  const cena = CenaV2.criar(ger, fonteDeParedes(() => paredes));
  const uploadTotal = performance.now() - t0;
  const upload = { paredes: paredes.length, codificacaoMs: cena.medidas.codificacaoMs, execucaoMs: cena.medidas.execucaoMs, totalMs: uploadTotal };

  const linhas: LinhaDaTabela[] = [];
  for (const passada of [0, 1]) {
    // Passada 0 aquece o JIT e o wasm (compara, mas não reporta); a 1 é a medida.
    for (let nivel = 0; nivel < nomes.length; nivel++) {
      const doNivel = paredes.filter((p) => p.nivel === nivel);
      const acc = new Map<string, LinhaDaTabela>();
      const registrar = (consulta: string, ref: number, total: number, ok: boolean): void => {
        const l = acc.get(consulta) ?? { pavimento: nomes[nivel]!, paredes: doNivel.length, consulta, chamadas: 0, refMs: 0, codificacaoMs: 0, execucaoMs: 0, leituraMs: 0, totalMs: 0, ok: true };
        l.chamadas++;
        l.refMs += ref;
        l.codificacaoMs += cena.medidas.codificacaoMs;
        l.execucaoMs += cena.medidas.execucaoMs;
        l.leituraMs += cena.medidas.leituraMs;
        l.totalMs += total;
        l.ok &&= ok;
        acc.set(consulta, l);
      };
      const falha = (msg: string): void => {
        if (passada === 0) divergencias.push(`${nomes[nivel]}: ${msg}`);
      };
      const medir = <T,>(f: () => T): [T, number] => {
        const a = performance.now();
        const r = f();
        return [r, performance.now() - a];
      };

      // estatisticas_nivel
      const [ref, refMs] = medir(() => referenciaEstatisticasNivel(paredes, nivel));
      const [r, tot] = medir(() => cena.consultar('estatisticas_nivel', [nivel]));
      const okStat =
        r['n_paredes']![0] === ref.nParedes &&
        ref.caixa.every((v, i) => iguaisF64(v, r['caixa']![i]!)) &&
        iguaisF64(ref.comprimentoTotal, r['comprimento_total']![0]!);
      if (!okStat) falha(`estatisticas_nivel difere (wasm ${JSON.stringify([...Object.values(r)].map((a) => Array.from(a)))} x ref ${JSON.stringify(ref)})`);
      registrar('estatisticas_nivel', refMs, tot, okStat);

      // paredes_na_caixa
      for (const [i, c] of caixasDeTeste(ref.caixa).entries()) {
        const [refIds, rm] = medir(() => referenciaParedesNaCaixa(paredes, nivel, ...c));
        const [s, t] = medir(() => cena.consultar('paredes_na_caixa', [nivel, ...c]));
        const ok = iguaisInt(refIds, s['ids']!);
        if (!ok) falha(`paredes_na_caixa caixa ${i} difere (${s['ids']!.length} x ${refIds.length} ids)`);
        registrar('paredes_na_caixa', rm, t, ok);
      }

      // pares_proximos
      for (const tol of [0, 0.05]) {
        const [refPares, rm] = medir(() => referenciaParesProximos(paredes, nivel, tol));
        const [s, t] = medir(() => cena.consultar('pares_proximos', [nivel, tol]));
        const ok = iguaisInt(refPares, s['pares']!);
        if (!ok) falha(`pares_proximos tol ${tol} difere (${s['pares']!.length / 2} x ${refPares.length / 2} pares)`);
        registrar(`pares_proximos(tol ${tol})`, rm, t, ok);
      }
      if (passada === 1) linhas.push(...acc.values());
    }
  }

  cena.destruir();
  const final = ger.instancia().exports.memoria_usada();
  if (final !== inicial) divergencias.push(`vazamento: memoria_usada ${inicial} antes da cena, ${final} depois de destruir`);
  return { modo: wasm ? 'wasm' : 'falso (autoteste)', paredes, ignoradas, upload, linhas, divergencias };
}

const f = (n: number, d = 3): string => n.toFixed(d).padStart(9);

export function formatarTabela(r: ResultadoHarness): string {
  const cab = `${'pavimento'.padEnd(22)} ${'paredes'.padStart(7)} ${'consulta'.padEnd(24)} ${'n'.padStart(3)} ${'ref ms'.padStart(9)} ${'cod+up'.padStart(9)} ${'exec'.padStart(9)} ${'leitura'.padStart(9)} ${'total'.padStart(9)}  ok`;
  const corpo = r.linhas.map(
    (l) => `${l.pavimento.slice(0, 22).padEnd(22)} ${String(l.paredes).padStart(7)} ${l.consulta.padEnd(24)} ${String(l.chamadas).padStart(3)} ${f(l.refMs)} ${f(l.codificacaoMs)} ${f(l.execucaoMs)} ${f(l.leituraMs)} ${f(l.totalMs)}  ${l.ok ? 'sim' : 'NAO'}`,
  );
  const soma = (k: 'refMs' | 'codificacaoMs' | 'execucaoMs' | 'leituraMs' | 'totalMs'): number => r.linhas.reduce((s, l) => s + l[k], 0);
  const rodape = `${'TOTAL (consultas)'.padEnd(22)} ${''.padStart(7)} ${''.padEnd(24)} ${''.padStart(3)} ${f(soma('refMs'))} ${f(soma('codificacaoMs'))} ${f(soma('execucaoMs'))} ${f(soma('leituraMs'))} ${f(soma('totalMs'))}`;
  const up = `upload do projeto: ${r.upload.paredes} paredes, codificação+upload ${r.upload.codificacaoMs.toFixed(3)} ms, execução ${r.upload.execucaoMs.toFixed(3)} ms, total ${r.upload.totalMs.toFixed(3)} ms`;
  return [`modo: ${r.modo}; ${r.paredes.length} paredes (${r.ignoradas} ignoradas sem tipo/nível)`, up, cab, ...corpo, rodape].join('\n');
}
