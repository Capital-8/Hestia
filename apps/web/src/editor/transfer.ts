import type { Id, Project, ProjectStore } from '@hestia/model';
import { clipboardFrom, copyableIds as copyableIdsOf, idsOfType, pasteAlignedCommand, pasteAlignedToLevelsCommand, sameNameRoomIds, selectedTypeId, type ClipBuffer, type PasteIds, type PasteLevelsResult } from '@hestia/tools';
import { t, useI18n, type Dict, type Lang } from './i18n.ts';
import { useUi } from './state.ts';

/** Ordem canônica de exibição/seleção das categorias coladas (a mesma do motor). */
const PASTE_ORDER: readonly (keyof PasteIds)[] = ['walls', 'openings', 'floors', 'slabs', 'ceilings', 'roofs', 'stairs', 'ramps', 'rooms', 'generics', 'cad', 'railings'];

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
  railings: c.railings?.length ?? 0,
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
  railings: number;
}

/** Chaves do singular/plural de cada categoria na frase de cópia. */
const COUNT_KEYS: Record<keyof Counts, readonly [keyof Dict, keyof Dict]> = {
  walls: ['edc_count_wall_one', 'edc_count_wall_many'],
  floors: ['edc_count_floor_one', 'edc_count_floor_many'],
  slabs: ['edc_count_slab_one', 'edc_count_slab_many'],
  ceilings: ['edc_count_ceiling_one', 'edc_count_ceiling_many'],
  roofs: ['edc_count_roof_one', 'edc_count_roof_many'],
  stairs: ['edc_count_stair_one', 'edc_count_stair_many'],
  ramps: ['edc_count_ramp_one', 'edc_count_ramp_many'],
  rooms: ['edc_count_room_one', 'edc_count_room_many'],
  generics: ['edc_count_generic_one', 'edc_count_generic_many'],
  cad: ['edc_count_cad_one', 'edc_count_cad_many'],
  railings: ['edc_count_railing_one', 'edc_count_railing_many'],
};

