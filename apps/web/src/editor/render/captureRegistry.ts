/**
 * Registro do canvas ativo da área de desenho. A imagem precisa capturar o que está na tela
 * (planta, corte, 3D ou prévia do estúdio) sem acoplar o diálogo ao componente que desenha.
 *
 * Cada dono registra/limpa o próprio canvas. Se uma vista desmonta depois de outra já ter
 * registrado, o `limpar` do dono antigo não apaga o registro novo.
 */

type FonteCanvas = () => HTMLCanvasElement | null;
type Dono = object;

let dono: Dono | null = null;
let fonte: FonteCanvas | null = null;

export function registrarCanvasAtivo(quem: Dono, f: FonteCanvas): void {
  dono = quem;
  fonte = f;
}

export function limparCanvasAtivo(quem: Dono): void {
  if (dono !== quem) return;
  dono = null;
  fonte = null;
}

export function canvasAtivo(): HTMLCanvasElement | null {
  return fonte ? fonte() : null;
}
