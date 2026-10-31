import { mid, type Vec2 } from '@hestia/geom';
import { formatQuantity, makeLevel, newId, unitsOf, type Level, type ResolvedUnits } from '@hestia/model';
import { ToolBase } from './base.ts';
import type { PointerInfo } from './types.ts';

/** Tolerância (m) para o segundo clique continuar na cota do primeiro: abaixo disso a linha é horizontal. */
export const LEVEL_Z_TOLERANCE = 0.01;
/** Comprimento mínimo (m) da linha do nível. */
export const LEVEL_MIN_EXTENT = 0.05;
/** Distância (px) em que a cota do cursor gruda na elevação de um nível existente. */
const LEVEL_SNAP_PX = 8;

const fmt = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/** Elevação com sinal, como nas linhas de nível do Revit ("+3,00 m", "−0,45 m"). */
function signedElevation(u: ResolvedUnits, z: number): string {
  const text = fmt(u, Math.abs(z));
  return z >= 0 ? `+${text}` : `−${text}`;
}

/** Próximo nome livre "Nível 1", "Nível 2"… (não repete um nome já usado, mesmo que fora da sequência). */
export function nextLevelName(levels: readonly Pick<Level, 'name'>[]): string {
  const used = new Set(levels.map((l) => l.name));
  for (let n = 1; ; n++) {
    const name = `Nível ${n}`;
    if (!used.has(name)) return name;
  }
}

/**
 * Ferramenta Nível (Revit: Level, atalho LL), só em corte/elevação.
 *
 * O primeiro clique fixa a cabeça da linha e o segundo a cauda, na mesma cota. Ao concluir, cria o nível com nome
 * automático e elevação do segundo clique e grava as extensões `start/end` na vista ativa. A linha é sempre horizontal:
 * um segundo clique fora da cota do primeiro é recusado e o primeiro ponto é mantido.
 */
export class LevelTool extends ToolBase {
  readonly id = 'level';
  readonly label = 'Nível';
  readonly hint = 'Nível: clique no início da linha do nível. O fim fica na mesma cota. Esc cancela.';
  private head: Vec2 | null = null;

  protected reset(): void {
    this.head = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.head !== null;
  }

  private section() {
    return this.env.section?.() ?? null;
  }

  override start(): void {
    this.reset();
    if (!this.section()) {
      this.env.say('Nível só funciona em corte/elevação. Abra um corte ou uma elevação.');
      return;
    }
    this.env.say(this.hint);
  }

  /** Gruda a cota na elevação de um nível existente quando o cursor passa perto (guia horizontal do Revit). */
  private snapZ(z: number): number {
    let best = z;
    let bestDist = Math.min(0.2, Math.max(0.005, this.env.metersPerPixel() * LEVEL_SNAP_PX));
    for (const l of this.env.project().levels) {
      const d = Math.abs(l.elevation - z);
      if (d <= bestDist) {
        best = l.elevation;
        bestDist = d;
      }
    }
    return best;
  }

  private zTolerance(): number {
    return Math.min(0.05, Math.max(LEVEL_Z_TOLERANCE, this.env.metersPerPixel()));
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.inf = null;
    this.items = [];
    if (!this.section()) return;
    const u = unitsOf(this.env.project());
    if (!this.head) {
      const at = { x: p.raw.x, y: this.snapZ(p.raw.y) };
      this.items.push({ kind: 'point', at });
      this.items.push({ kind: 'label', at, text: `${nextLevelName(this.env.project().levels)} ${signedElevation(u, at.y)}` });
      return;
    }
    const a = this.head;
    const b = { x: p.raw.x, y: a.y };
    const horizontal = Math.abs(p.raw.y - a.y) <= this.zTolerance();
    if (Math.abs(b.x - a.x) >= LEVEL_MIN_EXTENT) {
      this.items.push({ kind: 'line', a, b, dashed: true, tone: horizontal ? undefined : 'invalid' });
      this.items.push({
        kind: 'label',
        at: mid(a, b),
        text: horizontal ? `${nextLevelName(this.env.project().levels)} ${signedElevation(u, a.y)}` : 'O nível é horizontal',
      });
    } else {
      this.items.push({ kind: 'point', at: b });
    }
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const section = this.section();
    if (!section) {
      this.env.say('Nível só funciona em corte/elevação. Abra um corte ou uma elevação.');
      return;
    }
    if (!this.head) {
      this.head = { x: p.raw.x, y: this.snapZ(p.raw.y) };
      this.env.say('Clique no fim da linha do nível, na mesma cota do início. Esc cancela.');
      return;
    }
    const a = this.head;
    const z = p.raw.y;
    if (Math.abs(z - a.y) > this.zTolerance()) {
      // Mantém o primeiro ponto: o usuário pode corrigir só a cota do segundo clique.
      this.env.say('A linha do nível é horizontal: clique no fim na mesma cota do início.');
      return;
    }
    if (Math.abs(p.raw.x - a.x) < LEVEL_MIN_EXTENT) {
      this.env.say('A linha do nível está curta demais: clique mais longe do início.');
      return;
    }

    const u = unitsOf(this.env.project());
    const level = makeLevel({ id: newId('lv'), name: nextLevelName(this.env.project().levels), elevation: z });
    const extent = { a: a.x, b: p.raw.x };
    try {
      this.env.transaction('Criar/editar nível', () => {
        this.env.exec({ type: 'upsertLevel', level });
        this.env.exec({ type: 'setSectionLevelExtent', sectionId: section.id, levelId: level.id, extent });
      });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : String(e));
      return;
    }
    this.reset();
    this.env.say(`Nível ${level.name} criado em ${signedElevation(u, level.elevation)}. Clique no início do próximo nível.`);
  }
}
