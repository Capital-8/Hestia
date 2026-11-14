import { add, applyTransform, dist, dot, norm, openingSymbolPaths, perp, sub, type Transform, type Vec2 } from '@hestia/geom';
import { frameOfWall, openingGeometry } from '@hestia/engine';
import { isCad, isFloor, isMass, isOpening, isRamp, isRoof, isRoom, isSlab, isStair, isWall, mapaDeIdsDeGuardaCorpos, newId, sectionLabelOf, sectionPoints, viewIdsIn, viewTransformCommands, type Command, type Id, type Project } from '@hestia/model';
import { followerCommands, planWallFollowers } from './wallFollow.ts';
import { cadSnapIndexes } from './snapCad.ts';
import { execWithHostedLoss } from './hostedGuard.ts';
import { selectedStairs } from './stairPick.ts';
import { ghostStairItems } from './stairPreview.ts';
import { selectedRamps } from './rampPick.ts';
import { ghostRampItems } from './rampPreview.ts';
import { selectedFloors } from './floorPick.ts';
import { selectedSlabs } from './slabPick.ts';
import { selectedRoofs } from './roofPick.ts';
import { selectedRooms } from './roomPick.ts';
import { massRings, selectedMasses } from './massPick.ts';
import { ghostGuardaCorpos, selectedGuardaCorpos } from './guardaCorpoEdicao.ts';
import type { PreviewItem, ToolEnv } from './types.ts';
import { langOf, t as translate } from './i18n.ts';

/** Paredes dentro da seleção (aberturas selecionadas acompanham o anfitrião). */
export const selectedWalls = (p: Project, ids: Id[]): Id[] => ids.filter((id) => isWall(p.elements[id]));
export const selectedOpenings = (p: Project, ids: Id[]): Id[] => ids.filter((id) => isOpening(p.elements[id]));
/** Desenhos CAD importados dentro da seleção (movem como um objeto só). */
export const selectedCads = (p: Project, ids: Id[]): Id[] => ids.filter((id) => isCad(p.elements[id]));
/** Paredes, pisos, lajes, telhados, massas e CAD: o que o comando 'transform' move, gira, espelha e copia (aberturas seguem o anfitrião). */
export const selectedMovables = (p: Project, ids: Id[]): Id[] => [...selectedWalls(p, ids), ...selectedFloors(p, ids), ...selectedSlabs(p, ids), ...selectedRoofs(p, ids), ...selectedStairs(p, ids), ...selectedRamps(p, ids), ...selectedRooms(p, ids), ...selectedCads(p, ids), ...selectedGuardaCorpos(p, ids), ...selectedMasses(p, ids)];

/** Vistas de corte/elevação dentro da seleção. Elas transformam junto com os elementos. */
export const selectedViews = (p: Project, ids: Id[]): Id[] => viewIdsIn(p, ids);

/** Fantasmas das marcas de corte/elevação sob mover/girar/espelhar. */
export function ghostViews(p: Project, ids: Id[], t: Transform): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (const id of viewIdsIn(p, ids)) {
    const v = p.views.find((x) => x.id === id);
    if (!v) continue;
    const pts = sectionPoints(p, v);
    out.push({ kind: 'sectionLine', a: applyTransform(t, pts.a), b: applyTransform(t, pts.b), dashed: true, label: sectionLabelOf(v), elevation: v.kind === 'elevation' });
  }
  return out;
}

/** Move, gira, espelha ou copia vistas num único passo de desfazer; devolve os ids das cópias. */
export function transformViews(env: ToolEnv, ids: Id[], t: Transform, copy = false): Id[] {
  const cmds = viewTransformCommands(env.project(), ids, t, copy);
  if (!cmds.length) return [];
  const created = cmds.flatMap((c) => (c.type === 'addView' ? [c.view.id] : []));
  env.transaction(translate(langOf(env), copy ? 'tl_undo_copy_view' : 'tl_undo_move_view'), () => {
    for (const c of cmds) env.exec(c);
  });
  return created;
}

