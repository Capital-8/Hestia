import { describe, expect, it } from 'vitest';
import { loteL1, loteL2, projetoLote } from '@hestia/engine';
import { formatQuantity, unitsOf, type Lot } from '@hestia/model';
import { EDIFICAVEL_TRACO, LOTE_TEXTO_MM, LOTE_TRACO, loteNoPonto, loteOps, loteSelectionOps, lotesDoNivel, lotesNaCaixa, textoDoPapel } from './lote.ts';
import { defaultPaint } from './style.ts';
import { LIGHT } from './types.ts';

const paint = defaultPaint('lot', 50);
const lote = (p: ReturnType<typeof projetoLote>, id: string): Lot => p.elements[id] as Lot;

describe('loteOps: contorno, área edificável e texto dos lados', () => {
  it('L1: contorno tracejado longo com peso de projeção da categoria lot, e edificável tracejada curta', () => {
    const p = projetoLote();
    const o = loteOps(p, lote(p, 'lote_l1'), LIGHT, false, paint, 100);
    expect(o.fills).toHaveLength(0);
    expect(o.strokes).toHaveLength(2);
    const [contorno, edificavel] = o.strokes;
    expect(contorno!.closed).toBe(true);
    expect(contorno!.pts).toHaveLength(4);
    expect(contorno!.dash).toEqual(LOTE_TRACO);
    expect(contorno!.papel).toEqual(paint.proj.papel);
    expect(contorno!.widthPx).toBe(paint.proj.widthPx);
    expect(edificavel!.dash).toEqual(EDIFICAVEL_TRACO);
    expect(edificavel!.dash).not.toEqual(contorno!.dash);
    const xs = edificavel!.pts.map((q) => q.x);
    const ys = edificavel!.pts.map((q) => q.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1.5, 10.5, 5, 27]);
  });

  it('mostrarEdificavel falso: só o contorno', () => {
    const p = projetoLote({ ...loteL1(), mostrarEdificavel: false });
    const o = loteOps(p, lote(p, 'lote_l1'), LIGHT, false, paint, 100);
    expect(o.strokes).toHaveLength(1);
    expect(o.labels).toHaveLength(4);
  });

  it('L1: um texto por lado com papel e comprimento pela unidade do projeto, alinhado ao lado e para fora', () => {
    const p = projetoLote();
    const o = loteOps(p, lote(p, 'lote_l1'), LIGHT, false, paint, 100);
    expect(o.labels.map((l) => l.text)).toEqual(['frente 12,00 m', 'lateral 30,00 m', 'fundo 12,00 m', 'lateral 30,00 m']);
    expect(o.labels.map((l) => l.rotation)).toEqual([0, 90, 0, 90]);
    expect(o.labels[0]!.at).toEqual({ x: 6, y: 0 });
    expect(o.labels[1]!.at).toEqual({ x: 12, y: 15 });
    // Para fora: a frente (y = 0) desvia para y negativo; o lado direito (x = 12), para x positivo.
    const d0 = o.labels[0]!.papel!.desvio!;
    expect([d0.ux, d0.uy]).toEqual([0, 1]);
    expect(o.labels[0]!.papel!.fontMm).toBe(LOTE_TEXTO_MM);
    const d1 = o.labels[1]!.papel!.desvio!;
    expect([d1.ux, d1.uy]).toEqual([1, 0]);
  });

  it('L1 em inglês usa as palavras em inglês; a unidade do projeto vem de formatQuantity', () => {
    const p = projetoLote();
    const o = loteOps(p, lote(p, 'lote_l1'), LIGHT, false, paint, 100, 'en');
    expect(o.labels.map((l) => l.text.split(' ')[0])).toEqual(['front', 'side', 'rear', 'side']);
    expect(o.labels[0]!.text).toBe(`front ${formatQuantity(unitsOf(p), 'length', 12)}`);
    expect(textoDoPapel('de', 'fundo')).toBe('rear');
  });

  it('L2 (em L): 6 lados com texto, contorno de 6 pontos e a edificável com o canto reentrante arredondado', () => {
    const p = projetoLote(loteL2());
    const o = loteOps(p, lote(p, 'lote_l2'), LIGHT, false, paint, 100);
    expect(o.strokes).toHaveLength(2);
    expect(o.strokes[0]!.pts).toHaveLength(6);
    expect(o.strokes[1]!.pts.length).toBeGreaterThan(6);
    expect(o.labels).toHaveLength(6);
    expect(o.labels.map((l) => l.text.split(' ')[1])).toEqual(['20,00', '10,00', '10,00', '10,00', '10,00', '20,00']);
  });

  it('a cor da categoria e a do lote mandam no traço', () => {
    const p = projetoLote({ ...loteL1(), color: '#ff0000' });
    const o = loteOps(p, lote(p, 'lote_l1'), LIGHT, false, paint, 100);
    expect(o.strokes.every((s) => s.color === '#ff0000')).toBe(true);
    const o2 = loteOps(p, lote(p, 'lote_l1'), LIGHT, false, { ...paint, color: '#00ff00' }, 100);
    expect(o2.strokes.every((s) => s.color === '#00ff00')).toBe(true);
  });
});

