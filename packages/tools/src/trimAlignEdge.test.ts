import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { floorsOnLevel, makeFloor, type Floor } from '@hestia/model';
import { commitRingEdit, ringOfRef } from './ringTarget.ts';
import { clickAt, drawWall, makeEnv, tool, walls } from './testEnv.ts';

/** Piso f1: retângulo 4 × 3 com a aresta de baixo em y=0 (índice 0). */
const RECT_F1: Vec2[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

/** Piso f2: retângulo 1..3 × -2..2; a aresta 3 é a reta x=1 (de (1,2) a (1,-2)). */
const RECT_F2: Vec2[] = [
  { x: 1, y: -2 },
  { x: 3, y: -2 },
  { x: 3, y: 2 },
  { x: 1, y: 2 },
];

/** Cenário com pisos. `linked` marca f1 como contorno travado nas paredes (decisão 0031). */
function scene(opts: { linked?: boolean } = {}) {
  const ctx = makeEnv();
  const messages: string[] = [];
  ctx.env.say = (m: string) => messages.push(m);
  const outlineSource = opts.linked ? { mode: 'walls-finish' as const, seed: { x: 2, y: 1.5 }, linked: true } : undefined;
  ctx.store.exec({
    type: 'addFloor',
    floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: RECT_F1, ...(outlineSource ? { outlineSource } : {}) }),
  });
  ctx.store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f2', typeId: 'ft_ceram', levelId: 'lv_0', boundary: RECT_F2 }) });
  return { ...ctx, messages };
}

const floor = (store: ReturnType<typeof makeEnv>['store'], id: string): Floor => floorsOnLevel(store.project, 'lv_0').find((f) => f.id === id)!;

const near = (a: Vec2, b: Vec2) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('aparar entre arestas (Aparar ao canto em anéis)', () => {
  it('duas arestas de piso que se cruzam em L: a parte clicada fica e a extremidade mais distante vai para a interseção', () => {
    const { store, env } = scene();
    const t = tool('trim', env);
    // Primeiro clique na aresta de baixo de f1, perto de b=(4,0) (a parte que fica); segundo, na reta x=1 de f2.
    clickAt(t, 3.5, 0);
    clickAt(t, 1, 1);
    // Interseção de y=0 com x=1 é (1,0): a (longe do clique) vai para lá; b e os outros vértices não mudam.
    const ring = floor(store, 'f1').boundary;
    near(ring[0]!, { x: 1, y: 0 });
    near(ring[1]!, { x: 4, y: 0 });
    near(ring[2]!, { x: 4, y: 3 });
    near(ring[3]!, { x: 0, y: 3 });
    // A segunda aresta (f2) não muda.
    expect(floor(store, 'f2').boundary).toEqual(RECT_F2);
    expect(store.undoLabel).toBe('Aparar ao canto');
    store.undo();
    expect(floor(store, 'f1').boundary).toEqual(RECT_F1);
  });

  it('clique perto de a=(0,0) mantém a parte de a e move b para a interseção', () => {
    const { store, env } = scene();
    const t = tool('trim', env);
    clickAt(t, 0.5, 0);
    clickAt(t, 1, 1);
    const ring = floor(store, 'f1').boundary;
    near(ring[0]!, { x: 0, y: 0 });
    near(ring[1]!, { x: 1, y: 0 });
  });

  it('referência e alvo paralelos avisam "Arestas paralelas" e não gravam', () => {
    const ctx = scene();
    const { store, env, messages } = ctx;
    ctx.store.exec({
      type: 'addFloor',
      floor: makeFloor({ id: 'f3', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 2.5 }, { x: 0, y: 2.5 }] }),
    });
    const t = tool('trim', env);
    clickAt(t, 3.5, 0);
    clickAt(t, 2, 2);
    expect(messages).toContain('Arestas paralelas: não há canto.');
    expect(floor(store, 'f1').boundary).toEqual(RECT_F1);
    expect(store.undoLabel).not.toBe('Aparar ao canto');
  });

  it('parede e aresta juntas: avisa e reinicia, sem gravar', () => {
    const ctx = scene();
    const { store, env, messages } = ctx;
    drawWall(env, [10, 0], [10, 5]);
    const t = tool('trim', env);
    clickAt(t, 10, 2);
    clickAt(t, 3.5, 0);
    expect(messages).toContain('Aparar: escolha duas paredes, duas arestas de anel ou duas arestas do croqui.');
    expect(floor(store, 'f1').boundary).toEqual(RECT_F1);
    expect(walls(store)[0]!.b.y).toBeCloseTo(5);
  });

  it('aresta de piso travada (vinculada às paredes): recusa, pede Desvincular e não grava', () => {
    const { store, env, messages } = scene({ linked: true });
    const t = tool('trim', env);
    clickAt(t, 3.5, 0);
    clickAt(t, 1, 1);
    expect(messages.some((m) => m.includes('Desvincular'))).toBe(true);
    expect(floor(store, 'f1').boundary).toEqual(RECT_F1);
    expect(store.undoLabel).not.toBe('Aparar ao canto');
  });

  it('commitRingEdit recusa anel de piso vinculado diretamente', () => {
    const { store, env, messages } = scene({ linked: true });
    const ref = { elementId: 'f1', hole: null };
    const ring = ringOfRef(store.project, ref)!;
    const changed = ring.map((v, i) => (i === 1 ? { x: 2, y: 0 } : v));
    expect(commitRingEdit(env, ref, changed)).toBe(false);
    expect(messages.some((m) => m.includes('Desvincular'))).toBe(true);
    expect(floor(store, 'f1').boundary).toEqual(RECT_F1);
  });
});

