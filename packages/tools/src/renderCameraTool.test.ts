import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { RenderCameraTool } from './renderCameraTool.ts';
import { P, clickAt, makeEnv } from './testEnv.ts';

function setup(opts: { seccao?: boolean } = {}) {
  const store = new ProjectStore(createEmptyProject());
  const { env, done } = makeEnv(store);
  const messages: string[] = [];
  env.say = (msg) => messages.push(msg);
  if (!opts.seccao) delete env.section;
  else env.section = () => ({ id: 'sv1' }) as never;
  const t = new RenderCameraTool(env);
  t.start();
  return { store, env, t, messages, done };
}

describe('ferramenta Câmera de render', () => {
  it('clique 1 na planta e clique 2 na direção criam a câmera no nível ativo com o padrão', () => {
    const { store, t } = setup();
    clickAt(t, 2, 3);
    t.move(P(12, 3));
    t.click(P(12, 3));

    const cams = store.project.renderCameras ?? [];
    expect(cams).toHaveLength(1);
    const c = cams[0]!;
    expect(c.levelId).toBe('lv_0');
    expect(c.name).toBe('Câmera 1');
    expect(c.fovDeg).toBe(60);
    expect(c.aspect).toEqual({ w: 16, h: 9 });
    expect(c.position.x).toBe(2);
    expect(c.position.y).toBe(3);
    expect(c.position.z).toBeCloseTo(1.6, 9);
    // Olha para +X, horizontal: alvo a 10 m, na mesma altura do olho.
    expect(c.target.x).toBeCloseTo(12, 9);
    expect(c.target.y).toBe(3);
    expect(c.target.z).toBe(c.position.z);
  });

  it('Enter confirma com a última direção da prévia', () => {
    const { store, t } = setup();
    clickAt(t, 0, 0);
    t.move(P(0, 5));
    t.confirm();

    const c = store.project.renderCameras![0]!;
    expect(c.target.x).toBeCloseTo(0, 9);
    expect(c.target.y).toBeCloseTo(10, 9);
  });

  it('Esc no meio do gesto cancela sem criar câmera; Esc de novo sai da ferramenta', () => {
    const { store, t, done } = setup();
    clickAt(t, 4, 4);
    t.cancel();
    expect(store.project.renderCameras ?? []).toHaveLength(0);
    expect(done()).toBe(0);
    t.cancel();
    expect(done()).toBe(1);
  });

  it('direção sem afastar o cursor da posição é recusada com mensagem', () => {
    const { store, t, messages } = setup();
    clickAt(t, 1, 1);
    t.click(P(1.01, 1));
    expect(store.project.renderCameras ?? []).toHaveLength(0);
    expect(messages.some((m) => m.includes('Afaste'))).toBe(true);
  });

  it('nas vistas de corte a ferramenta não grava câmera', () => {
    const { store, t, messages } = setup({ seccao: true });
    clickAt(t, 2, 3);
    t.click(P(12, 3));
    expect(store.project.renderCameras ?? []).toHaveLength(0);
    expect(messages.some((m) => m.includes('planta'))).toBe(true);
  });
});
