import { arcFromSagitta, dist, type Vec2 } from '@hestia/geom';
import { frameOfWall, openingExtents } from '@hestia/engine';
import {
  isWall,
  openingOffsetAfterEnds,
  openingTypeById,
  openingsOfWall,
  type Command,
  type Id,
  type Opening,
  type Project,
  type Wall,
} from '@hestia/model';
import { t as translate, type Lang } from './i18n.ts';

const EPS = 1e-6;

/** Pontas propostas para uma parede: o que ainda não veio no comando fica como está. */
export interface EndsPatch {
  a?: Vec2;
  b?: Vec2;
  sag?: number;
}

/** Abertura hospedada que ficaria fora da parede depois do ajuste (extensão real, não só o centro). */
export interface HostedLoss {
  id: Id;
  wallId: Id;
  kind: Opening['kind'];
  /** Marca da abertura; sem marca, o código do tipo; sem ele, "Porta"/"Janela". */
  label: string;
}

/** Marca/nome curto da abertura para as mensagens e a lista do diálogo. */
export function openingLabel(project: Project, opening: Opening): string {
  const mark = opening.mark.trim();
  if (mark) return mark;
  const code = openingTypeById(project, opening.typeId)?.code?.trim();
  if (code) return code;
  return opening.kind === 'door' ? 'Porta' : 'Janela';
}

/** Reúne as pontas que os comandos mudam (`setWallEnds`, `updateElements` com a/b/sag e lotes). */
export function endsFromCommands(commands: readonly Command[]): Map<Id, EndsPatch> {
  const out = new Map<Id, EndsPatch>();
  const merge = (id: Id, patch: EndsPatch): void => {
    out.set(id, { ...out.get(id), ...patch });
  };
  for (const c of commands) {
    if (c.type === 'setWallEnds') merge(c.id, { ...(c.a ? { a: c.a } : {}), ...(c.b ? { b: c.b } : {}) });
    else if (c.type === 'updateElements') {
      const patch = c.patch as Partial<Wall>;
      const ends: EndsPatch = {};
      if ('a' in c.patch && patch.a) ends.a = patch.a;
      if ('b' in c.patch && patch.b) ends.b = patch.b;
      if ('sag' in c.patch && patch.sag !== undefined) ends.sag = patch.sag;
      if (ends.a || ends.b || ends.sag !== undefined) for (const id of c.ids) merge(id, ends);
    } else if (c.type === 'batch') {
      for (const [id, patch] of endsFromCommands(c.commands)) merge(id, patch);
    }
  }
  return out;
}

/** Comprimento do eixo depois do ajuste: arco nas paredes curvas, reta nas demais. */
function nextLength(wall: Wall, patch: EndsPatch): number {
  const a = patch.a ?? wall.a;
  const b = patch.b ?? wall.b;
  const sag = patch.sag ?? wall.sag;
  const arc = sag ? arcFromSagitta(a, b, sag) : null;
  return arc ? arc.length : dist(a, b);
}

/**
 * Aberturas que sairiam da parede com as pontas propostas. Usa a mesma compensação de `offset` dos comandos (a
 * abertura não anda ao esticar/encurtar) e a extensão real da esquadria: uma abertura parcialmente fora também entra.
 */
export function hostedLoss(project: Project, patches: ReadonlyMap<Id, EndsPatch>): HostedLoss[] {
  const lost: HostedLoss[] = [];
  for (const [wallId, patch] of patches) {
    const wall = project.elements[wallId];
    if (!isWall(wall)) continue;
    const frame = frameOfWall(project, wallId);
    if (!frame) continue;
    const length = nextLength(wall, patch);
    for (const opening of openingsOfWall(project, wallId)) {
      const half = openingExtents(project, opening, frame, 1).frame;
      const offset = openingOffsetAfterEnds(wall, opening.offset, patch);
      if (offset - half < -EPS || offset + half > length + EPS) {
        lost.push({ id: opening.id, wallId, kind: opening.kind, label: openingLabel(project, opening) });
      }
    }
  }
  return lost;
}

/** As aberturas que os comandos deixariam fora das paredes (mesma regra de `hostedLoss`). */
export function hostedLossOfCommands(project: Project, commands: readonly Command[]): HostedLoss[] {
  return hostedLoss(project, endsFromCommands(commands));
}

/** Texto único do aviso, com a lista de marcas na ordem em que as aberturas entram na parede. */
export function hostedLossMessage(losses: readonly HostedLoss[], lang: Lang = 'pt'): string {
  const list = losses.map((l) => l.label).join(', ');
  return translate(lang, 'tl_msg_hosted_loss', { n: losses.length, list });
}
