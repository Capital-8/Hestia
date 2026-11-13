/**
 * Vizinhança das pontas das paredes cortina (decisão 0056, fase 3: junção entre paredes; seção 110 `cortina_extremidades`, esquema v16). TS puro, sem
 * kernel: NÃO calcula recuo nem canto (isso é do Rust, `cortina_juncao.rs`); só descobre, para cada ponta de cada cortina, qual parede está no nó e
 * descreve essa parede (ângulo, dois segmentos de face, espessura), do mesmo jeito que o projeto já enxerga a vizinhança das paredes comuns
 * (`endPartners` e `findTee` de `joins.ts`, com a tolerância de junção do projeto).
 *
 * Regras de vizinhança (v1):
 * - parede cuja PONTA cai no nó (até a tolerância): vizinha em L (ou em linha, se colinear). Pode ser parede comum ou outra cortina;
 * - parede cujo CORPO contém o nó e não é paralela à cortina: vizinha em T (`atravessa`);
 * - uma só candidata vale; várias candidatas colineares entre si (a parede passante dividida no nó) valem como T, com a primeira; várias em direções
 *   diferentes (nó de 3 ou mais paredes) NÃO são resolvidas na v1: a ponta fica sem vizinha e a cortina termina no eixo do nó;
 * - só contam paredes do mesmo nível que se sobrepõem em altura com a cortina;
 * - `noJoinStart` e `noJoinEnd` da parede desligam a junção da ponta (o Rust trata a ponta como livre).
 */
import { dist, type Vec2 } from '@hestia/geom';
import { isCurtainType, wallBaseElevation, wallMaxHeight, wallType, wallsOnLevel, type Id, type Project, type Wall } from '@hestia/model';
import { DEFAULT_JOIN_TOL } from './joins.ts';
import { buildFrame, pointAt, tangentAt, toLocal } from './frame.ts';

/** Seno máximo do ângulo entre dois eixos para valerem como paralelos (~2°, o `COLLINEAR_SIN` das junções). */
const SENO_PARALELO = 0.035;
/** Seno mínimo para uma parede cruzar o corpo de outra (T): como `findTee`. */
const SENO_T = 0.1;
/** Quanto de um arco (m) entra no segmento de face de uma parede curva: o segmento é a corda a partir do nó. */
const ARCO_ALCANCE = 1;

export type QuadroVizinho = {
  id: Id;
  cortina: boolean;
  a: Vec2;
  b: Vec2;
  comprimento: number;
  /** Parede em arco: o eixo é curvo e as faces saem como corda a partir do nó. */
  arco: boolean;
  /** Tangente do eixo em `t` (sentido a→b). */
  tangente: (t: number) => Vec2;
  /** Ponto do mundo em `(t, s)`: ao longo do eixo e na normal à esquerda. */
  ponto: (t: number, s: number) => Vec2;
  /** Posição `(t, s)` de um ponto do mundo. */
  local: (p: Vec2) => { t: number; s: number };
  sLo: number;
  sHi: number;
  sMid: number;
  espessura: number;
  /** Faixa vertical (cota da base e do topo) ou nula, se desconhecida. */
  z: { z0: number; top: number } | null;
  order: number;
};

/** Ponta da cortina no formato do adaptador (`ExtremidadeCortinaKernel`, `kernelCortina.ts`). */
export interface ExtremidadeCortinaKernel {
  fim: 'start' | 'end';
  /** Id da parede vizinha no modelo; `null` = nenhuma. */
  vizinhaId: Id | null;
  vizinhaCortina: boolean;
  /** A vizinha atravessa o nó (T). */
  atravessa: boolean;
  /** Onde a vizinha sai do nó em relação ao eixo da cortina: 0 esquerda, 1 direita, 2 atravessa ou em linha. */
  lado: 0 | 1 | 2;
  /** Ângulo (rad, de 0 a π) entre as direções que saem do nó, uma para cada parede. */
  angulo: number;
  noJoin: boolean;
  face1: readonly [number, number, number, number];
  face2: readonly [number, number, number, number];
  espessura: number;
}

const SEM_FACE = [Number.NaN, Number.NaN, Number.NaN, Number.NaN] as const;

const semVizinha = (fim: 'start' | 'end', noJoin: boolean): ExtremidadeCortinaKernel => ({
  fim,
  vizinhaId: null,
  vizinhaCortina: false,
  atravessa: false,
  lado: 2,
  angulo: Number.NaN,
  noJoin,
  face1: SEM_FACE,
  face2: SEM_FACE,
  espessura: Number.NaN,
});

