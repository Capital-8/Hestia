import type { Id, ProjectSettings } from './types.ts';

export type LeaderArrowStyle = 'arrow' | 'dot' | 'slash' | 'none';
export type SpotPlanSymbol = 'target-bw' | 'crosshair' | 'circle';
export type SpotSectionSymbol = 'triangle-bw' | 'triangle-open' | 'arrow';
export type SpotCoordBase = 'project' | 'survey' | 'relative';
export type NorthArrowStyle = 'nbr-minimal' | 'compass' | 'wind-rose';

export interface TextFamily {
  id: Id;
  name: string;
  textMm: number;
  font: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  opaqueBackground?: boolean;
  frame?: boolean;
  leaderArrow: LeaderArrowStyle;
  color?: string;
}

export interface SpotFamily {
  id: Id;
  name: string;
  kind: 'elevation' | 'coordinate';
  planSymbol: SpotPlanSymbol;
  sectionSymbol: SpotSectionSymbol;
  symbolMm: number;
  textMm: number;
  base: SpotCoordBase;
  prefix: string;
  precision: 0 | 1 | 2 | 3;
  unit: 'project' | 'm' | 'cm' | 'mm';
  showLeader: boolean;
}

export interface RevisionCloudFamily {
  id: Id;
  name: string;
  arcLengthMm: number;
  color: string;
  lineWidthPx: number;
}

export interface NorthArrowFamily {
  id: Id;
  name: string;
  style: NorthArrowStyle;
  diameterMm: number;
  showCardinals: boolean;
  color: string;
}

export const TEXT_FAMILIES_DEFAULT: TextFamily[] = [
  { id: 'txtfam_std', name: 'Texto 2,5 mm Padrão', textMm: 2.5, font: 'Arial Narrow, Arial, sans-serif', opaqueBackground: false, frame: false, leaderArrow: 'arrow' },
  { id: 'txtfam_note', name: 'Nota Técnica 1,8 mm', textMm: 1.8, font: 'Arial Narrow, Arial, sans-serif', opaqueBackground: true, frame: false, leaderArrow: 'dot' },
  { id: 'txtfam_title', name: 'Título 3,5 mm Negrito', textMm: 3.5, font: 'Arial Narrow, Arial, sans-serif', bold: true, opaqueBackground: false, frame: true, leaderArrow: 'none' },
];

export const SPOT_FAMILIES_DEFAULT: SpotFamily[] = [
  { id: 'spot_elev_nbr', name: 'Alvo NBR 6492 (Planta / Corte)', kind: 'elevation', planSymbol: 'target-bw', sectionSymbol: 'triangle-bw', symbolMm: 3.6, textMm: 2.2, base: 'project', prefix: '', precision: 2, unit: 'project', showLeader: false },
  { id: 'spot_elev_rel', name: 'Nível Relativo (Corte P&B)', kind: 'elevation', planSymbol: 'crosshair', sectionSymbol: 'triangle-bw', symbolMm: 3.4, textMm: 2.2, base: 'relative', prefix: 'N.A. ', precision: 2, unit: 'project', showLeader: true },
  { id: 'spot_coord_proj', name: 'Coordenada Projeto (N/E)', kind: 'coordinate', planSymbol: 'target-bw', sectionSymbol: 'triangle-bw', symbolMm: 3.4, textMm: 2.0, base: 'project', prefix: '', precision: 2, unit: 'project', showLeader: true },
  { id: 'spot_coord_surv', name: 'Coordenada Topográfica (Levantamento)', kind: 'coordinate', planSymbol: 'crosshair', sectionSymbol: 'triangle-open', symbolMm: 3.4, textMm: 2.0, base: 'survey', prefix: '', precision: 2, unit: 'project', showLeader: true },
];

export const REV_CLOUD_FAMILIES_DEFAULT: RevisionCloudFamily[] = [
  { id: 'revfam_red', name: 'Revisão Vermelha (4,5 mm)', arcLengthMm: 4.5, color: '#dc2626', lineWidthPx: 1.6 },
  { id: 'revfam_blue', name: 'Revisão Azul (6,0 mm)', arcLengthMm: 6.0, color: '#2563eb', lineWidthPx: 1.4 },
];

export const NORTH_ARROW_FAMILIES_DEFAULT: NorthArrowFamily[] = [
  { id: 'north_nbr', name: 'NBR Minimalista', style: 'nbr-minimal', diameterMm: 9, showCardinals: false, color: '#16181c' },
  { id: 'north_compass', name: 'Bússola Arquitetônica', style: 'compass', diameterMm: 11, showCardinals: true, color: '#16181c' },
  { id: 'north_rose', name: 'Rosa dos Ventos Clássica', style: 'wind-rose', diameterMm: 13, showCardinals: true, color: '#16181c' },
];

export function textFamiliesOf(s?: ProjectSettings): TextFamily[] {
  return s?.textFamilies?.length ? s.textFamilies : TEXT_FAMILIES_DEFAULT;
}
export function defaultTextFamilyIdOf(s?: ProjectSettings): Id {
  const fams = textFamiliesOf(s);
  return s?.defaultTextFamilyId && fams.some((f) => f.id === s.defaultTextFamilyId) ? s.defaultTextFamilyId : fams[0]!.id;
}
export function textFamilyFor(s: ProjectSettings | undefined, id?: Id): TextFamily {
  const fams = textFamiliesOf(s);
  return (id ? fams.find((f) => f.id === id) : undefined) ?? fams.find((f) => f.id === defaultTextFamilyIdOf(s)) ?? fams[0]!;
}

