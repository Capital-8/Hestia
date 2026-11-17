import { describe, expect, it } from 'vitest';
import { dist, type Vec2 } from '@hestia/geom';
import { makeFloor, makeWall } from '@hestia/model';
import { editDraft } from './perimeterSession.ts';
import { PerimeterTool } from './perimeterTool.ts';
import { P, clickAt, makeEnv } from './testEnv.ts';
import { registerBuiltinDimProviders } from './dims/registry.ts';

function setup(target: 'roof' | 'floor' = 'roof') {
  const ctx = makeEnv();
  const t = new PerimeterTool(ctx.env, target);
  t.start();
  return { ...ctx, t };
}

/** Retângulo (0,0)–(4,3) por dois cliques, com a forma "Retângulo" ativa. */
function drawRect(t: PerimeterTool): void {
  t.setShape('rectangle');
  clickAt(t, 0, 0);
  clickAt(t, 4, 3);
}

const near = (p: Vec2, x: number, y: number): boolean => dist(p, { x, y }) < 1e-9;

describe('PerimeterTool: desenho', () => {
  it('retângulo por 2 cliques vira 4 linhas e Concluir fecha o contorno', () => {
    const { t } = setup();
    drawRect(t);
    expect(t.draft().segs).toHaveLength(4);
    expect(t.closeInfo().ok).toBe(true);
    const r = t.finish();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outer).toHaveLength(4);
      expect(r.edges).toHaveLength(4);
      expect(r.edges.every((e) => e.definesSlope)).toBe(true);
    }
    expect(t.draft().segs).toHaveLength(0);
  });

  it('linha de limite encadeia linhas até o laço fechar no ponto inicial', () => {
    const { t } = setup();
    t.setShape('line');
    const corners: Vec2[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }];
    for (const c of corners) clickAt(t, c.x, c.y);
    expect(t.draft().segs).toHaveLength(4);
    expect(t.closeInfo().ok).toBe(true);
    expect(t.finish().ok).toBe(true);
  });

  it('digitar comprimento na linha põe o fim na direção do cursor', () => {
    const { t } = setup();
    t.setShape('line');
    clickAt(t, 0, 0);
    expect(t.inputPrompt()).toBe('Comprimento');
    t.move(P(1, 0));
    expect(t.preview().length).toBeGreaterThan(0);
    expect(t.type('3')).toBe(true);
    const segs = t.draft().segs;
    expect(segs).toHaveLength(1);
    expect(near(segs[0]!.b, 3, 0)).toBe(true);
  });

  it('Tab fora de um passo numérico não muda o rascunho', () => {
    const { t } = setup();
    drawRect(t);
    t.tab();
    expect(t.draft().segs).toHaveLength(4);
  });

  it('loadDraft carrega um contorno para editar e Concluir devolve o mesmo anel', () => {
    const { t } = setup();
    const ring = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 2 }, { x: 0, y: 2 }];
    t.loadDraft(editDraft('roof', 'tt1', ring));
    expect(t.draft().editing).toBe('tt1');
    const r = t.finish();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outer).toHaveLength(4);
  });
});

describe('PerimeterTool: formas com entradas próprias', () => {
  it('círculo por centro e ponto do raio vira dois arcos', () => {
    const { t } = setup();
    t.setShape('circle');
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    expect(t.draft().segs).toHaveLength(2);
    expect(t.draft().segs.every((s) => s.sag !== undefined)).toBe(true);
  });

  it('polígono inscrito: o 2º clique conclui com 6 lados (padrão do campo), sem pedir digitação', () => {
    const { t } = setup();
    t.setShape('inscribedPolygon');
    clickAt(t, 0, 0);
    expect(t.inputPrompt()).toBeNull();
    clickAt(t, 1, 0);
    expect(t.draft().segs).toHaveLength(6);
    expect(t.closeInfo().ok).toBe(true);
  });

  it('polígono usa options.sketchSides (8) e a prévia já mostra 8 lados antes do 2º clique', () => {
    const { t, options } = setup();
    options.sketchSides = 8;
    t.setShape('circumscribedPolygon');
    clickAt(t, 0, 0);
    t.move({ raw: { x: 1, y: 0 }, shift: false, ctrl: false, alt: false } as never);
    expect(t.preview().filter((i) => i.kind === 'line')).toHaveLength(8);
    clickAt(t, 1, 0);
    expect(t.draft().segs).toHaveLength(8);
  });

  it('número digitado entre o centro e o vértice vale para aquele polígono (5 lados); fora de 3 a 64 é recusado', () => {
    const { t } = setup();
    t.setShape('inscribedPolygon');
    clickAt(t, 0, 0);
    expect(t.type('2')).toBe(false);
    expect(t.type('65')).toBe(false);
    expect(t.type('5')).toBe(true);
    clickAt(t, 1, 0);
    expect(t.draft().segs).toHaveLength(5);
  });

  it('filete entre duas linhas do rascunho troca as duas pelas aparadas e acrescenta o arco', () => {
    const { t } = setup();
    drawRect(t);
    t.setShape('fillet');
    clickAt(t, 2, 0);
    clickAt(t, 4, 1.5);
    expect(t.inputPrompt()).toBe('Raio');
    expect(t.type('0.5')).toBe(true);
    const segs = t.draft().segs;
    expect(segs).toHaveLength(5);
    expect(segs.filter((s) => s.sag)).toHaveLength(1);
  });
});

