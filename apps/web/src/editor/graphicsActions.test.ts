import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_STYLES, DEFAULT_LINE_WEIGHTS, DEFAULT_VIEW_3D, DEFAULT_VIEW_GRAPHICS, ProjectStore, createEmptyProject, graphicsOf, levelGraphicsOf, view3dOf } from '@hestia/model';
import { alreadyApplied, editLevelGraphics, editProjectGraphics, editThinLines, editView3D, restoreLevelGraphicsDefault, restoreProjectGraphicsDefault, restoreView3DDefault, showLevelsOn, thinLinesOn } from './graphicsActions.ts';
import { resolveText } from './i18n.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());

describe('alreadyApplied (valor efetivo igual ao do patch)', () => {
  it('compara só as chaves do patch, em profundidade, e trata undefined como ausência', () => {
    expect(alreadyApplied({ a: { b: 1 } }, { a: { b: 1, c: 2 } })).toBe(true);
    expect(alreadyApplied({ a: { b: 2 } }, { a: { b: 1 } })).toBe(false);
    expect(alreadyApplied({ x: undefined }, {})).toBe(true);
    expect(alreadyApplied({ t: [[1, 2]] }, { t: [[1, 2]] })).toBe(true);
    expect(alreadyApplied({ t: [[1, 3]] }, { t: [[1, 2]] })).toBe(false);
  });
});

