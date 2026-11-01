import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type Wall } from '@hestia/model';
import { clipboardFrom } from './clipboard.ts';
import { setPasteClip } from './pasteTool.ts';
import { clickAt, drawWall, makeEnv, tool, walls } from './testEnv.ts';
import { copiesOverlap, copyOverlap, moveOverlap } from './wallOverlapGuard.ts';

/** Ambiente com as mensagens da barra capturadas (o `say` do testEnv é mudo). */
function cena() {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (msg: string) => {
    msgs.push(msg);
  };
  return { ctx, msgs };
}

/** Mensagens do bloqueio (decisão 0044). */
const bloqueios = (msgs: readonly string[]): string[] => msgs.filter((m) => m.includes('em cima da parede'));

/** Parede no mesmo nível para montar projetos do teste direto do critério. */
const wall = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({
  ...makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by } }),
  order: 0,
});

describe('bloqueio de mover/copiar parede em cima de outra (decisão 0044)', () => {
  it('mover: parede que passa para cima de outra é recusada; o projeto não muda', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('a', 0, 0, 4, 0) });
    s.exec({ type: 'addWall', wall: wall('b', 0, 2, 4, 2) });
    const [a, b] = [s.project.elements.a as Wall, s.project.elements.b as Wall];
    const conflito = moveOverlap(s.project, [a], { kind: 'translate', d: { x: 0, y: 2 } });
    expect(conflito?.wall.id).toBe('b');
    // Destino livre: nada a bloquear.
    expect(moveOverlap(s.project, [a], { kind: 'translate', d: { x: 0, y: 1 } })).toBeNull();
    expect(b.id).toBe('b');
  });

  it('girar: parede girada que cai em cima de outra é recusada', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('h', 0, 0, 4, 0) });
    s.exec({ type: 'addWall', wall: wall('v', 0, 0, 0, 4) });
    const h = s.project.elements.h as Wall;
    // +90° em torno da origem: (0,0)-(4,0) vira (0,0)-(0,4), exatamente a parede 'v'.
    expect(moveOverlap(s.project, [h], { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 })?.wall.id).toBe('v');
    expect(moveOverlap(s.project, [h], { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 4 })).toBeNull();
  });

  it('exceção: o que já se sobrepunha antes da operação não bloqueia (projeto antigo com C14)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('a', 0, 0, 4, 0) });
    s.exec({ type: 'addWall', wall: wall('b', 0, 0.005, 4, 0.005) }); // sobreposta desde antes
    const a = s.project.elements.a as Wall;
    expect(moveOverlap(s.project, [a], { kind: 'translate', d: { x: 1, y: 0 } })).toBeNull();
  });

  it('copiar: a cópia é parede nova e não pode pousar em cima de nenhuma, inclusive a de origem', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('a', 0, 0, 4, 0) });
    s.exec({ type: 'addWall', wall: wall('b', 0, 2, 4, 2) });
    const a = s.project.elements.a as Wall;
    expect(copyOverlap(s.project, [a], { kind: 'translate', d: { x: 0, y: 0 } })?.wall.id).toBe('a');
    expect(copyOverlap(s.project, [a], { kind: 'translate', d: { x: 0, y: 2 } })?.wall.id).toBe('b');
    expect(copyOverlap(s.project, [a], { kind: 'translate', d: { x: 0, y: 1 } })).toBeNull();
  });

  it('lote (Matriz/colar): recusa cópia sobre parede e cópia sobre cópia do mesmo lote', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('a', 0, 0, 4, 0) });
    s.exec({ type: 'addWall', wall: wall('b', 0, 2, 4, 2) });
    const a = s.project.elements.a as Wall;
    // Cópia em cima da origem / de outra parede existente.
    expect(copiesOverlap(s.project, [a], [{ kind: 'translate', d: { x: 0, y: 0 } }])?.wall.id).toBe('a');
    expect(copiesOverlap(s.project, [a], [{ kind: 'translate', d: { x: 0, y: 2 } }])?.wall.id).toBe('b');
    // Duas cópias do mesmo lote uma em cima da outra.
    expect(
      copiesOverlap(s.project, [a], [
        { kind: 'translate', d: { x: 0, y: 4 } },
        { kind: 'translate', d: { x: 0, y: 4 } },
      ])?.wall.id,
    ).toBe('a');
    // Lote livre: nada a bloquear.
    expect(copiesOverlap(s.project, [a], [{ kind: 'translate', d: { x: 0, y: 1 } }, { kind: 'translate', d: { x: 0, y: 3 } }])).toBeNull();
  });
});

