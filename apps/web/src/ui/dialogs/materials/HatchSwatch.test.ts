import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HatchKind } from '@hestia/model';
import { HatchSwatch } from './HatchSwatch.tsx';

const html = (kind: HatchKind): string => renderToStaticMarkup(createElement(HatchSwatch, { kind, label: kind }));
const conta = (markup: string, tag: string): number => (markup.match(new RegExp(`<${tag}`, 'g')) ?? []).length;

describe('miniatura de hachura', () => {
  it('diagonal: retângulo em mm no viewBox e os traços vetoriais', () => {
    const markup = html('diagonal');
    expect(markup).toContain('<svg');
    expect(markup).toContain('viewBox="0 0 14 10"');
    expect(conta(markup, 'polyline')).toBeGreaterThanOrEqual(3);
  });

  it('none: só o retângulo, sem traço', () => {
    const markup = html('none');
    expect(markup).toContain('<rect');
    expect(conta(markup, 'polyline')).toBe(0);
  });

  it('concrete: linhas e a malha de pontos', () => {
    const markup = html('concrete');
    expect(conta(markup, 'polyline')).toBeGreaterThanOrEqual(1);
    expect(conta(markup, 'path')).toBeGreaterThanOrEqual(1);
  });

  it('insulation: o tracejado gera mais trechos que a diagonal', () => {
    expect(conta(html('insulation'), 'polyline')).toBeGreaterThan(conta(html('diagonal'), 'polyline'));
  });

  it('cmu: o bloco de concreto desenha lajotas e juntas em traços', () => {
    expect(conta(html('cmu'), 'polyline')).toBeGreaterThanOrEqual(6);
  });
});
