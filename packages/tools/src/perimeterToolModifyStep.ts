import { add, len, mul, norm, sub, type SketchDraft, type SketchSeg, type Vec2 } from '@hestia/geom';
import { formatQuantity, type Id, type Project, type ResolvedUnits } from '@hestia/model';
import type { PerimeterModifyKind } from './perimeterModifyKind.ts';
import { SELECT_PX, hitSeg, segLines } from './perimeterToolPick.ts';
import type { PointerInfo, PreviewItem, ToolOptions } from './types.ts';
import type { Lang } from './i18n.ts';

/** Passo de um comando de Modificar: estágio, linhas e pontos já escolhidos, valor digitado e as opções de Tab. */
export interface Step {
  /** Estágio. Comandos sobre a seleção escolhem as linhas no 0 (ou começam no 1 com seleção prévia). */
  stage: number;
  /** Linhas do passo: referência, limite, ou primeira linha do trecho. */
  ids: string[];
  /** Pontos do passo: base, eixo, primeiro ponto do trecho, ou base e passo da matriz. */
  pts: Vec2[];
  /** Distância digitada (deslocamento), ou null. */
  num: number | null;
  /** Variante de Tab: aparar/estender (canto, limite, estender) ou dividir (ponto, com espaço). */
  mode: number;
  /** Copiar (true) ou mover, nos comandos que têm a opção. */
  copy: boolean;
}

/** O que os comandos de Modificar usam da ferramenta dona: rascunho, escrita, aviso, captura e opções. */
export interface ModHost {
  draft(): SketchDraft;
  /** Operação aplicada: um passo de desfazer. */
  commit(next: SketchDraft): void;
  /** Troca só a seleção, sem passo de desfazer. */
  replace(next: SketchDraft): void;
  say(msg: string): void;
  mpp(): number;
  /** Ponto capturado (vértices do rascunho e inferência). */
  snap(p: PointerInfo): Vec2;
  options(): ToolOptions;
  /** Projeto e nível: o Alinhar também usa faces e arestas de fora do esboço como referência. Ausentes = só esboço. */
  project?(): Project;
  levelId?(): Id;
  /** Idioma da interface (ausente = português). */
  lang?(): Lang;
}

/** Comandos que agem sobre a seleção: o primeiro estágio escolhe as linhas (Enter confirma). */
export const SOURCED: ReadonlySet<PerimeterModifyKind> = new Set(['offset', 'move', 'copy', 'rotate', 'mirror', 'array']);
/** Comandos que agem sobre a linha clicada. */
export const EDGE: ReadonlySet<PerimeterModifyKind> = new Set(['trim', 'split', 'align', 'delete']);

export function freshStep(copy: boolean): Step {
  return { stage: 0, ids: [], pts: [], num: null, mode: 0, copy };
}

/** Há algo escolhido no passo (linha, ponto ou distância)? */
export function hasData(st: Step): boolean {
  return st.ids.length > 0 || st.pts.length > 0 || st.num !== null;
}

/** Volta o passo ao início do comando. Modo e opção de cópia ficam como estão. */
export function clearData(kind: PerimeterModifyKind, st: Step): void {
  st.stage = SOURCED.has(kind) ? 1 : 0;
  st.ids = [];
  st.pts = [];
  st.num = null;
}

/** Linha sob o ponto, com a tolerância de clique, ou null. */
export function lineAt(d: SketchDraft, p: Vec2, mpp: number): string | null {
  return hitSeg(d.segs, p, SELECT_PX * mpp);
}

export function segById(d: SketchDraft, id: string): SketchSeg | undefined {
  return d.segs.find((s) => s.id === id);
}

/** Prévia do resultado: as linhas novas ou alteradas, tracejadas (o que a operação faria). */
export function ghost(before: SketchDraft, after: SketchDraft | null): PreviewItem[] {
  if (!after) return [];
  const old = new Map(before.segs.map((s) => [s.id, s] as const));
  return after.segs.filter((s) => old.get(s.id) !== s).flatMap((s) => segLines(s, { dashed: true }));
}

/** Realce de uma linha pelo id (como a cota do Medir). */
export function halo(d: SketchDraft, id: string): PreviewItem[] {
  const s = segById(d, id);
  return s ? segLines(s, { halo: true }) : [];
}

export const dashedLine = (a: Vec2, b: Vec2): PreviewItem => ({ kind: 'line', a, b, dashed: true });

/** Ponto a `v` metros de `from`, na direção de `to` (horizontal se coincidirem). */
export function alongTo(from: Vec2, to: Vec2, v: number): Vec2 {
  const dir = sub(to, from);
  const u = len(dir) < 1e-9 ? { x: 1, y: 0 } : norm(dir);
  return add(from, mul(u, v));
}

/** Número para a barra de status: até o milímetro, sem zeros à direita. */
export const fmt = (u: ResolvedUnits, v: number): string => formatQuantity(u, 'length', v, { withUnit: false, trim: true });
