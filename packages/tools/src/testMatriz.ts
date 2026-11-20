import { ProjectStore, createEmptyProject, isColumn, isWall, makeColumn, makeLevel, makeWall, wallsOnLevel, columnsOnLevel, type Id, type Project } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import type { Inference } from './types.ts';

/**
 * Matriz de níveis (decisão 0060, §9): o mesmo cenário repetido em N níveis, para provar que o resultado de uma
 * ferramenta não depende do nível ativo. Os elementos pertencem ao nível, então cada nível recebe os mesmos
 * desenhos com ids `<papel>_<levelId>`; os normalizadores devolvem o PAPEL (sul, leste, pilar...), sem o sufixo,
 * para que o resultado de lv_0 e de lv_1 seja comparável com `toEqual`.
 */

/** Geometria comum a todo nível: retângulo de 6 m x 4 m (quatro paredes, cantos compartilhados) e um pilar em (2, 2). */
export const PAREDES = [
  { papel: 'sul', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } },
  { papel: 'leste', a: { x: 6, y: 0 }, b: { x: 6, y: 4 } },
  { papel: 'norte', a: { x: 6, y: 4 }, b: { x: 0, y: 4 } },
  { papel: 'oeste', a: { x: 0, y: 4 }, b: { x: 0, y: 0 } },
] as const;
export const PILAR = { papel: 'pilar', at: { x: 2, y: 2 } } as const;

/** Id de um elemento da geometria comum num nível. */
export const idDe = (papel: string, levelId: Id): Id => `${papel}_${levelId}`;

/** Papel de um id gerado por `idDe` (remove o sufixo `_lv_<n>`). Id fora do padrão volta igual. */
export const papelDe = (id: Id): string => id.replace(/_lv_\d+$/, '');

/**
 * Projeto com N níveis (`lv_0` .. `lv_{N-1}`, cotas 0, 3, 6...) e, em cada um, a geometria comum.
 * `createEmptyProject` traz dois níveis; aqui eles são substituídos para que N seja exato.
 */
export function comNiveis(n: number): { store: ProjectStore; levelIds: Id[] } {
  const project: Project = createEmptyProject();
  project.levels = Array.from({ length: n }, (_, k) => makeLevel({ id: `lv_${k}`, name: `Nível ${k}`, elevation: 3 * k }));
  const store = new ProjectStore(project);
  const levelIds = project.levels.map((l) => l.id);
  for (const levelId of levelIds) {
    for (const p of PAREDES) {
      store.exec({ type: 'addWall', wall: makeWall({ id: idDe(p.papel, levelId), typeId: 'wt_alv14', levelId, a: { ...p.a }, b: { ...p.b } }) });
    }
    store.exec({ type: 'addColumn', column: makeColumn({ id: idDe(PILAR.papel, levelId), typeId: 'ct_conc_20x40', levelId, at: { ...PILAR.at } }) });
  }
  return { store, levelIds };
}

/** Ids de paredes e pilares do nível (o que um gesto pode criar ou selecionar). */
export const idsDoNivel = (store: ProjectStore, levelId: Id): Id[] => [
  ...wallsOnLevel(store.project, levelId).map((w) => w.id),
  ...columnsOnLevel(store.project, levelId).map((c) => c.id),
];

/** Resultado normalizado de uma captura (snap). `chave` = tipo e dono juntos, para comparar candidatos sem o id. */
export interface SnapNorm {
  tipo: string;
  ponto: Vec2;
  id: string | null;
  chave: string;
}

/**
 * Normaliza o `Inference` de uma ferramenta. O `Inference` atual traz um só candidato (sem lista ordenada); por isso
 * a "lista de candidatos" do oráculo fica para as etapas em que a captura passar a devolvê-la.
 */
export function normSnap(inf: Inference | null): SnapNorm {
  if (!inf) throw new Error('normSnap: a ferramenta não devolveu captura');
  const id = inf.hostId === undefined ? null : papelDe(inf.hostId);
  return { tipo: inf.kind, ponto: { x: inf.point.x, y: inf.point.y }, id, chave: `${inf.kind}:${id ?? '-'}` };
}

/** Resultado normalizado de uma criação: um item por elemento (ordenado por tipo e geometria) e o nível comum. */
export interface CriacaoNorm {
  kinds: string[];
  pontos: Vec2[][];
  levelId: Id;
}

/** Normaliza os elementos criados (ids novos). Todos devem estar no mesmo nível. */
export function normCriacao(store: ProjectStore, ids: readonly Id[]): CriacaoNorm {
  const itens: Array<{ kind: string; pontos: Vec2[]; levelId: Id }> = [];
  for (const id of ids) {
    const e = store.project.elements[id];
    if (isWall(e)) itens.push({ kind: 'parede', pontos: [{ x: e.a.x, y: e.a.y }, { x: e.b.x, y: e.b.y }], levelId: e.levelId });
    else if (isColumn(e)) itens.push({ kind: 'pilar', pontos: [{ x: e.at.x, y: e.at.y }], levelId: e.levelId });
    else throw new Error(`normCriacao: id ${id} não é parede nem pilar`);
  }
  itens.sort((p, q) => (p.kind + JSON.stringify(p.pontos)).localeCompare(q.kind + JSON.stringify(q.pontos)));
  const niveis = [...new Set(itens.map((i) => i.levelId))];
  if (niveis.length > 1) throw new Error(`normCriacao: elementos em níveis diferentes: ${niveis.join(', ')}`);
  return { kinds: itens.map((i) => i.kind), pontos: itens.map((i) => i.pontos), levelId: niveis[0] ?? '' };
}

/** Normaliza uma seleção: papéis ordenados (ids sem o sufixo de nível). */
export function normSelecao(ids: readonly Id[]): string[] {
  return ids.map(papelDe).sort();
}
