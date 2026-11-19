import { openingFamilyOf, openingHandleHeight, openingHandleInset, openingLeafBottom } from '@hestia/model';
import { buildNewDoorParts } from './openingModelDoorsNew.ts';
import { buildVoid } from './openingModelWindows.ts';
import { addHinges, doorLeafZ, thresholdPart } from './openingModelDetails.ts';
import { handleParts } from './openingModelHandles.ts';
import type { PartMotion, PartProfile } from './openingModelTypes.ts';
import {
  GAP,
  OVERLAP,
  jambSection,
  TRANSOM_BAR,
  addPart,
  box,
  innerT,
  leafS,
  leafSpan,
  type AddOptions,
  type Ctx,
} from './openingModelContext.ts';

const signedArea = (pts: Array<[number, number]>): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

/** Ordena o polígono em sentido anti-horário (a área assinada fica positiva). */
const ccw = (pts: Array<[number, number]>): Array<[number, number]> => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

/**
 * Seção em L do batente com rebaixo (spec E3 §2), no plano (t, s) da ombreira `j`. O rebaixo tem a largura do batedor
 * (`OVERLAP`) e a profundidade da folha mais a folga (`R`); a peça é UMA, extrudada em z.
 */
export function jambProfile(c: Ctx, j: 1 | -1): PartProfile {
  return { plane: 'ts', pts: ccw(jambSection(c, c.hw, c.side, j)) };
}

/** Seção em L da travessa, no plano (s, z), com o rebaixo embaixo (spec E3 §2). */
export function headProfile(c: Ctx): PartProfile {
  const R = c.L + GAP;
  const pts: Array<[number, number]> = [
    [c.Cd - c.side * (c.D / 2), c.H],
    [c.Cd + c.side * (c.D / 2), c.H],
    [c.Cd + c.side * (c.D / 2), c.H - c.J + OVERLAP],
    [c.Cd + c.side * (c.D / 2 - R), c.H - c.J + OVERLAP],
    [c.Cd + c.side * (c.D / 2 - R), c.H - c.J],
    [c.Cd - c.side * (c.D / 2), c.H - c.J],
  ];
  return { plane: 'sz', pts: ccw(pts) };
}

/** Batente de porta: ombreiras e travessa; em L (uma peça com rebaixo) ou caixa única. */
function buildDoorFrame(c: Ctx): void {
  if (c.frameStyle === 'block') return;
  const body = { s0: c.Cd - c.D / 2, s1: c.Cd + c.D / 2 };
  const zTop = c.frameStyle === 'simple' ? c.H : c.H - c.J;
  for (const j of [-1, 1] as const) {
    const name = j < 0 ? 'left' : 'right';
    if (c.frameStyle === 'simple') {
      addPart(c, `jamb-${name}`, 'jamb', 'frame', box(j * (c.hw - c.J), j * c.hw, body.s0, body.s1, 0, c.H));
      continue;
    }
    addPart(c, `jamb-${name}`, 'jamb', 'frame', box(j * (c.hw - c.J), j * c.hw, body.s0, body.s1, 0, zTop), {
      profile: jambProfile(c, j),
    });
  }
  if (c.frameStyle === 'simple') {
    addPart(c, 'head', 'head', 'frame', box(-c.hw, c.hw, body.s0, body.s1, c.H - c.J, c.H));
    return;
  }
  addPart(c, 'head', 'head', 'frame', box(-c.hw, c.hw, body.s0, body.s1, c.H - c.J, c.H), { profile: headProfile(c) });
}

/** Saliência (m) das aletas da folha de veneziana além de cada face da folha. */
const LOUVER_PROUD = 0.012;

