/**
 * Sinal simples de "o usuário está orbitando, movendo ou dando zoom na 3D agora". O trabalho de fundo que roda na thread
 * principal (montagem de níveis, avisos do projeto, sombras, ID buffer, BVH de picking) consulta este sinal e espera o
 * gesto acabar, para a órbita nunca disputar quadro com geometria. Sem dependências: vale em qualquer thread e nos testes.
 */

/** Silêncio (ms) depois do último movimento de gesto antes de o trabalho de fundo voltar. */
export const FOLGA_GESTO_MS = 150;
/** Gesto aberto (botão pressionado) e parado há mais que isto deixa de contar como ativo (ponteiro perdido). */
export const VALIDADE_GESTO_ABERTO_MS = 2000;

let relogio: () => number = () => performance.now();
let ultimo = Number.NEGATIVE_INFINITY;
let aberto = false;

/** Marca atividade de gesto agora (movimento de órbita/pan, roda do mouse, animação de câmera). */
export function marcarInteracao(): void {
  ultimo = relogio();
}

/** Botão pressionado para orbitar ou mover: o gesto conta como ativo até soltar. */
export function iniciarGesto(): void {
  aberto = true;
  marcarInteracao();
}

/** Botão solto (ou ponteiro cancelado): a folga de `FOLGA_GESTO_MS` começa agora. */
export function encerrarGesto(): void {
  aberto = false;
  marcarInteracao();
}

/** Milissegundos até o trabalho de fundo poder voltar; 0 quando não há gesto ativo nem recente. */
export function msAteLiberar(): number {
  const desde = relogio() - ultimo;
  const folga = aberto ? Math.max(FOLGA_GESTO_MS, VALIDADE_GESTO_ABERTO_MS) : FOLGA_GESTO_MS;
  return desde < folga ? folga - desde : 0;
}

/** Há gesto de câmera ativo (ou terminado há menos de `FOLGA_GESTO_MS`). */
export function interacaoAtiva(): boolean {
  return msAteLiberar() > 0;
}

/**
 * Roda `acao` assim que não houver gesto ativo: se houver, espera o fim dele (mais `FOLGA_GESTO_MS`) e confere de novo.
 * `esperar` é injetável (testes); o padrão é `setTimeout`. Devolve a função que cancela a espera.
 */
export function quandoLivre(acao: () => void, esperar: (ms: number, f: () => void) => unknown = (ms, f) => setTimeout(f, ms)): () => void {
  let cancelado = false;
  const tentar = (): void => {
    if (cancelado) return;
    const falta = msAteLiberar();
    if (falta > 0) void esperar(Math.max(16, falta), tentar);
    else acao();
  };
  tentar();
  return () => {
    cancelado = true;
  };
}

/** Só para testes: troca o relógio e zera o estado. Sem argumento, restaura o relógio real. */
export function reiniciarInteracaoParaTeste(novoRelogio?: () => number): void {
  relogio = novoRelogio ?? (() => performance.now());
  ultimo = Number.NEGATIVE_INFINITY;
  aberto = false;
}
