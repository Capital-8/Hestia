import { CATALOGO_ARQUIVO, urlTextura, validarCatalogo, type TexturaItem, type TexturasCatalogo } from '@hestia/io';

/** Bucket público das texturas. Somente leitura: as imagens não vão na release do app. */
export const URL_TEXTURAS = 'https://pub-8902f5770d27459b9c9a712765874108.r2.dev';

/**
 * Base usada para baixar o catálogo e os mapas. Em desenvolvimento, `?texturas=<url>` na página troca o bucket
 * (para testar outro catálogo). Em produção o parâmetro é ignorado.
 */
export function baseTexturas(busca: string, desenvolvimento: boolean = import.meta.env.DEV === true): string {
  if (!desenvolvimento) return URL_TEXTURAS;
  const sobrescrita = new URLSearchParams(busca).get('texturas');
  return sobrescrita && /^https?:\/\//i.test(sobrescrita) ? sobrescrita : URL_TEXTURAS;
}

/** Base da página atual (no navegador); fora dele, o bucket padrão. */
export function baseAtual(): string {
  return baseTexturas(typeof location === 'undefined' ? '' : location.search);
}

/** Resposta mínima que o download usa. Injetável para teste (o `fetch` do navegador já atende). */
export type FetchTexturas = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** `motivo`: `rede` (sem conexão ou HTTP de erro) ou `formato` (JSON inválido ou catálogo de outra versão). */
export class ErroCatalogo extends Error {
  readonly motivo: 'rede' | 'formato';
  constructor(motivo: 'rede' | 'formato', detalhe: string) {
    super(`catálogo de texturas: ${detalhe}`);
    this.name = 'ErroCatalogo';
    this.motivo = motivo;
  }
}

/** Cache de memória do módulo: só guarda catálogo válido (erro não fica cacheado, para "Tentar de novo" refazer o download). */
let cache: { base: string; catalogo: TexturasCatalogo } | null = null;

/** Prefixo do `imagemId` que aponta para o catálogo online (resolvido pelos mapas do catálogo). */
export const PREFIXO_CATALOGO = 'catalogo:';

/** Texturas do catálogo a que um `imagemId` se refere; `undefined` se não for do catálogo ou não constar nele. */
export function itemDoCatalogo(imagemId: string, catalogo: TexturasCatalogo | null): TexturaItem | undefined {
  if (!catalogo || !imagemId.startsWith(PREFIXO_CATALOGO)) return undefined;
  const id = imagemId.slice(PREFIXO_CATALOGO.length);
  return catalogo.itens.find((i) => i.id === id);
}

const ouvintes = new Set<() => void>();

/** Catálogo já baixado nesta sessão (para quem não pode esperar rede: exportação de cena, 3D). `null` se ainda não veio. */
export function catalogoEmCache(base: string = baseAtual()): TexturasCatalogo | null {
  return cache && cache.base === base ? cache.catalogo : null;
}

/** Avisa quando um catálogo novo chega à memória. Devolve a função que cancela. */
export function aoCarregarCatalogo(cb: () => void): () => void {
  ouvintes.add(cb);
  return () => { ouvintes.delete(cb); };
}

/** Esquece o catálogo em memória (uso em teste e quando a base muda). */
export function esquecerCatalogo(): void {
  cache = null;
}

/** Baixa e valida `${base}/${CATALOGO_ARQUIVO}`. Rejeita com `ErroCatalogo` em qualquer falha. */
export async function carregarCatalogo(fetchFn: FetchTexturas = fetch, base: string = baseAtual()): Promise<TexturasCatalogo> {
  if (cache && cache.base === base) return cache.catalogo;
  let res: Awaited<ReturnType<FetchTexturas>>;
  try {
    res = await fetchFn(urlTextura(base, CATALOGO_ARQUIVO));
  } catch {
    throw new ErroCatalogo('rede', 'sem conexão');
  }
  if (!res.ok) throw new ErroCatalogo('rede', `HTTP ${res.status}`);
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new ErroCatalogo('formato', 'JSON inválido');
  }
  const catalogo = validarCatalogo(raw);
  if (!catalogo) throw new ErroCatalogo('formato', 'catálogo inválido ou de outra versão');
  cache = { base, catalogo };
  for (const cb of [...ouvintes]) cb();
  return catalogo;
}

/** URL absoluta de um arquivo do bucket (mapa, atlas de miniaturas). */
export function urlDoMapa(base: string, caminho: string): string {
  return urlTextura(base, caminho);
}