/** "2 paredes, 1 piso, 1 laje e 1 escada": frase do status para o que foi copiado ou colado. */
function describe(c: Counts, lang: Lang): string {
  const parts: string[] = [];
  for (const [categoria, chaves] of Object.entries(COUNT_KEYS) as Array<[keyof Counts, readonly [keyof Dict, keyof Dict]]>) {
    const n = c[categoria];
    if (!n) continue;
    parts.push(t(lang, n === 1 ? chaves[0] : chaves[1], { n }));
  }
  if (parts.length > 1) return t(lang, 'edc_list_and', { list: parts.slice(0, -1).join(', '), last: parts[parts.length - 1]! });
  return parts[0] ?? '';
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
    ...(c.railings ?? []),
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
    (c.cad?.length ?? 0) +
    (c.railings?.length ?? 0)
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
    // A faixa pergunta isto para Copiar e para Recortar a cada desenho: com a mesma seleção e o mesmo projeto, a resposta é a mesma.
    if (this.ultimosCopiaveis?.p === p && this.ultimosCopiaveis.ids === ids) return this.ultimosCopiaveis.out;
    const out = copyableIdsOf(p, ids);
    this.ultimosCopiaveis = { p, ids, out };
    return out;
  }

  private ultimosCopiaveis: { p: Project; ids: readonly Id[]; out: Id[] } | null = null;

  /** Copia a seleção e as aberturas nas paredes. Sem nada copiável, mantém o que já estava copiado. */
  copy(p: Project, ids: Id[]): boolean {
    const lang = useI18n.getState().lang;
    const next = clipboardFrom(p, ids);
    if (!next) {
      useUi.setState({ status: { key: 'edc_copy_nothing_copyable' } });
      return false;
    }
    this.clip = next;
    useUi.setState({ status: { key: 'edc_copied', args: { description: describe(counts(next), lang) } } });
    return true;
  }

  /** Cola o copiado no nível, nas mesmas coordenadas, em um único passo de desfazer, e seleciona o resultado. */
  paste(store: ProjectStore, levelId: Id): boolean {
    const lang = useI18n.getState().lang;
    if (!this.clip) {
      useUi.setState({ status: { key: 'edc_clipboard_empty_cut' } });
      return false;
    }
    const r = pasteAlignedCommand(store.project, this.clip, levelId);
    if (!r) {
      useUi.setState({ status: { key: 'edc_paste_nothing_here' } });
      return false;
    }
    store.exec(r.command, 'edc_undo_paste_aligned');
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
      railings: r.railingIds.length,
    };
    const ids = [...r.wallIds, ...r.openingIds, ...r.floorIds, ...r.slabIds, ...r.ceilingIds, ...r.roofIds, ...r.stairIds, ...r.rampIds, ...r.roomIds, ...r.genericIds, ...r.cadIds, ...r.railingIds];
    useUi.setState({ selection: ids, status: { key: 'edc_pasted_in_place', args: { description: describe(pasted, lang) } } });
    return true;
  }

  /** Grava um lote já calculado pela prévia e seleciona o resultado. Um único passo de desfazer. */
  applyPrepared(store: ProjectStore, prepared: { result: PasteLevelsResult; levelIds: Id[] }): boolean {
    this.applyResult(store, prepared.result, prepared.levelIds);
    return true;
  }

  /**
   * Cola o copiado em um ou vários níveis, alinhado em X/Y, num único passo de desfazer.
   * Devolve o resultado (para o controlador saber se o preview pode fechar) ou null.
   */
  pasteToLevels(store: ProjectStore, levelIds: Id[], link: boolean): PasteLevelsResult | null {
    if (!this.clip) {
      useUi.setState({ status: { key: 'edc_clipboard_empty' } });
      return null;
    }
    const r = pasteAlignedToLevelsCommand(store.project, this.clip, levelIds, { link });
    if (!r) {
      useUi.setState({ status: { key: 'edc_paste_levels_empty' } });
      return null;
    }
    this.applyResult(store, r, levelIds);
    return r;
  }

  /** Executa o lote, seleciona os ids criados e escreve o status com a contagem de avisos. */
  private applyResult(store: ProjectStore, r: PasteLevelsResult, levelIds: Id[]): void {
    store.exec(r.command, 'edc_undo_paste_aligned_levels');
    const ids = levelIds.flatMap((levelId) => {
      const ofLevel = r.byLevel[levelId];
      return ofLevel ? idsOfPaste(ofLevel) : [];
    });
    const avisos = warningCount(r);
    useUi.setState({
      selection: ids,
      status: avisos
        ? { key: 'edc_pasted_levels_warnings', args: { n: ids.length, m: levelIds.length, w: avisos } }
        : { key: 'edc_pasted_levels', args: { n: ids.length, m: levelIds.length } },
    });
  }

  /** Seleciona os elementos do nível com o tipo dado. Devolve quantos. */
  ofType(p: Project, levelId: Id, typeId: Id): number {
    const ids = idsOfType(p, levelId, typeId);
    useUi.setState({ selection: ids, status: ids.length ? { key: 'edc_same_type_selected', args: { n: ids.length } } : { key: 'edc_same_type_none' } });
    return ids.length;
  }

  /** "Mesmo nome" (ambientes): seleciona todos os ambientes do nível com o nome dos ambientes selecionados. Devolve quantos. */
  sameName(p: Project, levelId: Id): number {
    const ids = sameNameRoomIds(p, levelId, useUi.getState().selection);
    useUi.setState({ selection: ids, status: ids.length ? { key: 'edc_same_name_selected', args: { n: ids.length } } : { key: 'edc_same_name_hint' } });
    return ids.length;
  }

  /** "Mesmo tipo": seleciona todos do tipo da seleção atual (que precisa ser de um só tipo). */
  sameType(p: Project, levelId: Id): number {
    const r = selectedTypeId(p, useUi.getState().selection, useI18n.getState().lang);
    if ('error' in r) {
      useUi.setState({ status: r.error });
      return 0;
    }
    return this.ofType(p, levelId, r.typeId);
  }
}

/** Área de transferência do editor (uma só, em memória). */
export const transfer = new Transfer();
