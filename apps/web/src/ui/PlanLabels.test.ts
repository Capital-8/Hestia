import { describe, expect, it } from 'vitest';
import type { Viewport } from '@hestia/render';
import { LOD_MIN_PX, MARGEM_ROTULO_PX, rotuloVisivelNaVista, transformDoRotulo } from './PlanLabels.tsx';

const v: Viewport = { cx: 0, cy: 0, zoom: 60, width: 400, height: 300 };
const noCentro = { at: { x: 0, y: 0 }, text: 'Parede' };

describe('LOD e culling dos rótulos da planta', () => {
  it('mostra o rótulo dentro da vista e esconde o que está fora, com a margem', () => {
    expect(rotuloVisivelNaVista(noCentro, v)).toBe(true);
    // 10 m à direita do centro: x = 200 + 600 = 800 px, fora da vista e da margem.
    expect(rotuloVisivelNaVista({ ...noCentro, at: { x: 10, y: 0 } }, v)).toBe(false);
    // Logo além da borda, mas dentro da margem: continua montado (evita o "pop" ao arrastar).
    const logoAlem = { ...noCentro, at: { x: (v.width / 2 + 10) / v.zoom, y: 0 } };
    expect(rotuloVisivelNaVista(logoAlem, v)).toBe(true);
    expect(rotuloVisivelNaVista({ ...noCentro, at: { x: (v.width / 2 + MARGEM_ROTULO_PX + 120) / v.zoom, y: 0 } }, v)).toBe(false);
  });

  it('LOD: texto abaixo do corpo mínimo sai; a cota de 3 px do zoom 12 continua', () => {
    expect(rotuloVisivelNaVista({ ...noCentro, fontPx: LOD_MIN_PX - 0.1 }, v)).toBe(false);
    expect(rotuloVisivelNaVista({ ...noCentro, fontPx: 3, center: true }, v)).toBe(true);
  });

  it('máscara de texto é medida pelo polígono: aparece se alguma parte toca a vista', () => {
    const grande = { at: { x: 0, y: 0 }, text: '', maskBoundary: [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 100 }, { x: -100, y: 100 }] };
    expect(rotuloVisivelNaVista(grande, v)).toBe(true);
    const longe = { ...grande, maskBoundary: grande.maskBoundary.map((p) => ({ x: p.x + 1000, y: p.y })) };
    expect(rotuloVisivelNaVista(longe, v)).toBe(false);
  });
});

describe('posicionamento dos rótulos por transform', () => {
  it('usa translate3d com a posição fracionária e mantém a ancoragem/rotação do papel', () => {
    const cota = { at: { x: 0, y: 0 }, text: '4,00 m', fontPx: 11, center: true, rotation: 30 };
    expect(transformDoRotulo(cota, 12.345, 67.89)).toBe('translate3d(12.345px, 67.89px, 0) translate(-50%, -50%) rotate(-30deg)');
  });

  it('rótulo não centrado ancora pela margem do alinhamento', () => {
    const etiqueta = { at: { x: 0, y: 0 }, text: 'P1', fontPx: 9, align: 'right' as const };
    expect(transformDoRotulo(etiqueta, 1, 2)).toBe('translate3d(1px, 2px, 0) translate(-100%, -50%)');
  });

  it('rótulo de interface (sem fontPx) mantém o translate(0, -100%) do CSS', () => {
    expect(transformDoRotulo({ at: { x: 0, y: 0 }, text: 'A' }, 3, 4)).toBe('translate3d(3px, 4px, 0) translate(0, -100%)');
  });
});
