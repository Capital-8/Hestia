import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, wallArc, wallLength, wallsOnLevel, type Id, type Wall } from '@hestia/model';
import { createTool, gripAt, hostUnder, infer, type PointerInfo, type ToolEnv, type ToolId, type ToolOptions } from './index.ts';

function makeEnv() {
  const store = new ProjectStore(createEmptyProject());
  let selection: Id[] = [];
  const options: ToolOptions = {
    wallTypeId: 'wt_alv14', locationLine: 'wallCenter', wallHeight: 2.8, chain: false, wallShape: 'arc',
    doorTypeId: 'ot_p80', windowTypeId: 'ot_j120', orthoLock: false, arrayCount: 3, offsetDistance: 0.5,
    rotateCopy: false, mirrorCopy: false, offsetCopy: true, floorTypeId: 'ft_ceram', floorOffset: 0, slabTypeId: 'ls_mac12', slabOffset: 0, slabSlopePercent: 2,
  };
  const env: ToolEnv = {
    project: () => store.project, levelId: () => 'lv_0', selection: () => selection, setSelection: (i) => { selection = i; },
    exec: (c) => store.exec(c), transaction: (l, fn) => store.transaction(l, fn), metersPerPixel: () => 0.01,
    gridStep: () => 0.1, say: () => {}, done: () => {}, options: () => options,
  };
  return { store, env, options, setSel: (i: Id[]) => { selection = i; } };
}
const P = (x: number, y: number): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const click = (t: { move(p: PointerInfo): void; click(p: PointerInfo): void }, x: number, y: number) => { t.move(P(x, y)); t.click(P(x, y)); };
const walls = (s: ProjectStore): Wall[] => wallsOnLevel(s.project, 'lv_0');
const tool = (id: ToolId, env: ToolEnv) => { const t = createTool(id, env); t.start(); return t; };

describe('paredes em arco nas ferramentas', () => {
  it('desenha um arco por três pontos', () => {
    const { store, env } = makeEnv();
    const t = tool('wall', env);
    click(t, 0, 0); click(t, 4, 0); click(t, 2, 1);
    const w = walls(store)[0]!;
    expect(w.sag).toBeCloseTo(1, 6);
    expect(wallArc(w)!.radius).toBeCloseTo(2.5, 6);
  });
  it('flecha digitada com o lado do cursor', () => {
    const { store, env } = makeEnv();
    const t = tool('wall', env);
    click(t, 0, 0); click(t, 4, 0);
    t.move(P(2, -1));
    expect(t.type('0,5')).toBe(true);
    expect(walls(store)[0]!.sag).toBeCloseTo(-0.5, 6);
  });
  it('a alça do meio ajusta a flecha e o desfazer volta', () => {
    const { store, env, setSel } = makeEnv();
    const t = tool('wall', env);
    click(t, 0, 0); click(t, 4, 0); click(t, 2, 1);
    const w = walls(store)[0]!;
    setSel([w.id]);
    const grip = gripAt(store.project, [w.id], { x: 2, y: 1.02 }, 0.01);
    expect(grip?.end).toBe('mid');
    const s = tool('select', env);
    s.down!(P(2, 1.02)); s.drag!(P(2, 1.5)); s.up!(P(2, 1.5));
    expect(walls(store)[0]!.sag).toBeCloseTo(1.5, 1);
    store.undo();
    expect(walls(store)[0]!.sag).toBeCloseTo(1, 6);
  });
  it('porta em parede curva usa o comprimento de arco e fica sobre o arco', () => {
    const { store, env } = makeEnv();
    const t = tool('wall', env);
    click(t, 0, 0); click(t, 4, 0); click(t, 2, 1);
    const host = hostUnder({ x: 2, y: 1.02 }, store.project, 'lv_0', 0.01);
    expect(host).not.toBeNull();
    expect(host!.offset).toBeCloseTo(wallLength(walls(store)[0]!) / 2, 3);
  });
  it('captura o ponto médio e o mais próximo no arco', () => {
    const { store, env } = makeEnv();
    const t = tool('wall', env);
    click(t, 0, 0); click(t, 4, 0); click(t, 2, 1);
    const r = infer({ x: 2.01, y: 1.01 }, { project: store.project, levelId: 'lv_0', mpp: 0.01, gridStep: 0.5 });
    expect(r.kind).toBe('midpoint');
    expect(r.point.y).toBeCloseTo(1, 6);
  });
  it('deslocar um arco cria uma cópia concêntrica', () => {
    const { store, env } = makeEnv();
    const t = tool('wall', env);
    click(t, 0, 0); click(t, 4, 0); click(t, 2, 1);
    const o = tool('offset', env);
    // Cursor sobre a faixa do arco (a tolerância do Deslocar é de cursor, não de metros).
    click(o, 2, 1.02);
    expect(walls(store)).toHaveLength(2);
    const c2 = walls(store)[1]!;
    expect(wallArc(c2)!.radius).toBeCloseTo(3, 4);
    expect(wallArc(c2)!.center.y).toBeCloseTo(-1.5, 4);
  });
  it('wall tool em linha continua criando retas', () => {
    const { store, env, options } = makeEnv();
    options.wallShape = 'line';
    const t = tool('wall', env);
    click(t, 0, 0); click(t, 3, 0);
    expect(walls(store)[0]!.sag).toBe(0);
    void makeWall;
  });
});
