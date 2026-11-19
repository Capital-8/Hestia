import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OPENING_FAMILIES, openingOptionSupport, type OpeningFamilyId } from '@hestia/model';
import { leavesChoicesFor, newOpeningTypeFromFamily } from '../openingTypeForm.ts';
import { OpeningTypeSections } from './OpeningTypeSections.tsx';
import { OPENING_COMPONENTS, componentToShow, visibleComponents, type OpeningComponentId } from './components.ts';
import { fechamentoComLado, retornoNoLado } from './panels/sharedRows.tsx';

// As miniaturas leem o projeto pelo controlador; no render em string, um projeto vazio em memória basta.
vi.mock('../../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

const ids = (kind: 'door' | 'window', family: OpeningFamilyId): OpeningComponentId[] => visibleComponents(kind, family).map((c) => c.id);

describe('registro de componentes: visibilidade por tipo e família', () => {
  it('portas: giro, dupla, correr e vão livre', () => {
    expect(ids('door', 'door_swing')).toEqual(['overview', 'shape', 'composition', 'frame', 'leaf', 'profile', 'casing', 'glass', 'outer', 'inner', 'wall', 'plan', 'data']);
    expect(ids('door', 'door_double')).toEqual(['overview', 'shape', 'composition', 'frame', 'leaf', 'profile', 'casing', 'glass', 'outer', 'inner', 'wall', 'plan', 'data']);
    expect(ids('door', 'door_sliding')).toEqual(['overview', 'shape', 'composition', 'frame', 'leaf', 'profile', 'casing', 'glass', 'outer', 'inner', 'wall', 'plan', 'data']);
    // Vão livre: sem batente nem folha.
    expect(ids('door', 'door_void')).toEqual(['overview', 'shape', 'composition', 'casing', 'outer', 'inner', 'wall', 'plan', 'data']);
  });

  it('janelas: abrir, correr, maxim-ar, fixa e vão livre', () => {
    const base = ['overview', 'shape', 'composition', 'frame', 'sashes', 'glazing', 'profile', 'casing', 'glass', 'outer', 'inner', 'wall', 'plan', 'data'];
    expect(ids('window', 'window_hinged')).toEqual(base);
    expect(ids('window', 'window_sliding')).toEqual(base);
    expect(ids('window', 'window_casement')).toEqual(base);
    expect(ids('window', 'window_fixed')).toEqual(base);
    expect(ids('window', 'window_void')).toEqual(['overview', 'shape', 'composition', 'casing', 'outer', 'inner', 'wall', 'plan', 'data']);
  });

  it('componentes de porta nunca aparecem em janela e vice-versa', () => {
    for (const f of OPENING_FAMILIES) {
      const lista = ids(f.kind, f.id);
      expect(lista.includes('leaf'), f.id).toBe(f.kind === 'door' && lista.includes('leaf'));
      expect(lista.includes('sashes') || lista.includes('glazing'), f.id).toBe(f.kind === 'window' && (lista.includes('sashes') || lista.includes('glazing')));
    }
    expect(ids('door', 'door_swing')).not.toContain('sashes');
    expect(ids('window', 'window_hinged')).not.toContain('leaf');
  });

  it('o componente lembrado só vale se estiver na lista da família', () => {
    expect(componentToShow('door', 'door_void', 'leaf')).toBe('overview');
    expect(componentToShow('door', 'door_swing', 'leaf')).toBe('leaf');
    expect(componentToShow('window', 'window_fixed', 'plan')).toBe('plan');
  });

  it('todo componente tem rótulo em pt e en', async () => {
    const { I18N } = await import('../../../editor/i18n.ts');
    for (const c of OPENING_COMPONENTS) {
      expect(I18N.pt[c.labelKey], c.id).toBeTruthy();
      expect(I18N.en[c.labelKey], c.id).toBeTruthy();
    }
  });
});

describe('nenhum campo sem efeito: o diálogo segue a tabela de suporte da família', () => {
  /** Todos os painéis visíveis da família concatenados (ids dos campos). */
  function htmlDaFamilia(familyId: OpeningFamilyId): string {
    const family = OPENING_FAMILIES.find((f) => f.id === familyId)!;
    const d = newOpeningTypeFromFamily(family);
    return visibleComponents(family.kind, family.id)
      .map((c) =>
        renderToStaticMarkup(
          createElement(OpeningTypeSections, { d, onChange: () => {}, family, leaves: leavesChoicesFor(family), materials: {}, active: c.id }),
        ),
      )
      .join('\n');
  }
  const tem = (html: string, id: string): boolean => html.includes(`id="${id}"`);

  it.each(OPENING_FAMILIES.map((f) => f.id))('%s', (familyId) => {
    const family = OPENING_FAMILIES.find((f) => f.id === familyId)!;
    const sup = openingOptionSupport(familyId);
    const html = htmlDaFamilia(familyId);
    const porta = family.kind === 'door';
    expect(tem(html, 'op-handle')).toBe(porta && sup.handle);
    expect(tem(html, 'op-leaf')).toBe(porta && sup.leafStyle);
    for (const id of ['op-a2', 'op-a3', 'op-swing', 'op-swing-style']) expect(tem(html, id), id).toBe(sup.angle);
    expect(tem(html, 'op-grid-c')).toBe(!porta && sup.grid);
    expect(tem(html, 'op-transom')).toBe(sup.transom);
    expect(tem(html, 'op-side-left')).toBe(sup.sidelights);
    expect(tem(html, 'op-frame')).toBe(sup.frame);
    expect(tem(html, 'op-fw')).toBe(sup.frame);
    expect(tem(html, 'op-lt')).toBe(sup.leafThickness);
    expect(tem(html, 'op-gt')).toBe(sup.glassKind);
    expect(tem(html, 'ot-ac-al')).toBe(sup.casing);
    expect(tem(html, 'ot-ac-sb')).toBe(sup.sillBoard);
    expect(tem(html, 'ot-ac-vg')).toBe(sup.lintel);
    expect(tem(html, 'ot-ac-cv')).toBe(sup.sillBeam);
  });

  it('casos medidos: maçaneta só em giro/dupla; ângulos e arco só em quem gira; grade só em janela', () => {
    expect(OPENING_FAMILIES.filter((f) => openingOptionSupport(f.id).handle).map((f) => f.id)).toEqual(['door_swing', 'door_double']);
    for (const id of ['door_sliding', 'door_void', 'window_fixed', 'window_void', 'window_sliding'] as const) {
      expect(openingOptionSupport(id).angle, id).toBe(false);
    }
    for (const f of OPENING_FAMILIES.filter((x) => x.kind === 'door')) expect(openingOptionSupport(f.id).grid, f.id).toBe(false);
    // Vão livre: sem estilo da folha, espessura da folha nem bandeiras.
    for (const id of ['door_void', 'window_void'] as const) {
      const s = openingOptionSupport(id);
      expect([s.leafStyle, s.leafThickness, s.transom, s.sidelights, s.grid]).toEqual([false, false, false, false, false]);
    }
  });
});

describe('retorno do acabamento por lado', () => {
  it('lê e compõe o fechamento', () => {
    expect(retornoNoLado('inherit', 'exterior')).toBeNull();
    expect(retornoNoLado('both', 'interior')).toBe(true);
    expect(retornoNoLado('exterior', 'interior')).toBe(false);
    expect(fechamentoComLado('inherit', 'exterior', true)).toBe('exterior');
    expect(fechamentoComLado('exterior', 'interior', true)).toBe('both');
    expect(fechamentoComLado('both', 'exterior', false)).toBe('interior');
    expect(fechamentoComLado('exterior', 'exterior', false)).toBe('none');
  });
});
