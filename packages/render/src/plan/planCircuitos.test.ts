import { applyCommand, createEmptyProject, familiaDaBiblioteca, ID_QUADRO_ELETRICO, type Command, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { componentsPlanOps } from './planComponents.ts';
import { destaquesDeCircuitos } from './planCircuitos.ts';
import type { PlanTheme } from './types.ts';

const aplicar = (p: Project, c: Command): Project => {
  const q = structuredClone(p);
  applyCommand(q, c);
  return q;
};
const tema = { bg: '#ffffff', inkSoft: '#555555' } as unknown as PlanTheme;
const comp = (id: string, familyId: string, typeId: string): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId, levelId: 'lv_0', x: 1, y: 1, z: 0, rotation: 0, mirrored: false, mark: id });

function projeto(): Project {
  let p = createEmptyProject('t');
  const q = familiaDaBiblioteca(ID_QUADRO_ELETRICO)!;
  p = aplicar(p, { type: 'upsertFamily', family: structuredClone(q) });
  p = aplicar(p, { type: 'addComponent', component: comp('qd', ID_QUADRO_ELETRICO, 'dn25') });
  return p;
}

describe('destaque de circuito na planta', () => {
  it('sem circuitos não gera nada', () => {
    const r = destaquesDeCircuitos(projeto(), 'lv_0', undefined);
    expect(r.fills).toEqual([]);
    expect(r.strokes).toEqual([]);
  });
  it('componente de circuito ganha véu e contorno na cor do circuito', () => {
    let p = projeto();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: { id: 'c1', nome: 'C1', tipo: 'iluminacao', tensao: 127, pontos: [{ componenteId: 'qd', potenciaVA: 10 }], cor: '#2f9e44' } });
    const r = destaquesDeCircuitos(p, 'lv_0', undefined);
    expect(r.fills.length).toBe(1);
    expect(r.fills[0]!.color).toBe('#2f9e44');
    expect(r.strokes.length).toBeGreaterThan(0);
    expect(r.strokes.every((s) => s.color === '#2f9e44')).toBe(true);
    const ops = componentsPlanOps(p, 'lv_0', tema, undefined);
    expect(ops.strokes.some((s) => s.color === '#2f9e44')).toBe(true);
  });
  it('componente oculto ou de outro nível não é destacado', () => {
    let p = projeto();
    p = aplicar(p, { type: 'addCircuitoEletrico', circuito: { id: 'c1', nome: 'C1', tipo: 'iluminacao', tensao: 127, pontos: [{ componenteId: 'qd', potenciaVA: 10 }], cor: '#2f9e44' } });
    expect(destaquesDeCircuitos(p, 'lv_0', new Set(['qd'])).fills).toEqual([]);
    expect(destaquesDeCircuitos(p, 'outro', undefined).fills).toEqual([]);
  });
});
