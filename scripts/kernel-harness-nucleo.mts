// Núcleo do harness do kernel v2 (decisão 0046 §5): converte as paredes de cada pavimento para a seção `paredes`,
// roda as consultas da Fase 0 no wasm (ou no falso, no autoteste) e na referência TypeScript de força bruta,
// compara e mede (codificação+upload, execução, leitura e total COM a travessia da fronteira).
import { performance } from 'node:perf_hooks';
import type { Project } from '@hestia/model';
import { montarCenaA1, referenciaA1 } from '../packages/engine/src/kernelA1.ts';
import { compararA1 } from './kernel-harness-a1.mts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { gerenciadorFalso } from '../packages/geom/src/kernel/v2/falso.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeParedes } from '../packages/geom/src/kernel/v2/paredes.ts';
import { argumentosA2, decodificarA2, referenciaA2 } from '../packages/engine/src/kernelA2.ts';
import { compararA2 } from './kernel-harness-a2.mts';
import { argumentosA3, decodificarA3a, montarCenaA3, referenciaA3a } from '../packages/engine/src/kernelA3.ts';
import { compararA3 } from './kernel-harness-a3.mts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
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
  /** Maior diferença absoluta em coordenadas/medidas da A1 (0 se a A1 não rodou). */
  desvioMaximoA1: number;
}

