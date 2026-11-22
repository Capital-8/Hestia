import { levelFrames, openingTagPoint, pointAt } from '@hestia/engine';
import { defaultTagFamilyIdOf, newId, type Id, type Project } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { addSectionTag, ToolBase, viewPlanId } from './base.ts';
import { pickAt } from './pick.ts';
import type { PointerInfo } from './types.ts';

/** Centro de ancoragem da linha de chamada: parede (ponto médio real, inclusive em arco), ambiente (ponto) ou polígono. */
function anchorOf(p: Project, id: Id): Vec2 | null {
  const e = p.elements[id];
  if (!e) return null;
  if (e.kind === 'wall') {
    if (Math.abs(e.sag) > 1e-4) {
      const f = levelFrames(p, e.levelId).find((x) => x.wall.id === e.id);
      if (f) return pointAt(f, f.length / 2, f.sMid);
    }
    return { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
  }
  if (e.kind === 'room') return e.point;
  if ('boundary' in e && e.boundary.length) return { x: e.boundary.reduce((s, q) => s + q.x, 0) / e.boundary.length, y: e.boundary.reduce((s, q) => s + q.y, 0) / e.boundary.length };
  return null;
}

/**
 * Etiqueta associativa (Revit: Tag by Category). Clique DIRETO no elemento: não precisa selecioná-lo antes. A etiqueta
 * nasce no ponto clicado com a família escolhida na barra de opções; numa porta ou janela, na posição inteligente
 * (do lado oposto ao arco). Sem elemento sob o cursor, usa o elemento selecionado.
 */
export class TagTool extends ToolBase {
  readonly id = 'tag';
  readonly label = 'Etiqueta';
  override get hint(): string {
    return this.t('tl_hint_tag');
  }
  protected reset(): void { this.items = []; this.inf = null; }
  protected busy(): boolean { return false; }

  /** Elemento a etiquetar: o que está sob o cursor na planta; senão o selecionado (corte, elevação e 3D). */
  private hostAt(p: PointerInfo): Id | null {
    const project = this.env.project();
    const hit = pickAt(project, this.env.levelId(), p.raw, this.env.metersPerPixel(), this.env);
    if (hit) return hit.id;
    return this.env.selection().find((id) => project.elements[id]) ?? null;
  }

  override move(p: PointerInfo): void {
    const point = this.snap(p).point;
    const host = this.hostAt(p);
    const project = this.env.project();
    const anchor = host ? anchorOf(project, host) : null;
    this.items = anchor && this.env.options().tagLeader !== false ? [{ kind: 'line', a: anchor, b: point, dashed: true }] : [{ kind: 'point', at: point }];
  }

  override click(p: PointerInfo): void {
    const hostId = this.hostAt(p);
    if (!hostId) { this.env.say('Clique em um elemento do modelo para etiquetá-lo.'); return; }
    const project = this.env.project();
    const host = project.elements[hostId];
    const onOpening = host !== undefined && (host.kind === 'door' || host.kind === 'window');
    const at = (onOpening ? openingTagPoint(project, hostId) : null) ?? this.snap(p).point;
    const options = this.env.options();
    const item = {
      id: newId('tag'),
      hostId,
      at,
      property: options.tagProperty ?? 'type',
      familyId: options.tagFamilyId ?? defaultTagFamilyIdOf(project.settings),
      leader: onOpening ? false : options.tagLeader !== false,
      orientation: options.tagOrientation ?? 'horizontal',
    } as const;
    if (!addSectionTag(this.env, item)) this.env.exec({ type: 'addTag', levelId: this.env.levelId(), planId: viewPlanId(this.env), item });
    this.env.say(this.t('tl_msg_tag_done'));
  }
}
