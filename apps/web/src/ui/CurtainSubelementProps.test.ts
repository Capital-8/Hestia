import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CurtainPanelType, MullionType } from '@hestia/model';
import { t } from '../editor/i18n.ts';
import {
  MONTANTE_HERDA,
  MONTANTE_NENHUM,
  SubelementoCortina,
  comandoDaTrava,
  comandoDoMontante,
  comandoDoPainel,
  comandoDoSegmento,
  comandoVoltarPadrao,
  valorDoMontante,
  type SubelementoCortinaProps,
} from './CurtainSubelementProps.tsx';

const LINHA = { axis: 'u' as const, index: 2, pos: 0.5, n: 4 };
const montante: MullionType = {
  id: 'mul_ret_50x100',
  name: 'Retangular 50 × 100',
  profile: { shape: 'rect', width: 0.05, depth: 0.1 },
  materialId: 'mat_aluminio',
};
const painel: CurtainPanelType = { id: 'pnl_vidro_10', name: 'Vidro 10 mm', kind: 'glass', thickness: 0.01, materialId: 'mat_vidro' };
const render = (props: SubelementoCortinaProps): string => renderToStaticMarkup(createElement(SubelementoCortina, props));

describe('construtores de comando do subelemento (decisão 0056, §4.7)', () => {
  it('montante: herdar tira a sobrescrita; "sem montante" grava null; um tipo grava o id', () => {
    expect(comandoDoMontante('w1', LINHA, MONTANTE_HERDA)).toEqual({ type: 'clearLineOverride', wallId: 'w1', line: LINHA });
    expect(comandoDoMontante('w1', LINHA, MONTANTE_NENHUM)).toEqual({ type: 'setLineMullion', wallId: 'w1', line: LINHA, mullionTypeId: null });
    expect(comandoDoMontante('w1', LINHA, 'mul_ret_50x100')).toEqual({ type: 'setLineMullion', wallId: 'w1', line: LINHA, mullionTypeId: 'mul_ret_50x100' });
  });

  it('valor do seletor: undefined herda, null é sem montante, id é o próprio id', () => {
    expect(valorDoMontante(undefined)).toBe(MONTANTE_HERDA);
    expect(valorDoMontante(null)).toBe(MONTANTE_NENHUM);
    expect(valorDoMontante('mul_x')).toBe('mul_x');
  });

  it('trava: o estado novo vai no comando', () => {
    expect(comandoDaTrava('w1', LINHA, true)).toEqual({ type: 'lockGridLine', wallId: 'w1', line: LINHA, locked: true });
  });

  it('segmento: removido restaura; presente remove, com o índice k', () => {
    expect(comandoDoSegmento('w1', LINHA, 1, true)).toEqual({ type: 'restoreSegment', wallId: 'w1', line: LINHA, k: 1 });
    expect(comandoDoSegmento('w1', LINHA, 1, false)).toEqual({ type: 'removeSegment', wallId: 'w1', line: LINHA, k: 1 });
  });

  it('célula: trocar o painel e voltar ao padrão', () => {
    expect(comandoDoPainel('w1', 0, 1, 'pnl_solido')).toEqual({ type: 'setCellPanel', wallId: 'w1', i: 0, j: 1, panelTypeId: 'pnl_solido' });
    expect(comandoVoltarPadrao('w1', 0, 1)).toEqual({ type: 'clearCellOverride', wallId: 'w1', i: 0, j: 1 });
  });
});

describe('seção do subelemento (componente puro)', () => {
  it('linha: seletor de montante com "Do sistema", "Sem montante" e os tipos; trava marcada quando travada', () => {
    const html = render({ kind: 'line', wallId: 'w1', line: LINHA, montante: 'mul_ret_50x100', travada: true, montantes: [montante], onCommand: () => {} });
    expect(html).toContain('id="sub-linha-montante"');
    expect(html).toContain(t('pt', 'pct_sub_line_inherit'));
    expect(html).toContain(t('pt', 'pct_sub_line_none'));
    expect(html).toContain('Retangular 50 × 100');
    expect(html).toMatch(/id="sub-linha-trava"[^>]*checked/);
  });

  it('linha sem sobrescrita de montante mostra "Do sistema" selecionado', () => {
    const html = render({ kind: 'line', wallId: 'w1', line: LINHA, montante: undefined, travada: false, montantes: [montante], onCommand: () => {} });
    expect(html).toMatch(new RegExp(`<option value="${MONTANTE_HERDA}" selected=""`));
    expect(html).not.toMatch(/id="sub-linha-trava"[^>]*checked/);
  });

  it('segmento removido mostra "Restaurar segmento"; presente mostra "Remover segmento"', () => {
    const removido = render({ kind: 'segment', wallId: 'w1', line: LINHA, k: 0, removido: true, onCommand: () => {} });
    expect(removido).toContain(t('pt', 'pct_sub_seg_restore'));
    expect(removido).toContain(t('pt', 'pct_sub_seg_removed'));
    const presente = render({ kind: 'segment', wallId: 'w1', line: LINHA, k: 0, removido: false, onCommand: () => {} });
    expect(presente).toContain(t('pt', 'pct_sub_seg_remove'));
  });

  it('célula sem sobrescrita: "Voltar ao padrão" desativado e a nota de que segue o sistema', () => {
    const html = render({ kind: 'cell', wallId: 'w1', i: 0, j: 0, painel: 'pnl_vidro_10', sobrescrita: false, paineis: [painel], onCommand: () => {} });
    expect(html).toContain('id="sub-celula-painel"');
    expect(html).toContain(t('pt', 'pct_sub_cell_follows'));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Voltar ao padrão/);
  });

  it('célula com sobrescrita: "Voltar ao padrão" ativo', () => {
    const html = render({ kind: 'cell', wallId: 'w1', i: 0, j: 0, painel: 'pnl_vidro_10', sobrescrita: true, paineis: [painel], onCommand: () => {} });
    expect(html).toContain(t('pt', 'pct_sub_cell_own'));
    expect(html).not.toMatch(/<button[^>]*disabled=""/);
  });
});