/** Distância da face externa à linha de localização da cortina: a mesma conta do Rust (`cortina_pecas::resolver_uma`). */
function extDaCortina(loc: Wall['locationLine'], d: number): number {
  switch (loc) {
    case 'wallCenter':
    case 'coreCenter':
      return d / 2;
    case 'finishExterior':
    case 'coreExterior':
      return 0;
    default:
      return d;
  }
}

/** Quadro de uma parede cortina: reta, com a faixa lateral do sistema na mesma convenção do Rust (`s_mid ± d/2`, `σ` conforme `flipped`). */
export function quadroDaCortina(w: Wall, profundidade: number, z: { z0: number; top: number } | null): QuadroVizinho | null {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const comprimento = Math.hypot(dx, dy);
  if (comprimento < 1e-4) return null;
  const u = { x: dx / comprimento, y: dy / comprimento };
  const n = { x: -u.y, y: u.x };
  const sigma = w.flipped ? -1 : 1;
  const sMid = sigma * (extDaCortina(w.locationLine, profundidade) - profundidade / 2);
  return {
    id: w.id,
    cortina: true,
    a: w.a,
    b: w.b,
    comprimento,
    arco: false,
    tangente: () => u,
    ponto: (t, s) => ({ x: w.a.x + u.x * t + n.x * s, y: w.a.y + u.y * t + n.y * s }),
    local: (p) => ({ t: (p.x - w.a.x) * u.x + (p.y - w.a.y) * u.y, s: (p.x - w.a.x) * n.x + (p.y - w.a.y) * n.y }),
    sLo: sMid - profundidade / 2,
    sHi: sMid + profundidade / 2,
    sMid,
    espessura: profundidade,
    z,
    order: w.order,
  };
}

/** Quadro de uma parede comum (reta ou em arco), a partir do `WallFrame` do motor. */
export function quadroDaParedeComum(p: Project, w: Wall): QuadroVizinho | null {
  const f = buildFrame(w, wallType(p, w));
  if (!f) return null;
  const z0 = wallBaseElevation(p, w);
  return {
    id: w.id,
    cortina: false,
    a: f.a,
    b: f.b,
    comprimento: f.length,
    arco: f.arc !== null,
    tangente: (t) => tangentAt(f, t),
    ponto: (t, s) => pointAt(f, t, s),
    local: (pt) => toLocal(f, pt),
    sLo: f.sLo,
    sHi: f.sHi,
    sMid: f.sMid,
    espessura: f.thickness,
    z: { z0, top: z0 + wallMaxHeight(p, w) },
    order: w.order,
  };
}

const cruz = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const prod = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const sobrepoeEmAltura = (a: QuadroVizinho['z'], b: QuadroVizinho['z']): boolean => !a || !b || (a.z0 < b.top - 1e-6 && b.z0 < a.top - 1e-6);

interface Candidata {
  q: QuadroVizinho;
  /** `'a'` ou `'b'`: a ponta da vizinha que cai no nó; `null` = o nó está no corpo dela (T). */
  ponta: 'a' | 'b' | null;
  /** Direção do eixo dela, saindo do nó (para T: o sentido a→b). */
  saida: Vec2;
  /** Posição `t` do nó no eixo dela. */
  t: number;
}

function candidatasDoNo(no: Vec2, dirCortina: Vec2, meu: QuadroVizinho, outras: readonly QuadroVizinho[], tol: number): Candidata[] {
  const out: Candidata[] = [];
  for (const q of outras) {
    if (q.id === meu.id || !sobrepoeEmAltura(meu.z, q.z)) continue;
    const naA = dist(q.a, no) <= tol;
    const naB = dist(q.b, no) <= tol;
    if (naA !== naB) {
      const ponta = naA ? 'a' : 'b';
      const tg = q.tangente(naA ? 0 : q.comprimento);
      out.push({ q, ponta, saida: naA ? tg : { x: -tg.x, y: -tg.y }, t: naA ? 0 : q.comprimento });
      continue;
    }
    if (naA && naB) continue; // parede degenerada (as duas pontas no nó)
    const loc = q.local(no);
    if (loc.t < -tol || loc.t > q.comprimento + tol || Math.abs(loc.s - q.sMid) > q.espessura / 2 + tol) continue;
    const tg = q.tangente(Math.min(Math.max(loc.t, 0), q.comprimento));
    if (Math.abs(cruz(dirCortina, tg)) < SENO_T) continue;
    out.push({ q, ponta: null, saida: tg, t: loc.t });
  }
  return out;
}

