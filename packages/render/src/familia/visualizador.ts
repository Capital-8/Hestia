import type { PecaResolvida } from '@hestia/engine';
import type { NivelDetalhe3d } from './logica.ts';

/*
 * Visualizador 3D da família (three.js). FICHA E3-visual: implementar a classe. Não tem teste de unidade (precisa de WebGL): o
 * orquestrador confere o resultado abrindo o editor no navegador. Use SEMPRE as funções de `./logica.ts` e `malhaDasPecas` de
 * `@hestia/engine`; não duplique regra de cor, explosão ou visibilidade aqui.
 */

export interface OpcoesVisualizador {
  /** Mapa id de material do projeto → "#rrggbb" (opcional). */
  materiais?: Readonly<Record<string, string>>;
}

export interface CortePlano {
  ativo: boolean;
  eixo: 'x' | 'y' | 'z';
  /** Posição do plano de corte em metros, no sistema da família. Fica visível o lado de MENOR coordenada. */
  posicao: number;
}

export class VisualizadorFamilia {
  /** Cria renderer (antialias, fundo transparente), cena, câmera em perspectiva (fov 40°), luzes (hemisférica + direcional) e controles de órbita. Não inicia o laço de desenho sozinho: desenha sob demanda (`requestAnimationFrame` só quando algo muda). */
  constructor(canvas: HTMLCanvasElement, opcoes: OpcoesVisualizador = {}) {
    void canvas;
    void opcoes;
    throw new Error('não implementado: ficha E3-visual');
  }

  /** Recria as malhas (uma `Mesh` por peça para poder realçar e explodir; vazias em azul translúcido). Mantém a câmera e a seleção quando possível. */
  definirPecas(pecas: readonly PecaResolvida[]): void {
    void pecas;
    throw new Error('não implementado: ficha E3-visual');
  }

  /** Realça a peça de índice `indice` da lista passada a `definirPecas` (arestas azuis e brilho); `null` limpa. */
  selecionar(indice: number | null): void {
    void indice;
    throw new Error('não implementado: ficha E3-visual');
  }

  /** `cb` recebe o índice da peça clicada (clique sem arrasto) ou `null` ao clicar no vazio. Devolve a função que cancela. */
  aoSelecionar(cb: (indice: number | null) => void): () => void {
    void cb;
    throw new Error('não implementado: ficha E3-visual');
  }

  definirExplodir(fator: number): void {
    void fator;
    throw new Error('não implementado: ficha E3-visual');
  }

  /** Opacidade 0.1..1 das peças sólidas (1 = opaco). */
  definirOpacidade(opacidade: number): void {
    void opacidade;
    throw new Error('não implementado: ficha E3-visual');
  }

  definirDetalhe(detalhe: NivelDetalhe3d, portas: boolean): void {
    void detalhe;
    void portas;
    throw new Error('não implementado: ficha E3-visual');
  }

  definirCorte(corte: CortePlano): void {
    void corte;
    throw new Error('não implementado: ficha E3-visual');
  }

  /** Vistas rápidas: 'iso' (3/4 frontal), 'frente', 'lateral', 'planta'. Enquadra a esfera das peças. */
  vista(nome: 'iso' | 'frente' | 'lateral' | 'planta'): void {
    void nome;
    throw new Error('não implementado: ficha E3-visual');
  }

  redimensionar(largura: number, altura: number): void {
    void largura;
    void altura;
    throw new Error('não implementado: ficha E3-visual');
  }

  /** Libera geometrias, materiais, controles, listeners e o renderer. Idempotente. */
  destruir(): void {
    throw new Error('não implementado: ficha E3-visual');
  }
}
