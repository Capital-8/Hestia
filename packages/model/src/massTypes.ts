import type { Vec2 } from '@hestia/geom';
import type { Id } from './types.ts';

/** Perfil de uma seção, em coordenadas locais (origem no centro do perfil). */
export type PerfilMassa =
  | { forma: 'circulo'; raio: number }
  | { forma: 'elipse'; rx: number; ry: number }
  | { forma: 'poligono'; lados: number; raio: number } // regular, inscrito em `raio`; lados 3..64
  | { forma: 'livre'; pontos: Vec2[] }; // polígono simples, anti-horário, 3..256 pontos, sem arcos

export interface SecaoMassa {
  /** Altura acima da base da massa. A primeira é 0; as demais crescem estritamente (passo mínimo 0,01 m). */
  z: number;
  perfil: PerfilMassa;
  /** Rotação do perfil em torno do seu centro (rad). Diferença máxima entre vizinhas: π. */
  rotacao: number;
  /** Fator de escala do perfil (> 0). */
  escala: number;
  /** Deslocamento do centro do perfil em relação à origem da massa. */
  dx: number;
  dy: number;
}

export interface ArranjoMassa {
  /** Número de cópias, 2..64 (a original conta). */
  n: number;
  /** Centro do giro, em coordenadas de mundo (planta). */
  cx: number;
  cy: number;
  /** Ângulo total coberto (rad); 2π = volta completa (a última cópia não repete a primeira). */
  anguloTotal: number;
}

export interface Mass {
  id: Id;
  kind: 'mass';
  levelId: Id;
  name: string;
  /** Origem em planta (mundo). */
  origem: Vec2;
  /** Deslocamento da base em relação à cota do nível. */
  baseOffset: number;
  /** 2 a 64 seções. */
  secoes: SecaoMassa[];
  /** Como o kernel interpola entre seções. */
  interpolacao: 'linear' | 'suave';
  /** Pontos por anel antes de somar os vértices dos perfis: 16..128, padrão 64. */
  resolucao: number;
  arranjo?: ArranjoMassa;
  color?: string;
  order: number;
}

export const MASSA_LIMITES = {
  secoes: 64,
  pontosLivre: 256,
  resolucaoMin: 16,
  resolucaoMax: 128,
  resolucaoPadrao: 64,
  copias: 64,
  passoZMin: 0.01,
  rotacaoMaxVizinha: Math.PI,
} as const;
