import type { Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { newId } from './ids.ts';
import { makeFloor } from './floor.ts';
import { t, type Lang } from './i18n.ts';
import { makeSlab } from './slab.ts';
import { isMass } from './mass.ts';
import { makeWall } from './wall.ts';
import { isFloor, isSlab, isWall, type Floor, type Id, type Project, type Slab, type Wall } from './types.ts';

/** Piso ou laje: o que a derivação cria (ficha D1, plano de massa A.7). */
export type TipoDerivado = 'piso' | 'laje';

/** Um contorno gerado: o id do elemento novo, o nível e o contorno (anel externo e furos), em metros, na cota do nível. */
export interface ContornoDerivado {
  id: Id;
  nivelId: Id;
  boundary: Vec2[];
  holes: Vec2[][];
}

export interface DerivaPisosArgs {
  massaId: Id;
  tipo: TipoDerivado;
  /** Tipo de piso (`floorTypes`) ou de laje (`slabTypes`), conforme `tipo`. */
  typeId: Id;
  contornos: ContornoDerivado[];
}

/** Os pisos e lajes que uma derivação anterior gerou pela MESMA massa no MESMO nível (de qualquer tipo). */
function geradosAnteriores(p: Project, massaId: Id, nivelId: Id): Id[] {
  return Object.values(p.elements)
    .filter((e): e is Floor | Slab => (isFloor(e) || isSlab(e)) && e.origemMassa?.massaId === massaId && e.origemMassa.nivelId === nivelId && e.levelId === nivelId)
    .map((e) => e.id);
}

/**
 * Comando da derivação de pisos da massa (ficha D1). Devolve UM comando `batch`: apaga os gerados antes pela mesma massa e
 * nível e cria um piso (ou laje) por contorno, com `origemMassa` e contorno ESTÁTICO. Como é um só `batch`, um Ctrl+Z
 * desfaz tudo e rodar de novo substitui (não duplica). Valida antes e lança sem tocar no projeto se a massa, o tipo, um
 * nível ou um contorno estiverem errados.
 */
export function comandoDerivarPisos(p: Project, a: DerivaPisosArgs, lang: Lang = 'pt'): Command {
  if (!isMass(p.elements[a.massaId])) throw new Error(t(lang, 'md_cmd_mass_missing'));
  if (a.tipo === 'piso' && !p.floorTypes[a.typeId]) throw new Error(t(lang, 'md_cmd_floor_type_missing'));
  if (a.tipo === 'laje' && !p.slabTypes[a.typeId]) throw new Error(t(lang, 'md_cmd_slab_type_missing'));
  const remover: Id[] = [];
  const criar: Command[] = [];
  for (const c of a.contornos) {
    if (!p.levels.some((l) => l.id === c.nivelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.nivelId }));
    if (c.boundary.length < 3) throw new Error(t(lang, a.tipo === 'piso' ? 'md_cmd_floor_min_points' : 'md_cmd_slab_min_points'));
    if (c.holes.some((h) => h.length < 3)) throw new Error(t(lang, a.tipo === 'piso' ? 'md_cmd_floor_min_points' : 'md_cmd_slab_min_points'));
    remover.push(...geradosAnteriores(p, a.massaId, c.nivelId));
    const origemMassa = { massaId: a.massaId, nivelId: c.nivelId };
    const base = { id: c.id, typeId: a.typeId, levelId: c.nivelId, boundary: c.boundary, holes: c.holes, origemMassa };
    criar.push(a.tipo === 'piso' ? { type: 'addFloor', floor: makeFloor(base) } : { type: 'addSlab', slab: makeSlab(base) });
  }
  const apagar: Command[] = remover.length > 0 ? [{ type: 'deleteElements', ids: [...new Set(remover)] }] : [];
  return { type: 'batch', commands: [...apagar, ...criar] };
}