export function spotFamiliesOf(s: ProjectSettings | undefined, kind?: 'elevation' | 'coordinate'): SpotFamily[] {
  const all = s?.spotFamilies?.length ? s.spotFamilies : SPOT_FAMILIES_DEFAULT;
  return kind ? all.filter((f) => f.kind === kind) : all;
}
export function defaultSpotFamilyIdOf(s: ProjectSettings | undefined, kind: 'elevation' | 'coordinate'): Id {
  const fams = spotFamiliesOf(s, kind);
  const pref = kind === 'elevation' ? s?.defaultSpotElevationFamilyId : s?.defaultSpotCoordinateFamilyId;
  return pref && fams.some((f) => f.id === pref) ? pref : fams[0]!.id;
}
export function spotFamilyFor(s: ProjectSettings | undefined, kind: 'elevation' | 'coordinate', id?: Id): SpotFamily {
  const fams = spotFamiliesOf(s, kind);
  return (id ? fams.find((f) => f.id === id) : undefined) ?? fams.find((f) => f.id === defaultSpotFamilyIdOf(s, kind)) ?? fams[0]!;
}

export function revisionCloudFamiliesOf(s?: ProjectSettings): RevisionCloudFamily[] {
  return s?.revisionCloudFamilies?.length ? s.revisionCloudFamilies : REV_CLOUD_FAMILIES_DEFAULT;
}
export function defaultRevisionCloudFamilyIdOf(s?: ProjectSettings): Id {
  const fams = revisionCloudFamiliesOf(s);
  return s?.defaultRevisionCloudFamilyId && fams.some((f) => f.id === s.defaultRevisionCloudFamilyId) ? s.defaultRevisionCloudFamilyId : fams[0]!.id;
}
export function revisionCloudFamilyFor(s: ProjectSettings | undefined, id?: Id): RevisionCloudFamily {
  const fams = revisionCloudFamiliesOf(s);
  return (id ? fams.find((f) => f.id === id) : undefined) ?? fams.find((f) => f.id === defaultRevisionCloudFamilyIdOf(s)) ?? fams[0]!;
}

export function northArrowFamiliesOf(s?: ProjectSettings): NorthArrowFamily[] {
  return s?.northArrowFamilies?.length ? s.northArrowFamilies : NORTH_ARROW_FAMILIES_DEFAULT;
}
export function defaultNorthArrowFamilyIdOf(s?: ProjectSettings): Id {
  const fams = northArrowFamiliesOf(s);
  return s?.defaultNorthArrowFamilyId && fams.some((f) => f.id === s.defaultNorthArrowFamilyId) ? s.defaultNorthArrowFamilyId : fams[0]!.id;
}
export function northArrowFamilyFor(s: ProjectSettings | undefined, id?: Id): NorthArrowFamily {
  const fams = northArrowFamiliesOf(s);
  return (id ? fams.find((f) => f.id === id) : undefined) ?? fams.find((f) => f.id === defaultNorthArrowFamilyIdOf(s)) ?? fams[0]!;
}

function upsert<T extends { id: Id }>(list: T[], item: T): T[] {
  const next = [...list];
  const i = next.findIndex((x) => x.id === item.id);
  if (i >= 0) next[i] = item;
  else next.push(item);
  return next;
}

export function writeTextFamily(s: ProjectSettings, item: TextFamily): ProjectSettings {
  return { ...s, textFamilies: upsert(textFamiliesOf(s), item) };
}
export function removeTextFamilyFrom(s: ProjectSettings, id: Id): ProjectSettings {
  const next = textFamiliesOf(s).filter((x) => x.id !== id);
  if (!next.length) return s;
  const out: ProjectSettings = { ...s, textFamilies: next };
  if (s.defaultTextFamilyId === id) delete out.defaultTextFamilyId;
  return out;
}

export function writeSpotFamily(s: ProjectSettings, item: SpotFamily): ProjectSettings {
  return { ...s, spotFamilies: upsert(spotFamiliesOf(s), item) };
}
export function removeSpotFamilyFrom(s: ProjectSettings, id: Id): ProjectSettings {
  const target = spotFamiliesOf(s).find((x) => x.id === id);
  const next = spotFamiliesOf(s).filter((x) => x.id !== id);
  if (!target || !next.some((x) => x.kind === target.kind)) return s;
  const out: ProjectSettings = { ...s, spotFamilies: next };
  if (s.defaultSpotElevationFamilyId === id) delete out.defaultSpotElevationFamilyId;
  if (s.defaultSpotCoordinateFamilyId === id) delete out.defaultSpotCoordinateFamilyId;
  return out;
}

export function writeRevisionCloudFamily(s: ProjectSettings, item: RevisionCloudFamily): ProjectSettings {
  return { ...s, revisionCloudFamilies: upsert(revisionCloudFamiliesOf(s), item) };
}
export function removeRevisionCloudFamilyFrom(s: ProjectSettings, id: Id): ProjectSettings {
  const next = revisionCloudFamiliesOf(s).filter((x) => x.id !== id);
  if (!next.length) return s;
  const out: ProjectSettings = { ...s, revisionCloudFamilies: next };
  if (s.defaultRevisionCloudFamilyId === id) delete out.defaultRevisionCloudFamilyId;
  return out;
}

export function writeNorthArrowFamily(s: ProjectSettings, item: NorthArrowFamily): ProjectSettings {
  return { ...s, northArrowFamilies: upsert(northArrowFamiliesOf(s), item) };
}
export function removeNorthArrowFamilyFrom(s: ProjectSettings, id: Id): ProjectSettings {
  const next = northArrowFamiliesOf(s).filter((x) => x.id !== id);
  if (!next.length) return s;
  const out: ProjectSettings = { ...s, northArrowFamilies: next };
  if (s.defaultNorthArrowFamilyId === id) delete out.defaultNorthArrowFamilyId;
  return out;
}