/** Almofadas, aletas ou grelhas sobre a folha (detalhe do estilo). */
function addLeafDetails(
  c: Ctx,
  index: number,
  t0: number,
  t1: number,
  sSpan: { s0: number; s1: number },
  z0: number,
  z1: number,
  motion: PartMotion,
): void {
  const opts: AddOptions = { motion, leaf: index };
  if (c.leafStyle === 'panel') {
    const mt = Math.min(0.08, (t1 - t0) * 0.1);
    const mz = Math.min(0.08, (z1 - z0) * 0.1);
    const gapPanel = 0.03;
    const a0 = t0 + mt;
    const a1 = t1 - mt;
    const b0 = z0 + mz;
    const b1 = z1 - mz;
    const colW = (a1 - a0 - gapPanel) / 2;
    const rowH = (b1 - b0 - gapPanel) / 2;
    if (colW > 0 && rowH > 0) {
      for (let col = 0; col < 2; col++) {
        for (let row = 0; row < 2; row++) {
          const p0 = a0 + col * (colW + gapPanel);
          const p1 = p0 + colW;
          const q0 = b0 + row * (rowH + gapPanel);
          const q1 = q0 + rowH;
          addPart(
            c,
            `leaf-${index}-panel-${col}-${row}`,
            'leafPanel',
            'leaf',
            box(p0, p1, sSpan.s0 - 0.006, sSpan.s1 + 0.006, q0, q1),
            opts,
          );
        }
      }
    }
    return;
  }
  if (c.leafStyle === 'louver') {
    const t0i = t0 + 0.05;
    const t1i = t1 - 0.05;
    if (t1i > t0i) {
      let z = z0 + 0.03;
      let k = 0;
      while (z + 0.035 <= z1 - 0.03) {
        // As aletas saem da folha em cada face (como a almofada e a grelha): dentro da espessura da folha elas ficavam
        // embutidas, com o mesmo material, e a veneziana aparecia como chapa lisa (docs/estudo-esquadrias/38).
        addPart(c, `leaf-${index}-louver-${k}`, 'leafPanel', 'leaf', box(t0i, t1i, sSpan.s0 - LOUVER_PROUD, sSpan.s1 + LOUVER_PROUD, z, z + 0.035), opts);
        z += 0.055;
        k++;
      }
    }
    return;
  }
  if (c.leafStyle === 'grille') {
    const z0i = z0 + 0.03;
    const z1i = z1 - 0.03;
    if (z1i > z0i) {
      let t = t0 + 0.03;
      let k = 0;
      while (t + 0.025 <= t1 - 0.03) {
        addPart(c, `leaf-${index}-grille-${k}`, 'leafPanel', 'leaf', box(t, t + 0.025, sSpan.s0 - 0.003, sSpan.s1 + 0.003, z0i, z1i), opts);
        t += 0.08;
        k++;
      }
    }
  }
}

/**
 * Maçaneta da folha, presa a ela (mesmo movimento). A altura (`handleHeight`, do piso) e o recuo (`handleInset`, da borda
 * livre até o eixo) vêm do tipo. Com alavanca ou puxador de botão, a placa da fechadura (espelho) fica logo abaixo.
 */
function addHandle(
  c: Ctx,
  index: number,
  tCenter: number,
  sSpan: { s0: number; s1: number },
  z0: number,
  z1: number,
  latchT: number,
  motion: PartMotion,
): void {
  if (c.handle === 'none') return;
  const z = Math.min(Math.max(openingHandleHeight(c.t), z0 + 0.05), z1 - 0.05);
  const inward = (Math.sign(tCenter - latchT) || 1) as 1 | -1;
  const tR = latchT + inward * openingHandleInset(c.t);
  const opts: AddOptions = { motion, leaf: index };
  const pecas = handleParts({ index, style: c.handle, tR, z, sMid: (sSpan.s0 + sSpan.s1) / 2, L: c.L, side: c.side, inward });
  for (const p of pecas) addPart(c, p.id, 'handle', 'metal', p.box, p.profile ? { ...opts, profile: p.profile } : opts);
}

/** Folha de porta: vazada (glass) ou sólida com os detalhes do estilo e a maçaneta. */
function addDoorLeaf(
  c: Ctx,
  index: number,
  t0: number,
  t1: number,
  sSpan: { s0: number; s1: number },
  z: { z0: number; z1: number },
  motion: PartMotion,
  latchT: number,
): void {
  const opts: AddOptions = { motion, leaf: index };
  const ta = Math.min(t0, t1);
  const tb = Math.max(t0, t1);
  if (c.leafStyle === 'glass') {
    const stile = 0.1;
    const bottom = 0.22;
    const innerL = ta + stile;
    const innerR = tb - stile;
    const innerZ0 = z.z0 + bottom;
    const innerZ1 = z.z1 - stile;
    addPart(c, `leaf-${index}-left`, 'leaf', 'leaf', box(ta, innerL, sSpan.s0, sSpan.s1, z.z0, z.z1), opts);
    addPart(c, `leaf-${index}-right`, 'leaf', 'leaf', box(innerR, tb, sSpan.s0, sSpan.s1, z.z0, z.z1), opts);
    addPart(c, `leaf-${index}-top`, 'leaf', 'leaf', box(innerL, innerR, sSpan.s0, sSpan.s1, innerZ1, z.z1), opts);
    addPart(c, `leaf-${index}-bottom`, 'leaf', 'leaf', box(innerL, innerR, sSpan.s0, sSpan.s1, z.z0, innerZ0), opts);
    const sMid = (sSpan.s0 + sSpan.s1) / 2;
    addPart(c, `glass-${index}`, 'glass', 'glass', box(innerL, innerR, sMid - c.G / 2, sMid + c.G / 2, innerZ0, innerZ1), { ...opts, glassKind: c.t.glassKind });
  } else {
    addPart(c, `leaf-${index}`, 'leaf', 'leaf', box(ta, tb, sSpan.s0, sSpan.s1, z.z0, z.z1), opts);
    addLeafDetails(c, index, ta, tb, sSpan, z.z0, z.z1, motion);
  }
  addHandle(c, index, (ta + tb) / 2, sSpan, z.z0, z.z1, latchT, motion);
}

