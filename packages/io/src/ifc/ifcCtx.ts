import type { Id, Project } from '@hestia/model';
import { ifcGuid } from './ifcGuid.ts';
import { t, type Lang } from '../i18n.ts';
import { OMIT, stepString, type StepWriter } from './ifcStep.ts';

/** Pavimento IFC: id da entidade IFCBUILDINGSTOREY, sua colocação, cota do nível e os elementos contidos nele. */
export interface IfcStorey {
  id: number;
  place: number;
  elev: number;
  contained: number[];
}

/** Estado da montagem: arquivo, contexto de geometria, pavimentos, materiais e paredes já escritas (id por `wallId`). */
export interface IfcCtx {
  p: Project;
  w: StepWriter;
  ctx: number;
  /** Idioma dos nomes padrão gravados no arquivo; ausente = `'pt'`. */
  lang?: Lang;
  storeys: Map<Id, IfcStorey>;
  materials: Map<Id, number>;
  walls: Map<Id, number>;
  /** `IFCMATERIALLAYERSET` por tipo de parede (um conjunto de camadas serve a todas as paredes do tipo). */
  layerSets: Map<Id, number>;
  /** Tipo de abertura já escrito (`IFCDOORTYPE`/`IFCWINDOWTYPE` por tipo do projeto). */
  openingTypes: Map<Id, number>;
  /** Instâncias de cada tipo de abertura, para o `IFCRELDEFINESBYTYPE` no fim dos vãos. */
  openingTypeMembers: Map<Id, number[]>;
  /** Paredes cuja face externa dá para fora da edificação (calculadas antes de escrever paredes e vãos). */
  external: Set<Id>;
  /** `IFCSURFACESTYLE` de cada material (preenchido por `addStyles`), reutilizado nos `IFCSTYLEDITEM` das peças. */
  styles?: Map<Id, number>;
  /** Itens de geometria que recebem estilo por peça (esquadrias), emitidos depois de `addStyles`. */
  itemStyles?: Array<{ item: number; materialId: Id }>;
  /**
   * Id STEP do produto de cada elemento do projeto, por id do elemento (preenchido por quem cria o produto). É a fonte
   * preferida do `addHestiaPsets`; sem ele, o pset acha o produto pelo GlobalId determinístico (`wall:<id>`, `door:<id>`…).
   */
  products?: Map<Id, number>;
  /** Id STEP do `IFCPROJECT`, alvo do `Pset_Hestia_Project`. Sem ele, o pset acha o projeto pelo GlobalId. */
  project?: number;
  /** Avisos de exportação (ex.: cortina sem geometria do kernel). Ausente = os avisos não são coletados. */
  avisos?: string[];
}

/** Pavimento do nível, ou `undefined` quando o nível não existe no projeto (o elemento não sai). */
export const storeyOf = (c: IfcCtx, levelId: Id): IfcStorey | undefined => c.storeys.get(levelId);

/** Idioma da exportação (contextos antigos sem `lang` continuam em PT). */
export const langOf = (c: IfcCtx): Lang => c.lang ?? 'pt';

/** IFCMATERIAL do material do projeto, criado uma vez. Material ausente vira "Material não definido". */
export function materialOf(c: IfcCtx, materialId: Id): number {
  const known = c.materials.get(materialId);
  if (known !== undefined) return known;
  const name = c.p.materials[materialId]?.name ?? t(langOf(c), 'io_ifc_material_undefined');
  const id = c.w.add('IFCMATERIAL', [stepString(name), OMIT, OMIT]);
  c.materials.set(materialId, id);
  return id;
}

/** Atributo de texto opcional: vazio vira `$`. */
export const optStr = (s: string | undefined): string => (s ? stepString(s) : OMIT);

/** GlobalId (texto STEP) de uma entidade, derivado da chave dela no projeto (`tipo:id`). */
export const gid = (key: string): string => stepString(ifcGuid(key));