describe('editLevelGraphics (planta do nível)', () => {
  it('aplica o patch ao nível, em um passo de desfazer, e desfaz/refaz', () => {
    const s = store();
    expect(editLevelGraphics(s, 'lv_0', { scale: 50 })).toEqual({ ok: true, error: null });
    expect(levelGraphicsOf(s.project, 'lv_0').scale).toBe(50);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alterar gráficos da vista');
    s.undo();
    expect(levelGraphicsOf(s.project, 'lv_0')).toEqual(DEFAULT_VIEW_GRAPHICS);
    s.redo();
    expect(levelGraphicsOf(s.project, 'lv_0').scale).toBe(50);
  });

  it('cada nível guarda o próprio gráfico', () => {
    const s = store();
    editLevelGraphics(s, 'lv_1', { style: 'shaded' });
    expect(levelGraphicsOf(s.project, 'lv_1').style).toBe('shaded');
    expect(levelGraphicsOf(s.project, 'lv_0').style).toBe(DEFAULT_VIEW_GRAPHICS.style);
  });

  it('recusa escala fracionária com a mensagem do comando e não grava nem entra no histórico', () => {
    const s = store();
    const before = s.project;
    const label = s.undoLabel;
    const r = editLevelGraphics(s, 'lv_0', { scale: 33.3 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).');
    expect(s.project).toBe(before);
    expect(s.undoLabel).toBe(label);
  });

  it('recusa substituição com transparência fora de 0 a 1', () => {
    const s = store();
    const r = editLevelGraphics(s, 'lv_0', { overrides: { window: { transparency: 2 } } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Transparência de "janela" deve ser um número de 0 a 1.');
    expect(levelGraphicsOf(s.project, 'lv_0').overrides.window.transparency).toBe(0);
  });

  it('estilo 3D não vale na planta', () => {
    const s = store();
    const r = editLevelGraphics(s, 'lv_0', { style: 'realistic' as never });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('wireframe, hiddenLine ou shaded');
  });

  it('nível inexistente é recusado com a mensagem do comando', () => {
    const s = store();
    expect(editLevelGraphics(s, 'lv_nao_existe', { scale: 50 })).toEqual({ ok: false, error: 'Nível inexistente' });
  });

  it('sem mudança real não chama o comando (sem passo de desfazer)', () => {
    const s = store();
    const label = s.undoLabel;
    expect(editLevelGraphics(s, 'lv_0', { scale: DEFAULT_VIEW_GRAPHICS.scale, style: DEFAULT_VIEW_GRAPHICS.style })).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(label);
    expect(s.project.levels[0]!.graphics).toBeUndefined();
  });

  it('substituição por categoria: visível = false oculta; peso undefined volta a valer o do projeto', () => {
    const s = store();
    editLevelGraphics(s, 'lv_0', { overrides: { door: { visible: false }, wall: { cutWeight: 7 } } });
    expect(levelGraphicsOf(s.project, 'lv_0').overrides.door.visible).toBe(false);
    expect(levelGraphicsOf(s.project, 'lv_0').overrides.wall.cutWeight).toBe(7);
    editLevelGraphics(s, 'lv_0', { overrides: { wall: { cutWeight: undefined } } });
    expect(levelGraphicsOf(s.project, 'lv_0').overrides.wall.cutWeight).toBeUndefined();
    expect(levelGraphicsOf(s.project, 'lv_0').overrides.door.visible).toBe(false);
  });
});

describe('editView3D (vista 3D: sombras, arestas, sol, fundo)', () => {
  it('alternar sombras grava no projeto e é desfazível com o rótulo dado', () => {
    const s = store();
    expect(view3dOf(s.project).shadows).toBe(true);
    expect(editView3D(s, { shadows: false }, 'Alternar sombras do 3D')).toEqual({ ok: true, error: null });
    expect(view3dOf(s.project).shadows).toBe(false);
    expect(s.undoLabel).toBe('Alternar sombras do 3D');
    s.undo();
    expect(view3dOf(s.project).shadows).toBe(true);
  });

  it('o rótulo padrão é "Alterar gráficos do 3D"', () => {
    const s = store();
    editView3D(s, { edges: false });
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alterar gráficos do 3D');
  });

  it('recusa cor de fundo fora de #rrggbb e não grava', () => {
    const s = store();
    const r = editView3D(s, { background: 'azul' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('A cor de fundo deve estar no formato #rrggbb, ou ser null para o padrão do tema.');
    expect(view3dOf(s.project).background).toBeNull();
  });

  it('recusa elevação do sol acima de 90 graus', () => {
    const s = store();
    const r = editView3D(s, { sunElevation: 95 });
    expect(r.error).toBe('A elevação do sol deve estar entre 0 e 90 graus.');
    expect(view3dOf(s.project).sunElevation).toBe(DEFAULT_VIEW_3D.sunElevation);
  });

  it('grava fundo e sol, e sem mudança real não cria passo de desfazer', () => {
    const s = store();
    editView3D(s, { background: '#102030', sunAzimuth: 45 });
    expect(view3dOf(s.project)).toMatchObject({ background: '#102030', sunAzimuth: 45 });
    const label = s.undoLabel;
    expect(editView3D(s, { sunAzimuth: 45 })).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(label);
  });

  it('níveis de referência: ausente = ligados; desligar grava, desfazer restaura e religar volta a mostrar', () => {
    const s = store();
    expect(showLevelsOn(view3dOf(s.project))).toBe(true);
    expect(editView3D(s, { showLevels: false })).toEqual({ ok: true, error: null });
    expect(view3dOf(s.project).showLevels).toBe(false);
    expect(showLevelsOn(view3dOf(s.project))).toBe(false);
    s.undo();
    expect(showLevelsOn(view3dOf(s.project))).toBe(true);
    expect(editView3D(s, { showLevels: true })).toEqual({ ok: true, error: null });
    expect(showLevelsOn(view3dOf(s.project))).toBe(true);
  });

  it('recusa mostrar níveis com valor que não é sim ou não', () => {
    const s = store();
    const r = editView3D(s, { showLevels: 'sim' as never });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Mostrar níveis de referência no 3D deve ser sim ou não.');
  });
});

describe('editProjectGraphics (pesos de linha do projeto)', () => {
  it('troca uma célula da tabela de pesos e desfaz', () => {
    const s = store();
    const table = DEFAULT_LINE_WEIGHTS.map((r) => [...r] as [number, number, number]);
    table[4]![1] = 0.8;
    expect(editProjectGraphics(s, { lineWeights: table })).toEqual({ ok: true, error: null });
    expect(graphicsOf(s.project).lineWeights[4]).toEqual([0.7, 0.8, 0.35]);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alterar pesos de linha');
    s.undo();
    expect(graphicsOf(s.project).lineWeights).toEqual(DEFAULT_LINE_WEIGHTS);
  });

  it('recusa peso de categoria fora de 1 a 16, com o nome da categoria', () => {
    const s = store();
    const r = editProjectGraphics(s, { categories: { wall: { cutWeight: 17 } } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('"parede"');
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(DEFAULT_CATEGORY_STYLES.wall.cutWeight);
  });

  it('recusa limite de detalhe fino acima do médio', () => {
    const s = store();
    const r = editProjectGraphics(s, { detailByScale: { fineMax: 300 } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('O limite do detalhe fino deve ser maior que zero e não maior que o do médio.');
  });

  it('restaurar padrão volta tabela, pesos e limites; sem mudança não cria passo', () => {
    const s = store();
    editProjectGraphics(s, { detailByScale: { fineMax: 20 }, categories: { roof: { projectionWeight: 9 } } });
    expect(restoreProjectGraphicsDefault(s)).toEqual({ ok: true, error: null });
    expect(graphicsOf(s.project)).toEqual(graphicsOf({ graphics: undefined }));
    const label = s.undoLabel;
    expect(restoreProjectGraphicsDefault(s)).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(label);
  });
});

describe('restauração (planta, 3D)', () => {
  it('restaurar a planta apaga o gráfico guardado do nível, em um passo de desfazer', () => {
    const s = store();
    editLevelGraphics(s, 'lv_0', { scale: 50, partialStructure: 'coreOnly' });
    editLevelGraphics(s, 'lv_1', { scale: 200 });
    expect(restoreLevelGraphicsDefault(s, 'lv_0')).toEqual({ ok: true, error: null });
    expect(levelGraphicsOf(s.project, 'lv_0')).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(levelGraphicsOf(s.project, 'lv_1').scale).toBe(200);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Restaurar gráficos da vista');
    s.undo();
    expect(levelGraphicsOf(s.project, 'lv_0').scale).toBe(50);
  });

  it('restaurar a planta sem nada guardado não cria passo de desfazer', () => {
    const s = store();
    const label = s.undoLabel;
    expect(restoreLevelGraphicsDefault(s, 'lv_0')).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(label);
  });

  it('restaurar o 3D volta sol, fundo, sombras e arestas ao padrão, e desfaz', () => {
    const s = store();
    editView3D(s, { shadows: false, edges: false, sunAzimuth: 10, background: '#000000' });
    expect(restoreView3DDefault(s)).toEqual({ ok: true, error: null });
    expect(view3dOf(s.project)).toEqual(DEFAULT_VIEW_3D);
    s.undo();
    expect(view3dOf(s.project)).toMatchObject({ shadows: false, edges: false, sunAzimuth: 10, background: '#000000' });
  });

  it('restaurar o 3D sem nada guardado não faz nada', () => {
    const s = store();
    const label = s.undoLabel;
    expect(restoreView3DDefault(s)).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(label);
  });
});

describe('editThinLines (linhas finas da vista ativa, só na tela)', () => {
  it('desliga na planta, grava no projeto, desfaz e volta a ligada', () => {
    const s = store();
    expect(thinLinesOn(s.project, { levelId: 'lv_0' })).toBe(true);
    expect(editThinLines(s, { levelId: 'lv_0' }, false)).toEqual({ ok: true, error: null });
    expect(thinLinesOn(s.project, { levelId: 'lv_0' })).toBe(false);
    expect(s.project.levels[0]!.graphics?.thinLines).toBe(false);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alternar linhas finas da planta');
    s.undo();
    expect(thinLinesOn(s.project, { levelId: 'lv_0' })).toBe(true);
  });

  it('no corte, grava no conjunto do projeto (não no nível) e tem o próprio rótulo de desfazer', () => {
    const s = store();
    expect(editThinLines(s, 'section', false).ok).toBe(true);
    expect(thinLinesOn(s.project, 'section')).toBe(false);
    expect(s.project.sectionGraphics?.thinLines).toBe(false);
    expect(thinLinesOn(s.project, { levelId: 'lv_0' })).toBe(true);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alternar linhas finas do corte');
  });
});
