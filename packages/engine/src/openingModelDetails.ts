import {
  hingeHeights,
  openingFamilyOf,
  openingHinges,
  openingLeafBottom,
  openingLintel,
  openingOptionSupport,
  openingSillBeam,
  openingSillBoard,
  openingThreshold,
  type OpeningType,
} from '@hestia/model';
import {
  GAP,
  SIDELIGHT_MULLION,
  TRANSOM_BAR,
  addPart,
  box,
  innerT,
  leafZ,
  type Ctx,
} from './openingModelContext.ts';
import { addWindowLeaf, windowLayout, windowTransomApplies } from './openingModelWindowsNew.ts';
import type { OpeningPart, PartBox, PartMotion } from './openingModelTypes.ts';

/** Bandeiras laterais: vidro fixo de cada lado marcado, com montante entre ele e a folha. */
export function buildSidelights(c: Ctx): void {
  const s = c.sidelights;
  if (!s) return;
  // Bandeira lateral de janela só vale na janela fixa; nas demais famílias é ignorada (spec E3 §7).
  if (c.t.kind === 'window' && openingFamilyOf(c.t)?.id !== 'window_fixed') return;
  const base = { t0: -c.hw + c.J, t1: c.hw - c.J };
  const z0 = c.t.kind === 'window' ? c.J : 0;
  const z1 = c.t.kind === 'window' ? windowLayout(c).z1 : c.transom ? Math.min(c.H - c.J, c.H - c.J - c.transom.height - TRANSOM_BAR) : c.H - c.J;
  const body = { s0: c.Cd - c.D / 2, s1: c.Cd + c.D / 2 };
  if (s.left) {
    addPart(c, 'sidelight-glass-left', 'glass', 'glass', box(base.t0, base.t0 + s.width, c.Cd - c.G / 2, c.Cd + c.G / 2, z0, z1), { glassKind: c.t.glassKind });
    const m0 = base.t0 + s.width;
    addPart(c, 'sidelight-mullion-left', 'leaf', 'frame', box(m0, m0 + SIDELIGHT_MULLION, body.s0, body.s1, z0, z1));
  }
  if (s.right) {
    addPart(c, 'sidelight-glass-right', 'glass', 'glass', box(base.t1 - s.width, base.t1, c.Cd - c.G / 2, c.Cd + c.G / 2, z0, z1), { glassKind: c.t.glassKind });
    const m1 = base.t1 - s.width;
    addPart(c, 'sidelight-mullion-right', 'leaf', 'frame', box(m1 - SIDELIGHT_MULLION, m1, body.s0, body.s1, z0, z1));
  }
}

/**
 * Bandeira superior de janela (spec E3 §7): faixa fixa de altura `transom.height` acima de uma travessa do caixilho
 * (`J`) que a separa das folhas. `transom.fixed === false` vira uma folha maxim-ar pequena (kind 'top'). A bandeira
 * ocupa toda a largura interna; as folhas ficam abaixo dela no `windowLayout`.
 */
export function buildWindowTransom(c: Ctx): void {
  const tr = c.transom;
  if (!tr || !windowTransomApplies(c.t)) return;
  const l = windowLayout(c);
  if (!l.transom) return;
  const body = { s0: c.Cd - c.D / 2, s1: c.Cd + c.D / 2 };
  const { barZ0, barZ1, bandZ0, bandZ1, fixed } = l.transom;
  addPart(c, 'transom-bar', 'muntin', 'frame', box(l.fullT0, l.fullT1, body.s0, body.s1, barZ0, barZ1));
  if (fixed) {
    addPart(c, 'transom-glass', 'glass', 'glass', box(l.fullT0, l.fullT1, c.Cd - c.G / 2, c.Cd + c.G / 2, bandZ0, bandZ1), { glassKind: c.t.glassKind });
    return;
  }
  // Bandeira maxim-ar: folha pequena com folga em volta, girando no topo para o lado da abertura.
  let index = c.parts.reduce((mx, p) => (p.leaf !== undefined ? Math.max(mx, p.leaf) : mx), -1) + 1;
  for (const p of c.parts) {
    const m = /^(?:glass|leaf)-(\d+)/.exec(p.id);
    if (m) index = Math.max(index, Number(m[1]) + 1);
  }
  const t0 = l.fullT0 + GAP;
  const t1 = l.fullT1 - GAP;
  const z0 = bandZ0 + GAP;
  const z1 = bandZ1 - GAP;
  const motion: PartMotion = { kind: 'rotate', axis: 't', s: c.Cd, z: z1, sign: c.side };
  addWindowLeaf(c, index, t0, t1, z0, z1, c.Cd, motion);
  c.openings.push({
    leaf: index,
    kind: 'top',
    side: c.side,
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: c.Cd },
    radius: z1 - z0,
    z0,
    z1,
  });
}

