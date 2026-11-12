import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectStore, createEmptyProject, makeWall, type CurtainInstance, type CurtainSpec, type Project, type Wall, type WallType } from '@hestia/model';
import { t } from '../editor/i18n.ts';
import { CurtainInstanceGroup } from './CurtainInstanceProps.tsx';

// O grupo lê o projeto pelo hook `useProject`: o teste aponta o hook para o projeto de cada caso.
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

const render = (wall: Wall): string => renderToStaticMarkup(createElement(CurtainInstanceGroup, { wall }));
const REVERTER = t('pt', 'pct_inst_revert');
const contar = (html: string, trecho: string): number => html.split(trecho).length - 1;

describe('grupo "Grade da instância" do painel da parede cortina', () => {
  it('parede sem tipo cortina não mostra o grupo', () => {
    mundo.projeto = null;
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_bas', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    mundo.projeto = s.project;
    expect(render(s.project.elements.w_bas as Wall)).toBe('');
  });

  it('mostra modo, valor e deslocamento de U e V; sem nada sobrescrito, nenhum "Voltar ao tipo"', () => {
    const html = render(cenario());
    expect(html).toContain(t('pt', 'pct_inst_title'));
    for (const eixo of ['u', 'v']) {
      expect(html).toContain(`id="pci-${eixo}-modo"`);
      expect(html).toContain(`id="pci-${eixo}-valor"`);
      expect(html).toContain(`id="pci-${eixo}-off"`);
    }
    expect(contar(html, REVERTER)).toBe(0);
  });

  it('cada campo sobrescrito ganha o seu "Voltar ao tipo"', () => {
    const html = render(cenario({ grid: { u: { count: 6 } } }));
    // só o valor de U está sobrescrito: um botão
    expect(contar(html, REVERTER)).toBe(1);
  });

  it('modo sobrescrito em manual mostra as posições e tem o botão de voltar', () => {
    const html = render(cenario({ grid: { u: { mode: 'manual', positions: [1, 2] } } }));
    expect(html).toContain('value="1; 2"');
    expect(contar(html, REVERTER)).toBe(2); // modo e valor
  });

  it('sem linhas extras, mostra o aviso; com uma, mostra o cadeado e o estado de travada', () => {
    expect(render(cenario())).toContain(t('pt', 'pct_inst_extra_none'));
    const html = render(cenario({ addedLines: [{ id: 'x1', axis: 'u', pos: 1.5 }], lineOverrides: [{ line: { added: 'x1' }, locked: true }] }));
    expect(html).toContain('id="pci-x-x1"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(`aria-label="${t('pt', 'pct_inst_unlock')}"`);
    expect(html).toContain(t('pt', 'pct_inst_extra_delete'));
  });

  it('linha extra livre aparece com o cadeado aberto (aria-pressed falso)', () => {
    const html = render(cenario({ addedLines: [{ id: 'x2', axis: 'v', pos: 1 }] }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(`aria-label="${t('pt', 'pct_inst_lock')}"`);
  });

  it('segmento removido aparece com o número do segmento e o botão de restaurar', () => {
    const html = render(
      cenario({
        removedSegments: [{ line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, k: 0, nk: 2, mid: 0.25 }],
      }),
    );
    expect(html).toContain(`segmento 1`);
    expect(html).toContain(t('pt', 'pct_inst_seg_restore'));
  });

  it('sem segmentos removidos, mostra o aviso', () => {
    expect(render(cenario())).toContain(t('pt', 'pct_inst_seg_none'));
  });
});
