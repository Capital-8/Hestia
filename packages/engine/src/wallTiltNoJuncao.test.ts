import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { analyzeLevelTilt, tiltRelations } from './wallTiltJoinLevel.ts';
import { levelFrames } from './resolveFrames.ts';
import { junctionLevel } from './junctionLevel.ts';

/** N1 · produção: nó de 3+ paredes inclinadas na análise de nível (anéis por nível, mesma estrutura da J2). H = 3, t = 0,2, 4 m. */

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number }
function build(walls: W[], height = 3): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  for (const w of walls) {
    const j = { kind: 'miter' as const, flip: false };
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), joinStart: j, joinEnd: j }) as Wall });
  }
  return s.project;
}
const rad = (d: number): number => (d * Math.PI) / 180;
const out = (deg: number, len = 4): P => ({ x: len * Math.cos(rad(deg)), y: len * Math.sin(rad(deg)) });
const O: P = { x: 0, y: 0 };
const heights = (ids: string[]): Map<string, number> => new Map(ids.map((i) => [i, 3] as const));
const near = (p: P, x: number, y: number): void => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('N1 · nó de 3 paredes inclinadas na análise de nível', () => {
  // Mesmos valores do S5 (wallTiltNo.test.ts), calculados à mão: Y a 120° com tilt 15°: z=0 e z=3.
  it('Y com tilt 15° (uma parede com o nó no fim b e tilt de sinal trocado): anéis por nível', () => {
    const p = build([
      { id: 'w0', a: O, b: out(0), tilt: 15 },
      { id: 'w1', a: out(120), b: O, tilt: -15 }, // sai do nó a 120°; a→b entra no nó: o lado esquerdo troca
      { id: 'w2', a: O, b: out(240), tilt: 15 },
    ]);
    const frames = levelFrames(p, 'lv_0');
    expect(tiltRelations(frames).map((r) => r.kind)).toEqual(['node']);
    const an = analyzeLevelTilt(frames, heights(['w0', 'w1', 'w2']));
    expect(an.avisos).toEqual([]);
    expect([...an.joins.keys()].sort()).toEqual(['w0', 'w1', 'w2']);
    const w0 = an.joins.get('w0')!;
    expect(w0.zs).toEqual([0, 1.5, 3]);
    // anel de w0 (a no nó): [a-direita, b-direita, b-esquerda, a-esquerda] = [R, longe R, longe L, L]
    near(w0.levels![0]!.rings[0]![3]!, 0.0597716981, 0.103527618);
    near(w0.levels![0]!.rings[0]![0]!, 0.0597716981, -0.103527618);
    near(w0.levels![1]!.rings[0]![3]!, -0.6363807246, 0.5054514067);
    near(w0.levels![2]!.rings[0]![3]!, -1.3325331473, 0.9073751953);
    near(w0.levels![2]!.rings[0]![0]!, 1.4520765435, 0.7003199593);
    // w1 sai do nó a 120°; o nó é o fim b: anel [a(longe)-baixo, b(nó)-baixo, b-alto, a-alto]; canto esquerdo (para quem sai) = b-direita(a→b)
    const w1 = an.joins.get('w1')!;
    const ring = w1.levels![2]!.rings[0]!;
    near(ring[1]!, -0.1195433963, -1.6076951546);
    expect(ring.length).toBe(4);
    near(w1.levels![0]!.rings[0]![1]!, -0.1195433963, 0);
  });

  it('nó viável de tilts diferentes (10/20/30): cantos coincidentes entre paredes vizinhas em z=0, 1,5 e 3', () => {
    const p = build([
      { id: 'a', a: O, b: out(0), tilt: 10 },
      { id: 'b', a: O, b: out(120), tilt: 20 },
      { id: 'c', a: O, b: out(240), tilt: 30 },
    ]);
    const an = analyzeLevelTilt(levelFrames(p, 'lv_0'), heights(['a', 'b', 'c']));
    expect(an.avisos).toEqual([]);
    const lv = (id: string, i: number) => an.joins.get(id)!.levels![i]!.rings[0]!;
    for (let i = 0; i < 3; i++) {
      // L de a = R de b, L de b = R de c, L de c = R de a (índices 3 e 0 do anel de cada uma)
      for (const [x, y] of [['a', 'b'], ['b', 'c'], ['c', 'a']] as const) {
        expect(lv(x, i)[3]!.x).toBeCloseTo(lv(y, i)[0]!.x, 9);
        expect(lv(x, i)[3]!.y).toBeCloseTo(lv(y, i)[0]!.y, 9);
      }
    }
    near(lv('a', 2)[3]!, -1.5019821838, 0.6305236033);
    near(lv('b', 2)[3]!, 0.2414780628, -2.8149092335);
    near(lv('c', 2)[3]!, 2.3801149399, 0.4274382809);
  });

  it('nó misto: duas inclinadas e uma vertical; nó em X com 4 paredes', () => {
    const y = build([
      { id: 'a', a: O, b: out(0) },
      { id: 'b', a: O, b: out(120), tilt: 15 },
      { id: 'c', a: O, b: out(240), tilt: -15 },
    ]);
    const an = analyzeLevelTilt(levelFrames(y, 'lv_0'), heights(['a', 'b', 'c']));
    expect(an.avisos).toEqual([]);
    expect(an.joins.size).toBe(3);
    // a vertical: o canto esquerdo sobe sem se mover em z (eixo e espessura da vertical não deslocam), mas o cruzamento com b sim
    const A = an.joins.get('a')!;
    expect(A.levels![0]!.rings[0]![3]!.y).toBeCloseTo(0.1, 9);
    const x = build([
      { id: 'a', a: O, b: out(0), tilt: 10 },
      { id: 'b', a: O, b: out(90), tilt: 5 },
      { id: 'c', a: O, b: out(180), tilt: -10 },
      { id: 'd', a: O, b: out(270), tilt: 15 },
    ]);
    const ax = analyzeLevelTilt(levelFrames(x, 'lv_0'), heights(['a', 'b', 'c', 'd']));
    expect(ax.avisos).toEqual([]);
    expect(ax.joins.size).toBe(4);
    near(ax.joins.get('b')!.levels![2]!.rings[0]![0]!, -0.1620840068, 0.6305236033);
    near(ax.joins.get('d')!.levels![2]!.rings[0]![0]!, 0.7003199593, 0.4274382809);
  });

  it('nó inviável degrada SÓ aquele nó, com aviso, e nunca bloqueia', () => {
    // nó curto (parede de 0,5 m com tilt 30°) + um canto de 2 paredes separado que segue exato
    const p = build([
      { id: 'w0', a: O, b: out(0, 0.5), tilt: 30 },
      { id: 'w1', a: O, b: out(120), tilt: 30 },
      { id: 'w2', a: O, b: out(240), tilt: 30 },
      { id: 'L1', a: { x: 20, y: 0 }, b: { x: 24, y: 0 }, tilt: 15 },
      { id: 'L2', a: { x: 20, y: 0 }, b: { x: 20, y: 4 }, tilt: 15 },
    ]);
    const an = analyzeLevelTilt(levelFrames(p, 'lv_0'), heights(['w0', 'w1', 'w2', 'L1', 'L2']));
    expect(an.joins.has('w0')).toBe(false);
    expect(an.avisos.map((a) => a.code)).toContain('inclinacaoInviavelNaJuncao');
    expect(an.avisos.every((a) => a.code === 'inclinacaoInviavelNaJuncao')).toBe(true);
    expect(an.joins.has('L1')).toBe(true);
    expect(an.joins.has('L2')).toBe(true);
  });

  it('o resultado chega à junção do nível (junctionLevel) com `levels`', () => {
    const p = build([
      { id: 'a', a: O, b: out(0), tilt: 10 },
      { id: 'b', a: O, b: out(120), tilt: 10 },
      { id: 'c', a: O, b: out(240), tilt: 10 },
    ]);
    const jl = junctionLevel(p, 'lv_0');
    for (const id of ['a', 'b', 'c']) expect(jl.walls.get(id)!.tilt!.levels!.length).toBe(3);
  });
});
