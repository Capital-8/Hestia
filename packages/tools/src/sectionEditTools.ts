import { dot, norm, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall } from '@hestia/engine';
import { formatQuantity, isOpening, isWall, openingSill, openingType, unitsOf, wallBaseElevation, type Command, type Opening } from '@hestia/model';
import { ToolBase } from './base.ts';
import type { PointerInfo, ToolEnv } from './types.ts';

/** Direção da linha do corte ativo em planta. */
function sectionDirection(env: ToolEnv): Vec2 | null {
  const sec = env.section?.();
  const view = sec ? env.project().views.find((v) => v.id === sec.id) : null;
  if (!view) return null;
  const d = sub(view.b, view.a);
  return Math.hypot(d.x, d.y) < 1e-9 ? null : norm(d);
}

function selectedOpenings(env: ToolEnv, walls: readonly string[]): Opening[] {
  const p = env.project();
  return env.selection().map((id) => p.elements[id]).filter((e): e is Opening => isOpening(e) && !walls.includes(e.hostId));
}

/**
 * Mover no corte: horizontal anda ao longo da linha do corte (parede inteira) ou ao longo da parede (abertura);
 * vertical move o peitoril da abertura. É um gesto único com um só undo.
 */
export class SectionMoveTool extends ToolBase {
  readonly id = 'move';
  readonly label = 'Mover';
  readonly hint = 'Mover no corte: arraste a seleção. Horizontal move a parede/abertura; vertical altera o peitoril da janela.';
  private startPoint: Vec2 | null = null;

  protected reset(): void { this.startPoint = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.startPoint !== null; }

  down(p: PointerInfo): void {
    this.startPoint = { ...p.raw };
    this.items = [];
    this.env.say('Arraste para mover; Esc cancela.');
  }

  drag(p: PointerInfo): void {
    if (!this.startPoint) return;
    this.items = [
      { kind: 'line', a: this.startPoint, b: p.raw, dashed: true },
      { kind: 'label', at: p.raw, text: `${formatQuantity(unitsOf(this.env.project()), 'length', p.raw.x - this.startPoint.x)} · ${formatQuantity(unitsOf(this.env.project()), 'length', p.raw.y - this.startPoint.y)}` },
    ];
  }

  up(p: PointerInfo): void {
    const start = this.startPoint;
    this.startPoint = null;
    this.items = [];
    if (!start) return;
    const dt = p.raw.x - start.x;
    const dz = p.raw.y - start.y;
    if (Math.abs(dt) < 1e-6 && Math.abs(dz) < 1e-6) return;
    const u = sectionDirection(this.env);
    if (!u) { this.env.say('Não foi possível ler a direção do corte.'); return; }
    const p0 = this.env.project();
    const selection = this.env.selection();
    const wallIds = selection.filter((id) => isWall(p0.elements[id]));
    const openings = selectedOpenings(this.env, wallIds);
    const commands: Command[] = [];
    if (wallIds.length && Math.abs(dt) > 1e-6) {
      commands.push({ type: 'transform', ids: wallIds, transform: { kind: 'translate', d: { x: u.x * dt, y: u.y * dt } } });
    }
    for (const o of openings) {
      const f = frameOfWall(p0, o.hostId);
      if (!f) continue;
      const patch: Partial<Opening> = {};
      if (Math.abs(dt) > 1e-6) patch.offset = o.offset + dot({ x: u.x * dt, y: u.y * dt }, f.u);
      if (Math.abs(dz) > 1e-6) patch.sillOverride = Math.max(0, openingSill(openingType(p0, o), o) + dz);
      if (Object.keys(patch).length) commands.push({ type: 'updateElements', ids: [o.id], patch });
    }
    if (!commands.length) {
      this.env.say(wallIds.length ? 'Movimento vertical de parede ainda não disponível; use as cotas/propriedades.' : 'Selecione uma parede ou abertura para mover.');
      return;
    }
    this.env.transaction('Mover no corte', () => { for (const c of commands) this.env.exec(c); });
    this.env.say('Movido no corte. Ctrl+Z desfaz.');
  }

  override click(): void { /* o gesto é arrastado; clique sem arrasto não move */ }
}

/**
 * Alinhar no corte: clique numa cota/nível de referência. Sem Shift alinha o peitoril; com Shift alinha o topo.
 * As referências vêm do snap da seção (níveis, peitoril/topo de outra abertura, arestas).
 */
export class SectionAlignTool extends ToolBase {
  readonly id = 'align';
  readonly label = 'Alinhar';
  readonly hint = 'Alinhar no corte: clique numa cota/aresta de referência. Shift alinha o topo; sem Shift alinha o peitoril.';
  private ref: Vec2 | null = null;

  protected reset(): void { this.ref = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.ref !== null; }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    const inf = this.snap(p);
    this.ref = inf.point;
    this.items = [
      { kind: 'line', a: { x: this.raw.x - 2, y: inf.point.y }, b: { x: this.raw.x + 2, y: inf.point.y }, dashed: true },
      { kind: 'point', at: inf.point },
    ];
  }

  override click(p: PointerInfo): void {
    const inf = this.snap(p);
    const p0 = this.env.project();
    const id = this.env.selection().find((x) => isOpening(p0.elements[x]));
    const opening = id ? p0.elements[id] : undefined;
    if (!isOpening(opening)) { this.env.say('Selecione uma abertura para alinhar no corte.'); return; }
    const wall = p0.elements[opening.hostId];
    if (!isWall(wall)) return;
    const type = openingType(p0, opening);
    const base = wallBaseElevation(p0, wall);
    const sill = openingSill(type, opening);
    const cmd: Command | null = p.shift
      ? { type: 'updateElements', ids: [opening.id], patch: { heightOverride: Math.max(0.1, Math.round((inf.point.y - base - sill) * 1000) / 1000) } }
      : opening.kind === 'window'
        ? { type: 'updateElements', ids: [opening.id], patch: { sillOverride: Math.max(0, Math.round((inf.point.y - base) * 1000) / 1000) } }
        : null;
    if (!cmd) { this.env.say('Porta só alinha o topo; use Shift.'); return; }
    this.env.exec(cmd);
    this.env.say(p.shift ? 'Topo alinhado. Ctrl+Z desfaz.' : 'Peitoril alinhado. Ctrl+Z desfaz.');
    this.reset();
  }
}
