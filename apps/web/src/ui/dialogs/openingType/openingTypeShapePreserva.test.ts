import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPENING_TYPES, openingFamilyOf, type OpeningShapeKind, type OpeningType } from '@hestia/model';
import { leavesChoicesFor } from '../openingTypeForm.ts';
import { visibleComponents } from './components.ts';
import { OpeningTypeSections } from './OpeningTypeSections.tsx';
import { withShapeKind, withShapeNumber } from './openingTypeShape.ts';

vi.mock('../../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

/*
 * docs/estudo-esquadrias/37: escolher a forma só escreve o campo `shape`; nenhum outro campo do tipo (estilo da folha, painel,
 * bandeira, ferragens, folhas, abrir/correr) é zerado ou trocado, e a aba "Folha" continua listando todos os estilos de folha.
 */
const FORMAS: OpeningShapeKind[] = ['round', 'segmental', 'pointed', 'circle'];
const semForma = (d: OpeningType): OpeningType => {
  const { shape: _s, ...resto } = d;
  void _s;
  return resto;
};

function aba(d: OpeningType, active: 'leaf' | 'shape'): string {
  const family = openingFamilyOf(d, 'pt')!;
  const html = renderToStaticMarkup(createElement(OpeningTypeSections, { d, onChange: () => {}, family, leaves: leavesChoicesFor(family), materials: {}, active }));
  return html.slice(html.indexOf('<section')); // só o painel (a lista de componentes mostra a forma escolhida)
}

/** Rótulos e opções do painel (as miniaturas desenham a forma, então o SVG delas muda de propósito). */
const controles = (html: string): string[] => [...html.matchAll(/<(?:label|option)[^>]*>([^<]*)</g)].map((m) => m[1] ?? '');

describe('escolher a forma do vão não mexe nos outros campos do tipo', { timeout: 60000 }, () => {
  it('nos 162 tipos: só `shape` muda, para cada forma, e voltar a Retangular devolve o tipo original', () => {
    for (const t of DEFAULT_OPENING_TYPES) {
      const base = semForma(t);
      for (const k of FORMAS) {
        const d = withShapeKind(base, k);
        expect(semForma(d), `${t.id}/${k}`).toEqual(base);
        expect(d.shape?.kind).toBe(k);
        expect(withShapeNumber(d, 'rise', 0.2).shape?.kind).toBe(k);
        expect(withShapeKind(d, 'rect')).toEqual(base);
      }
    }
  });

  it('a aba Folha lista os mesmos estilos de folha com e sem forma (porta)', () => {
    const portas = DEFAULT_OPENING_TYPES.filter((t) => t.kind === 'door' && visibleComponents('door', openingFamilyOf(t, 'pt')?.id ?? null).some((c) => c.id === 'leaf'));
    expect(portas.length).toBeGreaterThan(20);
    let comEstilos = 0;
    for (const t of portas) {
      const sem = aba(semForma(t), 'leaf');
      const com = aba(withShapeKind(semForma(t), 'round'), 'leaf');
      expect(controles(com), t.id).toEqual(controles(sem));
      if (sem.includes('id="op-leaf"')) {
        comEstilos++;
        expect((sem.match(/<option/g) ?? []).length, t.id).toBeGreaterThanOrEqual(5);
      }
    }
    expect(comEstilos).toBeGreaterThan(10);
  });
});