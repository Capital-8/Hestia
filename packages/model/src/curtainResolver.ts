// Resolvedor da parede cortina (decisão 0056, §4.3 e §4.4): grade final, sobrescritas remapeadas e órfãs. Nunca grava; a gravação
// (normalizar, partir, ajustar) fica em curtainRemap.ts. Regras e decisões de implementação: ver o cabeçalho de curtainRemap.ts.

import { wallHeight, wallLength } from './queries.ts';
import type { Id, Project, Wall } from './types.ts';
import { isCurtainType } from './wallType.ts';
import { CURTAIN_MIN_REMAINDER, type AddedGridLine, type CellOverride, type CellOverrideEntry, type CurtainInstance, type GridAxisSpec, type LineOverride, type LineRef, type OpeningCellOverride, type SegmentRef } from './wallCurtainTypes.ts';
import {
  bordasDe,
  centroEntre,
  celulaEm,
  eixoEfetivo,
  linhasGeradas,
  montarLinhas,
  regioesDe,
  type EntradaLinha,
  type Eixo,
  type LinhaGrade,
} from './curtainGrade.ts';

/**
 * Esquadria da célula sem as linhas presas que não existem mais (§4.4, passo 5): cada uma vira órfã (aviso
 * `cortina-override-orfao`) e sai da lista. A esquadria em si segue na célula.
 */
function ligacoesVivas(ov: CellOverride, extras: Map<Id, AddedGridLine>, orfas: Orfa[], x: number, z: number): CellOverride {
  if (ov.kind !== 'opening' || !ov.linkedLines) return ov;
  for (const id of ov.linkedLines) if (!extras.has(id)) orfas.push({ tipo: 'linha', x, z });
  const vivas = ov.linkedLines.filter((id) => extras.has(id));
  const copia: OpeningCellOverride = { ...ov };
  if (vivas.length > 0) copia.linkedLines = vivas;
  else delete copia.linkedLines;
  return copia;
}

/** Distância máxima (em fração do eixo) entre a posição gravada e o centro novo para valer o índice (passo 1). */
const LIMITE_INDICE = 0.5;

/** Sobrescrita, linha ou segmento que não encontrou lugar na grade atual (órfã). x e z: posição aproximada (m). */
export interface Orfa {
  tipo: 'celula' | 'linha' | 'segmento';
  x: number;
  z: number;
}

/** Grade resolvida com as sobrescritas já remapeadas. As listas de saída trazem as chaves ATUAIS (regravadas). */
export interface ParedeResolvida {
  L: number;
  H: number;
  /** Linhas finais por eixo (sem as bordas). */
  u: LinhaGrade[];
  v: LinhaGrade[];
  nu: number;
  nv: number;
  /** Bordas em metros por eixo: [0, ..., comprimento]. */
  bu: number[];
  bv: number[];
  /** Posições base das linhas geradas por eixo (antes das sobrescritas). */
  geradasU: number[];
  geradasV: number[];
  /** Célula canônica de cada célula (índice i*nv + j): a região inteira aponta para uma só. */
  canon: number[];
  celulas: CellOverrideEntry[];
  linhas: LineOverride[];
  segmentos: SegmentRef[];
  orfas: Orfa[];
}

interface Ajuste {
  pos?: number;
  locked?: boolean;
  montante?: Id | null;
}

/** Índice da linha gerada `g` (0 = primeira) como referência gravável. */
export function refGerada(eixo: Eixo, g: number, A: number, base: number[]): LineRef {
  return { axis: eixo, index: g + 1, pos: (base[g] as number) / A, n: base.length + 1 };
}

/**
 * Casa uma referência de linha gerada com a lista de geradas: passo 1 (índice, se `n` bate e a posição confere) ou,
 * senão, a gerada mais próxima da posição gravada (em metros). -1 se não há geradas.
 */
export function casarGerada(ref: { index: number; pos: number; n: number }, A: number, base: number[]): number {
  const ng = base.length;
  if (ng === 0) return -1;
  if (ref.n === ng + 1 && Number.isInteger(ref.index) && ref.index >= 1 && ref.index <= ng && Math.abs(ref.pos - (base[ref.index - 1] as number) / A) <= LIMITE_INDICE) {
    return ref.index - 1;
  }
  const ponto = ref.pos * A;
  let melhor = 0;
  for (let g = 1; g < ng; g++) if (Math.abs((base[g] as number) - ponto) < Math.abs((base[melhor] as number) - ponto)) melhor = g;
  return melhor;
}

