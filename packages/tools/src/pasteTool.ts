import { len, type Transform, type Vec2 } from '@hestia/geom';
import { isGeneric, unitsOf, type Element, type Id, type Project } from '@hestia/model';
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

/**
 * Centro da caixa de elementos que não geram fantasma próprio (forro e objeto genérico): sem ele, um buffer só com
 * essas categorias não teria âncora e o clique não colaria nada.
 */
function fallbackCenter(c: ClipBuffer): Vec2 | null {
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
  for (const e of c.ceilings ?? []) for (const q of e.boundary) add(q);
  for (const g of c.generics ?? []) {
    if (g.outline) for (const q of g.outline) add(q);
    else for (let i = 0; i + 1 < g.mesh.positions.length; i += 3) add({ x: g.mesh.positions[i]!, y: g.mesh.positions[i + 1]! });
  }
  return Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null;
}

/** Elementos que o buffer leva (as aberturas entram na prévia do projeto, mas não geram faixa própria). */
function elementsOf(c: ClipBuffer): Element[] {
  return [
    ...c.walls,
    ...c.openings,
    ...c.floors,
    ...c.slabs,
    ...(c.ceilings ?? []),
    ...c.roofs,
    ...(c.stairs ?? []),
    ...(c.ramps ?? []),
    ...(c.rooms ?? []),
    ...(c.generics ?? []),
    ...(c.cad ?? []),
  ];
}

/** Ids dos elementos que recebem a translação do Colar. */
function idsOf(c: ClipBuffer): Id[] {
  return [
    ...c.walls.map((e) => e.id),
    ...c.floors.map((e) => e.id),
    ...c.slabs.map((e) => e.id),
    ...(c.ceilings ?? []).map((e) => e.id),
    ...c.roofs.map((e) => e.id),
    ...(c.stairs ?? []).map((e) => e.id),
    ...(c.ramps ?? []).map((e) => e.id),
    ...(c.rooms ?? []).map((e) => e.id),
    ...(c.generics ?? []).map((e) => e.id),
    ...(c.cad ?? []).map((e) => e.id),
  ];
}

/**
 * Colar com prévia: o conteúdo copiado/recortado acompanha o cursor e o clique grava no ponto escolhido.
 * O ponto de referência é o centro da caixa do conteúdo; o deslocamento é aplicado a tudo num só passo de desfazer.
 */
export class PasteTool extends ToolBase {
  readonly id = 'paste';
  readonly label = 'Colar';
  override get hint(): string {
    return this.t('tl_hint_paste');
  }
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
    this.anchor = centerOf(ghostBands(this.previewProject, this.ids, zero)) ?? fallbackCenter(clip);
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
      this.env.say(this.t('tl_msg_paste_empty'));
      return;
    }
      // Decisão 0044: colar também não põe parede em cima de outra (nem em cima da própria origem).
      const paredes = this.clip.walls.map((w) => ({ ...w, levelId: this.env.levelId() }));
      const conflito = copiesOverlap(this.env.project(), paredes, [{ kind: 'translate', d: this.delta }]);
      if (conflito) {
        notifyWallOverlap(this.env, conflito);
        return;
      }
      const ids = [...r.wallIds, ...r.openingIds, ...r.floorIds, ...r.slabIds, ...r.ceilingIds, ...r.roofIds, ...r.stairIds, ...r.rampIds, ...r.roomIds, ...r.genericIds, ...r.cadIds];
    this.env.transaction('Colar', () => {
      this.env.exec(r.command);
      if (len(this.delta) > 1e-9) {
        this.env.exec({ type: 'transform', ids, transform: { kind: 'translate', d: this.delta } });
        // O comando `transform` ainda não move objetos genéricos (malha em coordenadas de mundo): translada aqui.
        this.translateGenerics(r.genericIds);
      }
    });
    this.env.setSelection(ids);
    this.env.say(`${ids.length} elemento(s) colado(s). Ctrl+Z desfaz.`);
    this.env.done();
  }

  /** Translada a malha (e o contorno em planta) dos objetos genéricos colados pelo deslocamento do cursor. */
  private translateGenerics(ids: readonly Id[]): void {
    const d = this.delta;
    if (ids.length === 0 || len(d) <= 1e-9) return;
    for (const id of ids) {
      const g = this.env.project().elements[id];
      if (!isGeneric(g)) continue;
      const positions = g.mesh.positions.slice();
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = positions[i]! + d.x;
        positions[i + 1] = positions[i + 1]! + d.y;
      }
      this.env.exec({
        type: 'updateGeneric',
        id,
        patch: {
          mesh: { positions, indices: g.mesh.indices },
          ...(g.outline ? { outline: g.outline.map((q) => ({ x: q.x + d.x, y: q.y + d.y })) } : {}),
        },
      });
    }
  }
}
