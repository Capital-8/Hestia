import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, type MullionProfile, type MullionType, type Project } from '@hestia/model';
import { t } from '../../editor/i18n.ts';
import { AbaMontantes } from './MontantesTab.tsx';

const tipo = (profile: MullionProfile): MullionType => ({ id: 'mul_t', name: 'Teste', profile, materialId: 'mat_aluminio' });
const comTipos = (...tipos: MullionType[]): Project => {
  const p = createEmptyProject();
  p.mullionTypes = Object.fromEntries(tipos.map((m) => [m.id, m]));
  return p;
};
const render = (p: Project): string => renderToStaticMarkup(createElement(AbaMontantes, { project: p }));
const PT = (chave: Parameters<typeof t>[1]): string => t('pt', chave);

describe('aba Montantes: lista e botões', () => {
  it('lista os tipos do projeto (padrões quando não há mapa gravado) e tem criar, duplicar e excluir', () => {
    const html = render(createEmptyProject());
    expect(html).toContain('Retangular 50 × 100');
    expect(html).toContain(PT('pct_mullion_new'));
    expect(html).toContain(PT('pct_mullion_duplicate'));
    expect(html).toContain(PT('pct_mullion_delete'));
  });

  it('sem nenhum tipo mostra o aviso, sem lançar', () => {
    const p = createEmptyProject();
    p.mullionTypes = {};
    expect(render(p)).toContain(PT('pct_mullion_none'));
  });
});

describe('aba Montantes: só os campos que a forma pede', () => {
  it('retangular: profundidade, sem espessura nem face interna', () => {
    const html = render(comTipos(tipo({ shape: 'rect', width: 0.05, depth: 0.1 })));
    expect(html).toContain(PT('pct_depth'));
    expect(html).not.toContain(PT('pct_mullion_thickness'));
    expect(html).not.toContain(PT('pct_mullion_width_back'));
  });

  it('redondo: diâmetro no lugar da largura e sem profundidade', () => {
    const html = render(comTipos(tipo({ shape: 'round', width: 0.05, depth: 0.05 })));
    expect(html).toContain(PT('pct_mullion_diameter'));
    expect(html).not.toContain(PT('pct_depth'));
  });

  it('L: espessura, sem face interna', () => {
    const html = render(comTipos(tipo({ shape: 'L', width: 0.05, depth: 0.1, thickness: 0.004 })));
    expect(html).toContain(PT('pct_mullion_thickness'));
    expect(html).not.toContain(PT('pct_mullion_width_back'));
  });

  it('trapézio: face interna, sem espessura', () => {
    const html = render(comTipos(tipo({ shape: 'trapezoid', width: 0.05, depth: 0.1, widthBack: 0.03 })));
    expect(html).toContain(PT('pct_mullion_width_back'));
    expect(html).not.toContain(PT('pct_mullion_thickness'));
  });

  it('canto: espessura da chapa, sem face interna', () => {
    const html = render(comTipos(tipo({ shape: 'corner', width: 0.05, depth: 0.1, thickness: 0.004 })));
    expect(html).toContain(PT('pct_mullion_thickness'));
    expect(html).not.toContain(PT('pct_mullion_width_back'));
  });
});

describe('aba Montantes: prévia da seção', () => {
  it('seção válida desenha o SVG com a regra evenodd (canto tem furo)', () => {
    const html = render(comTipos(tipo({ shape: 'corner', width: 0.05, depth: 0.1, thickness: 0.004 })));
    expect(html).toContain('<svg');
    expect(html).toContain(`aria-label="${PT('pct_mullion_section')}"`);
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).not.toContain('role="alert"');
  });

  it('espessura que não cabe na seção não desenha o contorno e mostra o motivo', () => {
    const html = render(comTipos(tipo({ shape: 'corner', width: 0.05, depth: 0.1, thickness: 0.03 })));
    expect(html).not.toContain('<svg');
    expect(html).toContain('role="alert"');
    // A mensagem vem do model (em português, o idioma padrão do comando); o texto exato é de packages/model.
    expect(html).toMatch(/Espessura do montante incompatível com a seção/);
  });
});