/** Mapa de novos IDs para copiar paredes, pisos e as aberturas hospedadas nas paredes copiadas. */
export function makeIdMap(p: Project, ids: Id[]): Record<Id, Id> {
  const map: Record<Id, Id> = {};
  for (const id of ids) {
    const e = p.elements[id];
    if (isWall(e)) map[id] = newId('w');
    else if (isFloor(e)) map[id] = newId('f');
    else if (isSlab(e)) map[id] = newId('l');
    else if (isRoof(e)) map[id] = newId('t');
    else if (isStair(e)) map[id] = newId('st');
    else if (isRamp(e)) map[id] = newId('rp');
    else if (isRoom(e)) map[id] = newId('rm');
    else if (isCad(e)) map[id] = newId('cad');
    else if (isMass(e)) map[id] = newId('ms');
  }
  for (const e of Object.values(p.elements)) {
    if (isOpening(e) && ids.includes(e.hostId)) map[e.id] = newId(e.kind === 'door' ? 'd' : 'j');
  }
  // Guarda-corpos: os manuais selecionados e os hospedados nas escadas e rampas copiadas.
  mapaDeIdsDeGuardaCorpos(p, ids, map);
  return map;
}

/** Fantasmas das paredes e pisos selecionados sob uma transformação (pré-visualização de mover/girar/espelhar). */
export function ghostBands(p: Project, wallIds: Id[], t: Transform): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (const id of wallIds) {
    const st = p.elements[id];
    if (isStair(st)) {
      out.push(...ghostStairItems(st, t));
      continue;
    }
    if (isRamp(st)) {
      out.push(...ghostRampItems(st, t));
      continue;
    }
    const fl = p.elements[id];
    // Desenho CAD: o fantasma é a caixa do desenho (mover milhares de traços por quadro pesaria no cursor).
    if (isCad(fl)) {
      const ix = cadSnapIndexes(p, [fl.levelId]).find((x) => x.id === fl.id);
      if (ix) {
        out.push({
          kind: 'polygon',
          ring: [
            applyTransform(t, { x: ix.minX, y: ix.minY }),
            applyTransform(t, { x: ix.maxX, y: ix.minY }),
            applyTransform(t, { x: ix.maxX, y: ix.maxY }),
            applyTransform(t, { x: ix.minX, y: ix.maxY }),
          ],
          dashed: true,
        });
      }
      continue;
    }
    // Massa: o fantasma é o anel cortado de cada cópia (ou o contorno da base sem kernel), pelo mesmo transform.
    if (isMass(fl)) {
      for (const anel of massRings(p, fl.id)) out.push({ kind: 'polygon', ring: anel.map((q) => applyTransform(t, q)), dashed: true });
      continue;
    }
    // Ambiente: o contorno é derivado do circuito, então o fantasma é o ponto interior movido.
    if (isRoom(fl)) {
      out.push({ kind: 'point', at: applyTransform(t, fl.point) });
      continue;
    }
    if (isFloor(fl) || isSlab(fl) || isRoof(fl)) {
      out.push({ kind: 'polygon', ring: fl.boundary.map((q) => applyTransform(t, q)), dashed: true });
      continue;
    }
    const f = frameOfWall(p, id);
    if (!f) continue;
    const a = applyTransform(t, f.a);
    const b = applyTransform(t, f.b);
    const sag = f.wall.sag;
    out.push({ kind: 'wallBand', a, b, thickness: f.thickness, sMid: t.kind === 'mirror' ? -f.sMid : f.sMid, sag: t.kind === 'mirror' ? -sag : sag });
  }
  out.push(...ghostGuardaCorpos(p, wallIds, t));
  return out;
}

/**
 * Fantasmas das aberturas hospedadas nas paredes selecionadas, com o mesmo símbolo da planta. Espelhar inverte o lado
 * de abertura (`flipFacing`) e mantém a mão da dobradiça (`flipHand`), como o comando 'transform' faz no modelo.
 */
