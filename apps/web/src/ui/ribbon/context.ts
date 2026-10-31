import type { Project, Id } from '@hestia/model';
import type { ToolId, ToolOptions } from '@hestia/tools';
import type { SketchTarget } from '@hestia/geom';
import { toolLabel } from '../../editor/i18n.ts';
import type { PastePreviewState } from '../../editor/pasteLevels/types.ts';
import { perimeterContextTab, type PerimeterContextTab } from '../perimeter/PerimeterRibbonPanels.tsx';
import { act, option, panel, soonS, stack, t, tool, type RibbonPanel, type RibbonTab, type Txt } from './model.ts';
import { P_CLIPBOARD, P_CREATE, P_GEOMETRY, P_MEASURE, P_MODIFY, P_PROPS, P_SELECT, P_SELECTION_EXTRA, P_VIEW_MOD } from './panelsShared.ts';

/**
 * Aba contextual verde ("Modificar | …"): nasce quando há ferramenta de criação ativa ou seleção, traz painéis do
 * assunto e some quando o assunto acaba. A `key` identifica o assunto: mudou, a faixa seleciona a aba de novo.
 */
export interface ContextTab {
  key: string;
  tab: RibbonTab;
}

/** Ferramentas que colocam algo no projeto (no Revit: "Modificar | Colocar X"). As de edição não abrem aba. */
const PLACE: ReadonlySet<ToolId> = new Set<ToolId>(['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof', 'roofextrusion', 'roofarrow', 'slope', 'stair', 'stairrun', 'ramp', 'room', 'roomsep', 'dimension', 'angularDimension', 'text', 'detailLine', 'filledRegion', 'tag']);

const same = <K extends keyof ToolOptions>(key: K, value: ToolOptions[K]) => (o: ToolOptions): boolean => o[key] === value;

/** Modos de desenho (opções da ferramenta) como botões pressionáveis, no painel "Desenhar". */
function drawPanel(id: ToolId): RibbonPanel | null {
  const mk = (...items: ReturnType<typeof option>[]): RibbonPanel => panel('desenhar', t('Desenhar', 'Draw'), stack(...items.slice(0, 3)), ...(items.length > 3 ? [stack(...items.slice(3, 6))] : []));
  switch (id) {
    case 'wall':
      return mk(
        option(t('Linha', 'Line'), 'wall', same('wallShape', 'line'), { wallShape: 'line' }),
        option(t('Arco (3 pontos)', 'Arc (3 points)'), 'detailLine', same('wallShape', 'arc'), { wallShape: 'arc' }),
        option(t('Retângulo', 'Rectangle'), 'plan', same('wallShape', 'rect'), { wallShape: 'rect' }),
      );
    default:
      return null;
  }
}

/** Painel "Editar perímetro" das categorias que têm contorno (telhado, piso, laje, forro). */
const PERIMETRO = panel('perimetro', t('Perímetro', 'Perimeter'), act('editPerimeter'));

/** Painéis do assunto de cada categoria selecionada. */
const CATEGORY: Record<string, { label: Txt; panels: RibbonPanel[] }> = {
  wall: { label: t('Paredes', 'Walls'), panels: [panel('modificar-parede', t('Modificar parede', 'Modify Wall'), stack(tool('attachroof', 'small'), tool('detachroof', 'small'), soonS(t('Editar perfil', 'Edit Profile'), 'soon')))] },
  door: { label: t('Portas', 'Doors'), panels: [panel('hospedeiro', t('Hospedeiro', 'Host'), tool('rehost'))] },
  window: { label: t('Janelas', 'Windows'), panels: [panel('hospedeiro', t('Hospedeiro', 'Host'), tool('rehost'))] },
  floor: { label: t('Pisos', 'Floors'), panels: [PERIMETRO] },
  slab: { label: t('Lajes', 'Slabs'), panels: [panel('editar-forma', t('Editar forma', 'Shape Editing'), tool('slope')), PERIMETRO] },
  ceiling: { label: t('Forros', 'Ceilings'), panels: [PERIMETRO] },
  roof: { label: t('Telhados', 'Roofs'), panels: [panel('modificar-telhado', t('Modificar telhado', 'Modify Roof'), tool('roofarrow')), PERIMETRO] },
  stair: { label: t('Escadas', 'Stairs'), panels: [panel('escada', t('Escada', 'Stair'), act('stairSketch'), act('stairTypes'), act('schedStairs', 'large', t('Tabela de escadas', 'Stair Schedule')))] },
  ramp: { label: t('Rampas', 'Ramps'), panels: [panel('rampa', t('Rampa', 'Ramp'), act('rampTypes'), act('schedRamps', 'large', t('Tabela de rampas', 'Ramp Schedule')))] },
  room: { label: t('Ambientes', 'Rooms'), panels: [panel('ambiente', t('Ambiente', 'Room'), tool('roomsep'))] },
};

