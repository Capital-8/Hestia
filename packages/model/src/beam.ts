import { applyTransform, type Transform } from '@hestia/geom';
import type { Beam, BeamType } from './estrTypes.ts';
import type { Element, Id, Project } from './types.ts';

export const isBeam = (e: Element | undefined): e is Beam => e?.kind === 'beam';

/** Vigas de um nível, na ordem de criação. */
export const beamsOnLevel = (p: Project, levelId: Id): Beam[] =>
  Object.values(p.elements)
    .filter(isBeam)
    .filter((b) => b.levelId === levelId)
    .sort((a, b) => a.order - b.order);

/** Comprimento do eixo da viga em planta, em metros. */
export const beamPlanLength = (b: Pick<Beam, 'a' | 'b'>): number => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y);

/** Tipo padrão (A.3): viga 15 × 40 de concreto. */
export const DEFAULT_BEAM_TYPES: Readonly<Record<Id, BeamType>> = {
  vig_15x40: { id: 'vig_15x40', name: 'Retangular 15 × 40', code: 'V-15x40', description: '', perfil: { forma: 'retangular', b: 0.15, h: 0.4 }, materialId: 'mat_concreto', cost: 0 },
};

/** Tipos de viga do projeto. Mesmo regime de `columnTypesOf`. */
export function beamTypesOf(p: Project): Record<Id, BeamType> {
  return p.beamTypes ?? structuredClone({ ...DEFAULT_BEAM_TYPES });
}

/** Monta uma viga com os padrões do modelo (alinhamento no topo, extremidades rígidas); `order` o comando atribui. */
export function makeBeam(b: Pick<Beam, 'id' | 'typeId' | 'levelId' | 'a' | 'b'> & Partial<Omit<Beam, 'kind' | 'order'>>): Omit<Beam, 'order'> {
  return { kind: 'beam', zOffsetA: 0, zOffsetB: 0, alinhamento: 'topo', rotation: 0, extremidadeA: 'rigida', extremidadeB: 'rigida', mark: '', comments: '', ...b };
}

/**
 * Viga movida, girada ou espelhada (A.3): o eixo acompanha a transformação. Espelhar inverte o sentido do giro da
 * seção em torno do eixo; as cotas `zOffset` e o alinhamento não mudam.
 */
export function transformBeam(b: Beam, t: Transform): Beam {
  return { ...b, a: applyTransform(t, b.a), b: applyTransform(t, b.b), ...(t.kind === 'mirror' ? { rotation: -b.rotation } : {}) };
}