/** Uma cadeia fechada de paredes a criar (ficha D2): o nível, os vértices em sentido horário (o último liga ao primeiro) e a altura. */
export interface CadeiaDerivadaParedes {
  nivelId: Id;
  pontos: Vec2[];
  /** Nível de cima dentro da massa, ou null: a parede vai até `altura` acima da cota do nível (topo da massa). */
  topoNivelId: Id | null;
  altura: number;
}

export interface DerivaParedesArgs {
  massaId: Id;
  /** Tipo de parede (`wallTypes`) escolhido no diálogo. */
  typeId: Id;
  /** Níveis escolhidos: as paredes geradas antes pela mesma massa neles saem, mesmo que a nova geração não tenha cadeia ali. */
  niveis: Id[];
  cadeias: CadeiaDerivadaParedes[];
}

/** As paredes que uma derivação anterior gerou pela MESMA massa nos níveis escolhidos (`origemMassa` e `levelId` iguais). */
function paredesAnteriores(p: Project, massaId: Id, niveis: readonly Id[]): Id[] {
  return Object.values(p.elements)
    .filter((e): e is Wall => isWall(e) && e.origemMassa?.massaId === massaId && e.origemMassa.nivelId === e.levelId && niveis.includes(e.levelId))
    .map((e) => e.id);
}

/**
 * Comando da derivação de paredes da massa (ficha D2, plano de massa A.7). Devolve UM comando `batch`: apaga as paredes geradas antes
 * pela mesma massa nos níveis escolhidos e cria uma parede por segmento de cada cadeia, com `origemMassa`. As junções ficam por conta do
 * motor (não se calculam aqui). Como é um só `batch`, um Ctrl+Z desfaz tudo e rodar de novo substitui (não duplica). Valida antes e
 * lança sem tocar no projeto se a massa, o tipo, um nível, a altura ou uma cadeia estiverem errados. `novoId` existe para os testes.
 */
export function comandoDerivarParedes(p: Project, a: DerivaParedesArgs, lang: Lang = 'pt', novoId: (prefixo: string) => Id = newId): Command {
  if (!isMass(p.elements[a.massaId])) throw new Error(t(lang, 'md_cmd_mass_missing'));
  // Sem chave própria de tipo de parede no i18n do modelo: usa-se a de elemento inexistente, com o id.
  if (!p.wallTypes[a.typeId]) throw new Error(t(lang, 'md_cmd_element_missing_id', { id: a.typeId }));
  for (const nivelId of a.niveis) if (!p.levels.some((l) => l.id === nivelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: nivelId }));
  const criar: Command[] = [];
  for (const c of a.cadeias) {
    if (!p.levels.some((l) => l.id === c.nivelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.nivelId }));
    if (c.topoNivelId !== null && !p.levels.some((l) => l.id === c.topoNivelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.topoNivelId }));
    // O motor já entrega cadeias com ao menos 3 vértices e altura positiva; uma que não atenda não gera parede (sem texto novo de erro).
    if (c.pontos.length < 3 || !(c.altura > 0) || !Number.isFinite(c.altura)) continue;
    const origemMassa = { massaId: a.massaId, nivelId: c.nivelId };
    const n = c.pontos.length;
    for (let i = 0; i < n; i++) {
      const wall: Omit<Wall, 'order'> = makeWall({
        id: novoId('wm'),
        typeId: a.typeId,
        levelId: c.nivelId,
        a: c.pontos[i]!,
        b: c.pontos[(i + 1) % n]!,
        topLevelId: c.topoNivelId,
        topOffset: 0,
        height: c.altura,
        origemMassa,
      });
      criar.push({ type: 'addWall', wall });
    }
  }
  const remover = [...new Set(paredesAnteriores(p, a.massaId, a.niveis))];
  const apagar: Command[] = remover.length > 0 ? [{ type: 'deleteElements', ids: remover }] : [];
  return { type: 'batch', commands: [...apagar, ...criar] };
}
