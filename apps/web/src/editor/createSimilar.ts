import { isBeam, isColumn, isFooting, type Element, type Id, type Project } from '@hestia/model';
import type { ToolId } from '@hestia/tools';
import { useUi } from './state.ts';

/** Opção de `ToolOptions` que guarda o tipo de cada ferramenta de criação. */
export type CreateSimilarOption =
  | 'wallTypeId'
  | 'doorTypeId'
  | 'windowTypeId'
  | 'floorTypeId'
  | 'slabTypeId'
  | 'ceilingTypeId'
  | 'roofTypeId'
  | 'columnTypeId'
  | 'beamTypeId'
  | 'footingTypeId';

/** Alvo de "Criar semelhante": a ferramenta de criação, a opção de tipo dela e o tipo do elemento. */
export interface CreateSimilarTarget {
  tool: ToolId;
  option: CreateSimilarOption;
  typeId: Id;
}

/** Tipo de elemento -> ferramenta de criação e a opção de tipo dela (Criar semelhante). */
const FERRAMENTA_DO_TIPO: Record<string, { tool: ToolId; option: CreateSimilarOption }> = {
  wall: { tool: 'wall', option: 'wallTypeId' },
  door: { tool: 'door', option: 'doorTypeId' },
  window: { tool: 'window', option: 'windowTypeId' },
  floor: { tool: 'floor', option: 'floorTypeId' },
  slab: { tool: 'slab', option: 'slabTypeId' },
  ceiling: { tool: 'ceiling', option: 'ceilingTypeId' },
  roof: { tool: 'roof', option: 'roofTypeId' },
  column: { tool: 'column', option: 'columnTypeId' },
  beam: { tool: 'beam', option: 'beamTypeId' },
  footing: { tool: 'footing', option: 'footingTypeId' },
};

/** Tipo da instância, quando ela guarda um; null para elementos sem tipo (ambiente, objeto importado...). */
function typeIdDoElemento(e: Element): Id | null {
  const typeId = (e as { typeId?: unknown }).typeId;
  return typeof typeId === 'string' ? typeId : null;
}

/**
 * Aplica os parâmetros de colocação estrutural (pilar, viga ou sapata) nas opções ativas da UI
 * e devolve a ferramenta correspondente.
 */
export function applyStructuralPlacementDefaults(e: Element): 'column' | 'beam' | 'footing' | null {
  if (isColumn(e)) {
    useUi.setState((s) => ({
      options: {
        ...s.options,
        columnTypeId: e.typeId,
        columnHeight: e.height,
        columnRotation: e.rotation,
        columnBaseOffset: e.baseOffset,
        columnTopLevelId: e.topLevelId,
        columnTopOffset: e.topOffset,
      },
    }));
    return 'column';
  }
  if (isBeam(e)) {
    useUi.setState((s) => ({
      options: {
        ...s.options,
        beamTypeId: e.typeId,
        beamJustify: e.justify,
        beamZOffset: e.zOffset,
      },
    }));
    return 'beam';
  }
  if (isFooting(e)) {
    const ex = e.eccentricityX ?? 0;
    const ey = e.eccentricityY ?? 0;
    useUi.setState((s) => ({
      options: {
        ...s.options,
        footingTypeId: e.typeId,
        footingRotation: e.rotation,
        footingHeightOffset: e.heightOffset,
        footingEccentric: Math.hypot(ex, ey) > 1e-6,
        footingEccentricityX: ex,
        footingEccentricityY: ey,
      },
    }));
    return 'footing';
  }
  return null;
}

/**
 * Alvo de "Criar semelhante" (função pura): null quando a seleção está vazia, tem id inexistente, mistura tipos de
 * elemento, o tipo de elemento não tem ferramenta de criação ou os elementos têm tipos (de tipo) diferentes.
 * Caso contrário, devolve a ferramenta e o tipo do primeiro elemento.
 */
export function createSimilarTarget(p: Project, selection: readonly Id[]): CreateSimilarTarget | null {
  if (selection.length === 0) return null;
  const elementos: Element[] = [];
  for (const id of selection) {
    const e = p.elements[id];
    if (!e) return null;
    elementos.push(e);
  }
  const primeiro = elementos[0];
  if (!primeiro) return null;
  const alvo = FERRAMENTA_DO_TIPO[primeiro.kind];
  if (!alvo) return null;
  if (elementos.some((e) => e.kind !== primeiro.kind)) return null;
  const typeId = typeIdDoElemento(primeiro);
  if (!typeId) return null;
  if (elementos.some((e) => typeIdDoElemento(e) !== typeId)) return null;
  return { tool: alvo.tool, option: alvo.option, typeId };
}

/**
 * "Criar semelhante": ativa a ferramenta do tipo do elemento selecionado, já com o tipo dele escolhido nas opções.
 * Recebe o `setTool` do editor para não depender do controlador (e não criar ciclo de importação com ele).
 * Devolve false (sem mexer na ferramenta nem nas opções) quando a seleção não tem alvo.
 */
export function startCreateSimilar(p: Project, setTool: (id: ToolId) => void): boolean {
  const selection = useUi.getState().selection;
  const alvo = createSimilarTarget(p, selection);
  if (!alvo) return false;
  useUi.setState((s) => ({ options: { ...s.options, [alvo.option]: alvo.typeId } }));
  const primeiro = selection.length > 0 ? p.elements[selection[0]!] : undefined;
  if (primeiro) applyStructuralPlacementDefaults(primeiro);
  setTool(alvo.tool);
  return true;
}