describe('alinhar a aresta (Alinhar em anéis)', () => {
  it('aresta de piso é alinhada à reta inclinada da referência', () => {
    const ctx = scene();
    const { store, env } = ctx;
    // f4: aresta inclinada de (0,5) a (4,7), reta y = 5 + x/2.
    ctx.store.exec({
      type: 'addFloor',
      floor: makeFloor({ id: 'f4', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 5 }, { x: 4, y: 7 }, { x: 4, y: 8 }, { x: 0, y: 6 }] }),
    });
    const t = tool('align', env);

    clickAt(t, 2, 6); // referência: aresta inclinada de f4
    clickAt(t, 2, 0); // alvo: aresta de baixo de f1
    const ring = floor(store, 'f1').boundary;
    // Projeção de (0,0) e (4,0) sobre a reta (0,5)→(4,7).
    near(ring[0]!, { x: -2, y: 4 });
    near(ring[1]!, { x: 1.2, y: 5.6 });
    near(ring[2]!, { x: 4, y: 3 });
    near(ring[3]!, { x: 0, y: 3 });
    expect(store.undoLabel).toBe('Alinhar aresta');
  });

  it('alinhar aresta à própria reta (já alinhada) avisa "Já estão alinhadas." e não grava', () => {
    const { store, env, messages } = scene();
    const t = tool('align', env);
    clickAt(t, 2, 0); // referência: aresta de baixo de f1
    clickAt(t, 2, 0); // alvo: a mesma aresta, já sobre a reta de referência
    expect(messages).toContain('Já estão alinhadas.');
    expect(floor(store, 'f1').boundary).toEqual(RECT_F1);
    expect(store.undoLabel).not.toBe('Alinhar aresta');
  });

  it('parede perpendicular à aresta de referência: recusa com mensagem clara e não grava', () => {
    const ctx = scene();
    const { store, env, messages } = ctx;
    drawWall(env, [10, 0], [10, 5]);
    const t = tool('align', env);

    clickAt(t, 2, 0); // referência: aresta de f1
    clickAt(t, 10, 2); // alvo: parede, sem face paralela à referência
    expect(messages).toContain(
      'A referência não é paralela a esta feição. Para estender uma parede até ela, escolha a extremidade da parede (Tab).',
    );
    expect(walls(store)[0]!.a.x).toBeCloseTo(10);
  });
});
