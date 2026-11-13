import { applyTransform, type Transform } from '@hestia/geom';
import type { Footing, FootingType } from './estrTypes.ts';
import type { Element, Id, Project } from './types.ts';

export const isFooting = (e: Element | undefined): e is Footing => e?.kind === 'footing';

/** Fundações de um nível, na ordem de criação. */
export const footingsOnLevel = (p: Project, levelId: Id): Footing[] =>
  Object.values(p.elements)
    .filter(isFooting)
    .filter((f) => f.levelId === levelId)
    .sort((a, b) => a.order - b.order);

/**
 * Tipos padrão (A.3): sapata isolada 80 × 80 × 30 com pescoço 25 × 25 × 50 (E7) e baldrame corrido 40 × 30 (E8).
 * Nomes técnicos, iguais em todos os idiomas.
 */
export const DEFAULT_FOOTING_TYPES: Readonly<Record<Id, FootingType>> = {
  sap_80x80x30: {
    id: 'sap_80x80x30',
    name: 'Sapata isolada 80 × 80 × 30',
    code: 'S-80',
    description: '',
    modo: 'isolada',
    forma: 'sapata',
    base: { forma: 'retangular', b: 0.8, h: 0.8 },
    alturaBase: 0.3,
    pescoco: { forma: 'retangular', b: 0.25, h: 0.25 },
    alturaPescoco: 0.5,
    materialId: 'mat_concreto',
    cost: 0,
  },
  bal_40x30: {
    id: 'bal_40x30',
    name: 'Baldrame 40 × 30',
    code: 'B-40x30',
    description: '',
    modo: 'corrida',
    forma: 'sapata',
    base: { forma: 'retangular', b: 0.4, h: 0.3 },
    alturaBase: 0.3,
    materialId: 'mat_concreto',
    cost: 0,
  },
};

/** Tipos de fundação do projeto. Mesmo regime de `columnTypesOf`. */
export function footingTypesOf(p: Project): Record<Id, FootingType> {
  return p.footingTypes ?? structuredClone({ ...DEFAULT_FOOTING_TYPES });
}

/** Monta uma fundação (isolada com `pos`, corrida com `a` e `b`); `order` o comando atribui. */
export function makeFooting(f: Pick<Footing, 'id' | 'typeId' | 'levelId'> & Partial<Omit<Footing, 'kind' | 'order'>>): Omit<Footing, 'order'> {
  return { kind: 'footing', rotation: 0, topOffset: 0, mark: '', comments: '', ...f };
}

/**
 * Fundação movida, girada ou espelhada (A.3). Isolada: posição e rotação como o pilar. Corrida: o eixo acompanha a
 * transformação (a rotação não é usada).
 */
export function transformFooting(f: Footing, t: Transform): Footing {
  const next: Footing = { ...f };
  if (f.pos) {
    next.pos = applyTransform(t, f.pos);
    next.rotation = t.kind === 'mirror' ? 2 * Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) - f.rotation : f.rotation + (t.kind === 'rotate' ? t.angle : 0);
  }
  if (f.a) next.a = applyTransform(t, f.a);
  if (f.b) next.b = applyTransform(t, f.b);
  return next;
}
