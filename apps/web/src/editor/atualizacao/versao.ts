declare const __APP_VERSION__: string;

/** Versão do package.json injetada pelo Vite; em testes/ambientes sem `define` cai no marcador. */
export function versaoDoApp(): string {
  try {
    return typeof __APP_VERSION__ === 'string' && __APP_VERSION__ !== '' ? __APP_VERSION__ : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