describe('seleção do lote: só pelo contorno', () => {
  const p = projetoLote();
  const hidden = undefined;

  it('clique perto do contorno seleciona', () => {
    expect(loteNoPonto(p, 'lv_0', hidden, { x: 6, y: 0.05 }, 0.1)).toBe('lote_l1');
    expect(loteNoPonto(p, 'lv_0', hidden, { x: 12.08, y: 10 }, 0.1)).toBe('lote_l1');
    expect(loteNoPonto(p, 'lv_0', hidden, { x: 0, y: 0 }, 0.1)).toBe('lote_l1');
  });

  it('clique no INTERIOR não seleciona (nem no centro, nem a 1 m do contorno)', () => {
    expect(loteNoPonto(p, 'lv_0', hidden, { x: 6, y: 15 }, 0.1)).toBeNull();
    expect(loteNoPonto(p, 'lv_0', hidden, { x: 6, y: 1 }, 0.1)).toBeNull();
    expect(loteNoPonto(p, 'lv_0', hidden, { x: 20, y: 20 }, 0.1)).toBeNull();
  });

  it('lote oculto ou de outro nível não é alvo', () => {
    expect(loteNoPonto(p, 'lv_0', new Set(['lote_l1']), { x: 6, y: 0 }, 0.1)).toBeNull();
    expect(loteNoPonto(p, 'lv_1', hidden, { x: 6, y: 0 }, 0.1)).toBeNull();
    expect(lotesDoNivel(p, 'lv_1')).toEqual([]);
  });

  it('caixa em janela: só se o contorno inteiro está dentro', () => {
    expect(lotesNaCaixa(p, 'lv_0', hidden, { x: -1, y: -1 }, { x: 13, y: 31 })).toEqual(['lote_l1']);
    expect(lotesNaCaixa(p, 'lv_0', hidden, { x: -1, y: -1 }, { x: 13, y: 20 })).toEqual([]);
  });

  it('caixa de cruzamento: toca o contorno seleciona; inteira no interior não seleciona', () => {
    // Da direita para a esquerda é cruzamento.
    expect(lotesNaCaixa(p, 'lv_0', hidden, { x: 14, y: 5 }, { x: 11, y: 8 })).toEqual(['lote_l1']);
    expect(lotesNaCaixa(p, 'lv_0', hidden, { x: 8, y: 20 }, { x: 4, y: 10 })).toEqual([]);
    // Caixa maior que o lote, sem tocar o contorno por dentro? Envolve o lote: o contorno está dentro dela.
    expect(lotesNaCaixa(p, 'lv_0', hidden, { x: 14, y: 32 }, { x: -2, y: -2 })).toEqual(['lote_l1']);
    expect(lotesNaCaixa(p, 'lv_0', hidden, { x: 30, y: 30 }, { x: 20, y: 20 })).toEqual([]);
  });

  it('realce: só o contorno, sem preenchimento', () => {
    const sel = loteSelectionOps(p, 'lv_0', ['lote_l1'], null, LIGHT);
    expect(sel.fills).toHaveLength(0);
    expect(sel.strokes).toHaveLength(1);
    expect(sel.strokes[0]!.color).toBe(LIGHT.select);
    const hov = loteSelectionOps(p, 'lv_0', [], 'lote_l1', LIGHT);
    expect(hov.strokes[0]!.color).toBe(LIGHT.selectHover);
    expect(loteSelectionOps(p, 'lv_0', [], null, LIGHT).strokes).toHaveLength(0);
    expect(loteSelectionOps(p, 'lv_1', ['lote_l1'], null, LIGHT).strokes).toHaveLength(0);
  });
});
