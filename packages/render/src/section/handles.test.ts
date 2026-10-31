import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { computeSection } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Project, type SectionAnnotations } from '@hestia/model';
import { pickSectionAnnotation, pickSectionDimensionGrip, pickSectionHandle, sectionOpeningHandles } from './handles.ts';
import { pickSection } from './pick.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Elevação com uma parede e duas janelas iguais (J-01: 1,20 × 1,20, peitoril 1,10). */
function elevacao(): Project {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  for (const [id, offset] of [['j1', 1.5], ['j2', 4.5]] as const) {
    store.exec({ type: 'addOpening', opening: { id, kind: 'window', typeId: 'ot_j120', hostId: 'w', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  }
  return store.project;
}

const FRENTE = { a: v(0, -2), b: v(6, -2), depth: 20 };

/** Anotações de exemplo, cada uma numa faixa livre da vista (para o pick não acertar duas por engano). */
function anotacoes(): SectionAnnotations {
  return {
    dimensions: [{ id: 'dim1', a: v(0, 0), b: v(2, 0), offset: 0.3 }],
    texts: [{ id: 'txt1', at: v(3, 2), text: 'Corte AA', height: 2.5, rotation: 0, width: 30 }],
    detailLines: [{ id: 'ln1', a: v(0, 3), b: v(2, 3) }],
    detailRegions: [{ id: 'rg1', boundary: [v(4, 0), v(5, 0), v(5, 1), v(4, 1)] }],
    tags: [{ id: 'tag1', hostId: 'w', at: v(10, 1), property: 'type' }],
  };
}

describe('alças de abertura (sectionOpeningHandles)', () => {
  it('janela: peitoril e topo no meio de t, montantes no meio de z', () => {
    const r = computeSection(elevacao(), FRENTE);
    const j1 = r.openings.find((o) => o.openingId === 'j1')!;
    const handles = sectionOpeningHandles(r, 'j1');
    expect(handles.map((h) => h.kind)).toEqual(['sill', 'head', 'jamb-a', 'jamb-b']);

    const midT = (j1.t0 + j1.t1) / 2;
    const midZ = (j1.z0 + j1.z1) / 2;
    const byKind = new Map(handles.map((h) => [h.kind, h]));
    expect(byKind.get('sill')!.at.x).toBeCloseTo(midT, 9);
    expect(byKind.get('sill')!.at.y).toBeCloseTo(j1.z0, 9);
    expect(byKind.get('head')!.at.x).toBeCloseTo(midT, 9);
    expect(byKind.get('head')!.at.y).toBeCloseTo(j1.z1, 9);
    expect(byKind.get('jamb-a')!.at.x).toBeCloseTo(j1.t0, 9);
    expect(byKind.get('jamb-a')!.at.y).toBeCloseTo(midZ, 9);
    expect(byKind.get('jamb-b')!.at.x).toBeCloseTo(j1.t1, 9);
    expect(byKind.get('jamb-b')!.at.y).toBeCloseTo(midZ, 9);
    for (const h of handles) expect(h.openingId).toBe('j1');

    // A janela padrão: 1,20 m de largura, peitoril 1,10 e topo 2,30.
    expect(j1.t1 - j1.t0).toBeCloseTo(1.2, 9);
    expect(j1.z0).toBeCloseTo(1.1, 9);
    expect(j1.z1).toBeCloseTo(2.3, 9);
  });

  it('abertura que não aparece na vista: nenhuma alça', () => {
    const r = computeSection(elevacao(), FRENTE);
    expect(sectionOpeningHandles(r, 'nao_existe')).toEqual([]);
  });
});

describe('seleção de alça (pickSectionHandle)', () => {
  it('dentro da tolerância pega a alça mais próxima; fora, nada', () => {
    const r = computeSection(elevacao(), FRENTE);
    const sill = sectionOpeningHandles(r, 'j1').find((h) => h.kind === 'sill')!;
    const near = v(sill.at.x + 0.05, sill.at.y + 0.05);
    expect(pickSectionHandle(r, near, 0.1)?.kind).toBe('sill');
    expect(pickSectionHandle(r, near, 0.01)).toBeNull();
    // A 5 cm do topo, só o topo está dentro da tolerância.
    const head = sectionOpeningHandles(r, 'j1').find((h) => h.kind === 'head')!;
    expect(pickSectionHandle(r, v(head.at.x, head.at.y + 0.05), 0.1)?.kind).toBe('head');
  });

  it('o ponto exato vale com tolerância zero', () => {
    const r = computeSection(elevacao(), FRENTE);
    const jamb = sectionOpeningHandles(r, 'j2').find((h) => h.kind === 'jamb-b')!;
    expect(pickSectionHandle(r, jamb.at, 0)).toEqual(jamb);
  });

  it('openingId restringe a busca às alças daquela abertura', () => {
    const r = computeSection(elevacao(), FRENTE);
    const sill2 = sectionOpeningHandles(r, 'j2').find((h) => h.kind === 'sill')!;
    expect(pickSectionHandle(r, sill2.at, 0.01, 'j2')?.openingId).toBe('j2');
    expect(pickSectionHandle(r, sill2.at, 0.01, 'j1')).toBeNull();
    // Sem restrição, o mesmo ponto (longe das alças de j1) acha j2.
    expect(pickSectionHandle(r, sill2.at, 0.01)?.openingId).toBe('j2');
  });
});

describe('seleção de anotações de seção (pickSectionAnnotation)', () => {
  it('cota: a linha deslocada, as chamadas e o texto selecionam pelo id', () => {
    const a = anotacoes();
    expect(pickSectionAnnotation(a, v(1, 0.3), 0.01)).toEqual({ id: 'dim1', kind: 'dimension' });
    // Linha de chamada do ponto a até a linha de cota.
    expect(pickSectionAnnotation(a, v(0, 0.15), 0.01)).toEqual({ id: 'dim1', kind: 'dimension' });
    // Fora da cota (0,3 m acima da linha): nada.
    expect(pickSectionAnnotation(a, v(1, 0.6), 0.01)).toBeNull();
  });

  it('texto: a caixa girada do bloco vale além da âncora', () => {
    const a = anotacoes();
    // 30 mm de largura a 1:100 = 3,00 m de caixa; 1,2 m à direita da âncora ainda está dentro.
    expect(pickSectionAnnotation(a, v(4.2, 2), 0.01)).toEqual({ id: 'txt1', kind: 'text' });
    // Na escala 1:50 a caixa encolhe pela metade e o mesmo ponto fica de fora.
    expect(pickSectionAnnotation(a, v(4.2, 2), 0.01, 50)).toBeNull();
    expect(pickSectionAnnotation(a, v(4.6, 2), 0.01)).toBeNull();
  });

  it('linha e região de detalhe: segmento e interior/borda', () => {
    const a = anotacoes();
    expect(pickSectionAnnotation(a, v(1, 3.05), 0.1)).toEqual({ id: 'ln1', kind: 'detailLine' });
    expect(pickSectionAnnotation(a, v(4.5, 0.5), 0)).toEqual({ id: 'rg1', kind: 'detailRegion' });
    // Borda da região, à esquerda, dentro da tolerância.
    expect(pickSectionAnnotation(a, v(3.95, 0.5), 0.1)).toEqual({ id: 'rg1', kind: 'detailRegion' });
  });

  it('etiqueta: o ponto de inserção, dentro da tolerância', () => {
    const a = anotacoes();
    expect(pickSectionAnnotation(a, v(10.05, 1.02), 0.1)).toEqual({ id: 'tag1', kind: 'tag' });
    expect(pickSectionAnnotation(a, v(10.2, 1), 0.1)).toBeNull();
  });

  it('a ordem de pintura decide: o texto por cima da região de detalhe ganha', () => {
    const a = anotacoes();
    a.texts.push({ id: 'txt2', at: v(4.5, 0.5), text: 'Sobre', height: 2.5, rotation: 0 });
    expect(pickSectionAnnotation(a, v(4.5, 0.5), 0)).toEqual({ id: 'txt2', kind: 'text' });
  });

  it('fora de tudo (ou sem anotações): nada', () => {
    expect(pickSectionAnnotation(anotacoes(), v(8, 8), 0.01)).toBeNull();
    expect(pickSectionAnnotation({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }, v(0, 0), 1)).toBeNull();
  });
});

describe('a seleção existente (pickSection) não muda', () => {
  it('parede e janela continuam selecionadas como antes', () => {
    const r = computeSection(elevacao(), FRENTE);
    expect(pickSection(r, v(0.5, 0.5))).toEqual({ id: 'w', kind: 'wall' });
    const j1 = r.openings.find((o) => o.openingId === 'j1')!;
    expect(pickSection(r, v((j1.t0 + j1.t1) / 2, (j1.z0 + j1.z1) / 2))).toEqual({ id: 'j1', kind: 'window' });
  });
});

describe('cota do corte: tolerância separada do texto e alças (pickSectionDimensionGrip)', () => {
  it('a linha usa a tolerância dela e o texto, a sua (mais larga)', () => {
    const a: SectionAnnotations = {
      dimensions: [{ id: 'd', a: v(0, 4), b: v(2, 4), offset: 0.5, textAt: v(3, 5) }],
      texts: [],
      detailLines: [],
      detailRegions: [],
      tags: [],
    };
    // Linha em z = 4,5: 0,06 m de tolerância; texto em (3, 5): 0,10 m.
    expect(pickSectionAnnotation(a, v(1, 4.5 + 0.05), 0.06, 100, 0.1)).toEqual({ id: 'd', kind: 'dimension' });
    expect(pickSectionAnnotation(a, v(1, 4.5 + 0.09), 0.06, 100, 0.1)).toBeNull();
    expect(pickSectionAnnotation(a, v(3, 5 + 0.08), 0.06, 100, 0.1)).toEqual({ id: 'd', kind: 'dimension' });
    expect(pickSectionAnnotation(a, v(3, 5 + 0.15), 0.06, 100, 0.1)).toBeNull();
    // Sem a tolerância do texto, ela segue a da linha (compatível com a chamada antiga).
    expect(pickSectionAnnotation(a, v(3, 5 + 0.08), 0.06)).toBeNull();
  });

  it('a alça do meio muda só o deslocamento; o texto tem prioridade quando as duas estão perto', () => {
    const a: SectionAnnotations = {
      dimensions: [{ id: 'd', a: v(0, 4), b: v(2, 4), offset: 0.5, textAt: v(1, 5) }],
      texts: [],
      detailLines: [],
      detailRegions: [],
      tags: [],
    };
    // Meio da linha de cota em (1, 4,5): só a alça de deslocamento.
    expect(pickSectionDimensionGrip(a, ['d'], v(1, 4.5), 0.06, 0.1)).toEqual({ id: 'd', kind: 'offset', at: v(1, 4.5) });
    expect(pickSectionDimensionGrip(a, ['d'], v(1, 5), 0.06, 0.1)?.kind).toBe('text');
    // Texto e meio da linha ao alcance: o texto ganha, como na planta.
    const perto: SectionAnnotations = { ...a, dimensions: [{ ...a.dimensions[0]!, textAt: v(1, 4.55) }] };
    expect(pickSectionDimensionGrip(perto, ['d'], v(1, 4.52), 0.06, 0.1)?.kind).toBe('text');
  });

  it('só com uma única cota selecionada; sem seleção, ou com duas, não há alça', () => {
    const a: SectionAnnotations = {
      dimensions: [{ id: 'd', a: v(0, 4), b: v(2, 4), offset: 0.5 }],
      texts: [],
      detailLines: [],
      detailRegions: [],
      tags: [],
    };
    expect(pickSectionDimensionGrip(a, [], v(1, 4.5), 0.06)).toBeNull();
    expect(pickSectionDimensionGrip(a, ['d', 'outra'], v(1, 4.5), 0.06)).toBeNull();
    expect(pickSectionDimensionGrip(a, ['outra'], v(1, 4.5), 0.06)).toBeNull();
  });
});
