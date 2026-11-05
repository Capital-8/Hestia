import { len, sub, type Vec2 } from '@hestia/geom';
import type { Id, Project } from './types.ts';
import { defaultUnits, unitsOf, type ResolvedUnits } from './units.ts';
import { formatQuantity } from './unitsFormat.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Grades de eixos (Revit: Grid). Pertencem ao projeto, não a um nível: aparecem na planta de todos os níveis, com bolha
 * numerada ou com letra nas pontas. Campos opcionais em `Project.grids` e `Project.gridTypes`: sem eles não há grades e o
 * arquivo antigo continua valendo (sem migração, como as pranchas).
 *
 * Uma grade tem 2 pontos (reta, ou arco quando `sag` ≠ 0) ou mais (multissegmento, sempre reta por trecho). O tipo guarda
 * o símbolo da bolha, o segmento central e o traço das pontas (todas as medidas de papel em mm).
 */
export type GridCenterSegment = 'continuous' | 'none' | 'custom';
export type GridLinePattern = 'solid' | 'dash' | 'dashdot';

export interface GridType {
  id: Id;
  name: string;
  /** 'continuous' = linha inteira com o traço das pontas; 'none' = só as pontas; 'custom' = centro com traço próprio. */
  centerSegment: GridCenterSegment;
  /** Comprimento dos trechos das pontas no papel (mm), usado com 'none' e 'custom'. */
  endLengthMm: number;
  /** Traço das pontas e do centro 'continuous'. `color` null = cor da tinta do tema. */
  weightMm: number;
  color: string | null;
  pattern: GridLinePattern;
  /** Traço do centro com 'custom'. */
  centerWeightMm: number;
  centerColor: string | null;
  centerPattern: GridLinePattern;
  /** Bolha: diâmetro e altura do texto no papel (mm). */
  bubbleDiameterMm: number;
  bubbleTextMm: number;
}

export interface Grid {
  id: Id;
  name: string;
  typeId: Id;
  /** Pontos do eixo em planta (m); 2 ou mais. `points[0]` é o início e o último é o fim. */
  points: Vec2[];
  /** Flecha do arco (m), à esquerda de início→fim, como `Wall.sag`. Só vale com 2 pontos; 0 = reta. */
  sag: number;
  /** Bolha no início e no fim. */
  bubbleStart: boolean;
  bubbleEnd: boolean;
  /** Ordem de criação (nome automático e ordenação). */
  order: number;
}

export type GridCommand =
  | { type: 'addGrid'; grid: Omit<Grid, 'order'> }
  | { type: 'updateGrid'; id: Id; patch: Partial<Omit<Grid, 'id' | 'order'>> }
  | { type: 'removeGrid'; id: Id }
  | { type: 'addGridType'; gridType: GridType }
  | { type: 'updateGridType'; id: Id; patch: Partial<Omit<GridType, 'id'>> }
  | { type: 'removeGridType'; id: Id };

/** Distância mínima entre dois pontos consecutivos de uma grade (m). */
export const GRID_MIN_SEGMENT = 0.05;

export const DEFAULT_GRID_TYPE_ID = 'gt_6mm';

export const DEFAULT_GRID_TYPES: GridType[] = [
  {
    id: DEFAULT_GRID_TYPE_ID,
    name: 'Bolha 6 mm',
    centerSegment: 'continuous',
    endLengthMm: 25,
    weightMm: 0.25,
    color: null,
    pattern: 'dashdot',
    centerWeightMm: 0.18,
    centerColor: null,
    centerPattern: 'dashdot',
    bubbleDiameterMm: 8,
    bubbleTextMm: 3,
  },
  {
    id: 'gt_6mm_pontas',
    name: 'Bolha 6 mm, só as pontas',
    centerSegment: 'none',
    endLengthMm: 25,
    weightMm: 0.25,
    color: null,
    pattern: 'solid',
    centerWeightMm: 0.18,
    centerColor: null,
    centerPattern: 'solid',
    bubbleDiameterMm: 8,
    bubbleTextMm: 3,
  },
];

export const projectGrids = (p: Pick<Project, 'grids'>): Grid[] => p.grids ?? [];

/** Tipos de grade do projeto: os padrão mais os gravados (um gravado com o mesmo id prevalece). */
export function projectGridTypes(p: Pick<Project, 'gridTypes'>): GridType[] {
  const own = p.gridTypes ?? {};
  return [...DEFAULT_GRID_TYPES.filter((t) => !own[t.id]), ...Object.values(own)];
}

export const gridTypeOf = (p: Pick<Project, 'gridTypes'>, id: Id): GridType | undefined => projectGridTypes(p).find((t) => t.id === id);

export const gridOf = (p: Pick<Project, 'grids'>, id: Id): Grid | undefined => projectGrids(p).find((g) => g.id === id);

/**
 * Próximo nome automático, no padrão do Revit: sucessor do nome da última grade criada. "1" → "2", "A" → "B", "Z" → "AA",
 * "A1" → "A2". Sem grades: "1". Se o sucessor já existir, segue em frente até achar um nome livre.
 */
export function nextGridName(p: Pick<Project, 'grids'>): string {
  const all = projectGrids(p);
  if (all.length === 0) return '1';
  const taken = new Set(all.map((g) => g.name));
  let name = successorName(all.reduce((a, b) => (b.order > a.order ? b : a)).name);
  while (taken.has(name)) name = successorName(name);
  return name;
}

function successorName(name: string): string {
  const m = /^(.*?)(\d+)$/.exec(name);
  if (m) {
    const digits = m[2]!;
    return `${m[1]}${String(Number(digits) + 1).padStart(digits.length, '0')}`;
  }
  if (/^[A-Za-z]+$/.test(name)) return successorLetters(name);
  return `${name}1`;
}

