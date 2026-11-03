/*
 * Geometria 2D de contornos de peça (ADR 0049 §3.3). FICHA E2-contorno: implementar as funções abaixo. Testes em
 * `contorno.test.ts`. Funções puras e numéricas; pontos achatados `[u0, v0, u1, v1, …]` em METROS, no plano da chapa
 * (origem no canto mínimo). Esta é geometria que o Rust vai espelhar (fatia C): mantenha cada função pequena e sem
 * dependências além dos números. Convenção do plano: ver `PecaResolvida.contorno` em `pecas.ts`.
 */

export const CONTORNO_MAX_PONTOS = 256;
/** Área mínima (m²) para um contorno contar como tendo área. */
export const CONTORNO_AREA_MIN = 1e-9;

export interface CaixaPlana { u0: number; v0: number; u1: number; v1: number }

/** Área com sinal pela fórmula do cadarço (shoelace): positiva no sentido anti-horário. Menos de 3 pontos = 0. */
export function areaContorno(pts: readonly number[]): number {
  void pts;
  throw new Error('não implementado: ficha E2-contorno');
}

/**
 * Motivo (em português) pelo qual o contorno é inválido, ou `null` se é válido. Verificações, NESTA ordem:
 *  1. quantidade ímpar de números, ou menos de 3 pontos → 'contorno precisa de ao menos 3 pontos';
 *  2. mais de CONTORNO_MAX_PONTOS pontos → 'contorno com pontos demais';
 *  3. algum valor não finito → 'contorno com valor inválido';
 *  4. dois pontos consecutivos iguais (inclusive o último e o primeiro) → 'contorno com pontos repetidos';
 *  5. |área| < CONTORNO_AREA_MIN → 'contorno sem área';
 *  6. duas arestas não vizinhas que se cruzam OU se tocam (inclusive um vértice sobre outra aresta) → 'contorno se cruza'.
 *     Arestas vizinhas só podem compartilhar o vértice comum; se forem colineares sobrepostas também é 'contorno se cruza'.
 * Tolerância de 1e-9 m nas comparações de igualdade e de toque.
 */
export function validarContorno(pts: readonly number[]): string | null {
  void pts;
  throw new Error('não implementado: ficha E2-contorno');
}

/** Cópia em sentido anti-horário: se a área é negativa, inverte a ordem dos PONTOS (pares), senão devolve cópia igual. */
export function orientarAntiHorario(pts: readonly number[]): number[] {
  void pts;
  throw new Error('não implementado: ficha E2-contorno');
}

/** Retângulo `a × b` com origem no canto mínimo, anti-horário: `[0,0, a,0, a,b, 0,b]`. */
export function retanguloComoContorno(a: number, b: number): number[] {
  void a;
  void b;
  throw new Error('não implementado: ficha E2-contorno');
}

/** Caixa que envolve os pontos. Sem pontos: lança `Error('contorno vazio')`. */
export function caixaDoContorno(pts: readonly number[]): CaixaPlana {
  void pts;
  throw new Error('não implementado: ficha E2-contorno');
}

/** Ponto dentro do polígono pela regra par-ímpar; ponto sobre a borda conta como dentro (tolerância 1e-9). */
export function pontoDentro(pts: readonly number[], u: number, v: number): boolean {
  void pts;
  void u;
  void v;
  throw new Error('não implementado: ficha E2-contorno');
}
