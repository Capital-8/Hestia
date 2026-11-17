import { bodyPoints, segment, type Body } from './geometry.ts';
import { bodyFor, toGeneric } from './genericImport.ts';
import { openingType, operationOf } from './elementTypes.ts';
import { guid, noteGeometry, psetOf } from './mappingUtil.ts';
import { hostByGeometry } from './openingHost.ts';
import { panelHandOf, windowPanelOperations } from './openingBim.ts';
import { profileLoops } from './profiles.ts';
import type { Ctx } from './mapping.ts';
import type { IfcFile, Pt2 } from './ifc.ts';
import type { StepEntity } from './step.ts';
import { t } from '../i18n.ts';
import type { Id, Opening } from '@hestia/model';

/** Porta/janela que não coube no modelo nativo: vira objeto genérico; só fica de fora se não tiver corpo. */
function fallbackOpening(ctx: Ctx, filler: StepEntity, reason: string): void {
  ctx.warn(reason);
  if (toGeneric(ctx, filler, bodyFor(ctx, filler))) return;
  ctx.skip(filler.type);
}

/** Área (m²) do contorno fechado pela fórmula dos cadarços. */
function areaOf(loop: Pt2[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * O vão do elemento (`owner`: o vazio, ou a própria esquadria sem vazio) tem contorno que não é retângulo, como um topo em
 * arco? Compara a área do contorno com a da caixa envolvente; um contorno retangular com pontos extras na reta não conta.
 */
export function outlineIsNotRect(f: IfcFile, owner: StepEntity): boolean {
  for (const rep of f.list(f.ent(owner, 6), 2)) {
    for (const item of f.list(rep, 3)) {
      if (item.type !== 'IFCEXTRUDEDAREASOLID') continue;
      const outer = profileLoops(f, f.ent(item, 0))?.loops[0];
      if (!outer || outer.length < 3) continue;
      const xs = outer.map((p) => p.x);
      const ys = outer.map((p) => p.y);
      const box = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      if (box > 0 && Math.abs(areaOf(outer) - box) / box > 1e-3) return true;
    }
  }
  return false;
}

/** Sentido da dobradiça da janela pelos painéis (`IfcWindowPanelProperties`); undefined = sem informação, mantém o padrão. */
const windowHand = (ctx: Ctx, filler: StepEntity): boolean | undefined =>
  panelHandOf(windowPanelOperations(ctx.f, filler, ctx.typeOf.get(filler.id)));

export function addOpening(ctx: Ctx, filler: StepEntity, kind: 'door' | 'window'): void {
  if (ctx.handled.has(filler.id)) return;
  const f = ctx.f;
  const openingId = ctx.openingOf.get(filler.id);
  let hostId: Id | undefined;
  let body: Body | null;
  // Elemento cuja geometria dá o vão: o IfcOpeningElement quando existe; senão a própria esquadria.
  let owner: StepEntity = filler;
  if (openingId == null) {
    // Sem vão/preenchimento no arquivo: o hospedeiro sai da geometria da própria peça.
    body = bodyFor(ctx, filler);
    hostId = hostByGeometry(ctx, body) ?? undefined;
    if (!hostId) return fallbackOpening(ctx, filler, t(ctx.lang, 'io_ifc_warn_opening_no_fill'));
  } else {
    const hostIfc = ctx.hostOf.get(openingId);
    hostId = hostIfc == null ? undefined : ctx.walls.get(hostIfc);
    if (!hostId) return fallbackOpening(ctx, filler, t(ctx.lang, 'io_ifc_warn_opening_no_host'));
    const opening = f.entity(openingId);
    if (opening) owner = opening;
    body = opening ? bodyFor(ctx, opening) : null;
  }
  const wall = ctx.p.elements[hostId];
  if (!wall || wall.kind !== 'wall') return fallbackOpening(ctx, filler, t(ctx.lang, 'io_ifc_warn_opening_no_host'));
  noteGeometry(ctx, body);
  if (!body) return fallbackOpening(ctx, filler, t(ctx.lang, 'io_ifc_warn_opening_no_void'));
  const prism = body.prisms[0];
  const loop = prism?.loops[0] ?? [];
  const cloud = prism ? loop.map((p) => ({ x: p.x, y: p.y, z: prism.z0 })) : bodyPoints(body);
  if (cloud.length < 3) return fallbackOpening(ctx, filler, t(ctx.lang, 'io_ifc_warn_opening_few_points'));
  if (outlineIsNotRect(f, owner)) {
    const nome = f.text(filler, 2).trim() || `#${filler.id}`;
    ctx.warn(
      `${kind === 'door' ? 'Porta' : 'Janela'} "${nome}": o vão não é retangular (por exemplo, tem topo em arco). ` +
        'Foi aproximado por um retângulo que o envolve (caixa envolvente); a forma original não é mantida.',
    );
  }
  const { dir, len } = segment([wall.a, wall.b]);
  let min = Infinity;
  let max = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of cloud) {
    const t = (p.x - wall.a.x) * dir.x + (p.y - wall.a.y) * dir.y;
    min = Math.min(min, t);
    max = Math.max(max, t);
    z0 = Math.min(z0, prism ? prism.z0 : p.z);
    z1 = Math.max(z1, prism ? prism.z1 : p.z);
  }
  const width = Math.max(0.3, max - min);
  const center = (min + max) / 2;
  const height = Math.max(0.3, z1 - z0);
  const baseZ = ctx.p.levels.find((l) => l.id === wall.levelId)?.elevation ?? 0;
  const sill = z0 - (baseZ + wall.baseOffset);
  const typeId = openingType(ctx, filler, kind, width, height, sill);
  const offset = Math.max(0, Math.min(len - width / 2, center));
  const id = `o_${guid(f, filler)}`;
  const hand = kind === 'window' ? windowHand(ctx, filler) : undefined;
  const op: Opening = {
    id,
    kind,
    typeId,
    hostId,
    offset,
    flipHand: hand ?? /RIGHT/.test(operationOf(ctx.typeOf.get(filler.id))),
    flipFacing: false,
    sillOverride: null,
    mark: f.text(filler, 7),
    ...psetOf(ctx, filler),
  };
  ctx.p.elements[id] = op;
  ctx.handled.add(filler.id);
  ctx.count(kind === 'door' ? 'portas' : 'janelas');
}