function successorLetters(s: string): string {
  const chars = s.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    const c = chars[i]!;
    if (c === 'z') chars[i] = 'a';
    else if (c === 'Z') chars[i] = 'A';
    else {
      chars[i] = String.fromCharCode(c.charCodeAt(0) + 1);
      return chars.join('');
    }
    i -= 1;
  }
  const first = s[0]!;
  return (first === first.toUpperCase() ? 'A' : 'a') + chars.join('');
}

const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Motivo de recusa de uma grade, ou null. `units` formata o trecho mínimo na unidade do projeto. */
export function gridIssue(g: Omit<Grid, 'order'>, units: ResolvedUnits = defaultUnits(), lang: Lang = 'pt'): string | null {
  if (g.name.trim() === '') return translate(lang, 'md_cmd_grid_name_required');
  if (g.points.length < 2) return translate(lang, 'md_cmd_grid_min_points');
  if (g.points.some((q) => !finite(q))) return translate(lang, 'md_cmd_grid_points_finite');
  for (let i = 1; i < g.points.length; i++) {
    if (len(sub(g.points[i]!, g.points[i - 1]!)) < GRID_MIN_SEGMENT) {
      return translate(lang, 'md_cmd_grid_min_segment', { d: formatQuantity(units, 'smallLength', GRID_MIN_SEGMENT, { trim: true }) });
    }
  }
  if (!Number.isFinite(g.sag)) return translate(lang, 'md_cmd_grid_sag_finite');
  if (g.sag !== 0 && g.points.length !== 2) return translate(lang, 'md_cmd_grid_arc_two_points');
  if (g.sag !== 0) {
    const chord = len(sub(g.points[1]!, g.points[0]!));
    if (Math.abs(g.sag) > chord / 2 + 1e-9) return translate(lang, 'md_cmd_grid_sag_half');
  }
  return null;
}

/** Motivo de recusa de um tipo de grade, ou null. */
export function gridTypeIssue(t: GridType, lang: Lang = 'pt'): string | null {
  if (t.name.trim() === '') return translate(lang, 'md_cmd_grid_type_name');
  const pos = (n: number): boolean => Number.isFinite(n) && n > 0;
  if (![t.weightMm, t.centerWeightMm, t.bubbleDiameterMm, t.bubbleTextMm].every(pos)) return translate(lang, 'md_cmd_grid_type_positive');
  if (!(Number.isFinite(t.endLengthMm) && t.endLengthMm >= 0)) return translate(lang, 'md_cmd_grid_type_end_length');
  return null;
}

const refuse = (issue: string | null): void => {
  if (issue) throw new Error(issue);
};

/** Aplica um comando de grade sobre o rascunho do projeto. Lança Error em texto pt-BR se recusar. */
export function applyGridCommand(p: Project, c: GridCommand, lang: Lang = 'pt'): void {
  switch (c.type) {
    case 'addGrid': {
      refuse(gridIssue(c.grid, unitsOf(p), lang));
      if (!gridTypeOf(p, c.grid.typeId)) throw new Error(translate(lang, 'md_cmd_grid_type_missing'));
      if (gridOf(p, c.grid.id)) throw new Error(translate(lang, 'md_cmd_grid_exists'));
      if (projectGrids(p).some((g) => g.name === c.grid.name)) throw new Error(translate(lang, 'md_cmd_grid_name_exists', { name: c.grid.name }));
      p.grids = [...projectGrids(p), { ...c.grid, order: p.nextOrder }];
      p.nextOrder += 1;
      break;
    }
    case 'updateGrid': {
      const old = gridOf(p, c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_grid_missing'));
      const next: Grid = { ...old, ...c.patch, id: old.id, order: old.order };
      refuse(gridIssue(next, unitsOf(p), lang));
      if (!gridTypeOf(p, next.typeId)) throw new Error(translate(lang, 'md_cmd_grid_type_missing'));
      if (projectGrids(p).some((g) => g.id !== old.id && g.name === next.name)) throw new Error(translate(lang, 'md_cmd_grid_name_exists', { name: next.name }));
      p.grids = projectGrids(p).map((g) => (g.id === c.id ? next : g));
      break;
    }
    case 'removeGrid': {
      if (!gridOf(p, c.id)) throw new Error(translate(lang, 'md_cmd_grid_missing'));
      p.grids = projectGrids(p).filter((g) => g.id !== c.id);
      break;
    }
    case 'addGridType': {
      refuse(gridTypeIssue(c.gridType, lang));
      if (gridTypeOf(p, c.gridType.id)) throw new Error(translate(lang, 'md_cmd_grid_type_exists'));
      p.gridTypes = { ...(p.gridTypes ?? {}), [c.gridType.id]: c.gridType };
      break;
    }
    case 'updateGridType': {
      const old = gridTypeOf(p, c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_grid_type_missing'));
      const next: GridType = { ...old, ...c.patch, id: old.id };
      refuse(gridTypeIssue(next, lang));
      p.gridTypes = { ...(p.gridTypes ?? {}), [c.id]: next };
      break;
    }
    case 'removeGridType': {
      if (!gridTypeOf(p, c.id)) throw new Error(translate(lang, 'md_cmd_grid_type_missing'));
      if (projectGrids(p).some((g) => g.typeId === c.id)) throw new Error(translate(lang, 'md_cmd_grid_type_in_use'));
      if (projectGridTypes(p).length <= 1) throw new Error(translate(lang, 'md_cmd_last_grid_type'));
      if (DEFAULT_GRID_TYPES.some((t) => t.id === c.id)) throw new Error(translate(lang, 'md_cmd_grid_type_default'));
      const { [c.id]: _gone, ...rest } = p.gridTypes ?? {};
      p.gridTypes = rest;
      break;
    }
  }
}
