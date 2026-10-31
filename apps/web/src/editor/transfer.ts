import type { Id, Project, ProjectStore } from '@hestia/model';
import { clipboardFrom, copyableIds as copyableIdsOf, idsOfType, pasteAlignedCommand, pasteAlignedToLevelsCommand, sameNameRoomIds, selectedTypeId, type ClipBuffer, type PasteIds, type PasteLevelsResult } from '@hestia/tools';
import { useUi } from './state.ts';

/** Ordem canônica de exibição/seleção das categorias coladas (a mesma do motor). */
const PASTE_ORDER: readonly (keyof PasteIds)[] = ['walls', 'openings', 'floors', 'slabs', 'ceilings', 'roofs', 'stairs', 'ramps', 'rooms', 'generics', 'cad'];

/** Achata os ids de um nível na ordem canônica. */
const idsOfPaste = (ids: PasteIds): Id[] => PASTE_ORDER.flatMap((key) => ids[key]);

/** Contagens do buffer copiado (ausente em buffers antigos = nenhuma categoria nova). */
const counts = (c: ClipBuffer): Counts => ({
  walls: c.walls.length,
  floors: c.floors.length,
  slabs: c.slabs.length,
  ceilings: c.ceilings?.length ?? 0,
  roofs: c.roofs.length,
  stairs: c.stairs?.length ?? 0,
  ramps: c.ramps?.length ?? 0,
  rooms: c.rooms?.length ?? 0,
  generics: c.generics?.length ?? 0,
  cad: c.cad?.length ?? 0,
});

/** Contagem por categoria do que foi copiado ou colado. */
interface Counts {
  walls: number;
  floors: number;
  slabs: number;
  ceilings: number;
  roofs: number;
  stairs: number;
  ramps: number;
  rooms: number;
  generics: number;
  cad: number;
}

