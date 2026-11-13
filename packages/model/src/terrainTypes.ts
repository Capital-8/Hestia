import type { Vec2 } from '@hestia/geom';
import type { Id } from './types.ts';

/** Curva de nível: polilinha com uma cota só. `xy` = x0, y0, x1, y1... (2 ou mais pontos). */
export interface CurvaTerreno {
  z: number;
  xy: number[];
  fechada: boolean;
}

/** Linha de quebra: polilinha com cota por vértice. `xyz` = x0, y0, z0, x1, y1, z1... (2 ou mais pontos). */
export interface QuebraTerreno {
  xyz: number[];
}

export interface Terrain {
  id: Id;
  kind: 'terrain';
  /** Nível em cuja planta o terreno é desenhado. NÃO define cota: todas as cotas abaixo são absolutas no projeto. */
  levelId: Id;
  name: string;
  /** Pontos soltos: x0, y0, z0, x1, y1, z1... */
  pontos: number[];
  curvas: CurvaTerreno[];
  quebras: QuebraTerreno[];
  /** Polígono simples, anti-horário: x0, y0, x1, y1... (3 ou mais pontos). Ausente = envoltória convexa das fontes. */
  borda?: number[];
  /** Equidistância das curvas de nível desenhadas (m). Padrão 1. Mínimo 0,05. */
  intervaloCurvas: number;
  /** Uma curva mestra a cada N curvas. Padrão 5. Inteiro de 1 a 100. */
  mestraCada: number;
  /** Quanto o corpo do terreno desce abaixo do ponto mais baixo (m), no corte e no 3D. Padrão 3. De 0,1 a 100. */
  espessuraBase: number;
  /** Desenha também as curvas do terreno existente (tracejadas) quando há regiões que o alteram. Padrão false. */
  mostrarExistente: boolean;
  /** Linhas de rótulo de curva: x1, y1, x2, y2 por linha. Onde a linha cruza uma curva mestra aparece a cota. */
  linhasRotulo: number[];
  /** Pontos cotados: x, y por ponto. Cada um mostra a cota do terreno proposto ali. */
  pontosCotados: number[];
  materialId?: Id;
  color?: string;
  order: number;
}

export type PapelRegiaoTerreno = 'subdivisao' | 'plataforma' | 'nivelada';

export interface TerrainRegion {
  id: Id;
  kind: 'terrainRegion';
  levelId: Id;
  name: string;
  /** Terreno a que pertence. Apagar o terreno apaga as suas regiões. */
  terrenoId: Id;
  /** Polígono simples, anti-horário, 3 a 512 pontos, sem arcos. */
  contorno: Vec2[];
  papel: PapelRegiaoTerreno;
  /** Só plataforma e nivelada. Cota absoluta do plano no ponto de referência (média dos vértices do contorno). */
  cota: number;
  /** Só plataforma e nivelada. Declividade do plano (0,02 = 2 %). De 0 a 1. Padrão 0. */
  inclinacao: number;
  /** Só plataforma e nivelada. Direção em que o plano SOBE (rad, a partir de +x). */
  direcao: number;
  /** Talude onde o terreno é cortado: metros na horizontal para 1 m na vertical. 0 = borda vertical. De 0 a 10. */
  taludeCorte: number;
  /** Talude onde o terreno é aterrado. Mesma convenção. */
  taludeAterro: number;
  /** Conta como área permeável nos índices do lote. Padrão: true na subdivisão, false na plataforma e na nivelada. */
  permeavel: boolean;
  materialId?: Id;
  color?: string;
  order: number;
}

export const TERRENO_LIMITES = {
  /** Soma de pontos soltos, vértices de curvas, de quebras e de borda de UM terreno. */
  vertices: 200_000,
  curvas: 20_000,
  quebras: 5_000,
  intervaloMin: 0.05,
  mestraMax: 100,
  espessuraMin: 0.1,
  espessuraMax: 100,
  regiaoPontos: 512,
  regioesPorTerreno: 256,
  linhasRotulo: 64,
  pontosCotados: 256,
  taludeMax: 10,
  inclinacaoMax: 1,
  coordMax: 100_000,
  cotaMax: 10_000,
} as const;

/**
 * Operação de `editTerrainFontes` (A.3 item 4). Os índices são posições nas listas no momento da operação: as
 * operações valem em sequência, e remover um item desloca os seguintes.
 */
export type OpTerreno =
  | { op: 'addPonto'; x: number; y: number; z: number }
  | { op: 'movePonto'; i: number; x: number; y: number; z: number }
  | { op: 'removePonto'; i: number }
  | { op: 'addCurva'; z: number; xy: number[]; fechada: boolean }
  | { op: 'setCurvaZ'; i: number; z: number }
  | { op: 'moveVerticeCurva'; i: number; j: number; x: number; y: number }
  | { op: 'removeCurva'; i: number }
  | { op: 'addQuebra'; xyz: number[] }
  | { op: 'moveVerticeQuebra'; i: number; j: number; x: number; y: number; z: number }
  | { op: 'removeQuebra'; i: number }
  | { op: 'setBorda'; xy: number[] | null }
  | { op: 'setLinhasRotulo'; v: number[] }
  | { op: 'setPontosCotados'; v: number[] }
  | { op: 'substituirFontes'; pontos: number[]; curvas: CurvaTerreno[]; quebras: QuebraTerreno[] };