export function ghostOpenings(p: Project, wallIds: Id[], t: Transform): PreviewItem[] {
  // Caminho quente do cursor: sem aberturas hospedadas não há o que desenhar e nada é alocado.
  let any = false;
  for (const e of Object.values(p.elements)) {
    if (isOpening(e) && wallIds.includes(e.hostId)) {
      any = true;
      break;
    }
  }
  if (!any) return [];
  const out: PreviewItem[] = [];
  const mirror = t.kind === 'mirror';
  for (const id of wallIds) {
    if (!isWall(p.elements[id])) continue;
    const f = frameOfWall(p, id);
    if (!f) continue;
    for (const e of Object.values(p.elements)) {
      if (!isOpening(e) || e.hostId !== id) continue;
      const g = openingGeometry(p, e, f);
      const center = applyTransform(t, g.center);
      // Direção ao longo da parede: transforma dois pontos e tira a diferença (o vetor puro não vale para espelho
      // fora da origem). `perp` devolve a normal à esquerda, como no frame da parede.
      const u = norm(sub(applyTransform(t, add(g.center, g.u)), center));
      const n = perp(u);
      const flipFacing = mirror ? !g.flipFacing : g.flipFacing;
      for (const st of openingSymbolPaths({ ...g, center, u, n, flipFacing })) {
        const dash = st.dash ? { dashed: true } : {};
        for (let i = 1; i < st.pts.length; i++) out.push({ kind: 'line', a: st.pts[i - 1]!, b: st.pts[i]!, ...dash });
        // Anel fechado (folha pivotante): liga o último ponto ao primeiro.
        if (st.closed && st.pts.length > 2) out.push({ kind: 'line', a: st.pts[st.pts.length - 1]!, b: st.pts[0]!, ...dash });
      }
    }
  }
  return out;
}

/**
 * Move paredes. Num canto simples, a parede não selecionada que termina no ponto movido acompanha a extremidade
 * (como no Revit: o vizinho se estica); em nó de 3 ou mais paredes ela fica (ver `followingEnds`). Um passo de desfazer.
 */
export function moveWalls(env: ToolEnv, wallIds: Id[], d: Vec2, follow = true, invert = false): void {
  transformWalls(env, wallIds, { kind: 'translate', d }, 'Mover', follow, invert);
}

/**
 * Mover, girar ou espelhar paredes (`t`). Com `follow` (padrão), a parede não selecionada que termina numa
 * extremidade movida é esticada até o novo ponto dela; as ferramentas passam `follow = !disjoin` conforme a opção
 * "Desconectar" (ligada, a vizinha fica onde está e a ponta movida se solta). Um passo de desfazer, com o rótulo.
 */
export function transformWalls(env: ToolEnv, wallIds: Id[], t: Transform, label: string, follow = true, invert = false): void {
  const p = env.project();
  const plan = follow ? planWallFollowers(p, env.levelId(), wallIds, t, invert) : null;
  const commands: Command[] = [{ type: 'transform', ids: wallIds, transform: t }, ...(plan ? followerCommands(plan) : [])];
  const result = execWithHostedLoss(env, label, commands);
  if (plan?.released.size) env.say(translate(langOf(env), 'tl_msg_wall_zero_released', { label }));
  else if (result.status === 'cancelled') env.say(translate(langOf(env), 'tl_msg_nothing_changed'));
  else if (result.status === 'pending') env.say(translate(langOf(env), 'tl_msg_confirm_dialog'));
}

/** Desliza aberturas ao longo da parede anfitriã. */
export function slideOpenings(env: ToolEnv, openingIds: Id[], d: Vec2): void {
  const p = env.project();
  env.transaction(translate(langOf(env), 'tl_undo_move_opening'), () => {
    for (const id of openingIds) {
      const o = p.elements[id];
      if (!isOpening(o)) continue;
      const f = frameOfWall(p, o.hostId);
      if (!f) continue;
      env.exec({ type: 'updateElements', ids: [id], patch: { offset: o.offset + dot(d, f.u) } });
    }
  });
}

/** Copia paredes e/ou pisos (ids de ambos) com as aberturas hospedadas; devolve os novos ids de paredes e pisos. */
export function copyWalls(env: ToolEnv, ids: Id[], t: Transform): Id[] {
  const p = env.project();
  const idMap = makeIdMap(p, ids);
  env.exec({ type: 'transform', ids, transform: t, copy: { idMap } });
  return ids.map((id) => idMap[id]!).filter(Boolean);
}

export const lengthOf = (a: Vec2, b: Vec2): number => dist(a, b);
