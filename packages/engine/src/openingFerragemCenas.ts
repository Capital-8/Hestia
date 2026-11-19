import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape, type OpeningType, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import type { OpeningModel } from './openingModelTypes.ts';

/** Cenas e formas dos testes de ferragem (docs/estudo-esquadrias/42): um tipo numa parede de 4 m, com ou sem forma, e as 14 formas da varredura. */

/** O tipo (sem a forma do catálogo, se tiver) montado em `ot_x` na parede `w`; `forma` ausente = vão retangular. */
export function cenaDoTipo(t0: OpeningType, shape?: OpeningShape, hand = false, facing = false): { p: Project; m: OpeningModel } {
  const s = new ProjectStore(createEmptyProject());
  const { shape: _antiga, ...base } = t0;
  void _antiga;
  s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_x', ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: hand, flipFacing: facing, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const f = frameOfWall(p, 'w')!;
  return { p, m: buildOpeningModel(p, p.elements.v as Opening, openingGeometry(p, p.elements.v as Opening, f), f) };
}

/** Nomes das formas da varredura, na ordem: 9 tipos de forma, com os parâmetros extremos de cada um. */
export const NOMES_FORMAS = [
  'round', 'seg-pequena', 'seg-grande', 'ogival', 'ogival-1.5', 'ogival-2', 'ogival-3', 'circle', 'ferradura-estreita', 'empena', 'empena-triangulo', 'trapezio', 'trapezio-min', 'poligono-pontudo',
] as const;
export type NomeForma = (typeof NOMES_FORMAS)[number];

/**
 * A forma de nome `nome` para um vão `w` x `h`. Ogival: flecha 0,87 w (usual), 1,5 w, 2 w e 3 w (limitada à altura menos 12 cm: a flecha
 * é gravada em metros e não pode passar da esquadria); arco abatido com flecha de 5 cm e a maior possível (w / 2); empena em casinha e
 * em triângulo (cumeeira = altura); trapézio com topo de 60 % e de 8 % da largura; ferradura com pescoço de metade da largura;
 * polígono pontudo (ombros baixos e vértice no topo).
 */
export function formaDaVarredura(nome: NomeForma, w: number, h: number): OpeningShape {
  const alto = Math.max(w / 2, h - 0.12);
  const P = (pts: Array<[number, number]>): Array<{ u: number; v: number }> => pts.map(([u, v]) => ({ u: u * w, v: v * h }));
  switch (nome) {
    case 'round': return { kind: 'round', width: w, height: h };
    case 'seg-pequena': return { kind: 'segmental', width: w, height: h, rise: 0.05 };
    case 'seg-grande': return { kind: 'segmental', width: w, height: h, rise: Math.min(w / 2, h) };
    case 'ogival': return { kind: 'pointed', width: w, height: h, rise: Math.min(Math.max(w * 0.866, w / 2), h) };
    case 'ogival-1.5': return { kind: 'pointed', width: w, height: h, rise: Math.min(Math.max(1.5 * w, w / 2), alto) };
    case 'ogival-2': return { kind: 'pointed', width: w, height: h, rise: Math.min(Math.max(2 * w, w / 2), alto) };
    case 'ogival-3': return { kind: 'pointed', width: w, height: h, rise: Math.min(Math.max(3 * w, w / 2), alto) };
    case 'circle': return { kind: 'circle', width: w, height: h };
    case 'ferradura-estreita': return { kind: 'horseshoe', width: w, height: h, neck: 0.5 * w };
    case 'empena': return { kind: 'gable', width: w, height: h, rise: h / 3 };
    case 'empena-triangulo': return { kind: 'gable', width: w, height: h, rise: h };
    case 'trapezio': return { kind: 'trapezoid', width: w, height: h, topWidth: 0.6 * w };
    case 'trapezio-min': return { kind: 'trapezoid', width: w, height: h, topWidth: 0.08 * w };
    case 'poligono-pontudo': return { kind: 'polygon', width: w, height: h, points: P([[0, 0], [1, 0], [1, 0.15], [0.5, 1], [0, 0.15]]) };
  }
}
