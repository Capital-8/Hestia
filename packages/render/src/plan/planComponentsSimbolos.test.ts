import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, paperMmToPx, type Familia, type Project, type Simbolo2D } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { componentsPlanOps } from './planComponents.ts';
import { LIGHT } from './types.ts';

/** Símbolo de planta: uma linha de 800 mm em X (ou o que a lista disser). */
const linhaX: Simbolo2D = { id: 'tomada', nome: 'Tomada', vistas: ['planta'], plano: 'xy', primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['800', '0'] }] };

/** Armário A80 em (1, 2) com estes símbolos na família; `girar` e `espelho` vão para a instância. */
function cena(simbolos: Simbolo2D[], instancia: { rotation?: number; mirrored?: boolean } = {}): Project {
  const p = createEmptyProject('t');
  const familia: Familia = { ...structuredClone(FAMILIA_ARMARIO), simbolos };
  aplicar(p, { type: 'upsertFamily', family: familia });
  p.elements.c1 = {
    id: 'c1', kind: 'component', familyId: familia.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1,
    x: 1, y: 2, z: 0, rotation: instancia.rotation ?? 0, mirrored: instancia.mirrored ?? false, mark: 'c1',
  };
  return p;
}

const plantas = (p: Project) => componentsPlanOps(p, p.levels[0]!.id, LIGHT, undefined);
const arredondado = (pts: { x: number; y: number }[]): number[][] => pts.map((q) => [Math.round(q.x * 1e4) / 1e4, Math.round(q.y * 1e4) / 1e4]);

describe('símbolos 2D na planta (D2)', () => {
  it('símbolo com substituiGeometria tira a geometria automática: só as linhas do símbolo', () => {
    const r = plantas(cena([{ ...linhaX, substituiGeometria: true }]));
    expect(r.fills).toHaveLength(0);
    expect(r.strokes).toHaveLength(1);
    expect(arredondado(r.strokes[0]!.pts)).toEqual([[1, 2], [1.8, 2]]);
  });

  it('rotação de 90° gira o símbolo junto com a instância', () => {
    const r = plantas(cena([{ ...linhaX, substituiGeometria: true }], { rotation: Math.PI / 2 }));
    expect(arredondado(r.strokes[0]!.pts)).toEqual([[1, 2], [1, 2.8]]);
  });

  it('espelho inverte o símbolo no eixo X local da instância', () => {
    const r = plantas(cena([{ ...linhaX, substituiGeometria: true }], { mirrored: true }));
    expect(arredondado(r.strokes[0]!.pts)).toEqual([[1, 2], [0.2, 2]]);
  });

  it('texto do símbolo sai com tamanho de modelo: altura (m) × zoom em pixels', () => {
    const r = plantas(cena([{ id: 'rotulo', nome: 'Rótulo', vistas: ['planta'], plano: 'xy', primitivos: [{ tipo: 'texto', posicao: ['0', '0'], texto: '"Tomada"', altura: '100' }] }]));
    expect(r.labels).toHaveLength(1);
    expect(r.labels[0]!.text).toBe('Tomada');
    // Altura de 100 mm de modelo = 0,1 m: a 100 px/m o corpo do texto tem 10 px, qualquer que seja a escala da prancha.
    const px = paperMmToPx(r.labels[0]!.papel!.fontMm!, 100, r.labels[0]!.papel!.escala);
    expect(px).toBeCloseTo(10, 6);
  });
});
