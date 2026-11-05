import { add, applyTransform, dist, mul, norm, perp, sub, type Transform, type Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { newId } from './ids.ts';
import { t, type Lang } from './i18n.ts';
import { sectionLevelExtentIssue } from './sectionLevelExtents.ts';
import {
  isWall,
  type Id,
  type Project,
  type SectionMarkLineStyle,
  type SectionMarkPlacement,
  type SectionMarkStyle,
  type SectionRef,
  type SectionRole,
  type SectionView,
} from './types.ts';

/** Comprimento mínimo de uma linha de corte/elevação (m): abaixo disso os dois pontos são o mesmo. */
export const SECTION_MIN_LENGTH = 0.001;
/** Medidas padrão da marca, em mm de papel. */
export const SECTION_ARROW_MM = 3;
export const SECTION_TEXT_MM = 2.5;
export const SECTION_LABEL_OFFSET_MM = { x: 0, y: 0 } as const;
/** Traço-ponto e tracejado da marca, em mm de papel. */
export const SECTION_DASH_DOT_MM = [4, 1, 0.3, 1] as const;
export const SECTION_DASHED_MM = [3, 1.5] as const;
/** Folga do diâmetro da bolha do rótulo (mm de papel) além da altura do texto. */
const SECTION_BUBBLE_PAD_MM = 4.5;
const FLAG_ARC_STEPS = 8;
const MAX_SEGMENTS = 2000;
const MAX_NAME = 80;
const MAX_TEXT = 120;

const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);
const clean = (text: string | undefined): string => text?.trim() ?? '';

/** Motivo de recusa de uma vista de corte/elevação, ou null. Não olha para o projeto: refs são validadas à parte. */
export function sectionViewIssue(v: SectionView): string | null {
  if (clean(v.name) === '') return 'O nome da vista não pode ser vazio.';
  if (v.name.length > MAX_NAME) return `O nome da vista deve ter até ${MAX_NAME} caracteres.`;
  if (v.kind !== 'section' && v.kind !== 'elevation') return 'O tipo da vista deve ser corte ou elevação.';
  if (!finite(v.a) || !finite(v.b)) return 'As coordenadas da vista devem ser números finitos.';
  if (dist(v.a, v.b) < SECTION_MIN_LENGTH) return 'A linha de corte precisa de dois pontos distintos.';
  if (!(Number.isFinite(v.depth) && v.depth > 0)) return 'A profundidade da vista deve ser maior que zero.';
  if (v.depth > 10000) return 'A profundidade da vista é excessiva.';
  if (v.number !== undefined && (typeof v.number !== 'string' || v.number.length > MAX_TEXT)) return 'A identificação da vista é inválida.';
  if (v.title !== undefined && (typeof v.title !== 'string' || v.title.length > MAX_TEXT)) return 'O título da vista é inválido.';
  if (v.label !== undefined && (typeof v.label !== 'string' || v.label.length > MAX_TEXT)) return 'O rótulo da vista é inválido.';
  if (v.role !== undefined && !['north', 'south', 'east', 'west'].includes(v.role)) return 'O papel da elevação é inválido.';
  for (const ref of [v.refs?.a, v.refs?.b]) {
    if (!ref) continue;
    if (typeof ref.wallId !== 'string' || clean(ref.wallId) === '') return 'A referência da vista aponta para uma parede vazia.';
    if (ref.end !== 'a' && ref.end !== 'b') return 'A extremidade da referência da vista é inválida.';
  }
  if (v.levelExtents !== undefined) {
    if (!v.levelExtents || typeof v.levelExtents !== 'object') return 'As extensões das linhas de nível são inválidas.';
    for (const [levelId, extent] of Object.entries(v.levelExtents)) {
      if (clean(levelId) === '') return 'A extensão da linha de nível aponta para um nível vazio.';
      const issue = sectionLevelExtentIssue(extent);
      if (issue) return `Nível "${levelId}": ${issue}`;
    }
  }
  const m = v.mark;
  if (!m) return null;
  if (m.visible !== undefined && typeof m.visible !== 'boolean') return 'A visibilidade da marca deve ser sim ou não.';
  if (m.showArrow !== undefined && typeof m.showArrow !== 'boolean') return 'A opção de setas da marca deve ser sim ou não.';
  if (m.showLabel !== undefined && typeof m.showLabel !== 'boolean') return 'A opção de rótulo da marca deve ser sim ou não.';
  if (m.placement !== undefined && !['both', 'start', 'end', 'middle'].includes(m.placement)) return 'A posição da marca é inválida.';
  if (m.lineStyle !== undefined && !['dash-dot', 'continuous', 'dashed'].includes(m.lineStyle)) return 'O traço da marca é inválido.';
  if (m.arrowMm !== undefined && !(Number.isFinite(m.arrowMm) && m.arrowMm >= 0.5 && m.arrowMm <= 20)) return 'O comprimento da seta deve ficar entre 0,5 e 20 mm.';
  if (m.textMm !== undefined && !(Number.isFinite(m.textMm) && m.textMm >= 1 && m.textMm <= 20)) return 'A altura do rótulo deve ficar entre 1 e 20 mm.';
  if (m.labelOffsetMm !== undefined && !finite(m.labelOffsetMm)) return 'O deslocamento do rótulo deve ser um ponto finito.';
  return null;
}

