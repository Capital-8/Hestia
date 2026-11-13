// Estrutura: pilar, viga e fundação (docs/estrutura/PLANO.md, A.2 e A.3). Só tipos e constantes; a validação fica em
// perfis.ts e validateEstr.ts, os padrões em column.ts, beam.ts e footing.ts, e a geometria no kernel Rust (A.0 item 2).

import type { Vec2 } from '@hestia/geom';
import type { HatchKind, Id, IfcProperty, Layer } from './types.ts';

/** Vértice de perfil personalizado, em metros, no sistema local do perfil (origem no centro da caixa envolvente). */
export type VerticePerfil = [number, number];

/** Perfil da seção (A.2): união fechada, discriminada por `forma`. Medidas em metros. */
export type PerfilForma =
  | { forma: 'retangular'; b: number; h: number }
  | { forma: 'circular'; d: number }
  | { forma: 'L'; b: number; h: number; tf: number }
  | { forma: 'T'; b: number; h: number; tf: number; tw: number }
  | { forma: 'I'; b: number; h: number; tf: number; tw: number }
  | { forma: 'U'; b: number; h: number; tf: number; tw: number }
  | { forma: 'tuboRetangular'; b: number; h: number; t: number }
  | { forma: 'tuboCircular'; d: number; t: number }
  | { forma: 'personalizado'; anel: VerticePerfil[]; furos?: VerticePerfil[][] };

export type FormaDePerfil = PerfilForma['forma'];
export const FORMAS_DE_PERFIL: readonly FormaDePerfil[] = ['retangular', 'circular', 'L', 'T', 'I', 'U', 'tuboRetangular', 'tuboCircular', 'personalizado'];

export type DisciplinaPilar = 'arquitetonico' | 'estrutural';
export const DISCIPLINAS_PILAR: readonly DisciplinaPilar[] = ['arquitetonico', 'estrutural'];

/** Perfil mínimo do anel de um perfil personalizado e área mínima (metros quadrados), A.2. */
export const PERFIL_LIMITES = { verticesMin: 3, areaMin: 1e-6 } as const;

// ---- Pilar ----------------------------------------------------------------------------------------------------------

export interface ColumnType {
  id: Id;
  name: string;
  code: string;
  description: string;
  disciplina: DisciplinaPilar;
  perfil: PerfilForma;
  /** Material do corpo (concreto, aço, madeira...). */
  materialId: Id;
  /** Só arquitetônico: camadas de acabamento sobre o perfil, de dentro para fora (como `Layer`). */
  camadas?: Layer[];
  /** Custo por metro (informativo). */
  cost: number;
  /** Padrão: o do material. */
  hatch?: HatchKind;
}

export interface Column {
  id: Id;
  kind: 'column';
  typeId: Id;
  levelId: Id;
  /** Espelha o tipo; validado pelos comandos. */
  disciplina: DisciplinaPilar;
  pos: Vec2;
  /** Radianos. */
  rotation: number;
  /** Metros, relativo à cota do nível `levelId`. */
  baseOffset: number;
  /** Topo: nível + offset; se `topLevelId` for null, `height` manda. */
  topLevelId: Id | null;
  topOffset: number;
  height: number | null;
  /** Só arquitetônico: a parede que hospeda o pilar (ele a segue). */
  hostWallId?: Id;
  mark: string;
  comments: string;
  order: number;
  ifcProperties?: IfcProperty[];
}

// ---- Viga -----------------------------------------------------------------------------------------------------------

export interface BeamType {
  id: Id;
  name: string;
  code: string;
  description: string;
  perfil: PerfilForma;
  materialId: Id;
  cost: number;
  hatch?: HatchKind;
}

/** Posição do eixo em relação à seção. */
export type BeamAlinhamento = 'topo' | 'centro' | 'base';
export const ALINHAMENTOS_VIGA: readonly BeamAlinhamento[] = ['topo', 'centro', 'base'];
/** Reservado à treliça; a primeira versão só grava. */
export type BeamExtremidade = 'rigida' | 'articulada';
export const EXTREMIDADES_VIGA: readonly BeamExtremidade[] = ['rigida', 'articulada'];

export interface Beam {
  id: Id;
  kind: 'beam';
  typeId: Id;
  levelId: Id;
  /** Eixo em planta. */
  a: Vec2;
  b: Vec2;
  /** Metros acima da cota do nível; a viga fica inclinada se forem diferentes. */
  zOffsetA: number;
  zOffsetB: number;
  alinhamento: BeamAlinhamento;
  /** Giro da seção em torno do eixo (rad). */
  rotation: number;
  extremidadeA: BeamExtremidade;
  extremidadeB: BeamExtremidade;
  mark: string;
  comments: string;
  order: number;
  ifcProperties?: IfcProperty[];
}

/** Comprimento mínimo do eixo da viga (m): abaixo disso o kernel recusa (A.4.1). */
export const VIGA_COMPRIMENTO_MIN = 0.001;

// ---- Fundação -------------------------------------------------------------------------------------------------------

export type FootingForma = 'sapata' | 'bloco' | 'estaca';
export const FORMAS_DE_FUNDACAO: readonly FootingForma[] = ['sapata', 'bloco', 'estaca'];
export type FootingModo = 'isolada' | 'corrida';

export interface FootingType {
  id: Id;
  name: string;
  code: string;
  description: string;
  modo: FootingModo;
  /** Corrida só `sapata`. */
  forma: FootingForma;
  /** Sapata ou bloco: retangular, circular ou personalizado; estaca: circular ou tuboCircular. */
  base: PerfilForma;
  /** Metros (estaca: comprimento). */
  alturaBase: number;
  /** Opcional, só isolada: pilarete sobre a base. */
  pescoco?: PerfilForma;
  alturaPescoco?: number;
  materialId: Id;
  cost: number;
  hatch?: HatchKind;
}

export interface Footing {
  id: Id;
  kind: 'footing';
  typeId: Id;
  levelId: Id;
  /** Isolada. */
  pos?: Vec2;
  rotation: number;
  /** Corrida (segue a parede se hospedada). */
  a?: Vec2;
  b?: Vec2;
  hostWallId?: Id;
  /** Cota do TOPO da peça relativa ao nível, em metros (negativo = enterrada). */
  topOffset: number;
  mark: string;
  comments: string;
  order: number;
  ifcProperties?: IfcProperty[];
}