describe('PerimeterTool: Esc e Enter', () => {
  it('Esc com o rascunho pronto não conclui, não descarta e não sai da ferramenta', () => {
    const { t, done } = setup();
    drawRect(t);
    t.cancel();
    expect(t.draft().segs).toHaveLength(4);
    expect(done()).toBe(0);
    expect(t.activeShape()).toBeNull();
    expect(t.closeInfo().ok).toBe(true);
  });

  it('Esc cancela só o primeiro canto em andamento', () => {
    const { t, done } = setup();
    t.setShape('rectangle');
    clickAt(t, 0, 0);
    t.cancel();
    clickAt(t, 4, 3);
    expect(t.draft().segs).toHaveLength(0);
    expect(done()).toBe(0);
  });

  it('Enter não conclui: o rascunho continua e nada é concluído', () => {
    const { t, done } = setup();
    drawRect(t);
    t.confirm();
    expect(t.draft().segs).toHaveLength(4);
    expect(done()).toBe(0);
  });

  it('o botão Cancelar descarta o rascunho inteiro', () => {
    const { t } = setup();
    drawRect(t);
    t.discard();
    expect(t.draft().segs).toHaveLength(0);
  });
});

describe('PerimeterTool: pela face', () => {
  it('passa sobre a borda do piso, mostra o rótulo e o clique adiciona a linha uma vez', () => {
    const ctx = makeEnv();
    ctx.store.exec({
      type: 'addFloor',
      floor: makeFloor({ id: 'pi', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 10, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 3 }, { x: 10, y: 3 }] }),
    });
    const t = new PerimeterTool(ctx.env);
    t.start();
    t.setShape('pickFace');
    t.move(P(12, 0));
    expect(t.preview().some((i) => i.kind === 'label' && /Borda/.test(i.text))).toBe(true);
    clickAt(t, 12, 0);
    const segs = t.draft().segs;
    expect(segs).toHaveLength(1);
    expect(near(segs[0]!.a, 10, 0) || near(segs[0]!.b, 10, 0)).toBe(true);
    clickAt(t, 12, 0);
    expect(t.draft().segs).toHaveLength(1);
  });
});

describe('PerimeterTool: pela caixa', () => {
  it('arrastar a caixa sobre as paredes adiciona o contorno externo e fecha', () => {
    const ctx = makeEnv();
    const R: Vec2[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
    R.forEach((a, i) => ctx.store.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b: R[(i + 1) % 4]! }) }));
    const t = new PerimeterTool(ctx.env);
    t.start();
    t.setShape('byPerimeter');
    t.down(P(-2, -2));
    t.drag(P(10, 8));
    expect(t.preview()).toHaveLength(1);
    t.up(P(10, 8));
    expect(t.draft().segs).toHaveLength(4);
    expect(t.closeInfo().ok).toBe(true);
  });
});

describe('PerimeterTool: seleção e inclinação', () => {
  it('clique seleciona a linha e Delete a remove; sem seleção, Delete não é tratado', () => {
    const { t } = setup();
    expect(t.deleteKey()).toBe(false);
    drawRect(t);
    t.setShape(null);
    clickAt(t, 2, 0);
    expect(t.draft().selected).toHaveLength(1);
    expect(t.deleteKey()).toBe(true);
    expect(t.draft().segs).toHaveLength(3);
  });

  it('clique no triângulo alterna definesSlope da aresta do contorno (telhado)', () => {
    const { t } = setup('roof');
    drawRect(t);
    expect(t.setLineKind('slope')).toBe(true);
    const bottom = () => t.draft().segs.find((s) => near(s.a, 0, 0) && near(s.b, 4, 0))!;
    // Triângulo da aresta inferior: fora do retângulo, a 38 px (0,38 m com 0,01 m/px).
    clickAt(t, 2, -0.38);
    expect(bottom().definesSlope).toBe(false);
    clickAt(t, 2, -0.38);
    expect(bottom().definesSlope).toBe(true);
  });

  it('inclinação por aresta não existe fora do telhado', () => {
    const { t } = setup('floor');
    expect(t.setLineKind('slope')).toBe(false);
  });
});

describe('PerimeterTool: API para a interface', () => {
  it('closeInfo aponta laço aberto e finish recusa o esboço', () => {
    const { t } = setup();
    t.setShape('line');
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    t.cancel();
    expect(t.closeInfo().ok).toBe(false);
    const r = t.finish();
    expect(r.ok).toBe(false);
    expect(t.draft().segs).toHaveLength(1);
  });

  it('tempDims segue o modo ortogonal (F8): a cota acaba no ponto travado', () => {
    registerBuiltinDimProviders();
    const ctx = makeEnv();
    ctx.options.orthoLock = true;
    const t = new PerimeterTool(ctx.env);
    t.start();
    t.setShape('line');
    clickAt(t, 0, 0);
    t.move(P(3, 1));
    const dims = t.tempDims!();
    expect(dims).toHaveLength(1);
    // Cursor cru (3,1), mas o ponto capturado no modo ortogonal é (3,0): a cota mede 3, não √10.
    expect(near(dims[0]!.b, 3, 0)).toBe(true);
    expect(dims[0]!.value).toBeCloseTo(3, 9);
  });

  it('hoverId aponta a linha sob o cursor no modo de seleção', () => {
    const { t } = setup();
    drawRect(t);
    t.setShape(null);
    t.move(P(2, 0));
    expect(t.hoverId()).not.toBeNull();
  });

  it('tempDims cota o lado em desenho e cada linha selecionada', () => {
    registerBuiltinDimProviders();
    const { t } = setup();
    t.setShape('line');
    clickAt(t, 0, 0);
    t.move(P(3, 0));
    expect(t.tempDims!().map((d) => d.value)).toEqual([expect.closeTo(3, 9)]);
    t.cancel();
    drawRect(t);
    t.selectAll();
    expect(t.tempDims!().map((d) => d.value)).toEqual([4, 3, 4, 3].map((v) => expect.closeTo(v, 9)));
  });
});