/** Nome já usado por outra vista (o próprio id fica de fora), ou null. */
export function viewNameIssue(views: SectionView[], name: string, exceptId?: Id): string | null {
  const cleanName = clean(name);
  if (cleanName === '') return 'O nome da vista não pode ser vazio.';
  return views.some((v) => v.id !== exceptId && v.name === cleanName) ? `Já existe uma vista chamada "${cleanName}".` : null;
}

/** Referências de parede que não existem mais. A vista continua válida com os pontos guardados. */
export function sectionRefIssues(p: Pick<Project, 'elements'>, v: SectionView): string[] {
  const out: string[] = [];
  for (const [key, ref] of [['a', v.refs?.a], ['b', v.refs?.b]] as const) {
    if (!ref) continue;
    if (!isWall(p.elements[ref.wallId])) out.push(`A extremidade ${key.toUpperCase()} da vista "${v.name}" aponta para a parede "${ref.wallId}", que não existe.`);
  }
  return out;
}

/**
 * Pontos medidos da vista. Uma extremidade presa a uma parede existente segue a extremidade dela; sem a parede, vale o
 * ponto guardado. É o mesmo contrato de `dimensionPoints`, para a marca e o corte não divergirem.
 */
export function sectionPoints(p: Pick<Project, 'elements'>, v: SectionView): { a: Vec2; b: Vec2 } {
  const at = (ref: SectionRef | undefined, fallback: Vec2): Vec2 => {
    const w = ref ? p.elements[ref.wallId] : undefined;
    if (!ref || !isWall(w)) return fallback;
    return ref.end === 'a' ? { ...w.a } : { ...w.b };
  };
  return { a: at(v.refs?.a, v.a), b: at(v.refs?.b, v.b) };
}

/** Texto da marca: rótulo próprio, senão número, senão nome. */
export const sectionLabelOf = (v: SectionView): string => clean(v.label) || clean(v.number) || v.name;

/** Título completo da vista na prancha: título próprio, senão nome. */
export const sectionTitleOf = (v: SectionView): string => clean(v.title) || v.name;

export interface SectionMarkLook {
  lineStyle: SectionMarkLineStyle;
  placement: SectionMarkPlacement;
  showArrow: boolean;
  showLabel: boolean;
  arrowMm: number;
  textMm: number;
  labelOffsetMm: Vec2;
}

