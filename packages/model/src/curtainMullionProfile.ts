// Seção do montante (decisão 0056, §4.2): contorno no plano da seção, área pela fórmula de cada forma, campos que cada
// forma pede no editor e completagem ao trocar de forma. TS puro; a prévia 2D fica na UI e a geometria 3D, no Rust.
//
// Convenção (§4.2): X corre ao longo da face (largura), Y aponta para fora (profundidade), origem no centro do perfil
// (antes do `offset`). Escolhas onde o ADR é ambíguo:
// - `corner`: chapa fechada de espessura `thickness` (caixa oca de largura × profundidade). Área = w·d − (w−2t)(d−2t).
// - `trapezoid`: a face externa (Y positivo) tem `width`; a interna (Y negativo) tem `widthBack`.
// - `round`: diâmetro `width`, profundidade igual à largura; contorno com `LADOS_REDONDO` lados.

import type { MullionProfile, MullionShape } from './wallCurtainTypes.ts';

/** Ponto (X ao longo da face, Y para fora), em metros. */
export type PontoPerfil = readonly [number, number];
/** Anel fechado: vértices em ordem, sem repetir o primeiro. */
export type AnelPerfil = PontoPerfil[];

/** Número de lados do contorno do perfil redondo. */
export const LADOS_REDONDO = 96;
/** Espessura dada ao trocar a forma para L ou canto, quando o perfil não tinha uma (m). */
export const ESPESSURA_PADRAO_MONTANTE = 0.004;

/** Campos de seção que a forma pede (além de largura e forma, sempre mostradas). */
export interface CamposDaForma {
  profundidade: boolean;
  espessura: boolean;
  larguraFaceInterna: boolean;
}

/** Quais campos o editor mostra para a forma (o resto fica oculto). */
export function camposDaForma(forma: MullionShape): CamposDaForma {
  return {
    profundidade: forma !== 'round',
    espessura: forma === 'L' || forma === 'corner',
    larguraFaceInterna: forma === 'trapezoid',
  };
}

/**
 * Completa a seção ao trocar de forma: o parâmetro que a nova forma pede recebe um valor válido, e os que ela não usa
 * saem. Redondo: profundidade = largura (§4.2). Trapézio sem face interna: 60% da largura externa.
 */
export function perfilParaForma(perfil: MullionProfile, forma: MullionShape): MullionProfile {
  const base: MullionProfile = { shape: forma, width: perfil.width, depth: perfil.depth };
  if (forma === 'round') return { ...base, depth: perfil.width };
  if (forma === 'L' || forma === 'corner') return { ...base, thickness: perfil.thickness ?? ESPESSURA_PADRAO_MONTANTE };
  if (forma === 'trapezoid') return { ...base, widthBack: perfil.widthBack ?? perfil.width * 0.6 };
  return base;
}

function anelRetangular(x: number, y: number): AnelPerfil {
  return [
    [-x, -y],
    [x, -y],
    [x, y],
    [-x, y],
  ];
}

/**
 * Contorno do perfil: o primeiro anel é o externo; os demais são furos (só o canto tem furo). Entrada com medidas
 * inválidas (zero, negativas ou sem o parâmetro da forma) gera um contorno degenerado: quem chama valida antes
 * (`montanteIssue`).
 */
export function contornoMontante(perfil: MullionProfile): AnelPerfil[] {
  const w = perfil.width;
  const d = perfil.shape === 'round' ? perfil.width : perfil.depth;
  const x = w / 2;
  const y = d / 2;
  switch (perfil.shape) {
    case 'round': {
      const r = w / 2;
      const anel: AnelPerfil = [];
      for (let i = 0; i < LADOS_REDONDO; i += 1) {
        const a = (2 * Math.PI * i) / LADOS_REDONDO;
        anel.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return [anel];
    }
    case 'L': {
      const t = perfil.thickness ?? 0;
      return [
        [
          [-x, -y],
          [x, -y],
          [x, -y + t],
          [-x + t, -y + t],
          [-x + t, y],
          [-x, y],
        ],
      ];
    }
    case 'trapezoid': {
      const wb = perfil.widthBack ?? w;
      return [
        [
          [-x, y],
          [x, y],
          [wb / 2, -y],
          [-wb / 2, -y],
        ],
      ];
    }
    case 'corner': {
      const t = perfil.thickness ?? 0;
      const xi = x - t;
      const yi = y - t;
      const furo: AnelPerfil = [
        [-xi, -yi],
        [-xi, yi],
        [xi, yi],
        [xi, -yi],
      ];
      return [anelRetangular(x, y), furo];
    }
    default:
      return [anelRetangular(x, y)];
  }
}

/** Área de um anel fechado pela fórmula de Gauss (valor absoluto, em metros quadrados). */
function areaDoAnel(anel: AnelPerfil): number {
  let soma = 0;
  for (let i = 0; i < anel.length; i += 1) {
    const [x1, y1] = anel[i]!;
    const [x2, y2] = anel[(i + 1) % anel.length]!;
    soma += x1 * y2 - x2 * y1;
  }
  return Math.abs(soma) / 2;
}

/** Área líquida da seção (em metros quadrados): anel externo menos os furos. */
export function areaMontante(aneis: AnelPerfil[]): number {
  return aneis.reduce((total, anel, i) => total + (i === 0 ? 1 : -1) * areaDoAnel(anel), 0);
}

/** Caixa envolvente do contorno (para escalar a prévia). */
export function caixaMontante(aneis: AnelPerfil[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const anel of aneis) {
    for (const [x, y] of anel) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY };
}
