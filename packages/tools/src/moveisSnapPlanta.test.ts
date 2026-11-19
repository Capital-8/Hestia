import { describe, expect, it } from 'vitest';
import { dist, type Vec2 } from '@hestia/geom';
import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import { infer, type InferContext } from './infer.ts';
import { moveisSnapIndex } from './moveisSnapPlanta.ts';
import { makeEnv } from './testEnv.ts';
import { DEFAULT_SNAP, type Inference, type PointerInfo } from './types.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

/**
 * Armário A80 (L 0,8; P 0,56; tampo de 25 mm projetado 20 mm à frente): pegada local x 0..0,8, y -0,02..0,56.
 * Transformação: mundo = (x, y) + R(rot) * (±lx, ly), com lx negativo se espelhado.
 */
function cena(c: { x: number; y: number; rotation?: number; mirrored?: boolean }): Project {
  const p = createEmptyProject('t');
  aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: c.x, y: c.y, z: 0, rotation: c.rotation ?? 0, mirrored: c.mirrored ?? false, mark: 'c1' };
  return p;
}

const SEM_ALINHAR = { ...DEFAULT_SNAP, alignment: false };

function em(p: Project, x: number, y: number, extra: Partial<InferContext> = {}): Inference {
  const lv = p.levels[0]!.id;
  return infer(v(x, y), { project: p, levelId: lv, mpp: 0.005, gridStep: 0.1, snap: SEM_ALINHAR, indexed: [moveisSnapIndex(p, lv)], ...extra });
}

/** Cursor a ~3 mm do alvo (sobre o alvo nos meios, onde as quinas das portas ficam a 2 mm): o motor devolve o ponto exato do tipo esperado. */
function confere(p: Project, alvo: Vec2, kind: string, extra: Partial<InferContext> = {}): void {
  const d = kind === 'midpoint' ? 0 : 0.002;
  const r = em(p, alvo.x + d, alvo.y - d, extra);
  expect(r.kind).toBe(kind);
  expect(r.hostId).toBe('c1');
  expect(dist(r.point, alvo)).toBeLessThan(1e-9);
}