/** Dois segmentos de face da vizinha, no mundo: o corpo inteiro da reta, ou a corda de até `ARCO_ALCANCE` m a partir do nó. */
function facesDa(c: Candidata): { face1: readonly [number, number, number, number]; face2: readonly [number, number, number, number] } {
  const { q } = c;
  let t0 = 0;
  let t1 = q.comprimento;
  if (q.arco) {
    if (c.ponta === 'a') t1 = Math.min(q.comprimento, ARCO_ALCANCE);
    else if (c.ponta === 'b') t0 = Math.max(0, q.comprimento - ARCO_ALCANCE);
    else {
      t0 = Math.max(0, c.t - ARCO_ALCANCE);
      t1 = Math.min(q.comprimento, c.t + ARCO_ALCANCE);
    }
  }
  const seg = (s: number): readonly [number, number, number, number] => {
    const p = q.ponto(t0, s);
    const r = q.ponto(t1, s);
    return [p.x, p.y, r.x, r.y];
  };
  return { face1: seg(q.sLo), face2: seg(q.sHi) };
}

/**
 * Pontas de UMA cortina. `todas` são os quadros de todas as paredes do nível (comuns e cortinas, a própria incluída; ela é ignorada). Sem vizinha, a
 * ponta volta com `vizinhaId = null`: a linha da seção 110 existe sempre, uma por ponta.
 */
export function extremidadesDaCortina(meu: QuadroVizinho, w: Wall, todas: readonly QuadroVizinho[], tol: number = DEFAULT_JOIN_TOL): [ExtremidadeCortinaKernel, ExtremidadeCortinaKernel] {
  const u = { x: (meu.b.x - meu.a.x) / meu.comprimento, y: (meu.b.y - meu.a.y) / meu.comprimento };
  const ponta = (fim: 'start' | 'end'): ExtremidadeCortinaKernel => {
    const noJoin = fim === 'start' ? w.noJoinStart : w.noJoinEnd;
    const no = fim === 'start' ? meu.a : meu.b;
    const saida = fim === 'start' ? u : { x: -u.x, y: -u.y };
    let cands = candidatasDoNo(no, saida, meu, todas, tol);
    if (cands.length === 0) return semVizinha(fim, noJoin);
    let atravessa = false;
    if (cands.length > 1) {
      // Várias: só valem se forem a mesma reta passante dividida no nó (todas paralelas entre si); a primeira, na ordem de criação, descreve as faces.
      const base = cands[0]!.saida;
      if (cands.some((c) => Math.abs(cruz(base, c.saida)) >= SENO_PARALELO)) return semVizinha(fim, noJoin);
      atravessa = true;
      cands = [...cands].sort((x, y) => x.q.order - y.q.order);
    }
    const c = cands[0]!;
    atravessa = atravessa || c.ponta === null;
    const { face1, face2 } = facesDa(c);
    const angulo = Math.acos(Math.max(-1, Math.min(1, prod(saida, c.saida))));
    const lado = atravessa ? 2 : cruz(saida, c.saida) >= 0 ? 0 : 1;
    return { fim, vizinhaId: c.q.id, vizinhaCortina: c.q.cortina, atravessa, lado, angulo, noJoin, face1, face2, espessura: c.q.espessura };
  };
  return [ponta('start'), ponta('end')];
}

/** Quadros de todas as paredes de cada nível que tem cortina (as comuns do motor e as cortinas), por nível. */
export function quadrosDosNiveis(
  p: Project,
  niveis: ReadonlySet<Id>,
  cortinas: ReadonlyMap<Id, { profundidade: number; z: { z0: number; top: number } }>,
): Map<Id, QuadroVizinho[]> {
  const out = new Map<Id, QuadroVizinho[]>();
  for (const nivel of niveis) {
    const lista: QuadroVizinho[] = [];
    for (const w of wallsOnLevel(p, nivel)) {
      const c = cortinas.get(w.id);
      if (!c && isCurtainType(p.wallTypes[w.typeId])) continue; // cortina ignorada (referência quebrada): não é desenhada, não vizinha de ninguém
      const q = c ? quadroDaCortina(w, c.profundidade, c.z) : quadroDaParedeComum(p, w);
      if (q) lista.push(q);
    }
    out.set(nivel, lista);
  }
  return out;
}
