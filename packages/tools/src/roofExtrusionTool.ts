import { add, mul, type Vec2 } from '@hestia/geom';
import { formatQuantity, makeRoof, newId, unitsOf, type ResolvedUnits, type RoofProfilePoint } from '@hestia/model';
import { defaultExtrusionProfile } from '@hestia/engine';
import { ToolBase } from './base.ts';
import { roofDirFor, defaultRoofDir, rectRing, roofAutoOffset, roofSlopeError } from './roofGeom.ts';
import { roofProblem } from './roofCheck.ts';
import type { PointerInfo } from './types.ts';

const fmt = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/** Mensagem de criação de um telhado por extrusão: número de trechos e flecha (a maior cota do perfil). */
export function extrusionCreatedMessage(profile: RoofProfilePoint[], u: ResolvedUnits): string {
  const flecha = Math.max(...profile.map((q) => q.z));
  return `Telhado em arco: ${profile.length - 1} trechos, flecha ${fmt(u, flecha)}. Ctrl+Z desfaz.`;
}



/**
 * Telhado por extrusão (A9, Revit: Roof by extrusion), como modo próprio: dois cliques definem o retângulo envolvente
 * da cobertura; o eixo da extrusão é o lado maior e o perfil padrão é um arco de 1 m de flecha sobre a transversal.
 * Não cria telhado sem águas: o motor confere antes e a barra de status diz o motivo.
 */
export class RoofExtrusionTool extends ToolBase {
  readonly id = 'roofextrusion';
  readonly label = 'Telhado por extrusão';
  override get hint(): string {
    return this.t('tl_hint_roof_extrusion');
  }
  private startPt: Vec2 | null = null;
  /** Tab: `true` usa o eixo transversal (o lado menor) em vez do lado maior. */
  private axisAlt = false;

  override start(): void {
    this.reset();
    this.axisAlt = false;
    this.env.say(this.t('tl_hint_roof_extrusion'));
  }

  protected reset(): void {
    this.startPt = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.startPt !== null;
  }

  /** Eixo da extrusão sobre o retângulo: o lado maior, ou o menor depois do Tab. */
  private axisOf(ring: Vec2[]): Vec2 {
    return roofDirFor('extrusion', defaultRoofDir(ring), this.axisAlt);
  }

  /** Tipo do telhado: o da barra de opções se existir no projeto, senão o primeiro. */
  private typeId(): string | null {
    const p = this.env.project();
    const want = this.env.options().roofTypeId;
    return want && p.roofTypes[want] ? want : (Object.keys(p.roofTypes)[0] ?? null);
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.items = [];
    const inf = this.snap(p);
    if (!this.startPt) {
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    const a = this.startPt;
    const c = inf.point;
    const ring = rectRing(a, c);
    const dir = this.axisOf(ring);
    const mid = mul(add(a, c), 0.5);
    const half = Math.max(Math.abs(c.x - a.x), Math.abs(c.y - a.y)) / 2;
    this.items.push({ kind: 'polygon', ring }, { kind: 'line', a: add(mid, mul(dir, -half)), b: add(mid, mul(dir, half)), dashed: true });
    this.items.push({ kind: 'label', at: c, text: `${fmt(unitsOf(this.env.project()), Math.abs(c.x - a.x))} × ${fmt(unitsOf(this.env.project()), Math.abs(c.y - a.y))}` });
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const inf = this.snap(p);
    if (!this.startPt) {
      this.startPt = inf.point;
      this.env.say('Canto inicial marcado: clique no canto oposto. Esc cancela.');
      return;
    }
    const a = this.startPt;
    const c = inf.point;
    if (Math.abs(c.x - a.x) < 0.01 || Math.abs(c.y - a.y) < 0.01) {
      this.env.say('Retângulo muito estreito: afaste o canto oposto.');
      return;
    }
    this.commit(rectRing(a, c));
    this.reset();
  }

  override tab(): void {
    this.axisAlt = !this.axisAlt;
    this.env.say(`Eixo da extrusão: ${this.axisAlt ? 'transversal (lado menor)' : 'longitudinal (lado maior)'}. Tab alterna.`);
  }

  /** Cria o telhado por extrusão no nível ativo, se o motor gerar águas para ele; senão diz o motivo e não cria. */
  private commit(boundary: Vec2[]): void {
    const o = this.env.options();
    const p = this.env.project();
    const levelId = this.env.levelId();
    const typeId = this.typeId();
    if (!typeId) {
      this.env.say('O projeto não tem tipo de telhado.');
      return;
    }
    // A inclinação não define o telhado por extrusão; a da barra só é guardada se for válida.
    const slope = o.roofSlope ?? 30;
    const slopePercent = roofSlopeError(slope) ? 30 : slope;
    const id = newId('t');
    const dir = this.axisOf(boundary);
    const roof = makeRoof({
      id,
      typeId,
      levelId,
      boundary,
      heightOffset: o.roofOffset ?? roofAutoOffset(p, levelId),
      shape: 'extrusion',
      slopePercent,
      dir,
      profile: defaultExtrusionProfile(boundary, dir),
      mark: o.placementMark ?? '',
      comments: o.placementComments ?? '',
    });
    const problem = roofProblem(p, [{ ...roof, order: p.nextOrder }]);
    if (problem) {
      this.env.say(this.t('tl_msg_roof_fail', { reason: problem }));
      return;
    }
    this.env.exec({ type: 'addRoof', roof });
    this.env.setSelection([id]);
    this.env.say(extrusionCreatedMessage(roof.profile, unitsOf(this.env.project())));
  }
}
