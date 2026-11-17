import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project } from '@hestia/model';
import { cadeiaContinua, quantifyLevel, resolveLevel, wallTiltJoinIssues, analyzeLevelTilt, levelFrames } from './index.ts';

/** Etapa R: ações D (acompanhar inclinação) e B (cunha). t=0,2, H=3. Valores literais calculados à mão. */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
type Seg = { id: string; a: [number, number]; b: [number, number]; tilt?: number; cunha?: boolean };
function proj(segs: Seg[]): ProjectStore {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  for (const g of segs) {
    const j = g.cunha ? { transicao: 'cunha' as const, kind: 'butt' as const, flip: false } : undefined;
    s.exec({ type: 'addWall', wall: makeWall({ id: g.id, typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] }, ...(g.tilt ? { tilt: g.tilt } : {}), ...(j ? { joinEnd: j, joinStart: j } : {}) }) });
  }
  return s;
}
const frames = (p: Project) => levelFrames(p, 'lv_0');
const tiltOf = (p: Project, id: string) => (p.elements[id] as { tilt?: number }).tilt ?? 0;
const alinhar = (s: ProjectStore, ref: string, graus: number) => {
  const ch = cadeiaContinua(frames(s.project), ref);
  s.exec({ type: 'alignTiltOfChain', items: ch.map((c) => ({ id: c.id, tilt: graus * c.sinal })) });
  return ch;
};

describe('ação D: acompanhar a inclinação da cadeia', () => {
  const tres = (): Seg[] => [
    { id: 'A', a: [0, 0], b: [4, 0], tilt: -20 },
    { id: 'B', a: [4, 0], b: [8, 0], tilt: -15 },
    { id: 'C', a: [8, 0], b: [12, 0], tilt: -10 },
  ];
  it('cadeia de 3 paredes: todas -20 em um desfazer, e refazer', () => {
    const s = proj(tres());
    expect(wallTiltJoinIssues(s.project).length).toBeGreaterThan(0);
    alinhar(s, 'A', -20);
    for (const id of ['A', 'B', 'C']) expect(tiltOf(s.project, id)).toBeCloseTo(-20, 4);
    expect(wallTiltJoinIssues(s.project)).toEqual([]);
    s.undo();
    expect([tiltOf(s.project, 'A'), tiltOf(s.project, 'B'), tiltOf(s.project, 'C')]).toEqual([-20, -15, -10]);
    s.redo();
    expect([tiltOf(s.project, 'A'), tiltOf(s.project, 'B'), tiltOf(s.project, 'C')]).toEqual([-20, -20, -20]);
  });
  it('parede do meio invertida (b→a): recebe +20 e o topo acompanha o mesmo lado', () => {
    const s = proj([tres()[0]!, { id: 'B', a: [8, 0], b: [4, 0], tilt: 15 }, tres()[2]!]);
    const ch = alinhar(s, 'A', -20);
    expect(ch.find((c) => c.id === 'B')!.sinal).toBe(-1);
    expect([tiltOf(s.project, 'A'), tiltOf(s.project, 'B'), tiltOf(s.project, 'C')]).toEqual([-20, 20, -20]);
    expect(wallTiltJoinIssues(s.project)).toEqual([]);
  });
  it('referência no meio e sem ligação: só a própria parede', () => {
    const s = proj([...tres(), { id: 'Z', a: [0, 5], b: [3, 5] }]);
    expect(cadeiaContinua(frames(s.project), 'Z').map((c) => c.id)).toEqual(['Z']);
    expect(cadeiaContinua(frames(s.project), 'B').map((c) => c.id).sort()).toEqual(['A', 'B', 'C']);
  });
  it('recusa atômica: se uma parede violar o limite nada muda', () => {
    const s = proj(tres());
    expect(() => s.exec({ type: 'alignTiltOfChain', items: [{ id: 'A', tilt: -20 }, { id: 'B', tilt: 61 }] })).toThrow();
    expect([tiltOf(s.project, 'A'), tiltOf(s.project, 'B')]).toEqual([-20, -15]);
  });
});

describe('ação B: cunha na junção', () => {
  const vol = (s: ProjectStore) => quantifyLevel(s.project, resolveLevel(s.project, 'lv_0'));
  // step = 3·(tan20° − tan15°) = 3·0,0960210419 = 0,2880631257; V = step·3·0,2/2 = 0,0864189377
  it('-20°/-15°, 4 m, t=0,2, H=3: o volume da cunha é 0,086419 a mais que o degrau', () => {
    const seg = (c: boolean): Seg[] => [{ id: 'A', a: [0, 0], b: [4, 0], tilt: -20, cunha: c }, { id: 'B', a: [4, 0], b: [8, 0], tilt: -15, cunha: c }];
    const sem = vol(proj(seg(false))), com = vol(proj(seg(true)));
    expect(com.volumeByMaterial.mat_concreto! - sem.volumeByMaterial.mat_concreto!).toBeCloseTo(0.0864189, 4);
    const wa = (q: typeof com) => q.walls.find((w) => w.wallId === 'A')!;
    expect(wa(com).volume - wa(sem).volume).toBeCloseTo(0.0864189, 4);
    const sc = proj(seg(true));
    const an = analyzeLevelTilt(frames(sc.project), new Map([['A', 3], ['B', 3]]));
    expect(an.cunhas.length).toBe(1);
    expect(an.cunhas[0]!.volume).toBeCloseTo(0.0864189, 4);
    expect(an.avisos.length).toBe(1); // o aviso continua: a cunha é escolha do usuário
  });
  it('inclinações iguais ou verticais com cunha: sem cunha e quantitativos idênticos', () => {
    for (const [a, b] of [[-15, -15], [0, 0]] as const) {
      const mk = (c: boolean): Seg[] => [{ id: 'A', a: [0, 0], b: [4, 0], tilt: a, cunha: c }, { id: 'B', a: [4, 0], b: [8, 0], tilt: b, cunha: c }];
      const x = proj(mk(true)), y = proj(mk(false));
      expect(analyzeLevelTilt(frames(x.project), new Map([['A', 3], ['B', 3]])).cunhas).toEqual([]);
      expect(vol(x)).toEqual(vol(y));
      expect(wallTiltJoinIssues(x.project)).toEqual([]);
    }
  });
});
