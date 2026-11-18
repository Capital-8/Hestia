/**
 * Controles flutuantes sobre a vista (hoje a barra de navegação) moram DENTRO do `.canvas-wrap`, que captura o ponteiro
 * no `pointerdown`. Com a captura, o `click` é redirecionado ao `.canvas-wrap` e o botão nunca o recebe: Aproximar, Afastar
 * e Enquadrar tudo ficavam mortos com o mouse de verdade (E2E do terreno, ficha Q1b). O gesto da vista ignora o ponteiro
 * que começou num desses controles.
 */
const SELETOR_DE_CONTROLE = '.navbar';

/** O alvo do evento está dentro de um controle flutuante da vista? */
export function ponteiroEmControle(alvo: EventTarget | null): boolean {
  const el = alvo as { closest?: (s: string) => unknown } | null;
  return typeof el?.closest === 'function' && el.closest(SELETOR_DE_CONTROLE) !== null;
}
