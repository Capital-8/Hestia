// Remapeamento das sobrescritas da parede cortina (decisão 0056, §4.4). Implementação própria e pequena do modelo, para
// conferir depois com a referência de engine/cortinaRef/remap.ts (esta não a espera nem a copia).
// Regras (§4.4), em duas dimensões para célula e em uma para linha e segmento:
//  1. mesma topologia (nu e nv gravados = atuais): vale o índice, se o centro novo está a até 0,5 do gravado;
//  2. senão vale a posição: o ponto (s·L, z·H) gravado cai na célula que o contém (na fronteira, a de menor índice);
//  3. fusão: duas sobrescritas na mesma região: vence a de menor distância entre o ponto e o centro; a outra é órfã;
//  4. fora de todas as células: a vizinha (até uma célula) se não estiver ocupada; senão órfã;
//  5. órfã: sai da geometria e do aviso `cortina-override-orfao`; a próxima normalização a descarta;
//  6. a normalização regrava as chaves (índice e posição novos), no mesmo passo de desfazer da edição.
// Decisões desta implementação (ver também curtainGrade.ts):
//  (a) linha gerada: `{axis, index: g+1, pos: base/A, n: ng+1}`, com `ng` = nº de geradas; extras não contam;
//  (b) segmento: `nk` = nº de segmentos do eixo perpendicular na grade final; `mid` = centro normalizado do segmento;
//  (c) a grade só se lê; a resolução nunca grava no modelo (só `normalizarParede` grava).