describe('parede em cima de parede: ferramentas (decisão 0044)', () => {
  it('a recusa usa o alerta modal (ToolEnv.alert) com a parede do conflito, para a vista realçar', () => {
    const { ctx } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    const parede = walls(ctx.store)[0]!;
    const w = tool('wall', ctx.env);
    clickAt(w, 0, 0);
    clickAt(w, 4, 0);
    w.cancel();
    expect(ctx.alertas()).toHaveLength(1);
    expect(ctx.alertas()[0]).toContain('em cima da parede');
    expect(ctx.alertIds()[0]).toEqual([parede.id]);
  });

  it('ferramenta Parede: recusa criar no eixo de uma parede existente', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    const w = tool('wall', ctx.env);
    clickAt(w, 0, 0);
    clickAt(w, 4, 0);
    w.cancel();
    expect(walls(ctx.store)).toHaveLength(1);
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('ferramenta Parede: cria normalmente quando não há sobreposição', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 2], [4, 2]);
    expect(walls(ctx.store)).toHaveLength(2);
    expect(bloqueios(msgs)).toEqual([]);
  });

  it('retângulo: recusa o retângulo inteiro quando um lado cai em cima de outra parede', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    ctx.options.wallShape = 'rect';
    const w = tool('wall', ctx.env);
    clickAt(w, 0, 0);
    clickAt(w, 4, 3);
    w.cancel();
    expect(walls(ctx.store)).toHaveLength(1); // nenhum dos quatro lados foi criado
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('retângulo: cria os quatro lados quando está livre', () => {
    const { ctx } = cena();
    ctx.options.wallShape = 'rect';
    const w = tool('wall', ctx.env);
    clickAt(w, 0, 0);
    clickAt(w, 4, 3);
    w.cancel();
    expect(walls(ctx.store)).toHaveLength(4);
  });

  it('espelhar in-place: recusa quando o reflexo cai em cima de outra parede', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 2], [4, 2]);
    const w1 = walls(ctx.store)[0]!;
    ctx.env.setSelection([w1.id]);
    const m = tool('mirror', ctx.env);
    clickAt(m, -6, 1);
    clickAt(m, 6, 1); // eixo y = 1: o reflexo da parede em y = 0 cai em y = 2
    expect(walls(ctx.store)).toHaveLength(2);
    expect(walls(ctx.store).find((w) => w.id === w1.id)!.a.y).toBeCloseTo(0);
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('espelhar in-place: aplica quando o reflexo fica livre', () => {
    const { ctx } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    const w1 = walls(ctx.store)[0]!;
    ctx.env.setSelection([w1.id]);
    const m = tool('mirror', ctx.env);
    clickAt(m, -6, 1);
    clickAt(m, 6, 1);
    expect(walls(ctx.store).find((w) => w.id === w1.id)!.a.y).toBeCloseTo(2);
  });

  it('espelhar com cópia: recusa a cópia em cima de outra parede', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 2], [4, 2]);
    ctx.env.setSelection([walls(ctx.store)[0]!.id]);
    ctx.options.mirrorCopy = true;
    const m = tool('mirror', ctx.env);
    clickAt(m, -6, 1);
    clickAt(m, 6, 1);
    expect(walls(ctx.store)).toHaveLength(2);
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('espelhar com cópia: cria quando o reflexo fica livre', () => {
    const { ctx } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    ctx.env.setSelection([walls(ctx.store)[0]!.id]);
    ctx.options.mirrorCopy = true;
    const m = tool('mirror', ctx.env);
    clickAt(m, -6, 1);
    clickAt(m, 6, 1);
    expect(walls(ctx.store)).toHaveLength(2);
  });

  it('mover: recusa deixar a parede em cima de outra', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 5], [4, 5]);
    const w1 = walls(ctx.store)[0]!;
    ctx.env.setSelection([w1.id]);
    const move = tool('move', ctx.env);
    clickAt(move, 0, 0);
    clickAt(move, 0, 5); // deslocamento (0, 5): a parede de y = 0 cairia na de y = 5
    expect(walls(ctx.store).find((w) => w.id === w1.id)!.a.y).toBeCloseTo(0);
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('mover: aplica quando o destino está livre', () => {
    const { ctx } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 5], [4, 5]);
    const w1 = walls(ctx.store)[0]!;
    ctx.env.setSelection([w1.id]);
    const move = tool('move', ctx.env);
    clickAt(move, 0, 0);
    clickAt(move, 0, 3);
    expect(walls(ctx.store).find((w) => w.id === w1.id)!.a.y).toBeCloseTo(3);
  });

  it('copiar: recusa a cópia em cima de outra parede', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 5], [4, 5]);
    ctx.env.setSelection([walls(ctx.store)[0]!.id]);
    const cp = tool('copy', ctx.env);
    clickAt(cp, 0, 0);
    clickAt(cp, 0, 5);
    expect(walls(ctx.store)).toHaveLength(2);
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('colar: recusa a parede colada em cima da original', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    const w1 = walls(ctx.store)[0]!;
    setPasteClip(clipboardFrom(ctx.store.project, [w1.id])!);
    const pt = tool('paste', ctx.env);
    clickAt(pt, 2, 0); // a âncora do Colar é o centro da parede: clicar no centro → deslocamento zero
    setPasteClip(null);
    expect(walls(ctx.store)).toHaveLength(1);
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('colar: aplica quando o conteúdo cai livre', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [4, 0]);
    const w1 = walls(ctx.store)[0]!;
    setPasteClip(clipboardFrom(ctx.store.project, [w1.id])!);
    const pt = tool('paste', ctx.env);
    clickAt(pt, 8, 0);
    setPasteClip(null);
    expect(walls(ctx.store)).toHaveLength(2);
    expect(bloqueios(msgs)).toEqual([]);
  });

  it('matriz linear: recusa o lote quando uma cópia cai em cima de outra parede', () => {
    const { ctx, msgs } = cena();
    drawWall(ctx.env, [0, 0], [1, 0]);
    drawWall(ctx.env, [0, 3], [1, 3]);
    ctx.env.setSelection([walls(ctx.store)[0]!.id]);
    ctx.options.arrayCount = 3; // cópias em y = 1,5 e y = 3 (a segunda cai em cima da parede de y = 3)
    const ar = tool('array', ctx.env);
    clickAt(ar, 0, 0);
    clickAt(ar, 0, 1.5);
    expect(walls(ctx.store)).toHaveLength(2);
    expect(bloqueios(msgs).length).toBeGreaterThan(0);
  });

  it('matriz linear: cria as cópias quando o lote está livre', () => {
    const { ctx } = cena();
    drawWall(ctx.env, [0, 0], [1, 0]);
    ctx.env.setSelection([walls(ctx.store)[0]!.id]);
    ctx.options.arrayCount = 3;
    const ar = tool('array', ctx.env);
    clickAt(ar, 0, 0);
    clickAt(ar, 0, 1.5);
    expect(walls(ctx.store)).toHaveLength(3);
  });
});
