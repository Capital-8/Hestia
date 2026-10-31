import { dot, norm, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall } from '@hestia/engine';
import { formatQuantity, isOpening, isWall, openingSill, openingType, unitsOf, wallBaseElevation, type Command, type Id, type Opening } from '@hestia/model';
import { ToolBase } from './base.ts';
import type { Inference, PointerInfo, PreviewItem, SnapKind, ToolEnv } from './types.ts';

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

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Nome curto da captura, para o status da referência. */
const SNAP_KIND_LABEL: Partial<Record<SnapKind, string>> = {
  endpoint: 'ponta',
  midpoint: 'ponto médio',
  intersection: 'interseção',
  face: 'face',
  core: 'núcleo',
  nearest: 'aresta',
  alignment: 'alinhamento',
  perpendicular: 'perpendicular',
  center: 'centro',
  tangent: 'tangente',
  grid: 'grade',
  ortho: 'ortogonal',
  polar: 'polar',
};

/** Cota no idioma/unidades do projeto, com sinal explícito no rótulo da referência. */
function cotaText(env: ToolEnv, z: number): string {
  const text = formatQuantity(unitsOf(env.project()), 'length', z);
  return z >= 0 ? `+${text}` : text;
}

/**
 * Trecho horizontal da guia da referência: do início ao fim da vista de corte/elevação. Sem a vista no projeto
 * (ambiente parcial), usa um trecho em volta do cursor para a guia continuar visível.
 */
function guideSpanX(env: ToolEnv, cursorX: number): [number, number] {
  const sec = env.section?.();
  const view = sec ? env.project().views.find((v) => v.id === sec.id) : undefined;
  if (view) {
    const d = sub(view.b, view.a);
    const length = Math.hypot(d.x, d.y);
    if (length > 1e-9) return [0, length];
  }
  return [Math.min(0, cursorX - 2), Math.max(1, cursorX + 2)];
}

/**
 * Abertura alvo do segundo clique: a selecionada ou, sem seleção de abertura, a que estiver sob o snap (uma aresta
 * de vão carrega o id da abertura em `hostId`).
 */
function targetOpening(env: ToolEnv, inf: Inference, cachedId?: Id | null): Opening | undefined {
  const p0 = env.project();
  for (const id of env.selection()) {
    const e = p0.elements[id];
    if (isOpening(e)) return e;
  }
  const host = inf.hostId !== undefined ? p0.elements[inf.hostId] : undefined;
  if (isOpening(host)) return host;
  const cached = cachedId !== undefined && cachedId !== null ? p0.elements[cachedId] : undefined;
  return isOpening(cached) ? cached : undefined;
}

/** Referência do primeiro passo: cota, ponto, tipo de captura e dono (para o status e a guia). */
interface AlignRef {
  z: number;
  point: Vec2;
  kind: SnapKind;
  hostId?: Id;
  /** Falso quando o clique caiu no vazio e a cota foi tomada do ponto livre. */
  snapped: boolean;
}

/**
 * Alinhar no corte/elevação em dois passos: primeiro a referência (cota/aresta), depois o alvo (abertura).
 * Sem Shift alinha o topo do alvo à referência; com Shift alinha o peitoril. Porta só tem topo (Shift avisa).
 * O primeiro clique nunca altera o modelo: só grava a referência e mostra a guia horizontal persistente.
 */
export class SectionAlignTool extends ToolBase {
  readonly id = 'align';
  readonly label = 'Alinhar';
  readonly hint = 'Alinhar no corte: clique na referência (cota/aresta) e depois no alvo. Alinha o topo; Shift alinha o peitoril.';
  private ref: AlignRef | null = null;
  /** Abertura alvo já detectada (seleção ou `hostId`): fica fora da inferência da referência. */
  private targetId: Id | null = null;

  protected reset(): void { this.ref = null; this.targetId = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.ref !== null; }

  /** Ids que não podem servir de referência: a seleção e o alvo já detectado. */
  private referenceIgnore(): Set<Id> {
    const ignore = new Set<Id>(this.env.selection());
    if (this.targetId) ignore.add(this.targetId);
    return ignore;
  }

  /** Detecta o alvo do segundo passo e o memoriza para as próximas capturas o ignorarem. */
  private detectTarget(inf: Inference): Opening | undefined {
    const target = targetOpening(this.env, inf, this.targetId);
    if (target) this.targetId = target.id;
    return target;
  }