/** Ponto de posição normalizada gravada, com a distância ao alvo (usada na fusão). */
interface Candidato<T> {
  item: T;
  alvo: number;
  dist: number;
}

/** Fusão: entre os candidatos de um mesmo alvo, vence o de menor distância (empate: o primeiro). Devolve os vencedores. */
function fundir<T>(candidatos: Array<Candidato<T>>): Set<T> {
  const melhor = new Map<number, Candidato<T>>();
  for (const cd of candidatos) {
    const atual = melhor.get(cd.alvo);
    if (!atual || cd.dist < atual.dist) melhor.set(cd.alvo, cd);
  }
  return new Set([...melhor.values()].map((cd) => cd.item));
}

/**
 * Resolve a parede cortina: grade final, sobrescritas remapeadas (§4.4) e órfãs. Nunca grava. Devolve null se a parede
 * não é cortina válida (tipo de família básica, ou L/H sem comprimento).
 */
export function resolverParede(p: Project, w: Wall): ParedeResolvida | null {
  const tipo = p.wallTypes[w.typeId];
  if (!isCurtainType(tipo)) return null;
  const L = wallLength(w);
  const H = wallHeight(p, w);
  if (!(L > 0) || !(H > 0)) return null;
  const c = tipo.curtain;
  const inst: CurtainInstance = w.curtain ?? {};
  const r = c.minRemainder ?? CURTAIN_MIN_REMAINDER;
  const A: Record<Eixo, number> = { u: L, v: H };
  const specs: Record<Eixo, GridAxisSpec> = { u: eixoEfetivo(c.u, inst.grid?.u), v: eixoEfetivo(c.v, inst.grid?.v) };
  const geradas: Record<Eixo, number[]> = { u: linhasGeradas(L, specs.u, r), v: linhasGeradas(H, specs.v, r) };
  const extras: Record<Eixo, AddedGridLine[]> = { u: [], v: [] };
  const extraPorId = new Map<Id, AddedGridLine>();
  for (const ex of inst.addedLines ?? []) {
    if (ex.axis !== 'u' && ex.axis !== 'v') continue;
    if (extraPorId.has(ex.id)) continue;
    extras[ex.axis].push(ex);
    extraPorId.set(ex.id, ex);
  }

  // Sobrescritas de linha (§4.3): a gerada casa com a sua identidade; a extra, pelo id. Fusão por linha gerada.
  const ajustes: Record<Eixo, Map<number, Ajuste>> = { u: new Map(), v: new Map() };
  const ajusteExtra = new Map<Id, Ajuste>();
  const aceitas = new Set<LineOverride>();
  const candidatos: Record<Eixo, Array<Candidato<LineOverride>>> = { u: [], v: [] };
  const orfas: Orfa[] = [];
  for (const ov of inst.lineOverrides ?? []) {
    const ajuste: Ajuste = { pos: ov.pos, locked: ov.locked, montante: ov.mullionTypeId };
    if ('added' in ov.line) {
      const ex = extraPorId.get(ov.line.added);
      if (!ex || ajusteExtra.has(ex.id)) {
        orfas.push({ tipo: 'linha', x: 0, z: 0 });
        continue;
      }
      ajusteExtra.set(ex.id, ajuste);
      aceitas.add(ov);
      continue;
    }
    const eixo = ov.line.axis;
    const g = casarGerada(ov.line, A[eixo], geradas[eixo]);
    if (g < 0) {
      orfas.push({ tipo: 'linha', x: eixo === 'u' ? ov.line.pos * L : 0, z: eixo === 'v' ? ov.line.pos * H : 0 });
      continue;
    }
    candidatos[eixo].push({ item: ov, alvo: g, dist: Math.abs(ov.line.pos * A[eixo] - (geradas[eixo][g] as number)) });
  }
  for (const eixo of ['u', 'v'] as const) {
    const vencedores = fundir(candidatos[eixo]);
    for (const cd of candidatos[eixo]) {
      if (!vencedores.has(cd.item)) {
        const ln = cd.item.line;
        const pos = 'added' in ln ? 0 : ln.pos;
        orfas.push({ tipo: 'linha', x: eixo === 'u' ? pos * L : 0, z: eixo === 'v' ? pos * H : 0 });
        continue;
      }
      aceitas.add(cd.item);
      ajustes[eixo].set(cd.alvo, { pos: cd.item.pos, locked: cd.item.locked, montante: cd.item.mullionTypeId });
    }
  }

  // Linhas finais: geradas (com sobrescrita) e extras (com a sua sobrescrita), soldadas e dentro do vão.
  const entradas = (eixo: Eixo): EntradaLinha[] => {
    const lista: EntradaLinha[] = geradas[eixo].map((b, g) => {
      const aj = ajustes[eixo].get(g);
      return { pos: aj?.pos ?? b, gerada: g, base: b, montante: aj?.montante, locked: aj?.locked };
    });
    for (const ex of extras[eixo]) {
      const aj = ajusteExtra.get(ex.id);
      lista.push({
        pos: aj?.pos ?? ex.pos,
        added: ex.id,
        montante: aj && aj.montante !== undefined ? aj.montante : ex.mullionTypeId,
        locked: aj?.locked ?? ex.locked,
      });
    }
    return lista;
  };
  const fin: Record<Eixo, LinhaGrade[]> = { u: montarLinhas('u', L, entradas('u')), v: montarLinhas('v', H, entradas('v')) };
  const nu = fin.u.length + 1;
  const nv = fin.v.length + 1;
  const bu = bordasDe(L, fin.u);
  const bv = bordasDe(H, fin.v);

  /** Linha alvo de uma referência, na grade final (ou null se não existe). */
  const alvoDe = (line: LineRef): { eixo: Eixo; added?: Id; g?: number; indice?: number } | null => {
    if ('added' in line) {
      const ex = extraPorId.get(line.added);
      if (!ex) return null;
      const ach = fin[ex.axis].find((l) => l.added === ex.id);
      return { eixo: ex.axis, added: ex.id, indice: ach?.indice };
    }
    const g = casarGerada(line, A[line.axis], geradas[line.axis]);
    if (g < 0) return null;
    const ach = fin[line.axis].find((l) => l.gerada === g);
    return { eixo: line.axis, g, indice: ach?.indice };
  };
  const refDoAlvo = (a: { eixo: Eixo; added?: Id; g?: number }): LineRef =>
    a.added !== undefined ? { added: a.added } : refGerada(a.eixo, a.g as number, A[a.eixo], geradas[a.eixo]);

  // Segmentos removidos (§4.3, §5.2): remapeados pela linha e pelo centro do segmento no eixo perpendicular.
  const segmentos: SegmentRef[] = [];
  const arestas: Array<[number, number]> = [];
  const vistos = new Set<string>();
  for (const sg of inst.removedSegments ?? []) {
    const a = alvoDe(sg.line);
    if (!a || a.indice === undefined) {
      orfas.push({ tipo: 'segmento', x: 0, z: 0 });
      continue;
    }
    const perp = a.eixo === 'u' ? nv : nu;
    const bp = a.eixo === 'u' ? bv : bu;
    const comp = a.eixo === 'u' ? H : L;
    let k = -1;
    if (sg.nk === perp && Number.isInteger(sg.k) && sg.k >= 0 && sg.k < perp && Math.abs(sg.mid - centroEntre(bp, sg.k) / comp) <= LIMITE_INDICE) {
      k = sg.k;
    } else {
      let melhorD = Infinity;
      for (let q = 0; q < perp; q++) {
        const d = Math.abs(sg.mid - centroEntre(bp, q) / comp);
        if (d < melhorD) {
          melhorD = d;
          k = q;
        }
      }
    }
    const chave = `${a.added !== undefined ? `a:${a.added}` : `${a.eixo}:${a.g}`}:${k}`;
    if (k < 0 || vistos.has(chave)) {
      orfas.push({ tipo: 'segmento', x: 0, z: 0 });
      continue;
    }
    vistos.add(chave);
    segmentos.push({ line: refDoAlvo(a), k, nk: perp, mid: centroEntre(bp, k) / comp });
    const m = a.indice;
    const par: [number, number] = a.eixo === 'u' ? [(m - 1) * nv + k, m * nv + k] : [k * nv + (m - 1), k * nv + m];
    arestas.push(par);
  }
  const canon = regioesDe(nu, nv, arestas);

  // Sobrescritas de célula (§4.4): passos 1 a 4 para achar a célula; fusão por região; órfã fora.
  /** Passo 2: a célula que contém o ponto (fronteira: a de menor índice). -1 se o ponto está fora da grade. */
  const celulaNoPonto = (x: number, z: number): number => {
    const i = celulaEm(bu, x);
    const j = celulaEm(bv, z);
    return i >= 0 && j >= 0 ? i * nv + j : -1;
  };
  /** Passo 4: a célula vizinha mais próxima do ponto, a até uma célula de distância (fora da grade). */
  const celulaVizinha = (x: number, z: number): number => {
    const i = celulaEm(bu, x);
    const j = celulaEm(bv, z);
    const ci = Math.min(nu - 1, Math.max(0, i >= 0 ? i : x < 0 ? 0 : nu - 1));
    const cj = Math.min(nv - 1, Math.max(0, j >= 0 ? j : z < 0 ? 0 : nv - 1));
    let melhor = -1;
    let melhorD = Infinity;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const ii = ci + di;
        const jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= nu || jj >= nv) continue;
        const d = Math.hypot(x - centroEntre(bu, ii), z - centroEntre(bv, jj));
        if (d < melhorD) {
          melhorD = d;
          melhor = ii * nv + jj;
        }
      }
    }
    return melhor;
  };
  interface CandCelula {
    e: CellOverrideEntry;
    alvo: number;
    dist: number;
    /** Chegou pela vizinhança (passo 4): perde empate com quem casou direto. */
    viz: boolean;
    ps: number;
    pz: number;
  }
  const cands: CandCelula[] = [];
  for (const e of inst.cells ?? []) {
    const ps = e.key.s * L;
    const pz = e.key.z * H;
    let cel = -1;
    let viz = false;
    if (e.key.nu === nu && e.key.nv === nv && Number.isInteger(e.key.i) && Number.isInteger(e.key.j) && e.key.i >= 0 && e.key.i < nu && e.key.j >= 0 && e.key.j < nv) {
      const sc = centroEntre(bu, e.key.i) / L;
      const zc = centroEntre(bv, e.key.j) / H;
      if (Math.abs(sc - e.key.s) <= LIMITE_INDICE && Math.abs(zc - e.key.z) <= LIMITE_INDICE) cel = e.key.i * nv + e.key.j;
    }
    if (cel < 0) cel = celulaNoPonto(ps, pz);
    if (cel < 0) {
      cel = celulaVizinha(ps, pz);
      viz = cel >= 0;
    }
    if (cel < 0) {
      orfas.push({ tipo: 'celula', x: ps, z: pz });
      continue;
    }
    const rc = canon[cel] as number;
    const ci = Math.floor(rc / nv);
    const cj = rc - ci * nv;
    const dist = Math.hypot(ps - centroEntre(bu, ci), pz - centroEntre(bv, cj));
    cands.push({ e, alvo: rc, dist, viz, ps, pz });
  }
  // Fusão: diretos vencem vizinhos; entre iguais, a menor distância; empate: a primeira.
  const melhorPorRegiao = new Map<number, CandCelula>();
  for (const cd of cands) {
    const atual = melhorPorRegiao.get(cd.alvo);
    if (!atual || (cd.viz ? 1 : 0) < (atual.viz ? 1 : 0) || ((cd.viz ? 1 : 0) === (atual.viz ? 1 : 0) && cd.dist < atual.dist)) melhorPorRegiao.set(cd.alvo, cd);
  }
  const celulas: CellOverrideEntry[] = [];
  for (const cd of cands) {
    if (melhorPorRegiao.get(cd.alvo) !== cd) {
      orfas.push({ tipo: 'celula', x: cd.ps, z: cd.pz });
      continue;
    }
    const ci = Math.floor(cd.alvo / nv);
    const cj = cd.alvo - ci * nv;
    celulas.push({ key: { i: ci, j: cj, s: centroEntre(bu, ci) / L, z: centroEntre(bv, cj) / H, nu, nv }, override: ligacoesVivas(cd.e.override, extraPorId, orfas, cd.ps, cd.pz) });
  }

  return {
    L,
    H,
    u: fin.u,
    v: fin.v,
    nu,
    nv,
    bu,
    bv,
    geradasU: geradas.u,
    geradasV: geradas.v,
    canon,
    celulas,
    linhas: (inst.lineOverrides ?? []).filter((ov) => aceitas.has(ov)).map((ov) => {
      if ('added' in ov.line) return ov;
      const eixo = ov.line.axis;
      const g = casarGerada(ov.line, A[eixo], geradas[eixo]);
      return { ...ov, line: refGerada(eixo, g, A[eixo], geradas[eixo]) };
    }),
    segmentos,
    orfas,
  };
}
