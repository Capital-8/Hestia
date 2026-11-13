/**
 * Ponto de entrada da referência TS da parede cortina (decisão 0056, fases 1 e 2) e conversão para o FORMATO DE CONSULTA
 * (§6.3): vetores planos com as colunas de `cortina_grade`, `quant_cortina` e `cortina_avisos`, em grade de 1 µm.
 * É o formato que o teste de paridade compara com o Rust; ver `README.md` desta pasta.
 */
import { CURTAIN_MIN_CELL, ID_AUSENTE, at, erroEntrada, type CortinaEntrada } from './tipos.ts';
import { eixoEfetivo, resolverGrade, type GradeResolvida } from './grade.ts';
import { calcularPecas, type Pecas } from './pecas.ts';
import { calcularQuant, type LinhaQuant } from './quant.ts';
import { calcularAvisos, type AvisoCortina } from './avisos.ts';
import { ESTADO } from './remap.ts';

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
    /** u32 x5: `[cortina_num, eixo (0 U, 1 V), indice (1..n-1), origem (0 gerada, 1 extra, 2 manual), flags (bit0 travada)]`. */
    linhas: number[];
    /** f64 x1: `[pos]` (m a partir do início/base), uma por linha acima. */
    linhas_pos: number[];
    /** u32 x6: `[cortina_num, i, j, regiao, painel_tipo_num, flags]`; flags bit0 = menor lado livre < minCell, bit1 = célula com sobrescrita adotada, bit2 = região fundida (mais de uma célula). `regiao` = índice da célula canônica. */
    celulas: number[];
    /** f64 x4: `[s0, s1, z0, z1]` da célula (de linha a linha, sem descontar montante). */
    celulas_ret: number[];
    /** u32 x5: `[cortina_num, linha, k, removido (0/1), montante_tipo_num (ID_AUSENTE = sem montante)]`. */
    segmentos: number[];
    /** f64 x2: `[de, ate]` do segmento nominal, linha a linha, sem aparo. */
    segmentos_ext: number[];
    /**
     * Estado do remapeamento (ADR §6.1, fase 2). Só existe quando a instância tem sobrescritas.
     * `sobrescritas` u32 x7: `[cortina_num, tipo (0 célula, 1 linha, 2 segmento), ordem (na lista da instância), estado (0 adotada, 1 fusão, 2 fora, 3 ocupada), regra (0 n/a, 1 índice, 2 posição, 4 vizinhança), alvo_a, alvo_b]`.
     * Alvo: célula (i, j); linha (índice, eixo 0 U / 1 V); segmento (linha global, k). ID_AUSENTE se órfã.
     * `chaves` f64 x2: `[s, z]` chave gravada de volta (célula: centro normalizado; linha: fração; segmento: meio); 0 se órfã.
     */
    remapeamento?: { sobrescritas: number[]; chaves: number[] };
  };
  /** Instâncias derivadas de `cortina_malha` (o ADR devolve matrizes; aqui, os parâmetros que as geram). */
  cortina_pecas: {
    /** u32 x7: `[cortina_num, papel, tipo_num, linha, k, vertical (0/1), continuo (0/1)]`. */
    montantes: number[];
    /** f64 x5: `[s, z, comprimento, largura, profundidade]` (início da peça, já aparada). */
    montantes_geo: number[];
    /** u32 x5: `[cortina_num, i, j, tipo_num, papel]` (i, j da célula canônica da região). */
    paineis: number[];
    /** f64 x6: `[s0, s1, z0, z1, area_visivel, area_bruta]` (retângulo livre da região). */
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
  const inst = r.entrada.instancia;
  const minCell = r.entrada.tipo.minCell ?? CURTAIN_MIN_CELL;

  const linhas: number[] = [];
  const linhasPos: number[] = [];
  const origemDe = (eixo: typeof g.u, eixoNome: 'u' | 'v', k: number): number => {
    if (eixo.origens[k]?.origem === 'extra') return 1;
    return eixoEfetivo(eixoNome === 'u' ? r.entrada.tipo.u : r.entrada.tipo.v, eixoNome === 'u' ? inst?.grid?.u : inst?.grid?.v).mode === 'manual' ? 2 : 0;
  };
  g.u.linhas.forEach((p, k) => { linhas.push(num, 0, k + 1, origemDe(g.u, 'u', k), g.u.origens[k]?.travada ? 1 : 0); linhasPos.push(g1um(p)); });
  g.v.linhas.forEach((p, k) => { linhas.push(num, 1, k + 1, origemDe(g.v, 'v', k), g.v.origens[k]?.travada ? 1 : 0); linhasPos.push(g1um(p)); });

  const adotadaNaCelula = new Set<number>();
  for (const x of g.remap.celulas) if (x.estado === ESTADO.adotada) adotadaNaCelula.add(x.a * g.nv + x.b);
  const celulas: number[] = [];
  const celulasRet: number[] = [];
  g.celulas.forEach((c, idx) => {
    const p = at(r.pecas.painelDaCelula, idx);
    const pequena = Math.min(p.larguraLivre, p.alturaLivre) < minCell - 1e-9 ? 1 : 0;
    const flags = pequena | (adotadaNaCelula.has(idx) ? 2 : 0) | (p.celulas > 1 ? 4 : 0);
    celulas.push(num, c.i, c.j, p.regiao, p.tipoNum, flags);
    celulasRet.push(g1um(c.s0), g1um(c.s1), g1um(c.z0), g1um(c.z1));
  });

  const segmentos: number[] = [];
  const segmentosExt: number[] = [];
  for (const s of r.pecas.segmentos) {
    segmentos.push(num, s.linha, s.k, s.removido ? 1 : 0, s.tipoNum ?? ID_AUSENTE);
    segmentosExt.push(g1um(s.de), g1um(s.ate));
  }

  // Remapeamento: só quando há sobrescritas (sem elas, a saída é a da fase 1).
  const temSobrescrita = (inst?.cells?.length ?? 0) + (inst?.lineOverrides?.length ?? 0) + (inst?.removedSegments?.length ?? 0) > 0;
  const remapeamento = temSobrescrita ? (() => {
    const sob: number[] = [];
    const chv: number[] = [];
    const empurra = (tipo: number, ordem: number, x: { estado: number; regra: number; a: number; b: number; s: number; z: number }): void => {
      sob.push(num, tipo, ordem, x.estado, x.regra, x.a, x.b);
      chv.push(g1um(x.s), g1um(x.z));
    };
    g.remap.celulas.forEach((x, ordem) => empurra(0, ordem, x));
    g.remap.linhas.forEach((x, ordem) => empurra(1, ordem, x));
    g.remap.segmentos.forEach((x, ordem) => empurra(2, ordem, x));
    return { sobrescritas: sob, chaves: chv };
  })() : undefined;

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
    cortina_grade: {
      linhas, linhas_pos: linhasPos, celulas, celulas_ret: celulasRet, segmentos, segmentos_ext: segmentosExt,
      ...(remapeamento ? { remapeamento } : {}),
    },
    cortina_pecas: { montantes: mont, montantes_geo: montGeo, paineis: pain, paineis_geo: painGeo },
    quant_cortina: { linhas: ql, valores: qv },
    cortina_avisos: { avisos: av, valores: avv },
  };
}
