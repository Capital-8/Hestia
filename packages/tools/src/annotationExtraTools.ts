import {
  coordenadaDaBase,
  elevacaoDaBase,
  spotFamilyFor,
  defaultNorthArrowFamilyIdOf,
  defaultRevisionCloudFamilyIdOf,
  defaultSpotFamilyIdOf,
  formatQuantity,
  newId,
  unitsOf,
  type Id,
  type Project,
  type RevisionCloud,
  type SpotAnnotation,
  type SymbolAnnotation,
} from '@hestia/model';
import { add, type Vec2 } from '@hestia/geom';
import { addSectionRevisionCloud, addSectionSpot, addSectionSymbol, ToolBase, viewPlanId } from './base.ts';
import { pickAt } from './pick.ts';
import type { PointerInfo } from './types.ts';

function elevationAt(p: Project, levelId: Id, pt: Vec2, mpp: number): number {
  const base = p.levels.find((l) => l.id === levelId)?.elevation ?? 0;
  const hit = pickAt(p, levelId, pt, mpp);
  const el = hit ? p.elements[hit.id] : undefined;
  if (!el) return base;
  if ('heightOffset' in el && typeof el.heightOffset === 'number') return base + el.heightOffset;
  if (el.kind === 'wall') return base + (el.baseOffset ?? 0);
  return base;
}

function formatSignedLength(p: Project, valueM: number): string {
  const u = unitsOf(p);
  const sign = valueM > 1e-4 ? '+' : valueM < -1e-4 ? '-' : '';
  return `${sign}${formatQuantity(u, 'length', Math.abs(valueM))}`;
}

/** Texto da prévia da elevação: a MESMA conta do desenho (base da família escolhida, com a Localização do projeto). */
function rotuloElevacao(p: Project, levelId: Id, z: number, familyId: Id | null | undefined): string {
  const fam = spotFamilyFor(p.settings, 'elevation', familyId ?? undefined);
  const nivel = p.levels.find((l) => l.id === levelId)?.elevation ?? 0;
  return `EL ${fam.prefix}${formatSignedLength(p, elevacaoDaBase(p, fam.base, z, nivel))}`;
}

function leaderWithElbow(target: Vec2, at: Vec2): Vec2[] {
  const dx = at.x - target.x;
  const elbowX = Math.abs(dx) > 0.15 ? at.x - Math.sign(dx) * Math.min(0.25, Math.abs(dx) * 0.4) : target.x;
  return [target, { x: elbowX, y: at.y }, at];
}

/**
 * Cota de elevação (Revit: Spot Elevation). Funciona em planta e em corte/elevação (no corte lê Z diretamente de `pt.y`).
 */
export class SpotElevationTool extends ToolBase {
  readonly id = 'spotElevation';
  readonly label = 'Cota de elevação';
  override get hint(): string {
    return 'Clique no ponto para medir a elevação (Z).';
  }
  private target: Vec2 | null = null;
  private elev = 0;

  protected reset(): void {
    this.target = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.target !== null;
  }

  private isSection(): boolean {
    return Boolean(this.env.section?.() || this.env.isSectionView?.());
  }

  private measureZ(pt: Vec2): number {
    if (this.isSection()) return pt.y;
    return elevationAt(this.env.project(), this.env.levelId(), pt, this.env.metersPerPixel());
  }

  override move(p: PointerInfo): void {
    const pt = this.snap(p).point;
    if (!this.target) {
      const z = this.measureZ(pt);
      this.items = [
        { kind: 'point', at: pt },
        { kind: 'label', at: pt, text: rotuloElevacao(this.env.project(), this.env.levelId(), z, this.env.options().spotElevationFamilyId) },
      ];
      return;
    }
    const pts = leaderWithElbow(this.target, pt);
    this.items = [
      { kind: 'line', a: pts[0]!, b: pts[1]!, dashed: true },
      { kind: 'line', a: pts[1]!, b: pts[2]!, dashed: true },
      { kind: 'label', at: pt, text: rotuloElevacao(this.env.project(), this.env.levelId(), this.elev, this.env.options().spotElevationFamilyId) },
    ];
  }

  override click(p: PointerInfo): void {
    const pt = this.snap(p).point;
    if (!this.target) {
      this.target = pt;
      this.elev = this.measureZ(pt);
      this.env.say('Clique para posicionar a cota de elevação.');
      return;
    }
    const pr = this.env.project();
    const familyId = this.env.options().spotElevationFamilyId ?? defaultSpotFamilyIdOf(pr.settings, 'elevation');
    const spot: SpotAnnotation = {
      id: newId('spot'),
      kind: 'elevation',
      target: { ...this.target },
      at: { ...pt },
      showLeader: true,
      familyId,
      ...(this.isSection() ? {} : { z: this.elev }),
    };
    if (!addSectionSpot(this.env, spot)) {
      this.env.exec({ type: 'addSpot', levelId: this.env.levelId(), planId: viewPlanId(this.env), item: spot });
    }
    this.reset();
    this.env.say('Cota de elevação inserida.');
  }
}

