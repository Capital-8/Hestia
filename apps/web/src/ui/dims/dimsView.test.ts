import { describe, expect, it } from 'vitest';
import { defaultUnits, formatQuantity } from '@hestia/model';
import type { DimEnd, TempDim } from '@hestia/tools';
import { dimAcionavel, dimText, gripOf, nextRef, podeConverter, providerOf, refLabel, viewOfDim } from './dimsView.ts';

const end = (slot: string, current: DimEnd['current'], options: DimEnd['options'], x = 0): DimEnd => ({ at: { x, y: 0 }, slot, kind: 'wall', current, options });
const dim = (over: Partial<TempDim> = {}): TempDim => ({
  key: 'opening:d1:left',
  a: { x: 0, y: 0 },
  b: { x: 2, y: 0 },
  offset: 0.3,
  value: 2,
  ends: [end('wallLeft', 'finish', ['axis', 'finish', 'coreCenter', 'coreFace']), end('openLeft', 'frame', ['center', 'clear', 'frame', 'casing'], 2)],
  ...over,
});
const toScreen = (p: { x: number; y: number }) => ({ x: p.x * 100, y: -p.y * 100 });
const fmt = (q: Parameters<typeof formatQuantity>[1], si: number, o?: Parameters<typeof formatQuantity>[3]): string => formatQuantity(defaultUnits(), q, si, o);

describe('dimsView', () => {
  it('clicar 4 vezes volta à referência original', () => {
    const opts = ['axis', 'finish', 'coreCenter', 'coreFace'] as const;
    let r: (typeof opts)[number] = 'finish';
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      r = nextRef(opts, r) as typeof r;
      seen.push(r);
    }
    expect(seen).toEqual(['coreCenter', 'coreFace', 'axis', 'finish']);
  });

  it('referência fora das opções recomeça da primeira? (cai na segunda: índice -1 + 1 = 0)', () => {
    expect(nextRef(['axis', 'finish'], 'casing')).toBe('axis');
  });

  it('rótulos por extenso', () => {
    expect(refLabel('axis')).toBe('Eixo');
    expect(refLabel('finish')).toBe('Face acabada');
    expect(refLabel('coreCenter')).toBe('Eixo do núcleo');
    expect(refLabel('coreFace')).toBe('Face do núcleo');
    expect(refLabel('center')).toBe('Centro');
    expect(refLabel('clear')).toBe('Vão livre');
    expect(refLabel('frame')).toBe('Vão externo do batente');
    expect(refLabel('casing')).toBe('Com alizar');
  });

  it('chave de override = provedor:ponta', () => {
    const d = dim();
    expect(providerOf(d)).toBe('opening');
    const g = gripOf(d, d.ends[0], toScreen);
    expect(g.overrideKey).toBe('opening:wallLeft');
    expect(g.next).toBe('coreCenter');
    expect(g.title).toContain('Face acabada');
  });

  it('geometria de tela, edição e destaque de erro', () => {
    const v = viewOfDim(dim({ edit: () => ({ commands: [] }) }), toScreen, 0.01, 'opening:d1:left');
    expect(v.editable).toBe(true);
    expect(v.invalid).toBe(true);
    expect(v.line[0].x).toBeCloseTo(0, 6);
    expect(v.line[1].x).toBeCloseTo(200, 6);
    expect(v.extensions).toHaveLength(2);
    expect(v.ticks).toHaveLength(2);
    expect(v.grips).toHaveLength(2);
    expect(viewOfDim(dim(), toScreen, 0.01, null).editable).toBe(false);
    expect(viewOfDim(dim({ tone: 'invalid' }), toScreen, 0.01, null).invalid).toBe(true);
  });

  it('texto da cota: valor principal sem unidade e medida informativa com unidade', () => {
    expect(dimText(dim(), fmt)).toBe('2');
    const comAngulo = dim({ secondary: { quantity: 'angle', value: Math.PI / 6 } });
    expect(dimText(comAngulo, fmt)).toBe('2 · 30°');
    // Uma cota de ângulo (principal) leva o símbolo para não se confundir com comprimento.
    expect(dimText(dim({ quantity: 'angle', value: Math.PI / 2 }), fmt)).toBe('90°');
  });

  it('rascunho de ferramenta (sem `edit`) não é acionável; a cota editável é', () => {
    expect(dimAcionavel(dim())).toBe(false);
    expect(dimAcionavel(dim({ edit: () => ({ commands: [] }) }))).toBe(true);
  });

  it('ponta com uma só referência não ganha alça (C03: cobria as alças de vértice do contorno)', () => {
    const d = dim({ ends: [end('wallLeft', 'axis', ['axis']), end('openLeft', 'frame', ['center', 'clear', 'frame', 'casing'], 2)] });
    expect(viewOfDim(d, toScreen, 0.01, null).grips.map((g) => g.slot)).toEqual(['openLeft']);
    const only = dim({ ends: [end('a', 'axis', ['axis']), end('b', 'axis', ['axis'], 2)] });
    expect(viewOfDim(only, toScreen, 0.01, null).grips).toEqual([]);
  });

  it('o botão "I" só converte cota dinâmica de elemento; o rascunho da Cota e a cota permanente não o oferecem', () => {
    expect(podeConverter(dim())).toBe(true);
    // O "I" sob o cursor engolia o clique do 2º ponto e criava a cota sozinha, sem a posição final.
    expect(podeConverter(dim({ key: 'wall:draft:length', conversivel: false }))).toBe(false);
    expect(podeConverter(dim({ key: 'dimension:d1:a' }))).toBe(false);
  });
});