/** Base dos painéis de uma aba contextual, na ordem do Revit. */
const base = (...extra: RibbonPanel[]): RibbonPanel[] => [P_SELECT, P_PROPS, P_CLIPBOARD, P_GEOMETRY, P_MODIFY, P_VIEW_MOD, P_MEASURE, P_CREATE, ...extra];

export function contextTab(toolId: ToolId, selection: readonly Id[], p: Project): ContextTab | null {
  if (toolId !== 'select') {
    if (!PLACE.has(toolId)) return null;
    const draw = drawPanel(toolId);
    const name = { pt: toolLabel(toolId, 'pt'), en: toolLabel(toolId, 'en') };
    return {
      key: `tool:${toolId}`,
      tab: { id: 'ctx', label: { pt: `Modificar | Colocar ${name.pt}`, en: `Modify | Place ${name.en}` }, panels: [P_SELECT, P_PROPS, P_MODIFY, P_MEASURE, P_CREATE, ...(draw ? [draw] : [])] },
    };
  }
  if (selection.length === 0) return null;
  const kinds = new Set<string>();
  for (const id of selection) {
    const k = p.elements[id]?.kind;
    if (k) kinds.add(k);
  }
  if (kinds.size === 0) return null;
  if (kinds.size > 1) {
    return { key: 'sel:multi', tab: { id: 'ctx', label: t('Modificar | Seleção múltipla', 'Modify | Multi-Select'), panels: base(P_SELECTION_EXTRA) } };
  }
  const kind = [...kinds][0]!;
  const cat = CATEGORY[kind];
  const label: Txt = cat ? { pt: `Modificar | ${txtPt(cat.label)}`, en: `Modify | ${txtEn(cat.label)}` } : t('Modificar | Elementos', 'Modify | Elements');
  return { key: `sel:${kind}`, tab: { id: 'ctx', label, panels: base(...(cat?.panels ?? []), P_SELECTION_EXTRA) } };
}

/**
 * Aba contextual da prévia do Colar alinhado ("Modificar | Colar alinhado"). A `key` inclui os níveis de destino para a
 * faixa selecionar a aba quando a prévia muda; os painéis V/X e de informação entram em `Ribbon.tsx`
 * (`ConfirmCancelPanel`), que é quem tem a prévia em mãos.
 */
export function pasteLevelsTab(preview: PastePreviewState): ContextTab {
  return {
    key: `paste:levels:${preview.levelIds.join('+')}`,
    tab: {
      id: 'ctx',
      label: t('Modificar | Colar alinhado', 'Modify | Paste Aligned'),
      panels: [P_SELECT, P_PROPS],
    },
  };
}

/** Títulos da aba do modo de perímetro quando se edita um elemento existente ("Editar perímetro do …"). */
const EDITAR_PERIMETRO: Record<SketchTarget, { pt: string; en: string }> = {
  roof: { pt: 'Editar perímetro do telhado', en: 'Edit Roof Perimeter' },
  floor: { pt: 'Editar perímetro do piso', en: 'Edit Floor Perimeter' },
  slab: { pt: 'Editar perímetro da laje', en: 'Edit Slab Perimeter' },
  ceiling: { pt: 'Editar perímetro do forro', en: 'Edit Ceiling Perimeter' },
};

/**
 * Aba contextual do modo de perímetro. Ao criar, é a de `perimeterContextTab` ("Criar perímetro …"); ao editar um
 * elemento (`editing`), o título muda e a chave inclui o elemento, para a faixa selecionar a aba de novo.
 */
export function perimeterTab(target: SketchTarget, editing?: Id): PerimeterContextTab {
  const tab = perimeterContextTab(target);
  if (!editing) return tab;
  return { ...tab, key: `perimeter:${target}:${editing}`, label: { pt: `Modificar | ${EDITAR_PERIMETRO[target].pt}`, en: `Modify | ${EDITAR_PERIMETRO[target].en}` } };
}

const txtPt = (x: Txt): string => (typeof x === 'string' ? x : x.pt);
const txtEn = (x: Txt): string => (typeof x === 'string' ? x : x.en);