/** Texto da prévia da coordenada de ponto (`N … / E …`), com as coordenadas exibidas. */
function rotuloCoordenada(p: Project, pt: Vec2, familyId: Id | null | undefined): string {
  const c = coordenadaDaBase(p, spotFamilyFor(p.settings, 'coordinate', familyId ?? undefined).base, pt);
  return `N ${formatSignedLength(p, c.norte)} / E ${formatSignedLength(p, c.leste)}`;
}

/**
 * Coordenada de ponto (Revit: Spot Coordinate). Lê N (Y) e E (X) no ponto clicado e posiciona o símbolo paramétrico.
 */
export class SpotCoordinateTool extends ToolBase {
  readonly id = 'spotCoordinate';
  readonly label = 'Coordenada de ponto';
  override get hint(): string {
    return 'Clique no ponto para medir as coordenadas (N/E).';
  }
  private target: Vec2 | null = null;

  protected reset(): void {
    this.target = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.target !== null;
  }

  override move(p: PointerInfo): void {
    const pt = this.snap(p).point;
    if (!this.target) {
      this.items = [
        { kind: 'point', at: pt },
        { kind: 'label', at: pt, text: rotuloCoordenada(this.env.project(), pt, this.env.options().spotCoordinateFamilyId) },
      ];
      return;
    }
    const pts = leaderWithElbow(this.target, pt);
    this.items = [
      { kind: 'line', a: pts[0]!, b: pts[1]!, dashed: true },
      { kind: 'line', a: pts[1]!, b: pts[2]!, dashed: true },
      { kind: 'label', at: pt, text: rotuloCoordenada(this.env.project(), this.target, this.env.options().spotCoordinateFamilyId) },
    ];
  }

  override click(p: PointerInfo): void {
    const pt = this.snap(p).point;
    if (!this.target) {
      this.target = pt;
      this.env.say('Clique para posicionar a coordenada de ponto.');
      return;
    }
    const pr = this.env.project();
    const familyId = this.env.options().spotCoordinateFamilyId ?? defaultSpotFamilyIdOf(pr.settings, 'coordinate');
    const spot: SpotAnnotation = {
      id: newId('spot'),
      kind: 'coordinate',
      target: { ...this.target },
      at: { ...pt },
      showLeader: true,
      familyId,
    };
    if (!addSectionSpot(this.env, spot)) {
      this.env.exec({ type: 'addSpot', levelId: this.env.levelId(), planId: viewPlanId(this.env), item: spot });
    }
    this.reset();
    this.env.say('Coordenada de ponto inserida.');
  }
}

/**
 * Seta norte (Revit: North Arrow). Insere símbolo único paramétrico vinculado à família de Norte.
 */
export class NorthArrowTool extends ToolBase {
  readonly id = 'northArrow';
  readonly label = 'Seta norte';
  override get hint(): string {
    return 'Clique para posicionar a seta norte.';
  }

  protected reset(): void {
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return false;
  }

  private segsAt(c: Vec2): Array<[Vec2, Vec2]> {
    const scale = this.env.project().levels.find((l) => l.id === this.env.levelId())?.graphics?.scale ?? 50;
    const r = (scale / 1000) * 6;
    const out: Array<[Vec2, Vec2]> = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      out.push([
        add(c, { x: Math.cos(a0) * r, y: Math.sin(a0) * r }),
        add(c, { x: Math.cos(a1) * r, y: Math.sin(a1) * r }),
      ]);
    }
    out.push(
      [add(c, { x: 0, y: -r * 0.9 }), add(c, { x: 0, y: r * 1.15 })],
      [add(c, { x: -r * 0.45, y: r * 0.35 }), add(c, { x: 0, y: r * 1.15 })],
      [add(c, { x: r * 0.45, y: r * 0.35 }), add(c, { x: 0, y: r * 1.15 })],
    );
    return out;
  }

  override move(p: PointerInfo): void {
    const pt = this.snap(p).point;
    const segs = this.segsAt(pt);
    this.items = [
      ...segs.map(([a, b]) => ({ kind: 'line' as const, a, b })),
      { kind: 'label', at: add(pt, { x: 0, y: 0.35 }), text: 'N' },
    ];
  }

  override click(p: PointerInfo): void {
    const pt = this.snap(p).point;
    const pr = this.env.project();
    const familyId = this.env.options().northArrowFamilyId ?? defaultNorthArrowFamilyIdOf(pr.settings);
    const symbol: SymbolAnnotation = {
      id: newId('sym'),
      kind: 'northArrow',
      at: { ...pt },
      rotation: 0,
      familyId,
    };
    if (!addSectionSymbol(this.env, symbol)) {
      this.env.exec({ type: 'addSymbol', levelId: this.env.levelId(), planId: viewPlanId(this.env), item: symbol });
    }
    this.env.say('Seta norte inserida.');
  }
}

