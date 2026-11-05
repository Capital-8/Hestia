/**
 * Navegação 3D compartilhada entre o 3D normal (ViewportCanvas) e o preview do Estúdio (AnimationPreview).
 * Funções puras: sem React e sem DOM.
 */

export type GestoPonteiro = 'orbitar' | 'pan' | 'nenhum';

/** Gesto de ponteiro: botão (0 esquerdo, 1 meio, 2 direito) e modificadores. */
export interface EntradaGestoPonteiro {
  botao: number;
  shift: boolean;
  alt: boolean;
  espaco: boolean;
}

/**
 * Regra do 3D (ViewportCanvas), sem exceção:
 * órbita = (meio + Shift) ou (esquerdo + Alt) ou (esquerdo sem Espaço e sem Alt);
 * pan = (meio sem Shift) ou (esquerdo + Espaço); direito e demais botões não navegam.
 * Shift com o esquerdo não faz pan (no 3D, shiftPan é false). Espaço+Alt+esquerdo orbita (Alt tem prioridade).
 */
export function classificarGestoPonteiro(entrada: EntradaGestoPonteiro): GestoPonteiro {
  const { botao, shift, alt, espaco } = entrada;
  if (botao === 1) return shift ? 'orbitar' : 'pan';
  if (botao === 0) {
    if (alt) return 'orbitar';
    return espaco ? 'pan' : 'orbitar';
  }
  return 'nenhum';
}

/**
 * Coordenadas normalizadas (NDC) do cursor dentro do retângulo do canvas, como no ViewportCanvas.
 * Retorna null se o retângulo não tem área (evita divisão por zero).
 */
export function ndcDoCursor(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.height) * 2;
  return { x, y };
}

/** Variação do zoom da órbita para um evento de roda (mesmo sinal do deltaY). */
export function deltaZoom(deltaY: number): number {
  return deltaY;
}

/** Fator com que o alvo se desloca em direção ao ponto sob o cursor: pequeno e limitado a 0.12. */
export function fatorAproximacaoCursor(deltaY: number): number {
  return Math.min(0.12, Math.abs(deltaY) * 0.001);
}

/** Ao rolar para cima (deltaY < 0) o zoom aproxima e o alvo deriva em direção ao cursor. */
export function deveAproximarNoCursor(deltaY: number): boolean {
  return deltaY < 0;
}

/**
 * Delta de zoom (orbit.zoom) do pinch de dois dedos, como no 3D: -(distância atual - anterior) * 3.
 * Afastar os dedos dá valor negativo, que aproxima a câmera (orbit.zoom com delta < 0 aproxima).
 * Escrito como (anterior - atual) * 3, que é numericamente igual e devolve +0 (não -0) quando os dedos não se movem.
 */
export function zoomDoPinch(distanciaAnterior: number, distanciaAtual: number): number {
  return (distanciaAnterior - distanciaAtual) * 3;
}

/** Deslocamento do ponto médio entre os dois dedos, de um quadro para o seguinte (usado no orbit.pan). */
export function deslocamentoDoPontoMedio(
  anterior: { x: number; y: number },
  atual: { x: number; y: number },
): { dx: number; dy: number } {
  return { dx: atual.x - anterior.x, dy: atual.y - anterior.y };
}

/** Desloca o alvo em direção ao ponto: alvo + (ponto - alvo) * fator, nos eixos x e y. */
export function moverAlvoParaPonto(alvo: { x: number; y: number }, ponto: { x: number; y: number }, fator: number): { x: number; y: number } {
  return {
    x: alvo.x + (ponto.x - alvo.x) * fator,
    y: alvo.y + (ponto.y - alvo.y) * fator,
  };
}