import { wallHeight, wallLength } from './queries.ts';
import { t } from './i18n.ts';
import type { ValidationIssue } from './validate.ts';
import { isWall, type Id, type Project, type Wall } from './types.ts';
import { isCurtainType } from './wallType.ts';
import { CURTAIN_MIN_REMAINDER, type AddedGridLine, type CellOverrideEntry, type CurtainInstance, type GridAxisSpec, type LineOverride, type LineRef, type SegmentRef } from './wallCurtainTypes.ts';
import {
  TOL_SOLDA,
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
    celulas.push({ key: { i: ci, j: cj, s: centroEntre(bu, ci) / L, z: centroEntre(bv, cj) / H, nu, nv }, override: cd.e.override });
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

/**
 * Regrava as chaves e as referências da parede (§4.4, passo 6) e descarta as órfãs, no mesmo passo de desfazer da
 * edição que a chamou. Não mexe em geometria nem em listas que a parede não tem. Devolve o nº de órfãs descartadas.
 */
export function normalizarParede(p: Project, id: Id): number {
  const w = p.elements[id];
  if (!isWall(w) || !w.curtain) return 0;
  const res = resolverParede(p, w);
  if (!res) return 0;
  const antes = w.curtain;
  const novo: CurtainInstance = { ...antes };
  if (antes.cells !== undefined) novo.cells = res.celulas;
  if (antes.lineOverrides !== undefined) novo.lineOverrides = res.linhas;
  if (antes.removedSegments !== undefined) novo.removedSegments = res.segmentos;
  if (JSON.stringify(novo) !== JSON.stringify(antes)) w.curtain = novo;
  return res.orfas.length;
}

/** Comprimento e altura de cada parede cortina (antes de um comando que muda a geometria). */
export function dimensoesCortinas(p: Project): Map<Id, { L: number; H: number }> {
  const m = new Map<Id, { L: number; H: number }>();
  for (const e of Object.values(p.elements)) if (isWall(e) && e.curtain) m.set(e.id, { L: wallLength(e), H: wallHeight(p, e) });
  return m;
}

/**
 * Depois de um comando que mudou L ou H de uma parede cortina (aparar, estender, esticar, altura, nível): as linhas
 * extras e as sobrescritas de linha sem `locked` acompanham a fração da posição (§4.3), e as chaves são remapeadas.
 */
export function ajustarCortinasAlteradas(p: Project, antes: Map<Id, { L: number; H: number }>): void {
  for (const [id, d0] of antes) {
    const w = p.elements[id];
    if (!isWall(w) || !w.curtain) continue;
    const L = wallLength(w);
    const H = wallHeight(p, w);
    const fU = Math.abs(L - d0.L) > 1e-9 && d0.L > 0 ? L / d0.L : 1;
    const fV = Math.abs(H - d0.H) > 1e-9 && d0.H > 0 ? H / d0.H : 1;
    if (fU === 1 && fV === 1) continue;
    escalarLinhas(w, { u: fU, v: fV });
    normalizarParede(p, id);
  }
}

function escalarLinhas(w: Wall, f: Record<Eixo, number>): void {
  const inst = w.curtain as CurtainInstance;
  const eixoDeExtra = new Map<Id, Eixo>((inst.addedLines ?? []).map((l): [Id, Eixo] => [l.id, l.axis]));
  if (inst.addedLines) {
    inst.addedLines = inst.addedLines.map((l) => (l.locked ? l : { ...l, pos: l.pos * f[l.axis] }));
  }
  if (inst.lineOverrides) {
    inst.lineOverrides = inst.lineOverrides.map((ov) => {
      if (ov.locked || ov.pos === undefined) return ov;
      const eixo = 'added' in ov.line ? eixoDeExtra.get(ov.line.added) : ov.line.axis;
      return eixo === undefined ? ov : { ...ov, pos: ov.pos * f[eixo] };
    });
  }
}

/**
 * Divide a instância da parede cortina no corte [lo, hi] (§4.9, splitWall): a parte da esquerda fica com [0, lo] e a da
 * direita com [hi, L]. Linhas U e segmentos de linha U são repartidos pela posição; linhas V e segmentos de linha V ficam
 * nas duas partes (estes são repartidos pelo centro). Células vão pelo centro. Chaves saem com `nu = nv = 0` (topologia
 * desconhecida), para que a normalização das partes as remapeie pela posição (passo 2). Null se não há cortina.
 */
export function partirInstanciaCortina(p: Project, w: Wall, lo: number, hi: number): { esq: CurtainInstance; dir: CurtainInstance } | null {
  const res = resolverParede(p, w);
  if (!res) return null;
  const inst: CurtainInstance = w.curtain ?? {};
  const L1 = lo;
  const L2 = res.L - hi;
  const off = (lado: 'esq' | 'dir'): number => (lado === 'esq' ? 0 : hi);
  const comp = (lado: 'esq' | 'dir'): number => (lado === 'esq' ? L1 : L2);
  /** Lado do ponto `x` (m) entre o corte e a gap; null se cai dentro da faixa removida. */
  const ladoDe = (x: number): 'esq' | 'dir' | null => (x < lo - TOL_SOLDA ? 'esq' : x > hi + TOL_SOLDA ? 'dir' : null);
  const eixoDeExtra = new Map<Id, Eixo>((inst.addedLines ?? []).map((l): [Id, Eixo] => [l.id, l.axis]));

  /** Campos que valem para as duas partes (tipo da grade, painel padrão e hospedagem). */
  const comum = (): CurtainInstance => {
    const out: CurtainInstance = {};
    if (inst.grid !== undefined) out.grid = inst.grid;
    if (inst.defaultPanelTypeId !== undefined) out.defaultPanelTypeId = inst.defaultPanelTypeId;
    if (inst.host !== undefined) out.host = inst.host;
    return out;
  };
  const esq = comum();
  const dir = comum();
  /** Posição atual (m) de uma linha na grade resolvida: a sobrescrita já foi aplicada. */
  const posAtual = (eixo: Eixo, line: LineRef): number | undefined => {
    const lista = eixo === 'u' ? res.u : res.v;
    if ('added' in line) return lista.find((l) => l.added === line.added)?.pos;
    const gerada = (eixo === 'u' ? res.geradasU : res.geradasV)[line.index - 1];
    return lista.find((l) => l.gerada === line.index - 1)?.pos ?? gerada;
  };
  const extrasEsq: AddedGridLine[] = [];
  const extrasDir: AddedGridLine[] = [];
  for (const ex of inst.addedLines ?? []) {
    if (ex.axis === 'v') {
      extrasEsq.push(ex);
      extrasDir.push(ex);
      continue;
    }
    const lado = ladoDe(posAtual(ex.axis, { added: ex.id }) ?? ex.pos);
    if (lado === 'esq') extrasEsq.push(ex);
    if (lado === 'dir') extrasDir.push({ ...ex, pos: ex.pos - hi });
  }
  // Linha U (vertical, no eixo s): repartida pela posição atual. Linha V: fica nas duas partes com a mesma referência.
  const ovEsq: LineOverride[] = [];
  const ovDir: LineOverride[] = [];
  // Lê as sobrescritas JÁ remapeadas (res.linhas): a identidade g = index − 1 só vale na referência normalizada.
  for (const ov of res.linhas) {
    const eixo: Eixo | undefined = 'added' in ov.line ? eixoDeExtra.get(ov.line.added) : ov.line.axis;
    if (eixo === 'v') {
      ovEsq.push(ov);
      ovDir.push(ov);
      continue;
    }
    if (eixo === undefined) continue;
    const pAtual = posAtual(eixo, ov.line);
    const lado = pAtual === undefined ? null : ladoDe(pAtual);
    if (lado === null) continue;
    const cada = (lad: 'esq' | 'dir'): LineOverride => {
      const linha: LineRef = 'added' in ov.line ? ov.line : { axis: 'u', index: ov.line.index, pos: ((posAtual('u', ov.line) ?? 0) - off(lad)) / comp(lad), n: 0 };
      return { ...ov, line: linha, pos: ov.pos === undefined ? undefined : ov.pos - off(lad) };
    };
    if (lado === 'esq') ovEsq.push(cada('esq'));
    else ovDir.push(cada('dir'));
  }
  const segEsq: SegmentRef[] = [];
  const segDir: SegmentRef[] = [];
  for (const sg of res.segmentos) {
    const eixo: Eixo | undefined = 'added' in sg.line ? eixoDeExtra.get(sg.line.added) : sg.line.axis;
    if (eixo === undefined) continue;
    if (eixo === 'v') {
      // Segmento de linha V corre em s: repartido pelo centro (sg.mid normalizado por L).
      const cm = sg.mid * res.L;
      const lado = ladoDe(cm);
      if (lado === 'esq') segEsq.push({ ...sg, k: 0, nk: 0, mid: cm / L1 });
      if (lado === 'dir') segDir.push({ ...sg, k: 0, nk: 0, mid: (cm - hi) / L2 });
      continue;
    }
    // Segmento de linha U corre em z: a linha decide o lado; k e mid (de z) continuam valendo.
    const pAtual = posAtual('u', sg.line);
    const lado = pAtual === undefined ? null : ladoDe(pAtual);
    if (lado === null) continue;
    const linha: LineRef = 'added' in sg.line ? sg.line : { axis: 'u', index: sg.line.index, pos: ((posAtual('u', sg.line) ?? 0) - off(lado)) / comp(lado), n: 0 };
    if (lado === 'esq') segEsq.push({ ...sg, line: linha });
    else segDir.push({ ...sg, line: linha });
  }
  const celEsq: CellOverrideEntry[] = [];
  const celDir: CellOverrideEntry[] = [];
  for (const e of res.celulas) {
    const cm = e.key.s * res.L;
    const lado = ladoDe(cm);
    if (lado === 'esq') celEsq.push({ ...e, key: { ...e.key, s: cm / L1, nu: 0, nv: 0 } });
    if (lado === 'dir') celDir.push({ ...e, key: { ...e.key, s: (cm - hi) / L2, nu: 0, nv: 0 } });
  }
  if (inst.addedLines !== undefined) {
    esq.addedLines = extrasEsq;
    dir.addedLines = extrasDir;
  }
  if (inst.lineOverrides !== undefined) {
    esq.lineOverrides = ovEsq;
    dir.lineOverrides = ovDir;
  }
  if (inst.removedSegments !== undefined) {
    esq.removedSegments = segEsq;
    dir.removedSegments = segDir;
  }
  if (inst.cells !== undefined) {
    esq.cells = celEsq;
    dir.cells = celDir;
  }
  return { esq, dir };
}

/** Problemas de projeto: sobrescritas órfãs de qualquer parede cortina (`cortina-override-orfao`, aviso). */
export function curtainOrphanIssues(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e) || !e.curtain) continue;
    const res = resolverParede(p, e);
    if (!res) continue;
    for (const o of res.orfas) {
      out.push({
        severity: 'warning',
        code: 'cortina-override-orfao',
        message: t('pt', 'md_ct_orphan_override', { x: o.x.toFixed(2), z: o.z.toFixed(2) }),
        elementId: e.id,
      });
    }
  }
  return out;
}