/** Estilo efetivo da marca, com os padrões do Hestia por tipo de vista. `dashed` força a prévia tracejada. */
export function sectionMarkLookOf(kind: SectionView['kind'], mark?: SectionMarkStyle, dashed = false): SectionMarkLook {
  return {
    lineStyle: dashed ? 'dashed' : mark?.lineStyle ?? (kind === 'elevation' ? 'continuous' : 'dash-dot'),
    placement: mark?.placement ?? 'both',
    showArrow: mark?.showArrow ?? true,
    showLabel: mark?.showLabel ?? true,
    arrowMm: mark?.arrowMm ?? SECTION_ARROW_MM,
    textMm: mark?.textMm ?? SECTION_TEXT_MM,
    labelOffsetMm: mark?.labelOffsetMm ?? { ...SECTION_LABEL_OFFSET_MM },
  };
}

export interface SectionMarkLabel {
  at: Vec2;
  text: string;
  /** Graus, anti-horário, sempre legível pela esquerda ou por baixo. */
  rotation: number;
}

export interface SectionMarkBubble {
  at: Vec2;
  /** Raio da bolha, em metros. */
  r: number;
}

export interface SectionMarkGeometry {
  /** Traços da linha e da haste das setas, em metros. */
  segments: Array<[Vec2, Vec2]>;
  /** Triângulos das setas, em metros (o primeiro ponto é a base de um lado, o segundo a ponta): contorno e seleção. */
  arrows: Vec2[][];
  /** Polígonos a preencher das setas, em metros: com bolha, o triângulo menos o círculo (duas asas e a ponta). */
  flags: Vec2[][];
  labels: SectionMarkLabel[];
  /** Bolha por trás de cada rótulo (convenção de marca de corte/elevação), em metros. */
  bubbles: SectionMarkBubble[];
}

/** Traço-ponto ao longo de a→b. `null` quando o padrão não cabe no limite (a linha sai contínua). */
function dashSegments(a: Vec2, u: Vec2, length: number, pattern: readonly number[], mPerMm: number): Array<[Vec2, Vec2]> | null {
  const total = pattern.reduce((s, v) => s + v, 0) * mPerMm;
  if (!(total > 0) || length / total > MAX_SEGMENTS) return null;
  const out: Array<[Vec2, Vec2]> = [];
  let t = 0;
  let i = 0;
  while (t < length) {
    const step = pattern[i % pattern.length]! * mPerMm;
    const end = Math.min(length, t + step);
    if (i % 2 === 0) out.push([add(a, mul(u, t)), add(a, mul(u, end))]);
    t += step;
    i++;
  }
  return out;
}

/** Ângulo do texto ao longo de `u`, legível pela esquerda ou por baixo. */
function textRotation(u: Vec2): number {
  const angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  let out = angle;
  if (out > 90) out -= 180;
  if (out <= -90) out += 180;
  return out;
}

/**
 * Patch que inverte o sentido do corte (início↔fim). O observador passa para o outro lado da linha e as
 * referências às paredes trocam de extremidade junto, para a associação continuar a mesma.
 */
export function sectionInvertPatch(v: Pick<SectionView, 'a' | 'b' | 'refs'>): Partial<Omit<SectionView, 'id'>> {
  return { a: v.b, b: v.a, refs: v.refs ? { a: v.refs.b, b: v.refs.a } : undefined };
}

/**
 * Geometria da marca de corte/elevação em metros de desenho. `mPerMm` é quantos metros cabem em 1 mm de papel
 * (escala / 1000): as medidas da marca são de papel e, por isso, ficam legíveis na tela e na prancha.
 */
