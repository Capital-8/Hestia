import type { Id, ProjectSettings } from './types.ts';
import type { Terrain } from './terrainTypes.ts';
import { TERRENO_LIMITES } from './terrainTypes.ts';

/**
 * Tipo de terreno (família/tipo, mesmo molde de `terrainLotFamilies.ts`): lista em `ProjectSettings.terrainTypes` (ausente = os padrões), referenciada
 * por `Terrain.tipoId`. Reúne as configurações do terreno que não são da geometria: aparência da SUPERFÍCIE e do SOLO (laterais e base do corte, e o
 * corpo cortado nas seções e elevações), curvas de nível (equidistância, mestra, cor e peso), família do texto do rótulo (`rotuloFamilyId`, uma
 * `TerrainTextFamily` de `contour`: fonte, altura, unidade, casas, cor) e o rótulo automático das curvas.
 *
 * Compatibilidade: terreno sem `tipoId` (todo arquivo anterior) segue com os campos próprios e o solo igual à superfície. Com `tipoId`, o tipo vale
 * (`terrenoComTipo`). Sem mudança de versão do esquema: `terrainTypes` e `tipoId` são opcionais (ver docs/decisoes/0027-tipo-de-terreno.md).
 */
export interface TerrainType {
  id: Id;
  name: string;
  /** Superfície (topo): material do projeto, senão cor. */
  superficieMaterialId?: Id;
  superficieColor?: string;
  /** Solo (laterais, base e corpo cortado nas seções): material do projeto, senão cor. Ausente = o solo usa a aparência da superfície. */
  soloMaterialId?: Id;
  soloColor?: string;
  /** Equidistância das curvas de nível (m). Mínimo 0,05. */
  intervaloCurvas: number;
  /** Uma curva mestra a cada N curvas. Inteiro de 1 a 100. */
  mestraCada: number;
  /** Cor das curvas em planta; ausente = a cor da superfície (ou a padrão do desenho). */
  curvaCor?: string;
  /** Multiplicadores do peso de linha das curvas normais e das mestras. */
  curvaPeso: number;
  mestraPeso: number;
  /** `TerrainTextFamily` (`kind: 'contour'`) do texto dos rótulos; ausente = a padrão do projeto. */
  rotuloFamilyId?: Id;
  /** Desenha as cotas nas curvas sem precisar das linhas de rótulo. */
  rotularCurvas: boolean;
  /** Rótulo automático em uma curva mestra a cada N (1 = em todas). */
  rotularCada: number;
}

export const TERRAIN_TYPE_LIMITES = { pesoMin: 0.25, pesoMax: 8 } as const;

export const COR_SUPERFICIE_PADRAO = '#7f9f5c';
export const COR_SOLO_PADRAO = '#8b6b4a';

export const TERRAIN_TYPES_DEFAULT: TerrainType[] = [
  {
    id: 'tntype_std',
    name: 'Terreno padrão (grama sobre solo)',
    superficieColor: COR_SUPERFICIE_PADRAO,
    soloColor: COR_SOLO_PADRAO,
    curvaCor: '#8a6a3a',
    intervaloCurvas: 1,
    mestraCada: 5,
    curvaPeso: 1,
    mestraPeso: 1.6,
    rotularCurvas: false,
    rotularCada: 1,
  },
  {
    id: 'tntype_rotulado',
    name: 'Terreno com cotas nas curvas',
    superficieColor: COR_SUPERFICIE_PADRAO,
    soloColor: COR_SOLO_PADRAO,
    curvaCor: '#8a6a3a',
    intervaloCurvas: 1,
    mestraCada: 5,
    curvaPeso: 1,
    mestraPeso: 1.6,
    rotularCurvas: true,
    rotularCada: 1,
  },
];