  override move(p: PointerInfo): void {
    const inf = this.snap(p, { ignore: this.referenceIgnore() });
    if (!this.ref) {
      this.items = [
        ...this.referencePreview(inf.point.y, false, inf.point.x),
        { kind: 'point', at: inf.point },
      ];
      return;
    }
    const target = this.detectTarget(inf);
    const items: PreviewItem[] = [
      ...this.referencePreview(this.ref.z, true),
      // Fantasma vertical do alvo até a guia da referência.
      { kind: 'line', a: { x: inf.point.x, y: this.ref.z }, b: inf.point, dashed: true },
      { kind: 'point', at: inf.point },
    ];
    if (target) items.push({ kind: 'highlight', ids: [target.id] });
    this.items = items;
  }

  override click(p: PointerInfo): void {
    const inf = this.snap(p, { ignore: this.referenceIgnore() });
    if (!this.ref) { this.setReference(inf); return; }
    const target = this.detectTarget(inf);
    if (!target) { this.env.say('Selecione uma abertura ou clique sobre ela para alinhar. Nada foi alterado.'); return; }
    this.alignTarget(target, p.shift);
  }

  /** Guia horizontal longa na cota da referência, com o rótulo "Referência +cota". */
  private referencePreview(z: number, committed: boolean, atX?: number): PreviewItem[] {
    const [x0, x1] = guideSpanX(this.env, this.raw.x);
    return [
      { kind: 'line', a: { x: x0, y: z }, b: { x: x1, y: z }, dashed: !committed },
      { kind: 'label', at: { x: atX ?? x1, y: z }, text: `Referência ${cotaText(this.env, z)}` },
    ];
  }

  private setReference(inf: Inference): void {
    const snapped = inf.kind !== 'none';
    this.ref = { z: inf.point.y, point: { ...inf.point }, kind: inf.kind, hostId: inf.hostId, snapped };
    this.items = [
      ...this.referencePreview(this.ref.z, true),
      { kind: 'point', at: this.ref.point },
    ];
    const cota = cotaText(this.env, this.ref.z);
    const origem = snapped
      ? `Referência em ${SNAP_KIND_LABEL[inf.kind] ?? 'captura'} ${cota}`
      : `Sem referência de linha: ponto livre ${cota}`;
    this.env.say(`${origem}. Clique no alvo para alinhar o topo; Shift alinha o peitoril.`);
  }

  private alignTarget(target: Opening, shift: boolean): void {
    const ref = this.ref;
    if (!ref) return;
    const p0 = this.env.project();
    // Sem seleção o alvo pode ter sido achado pela própria captura: ele não pode ser a referência dele mesmo.
    if (ref.hostId === target.id) {
      this.env.say('A referência é a própria abertura alvo; escolha outra referência.');
      return;
    }
    const wall = p0.elements[target.hostId];
    if (!isWall(wall)) { this.env.say('A abertura não tem parede hospedeira; nada foi alterado.'); return; }
    // Porta não tem peitoril útil: o único alinhamento é o topo.
    if (target.kind === 'door' && shift) {
      this.env.say('Porta só alinha o topo; clique no alvo sem Shift. Nada foi alterado.');
      return;
    }
    const base = wallBaseElevation(p0, wall);
    const type = openingType(p0, target);
    let patch: Partial<Opening>;
    let label: string;
    if (shift) {
      const sill = round3(ref.z - base);
      if (sill < 0) { this.env.say('A referência fica abaixo da base da parede; peitoril não alterado.'); return; }
      patch = { sillOverride: sill };
      label = 'Peitoril';
    } else {
      const height = round3(ref.z - base - openingSill(type, target));
      if (height < 0.01) { this.env.say('A referência fica baixa demais para o topo; nada foi alterado.'); return; }
      patch = { heightOverride: height };
      label = 'Topo';
    }
    // Um comando só: o alinhamento inteiro é um único passo de desfazer.
    this.env.transaction('Alinhar no corte', () => this.env.exec({ type: 'updateElements', ids: [target.id], patch }));
    this.env.say(`${label} alinhado em ${cotaText(this.env, ref.z)}. Ctrl+Z desfaz; Esc sai.`);
    this.reset();
  }
}
