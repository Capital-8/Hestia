/**
 * Ponto de entrada da referência TS da parede cortina (decisão 0056, fase 1) e conversão para o FORMATO DE CONSULTA
 * (§6.3): vetores planos com as colunas de `cortina_grade`, `quant_cortina` e `cortina_avisos`, em grade de 1 µm.
 * É o formato que o teste de paridade compara com o Rust; ver `README.md` desta pasta.
 */
import { CURTAIN_MIN_CELL, ID_AUSENTE, at, erroEntrada, type CortinaEntrada } from './tipos.ts';
import { resolverGrade, type GradeResolvida } from './grade.ts';
import { calcularPecas, type Pecas } from './pecas.ts';
import { calcularQuant, type LinhaQuant } from './quant.ts';
import { calcularAvisos, type AvisoCortina } from './avisos.ts';

export interface CortinaResolvida {
  entrada: CortinaEntrada;
  grade: GradeResolvida;
  pecas: Pecas;
  quant: LinhaQuant[];
  avisos: AvisoCortina[];
}

/** Resolve a cortina inteira (grade, peças, quantitativos, avisos). Lança `ENTRADA: ...` para entrada inconsistente. */
export function resolverCortina(e: CortinaEntrada): CortinaResolvida {
  if (!(e.L > 0) || !(e.H > 0) || !Number.isFinite(e.L) || !Number.isFinite(e.H)) throw erroEntrada('L e H precisam ser > 0');
  const grade = resolverGrade(e);
  const pecas = calcularPecas(e, grade);
  return { entrada: e, grade, pecas, quant: calcularQuant(e, pecas), avisos: calcularAvisos(e, grade, pecas) };
}

/** Grade de 1 µm (a mesma regra das quantidades); o `+ 0` troca -0 por 0. */
export function g1um(x: number): number {
  return Math.round(x * 1e6) / 1e6 + 0;
}

export interface SaidaConsulta {
  nome: string;
  cortina_num: number;
  /** `cortina_grade(nivel_num)`. */
  cortina_grade: {
    /** u32 x5: `[cortina_num, eixo (0 U, 1 V), indice (1..n-1), origem (0 gerada), flags (0)]`. */
    linhas: number[];
    /** f64 x1: `[pos]` (m a partir do início/base), uma por linha acima. */
    linhas_pos: number[];
    /** u32 x6: `[cortina_num, i, j, regiao, painel_tipo_num, flags]`; flags bit0 = menor lado livre < minCell. */
    celulas: number[];
    /** f64 x4: `[s0, s1, z0, z1]` da célula (de linha a linha, sem descontar montante). */
    celulas_ret: number[];
    /** u32 x5: `[cortina_num, linha, k, removido (0), montante_tipo_num (ID_AUSENTE = sem montante)]`. */
    segmentos: number[];
    /** f64 x2: `[de, ate]` do segmento nominal, linha a linha, sem aparo. */
    segmentos_ext: number[];
  };
  /** Instâncias derivadas de `cortina_malha` (o ADR devolve matrizes; aqui, os parâmetros que as geram). */
  cortina_pecas: {
    /** u32 x7: `[cortina_num, papel, tipo_num, linha, k, vertical (0/1), continuo (0/1)]`. */
    montantes: number[];
    /** f64 x5: `[s, z, comprimento, largura, profundidade]` (início da peça, já aparada). */
    montantes_geo: number[];
    /** u32 x5: `[cortina_num, i, j, tipo_num, papel]`. */
    paineis: number[];
    /** f64 x6: `[s0, s1, z0, z1, area_visivel, area_bruta]` (retângulo livre). */
    paineis_geo: number[];
  };
  /** `quant_cortina(nivel_num)`. */
  quant_cortina: {
    /** u32 x5: `[cortina_num, papel, tipo_num, material_num, n]`. */
    linhas: number[];
    /** f64 x4: `[comprimento, area, area_liquida, volume]`. */
    valores: number[];
  };
  /** `cortina_avisos(nivel_num)`. */
  cortina_avisos: {
    /** u32 x4: `[cortina_num, codigo, i, j]` (ID_AUSENTE onde não se aplica). */
    avisos: number[];
    /** f64 x5: `[medido, limite, x, y, z]`; aqui x = s, y = 0, z = z do plano da cortina. */
    valores: number[];
  };
}

export function paraConsulta(r: CortinaResolvida): SaidaConsulta {
  const num = r.entrada.num ?? 1;
  const g = r.grade;
  const minCell = r.entrada.tipo.minCell ?? CURTAIN_MIN_CELL;

  const linhas: number[] = [];
  const linhasPos: number[] = [];
  g.u.linhas.forEach((p, k) => { linhas.push(num, 0, k + 1, 0, 0); linhasPos.push(g1um(p)); });
  g.v.linhas.forEach((p, k) => { linhas.push(num, 1, k + 1, 0, 0); linhasPos.push(g1um(p)); });

  const celulas: number[] = [];
  const celulasRet: number[] = [];
  g.celulas.forEach((c, idx) => {
    const p = at(r.pecas.paineis, idx);
    const pequena = Math.min(p.larguraLivre, p.alturaLivre) < minCell - 1e-9 ? 1 : 0;
    celulas.push(num, c.i, c.j, idx, p.tipoNum, pequena);
    celulasRet.push(g1um(c.s0), g1um(c.s1), g1um(c.z0), g1um(c.z1));
  });

  const segmentos: number[] = [];
  const segmentosExt: number[] = [];
  for (const s of r.pecas.segmentos) {
    segmentos.push(num, s.linha, s.k, 0, s.tipoNum ?? ID_AUSENTE);
    segmentosExt.push(g1um(s.de), g1um(s.ate));
  }

  const mont: number[] = [];
  const montGeo: number[] = [];
  for (const m of r.pecas.montantes) {
    mont.push(num, m.papel, m.tipoNum, m.linha, m.k, m.vertical ? 1 : 0, m.continuo ? 1 : 0);
    montGeo.push(g1um(m.s), g1um(m.z), g1um(m.comprimento), g1um(m.largura), g1um(m.profundidade));
  }
  const pain: number[] = [];
  const painGeo: number[] = [];
  for (const p of r.pecas.paineis) {
    pain.push(num, p.i, p.j, p.tipoNum, p.papel);
    painGeo.push(g1um(p.livre.s0), g1um(p.livre.s1), g1um(p.livre.z0), g1um(p.livre.z1), g1um(p.areaVisivel), g1um(p.areaBruta));
  }

  const ql: number[] = [];
  const qv: number[] = [];
  for (const q of r.quant) {
    ql.push(num, q.papel, q.tipoNum, q.materialNum, q.n);
    qv.push(g1um(q.comprimento), g1um(q.area), g1um(q.areaLiquida), g1um(q.volume));
  }

  const av: number[] = [];
  const avv: number[] = [];
  for (const a of r.avisos) {
    av.push(num, a.codigo, a.i, a.j);
    avv.push(g1um(a.medido), g1um(a.limite), g1um(a.s), 0, g1um(a.z));
  }

  return {
    nome: r.entrada.nome ?? '',
    cortina_num: num,
    cortina_grade: { linhas, linhas_pos: linhasPos, celulas, celulas_ret: celulasRet, segmentos, segmentos_ext: segmentosExt },
    cortina_pecas: { montantes: mont, montantes_geo: montGeo, paineis: pain, paineis_geo: painGeo },
    quant_cortina: { linhas: ql, valores: qv },
    cortina_avisos: { avisos: av, valores: avv },
  };
}
