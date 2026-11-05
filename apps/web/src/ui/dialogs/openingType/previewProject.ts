import {
  ProjectStore,
  createEmptyProject,
  makeWall,
  type Opening,
  type OpeningType,
  type Project,
  type Wall,
} from '@hestia/model';
import { t, type Lang } from '../../../editor/i18n.ts';

/** Ids fixos do projeto mínimo de prévia (um nível, uma parede reta e a abertura no centro). */
export const PREVIEW_LEVEL_ID = 'lv_0';
export const PREVIEW_WALL_ID = 'pv_parede';
export const PREVIEW_OPENING_ID = 'pv_abertura';

/** Parede de prévia: alvenaria 14 cm com reboco e pintura, o tipo usado como padrão no editor. */
export const PREVIEW_WALL_TYPE_ID = 'wt_alv14';

/** Vão entre o centro da abertura e as pontas da parede (m). A prévia enquadra a esquadria, não a parede. */
const WALL_END_MARGIN = 0.6;

/** Folga acima do vão para a verga, o alizar e o peitoril saliente aparecerem inteiros (m). */
const WALL_TOP_MARGIN = 0.5;

/** Comprimento da parede da prévia: `largura + 1,2` (spec E §4.4, acabamento visual). */
export function previewWallLength(type: Pick<OpeningType, 'width'>): number {
  return Math.max(0, type.width) + 2 * WALL_END_MARGIN;
}

/** Altura da parede da prévia: `altura + peitoril + 0,5` (spec E §4.4, acabamento visual). */
export function previewWallHeight(type: Pick<OpeningType, 'height' | 'sill'>): number {
  return Math.max(0, type.sill) + Math.max(0, type.height) + WALL_TOP_MARGIN;
}

/**
 * Projeto mínimo da prévia do diálogo (spec E §4.4): um nível, uma parede reta `wt_alv14` de comprimento
 * `largura + 1,2` e altura `altura + peitoril + 0,5`, com a abertura hospedada no centro. Todos os campos v2 do
 * rascunho são preservados; o peitoril de janela vem do tipo. `flipHand` e `flipFacing` são da instância de prévia.
 */
export function previewProject(type: OpeningType, flipHand = false, flipFacing = false, lang: Lang = 'pt'): Project {
  const docName = t(lang, 'dlo_preview_doc_name');
  const base = createEmptyProject(docName);
  const level = base.levels[0]!;
  const wallLength = previewWallLength(type);
  const wallHeight = previewWallHeight(type);
  // O catálogo já nasce com o rascunho; a instância é sempre a mesma abertura de prévia.
  const initial: Project = {
    ...base,
    name: docName,
    levels: [{ ...level, id: PREVIEW_LEVEL_ID, name: t(lang, 'dlo_preview_level_name'), elevation: 0 }],
    openingTypes: { ...base.openingTypes, [type.id]: { ...type } },
    elements: {},
    views: [],
  };
  const store = new ProjectStore(initial);
  store.exec({
    type: 'addWall',
    wall: makeWall({
      id: PREVIEW_WALL_ID,
      typeId: PREVIEW_WALL_TYPE_ID,
      levelId: PREVIEW_LEVEL_ID,
      a: { x: 0, y: 0 },
      b: { x: wallLength, y: 0 },
      height: wallHeight,
    }),
  });
  const opening: Opening = {
    id: PREVIEW_OPENING_ID,
    kind: type.kind,
    typeId: type.id,
    hostId: PREVIEW_WALL_ID,
    offset: wallLength / 2,
    flipHand,
    flipFacing,
    sillOverride: null,
    mark: '',
  };
  store.exec({ type: 'addOpening', opening });
  return store.project;
}

/** Parede da prévia (já com o comprimento certo), ou null se o projeto não for o da prévia. */
export function previewWall(p: Project): Wall | null {
  const w = p.elements[PREVIEW_WALL_ID];
  return w && w.kind === 'wall' ? w : null;
}

/** Abertura da prévia, ou null se o projeto não for o da prévia. */
export function previewOpening(p: Project): Opening | null {
  const o = p.elements[PREVIEW_OPENING_ID];
  return o && (o.kind === 'door' || o.kind === 'window') ? o : null;
}