export function sectionMarkGeometry(
  a: Vec2,
  b: Vec2,
  kind: SectionView['kind'],
  label: string | undefined,
  mPerMm: number,
  mark?: SectionMarkStyle,
  dashed = false,
  sheetLabel?: string,
): SectionMarkGeometry {
  const out: SectionMarkGeometry = { segments: [], arrows: [], flags: [], labels: [], bubbles: [] };
  if (mark?.visible === false) return out;
  const length = dist(a, b);
  if (length < 1e-9) return out;
  const u = norm(sub(b, a));
  const n = perp(u);
  const look = sectionMarkLookOf(kind, mark, dashed);

  const ends = look.placement === 'start' ? [a] : look.placement === 'end' ? [b] : look.placement === 'middle' ? [] : [a, b];
  const text = clean(label);
  const bubbleShown = look.showLabel && text !== '';

  // Bolha (convenção de corte/elevação): raio mínimo acompanha a altura do texto, mas cresce para caber o texto
  // inteiro quando o nome não é um código curto (letra ou número).
  const sheetText = clean(sheetLabel) || '-';
  const splitMm = look.textMm * 0.55;
  const minBubbleRMm = (look.textMm + SECTION_BUBBLE_PAD_MM) / 2;
  // Cada linha de texto (número do corte e da prancha) fica deslocada do centro: o canto mais afastado dela tem de caber.
  const lineFitRMm = (s: string): number => Math.hypot((s.length * look.textMm * 0.58) / 2, splitMm + look.textMm / 2) + 0.5;
  const bubbleRMm = Math.max(minBubbleRMm, lineFitRMm(text), lineFitRMm(sheetText));

  // A linha de corte entra na bolha e passa pelo centro dela (a divisória da bolha é a própria linha): o traço da
  // marca começa na borda de cada bolha de ponta.
  const trimA = bubbleShown && ends.includes(a) ? bubbleRMm * mPerMm : 0;
  const trimB = bubbleShown && ends.includes(b) ? bubbleRMm * mPerMm : 0;
  const lineA = trimA + trimB < length ? add(a, mul(u, trimA)) : a;
  const lineB = trimA + trimB < length ? sub(b, mul(u, trimB)) : b;
  const lineLen = dist(lineA, lineB);
  if (look.lineStyle === 'continuous') out.segments.push([lineA, lineB]);
  else {
    const pattern = look.lineStyle === 'dashed' ? SECTION_DASHED_MM : SECTION_DASH_DOT_MM;
    const segs = dashSegments(lineA, u, lineLen, pattern, mPerMm) ?? [[lineA, lineB] as [Vec2, Vec2]];
    out.segments.push(...segs);
  }

  const markers: Array<{ at: Vec2; arrow: boolean }> = look.placement === 'middle'
    ? [{ at: mul(add(a, b), 0.5), arrow: false }]
    : ends.map((e) => ({ at: e, arrow: look.showArrow }));

  for (const { at: e, arrow } of markers) {
    if (bubbleShown) {
      const center = add(e, mul(n, look.labelOffsetMm.y * mPerMm));
      out.bubbles.push({ at: center, r: bubbleRMm * mPerMm });
      // Divisória da bolha: número do corte em cima, número da prancha embaixo ("-" se não publicada).
      out.segments.push([sub(center, mul(u, bubbleRMm * mPerMm)), add(center, mul(u, bubbleRMm * mPerMm))]);
      out.labels.push({ at: add(center, mul(n, -splitMm * mPerMm)), text: sheetText, rotation: textRotation(u) });
      out.labels.push({ at: add(center, mul(n, splitMm * mPerMm)), text, rotation: textRotation(u) });
      if (arrow) {
        // Bandeira de direção: triângulo de 90° no vértice cuja base é o diâmetro da bolha (sobra para fora dos dois
        // lados) e cujos outros dois lados tangenciam o círculo. Só o que fica fora do círculo é preenchido.
        const r = bubbleRMm * mPerMm;
        const w = r * Math.SQRT2;
        const pt = (x: number, y: number): Vec2 => add(center, add(mul(u, x), mul(n, y)));
        const arc = (from: number, to: number): Vec2[] =>
          Array.from({ length: FLAG_ARC_STEPS + 1 }, (_, i) => {
            const ang = from + ((to - from) * i) / FLAG_ARC_STEPS;
            return pt(r * Math.cos(ang), r * Math.sin(ang));
          });
        const q = Math.PI / 4;
        out.arrows.push([pt(w, 0), pt(0, w), pt(-w, 0)]);
        out.flags.push([pt(w, 0), ...arc(q, 0)], [pt(-w, 0), ...arc(3 * q, Math.PI)], [pt(0, w), ...arc(3 * q, q)]);
      }
    } else if (arrow) {
      const arrowLen = look.arrowMm * mPerMm;
      const half = arrowLen * 0.32;
      const stem = add(e, mul(n, arrowLen * 0.55));
      const tip = add(e, mul(n, arrowLen));
      const tri = [add(stem, mul(u, half)), tip, sub(stem, mul(u, half))];
      out.segments.push([e, stem]);
      out.arrows.push(tri);
      out.flags.push(tri);
    }
  }
  return out;
}

