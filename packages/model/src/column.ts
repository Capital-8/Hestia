import { applyTransform, type Transform } from '@hestia/geom';
import type { Command } from './commands.ts';
import type { Column, ColumnType } from './estrTypes.ts';
import { isWall, type Element, type Id, type Project } from './types.ts';

export const isColumn = (e: Element | undefined): e is Column => e?.kind === 'column';

/** Pilares de um nível, na ordem de criação. */
export const columnsOnLevel = (p: Project, levelId: Id): Column[] =>
  Object.values(p.elements)
    .filter(isColumn)
    .filter((c) => c.levelId === levelId)
    .sort((a, b) => a.order - b.order);

/**
 * Tipos padrão (A.3): pilar estrutural 25 × 25 de concreto e pilar arquitetônico 20 × 20. Os nomes são técnicos
 * (dimensão e disciplina), iguais em todos os idiomas, como os padrões de montante da parede cortina.
 */
export const DEFAULT_COLUMN_TYPES: Readonly<Record<Id, ColumnType>> = {
  pil_est_25x25: { id: 'pil_est_25x25', name: 'Estrutural 25 × 25', code: 'PE-25x25', description: '', disciplina: 'estrutural', perfil: { forma: 'retangular', b: 0.25, h: 0.25 }, materialId: 'mat_concreto', cost: 0 },
  pil_arq_20x20: { id: 'pil_arq_20x20', name: 'Arquitetônico 20 × 20', code: 'PA-20x20', description: '', disciplina: 'arquitetonico', perfil: { forma: 'retangular', b: 0.2, h: 0.2 }, materialId: 'mat_reboco', cost: 0 },
};

/**
 * Tipos de pilar do projeto. Sem mapa gravado (`columnTypes` ausente) valem os padrões; com mapa gravado vale só o
 * gravado (a primeira escrita grava o conjunto completo, senão apagar um padrão faria ele voltar).
 */
export function columnTypesOf(p: Project): Record<Id, ColumnType> {
  return p.columnTypes ?? structuredClone({ ...DEFAULT_COLUMN_TYPES });
}

/** Monta um pilar com os padrões do modelo (estrutural, vertical, altura 3 m); `order` o comando atribui. */
export function makeColumn(c: Pick<Column, 'id' | 'typeId' | 'levelId' | 'pos'> & Partial<Omit<Column, 'kind' | 'order'>>): Omit<Column, 'order'> {
  return { kind: 'column', disciplina: 'estrutural', rotation: 0, baseOffset: 0, topLevelId: null, topOffset: 0, height: 3, mark: '', comments: '', ...c };
}

/**
 * Pilar movido, girado ou espelhado (A.3). A posição acompanha a transformação; girar soma o ângulo; espelhar numa
 * linha de ângulo φ leva a rotação a 2φ − rotação (o perfil local não é refletido: perfis assimétricos em relação ao
 * eixo local x, como L e personalizado, mantêm a mão).
 */
export function transformColumn(c: Column, t: Transform): Column {
  const pos = applyTransform(t, c.pos);
  if (t.kind === 'mirror') return { ...c, pos, rotation: 2 * Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) - c.rotation };
  return { ...c, pos, rotation: c.rotation + (t.kind === 'rotate' ? t.angle : 0) };
}

/**
 * Leva os elementos de um tipo (pilar, viga ou fundação) no comando `transform`. Sem cópia, os de `ids` se
 * transformam, e o elemento hospedado numa parede de `ids` (`hostWallId`) segue a parede. Com cópia, cada elemento com
 * id em `idMap` vira um novo, com o hospedeiro remapeado quando a parede também foi copiada.
 */
export function transformarElementos<E extends Element & { hostWallId?: Id }>(
  p: Project,
  c: Extract<Command, { type: 'transform' }>,
  pred: (e: Element | undefined) => e is E,
  map: (e: E, t: Transform) => E,
): void {
  const ids = new Set<Id>(c.ids);
  const idMap = c.copy?.idMap;
  for (const e of Object.values(p.elements).filter(pred)) {
    const host = e.hostWallId;
    if (!ids.has(e.id) && !(host !== undefined && ids.has(host) && isWall(p.elements[host]))) continue;
    const next = map(e, c.transform);
    if (!idMap) {
      p.elements[e.id] = next;
      continue;
    }
    const nid = idMap[e.id];
    if (!nid) continue;
    const novoHost = host !== undefined ? idMap[host] : undefined;
    p.elements[nid] = { ...next, id: nid, order: p.nextOrder++, ...(novoHost ? { hostWallId: novoHost } : {}) } as Element;
  }
}