/** Paredes de todos os pavimentos como linhas da seção `paredes` (ids internados, níveis = índice do pavimento). */
export function paredesDoProjeto(projeto: Project): { paredes: LinhaParede[]; ignoradas: number; nomes: string[] } {
  const { secoes, nLinhas, ignoradas } = montarCenaA1(projeto);
  const c = secoes.paredes;
  const paredes: LinhaParede[] = [];
  for (let i = 0; i < nLinhas.paredes; i++) {
    paredes.push({ id: c['id_num']![i]!, nivel: c['nivel_num']![i]!, ax: c['ax']![i]!, ay: c['ay']![i]!, bx: c['bx']![i]!, by: c['by']![i]!, espessura: c['espessura']![i]! });
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
  /** Compara também a sub-etapa A1 (`quadros_e_juncoes`). Padrão: sim com `wasm`, não com o falso (que não implementa geometria). */
  a1?: boolean;
}

export async function executarHarness({ projeto, wasm, gerenciador, a1 }: OpcoesHarness): Promise<ResultadoHarness> {
  const { paredes, ignoradas, nomes } = paredesDoProjeto(projeto);
  const cenaA1 = montarCenaA1(projeto);
  const cenaA3 = montarCenaA3(projeto, cenaA1);
  const rodarA1 = a1 ?? Boolean(wasm);
  const tolJuncao = projeto.settings?.joinTolerance ?? 0.02;
  let desvioMaximoA1 = 0;
  const ger = gerenciador ?? (wasm ? await GerenciadorKernelV2.dosBytes(wasm) : gerenciadorFalso().ger);
  // Ciclo vazio antes da base: o Rust mantém um resíduo fixo (~544 bytes: tabela de handles + texto de erro).
  for (let i = 0; i < 2; i++) {
    const aquecimento = CenaV2.criar(ger, fonteDeParedes(() => paredes.slice(0, 2)));
    aquecimento.consultar('estatisticas_nivel', [0]);
    aquecimento.destruir();
  }
  const inicial = ger.instancia().exports.memoria_usada();
  const divergencias: string[] = [];

  const t0 = performance.now();
  const secoesA1 = (): ReturnType<Parameters<typeof fonteDeSecoes>[0]> => ({
    paredes: { colunas: cenaA1.secoes.paredes, n: cenaA1.nLinhas.paredes },
    tipos_parede: { colunas: cenaA1.secoes.tipos_parede, n: cenaA1.nLinhas.tipos_parede },
    camadas: { colunas: cenaA1.secoes.camadas, n: cenaA1.nLinhas.camadas },
    paredes_quadro: { colunas: cenaA1.secoes.paredes_quadro, n: cenaA1.nLinhas.paredes_quadro },
    faixas: { colunas: cenaA1.secoes.faixas, n: cenaA1.nLinhas.faixas },
    paredes_z: { colunas: cenaA1.secoes.paredes_z, n: cenaA1.nLinhas.paredes_z },
    tipos_abertura: { colunas: cenaA3.secoes.tipos_abertura, n: cenaA3.nLinhas.tipos_abertura },
    aberturas: { colunas: cenaA3.secoes.aberturas, n: cenaA3.nLinhas.aberturas },
  });
  const cena = CenaV2.criar(ger, rodarA1 ? fonteDeSecoes(secoesA1) : fonteDeParedes(() => paredes));
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
      // quadros_e_juncoes (A1): quadros, estado e corte das pontas e grupos contra o motor TypeScript
      if (rodarA1) {
        const levelId = projeto.levels[nivel]!.id;
        const [refA1, rm] = medir(() => referenciaA1(projeto, levelId, cenaA1));
        const [s, t] = medir(() => cena.consultar('quadros_e_juncoes', [nivel, tolJuncao]));
        const cmp = compararA1(refA1, s);
        if (cmp.divergencias.length > 0) falha(`quadros_e_juncoes difere: ${cmp.divergencias.slice(0, 5).join(' | ')}`);
        desvioMaximoA1 = Math.max(desvioMaximoA1, cmp.desvioMaximo);
        registrar('quadros_e_juncoes', rm, t, cmp.divergencias.length === 0);
        // itens_pintados (A2): itens por camada e pintor, em planta, contra buildItems/paint do motor TypeScript
        const [refA2, rm2] = medir(() => referenciaA2(projeto, levelId, cenaA1));
        const [s2, t2] = medir(() => decodificarA2(cena.consultar('itens_pintados', argumentosA2(projeto, levelId, cenaA1))));
        const cmp2 = compararA2(refA2, s2);
        if (cmp2.divergencias.length > 0) falha(`itens_pintados difere: ${cmp2.divergencias.slice(0, 5).join(' | ')}`);
        desvioMaximoA1 = Math.max(desvioMaximoA1, cmp2.desvioMaximo);
        registrar('itens_pintados', rm2, t2, cmp2.divergencias.length === 0);
        // aberturas_geom (A3a): vãos (openingGeometry e openingRect) contra o motor TypeScript
        const [refA3, rm3] = medir(() => referenciaA3a(projeto, levelId, cenaA1, cenaA3));
        const [s3, t3] = medir(() => decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(cenaA1, levelId))));
        const cmp3 = compararA3(refA3, s3);
        if (cmp3.divergencias.length > 0) falha(`aberturas_geom difere: ${cmp3.divergencias.slice(0, 5).join(' | ')}`);
        desvioMaximoA1 = Math.max(desvioMaximoA1, cmp3.desvioMaximo);
        registrar('aberturas_geom', rm3, t3, cmp3.divergencias.length === 0);
      }
      if (passada === 1) linhas.push(...acc.values());
    }
  }

  cena.destruir();
  const final = ger.instancia().exports.memoria_usada();
  if (final !== inicial) divergencias.push(`vazamento: memoria_usada ${inicial} antes da cena, ${final} depois de destruir`);
  return { modo: wasm ? 'wasm' : 'falso (autoteste)', paredes, ignoradas, upload, linhas, divergencias, desvioMaximoA1 };
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
  const a1 = r.linhas.some((l) => l.consulta === 'quadros_e_juncoes') ? [`A1: maior desvio em coordenadas/medidas ${r.desvioMaximoA1.toExponential(2)} m (tolerância 1e-6 m); topologia por igualdade exata`] : [];
  return [`modo: ${r.modo}; ${r.paredes.length} paredes (${r.ignoradas} ignoradas sem tipo/nível)`, up, cab, ...corpo, rodape, ...a1].join('\n');
}