export function terrainTypesOf(s: Pick<ProjectSettings, 'terrainTypes'> | undefined): TerrainType[] {
  return s?.terrainTypes?.length ? s.terrainTypes : TERRAIN_TYPES_DEFAULT;
}
export function defaultTerrainTypeIdOf(s: Pick<ProjectSettings, 'terrainTypes' | 'defaultTerrainTypeId'> | undefined): Id {
  const all = terrainTypesOf(s);
  return s?.defaultTerrainTypeId && all.some((x) => x.id === s.defaultTerrainTypeId) ? s.defaultTerrainTypeId : all[0]!.id;
}
/** Tipo do terreno, ou `undefined` se o terreno não tem tipo (ou o tipo foi removido: volta ao comportamento próprio). */
export function tipoDoTerreno(s: Pick<ProjectSettings, 'terrainTypes'> | undefined, t: Pick<Terrain, 'tipoId'>): TerrainType | undefined {
  return t.tipoId ? terrainTypesOf(s).find((x) => x.id === t.tipoId) : undefined;
}

function upsert<T extends { id: Id }>(list: T[], item: T): T[] {
  const next = [...list];
  const i = next.findIndex((x) => x.id === item.id);
  if (i >= 0) next[i] = item;
  else next.push(item);
  return next;
}

export function writeTerrainType(s: ProjectSettings, item: TerrainType): ProjectSettings {
  return { ...s, terrainTypes: upsert(terrainTypesOf(s), item) };
}
export function removeTerrainTypeFrom(s: ProjectSettings, id: Id): ProjectSettings {
  const all = terrainTypesOf(s);
  const next = all.filter((x) => x.id !== id);
  if (!next.length || next.length === all.length) return s;
  const out: ProjectSettings = { ...s, terrainTypes: next };
  if (s.defaultTerrainTypeId === id) delete out.defaultTerrainTypeId;
  return out;
}

/** Problema do tipo (chave de mensagem do modelo e parâmetros), ou null se válido. */
export function terrainTypeIssue(x: TerrainType): { key: 'md_tn_intervalo' | 'md_tn_mestra'; params: Record<string, number> } | null {
  const L = TERRENO_LIMITES;
  if (!Number.isFinite(x.intervaloCurvas) || x.intervaloCurvas < L.intervaloMin) return { key: 'md_tn_intervalo', params: { min: L.intervaloMin } };
  const inteiro = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= L.mestraMax;
  if (!inteiro(x.mestraCada) || !inteiro(x.rotularCada)) return { key: 'md_tn_mestra', params: { max: L.mestraMax } };
  return null;
}

const memo = new WeakMap<Terrain, { tipo: TerrainType; copia: Terrain }>();

/**
 * O terreno como o desenho e o kernel o veem: com tipo, a equidistância, a mestra, a aparência da superfície (`materialId`/`color`) e a família do
 * rótulo vêm do tipo; sem tipo, é o próprio terreno (mesma referência). A cópia é memorizada pela identidade do terreno e do tipo.
 */
export function terrenoComTipo(s: Pick<ProjectSettings, 'terrainTypes'> | undefined, t: Terrain): Terrain {
  const tipo = tipoDoTerreno(s, t);
  if (!tipo) return t;
  const m = memo.get(t);
  if (m && m.tipo === tipo) return m.copia;
  const copia: Terrain = { ...t, intervaloCurvas: tipo.intervaloCurvas, mestraCada: tipo.mestraCada };
  if (tipo.superficieMaterialId !== undefined || tipo.superficieColor !== undefined) {
    delete copia.materialId;
    delete copia.color;
    if (tipo.superficieMaterialId !== undefined) copia.materialId = tipo.superficieMaterialId;
    if (tipo.superficieColor !== undefined) copia.color = tipo.superficieColor;
  }
  if (tipo.rotuloFamilyId !== undefined) copia.rotuloFamilyId = tipo.rotuloFamilyId;
  memo.set(t, { tipo, copia });
  return copia;
}

/** Material e cor do solo de um terreno: os do tipo; sem tipo ou sem solo definido, `undefined` (o chamador usa a superfície, como antes do tipo). */
export function soloDoTerreno(s: Pick<ProjectSettings, 'terrainTypes'> | undefined, t: Pick<Terrain, 'tipoId'>): { materialId?: Id; color?: string } | undefined {
  const tipo = tipoDoTerreno(s, t);
  if (!tipo || (tipo.soloMaterialId === undefined && tipo.soloColor === undefined)) return undefined;
  return { ...(tipo.soloMaterialId !== undefined ? { materialId: tipo.soloMaterialId } : {}), ...(tipo.soloColor !== undefined ? { color: tipo.soloColor } : {}) };
}
