import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, emptyTitleBlock, makeLevel, makeWall, sheetOf, type Sheet } from '@hestia/model';
import { addSheetAction } from './sheetActions.ts';
import { addViewportAtAction, contentSizeMm, dragPlacement, naturalScaleOf } from './sheetInsert.ts';
import { initialInsertScale, insertViewsWithMode } from './sheetInsertPreview.ts';
import { chaveDaFonteDeVista, gruposDeVistas } from './sheetInsertSources.ts';

/*
 * Prancha e navegador com plantas de disciplina (decisão 0060 §6, etapa 4.3): arrastar a planta do Navegador grava o
 * viewport com o `planId` e a escala dela; a planta excluída tira o viewport e nada mais quebra. Projeto: lv_0 com uma
 * casa de 4 × 3 m; pv_est (Estrutura) em lv_0, com escala 1:50.
 */

function casa(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_sul', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_leste', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 4, y: 3 }, height: 3 }) });
  return s;
}

function comEstrutura(): ProjectStore {
  const s = casa();
  s.exec({ type: 'addPlanView', plan: { id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' } });
  s.exec({ type: 'setPlanGraphics', planId: 'pv_est', patch: { scale: 50 } });
  return s;
}

/** Prancha A3 deitada vazia, para medir o que o arraste colocaria. */
function pranchaVazia(): Sheet {
  return { id: 's1', number: 'A-101', name: 'Planta', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports: [] };
}

describe('arrastar a planta de disciplina do Navegador para a prancha', () => {
  it('grava o viewport com o planId da planta e na escala dela (1:50), não na do nível (1:100)', () => {
    const s = comEstrutura();
    const sheetId = addSheetAction(s);
    const sheet = sheetOf(s.project, sheetId)!;
    const plan = dragPlacement(s.project, sheet, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, { x: 210, y: 148 })!;
    // 4 × 3 m a 1:50 → 80 × 60 mm + 30 mm de folga.
    expect(plan.scale).toBe(50);
    expect(plan.size).toEqual({ w: 110, h: 90 });
    const vpId = addViewportAtAction(s, sheetId, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, plan);
    const vp = sheetOf(s.project, sheetId)!.viewports.find((v) => v.id === vpId)!;
    expect(vp.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: 'pv_est' });
    expect(vp.scale).toBe(50);
    expect(vp.size).toEqual({ w: 110, h: 90 });
  });

  it('a planta padrão do mesmo nível continua entrando como antes, sem planId e na escala do nível', () => {
    const s = comEstrutura();
    const plan = dragPlacement(s.project, pranchaVazia(), { kind: 'plan', levelId: 'lv_0' }, { x: 210, y: 148 })!;
    expect(plan.scale).toBe(100);
    expect(plan.size).toEqual({ w: 70, h: 60 });
  });

  it('a vista arrastada com Shift marca a planta de disciplina na lista, pela chave pv:', () => {
    expect(chaveDaFonteDeVista({ kind: 'plan', levelId: 'lv_0', planId: 'pv_est' })).toBe('pv:pv_est');
    expect(chaveDaFonteDeVista({ kind: 'plan', levelId: 'lv_0' })).toBe('plan:lv_0');
    const plantas = gruposDeVistas(comEstrutura().project, 'pt').find((g) => g.tipo === 'plan')!.fontes;
    expect(plantas.map((f) => f.key)).toEqual(['plan:lv_0', 'pv:pv_est', 'plan:lv_1']);
  });

  it('a escala natural da planta de disciplina é lida da planta; um id que sumiu cai na padrão do nível', () => {
    const s = comEstrutura();
    expect(naturalScaleOf(s.project, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' })).toBe(50);
    expect(naturalScaleOf(s.project, { kind: 'plan', levelId: 'lv_0', planId: 'pv_gone' })).toBe(100);
  });

  it('a janela "Inserir vistas" abre na escala natural da planta de disciplina e insere nela, com o planId', () => {
    const s = comEstrutura();
    const sheet = pranchaVazia();
    expect(initialInsertScale(s.project, sheet, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' })).toBe(50);
    expect(initialInsertScale(s.project, sheet, { kind: 'plan', levelId: 'lv_0' })).toBe(100);
    const sheetId = addSheetAction(s);
    const [vpId] = insertViewsWithMode(s, sheetId, [{ kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }], 'natural', { x: 210, y: 148 });
    const vp = sheetOf(s.project, sheetId)!.viewports.find((v) => v.id === vpId)!;
    expect(vp.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: 'pv_est' });
    expect(vp.scale).toBe(50);
  });
});

describe('prancha que referencia uma planta excluída', () => {
  it('excluir a planta tira o viewport junto e um desfazer devolve os dois', () => {
    const s = comEstrutura();
    const sheetId = addSheetAction(s);
    const sheet = sheetOf(s.project, sheetId)!;
    const plan = dragPlacement(s.project, sheet, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, { x: 210, y: 148 })!;
    addViewportAtAction(s, sheetId, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, plan);
    expect(sheetOf(s.project, sheetId)!.viewports).toHaveLength(1);

    s.exec({ type: 'removePlanView', id: 'pv_est' });
    expect(s.project.planViews ?? []).toEqual([]);
    expect(sheetOf(s.project, sheetId)!.viewports).toEqual([]);

    s.undo();
    expect(sheetOf(s.project, sheetId)!.viewports.map((v) => v.view)).toEqual([{ kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }]);
  });

  it('prancha salva com planId que não existe mais abre sem quebrar: a planta cai na padrão do nível', () => {
    const s = comEstrutura();
    const sheetId = addSheetAction(s);
    const sheet = sheetOf(s.project, sheetId)!;
    const plan = dragPlacement(s.project, sheet, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, { x: 210, y: 148 })!;
    addViewportAtAction(s, sheetId, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, plan);
    // Arquivo salvo antes da planta sumir (a remoção normal já tira o viewport; este é o caso do arquivo antigo).
    const p = structuredClone(s.project);
    p.planViews = [];
    const orfa: Sheet = sheetOf(p, sheetId)!;
    expect(orfa.viewports[0]!.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: 'pv_est' });

    expect(naturalScaleOf(p, orfa.viewports[0]!.view)).toBe(100);
    expect(contentSizeMm(p, orfa.viewports[0]!.view, 100)).toEqual({ w: 70, h: 60 });
    const novo = dragPlacement(p, orfa, { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, { x: 210, y: 148 })!;
    expect(novo.scale).toBe(100);
    // As listas do navegador e do DXF não oferecem mais a planta que sumiu.
    expect(gruposDeVistas(p, 'pt').flatMap((g) => g.fontes).map((f) => f.key)).toEqual(['plan:lv_0', 'plan:lv_1', '3d']);
  });
});