/** Ids de vistas dentro da seleção. */
export function viewIdsIn(p: Pick<Project, 'views'>, ids: Id[]): Id[] {
  const want = new Set(ids);
  return p.views.filter((v) => want.has(v.id)).map((v) => v.id);
}

/** Comandos de exclusão das vistas cujos ids estão em `ids`. */
export function viewRemovals(p: Pick<Project, 'views'>, ids: Id[]): Array<Extract<Command, { type: 'deleteView' }>> {
  const want = new Set(ids);
  return p.views.filter((v) => want.has(v.id)).map((v) => ({ type: 'deleteView', id: v.id }));
}

/** Nome livre para uma cópia ("Corte A cópia", "Corte A cópia 2"...). */
export function copyViewName(views: SectionView[], base: string, lang: Lang = 'pt'): string {
  const used = new Set(views.map((v) => v.name));
  const root = base.slice(0, 70);
  const first = t(lang, 'md_doc_view_copy', { base: root });
  if (!used.has(first)) return first;
  for (let i = 2; ; i++) {
    const name = t(lang, 'md_doc_view_copy_n', { base: root, n: i });
    if (!used.has(name)) return name;
  }
}

/**
 * Comandos que movem/gira/espelham as vistas de `ids`. Com `copy`, cria cópias com ids e nomes novos e sem papel de
 * elevação (duas elevações não podem disputar a mesma direção). Como nas cotas, a vista transformada perde as
 * referências às paredes: a posição passa a ser livre.
 */
export function viewTransformCommands(p: Pick<Project, 'views' | 'elements'>, ids: Id[], t: Transform, copy: boolean): Command[] {
  const want = new Set(ids);
  const out: Command[] = [];
  for (const v of p.views) {
    if (!want.has(v.id)) continue;
    const pts = sectionPoints(p, v);
    const a = applyTransform(t, pts.a);
    const b = applyTransform(t, pts.b);
    if (copy) {
      const known = [...p.views, ...out.flatMap((c) => (c.type === 'addView' ? [c.view] : []))];
      out.push({ type: 'addView', view: { ...v, id: newId('v'), name: copyViewName(known, v.name), a, b, refs: undefined, role: undefined } });
    } else {
      out.push({ type: 'updateView', id: v.id, patch: { a, b, refs: undefined } });
    }
  }
  return out;
}

/** Papel de cada direção de elevação, para nomes e mensagens, no idioma pedido. */
export function sectionRoleLabels(lang: Lang = 'pt'): Record<SectionRole, string> {
  return {
    north: t(lang, 'md_role_north'),
    south: t(lang, 'md_role_south'),
    east: t(lang, 'md_role_east'),
    west: t(lang, 'md_role_west'),
  };
}

/** Papel de cada direção em PT (compatibilidade). */
export const SECTION_ROLE_LABEL: Record<SectionRole, string> = sectionRoleLabels('pt');
