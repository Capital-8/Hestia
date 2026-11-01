/**
 * Detector de gesto do usuário (pan, órbita, clique, roda, teclado), para o trabalho de segundo plano não começar no meio
 * dele. `ativo()` é verdadeiro com um botão do ponteiro apertado ou até `janelaMs` (padrão `JANELA_MS`) depois do último evento de entrada.
 */
const JANELA_MS = 350;

let instalado = false;
let ultimo = Number.NEGATIVE_INFINITY;
let apertado = 0;

function instalar(): void {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  const marca = (): void => {
    ultimo = performance.now();
  };
  window.addEventListener('pointerdown', () => { apertado++; marca(); }, true);
  const solta = (): void => { apertado = Math.max(0, apertado - 1); marca(); };
  window.addEventListener('pointerup', solta, true);
  window.addEventListener('pointercancel', solta, true);
  window.addEventListener('pointermove', (e) => { if (e.buttons) marca(); }, true);
  window.addEventListener('wheel', marca, { capture: true, passive: true });
  window.addEventListener('keydown', marca, true);
}

export function usuarioEmGesto(janelaMs: number = JANELA_MS): boolean {
  instalar();
  return apertado > 0 || performance.now() - ultimo < janelaMs;
}
