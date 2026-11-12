import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { computeSection, planoDaSecao } from './index.ts';

describe('plano do corte (guarda-corpo no corte e na elevação)', () => {
  it('o plano acompanha o resultado mesmo depois de clonado (o corte sai do worker por clonagem estruturada)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
    const linha = { a: { x: 3, y: -1 }, b: { x: 3, y: 1 }, depth: 3 };
    const r = computeSection(s.project, linha);
    expect(planoDaSecao(r)).toEqual(linha);
    const clonado = structuredClone(r);
    expect(planoDaSecao(clonado)).toEqual(linha);
  });
});
