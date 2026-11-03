import type { Malha, PecaResolvida } from '@hestia/engine';
import type { BufferGeometry } from 'three';

/*
 * Lógica pura do visualizador 3D da família (sem WebGL, testável em Node). FICHA E3-visual: implementar as funções abaixo.
 * Testes em `logica.test.ts`. Unidades: metros.
 */

export type NivelDetalhe3d = 'grosso' | 'medio' | 'fino';

/**
 * Cor (inteiro 0xRRGGBB) de uma peça. Regras, em ordem: peça vazia → 0x4a90d9; `materiais[p.material]` se existir (texto "#rrggbb");
 * senão por papel: porta e frente_gaveta 0xe9d6b4; tampo 0x8c6a4a; fundo 0xb9b2a6; rodape 0xc9a97a; qualquer outro 0xd8b98b.
 * Determinística; nunca lança.
 */
export function corDaPeca(p: PecaResolvida, materiais: Readonly<Record<string, string>> = {}): number {
  void p;
  void materiais;
  throw new Error('não implementado: ficha E3-visual');
}

/**
 * Deslocamento (m) de uma peça na vista explodida. `fator` 0..1 (fora disso é limitado); distância base D = 0,25 m × fator.
 * `centro` = centro da caixa da família. Por papel: lateral → ±X (para −X se o centro X da peça está à esquerda de `centro[0]`,
 * senão +X) de D; porta e frente_gaveta → −Y de 1,2·D; fundo → +Y de D; tampo e topo → +Z de D; base e rodape → −Z de 0,5·D;
 * demais papéis → zero. Com fator 0 devolve [0,0,0] para todos.
 */
export function deslocamentoDeExplosao(p: PecaResolvida, fator: number, centro: readonly [number, number, number]): [number, number, number] {
  void p;
  void fator;
  void centro;
  throw new Error('não implementado: ficha E3-visual');
}

/**
 * Filtro de visibilidade por nível de detalhe e portas. `portas` falso esconde porta e frente_gaveta. Detalhe: 'fino' mostra tudo;
 * 'medio' esconde travessa e rodape; 'grosso' mostra só lateral, base, tampo, porta, frente_gaveta e painel. Peça vazia é sempre visível.
 */
export function pecaVisivel(p: PecaResolvida, detalhe: NivelDetalhe3d, portas: boolean): boolean {
  void p;
  void detalhe;
  void portas;
  throw new Error('não implementado: ficha E3-visual');
}

/** Geometria do three a partir da malha: atributos `position` e `normal` (3 componentes, Float32) e `index` (Uint32). */
export function geometriaDaMalha(m: Malha): BufferGeometry {
  void m;
  throw new Error('não implementado: ficha E3-visual');
}

/** Esfera que envolve as peças não vazias (centro da caixa e metade da diagonal). Sem peças: centro [0,0,0], raio 1. */
export function esferaDeEnquadramento(pecas: readonly PecaResolvida[]): { centro: [number, number, number]; raio: number } {
  void pecas;
  throw new Error('não implementado: ficha E3-visual');
}

/** Distância da câmera para a esfera caber na tela: `raio / sin(min(fovV, fovH) / 2)` com `fovH = 2·atan(tan(fovV/2)·aspecto)`, mais 10% de folga. */
export function distanciaDeEnquadramento(raio: number, fovVerticalGraus: number, aspecto: number): number {
  void raio;
  void fovVerticalGraus;
  void aspecto;
  throw new Error('não implementado: ficha E3-visual');
}
