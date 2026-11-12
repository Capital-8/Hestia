import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, ProjectStore } from '@hestia/model';
import { FLOW_IDLE, type FlowState } from '../../editor/furniture/importFlow.ts';
import { buildAssetFromModel, initialMaterialEdits } from '../../editor/furniture/importModel.ts';
import { boxModel } from '../../editor/furniture/testFixtures.ts';

vi.mock('../../editor/controller.ts', () => ({ useProject: () => null, editor: {} }));

const { ImportPanel, flowErrorText } = await import('./ImportFurnitureDialog.tsx');

const render = (state: FlowState): string =>
  renderToStaticMarkup(createElement(ImportPanel, { state, onFile: () => undefined, onCancel: () => undefined, onAdd: () => undefined }));

describe('diálogo Importar móvel: estados', () => {
  it('ocioso: seletor de arquivo e área de soltar, sem barra nem erro', () => {
    const html = render(FLOW_IDLE);
    expect(html).toContain('type="file"');
    expect(html).toContain('.skp,.glb,.gltf,.obj,.dae,.fbx,.zip');
    expect(html).toContain('data-testid="fur-drop"');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('role="alert"');
  });

  it('lendo: barra indeterminada e botão Cancelar; seletor desabilitado', () => {
    const html = render({ ...FLOW_IDLE, phase: 'reading' });
    expect(html).toContain('role="progressbar"');
    expect(html).not.toMatch(/<progress[^>]*value=/);
    expect(html).toContain('Cancelar importação');
    expect(html).toContain('Lendo o arquivo');
    expect(html).toMatch(/<input[^>]*type="file"[^>]*disabled/);
  });

  it('importando: barra com a fração e o texto do importador', () => {
    const html = render({ ...FLOW_IDLE, phase: 'importing', progress: { fraction: 0.42, label: 'Lendo malhas' } });
    expect(html).toMatch(/<progress[^>]*value="0.42"/);
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('42%');
    expect(html).toContain('Lendo malhas');
    expect(html).toContain('Cancelar importação');
  });

  it('erro de formato, recusa por tamanho, recusa por vértices, genérico e cancelado', () => {
    expect(render({ ...FLOW_IDLE, error: { kind: 'format', ext: 'png' } })).toContain('Formato não suportado: &quot;.png&quot;');
    const grande = render({ ...FLOW_IDLE, error: { kind: 'too_big', mb: 60 } });
    expect(grande).toContain('role="alert"');
    expect(grande).toContain('60 MB');
    expect(grande).toContain('modo leve');
    expect(render({ ...FLOW_IDLE, error: { kind: 'refused' } })).toContain('modo leve');
    expect(render({ ...FLOW_IDLE, error: { kind: 'generic', msg: 'quebrou' } })).toContain('quebrou');
    const c = render({ ...FLOW_IDLE, error: { kind: 'cancelled' } });
    expect(c).toContain('Importação cancelada');
    expect(c).toContain('role="status"');
    expect(flowErrorText({ kind: 'refused' }, (k) => String(k))).toBe('fur_err_refused');
  });

  it('pronto: resumo, dimensões em metros, avisos do importador e campos por material', () => {
    const html = render({ ...FLOW_IDLE, phase: 'ready', model: boxModel() });
    expect(html).toContain('caixa.glb');
    expect(html).toContain('8 vértices');
    expect(html).toContain('12 triângulos');
    expect(html).toContain('1 peças');
    expect(html).toContain('1 texturas');
    expect(html).toContain('Dimensões: 0,80 × 0,40 × 0,50 m');
    expect(html).toContain('Textura .webp ignorada.');
    expect(html).toContain('Metros (padrão)');
    expect(html).toContain('Polegadas');
    expect(html).toContain('Usar a textura do arquivo');
    expect(html).toContain('type="color"');
    expect((html.match(/<option value="wood"/g) ?? []).length).toBe(2);
    expect(html).toContain('Adicionar ao projeto');
    expect(html).toContain('Adicionar e colocar');
    // só o material com textura permite marcar "usar a textura do arquivo"
    expect((html.match(/type="checkbox"[^>]*disabled/g) ?? []).length).toBe(1);
  });

  it('adicionando: botões travados', () => {
    const html = render({ ...FLOW_IDLE, phase: 'adding', model: boxModel() });
    expect(html).toContain('Adicionando…');
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('o que o diálogo entrega vira comando', () => {
  it('formulário -> asset -> addFurnitureAsset (com unidade e categoria editadas)', () => {
    const store = new ProjectStore(createEmptyProject());
    const m = boxModel();
    const edits = initialMaterialEdits(m);
    edits[0] = { ...edits[0]!, category: 'leather' };
    const asset = buildAssetFromModel(m, { name: 'Poltrona', factor: 0.01, materials: edits });
    store.exec({ type: 'addFurnitureAsset', asset });
    const salvo = store.project.furniture!.assets[asset.id]!;
    expect(salvo.materials[0]!.category).toBe('leather');
    expect(salvo.bbox.max[0]).toBeCloseTo(0.018, 6);
  });
});