/** Folha de giro (uma ou duas), com a maçaneta e os detalhes do estilo. */
function addSwingLeaf(c: Ctx, index: number, t0: number, t1: number, hingeT: number, latchT: number): void {
  const span = leafS(c);
  const z = doorLeafZ(c);
  // Dobradiça na face da folha voltada para o lado de abertura. O eixo no plano médio fazia a folha atravessar o
  // batedor; na face oposta (a do rebaixo) o canto de espessura ainda varria o lábio do perfil em L. Esta é a face que
  // mantém o giro afastado do batente durante toda a varredura (spec E3 §5; divergência registrada no relatório).
  const lside = c.leafSide === 'opposite' ? -c.side : c.side;
  const inicio = c.Cd + lside * (c.D / 2 - (c.L + GAP));
  const hingeS = c.leafSide === 'opposite' ? inicio : inicio + lside * c.L;
  // O sinal depende do lado da dobradiça: com a folha à direita do eixo (h = +1) o mesmo ângulo a levaria ao lado
  // oposto ao da abertura.
  const sign = (c.side * (hingeT < latchT ? 1 : -1)) as 1 | -1;
  const rotate: PartMotion = { kind: 'rotate', axis: 'z', t: hingeT, s: hingeS, sign };
  addDoorLeaf(c, index, t0, t1, span, z, rotate, latchT);
  c.openings.push({
    leaf: index,
    kind: 'side',
    side: c.side,
    hingeT,
    latchT,
    pivot: { t: hingeT, s: hingeS },
    radius: Math.abs(t1 - t0),
    z0: z.z0,
    z1: z.z1,
  });
}

/** Porta de giro de uma folha. */
function buildSwingDoor(c: Ctx): void {
  buildDoorFrame(c);
  const span = leafSpan(c);
  const hingeT = span.center + c.h * span.half;
  const latchT = span.center - c.h * span.half;
  addSwingLeaf(c, 0, latchT, hingeT, hingeT, latchT);
  addHinges(c, 0, hingeT);
}

/** Porta dupla: duas folhas de `lh − 0,002`, dobradiças nas ombreiras, as duas para `side`. */
function buildDoubleDoor(c: Ctx): void {
  buildDoorFrame(c);
  const span = leafSpan(c);
  const leftHinge = span.center - span.half;
  const rightHinge = span.center + span.half;
  const centerL = span.center - 0.002;
  const centerR = span.center + 0.002;
  addSwingLeaf(c, 0, centerL, leftHinge, leftHinge, centerL);
  addSwingLeaf(c, 1, centerR, rightHinge, rightHinge, centerR);
  addHinges(c, 0, leftHinge);
  addHinges(c, 1, rightHinge);
}

/** Folga mínima (m) entre o canto da folha pivotante e a ombreira durante o giro. */
const PIVOT_MARGIN = 0.0005;

/** Porta pivotante: folha inteira girando em torno do eixo vertical a W/4 da ombreira da dobradiça. */
function buildPivotDoor(c: Ctx): void {
  buildDoorFrame(c);
  const span = leafSpan(c);
  const z = doorLeafZ(c);
  const sSpan = leafS(c);
  const axis = c.h * (c.hw / 2);
  // Pivotante: a folha inteira gira em torno do eixo no meio de `t`; o eixo em `s` fica na face encostada no batedor,
  // que é a que varre para dentro (afastando-se do lábio do batente) durante o giro. A folha recua `L/2 + folga` da
  // face interna do batente para o giro não varrer o batente do lado oposto (spec E3 §5).
  const lside = c.leafSide === 'opposite' ? -c.side : c.side;
  const inicio = c.Cd + lside * (c.D / 2 - (c.L + GAP));
  const contact = c.leafSide === 'opposite' ? inicio + lside * c.L : inicio;
  const sign = (c.side * c.h) as 1 | -1;
  const motion: PartMotion = { kind: 'rotate', axis: 'z', t: axis, s: contact, sign };
  // A folha ocupa quase todo o vão: a ponta do lado do eixo recua só o necessário para o canto não varrer a ombreira no giro
  // (o eixo está na face da folha, então o canto fica a √(braço² + L²) do eixo), e a do outro lado deixa a folga mínima.
  const face = c.hw - c.J;
  const braco = Math.sqrt(Math.max(0, (face - Math.abs(axis) - PIVOT_MARGIN) ** 2 - c.L ** 2));
  const half = Math.max(0, Math.min(face - GAP, Math.abs(axis) + braco));
  // O topo da folha fica abaixo da face inferior da travessa: o giro para o lado oposto não varre o batedor da verga.
  const zPivot = { z0: z.z0, z1: Math.min(z.z1, c.H - c.J) };
  addDoorLeaf(c, 0, span.center - half, span.center + half, sSpan, zPivot, motion, -axis);
  c.openings.push({
    leaf: 0,
    kind: 'pivot',
    side: c.side,
    hingeT: axis,
    latchT: -axis,
    pivot: { t: axis, s: contact },
    radius: (3 * c.hw) / 2,
    z0: zPivot.z0,
    z1: zPivot.z1,
  });
}

