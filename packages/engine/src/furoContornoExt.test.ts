import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { openingShapeIssues } from './openingShapeIssues.ts';
import { definirClienteFuroContorno, quantificarParedePorContorno, rotaDoVao, type ClienteFuroContorno } from './furoContornoDespacho.ts';
import { frameOfWall, openingGeometry } from './resolve.ts';

/** Fronteira da troca (docs/estudo-esquadrias/33) testável sem o wasm: rota com perfil, aviso de envelope e porta da medição. */

function projeto(offset: number, sill: number, shape: OpeningShape = { kind: 'round', width: 1, height: 1 }): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_f = { ...base.openingTypes.ot_j120!, id: 'ot_f', width: 1.2, height: 0.6, sill, leaves: 0, shape };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  const o: Opening = { id: 'o1', kind: 'window', typeId: 'ot_f', hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

afterEach(() => definirClienteFuroContorno(null));

describe('rota com perfil de topo', () => {
  const g = (p: Project) => openingGeometry(p, p.elements.o1 as Opening, frameOfWall(p, 'w1')!);
  const base: ClienteFuroContorno = { furarParede: () => null };

  it('perfil fica retangular sem a capacidade de topo inclinado, e vai por contorno com ela', () => {
    const p = projeto(3, 1);
    definirClienteFuroContorno(base);
    expect(rotaDoVao(g(p), { perfil: true })).toEqual({ via: 'retangular', motivo: 'parede-com-perfil' });
    definirClienteFuroContorno({ ...base, topoInclinado: true });
    expect(rotaDoVao(g(p), { perfil: true })).toEqual({ via: 'contorno' });
    // parede inclinada e curva continuam retangulares mesmo com a capacidade
    expect(rotaDoVao(g(p), { perfil: true, tilt: 5 })).toEqual({ via: 'retangular', motivo: 'parede-inclinada' });
    expect(rotaDoVao(g(p), { clusterInclinado: true })).toEqual({ via: 'retangular', motivo: 'cluster-inclinado' });
  });
});

describe('aviso vao-fora-do-envelope', () => {
  const avisos = (p: Project, lang: 'pt' | 'en' = 'pt') => openingShapeIssues(p, lang).filter((i) => i.code === 'vao-fora-do-envelope');

  it('forma que cabe na parede não avisa; que passa do topo avisa com o excesso (0,20 m)', () => {
    expect(avisos(projeto(3, 1))).toEqual([]);
    const a = avisos(projeto(3, 2.6));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ severity: 'warning', elementId: 'o1', ids: ['o1', 'w1'] });
    expect(a[0]!.message).toContain('0.20');
    expect(avisos(projeto(3, 2.6), 'en')[0]!.message).toContain('0.20');
  });

  it('o aviso só vale para vão com forma: vão retangular (sem shape) não avisa', () => {
    const p = projeto(3, 2.6);
    const sem: Project = { ...p, openingTypes: { ...p.openingTypes, ot_f: { ...p.openingTypes.ot_f!, shape: undefined } } };
    expect(avisos(sem)).toEqual([]);
  });
});

describe('porta da medição da parede', () => {
  it('sem cliente, sem quantificarParede ou sem vão: null; com cliente: memoizado por conteúdo', () => {
    const pedido = { wallId: 'w1', comprimento: 6, altura: 3, vaos: [{ openingId: 'o1', contorno: [[0.5, 0], [0.5, 1], [-0.5, 1], [-0.5, 0]] as const, x: 3, soleira: 1 }] };
    expect(quantificarParedePorContorno(pedido)).toBeNull();
    let chamadas = 0;
    definirClienteFuroContorno({ furarParede: () => null, quantificarParede: () => (chamadas++, { areaFuroNaFace: 1, areaFaceLiquida: 17 }) });
    expect(quantificarParedePorContorno({ ...pedido, vaos: [] })).toBeNull();
    expect(quantificarParedePorContorno(pedido)).toEqual({ areaFuroNaFace: 1, areaFaceLiquida: 17 });
    quantificarParedePorContorno(pedido);
    expect(chamadas).toBe(1);
    definirClienteFuroContorno({ furarParede: () => null });
    expect(quantificarParedePorContorno(pedido)).toBeNull();
  });
});
