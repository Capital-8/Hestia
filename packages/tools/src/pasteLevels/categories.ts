import { levelElevation, type Ceiling, type Command, type Generic, type Id, type Project } from '@hestia/model';
import type { ClipBuffer, MintId } from '../clipboard.ts';
import type { PasteIds, PasteWarning } from './types.ts';

/** Contexto compartilhado entre o motor (W1) e as categorias extras (W2). */
export interface CategoryContext {
  p: Project;
  /** Nível de destino. */
  levelId: Id;
  /** Nível de origem do buffer (para o delta de Z dos genéricos). */
  srcLevelId: Id;
  mint: MintId;
  /** Parede antiga → parede nova. */
  wallMap: Map<Id, Id>;
  /**
   * Mapa geral de ids do nível (paredes, ambientes, telhados...). O W1 o preenche com os ambientes colados, então é
   * daqui que sai o novo `roomId` do forro. Opcional para conviver com quem monta o contexto só com `wallMap`.
   */
  hostMap?: Map<Id, Id>;
  /**
   * Ambiente antigo → ambiente novo, quando os ambientes do buffer foram colados NESTE nível. Tem prioridade sobre o
   * `hostMap`. Sem nenhum dos dois, o forro que acompanhava um ambiente é solto e o aviso `ceiling-unlinked` entra no
   * resultado (contrato §7).
   */
  roomMap?: Map<Id, Id>;
}

/** Ids vazios por categoria; evita repetir o literal em cada caminho de erro. */
export function emptyPasteIds(): PasteIds {
  return { walls: [], openings: [], floors: [], slabs: [], ceilings: [], roofs: [], stairs: [], ramps: [], rooms: [], generics: [], cad: [], railings: [] };
}

/**
 * Clona forros, genéricos/IFC e desenhos CAD para o nível de destino.
 *
 * - Forro: id novo, `levelId` de destino, tipo com fallback e `roomId` remapeado quando o ambiente foi copiado;
 *   sem o ambiente copiado o vínculo é solto (`roomLinked` falso) com o aviso `ceiling-unlinked`.
 * - Genérico: id novo e malha transladada em Z pelo delta de elevação entre os níveis (a malha está em Z absoluto).
 * - CAD: id novo e `levelId` novo, compartilhando `layers`/`paths`/`texts` (geometria imutável) para não multiplicar
 *   a memória do desenho a cada nível.
 */
export function cloneCategories(
  p: Project,
  clip: ClipBuffer,
  levelId: Id,
  ctx: CategoryContext,
): { commands: Command[]; ids: PasteIds; warnings: PasteWarning[] } {
  const commands: Command[] = [];
  const ids = emptyPasteIds();
  const warnings: PasteWarning[] = [];

  const ceilings = clip.ceilings ?? [];
  if (ceilings.length) {
    const cloned = ceilings.map((c) => cloneCeiling(p, c, levelId, ctx));
    const unlinked = cloned.filter((c) => c.unlinked).length;
    if (unlinked) warnings.push({ levelId, kind: 'ceiling-unlinked', count: unlinked });
    ids.ceilings = cloned.map((c) => c.ceiling.id);
    commands.push({ type: 'addCeilings', ceilings: cloned.map((c) => c.ceiling) });
  }

  const generics = clip.generics ?? [];
  if (generics.length) {
    const dz = levelElevation(p, levelId) - levelElevation(p, ctx.srcLevelId);
    for (const g of generics) {
      const generic = genericCopy(g, levelId, dz, ctx.mint);
      ids.generics.push(generic.id);
      commands.push(addGenericCommand(generic));
    }
  }

  const cad = clip.cad ?? [];
  for (const drawing of cad) {
    const { order: _order, ...rest } = drawing;
    const id = ctx.mint('cad');
    ids.cad.push(id);
    commands.push({ type: 'addCadDrawing', cad: { ...rest, id, levelId } });
  }

  return { commands, ids, warnings };
}

/** Um forro clonado e se ele perdeu o vínculo com o ambiente. */
interface ClonedCeiling {
  ceiling: Omit<Ceiling, 'order'>;
  unlinked: boolean;
}

/** Forro com tipo de fallback e vínculo com o ambiente copiado (ou solto, com aviso). */
function cloneCeiling(p: Project, c: Ceiling, levelId: Id, ctx: CategoryContext): ClonedCeiling {
  const { order: _order, ...rest } = c;
  // Mesmo fallback dos pisos/lajes no colar atual: tipo ausente cai no primeiro do projeto.
  const typeId = p.ceilingTypes[c.typeId] ? c.typeId : (Object.keys(p.ceilingTypes)[0] ?? c.typeId);
  const base = { ...rest, id: ctx.mint('c'), levelId, typeId };
  if (!c.roomId) return { ceiling: base, unlinked: false };
  const roomId = ctx.roomMap?.get(c.roomId) ?? ctx.hostMap?.get(c.roomId);
  if (roomId) return { ceiling: { ...base, roomId }, unlinked: false };
  // Ambiente não copiado: mantém o contorno gravado e solta o vínculo. O `roomId` fica como origem para revincular
  // (decisão 0021 §4), mas `roomLinked: false` impede que o forro siga um ambiente de outro nível.
  return { ceiling: { ...base, roomLinked: false }, unlinked: true };
}

/** Cópia do objeto importado com o id e o nível novos e a malha deslocada em Z (delta absoluto entre os níveis). */
function genericCopy(g: Generic, levelId: Id, dz: number, mint: MintId): Omit<Generic, 'order'> {
  const { order: _order, ...rest } = g;
  return {
    ...rest,
    id: mint('g'),
    levelId,
    // `indices` é imutável e fica compartilhado; só o Z das posições muda de nível para nível.
    mesh: { positions: dz === 0 ? g.mesh.positions : translatedZ(g.mesh.positions, dz), indices: g.mesh.indices },
  };
}

/** Desloca o Z (terceira coordenada) de uma lista x, y, z... sem tocar na origem. */
function translatedZ(positions: readonly number[], dz: number): number[] {
  const out = positions.slice();
  for (let i = 2; i < out.length; i += 3) out[i] = out[i]! + dz;
  return out;
}

/** Monta o comando de inserção do objeto importado (IFC). */
function addGenericCommand(generic: Omit<Generic, 'order'>): Command {
  return { type: 'addGeneric', generic };
}
