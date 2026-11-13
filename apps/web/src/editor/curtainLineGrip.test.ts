import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, refGerada, resolverParede, type SubelementoCortina, type Wall } from '@hestia/model';
import type { PointerInfo, ToolEnv } from '@hestia/tools';
import { projetoComCortina } from '../../../../packages/engine/src/fixtureCortina.ts';
import { alcaDaLinhaDeCortina, previaDaAlcaDeCortina } from './curtainLineGrip.ts';
import { useUi } from './state.ts';

/** Ambiente mínimo da seleção sobre `store`: passo de grade 0,1 m, 1 px = 0,01 m e o subelemento dado. */
function ambienteDe(store: ProjectStore, sub: SubelementoCortina | null): ToolEnv {
  return {
    project: () => store.project,
    levelId: () => 'lv_0',
    selection: () => [],
    setSelection: () => {},
    exec: (c: Parameters<ProjectStore['exec']>[0]) => store.exec(c),
    transaction: (l: string, fn: () => void) => store.transaction(l, fn),
    metersPerPixel: () => 0.01,
    gridStep: () => 0.1,
    say: () => {},
    done: () => {},
    options: () => ({}),
    subelemento: () => sub,
  } as unknown as ToolEnv;
}

const V = (x: number, y: number): Vec2 => ({ x, y });
const P = (x: number, y: number): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const extrasDe = (store: ProjectStore) => ((store.project.elements.ct1 as Wall).curtain?.addedLines ?? []);

/** Cortina ct1 com as linhas extras x1 (em 2,0 m) e x2 (em 3,0 m); a linha `selecionada` fica como subelemento. */
function comLinhas(selecionada: 'x1' | 'x2' | 'h1' = 'x1') {
  const store = new ProjectStore(projetoComCortina());
  store.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 2.0 } });
  store.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x2', axis: 'u', pos: 3.0 } });
  const sub: SubelementoCortina = { wallId: 'ct1', kind: 'line', line: { added: selecionada } };
  return { store, env: ambienteDe(store, sub) };
}

describe('alça da linha de grade selecionada (planta)', () => {
  it('a linha extra selecionada mostra a alça na posição da linha (sobre o eixo da parede)', () => {
    const { env } = comLinhas('x1');
    const previa = previaDaAlcaDeCortina(env);
    const ponto = previa.find((i) => i.kind === 'point') as { at: { x: number; y: number } };
    expect(ponto.at.x).toBeCloseTo(2.0, 6);
    expect(ponto.at.y).toBeCloseTo(0, 6);
  });

  it('sem linha selecionada, não há alça', () => {
    const env = ambienteDe(new ProjectStore(projetoComCortina()), null);
    expect(previaDaAlcaDeCortina(env)).toHaveLength(0);
    expect(alcaDaLinhaDeCortina(env, V(2, 0))).toBeNull();
  });

  it('linha travada mostra o cadeado (o contorno do corpo)', () => {
    const { store, env } = comLinhas('x1');
    store.exec({ type: 'lockGridLine', wallId: 'ct1', line: { added: 'x1' }, locked: true });
    const previa = previaDaAlcaDeCortina(env);
    expect(previa.some((i) => i.kind === 'polygon')).toBe(true);
    const livre = comLinhas('x1');
    expect(previaDaAlcaDeCortina(livre.env).some((i) => i.kind === 'polygon')).toBe(false);
  });

  it('o cursor pega a alça só dentro da tolerância; fora dela não há arraste', () => {
    const { env } = comLinhas('x1');
    expect(alcaDaLinhaDeCortina(env, V(2.02, 0.01))).not.toBeNull();
    expect(alcaDaLinhaDeCortina(env, V(2.0, 0.5))).toBeNull();
  });

  it('fora da planta (3D) a alça não responde', () => {
    const { env } = comLinhas('x1');
    useUi.setState({ view: '3d' });
    try {
      expect(alcaDaLinhaDeCortina(env, V(2, 0))).toBeNull();
      expect(previaDaAlcaDeCortina(env)).toHaveLength(0);
    } finally {
      useUi.setState({ view: 'plan' });
    }
  });

  it('linha vertical extra arrasta; a horizontal (V) não arrasta na planta', () => {
    const { store, env } = comLinhas('h1');
    store.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'h1', axis: 'v', pos: 1.0 } });
    expect(alcaDaLinhaDeCortina(env, V(1, 1))).toBeNull();
  });

  it('arrastar encaixa na grade do projeto e a soltura grava um só passo de desfazer', () => {
    const { store, env } = comLinhas('x1');
    const hold = alcaDaLinhaDeCortina(env, V(2.0, 0))!;
    const alvo = { x: 2.46, y: 0 };
    const previa = hold.drag(P(2.46, 0), () => alvo);
    expect(previa.length).toBeGreaterThan(0);
    hold.release(P(2.46, 0), () => {});
    expect(extrasDe(store).find((l) => l.id === 'x1')!.pos).toBeCloseTo(2.5, 6);
    store.undo();
    expect(extrasDe(store).find((l) => l.id === 'x1')!.pos).toBeCloseTo(2.0, 6);
  });

  it('a linha não passa da vizinha: o arraste para além de 3,0 m fica logo antes dela', () => {
    const { store, env } = comLinhas('x1');
    const hold = alcaDaLinhaDeCortina(env, V(2.0, 0))!;
    hold.drag(P(3.7, 0), () => ({ x: 3.7, y: 0 }));
    hold.release(P(3.7, 0), () => {});
    const pos = extrasDe(store).find((l) => l.id === 'x1')!.pos;
    expect(pos).toBeLessThan(3.0);
    expect(pos).toBeGreaterThan(2.99);
  });

  it('soltar sem arrastar não grava nada', () => {
    const { store, env } = comLinhas('x1');
    const hold = alcaDaLinhaDeCortina(env, V(2.0, 0))!;
    hold.drag(P(2.0, 0), () => ({ x: 2.0, y: 0 }));
    const antes = store.version;
    hold.release(P(2.0, 0), () => {});
    expect(store.version).toBe(antes);
  });

  it('a linha gerada usa a referência da grade (índice) e também tem alça', () => {
    const store = new ProjectStore(projetoComCortina());
    const w = store.project.elements.ct1 as Wall;
    const r = resolverParede(store.project, w)!;
    const gerada = r.u.find((l) => l.added === undefined)!;
    const ref = refGerada('u', gerada.gerada as number, r.L, r.geradasU);
    const env = ambienteDe(store, { wallId: 'ct1', kind: 'line', line: ref });
    const previa = previaDaAlcaDeCortina(env);
    const ponto = previa.find((i) => i.kind === 'point') as { at: { x: number } };
    expect(ponto.at.x).toBeCloseTo(gerada.pos, 6);
  });
});
