import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CurtainPanelType, MullionType } from '@hestia/model';
import { t } from '../editor/i18n.ts';
import {
  MONTANTE_HERDA,
  MONTANTE_NENHUM,
  SubelementoCortina,
  comandoAlinhamentoEsquadria,
  comandoDaTrava,
  comandoDoMontante,
  comandoDoPainel,
  comandoDoSegmento,
  comandoInverterEsquadria,
  comandoMarcaEsquadria,
  comandoModoEsquadria,
  comandoRemoverEsquadria,
  comandoTipoEsquadria,
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

describe('construtores da porta ou janela na célula (fase 5, §7.7)', () => {
  it('trocar tipo, inverter, marca, modo, alinhamento e remover viram updateCellOpening/removeCellOpening na célula', () => {
    expect(comandoTipoEsquadria('ct1', 0, 1, 'ot_pq')).toEqual({ type: 'updateCellOpening', wallId: 'ct1', i: 0, j: 1, patch: { openingTypeId: 'ot_pq' } });
    expect(comandoInverterEsquadria('ct1', 0, 1, 'flipHand', true)).toEqual({ type: 'updateCellOpening', wallId: 'ct1', i: 0, j: 1, patch: { flipHand: true } });
    expect(comandoInverterEsquadria('ct1', 0, 1, 'flipFacing', false)).toEqual({ type: 'updateCellOpening', wallId: 'ct1', i: 0, j: 1, patch: { flipFacing: false } });
    expect(comandoMarcaEsquadria('ct1', 0, 1, 'P-01')).toEqual({ type: 'updateCellOpening', wallId: 'ct1', i: 0, j: 1, patch: { mark: 'P-01' } });
    expect(comandoModoEsquadria('ct1', 0, 1, 'grid')).toEqual({ type: 'updateCellOpening', wallId: 'ct1', i: 0, j: 1, patch: { fit: 'grid' } });
    expect(comandoAlinhamentoEsquadria('ct1', 0, 1, 'end')).toEqual({ type: 'updateCellOpening', wallId: 'ct1', i: 0, j: 1, patch: { align: 'end' } });
    expect(comandoRemoverEsquadria('ct1', 0, 1)).toEqual({ type: 'removeCellOpening', wallId: 'ct1', i: 0, j: 1 });
  });
});

describe('seção da porta ou janela na célula (componente puro)', () => {
  const tipos = [{ id: 'ot_pq', name: 'Porta pequena', code: 'PQ', family: 'Giro', subject: { kind: 'door' as const, type: {} as never } }];
  const base = {
    kind: 'opening' as const,
    wallId: 'ct1',
    i: 0,
    j: 1,
    tipo: 'door' as const,
    openingTypeId: 'ot_pq',
    flipHand: false,
    flipFacing: false,
    mark: 'P-01',
    fit: 'cell' as const,
    align: 'center' as const,
    tipos,
    favoritos: [],
    onEditarTipo: () => {},
    onCommand: () => {},
  };

  it('mostra o tipo, as inversões, a marca, o modo e o botão de remover; sem "Voltar ao padrão" nem seletor de painel', () => {
    const html = render(base);
    expect(html).toContain(t('pt', 'pct_opening_title'));
    expect(html).toContain('id="sub-opening-hand"');
    expect(html).toContain('id="sub-opening-facing"');
    expect(html).toContain('value="P-01"');
    expect(html).toContain('id="sub-opening-fit"');
    expect(html).toContain('id="sub-opening-remove"');
    expect(html).toContain(t('pt', 'pct_remove_opening'));
    expect(html).not.toContain(t('pt', 'pct_sub_cell_default'));
    expect(html).not.toContain('id="sub-celula-painel"');
  });

  it('inversão marcada aparece como pressionada (aria-pressed="true")', () => {
    const html = render({ ...base, flipHand: true });
    expect(html).toMatch(/id="sub-opening-hand"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/id="sub-opening-facing"[^>]*aria-pressed="false"/);
  });

  it('modo "ajustar grade" mostra o alinhamento; "preencher célula" não mostra', () => {
    expect(render(base)).not.toContain('id="sub-opening-align"');
    expect(render({ ...base, fit: 'grid' })).toContain('id="sub-opening-align"');
  });

  it('janela usa o rótulo de janela no cabeçalho de tipo', () => {
    expect(render({ ...base, tipo: 'window' })).toContain(t('pt', 'prb_place_window'));
  });
});