/** "2 parede(s), 1 piso, 1 laje e 1 escada": frase do status para o que foi copiado ou colado. */
function describe(c: Counts): string {
  const parts: string[] = [];
  if (c.walls) parts.push(`${c.walls} parede(s)`);
  if (c.floors) parts.push(`${c.floors} piso(s)`);
  if (c.slabs) parts.push(`${c.slabs} laje(s)`);
  if (c.ceilings) parts.push(`${c.ceilings} forro(s)`);
  if (c.roofs) parts.push(`${c.roofs} telhado(s)`);
  if (c.stairs) parts.push(`${c.stairs} escada(s)`);
  if (c.ramps) parts.push(`${c.ramps} rampa(s)`);
  if (c.rooms) parts.push(`${c.rooms} ambiente(s)`);
  if (c.generics) parts.push(`${c.generics} objeto(s) importado(s)`);
  if (c.cad) parts.push(`${c.cad} desenho(s) CAD`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/** Ids de nível de origem distintos do buffer (aberturas não têm nível próprio). */
function originLevelIdsOf(c: ClipBuffer): Id[] {
  const elements = [
    ...c.walls,
    ...c.floors,
    ...c.slabs,
    ...(c.ceilings ?? []),
    ...c.roofs,
    ...(c.stairs ?? []),
    ...(c.ramps ?? []),
    ...(c.rooms ?? []),
    ...(c.generics ?? []),
    ...(c.cad ?? []),
  ];
  return [...new Set(elements.map((e) => e.levelId))];
}

/** Total de elementos no buffer (aberturas incluídas: elas viram cópias quando a parede vai junto). */
function elementCountOf(c: ClipBuffer): number {
  return (
    c.walls.length +
    c.openings.length +
    c.floors.length +
    c.slabs.length +
    (c.ceilings?.length ?? 0) +
    c.roofs.length +
    (c.stairs?.length ?? 0) +
    (c.ramps?.length ?? 0) +
    (c.rooms?.length ?? 0) +
    (c.generics?.length ?? 0) +
    (c.cad?.length ?? 0)
  );
}

/** Quantos avisos o colar gerou (sobreposição, abertura descartada, topo estourado...). */
const warningCount = (r: PasteLevelsResult): number => r.warnings.reduce((sum, w) => sum + w.count, 0);

/**
 * Copiar e colar alinhado (área de transferência em memória) e seleção por tipo ("Mesmo tipo").
 * Fica fora do controlador só para que ele apenas repasse as ações (limite de linhas por arquivo).
 */
export class Transfer {
  private clip: ClipBuffer | null = null;

  /** Já há algo copiado? (o buffer vive só na memória desta sessão) */
  hasClip(): boolean {
    return this.clip !== null;
  }

  /** Buffer atual, para o Colar com prévia e para o diálogo de níveis (null sem cópia). */
  clipBuffer(): ClipBuffer | null {
    return this.clip;
  }

  /** Níveis de onde a seleção copiada veio (para desabilitar no diálogo e calcular o Δh). */
  originLevelIds(c: ClipBuffer): Id[] {
    return originLevelIdsOf(c);
  }

  /** Total de elementos no buffer (o diálogo multiplica pelos níveis escolhidos). */
  elementCount(c: ClipBuffer): number {
    return elementCountOf(c);
  }

  /** Ids que Copiar levaria da seleção (todas as categorias copiáveis e aberturas hospedadas). */
  copyableIds(p: Project, ids: readonly Id[]): Id[] {
    return copyableIdsOf(p, ids);
  }

  /** Copia a seleção e as aberturas nas paredes. Sem nada copiável, mantém o que já estava copiado. */
  copy(p: Project, ids: Id[]): boolean {
    const next = clipboardFrom(p, ids);
    if (!next) {
      useUi.setState({ status: 'Selecione paredes, pisos, lajes, forros, telhados, escadas, rampas, ambientes, objetos importados ou CAD para copiar.' });
      return false;
    }
    this.clip = next;
    useUi.setState({ status: `${describe(counts(next))} copiado(s). Ctrl+V cola seguindo o cursor.` });
    return true;
  }

  /** Cola o copiado no nível, nas mesmas coordenadas, em um único passo de desfazer, e seleciona o resultado. */
  paste(store: ProjectStore, levelId: Id): boolean {
    if (!this.clip) {
      useUi.setState({ status: 'Nada copiado. Selecione elementos e use Ctrl+C.' });
      return false;
    }
    const r = pasteAlignedCommand(store.project, this.clip, levelId);
    if (!r) {
      useUi.setState({ status: 'Não há o que colar neste nível.' });
      return false;
    }
    store.exec(r.command, 'Colar alinhado');
    const pasted: Counts = {
      walls: r.wallIds.length,
      floors: r.floorIds.length,
      slabs: r.slabIds.length,
      ceilings: r.ceilingIds.length,
      roofs: r.roofIds.length,
      stairs: r.stairIds.length,
      ramps: r.rampIds.length,
      rooms: r.roomIds.length,
      generics: r.genericIds.length,
      cad: r.cadIds.length,
    };
    const ids = [...r.wallIds, ...r.openingIds, ...r.floorIds, ...r.slabIds, ...r.ceilingIds, ...r.roofIds, ...r.stairIds, ...r.rampIds, ...r.roomIds, ...r.genericIds, ...r.cadIds];
    useUi.setState({ selection: ids, status: `${describe(pasted)} colado(s) no mesmo lugar. Ctrl+Z desfaz.` });
    return true;
  }

  /**
   * Cola o copiado em um ou vários níveis, alinhado em X/Y, num único passo de desfazer.
   * Devolve o resultado (para o controlador saber se o preview pode fechar) ou null.
   */
  pasteToLevels(store: ProjectStore, levelIds: Id[], link: boolean): PasteLevelsResult | null {
    if (!this.clip) {
      useUi.setState({ status: 'Nada copiado. Selecione elementos e use Copiar.' });
      return null;
    }
    const r = pasteAlignedToLevelsCommand(store.project, this.clip, levelIds, { link });
    if (!r) {
      useUi.setState({ status: 'Não há o que colar nos níveis escolhidos.' });
      return null;
    }
    store.exec(r.command, 'Colar alinhado aos níveis selecionados');
    const ids = levelIds.flatMap((levelId) => {
      const ofLevel = r.byLevel[levelId];
      return ofLevel ? idsOfPaste(ofLevel) : [];
    });
    const avisos = warningCount(r);
    useUi.setState({
      selection: ids,
      status: `${ids.length} elemento(s) colado(s) em ${levelIds.length} nível(is).${avisos ? ` ${avisos} aviso(s).` : ''} Ctrl+Z desfaz.`,
    });
    return r;
  }

  /** Seleciona os elementos do nível com o tipo dado. Devolve quantos. */
  ofType(p: Project, levelId: Id, typeId: Id): number {
    const ids = idsOfType(p, levelId, typeId);
    useUi.setState({ selection: ids, status: ids.length ? `${ids.length} elemento(s) do mesmo tipo selecionado(s).` : 'Nenhum elemento deste tipo neste nível.' });
    return ids.length;
  }

  /** "Mesmo nome" (ambientes): seleciona todos os ambientes do nível com o nome dos ambientes selecionados. Devolve quantos. */
  sameName(p: Project, levelId: Id): number {
    const ids = sameNameRoomIds(p, levelId, useUi.getState().selection);
    useUi.setState({ selection: ids, status: ids.length ? `${ids.length} ambiente(s) com o mesmo nome selecionado(s).` : 'Selecione um ambiente primeiro: Mesmo nome seleciona os ambientes do nível com o mesmo nome (só ambientes).' });
    return ids.length;
  }

  /** "Mesmo tipo": seleciona todos do tipo da seleção atual (que precisa ser de um só tipo). */
  sameType(p: Project, levelId: Id): number {
    const r = selectedTypeId(p, useUi.getState().selection);
    if ('error' in r) {
      useUi.setState({ status: r.error });
      return 0;
    }
    return this.ofType(p, levelId, r.typeId);
  }
}

/** Área de transferência do editor (uma só, em memória). */
export const transfer = new Transfer();
