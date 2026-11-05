/** Códigos e erro da ABI do renderizador Rust/WASM (ver `wasmClient.ts`, que reexporta tudo isto). */
export const CODIGO_RENDER = {
  ok: 0,
  cenaInvalida: 1,
  trabalhoInvalido: 2,
  interno: 3,
  cancelado: 4,
  /** Cena com textura referenciada: o render CPU (Final) não aplica texturas. Código 5 da ABI. */
  texturasNaoSuportadas: 5,
} as const;

export const MENSAGENS: Record<number, string> = {
  1: 'a cena não tem geometria visível válida para o renderizador Rust',
  2: 'a resolução/bloco do render é inválido para o renderizador Rust',
  3: 'o renderizador Rust falhou internamente',
  4: 'o render foi cancelado',
  5: 'o render final (CPU) ainda não aplica texturas; use o render GPU nativo',
};

/** Erro da ABI com o código bruto, para separar cancelamento de falha real. */
export class ErroRenderWasm extends Error {
  readonly codigo: number;
  constructor(codigo: number, mensagem?: string) {
    super(mensagem ?? MENSAGENS[codigo] ?? `renderizador Rust devolveu o código ${codigo}`);
    this.name = 'ErroRenderWasm';
    this.codigo = codigo;
  }
}

export function ehCancelamento(erro: unknown): boolean {
  return erro instanceof ErroRenderWasm && erro.codigo === CODIGO_RENDER.cancelado;
}

/** A cena traz textura e o render final (CPU) recusou: não há imagem a entregar sem a GPU nativa. */
export function ehTexturasNaoSuportadas(erro: unknown): boolean {
  return erro instanceof ErroRenderWasm && erro.codigo === CODIGO_RENDER.texturasNaoSuportadas;
}