/** Bandeira superior: na porta, travessa de material de folha e vidro fixo acima; não gera item de abertura. */
export function buildTransom(c: Ctx): void {
  if (c.t.kind === 'window') {
    buildWindowTransom(c);
    return;
  }
  const tr = c.transom;
  if (!tr) return;
  const inner = innerT(c);
  const barZ0 = c.H - c.J - tr.height - TRANSOM_BAR;
  const barZ1 = c.H - c.J - tr.height;
  addPart(c, 'transom-bar', 'leaf', 'leaf', box(inner.t0, inner.t1, c.Cd - c.L / 2, c.Cd + c.L / 2, barZ0, barZ1));
  addPart(c, 'transom-glass', 'glass', 'glass', box(inner.t0, inner.t1, c.Cd - c.G / 2, c.Cd + c.G / 2, barZ1, c.H - c.J), { glassKind: c.t.glassKind });
}

/** Peitoril saliente de janela: projeta além das duas faces, abaixo do vão. */
export function buildSillBoard(c: Ctx): void {
  const sill = openingSillBoard(c.t);
  if (!sill) return;
  const half = c.thickness / 2 + sill.projection;
  addPart(c, 'sill-board', 'sillBoard', 'casing', box(-c.hw - 0.03, c.hw + 0.03, -half, half, -sill.thickness, 0));
}

/** Verga e contraverga de concreto, com transpasse além do vão. */
export function buildLintelBeams(c: Ctx): void {
  const lintel = openingLintel(c.t);
  if (lintel) {
    addPart(c, 'lintel', 'lintel', 'concrete', box(-c.hw - lintel.over, c.hw + lintel.over, c.core.s0, c.core.s1, c.H, c.H + lintel.height));
  }
  const beam = openingSillBeam(c.t);
  if (beam) {
    addPart(c, 'sill-beam', 'sillBeam', 'concrete', box(-c.hw - beam.over, c.hw + beam.over, c.core.s0, c.core.s1, -beam.height, 0));
  }
}

/**
 * Faixa z da folha de giro, dupla, pivotante e correr: a face inferior sobe da soleira (quando há) pela folga inferior
 * (`leafUndercut`); o topo segue o da folha padrão.
 */
export function doorLeafZ(c: Ctx): { z0: number; z1: number } {
  return { z0: openingLeafBottom(c.t), z1: leafZ(c).z1 };
}

/**
 * Dobradiças na face do batente do lado da folha (peças fixas, fora do movimento). Só a família que a tabela marca
 * (giro e dupla); quantidade e alturas pelo tipo (`hinges`, padrão 3, a 0,25 m das bordas da folha).
 */
export function addHinges(c: Ctx, index: number, hingeT: number): void {
  if (!openingOptionSupport(openingFamilyOf(c.t)?.id).hinges) return;
  const lside = (c.leafSide === 'opposite' ? -c.side : c.side) as 1 | -1;
  const sFace = c.Cd + lside * (c.D / 2 - GAP);
  const z = doorLeafZ(c);
  // Sem batente (porta de vidro) a borda da folha coincide com o vão: a dobradiça não pode passar dele.
  const t = Math.max(-(c.hw - HINGE_HALF_T), Math.min(c.hw - HINGE_HALF_T, hingeT));
  hingeBoxes(t, sFace, lside, hingeHeights(openingHinges(c.t), z.z0, z.z1)).forEach((b, k) =>
    addPart(c, `hinge-${index}-${k}`, 'hinge', 'metal', b),
  );
}

/** Meia espessura (m) das peças de ferragem: dobradiça (na face da folha) e placa da fechadura. */
const HINGE_HALF_T = 0.006;
const HINGE_HALF_S = 0.004;
const HINGE_HALF_Z = 0.05;

/**
 * Soleira de porta (peça fixa): prisma sob a folha, entre as ombreiras (`t` de −(hw − J) a hw − J), de z = 0 a
 * `espessura`, na profundidade do batente (`Cd` ± `D/2`). Só as famílias que a tabela marca têm soleira; null quando o
 * tipo não tem soleira ou a família não a desenha.
 */
export function thresholdPart(t: OpeningType, hw: number, J: number, Cd: number, D: number): OpeningPart | null {
  const sill = openingThreshold(t);
  if (!sill || !openingOptionSupport(openingFamilyOf(t)?.id).threshold) return null;
  return { id: 'threshold', role: 'threshold', material: 'concrete', box: box(-(hw - J), hw - J, Cd - D / 2, Cd + D / 2, 0, sill.thickness) };
}

/**
 * Dobradiças como caixas pequenas centradas na junta batente/folha: `t` é o eixo da dobradiça (a borda da folha do lado
 * do batente), `sFace` a face da folha de onde ela sai e `dir` (±1) o lado de fora dessa face. Uma caixa por altura de `zs`.
 */
export function hingeBoxes(t: number, sFace: number, dir: 1 | -1, zs: number[]): PartBox[] {
  return zs.map((z) =>
    box(t - HINGE_HALF_T, t + HINGE_HALF_T, sFace - dir * HINGE_HALF_S, sFace + dir * HINGE_HALF_S, z - HINGE_HALF_Z, z + HINGE_HALF_Z),
  );
}


