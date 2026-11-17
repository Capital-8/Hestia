import { describe, expect, it } from 'vitest';
import { projetoI1 } from '@hestia/engine';
import { createEmptyProject, makeSlab, ProjectStore } from '@hestia/model';
import { editor } from './controller.ts';
import { goToIssue } from './goToIssue.ts';
import { useUi } from './state.ts';
import { alvoDoAvisoDeLote, avisosGeometriaLote } from './loteVista.ts';

/** I1 com limites que disparam os quatro avisos: taxa de 25 % contra 20 %, coeficiente 0,5 contra 0,4, permeabilidade 66,67 % contra 99 %, e uma laje na faixa de recuo da frente. */
function projetoComQuatroAvisos() {
  const s = new ProjectStore(projetoI1());
  s.exec({ type: 'updateLot', id: 'lote_l1', patch: { limites: { taxaOcupacaoMax: 0.2, coefAproveitamentoMax: 0.4, permeabilidadeMin: 0.99 } } });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 's_fora', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [{ x: 4, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 7 }, { x: 4, y: 7 }] }) });
  return s.project;
}

describe('avisos do lote no painel', () => {
  it('sem lote no projeto não há aviso', () => {
    expect(avisosGeometriaLote(createEmptyProject(), 'pt')).toEqual([]);
  });

  it('os quatro avisos do lote aparecem no painel, todos apontando para o lote', () => {
    const a = avisosGeometriaLote(projetoComQuatroAvisos(), 'pt');
    expect(a.map((x) => x.code).sort()).toEqual(
      ['lote-abaixo-permeabilidade', 'lote-edificacao-fora-do-edificavel', 'lote-excede-coeficiente', 'lote-excede-ocupacao'].sort(),
    );
    expect(a.every((x) => x.elementId === 'lote_l1' && x.severity === 'warning' && x.message.length > 0)).toBe(true);
  });

  it('sem limites e com a edificação dentro da área edificável, não há aviso de lote', () => {
    expect(avisosGeometriaLote(projetoI1(), 'pt')).toEqual([]);
  });

});

describe('Ir para do aviso do lote', () => {
  it('alvo é o lote: nível dele e caixa do contorno (L1 de 0 a 12 por 0 a 30)', () => {
    const alvo = alvoDoAvisoDeLote(projetoI1(), { elementId: 'lote_l1' });
    expect(alvo).toMatchObject({ elementId: 'lote_l1', levelId: 'lv_0', center: { x: 6, y: 15 }, box: { minX: 0, minY: 0, maxX: 12, maxY: 30 } });
  });

  it('elemento que não é lote não tem alvo do lote', () => {
    expect(alvoDoAvisoDeLote(projetoI1(), { elementId: 'sl_0' })).toBeNull();
    expect(alvoDoAvisoDeLote(projetoI1(), { elementId: 'nao_existe' })).toBeNull();
  });

  it('seleciona o lote e leva a vista até ele', () => {
    editor.load(projetoComQuatroAvisos(), 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', selection: [] });
    editor.ensureViewport(800, 600);
    const antes = editor.viewport()!;
    for (const aviso of avisosGeometriaLote(editor.project, 'pt')) {
      useUi.setState({ selection: [] });
      goToIssue(aviso);
      expect(useUi.getState().selection).toEqual(['lote_l1']);
      expect(useUi.getState().status).not.toMatchObject({ key: 'edc_element_gone' });
    }
    expect(editor.viewport()).not.toEqual(antes);
  });
});