/** Batente de correr: caixa J×D sem batedor, com trilhos metálicos no topo e no piso. */
function buildSlidingDoorFrame(c: Ctx): void {
  const body = { s0: c.Cd - c.D / 2, s1: c.Cd + c.D / 2 };
  for (const j of [-1, 1] as const) {
    addPart(c, `jamb-${j < 0 ? 'left' : 'right'}`, 'jamb', 'frame', box(j * (c.hw - c.J), j * c.hw, body.s0, body.s1, 0, c.H));
  }
  addPart(c, 'head', 'head', 'frame', box(-c.hw, c.hw, body.s0, body.s1, c.H - c.J, c.H));
  const inner = c.hw - c.J;
  addPart(c, 'track-head', 'track', 'metal', box(-inner, inner, body.s0, body.s1, c.H - c.J - GAP - 0.01, c.H - c.J - GAP));
  addPart(c, 'track-floor', 'track', 'metal', box(-inner, inner, body.s0, body.s1, 0, 0.01));
}

/** Porta de correr de duas folhas: pistas opostas, sobreposição central e uma folha que desliza. */
function buildSlidingDoor(c: Ctx): void {
  // Correr não tem maçaneta (tabela `openingSupport`): o motor ignora o campo do tipo.
  c.handle = 'none';
  buildSlidingDoorFrame(c);
  const inner = innerT(c);
  const innerWidth = inner.t1 - inner.t0;
  const center0 = (inner.t0 + inner.t1) / 2;
  const leafW = (innerWidth + 0.06) / 2;
  const spacing = leafW - 0.06;
  const travel = leafW - 0.06;
  const z0 = openingLeafBottom(c.t);
  const z1 = c.transom ? c.H - c.J - c.transom.height - TRANSOM_BAR - GAP : c.H - c.J - GAP;
  const moving = c.h === 1 ? 0 : 1;
  for (let k = 0; k < 2; k++) {
    const center = center0 + (k - 0.5) * spacing;
    const sCenter = c.Cd + (k === 0 ? -1 : 1) * (c.L / 2 + 0.003);
    const motion: PartMotion =
      k === moving ? { kind: 'slide', dt: k === 1 ? -1 : 1, ds: 0, dz: 0, travel } : { kind: 'slide', dt: 0, ds: 0, dz: 0, travel: 0 };
    const latchT = center + (k <= 0 ? leafW / 2 : -leafW / 2);
    addDoorLeaf(c, k, center - leafW / 2, center + leafW / 2, { s0: sCenter - c.L / 2, s1: sCenter + c.L / 2 }, { z0, z1 }, motion, latchT);
    c.openings.push({
      leaf: k,
      kind: 'slide',
      side: 0,
      hingeT: 0,
      latchT: 0,
      pivot: { t: 0, s: sCenter },
      radius: leafW,
      z0,
      z1,
    });
  }
}

export function buildDoor(c: Ctx): void {
  const family = openingFamilyOf(c.t)?.id;
  const novas = buildNewDoorParts(c.p, c.o, c.g, c.f);
  if (novas) {
    c.parts.push(...novas.parts);
    c.openings.push(...novas.openings);
    return;
  }
  switch (family) {
    case 'door_double':
      buildDoubleDoor(c);
      break;
    case 'door_pivot':
      buildPivotDoor(c);
      break;
    case 'door_sliding':
      buildSlidingDoor(c);
      break;
    case 'door_void':
      buildVoid(c);
      break;
    default:
      buildSwingDoor(c);
  }
  // Soleira da família (tabela): peça fixa entre as ombreiras. Vão livre e portão não têm.
  const sill = thresholdPart(c.t, c.hw, c.J, c.Cd, c.D);
  if (sill) c.parts.push(sill);
}
