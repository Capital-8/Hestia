import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectStore, createEmptyProject, makeWall, type CurtainInstance, type CurtainSpec, type Project, type Wall, type WallType } from '@hestia/model';
import { t } from '../editor/i18n.ts';
import { CurtainLinhasExtras } from './CurtainInstanceProps.tsx';

// A seção lê o projeto pelo hook `useProject`: o teste aponta o hook para o projeto de cada caso.
const mundo = vi.hoisted(() => ({ projeto: null as Project | null }));
vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => mundo.projeto ?? actual.editor.project };
});

const grade: CurtainSpec = {
  depth: 0.1,
  u: { mode: 'fixedNumber', count: 4 },
  v: { mode: 'fixedNumber', count: 2 },
  mullions: {
    interiorVertical: 'mul_ret_50x100',
    interiorHorizontal: 'mul_ret_50x100',
    borderStart: 'mul_ret_50x100',
    borderEnd: 'mul_ret_50x100',
    borderBottom: 'mul_ret_50x100',
    borderTop: 'mul_ret_50x100',
    corner: null,
    joinPriority: 'vertical',
  },
  defaultPanelTypeId: 'pnl_vidro_10',
};

/** Projeto com uma parede cortina `w_ct` (com a instância dada) e uma parede básica `w_bas`. */
function cenario(inst: CurtainInstance = {}): Wall {
  const base = createEmptyProject();
  for (const id of Object.keys(base.wallTypes)) if (base.wallTypes[id]!.family === 'curtain') delete base.wallTypes[id];
  const s = new ProjectStore(base);
  const tipo: WallType = { ...createEmptyProject().wallTypes.wt_alv14!, id: 'wt_ct', name: 'Cortina teste', family: 'curtain', curtain: grade, layers: [], strips: [], wrapInserts: 'none', wrapEnds: 'none' };
  s.exec({ type: 'upsertWallType', wallType: tipo });
  s.exec({ type: 'addWall', wall: { ...makeWall({ id: 'w_ct', typeId: tipo.id, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: inst } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_bas', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }) });
  mundo.projeto = s.project;
  return s.project.elements.w_ct as Wall;
}

const render = (wall: Wall): string => renderToStaticMarkup(createElement(CurtainLinhasExtras, { wall }));

describe('seção "Linhas extras" do painel da parede cortina', () => {
  it('parede sem tipo cortina não mostra a seção', () => {
    mundo.projeto = null;
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_bas', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    mundo.projeto = s.project;
    expect(render(s.project.elements.w_bas as Wall)).toBe('');
  });

  it('não mostra a grade de U nem de V: ela fica no diálogo "Editar tipo"', () => {
    const html = render(cenario({ grid: { u: { count: 6 } } }));
    expect(html).toContain(t('pt', 'pct_inst_extra_title'));
    expect(html).not.toContain('id="pci-u-');
    expect(html).not.toContain('id="pci-v-');
  });

  it('sem linhas extras, mostra o aviso e o formulário de adicionar por posição', () => {
    const html = render(cenario());
    expect(html).toContain(t('pt', 'pct_inst_extra_none'));
    expect(html).toContain('id="pci-nova-eixo"');
    expect(html).toContain('id="pci-nova-pos"');
    expect(html).toContain(t('pt', 'pct_inst_extra_add'));
  });

  it('com uma linha extra travada, mostra a posição, o cadeado (aria-pressed verdadeiro) e apagar', () => {
    const html = render(cenario({ addedLines: [{ id: 'x1', axis: 'u', pos: 1.5 }], lineOverrides: [{ line: { added: 'x1' }, locked: true }] }));
    expect(html).toContain('id="pci-x-x1"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(`aria-label="${t('pt', 'pct_inst_unlock')}"`);
    expect(html).toContain(t('pt', 'pct_inst_extra_delete'));
    expect(html).not.toContain(t('pt', 'pct_inst_extra_none'));
  });

  it('linha extra livre aparece com o cadeado aberto (aria-pressed falso)', () => {
    const html = render(cenario({ addedLines: [{ id: 'x2', axis: 'v', pos: 1 }] }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(`aria-label="${t('pt', 'pct_inst_lock')}"`);
  });

  it('segmentos removidos não entram aqui: ficam no subelemento (Tab ou clique)', () => {
    const html = render(
      cenario({
        removedSegments: [{ line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, k: 0, nk: 2, mid: 0.25 }],
      }),
    );
    expect(html).not.toContain('segmento 1');
  });
});
