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

/**
 * Preparo da captura da cena 3D: recebe `fazer` e o roda com a cena em modo apresentação (sem grade,
 * níveis, chão nem realces). Devolve false, sem rodar `fazer`, quando não há cena 3D pronta.
 */
type PreparoApresentacao = (fazer: () => void) => boolean;

let donoPreparo: Dono | null = null;
let preparo: PreparoApresentacao | null = null;

export function registrarPreparoApresentacao(quem: Dono, f: PreparoApresentacao): void {
  donoPreparo = quem;
  preparo = f;
}

export function limparPreparoApresentacao(quem: Dono): void {
  if (donoPreparo !== quem) return;
  donoPreparo = null;
  preparo = null;
}

/**
 * Roda `fazer` com a cena 3D da vista ativa em modo apresentação e restaura logo em seguida. `fazer`
 * deve copiar o canvas de forma síncrona (como `capturarVista` faz) para a cópia não sair com a grade.
 * Devolve false quando a vista 3D não está pronta; nesse caso `fazer` não roda.
 */
export function comModoApresentacao(fazer: () => void): boolean {
  if (!preparo) return false;
  return preparo(fazer);
}
