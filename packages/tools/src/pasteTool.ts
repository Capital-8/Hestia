import { len, type Transform, type Vec2 } from '@hestia/geom';
import { unitsOf, type Element, type Id, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import { pasteAlignedCommand, type ClipBuffer } from './clipboard.ts';
import { ghostBands } from './edit.ts';
import { fmtDisplacement } from './transformTools.ts';
import { copiesOverlap, notifyWallOverlap } from './wallOverlapGuard.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/**
 * Buffer pendente do Colar. A interface grava aqui o conteúdo de Copiar/Recortar e ativa a ferramenta `paste`;
 * o desenho da prévia e o comando de colar usam este mesmo buffer.
 */
let pendente: ClipBuffer | null = null;

/** Define (ou limpa, com null) o buffer que o próximo Colar vai posicionar. */
export function setPasteClip(clip: ClipBuffer | null): void {
  pendente = clip;
}

/** Buffer atual do Colar (a interface usa para saber se há o que colar). */
export function pasteClip(): ClipBuffer | null {
  return pendente;
}

/** Centro da caixa dos itens de prévia: é o ponto do conteúdo que segue o cursor. */
function centerOf(items: readonly PreviewItem[]): Vec2 | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (p: Vec2): void => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const it of items) {
    if (it.kind === 'wallBand' || it.kind === 'line' || it.kind === 'sectionLine') {
      add(it.a);
      add(it.b);
    } else if (it.kind === 'polygon') {
      for (const q of it.ring) add(q);
    } else if (it.kind === 'point') {
      add(it.at);
    }
  }
  return Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null;
}

/** Elementos que o buffer leva (as aberturas entram na prévia do projeto, mas não geram faixa própria). */
function elementsOf(c: ClipBuffer): Element[] {
  return [...c.walls, ...c.openings, ...c.floors, ...c.slabs, ...c.roofs, ...(c.stairs ?? []), ...(c.ramps ?? []), ...(c.rooms ?? [])];
}

/** Ids dos elementos que recebem a translação do Colar. */
function idsOf(c: ClipBuffer): Id[] {
  return [
    ...c.walls.map((e) => e.id),
    ...c.floors.map((e) => e.id),
    ...c.slabs.map((e) => e.id),
    ...c.roofs.map((e) => e.id),
    ...(c.stairs ?? []).map((e) => e.id),
    ...(c.ramps ?? []).map((e) => e.id),
    ...(c.rooms ?? []).map((e) => e.id),
  ];
}

/**
 * Colar com prévia: o conteúdo copiado/recortado acompanha o cursor e o clique grava no ponto escolhido.
 * O ponto de referência é o centro da caixa do conteúdo; o deslocamento é aplicado a tudo num só passo de desfazer.
 */
export class PasteTool extends ToolBase {
  readonly id = 'paste';
  readonly label = 'Colar';
  readonly hint = 'Colar: clique para posicionar o conteúdo copiado. Esc cancela.';
  private clip: ClipBuffer | null = null;
  /** Projeto com os elementos do buffer numa cópia rasa: a prévia não altera o modelo. */
  private previewProject: Project | null = null;
  private ids: Id[] = [];
  private anchor: Vec2 | null = null;
  private delta: Vec2 = { x: 0, y: 0 };

  override start(): void {
    this.reset();
    const clip = pendente;
    this.clip = clip;
    if (!clip) {
      this.env.done();
      this.env.say('Nada copiado. Selecione e use Copiar ou Ctrl+C.');
      return;
    }
    const base = this.env.project();
    const elements = { ...base.elements };
    for (const e of elementsOf(clip)) elements[e.id] = e;
    this.previewProject = { ...base, elements };
    this.ids = idsOf(clip);
    const zero: Transform = { kind: 'translate', d: { x: 0, y: 0 } };
    this.anchor = centerOf(ghostBands(this.previewProject, this.ids, zero));
    this.env.say(this.hint);
  }

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.clip = null;
    this.previewProject = null;
    this.ids = [];
    this.anchor = null;
    this.delta = { x: 0, y: 0 };
  }

  /** Colar é de um clique só: Esc sai direto para Selecionar, sem um passo intermediário. */
  protected busy(): boolean {
    return false;
  }

  override move(p: PointerInfo): void {
    this.items = [];
    if (!this.previewProject || !this.anchor) return;
    const inf = this.snap(p);
    this.delta = { x: inf.point.x - this.anchor.x, y: inf.point.y - this.anchor.y };
    const t: Transform = { kind: 'translate', d: this.delta };
    this.items.push(...ghostBands(this.previewProject, this.ids, t));
    this.items.push({ kind: 'point', at: inf.point }, { kind: 'label', at: inf.point, text: fmtDisplacement(unitsOf(this.env.project()), this.delta) });
  }

  override click(p: PointerInfo): void {
    if (!this.clip || !this.previewProject || !this.anchor) {
      this.env.done();
      return;
    }
    const inf = this.snap(p);
    this.delta = { x: inf.point.x - this.anchor.x, y: inf.point.y - this.anchor.y };
    const r = pasteAlignedCommand(this.env.project(), this.clip, this.env.levelId());
    if (!r) {
      this.env.say('Não há o que colar neste nível.');
      return;
    }
    // Decisão 0044: colar também não põe parede em cima de outra (nem em cima da própria origem).
    const paredes = this.clip.walls.map((w) => ({ ...w, levelId: this.env.levelId() }));
    const conflito = copiesOverlap(this.env.project(), paredes, [{ kind: 'translate', d: this.delta }]);
    if (conflito) {
      notifyWallOverlap(this.env, conflito);
      return;
    }
    const ids = [...r.wallIds, ...r.openingIds, ...r.floorIds, ...r.slabIds, ...r.roofIds, ...r.stairIds, ...r.rampIds, ...r.roomIds];
    this.env.transaction('Colar', () => {
      this.env.exec(r.command);
      if (len(this.delta) > 1e-9) this.env.exec({ type: 'transform', ids, transform: { kind: 'translate', d: this.delta } });
    });
    this.env.setSelection(ids);
    this.env.say(`${ids.length} elemento(s) colado(s). Ctrl+Z desfaz.`);
    this.env.done();
  }
}
