import { multiArea, type Polygon, type Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import { isCeiling, type Ceiling, type CeilingType, type Id, type Layer, type Project } from './types.ts';

type CeilingInput = { id: Id; typeId: Id; levelId: Id; boundary: Vec2[] } & Partial<Omit<Ceiling, 'order' | 'kind'>>;

/** Pé-direito padrão do forro, em metros acima do nível (a cota do topo do forro; decisão 0021). */
export const DEFAULT_CEILING_HEIGHT = 2.6;

/** Constrói um forro com os campos padrão; `order` é atribuído pelo comando addCeiling. */
export function makeCeiling(c: CeilingInput): Omit<Ceiling, 'order'> {
  return { kind: 'ceiling', holes: [], heightOffset: DEFAULT_CEILING_HEIGHT, mark: '', comments: '', roomId: null, ...c };
}

export const ceilingsOnLevel = (p: Project, levelId: Id): Ceiling[] =>
  Object.values(p.elements)
    .filter(isCeiling)
    .filter((c) => c.levelId === levelId)
    .sort((a, b) => a.order - b.order);

/** Forro que acompanha o ambiente de origem: tem `roomId` e não foi solto (`roomLinked` ausente ou verdadeiro). */
export const followsRoom = (c: Pick<Ceiling, 'roomId' | 'roomLinked'>): boolean => !!c.roomId && c.roomLinked !== false;

export const ceilingTypeThickness = (t: CeilingType): number => t.layers.reduce((s, l) => s + l.thickness, 0);

/** Polígono do forro (contorno + furos) para as operações de geometria. */
export const ceilingPolygon = (c: Pick<Ceiling, 'boundary' | 'holes'>): Polygon => [c.boundary, ...c.holes];

/** Área líquida em planta (contorno menos furos), metros quadrados. */
export function ceilingArea(c: Pick<Ceiling, 'boundary' | 'holes'>): number {
  return multiArea([ceilingPolygon(c)]);
}

const L = (fn: Layer['function'], materialId: string, thickness: number): Layer => ({ function: fn, materialId, thickness, wraps: false });

const ct = (id: string, name: string, code: string, description: string, layers: Layer[], cost = 0): CeilingType => ({ id, name, code, description, layers, cost });

/** Tipos de forro iniciais (camadas do topo para baixo: estrutura acima, acabamento visível embaixo), no idioma pedido. */
export function ceilingTypes(lang: Lang = 'pt'): CeilingType[] {
  return [
    { ...ct('ct_gesso', t(lang, 'md_ceiling_gesso'), 'FR-01', t(lang, 'md_ceiling_gesso_desc'), [
      L('structure', 'mat_perfil', 0.03),
      L('finish1', 'mat_gesso', 0.0125),
    ], 70), hatch: 'gesso' },
    ct('ct_pvc', t(lang, 'md_ceiling_pvc'), 'FR-02', t(lang, 'md_ceiling_pvc_desc'), [
      L('structure', 'mat_madeira', 0.02),
      L('finish1', 'mat_pvc', 0.01),
    ], 95),
    ct('ct_laje', t(lang, 'md_ceiling_laje'), 'FR-03', t(lang, 'md_ceiling_laje_desc'), [
      L('finish1', 'mat_tinta', 0.003),
    ], 25),
  ];
}

/** Tipos de forro em PT (compatibilidade); use `ceilingTypes(lang)` para o idioma ativo. */
export const DEFAULT_CEILING_TYPES: CeilingType[] = ceilingTypes('pt');
