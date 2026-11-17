import { describe, expect, it } from 'vitest';
import type { AvisoMassaProjeto } from '@hestia/engine';
import { projetoComMassas } from '@hestia/engine/src/fixtureMassa.ts';
import { SEGMENTO_MINIMO_MAXIMO, TOLERANCIA_MAXIMA_PAREDE, motivoNaoGerarParedes, notaDaFaceInclinada, tiposDeParede } from './massParedesForm.ts';

const formulario = (over: Partial<Parameters<typeof motivoNaoGerarParedes>[0]> = {}) => ({
  niveis: ['lv_2'],
  typeId: 'wt_alv14',
  tolerancia: 0.05,
  segmentoMinimo: 0.4,
  ...over,
});

const aviso = (massaId: string, codigo: number): AvisoMassaProjeto => ({ massaId, codigo, copia: 0, indice: 0, medido: 6, limite: 5, x: 0, y: 0, z: 0 });

describe('diálogo Paredes da massa: lógica pura do formulário (ficha D2)', () => {
  it('os tipos de parede vêm do projeto, na ordem dele', () => {
    const p = projetoComMassas();
    expect(tiposDeParede(p).map((x) => x.id)).toEqual(Object.keys(p.wallTypes));
  });

  it('Gerar fica desligado sem massa (motivo "Selecione uma massa.")', () => {
    expect(motivoNaoGerarParedes(formulario(), false)).toBe('ui_mw_no_mass');
  });

  it('Gerar fica desligado sem nível, sem tipo, com tolerância ou segmento mínimo fora do intervalo', () => {
    expect(motivoNaoGerarParedes(formulario({ niveis: [] }), true)).toBe('ui_mw_no_levels');
    expect(motivoNaoGerarParedes(formulario({ typeId: '' }), true)).toBe('ui_mw_no_type');
    expect(motivoNaoGerarParedes(formulario({ tolerancia: -0.001 }), true)).toBe('ui_mw_bad_tol');
    expect(motivoNaoGerarParedes(formulario({ tolerancia: TOLERANCIA_MAXIMA_PAREDE + 0.001 }), true)).toBe('ui_mw_bad_tol');
    expect(motivoNaoGerarParedes(formulario({ tolerancia: Number.NaN }), true)).toBe('ui_mw_bad_tol');
    expect(motivoNaoGerarParedes(formulario({ segmentoMinimo: 0 }), true)).toBe('ui_mw_bad_min');
    expect(motivoNaoGerarParedes(formulario({ segmentoMinimo: SEGMENTO_MINIMO_MAXIMO + 0.001 }), true)).toBe('ui_mw_bad_min');
    expect(motivoNaoGerarParedes(formulario({ segmentoMinimo: Number.POSITIVE_INFINITY }), true)).toBe('ui_mw_bad_min');
  });

  it('com massa e valores válidos, Gerar está liberado; tolerância zero também vale', () => {
    expect(motivoNaoGerarParedes(formulario(), true)).toBeNull();
    expect(motivoNaoGerarParedes(formulario({ tolerancia: 0 }), true)).toBeNull();
  });

  it('a nota de face inclinada aparece quando o kernel acusa o aviso 4 para ESTA massa', () => {
    expect(notaDaFaceInclinada([aviso('m3', 4)], 'm3')).toBe('ui_mw_face_note');
  });

  it('sem o aviso 4, ou com o aviso 4 de outra massa, ou de outro código, não há nota', () => {
    expect(notaDaFaceInclinada([], 'm3')).toBeNull();
    expect(notaDaFaceInclinada([aviso('m1', 4)], 'm3')).toBeNull();
    expect(notaDaFaceInclinada([aviso('m3', 2)], 'm3')).toBeNull();
    expect(notaDaFaceInclinada(null, 'm3')).toBeNull();
  });
});
