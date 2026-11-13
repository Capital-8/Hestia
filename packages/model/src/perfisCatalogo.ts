// Catálogo de perfis prontos (A.2): dados, sem lógica de geometria. É semente de tipos: o usuário cria tipos próprios com
// qualquer `PerfilForma`. Medidas de tabela em milímetros, convertidas para metros na montagem.

import type { PerfilForma } from './estrTypes.ts';
import type { Id } from './types.ts';

export type FamiliaCatalogo = 'concreto' | 'madeira' | 'aco';

export interface PresetPerfil {
  id: Id;
  /** Nome técnico (igual em todos os idiomas): "IPE 200", "15 × 30", "L 50 × 5". */
  nome: string;
  familia: FamiliaCatalogo;
  perfil: PerfilForma;
}

const m = (mm: number): number => mm / 1000;

const ret = (familia: FamiliaCatalogo, prefixo: string, b: number, h: number): PresetPerfil => ({
  id: `${prefixo}_${b}x${h}`,
  nome: `${b} × ${h}`,
  familia,
  perfil: { forma: 'retangular', b: m(b * 10), h: m(h * 10) },
});

const circ = (d: number): PresetPerfil => ({ id: `conc_c${d}`, nome: `Ø ${d}`, familia: 'concreto', perfil: { forma: 'circular', d: m(d * 10) } });

/** Perfil I, U ou L laminado: `[rótulo, h, b, tw, tf]` em milímetros. */
type LinhaI = readonly [number, number, number, number, number];

const lam = (serie: string, forma: 'I' | 'U', linhas: readonly LinhaI[]): PresetPerfil[] =>
  linhas.map(([rotulo, h, b, tw, tf]) => ({
    id: `aco_${serie.toLowerCase()}${rotulo}`,
    nome: `${serie} ${rotulo}`,
    familia: 'aco',
    perfil: { forma, b: m(b), h: m(h), tf: m(tf), tw: m(tw) },
  }));

const IPE: readonly LinhaI[] = [
  [100, 100, 55, 4.1, 5.7], [120, 120, 64, 4.4, 6.3], [140, 140, 73, 4.7, 6.9], [160, 160, 82, 5, 7.4], [180, 180, 91, 5.3, 8],
  [200, 200, 100, 5.6, 8.5], [220, 220, 110, 5.9, 9.2], [240, 240, 120, 6.2, 9.8], [270, 270, 135, 6.6, 10.2], [300, 300, 150, 7.1, 10.7],
  [330, 330, 160, 7.5, 11.5], [360, 360, 170, 8, 12.7], [400, 400, 180, 8.6, 13.5],
];
const HEA: readonly LinhaI[] = [
  [100, 96, 100, 5, 8], [120, 114, 120, 5, 8], [140, 133, 140, 5.5, 8.5], [160, 152, 160, 6, 9], [180, 171, 180, 6, 9.5], [200, 190, 200, 6.5, 10],
  [220, 210, 220, 7, 11], [240, 230, 240, 7.5, 12], [260, 250, 260, 7.5, 12.5], [280, 270, 280, 8, 13], [300, 290, 300, 8.5, 14],
];
const HEB: readonly LinhaI[] = [
  [100, 100, 100, 6, 10], [120, 120, 120, 6.5, 11], [140, 140, 140, 7, 12], [160, 160, 160, 8, 13], [180, 180, 180, 8.5, 14], [200, 200, 200, 9, 15],
  [220, 220, 220, 9.5, 16], [240, 240, 240, 10, 17], [260, 260, 260, 10, 17.5], [280, 280, 280, 10.5, 18], [300, 300, 300, 11, 19],
];
const UPN: readonly LinhaI[] = [
  [80, 80, 45, 6, 8], [100, 100, 50, 6, 8.5], [120, 120, 55, 7, 9], [140, 140, 60, 7, 10], [160, 160, 65, 7.5, 10.5], [180, 180, 70, 8, 11],
  [200, 200, 75, 8.5, 11.5], [220, 220, 80, 9, 12.5], [240, 240, 85, 9.5, 13], [260, 260, 90, 10, 14], [280, 280, 95, 10, 15], [300, 300, 100, 10, 16],
];

/** Cantoneira de abas iguais: `[lado, espessura]` em milímetros. */
const CANTONEIRAS: ReadonlyArray<readonly [number, number]> = [[50, 5], [60, 6], [70, 7], [80, 8], [100, 10], [120, 12], [150, 15]];
/** Tubo retangular: `[b, h, t]` em milímetros (quadrado quando b = h). */
const TUBOS_RETANGULARES: ReadonlyArray<readonly [number, number, number]> = [[50, 50, 3], [60, 60, 3], [80, 80, 4], [100, 100, 5], [120, 120, 5], [150, 150, 6], [200, 200, 8], [100, 50, 4], [150, 100, 5], [200, 100, 6]];
/** Tubo circular: `[d, t]` em milímetros. */
const TUBOS_CIRCULARES: ReadonlyArray<readonly [number, number]> = [[60.3, 3.6], [88.9, 4], [114.3, 4.5], [168.3, 5], [219.1, 6.3]];

export const PERFIS_CATALOGO: readonly PresetPerfil[] = [
  ...([[15, 30], [20, 20], [20, 30], [20, 40], [25, 25], [25, 50], [30, 30], [30, 60], [40, 40]] as const).map(([b, h]) => ret('concreto', 'conc', b, h)),
  circ(30),
  circ(40),
  circ(50),
  ...([[6, 12], [6, 16], [6, 20], [8, 8], [10, 10], [12, 12]] as const).map(([b, h]) => ret('madeira', 'mad', b, h)),
  ...lam('IPE', 'I', IPE),
  ...lam('HEA', 'I', HEA),
  ...lam('HEB', 'I', HEB),
  ...lam('UPN', 'U', UPN),
  ...CANTONEIRAS.map(([l, t]): PresetPerfil => ({ id: `aco_l${l}x${t}`, nome: `L ${l} × ${t}`, familia: 'aco', perfil: { forma: 'L', b: m(l), h: m(l), tf: m(t) } })),
  ...TUBOS_RETANGULARES.map(([b, h, t]): PresetPerfil => ({ id: `aco_tr${b}x${h}x${t}`, nome: `Tubo ${b} × ${h} × ${t}`, familia: 'aco', perfil: { forma: 'tuboRetangular', b: m(b), h: m(h), t: m(t) } })),
  ...TUBOS_CIRCULARES.map(([d, t]): PresetPerfil => ({ id: `aco_tc${d}x${t}`, nome: `Tubo Ø ${d} × ${t}`, familia: 'aco', perfil: { forma: 'tuboCircular', d: m(d), t: m(t) } })),
];

/** Preset do catálogo pelo id, ou undefined. */
export const presetPerfil = (id: Id): PresetPerfil | undefined => PERFIS_CATALOGO.find((p) => p.id === id);
