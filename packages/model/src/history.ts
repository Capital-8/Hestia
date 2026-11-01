import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { applyCommand, type Command } from './commands.ts';
import type { Project } from './types.ts';

enablePatches();

interface Entry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

type Listener = () => void;

/**
 * Armazena o projeto e o histórico. Toda escrita passa por `exec`; transações agrupam
 * vários comandos num único passo de desfazer (arrastar = 1 passo).
 */
export class ProjectStore {
  private present: Project;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private listeners = new Set<Listener>();
  private tx: { label: string; patches: Patch[]; inverse: Patch[] } | null = null;
  /** Última transação de uma sessão (ex.: Copiar): novas transações da mesma sessão entram nesse passo. */
  private lastSession: { key: object; entry: Entry } | null = null;
  /** Incrementa a cada mudança; serve de chave de cache. */
  version = 0;
  /** Versão do último salvamento, para o aviso de alterações não salvas. */
  savedVersion = 0;

  constructor(initial: Project) {
    this.present = initial;
  }

  get project(): Project {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past[this.past.length - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  get dirty(): boolean {
    return this.version !== this.savedVersion;
  }

  markSaved(): void {
    this.savedVersion = this.version;
    this.emit();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  /** Substitui o projeto inteiro (abrir arquivo) e zera o histórico. */
  load(p: Project): void {
    this.present = p;
    this.past = [];
    this.future = [];
    this.tx = null;
    this.emit();
    this.savedVersion = this.version;
  }

  exec(cmd: Command, label = labelOf(cmd)): void {
    const [next, patches, inverse] = produceWithPatches(this.present, (draft) => {
      applyCommand(draft as Project, cmd);
    });
    if (patches.length === 0) return;
    this.present = next;
    if (this.tx) {
      this.tx.patches.push(...patches);
      this.tx.inverse.unshift(...inverse);
    } else {
      this.past.push({ label, patches, inverse });
      this.future = [];
    }
    this.emit();
  }

  /**
   * Executa vários comandos como um único passo de desfazer. Com `session` (chave da sessão da ferramenta),
   * a transação se junta ao passo anterior da mesma sessão enquanto ele ainda for o último do histórico
   * (ex.: várias cópias num mesmo Copiar viram um só Ctrl+Z).
   */
  transaction(label: string, fn: () => void, session?: object): void {
    if (this.tx) {
      fn();
      return;
    }
    this.tx = { label, patches: [], inverse: [] };
    try {
      fn();
    } finally {
      const done = this.tx;
      this.tx = null;
      if (done.patches.length > 0) {
        const last = this.past[this.past.length - 1];
        const s = this.lastSession;
        if (session && s && s.key === session && s.entry === last) {
          // Undo do passo: o inverso das novas alterações vai antes do inverso já guardado.
          s.entry.patches.push(...done.patches);
          s.entry.inverse.unshift(...done.inverse);
        } else {
          this.past.push(done);
          this.lastSession = session ? { key: session, entry: done } : null;
        }
        this.future = [];
        this.emit();
      }
    }
  }

  undo(): void {
    const e = this.past.pop();
    if (!e) return;
    this.present = applyPatches(this.present, e.inverse);
    this.future.push(e);
    this.emit();
  }

  redo(): void {
    const e = this.future.pop();
    if (!e) return;
    this.present = applyPatches(this.present, e.patches);
    this.past.push(e);
    this.emit();
  }
}

export function labelOf(c: Command): string {
  switch (c.type) {
    case 'addWall':
      return 'Criar parede';
    case 'addCadDrawing':
      return 'Inserir CAD';
    case 'updateCadDrawing':
      return 'Editar CAD importado';
    case 'addGeneric':
      return 'Inserir objeto importado';
    case 'updateGeneric':
      return 'Editar objeto importado';
    case 'addCopyLink':
      return 'Manter cópias vinculadas';
    case 'deleteCopyLink':
      return 'Desvincular';
    case 'addFloor':
      return 'Criar piso';
    case 'upsertFloorType':
      return 'Editar tipo de piso';
    case 'deleteFloorType':
      return 'Excluir tipo de piso';
    case 'addSlab':
      return 'Criar laje';
    case 'upsertSlabType':
      return 'Editar tipo de laje';
    case 'deleteSlabType':
      return 'Excluir tipo de laje';
    case 'addRoof':
      return 'Criar telhado';
    case 'addCeiling':
      return 'Criar forro';
    case 'addCeilings':
      return c.ceilings.length === 1 ? 'Criar forro' : 'Criar forros por ambiente';
    case 'updateCeiling':
      return 'Alterar forro';
    case 'removeCeiling':
      return 'Excluir forro';
    case 'upsertCeilingType':
      return 'Editar tipo de forro';
    case 'deleteCeilingType':
      return 'Excluir tipo de forro';
    case 'duplicateCeilingType':
      return 'Duplicar tipo de forro';
    case 'addRoom':
      return 'Criar ambiente';
    case 'updateRoom':
      return 'Alterar ambiente';
    case 'removeRoom':
      return 'Excluir ambiente';
    case 'upsertRoofType':
      return 'Editar tipo de telhado';
    case 'deleteRoofType':
      return 'Excluir tipo de telhado';
    case 'addStair':
      return 'Criar escada';
    case 'upsertStairType':
      return 'Editar tipo de escada';
    case 'deleteStairType':
      return 'Excluir tipo de escada';
    case 'addRamp':
      return 'Criar rampa';
    case 'upsertRampType':
      return 'Editar tipo de rampa';
    case 'deleteRampType':
      return 'Excluir tipo de rampa';
    case 'addOpening':
      return c.opening.kind === 'door' ? 'Inserir porta' : 'Inserir janela';
    case 'updateElements':
      return 'Alterar propriedades';
    case 'detachOutline':
      return 'Soltar contorno das paredes';
    case 'relinkOutline':
      return 'Revincular contorno às paredes';
    case 'detachCeilingRoom':
      return 'Soltar forro do ambiente';
    case 'relinkCeilingRoom':
      return 'Revincular forro ao ambiente';
    case 'setWallEnds':
      return 'Ajustar parede';
    case 'setJoin':
      return 'Alterar junção';
    case 'transform':
      return c.copy ? 'Copiar' : c.transform.kind === 'translate' ? 'Mover' : c.transform.kind === 'rotate' ? 'Rotacionar' : 'Espelhar';
    case 'splitWall':
      return 'Dividir parede';
    case 'deleteElements':
      return 'Excluir';
    case 'upsertWallType':
      return 'Editar tipo de parede';
    case 'deleteWallType':
      return 'Excluir tipo de parede';
    case 'upsertMaterial':
      return 'Editar material';
    case 'upsertOpeningType':
      return 'Editar tipo de abertura';
    case 'upsertLevel':
      return 'Editar nível';
    case 'deleteLevel':
      return 'Excluir nível';
    case 'setLevelViewRange':
      return 'Alterar intervalo de vista';
    case 'setProjectGraphics':
      return 'Alterar gráficos do projeto';
    case 'setLevelGraphics':
      return 'Alterar gráficos da vista';
    case 'resetLevelGraphics':
      return 'Restaurar gráficos da vista';
    case 'setView3D':
      return 'Alterar a vista 3D';
    case 'resetView3D':
      return 'Restaurar a vista 3D';
    case 'setViewHidden':
      return 'Ocultar na vista';
    case 'setSectionAnnotations':
      return 'Anotar no corte';
    case 'setSectionLevelExtent':
      return 'Criar/editar nível';
    case 'setSectionGraphics':
      return 'Alterar gráficos do corte';
    case 'resetSectionGraphics':
      return 'Restaurar gráficos do corte';
    case 'setProjectName':
      return 'Renomear projeto';
    case 'setDefaults':
      return 'Padrões do projeto';
    case 'setSettings':
      return 'Configurações do projeto';
    case 'setDimensionStyle':
      return 'Estilo de cotas';
    case 'upsertDimensionFamily':
      return 'Família de cotas';
    case 'removeDimensionFamily':
      return 'Excluir família de cotas';
    case 'setDefaultDimensionFamily':
      return 'Família de cotas padrão';
    case 'setDxfLayerStyle':
      return 'Editar camada do DXF';
    case 'resetDxfLayers':
      return 'Restaurar camadas do DXF';
    case 'toggleOpeningFavorite':
      return 'Favoritar tipo de abertura';
    case 'addView':
      return 'Criar vista';
    case 'updateView':
      return 'Alterar vista';
    case 'deleteView':
      return 'Excluir vista';
    case 'batch':
      return 'Várias alterações';
    case 'setOpeningHost':
      return 'Trocar parede anfitriã';
    case 'setElementLevel':
      return 'Mudar de nível';
    case 'addDimension':
      return 'Criar cota';
    case 'updateDimension':
      return 'Editar cota';
    case 'removeDimension':
      return 'Excluir cota';
    case 'addRoomSeparator':
      return 'Criar linha de separação';
    case 'removeRoomSeparator':
      return 'Excluir linha de separação';
    case 'updateRoomSeparator':
      return 'Editar linha de separação';
    case 'addDetailLine':
      return 'Criar linha de detalhe';
    case 'updateDetailLine':
      return 'Editar linha de detalhe';
    case 'removeDetailLine':
      return 'Excluir linha de detalhe';
    case 'addDetailRegion':
      return 'Criar região de detalhe';
    case 'updateDetailRegion':
      return 'Editar região de detalhe';
    case 'removeDetailRegion':
      return 'Excluir região de detalhe';
    case 'addTag':
      return 'Criar etiqueta';
    case 'updateTag':
      return 'Editar etiqueta';
    case 'removeTag':
      return 'Excluir etiqueta';
    case 'addText':
      return 'Criar texto';
    case 'updateText':
      return 'Editar texto';
    case 'removeText':
      return 'Excluir texto';
    case 'addSheet':
      return 'Criar prancha';
    case 'updateSheet':
      return 'Editar prancha';
    case 'removeSheet':
      return 'Excluir prancha';
    case 'addViewport':
      return 'Adicionar vista à prancha';
    case 'updateViewport':
      return 'Mover vista da prancha';
    case 'removeViewport':
      return 'Excluir vista da prancha';
    case 'setSheetOrder':
      return 'Reordenar pranchas';
    case 'addView3DPoint':
      return 'Salvar ponto de vista 3D';
    case 'updateView3DPoint':
      return 'Editar ponto de vista 3D';
    case 'removeView3DPoint':
      return 'Excluir ponto de vista 3D';
    case 'setView3DPointOrder':
      return 'Reordenar pontos de vista 3D';
    case 'addGrid':
      return 'Criar grade';
    case 'updateGrid':
      return 'Editar grade';
    case 'removeGrid':
      return 'Excluir grade';
    case 'addGridType':
      return 'Criar tipo de grade';
    case 'updateGridType':
      return 'Editar tipo de grade';
    case 'removeGridType':
      return 'Excluir tipo de grade';
    case 'addAreaPlan':
      return 'Criar planta de área';
    case 'updateAreaPlan':
      return 'Alterar planta de área';
    case 'removeAreaPlan':
      return 'Excluir planta de área';
    case 'addRoomTag':
      return 'Criar etiqueta de ambiente';
    case 'updateRoomTag':
      return 'Alterar etiqueta de ambiente';
    case 'removeRoomTag':
      return 'Excluir etiqueta de ambiente';
    case 'setRoomReference':
      return 'Mover referência do ambiente';
    case 'setRoomLabel':
      return 'Mover rótulo do ambiente';
    case 'upsertRoomCategory':
      return 'Editar categoria de ambiente';
    case 'removeRoomCategory':
      return 'Excluir categoria de ambiente';
    case 'upsertColorScheme':
      return 'Editar esquema de cores';
    case 'removeColorScheme':
      return 'Excluir esquema de cores';
    default: {
      const _nunca: never = c;
      return _nunca;
    }
  }
}