/** Constrói segmentos de prévia da nuvem de revisão (arcos abaulados para fora) ao redor do retângulo a–b. */
function cloudPreviewSegments(a: Vec2, b: Vec2): Array<[Vec2, Vec2]> {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 0.05 || h < 0.05) return [];
  const lobe = Math.max(0.25, Math.min(0.8, Math.min(w, h) / 4));
  const out: Array<[Vec2, Vec2]> = [];
  const addEdge = (p0: Vec2, p1: Vec2, outN: Vec2): void => {
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const count = Math.max(2, Math.round(len / lobe));
    const step = 1 / count;
    const amp = (len / count) * 0.35;
    for (let i = 0; i < count; i++) {
      const t0 = i * step;
      const t1 = (i + 1) * step;
      const s = { x: p0.x + (p1.x - p0.x) * t0, y: p0.y + (p1.y - p0.y) * t0 };
      const e = { x: p0.x + (p1.x - p0.x) * t1, y: p0.y + (p1.y - p0.y) * t1 };
      const q1 = { x: s.x + (e.x - s.x) * 0.25 + outN.x * amp * 0.75, y: s.y + (e.y - s.y) * 0.25 + outN.y * amp * 0.75 };
      const q2 = { x: s.x + (e.x - s.x) * 0.5 + outN.x * amp, y: s.y + (e.y - s.y) * 0.5 + outN.y * amp };
      const q3 = { x: s.x + (e.x - s.x) * 0.75 + outN.x * amp * 0.75, y: s.y + (e.y - s.y) * 0.75 + outN.y * amp * 0.75 };
      out.push([s, q1], [q1, q2], [q2, q3], [q3, e]);
    }
  };
  addEdge({ x: minX, y: minY }, { x: maxX, y: minY }, { x: 0, y: -1 });
  addEdge({ x: maxX, y: minY }, { x: maxX, y: maxY }, { x: 1, y: 0 });
  addEdge({ x: maxX, y: maxY }, { x: minX, y: maxY }, { x: 0, y: 1 });
  addEdge({ x: minX, y: maxY }, { x: minX, y: minY }, { x: -1, y: 0 });
  return out;
}

/**
 * Nuvem de revisão (Revit: Revision Cloud). Dois cliques opostos criam uma entidade paramétrica única.
 */
export class RevisionCloudTool extends ToolBase {
  readonly id = 'revisionCloud';
  readonly label = 'Nuvem de revisão';
  override get hint(): string {
    return 'Clique nos dois cantos opostos da nuvem de revisão.';
  }
  private first: Vec2 | null = null;

  protected reset(): void {
    this.first = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.first !== null;
  }

  override move(p: PointerInfo): void {
    const pt = this.snap(p).point;
    if (!this.first) {
      this.items = [{ kind: 'point', at: pt }];
      return;
    }
    this.items = cloudPreviewSegments(this.first, pt).map(([a, b]) => ({ kind: 'line' as const, a, b }));
  }

  override click(p: PointerInfo): void {
    const pt = this.snap(p).point;
    if (!this.first) {
      this.first = pt;
      this.env.say('Clique no canto oposto da nuvem de revisão.');
      return;
    }
    const minX = Math.min(this.first.x, pt.x);
    const maxX = Math.max(this.first.x, pt.x);
    const minY = Math.min(this.first.y, pt.y);
    const maxY = Math.max(this.first.y, pt.y);
    if (maxX - minX < 0.05 || maxY - minY < 0.05) return;
    const pr = this.env.project();
    const familyId = this.env.options().revisionCloudFamilyId ?? defaultRevisionCloudFamilyIdOf(pr.settings);
    const cloud: RevisionCloud = {
      id: newId('rc'),
      points: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
      closed: true,
      familyId,
    };
    if (!addSectionRevisionCloud(this.env, cloud)) {
      this.env.exec({ type: 'addRevisionCloud', levelId: this.env.levelId(), planId: viewPlanId(this.env), item: cloud });
    }
    this.reset();
    this.env.say('Nuvem de revisão inserida.');
  }
}
