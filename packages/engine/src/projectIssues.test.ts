import { describe, expect, it } from 'vitest';
import { ProjectStore, buildTemplate, createEmptyProject, makeSlab, makeWall, type Floor, type Opening, type Project, type Slab, type Wall } from '@hestia/model';
import { projectIssues } from './index.ts';

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

type W = Omit<Wall, 'order'>;
type S = Omit<Slab, 'order'>;

function build(walls: W[], slabs: S[] = [], floors: Array<Omit<Floor, 'order'>> = [], openings: Opening[] = []): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const w of walls) s.exec({ type: 'addWall', wall: w });
  for (const l of slabs) s.exec({ type: 'addSlab', slab: l });
  for (const f of floors) s.exec({ type: 'addFloor', floor: f });
  for (const o of openings) s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

const wall = (id: string, a: [number, number], b: [number, number], extra: Partial<W> = {}): W =>
  makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, height: 3, ...extra });

const opening = (hostId: string, offset: number, typeId = 'ot_p80'): Opening => ({
  id: 'o1',
  kind: 'door',
  typeId,
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
});

/** `addOpening` já prende o offset no hospedeiro; o aviso nasce de parede encurtada ou arquivo antigo: grava direto. */
function withOffset(p: Project, id: string, offset: number): Project {
  return { ...p, elements: { ...p.elements, [id]: { ...(p.elements[id] as Opening), offset } } };
}

describe('abertura-fora-da-parede', () => {
  const fora = (p: Project) => projectIssues(p).filter((i) => i.code === 'abertura-fora-da-parede');
  const base = (offset: number, extra: Partial<W> = {}) => withOffset(build([wall('w1', [0, 0], [4, 0], extra)], [], [], [opening('w1', 2)]), 'o1', offset);

  it('offset é o CENTRO: o vão de 0,8 m centrado em 3,7 passa 0,1 m do fim e avisa', () => {
    const [issue] = fora(base(3.7));
    expect(issue).toMatchObject({ severity: 'warning', elementId: 'o1', ids: ['o1', 'w1'] });
    expect(issue!.message).toContain('eixo tem 4,00 m');
  });

  it('offset é o CENTRO: o vão de 0,8 m centrado em 3,6 encosta no fim e não avisa', () => {
    expect(fora(base(3.6))).toEqual([]);
  });

  it('offset é o CENTRO: centrado em 0,3 invade 0,1 m antes do início e avisa', () => {
    expect(fora(base(0.3))).toHaveLength(1);
  });

  it('offset é o CENTRO: centrado em 0,4 encosta no início e não avisa', () => {
    expect(fora(base(0.4))).toEqual([]);
  });

  it('o centro em 3,5 (borda inicial em 3,1, final em 3,9) não avisa', () => {
    expect(fora(base(3.5))).toEqual([]);
  });

  it('parede curva: usa o comprimento do arco (~4,64 m), não a corda (4 m)', () => {
    // Centro em 4,1 + meia largura 0,4 = 4,5 m: cabe no arco, mas passaria da corda.
    expect(fora(base(4.1, { sag: 1 }))).toEqual([]);
    expect(fora(base(4.4, { sag: 1 }))).toHaveLength(1);
  });

  it('a casa de alto padrão não tem aviso: os seis casos antigos eram a leitura de offset como borda inicial', () => {
    expect(fora(buildTemplate('house-premium'))).toEqual([]);
  });

  it.each(['blank', 'house2', 'studio', 'predio10'] as const)('%s não tem abertura fora da parede', (id) => {
    expect(projectIssues(buildTemplate(id)).filter((i) => i.code === 'abertura-fora-da-parede')).toEqual([]);
  });
});

describe('parede-topo-desnivelado', () => {
  it('duas paredes colineares que se tocam com topos diferentes avisam', () => {
    const p = build([wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0], [8, 0], { height: 2.5 })]);
    const [issue] = projectIssues(p).filter((i) => i.code === 'parede-topo-desnivelado');
    expect(issue).toMatchObject({ severity: 'warning', elementId: 'w1', ids: ['w1', 'w2'] });
    expect(issue!.message).toContain('3,00 m e 2,50 m');
  });

  it('topos iguais não avisam', () => {
    const p = build([wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0], [8, 0])]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-topo-desnivelado')).toEqual([]);
  });

  it('níveis diferentes não avisam', () => {
    const p = build([wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0], [8, 0], { levelId: 'lv_1', height: 2.5 })]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-topo-desnivelado')).toEqual([]);
  });

  it('eixos deslocados mais de 1 cm não avisam', () => {
    const p = build([wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0.02], [8, 0.02], { height: 2.5 })]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-topo-desnivelado')).toEqual([]);
  });

  it('eixos com mais de 1° não avisam', () => {
    const p = build([wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0], [8, 0.2], { height: 2.5 })]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-topo-desnivelado')).toEqual([]);
  });

  it('parede curva e parede com perfil superior ficam fora do aviso', () => {
    const p = build([
      wall('w1', [0, 0], [4, 0], { sag: 0.5 }),
      wall('w2', [4, 0], [8, 0], { height: 2.5 }),
      wall('w3', [0, 2], [4, 2], { topProfile: [{ t: 0, h: 3 }, { t: 4, h: 2 }] }),
      wall('w4', [4, 2], [8, 2], { height: 2.5 }),
    ]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-topo-desnivelado')).toEqual([]);
  });
});

describe('parede-dentro-da-laje', () => {
  const slab = (typeId: string, extra: Partial<S> = {}): S => makeSlab({ id: 'l1', typeId, levelId: 'lv_0', boundary: rect(0, 0, 6, 4), ...extra });

  it('parede que cruza a camada passa avisa com a laje e o trecho comum', () => {
    const p = build([wall('w1', [1, 2], [5, 2])], [slab('ls_unica', { heightOffset: 0.1 })]);
    const [issue] = projectIssues(p).filter((i) => i.code === 'parede-dentro-da-laje');
    expect(issue).toMatchObject({ severity: 'warning', elementId: 'w1', ids: ['w1', 'l1'] });
    expect(issue!.message).toContain('camada 2');
    expect(issue!.message).toContain('término "passa"');
    expect(issue!.message).toContain('0,07 m');
  });

  it('laje sem camada passa não avisa', () => {
    const p = build([wall('w1', [1, 2], [5, 2])], [slab('ls_mac12', { heightOffset: 0.1 })]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-dentro-da-laje')).toEqual([]);
  });

  it('parede com base acima da camada passa não avisa', () => {
    const p = build([wall('w1', [1, 2], [5, 2], { baseOffset: 0.2 })], [slab('ls_unica', { heightOffset: 0.1 })]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-dentro-da-laje')).toEqual([]);
  });

  it('parede fora do contorno da laje não avisa', () => {
    const p = build([wall('w1', [7, 2], [8, 2])], [slab('ls_unica', { heightOffset: 0.1 })]);
    expect(projectIssues(p).filter((i) => i.code === 'parede-dentro-da-laje')).toEqual([]);
  });
});
