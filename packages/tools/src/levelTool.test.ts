import { describe, expect, it } from 'vitest';
import { EMPTY_SECTION_ANNOTATIONS, ProjectStore, createEmptyProject, makeLevel, type SectionView } from '@hestia/model';
import { LevelTool, nextLevelName } from './levelTool.ts';
import { P, clickAt, makeEnv } from './testEnv.ts';
import type { SectionToolContext } from './types.ts';

const VIEW: SectionView = {
  id: 'sv1',
  name: 'Corte A',
  kind: 'section',
  a: { x: 0, y: 0 },
  b: { x: 12, y: 0 },
  depth: 6,
};

/** Ambiente de teste numa vista de corte, com o contexto de seção que o integrador vai ligar ao controlador. */
function makeSectionEnv() {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addView', view: VIEW });
  const { env, done } = makeEnv(store);
  const messages: string[] = [];
  env.say = (msg) => messages.push(msg);
  env.section = (): SectionToolContext => ({
    id: VIEW.id,
    annotations: () => EMPTY_SECTION_ANNOTATIONS,
    setAnnotations: () => {},
    inferContext: () => ({}) as never,
  });
  return { store, env, messages, done };
}

/** Ambiente de planta: sem `section()`, a ferramenta não pode criar nível. */
function makePlanEnv() {
  const store = new ProjectStore(createEmptyProject());
  const { env } = makeEnv(store);
  const messages: string[] = [];
  env.say = (msg) => messages.push(msg);
  delete env.section;
  return { store, env, messages };
}

const drawLevel = (t: LevelTool, a: [number, number], b: [number, number]): void => {
  clickAt(t, a[0], a[1]);
  clickAt(t, b[0], b[1]);
};

describe('ferramenta Nível', () => {
  it('dois cliques criam o nível com a cota do segundo clique e as extensões a/b na vista', () => {
    const { store, env } = makeSectionEnv();
    const t = new LevelTool(env);
    t.start();

    drawLevel(t, [1, 3], [5, 3]);

    const level = store.project.levels.find((l) => l.name === 'Nível 1');
    expect(level).toBeDefined();
    expect(level!.elevation).toBeCloseTo(3);
    const view = store.project.views.find((v) => v.id === VIEW.id)!;
    expect(view.levelExtents).toEqual({ [level!.id]: { a: 1, b: 5 } });
  });

  it('recusa a linha não horizontal e mantém o primeiro ponto', () => {
    const { store, env, messages } = makeSectionEnv();
    const t = new LevelTool(env);
    t.start();

    clickAt(t, 2, 3);
    clickAt(t, 6, 3.4);

    expect(store.project.levels).toHaveLength(2);
    expect(messages.some((m) => m.includes('horizontal'))).toBe(true);

    // O primeiro ponto continua valendo: basta corrigir a cota do segundo clique.
    clickAt(t, 6, 3);
    const level = store.project.levels.find((l) => l.name === 'Nível 1')!;
    expect(level.elevation).toBeCloseTo(3);
    expect(store.project.views[0]!.levelExtents![level.id]).toEqual({ a: 2, b: 6 });
  });

  it('o nome automático não repete um nível existente', () => {
    const { store, env } = makeSectionEnv();
    store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_n1', name: 'Nível 1', elevation: 1 }) });
    const t = new LevelTool(env);
    t.start();

    drawLevel(t, [0, 4], [3, 4]);
    drawLevel(t, [0, 5], [3, 5]);

    const nomes = store.project.levels.map((l) => l.name);
    expect(nomes).toContain('Nível 2');
    expect(nomes).toContain('Nível 3');
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(nextLevelName(store.project.levels)).toBe('Nível 4');
  });

  it('fora de corte/elevação avisa e não cria nível', () => {
    const { store, env, messages } = makePlanEnv();
    const t = new LevelTool(env);
    t.start();

    drawLevel(t, [0, 3], [4, 3]);

    expect(store.project.levels).toHaveLength(2);
    expect(messages.some((m) => m.includes('corte/elevação'))).toBe(true);
  });

  it('desfazer remove o nível e a extensão no mesmo passo', () => {
    const { store, env } = makeSectionEnv();
    const t = new LevelTool(env);
    t.start();
    drawLevel(t, [1, 4], [7, 4]);
    const level = store.project.levels.find((l) => l.name === 'Nível 1')!;
    expect(store.undoLabel).toBe('Criar/editar nível');

    store.undo();

    expect(store.project.levels.some((l) => l.id === level.id)).toBe(false);
    expect(store.project.views[0]!.levelExtents).toBeUndefined();
  });

  it('a prévia mostra a linha horizontal e o rótulo com nome e cota', () => {
    const { env } = makeSectionEnv();
    const t = new LevelTool(env);
    t.start();
    t.move(P(1, 4));
    const first = t.preview();
    expect(first.some((i) => i.kind === 'label' && i.text.includes('Nível 1') && i.text.includes('+4,00'))).toBe(true);

    t.click(P(1, 4));
    t.move(P(6, 4));
    const line = t.preview().find((i) => i.kind === 'line');
    expect(line).toMatchObject({ kind: 'line', dashed: true });
    if (line?.kind === 'line') {
      expect(line.a.y).toBeCloseTo(4);
      expect(line.b.y).toBeCloseTo(4);
    }
  });

  it('Esc sem passo em andamento sai da ferramenta', () => {
    const { env, done } = makeSectionEnv();
    const t = new LevelTool(env);
    t.start();
    t.cancel();
    expect(done()).toBe(1);
  });
});
