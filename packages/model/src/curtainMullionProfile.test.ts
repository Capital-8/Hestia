import { describe, expect, it } from 'vitest';
import { t } from './i18n.ts';
import { areaMontante, caixaMontante, camposDaForma, contornoMontante, LADOS_REDONDO, perfilParaForma } from './curtainMullionProfile.ts';
import { montanteIssue } from './wallCurtain.ts';
import type { MullionProfile, MullionType } from './wallCurtainTypes.ts';

// Medidas de referência (m): w = 0,05; d = 0,10; t = 0,004; widthBack = 0,03.
const W = 0.05;
const D = 0.1;
const T = 0.004;
const WB = 0.03;

describe('área do perfil pela fórmula de cada forma (decisão 0056, §4.2)', () => {
  it.each<[string, MullionProfile, number]>([
    ['rect: w·d', { shape: 'rect', width: W, depth: D }, W * D],
    ['L: w·d − (w−t)(d−t)', { shape: 'L', width: W, depth: D, thickness: T }, W * D - (W - T) * (D - T)],
    ['trapezoid: ((w+widthBack)/2)·d', { shape: 'trapezoid', width: W, depth: D, widthBack: WB }, ((W + WB) / 2) * D],
    ['corner: w·d − (w−2t)(d−2t)', { shape: 'corner', width: W, depth: D, thickness: T }, W * D - (W - 2 * T) * (D - 2 * T)],
  ])('%s', (_nome, perfil, esperada) => {
    expect(areaMontante(contornoMontante(perfil))).toBeCloseTo(esperada, 12);
  });

  it('redondo: π(w/2)², com o erro do polígono de LADOS_REDONDO lados', () => {
    const area = areaMontante(contornoMontante({ shape: 'round', width: W, depth: W }));
    const exata = Math.PI * (W / 2) ** 2;
    // Polígono regular inscrito: área = (n/2) r² sen(2π/n). Erro relativo ≈ (2π/n)²/6, bem abaixo de 0,1 %.
    expect(Math.abs(area - exata) / exata).toBeLessThan(1e-3);
    expect(contornoMontante({ shape: 'round', width: W, depth: W })[0]).toHaveLength(LADOS_REDONDO);
  });

  it('o canto tem um furo: dois anéis, o externo somado e o interno subtraído', () => {
    const aneis = contornoMontante({ shape: 'corner', width: W, depth: D, thickness: T });
    expect(aneis).toHaveLength(2);
    expect(areaMontante(aneis)).toBeCloseTo(0.001136, 12);
  });

  it('o L é um anel só, com as abas no canto inferior esquerdo da seção (centro na origem)', () => {
    const [anel] = contornoMontante({ shape: 'L', width: W, depth: D, thickness: T });
    expect(anel).toHaveLength(6);
    expect(anel).toContainEqual([-W / 2, -D / 2]);
    expect(anel).toContainEqual([W / 2, -D / 2 + T]);
    expect(anel).toContainEqual([-W / 2 + T, D / 2]);
  });

  it('o trapézio tem a face externa (Y positivo) com a largura total e a interna com widthBack', () => {
    const [anel] = contornoMontante({ shape: 'trapezoid', width: W, depth: D, widthBack: WB });
    expect(anel).toContainEqual([-W / 2, D / 2]);
    expect(anel).toContainEqual([W / 2, D / 2]);
    expect(anel).toContainEqual([WB / 2, -D / 2]);
    expect(anel).toContainEqual([-WB / 2, -D / 2]);
  });

  it('a caixa envolvente cobre a seção centrada na origem', () => {
    const caixa = caixaMontante(contornoMontante({ shape: 'rect', width: W, depth: D }));
    expect(caixa).toEqual({ minX: -W / 2, maxX: W / 2, minY: -D / 2, maxY: D / 2 });
  });
});

describe('campos que cada forma pede (só o necessário aparece no editor)', () => {
  it.each([
    ['rect', { profundidade: true, espessura: false, larguraFaceInterna: false }],
    ['round', { profundidade: false, espessura: false, larguraFaceInterna: false }],
    ['L', { profundidade: true, espessura: true, larguraFaceInterna: false }],
    ['trapezoid', { profundidade: true, espessura: false, larguraFaceInterna: true }],
    ['corner', { profundidade: true, espessura: true, larguraFaceInterna: false }],
  ] as const)('%s', (forma, esperado) => {
    expect(camposDaForma(forma)).toEqual(esperado);
  });
});

describe('troca de forma (perfilParaForma)', () => {
  it('redondo iguala a profundidade à largura', () => {
    expect(perfilParaForma({ shape: 'rect', width: W, depth: D }, 'round')).toEqual({ shape: 'round', width: W, depth: W });
  });

  it('L e canto recebem espessura padrão quando não tinham, e mantêm a que já tinham', () => {
    expect(perfilParaForma({ shape: 'rect', width: W, depth: D }, 'L').thickness).toBe(0.004);
    expect(perfilParaForma({ shape: 'L', width: W, depth: D, thickness: 0.006 }, 'corner').thickness).toBe(0.006);
  });

  it('trapézio ganha widthBack de 60% da largura; a forma antiga não deixa campos sobrando', () => {
    const trap = perfilParaForma({ shape: 'rect', width: W, depth: D }, 'trapezoid');
    expect(trap.widthBack).toBeCloseTo(0.03, 12);
    expect(perfilParaForma({ shape: 'trapezoid', width: W, depth: D, widthBack: WB }, 'rect')).toEqual({ shape: 'rect', width: W, depth: D });
  });
});

describe('validação da seção (montanteIssue): espessura que cabe na seção', () => {
  const mt = (profile: MullionProfile): MullionType => ({ id: 'mul_x', name: 'x', profile, materialId: 'mat_aluminio' });

  it('L: espessura tem de ser menor que a menor dimensão', () => {
    expect(montanteIssue(mt({ shape: 'L', width: W, depth: D, thickness: 0.049 }))).toBeNull();
    expect(montanteIssue(mt({ shape: 'L', width: W, depth: D, thickness: 0.05 }))).toBe(t('pt', 'md_ct_mullion_thickness'));
  });

  it('canto: o dobro da espessura tem de ser menor que a menor dimensão', () => {
    expect(montanteIssue(mt({ shape: 'corner', width: W, depth: D, thickness: 0.02 }))).toBeNull();
    expect(montanteIssue(mt({ shape: 'corner', width: W, depth: D, thickness: 0.025 }))).toBe(t('pt', 'md_ct_mullion_thickness'));
  });

  it('canto sem espessura e trapézio sem face interna são de forma, não de espessura', () => {
    expect(montanteIssue(mt({ shape: 'corner', width: W, depth: D }))).toBe(t('pt', 'md_ct_mullion_profile'));
    expect(montanteIssue(mt({ shape: 'trapezoid', width: W, depth: D }))).toBe(t('pt', 'md_ct_mullion_profile'));
  });
});