describe('captura dos móveis na planta', () => {
  it('sem rotação: os 4 cantos e os 4 meios da pegada (1..1,8 x 1,98..2,56)', () => {
    const p = cena({ x: 1, y: 2 });
    for (const c of [v(1, 1.98), v(1.8, 1.98), v(1.8, 2.56), v(1, 2.56)]) confere(p, c, 'endpoint');
    for (const m of [v(1.8, 2.27), v(1.4, 2.56), v(1, 2.27)]) confere(p, m, 'midpoint');
  });

  it('o pé da perpendicular numa aresta da pegada é "nearest"', () => {
    const p = cena({ x: 1, y: 2 });
    const r = em(p, 1.5, 2.565);
    expect(r.kind).toBe('nearest');
    expect(r.hostId).toBe('c1');
    expect(dist(r.point, v(1.5, 2.56))).toBeLessThan(1e-9);
  });

  it('girado 90 graus em (3, 1): pegada x 2,44..3,02 x y 1..1,8', () => {
    const p = cena({ x: 3, y: 1, rotation: Math.PI / 2 });
    for (const c of [v(3.02, 1), v(3.02, 1.8), v(2.44, 1.8), v(2.44, 1)]) confere(p, c, 'endpoint');
    for (const m of [v(2.73, 1.8), v(2.44, 1.4), v(2.73, 1)]) confere(p, m, 'midpoint');
    const r = em(p, 2.9, 1.805);
    expect(r.kind).toBe('nearest');
    expect(dist(r.point, v(2.9, 1.8))).toBeLessThan(1e-9);
  });

  it('espelhado em (5, 2): pegada x 4,2..5 x y 1,98..2,56', () => {
    const p = cena({ x: 5, y: 2, mirrored: true });
    for (const c of [v(4.2, 1.98), v(5, 1.98), v(5, 2.56), v(4.2, 2.56)]) confere(p, c, 'endpoint');
    for (const m of [v(5, 2.27), v(4.6, 2.56), v(4.2, 2.27)]) confere(p, m, 'midpoint');
    // O meio da frente cai na fresta entre as duas portas (cantos a 2 mm): fica no índice, mas o canto da porta vence perto dele.
    expect(moveisSnapIndex(p, p.levels[0]!.id).pontos.some((q) => q.kind === 'midpoint' && Math.abs(q.x - 4.6) < 1e-9 && Math.abs(q.y - 1.98) < 1e-9)).toBe(true);
  });

  it('as frentes das portas também são capturadas (porta 1: 1,002..1,398 x 1,982..2)', () => {
    const p = cena({ x: 1, y: 2 });
    confere(p, v(1.002, 1.982), 'endpoint');
    confere(p, v(1.398, 2), 'endpoint');
    confere(p, v(1.2, 1.982), 'midpoint');
  });

  it('ignore do próprio móvel remove a captura', () => {
    const p = cena({ x: 1, y: 2 });
    expect(em(p, 1.002, 1.978, { ignore: new Set(['c1']) }).kind).toBe('none');
    expect(em(p, 1.002, 1.978).kind).toBe('endpoint');
  });

  it('móvel oculto na vista sai da captura', () => {
    const p = cena({ x: 1, y: 2 });
    expect(em(p, 1.002, 1.978, { hiddenIds: new Set(['c1']) }).kind).toBe('none');
  });

  it('endpoint desligado remove os cantos; midpoint desligado remove os meios', () => {
    const p = cena({ x: 1, y: 2 });
    const semCanto = em(p, 1.001, 1.979, { snap: { ...SEM_ALINHAR, endpoint: false } });
    expect(semCanto.kind).not.toBe('endpoint');
    const semMeio = em(p, 1.402, 1.978, { snap: { ...SEM_ALINHAR, midpoint: false } });
    expect(semMeio.kind).not.toBe('midpoint');
  });

  it('o índice só traz pontos e arestas do móvel e fica vazio sem componentes', () => {
    const p = cena({ x: 1, y: 2 });
    const ix = moveisSnapIndex(p, p.levels[0]!.id);
    expect(ix.pontos.every((q) => q.hostId === 'c1')).toBe(true);
    expect(ix.pontos.filter((q) => q.kind === 'endpoint' && Math.abs(q.x - 1) < 1e-9 && Math.abs(q.y - 1.98) < 1e-9)).toHaveLength(1);
    const vazio = createEmptyProject('t');
    expect(moveisSnapIndex(vazio, vazio.levels[0]!.id).pontos).toHaveLength(0);
  });

  it('desempenho: 300 móveis, consultas ao alcance do cursor ficam baratas', () => {
    const p = createEmptyProject('t');
    aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    const lv = p.levels[0]!.id;
    for (let i = 0; i < 300; i++) {
      p.elements[`c${i}`] = { id: `c${i}`, kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: lv, order: i, x: (i % 20) * 1.2, y: Math.floor(i / 20) * 1.2, z: 0, rotation: 0, mirrored: false, mark: `c${i}` };
    }
    const ix = moveisSnapIndex(p, lv);
    expect(moveisSnapIndex(p, lv)).toBe(ix);
    const t0 = performance.now();
    for (let k = 0; k < 300; k++) em(p, (k % 20) * 1.2 + 0.002, Math.floor(k / 20) * 1.2 + 1.978);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

/** Ferramenta mínima para exercitar a captura global montada em `ToolBase.ctx`. */
class Probe extends ToolBase {
  readonly id = 'probe';
  readonly label = 'Probe';
  readonly hint = '';
  protected reset(): void {}
  protected busy(): boolean {
    return false;
  }
  probe(p: PointerInfo): Inference {
    return this.snap(p);
  }
}

describe('captura dos móveis pelo ToolBase', () => {
  const ptr = (x: number, y: number): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });

  it('o canto do móvel entra na captura global; oculto na vista, sai', () => {
    const p = cena({ x: 1, y: 2 });
    const base = makeEnv().env;
    base.options().snap = { ...DEFAULT_SNAP, alignment: false };
    const visivel = new Probe({ ...base, project: () => p, levelId: () => p.levels[0]!.id });
    visivel.start();
    const r = visivel.probe(ptr(1.002, 2.562));
    expect(r.kind).toBe('endpoint');
    expect(r.hostId).toBe('c1');
    expect(dist(r.point, v(1, 2.56))).toBeLessThan(1e-9);
    const oculto = new Probe({ ...base, project: () => p, levelId: () => p.levels[0]!.id, hiddenInView: () => new Set(['c1']) });
    oculto.start();
    expect(oculto.probe(ptr(1.002, 2.562)).kind).toBe('none');
  });
});
