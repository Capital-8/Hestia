/**
 * Catálogo de texturas online (somente consulta e download; as imagens NÃO vão na release).
 *
 * O bucket público guarda `textures/<Id>/{Color,NormalDX,Roughness}.jpg`. Um `catalogo.json` (gerado por
 * `scripts/texturas-catalogo.mts`) lista as texturas, e um único atlas de miniaturas evita centenas de requisições.
 * Este módulo é puro (sem rede, sem DOM): serve ao script que gera o catálogo e ao app que o lê.
 */

/** Pasta do catálogo dentro do bucket (fora de qualquer pasta de textura). */
export const CATALOGO_PASTA = 'textures/_catalogo';
export const CATALOGO_ARQUIVO = `${CATALOGO_PASTA}/catalogo.json`;
export const CATALOGO_MINIATURAS = `${CATALOGO_PASTA}/miniaturas.jpg`;
export const CATALOGO_VERSAO = 1;

/** Mapas conhecidos de uma textura, pelo nome do arquivo (sem diferenciar maiúsculas). */
const MAPAS: ReadonlyArray<{ chave: 'cor' | 'normal' | 'rugosidade'; arquivo: string }> = [
  { chave: 'cor', arquivo: 'color.jpg' },
  { chave: 'normal', arquivo: 'normaldx.jpg' },
  { chave: 'rugosidade', arquivo: 'roughness.jpg' },
];

export interface TexturaMapas {
  /** Caminho no bucket (ex.: `textures/Bricks003/Color.jpg`). */
  cor: string;
  normal?: string;
  rugosidade?: string;
}

export interface TexturaItem {
  /** Nome da pasta (ex.: `Bricks003`). Identifica a textura. */
  id: string;
  /** Nome legível (ex.: `Bricks 003`). */
  nome: string;
  /** Prefixo do id sem a numeração (ex.: `Bricks`). */
  categoria: string;
  /** Soma dos bytes dos mapas (estimativa do download). */
  bytes: number;
  mapas: TexturaMapas;
  /** Posição da miniatura no atlas (0..n-1), ou ausente se não houver. */
  icone?: number;
}

export interface TexturasCatalogo {
  versao: number;
  gerado: string;
  /** Atlas de miniaturas: grade de `lado`×`lado` px com `colunas` colunas. */
  miniaturas?: { arquivo: string; lado: number; colunas: number };
  itens: TexturaItem[];
}

/** `Asphalt020L` → `Asphalt`; `WoodSiding012` → `WoodSiding`. Sem dígitos: o próprio id. */
export function categoriaDaTextura(id: string): string {
  const base = id.replace(/[\d_]+[A-Za-z]*$/, '');
  return base || id;
}

/** `WoodFloor012` → `Wood Floor 012`; `Asphalt020L` → `Asphalt 020L`. */
export function nomeDaTextura(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim();
}

export interface ChaveBucket {
  key: string;
  size: number;
}

/**
 * Monta o catálogo a partir da listagem do bucket. Ignora o que não for `textures/<Id>/<arquivo>.jpg`, a pasta
 * `_catalogo` e texturas sem mapa de cor. Ordena por categoria e depois por nome.
 */
export function montarCatalogo(chaves: readonly ChaveBucket[], opts: { gerado?: string; miniaturas?: TexturasCatalogo['miniaturas'] } = {}): TexturasCatalogo {
  const porId = new Map<string, TexturaItem>();
  for (const { key, size } of chaves) {
    const partes = key.split('/');
    if (partes.length !== 3 || partes[0] !== 'textures' || partes[1] === '_catalogo') continue;
    const id = partes[1]!;
    const mapa = MAPAS.find((m) => m.arquivo === partes[2]!.toLowerCase());
    if (!mapa) continue;
    let item = porId.get(id);
    if (!item) {
      item = { id, nome: nomeDaTextura(id), categoria: categoriaDaTextura(id), bytes: 0, mapas: { cor: '' } };
      porId.set(id, item);
    }
    item.mapas[mapa.chave] = key;
    item.bytes += size;
  }
  const itens = [...porId.values()].filter((i) => i.mapas.cor !== '').sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome, 'en', { numeric: true }));
  if (opts.miniaturas) itens.forEach((it, i) => (it.icone = i));
  return { versao: CATALOGO_VERSAO, gerado: opts.gerado ?? new Date().toISOString(), ...(opts.miniaturas ? { miniaturas: opts.miniaturas } : {}), itens };
}

/** Une a base pública e um caminho do bucket, sem barras duplicadas. */
export function urlTextura(base: string, caminho: string): string {
  return `${base.replace(/\/+$/, '')}/${caminho.replace(/^\/+/, '')}`;
}

/** Posição (px) do ícone no atlas, para `background-position` (valores positivos). */
export function posicaoIcone(m: NonNullable<TexturasCatalogo['miniaturas']>, icone: number): { x: number; y: number } {
  return { x: (icone % m.colunas) * m.lado, y: Math.floor(icone / m.colunas) * m.lado };
}

/** Validação defensiva do JSON baixado: devolve o catálogo limpo ou `null` se não servir. Descarta itens inválidos. */
export function validarCatalogo(raw: unknown): TexturasCatalogo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.versao !== CATALOGO_VERSAO || !Array.isArray(o.itens)) return null;
  const itens: TexturaItem[] = [];
  for (const it of o.itens) {
    if (!it || typeof it !== 'object') continue;
    const r = it as Record<string, unknown>;
    const m = r.mapas as Record<string, unknown> | undefined;
    if (typeof r.id !== 'string' || typeof r.nome !== 'string' || typeof r.categoria !== 'string' || !m || typeof m.cor !== 'string') continue;
    const mapas: TexturaMapas = { cor: m.cor };
    if (typeof m.normal === 'string') mapas.normal = m.normal;
    if (typeof m.rugosidade === 'string') mapas.rugosidade = m.rugosidade;
    const item: TexturaItem = { id: r.id, nome: r.nome, categoria: r.categoria, bytes: typeof r.bytes === 'number' && Number.isFinite(r.bytes) ? r.bytes : 0, mapas };
    if (typeof r.icone === 'number' && Number.isInteger(r.icone) && r.icone >= 0) item.icone = r.icone;
    itens.push(item);
  }
  const mi = o.miniaturas as Record<string, unknown> | undefined;
  const miniaturas = mi && typeof mi.arquivo === 'string' && typeof mi.lado === 'number' && typeof mi.colunas === 'number' && mi.lado > 0 && mi.colunas > 0 ? { arquivo: mi.arquivo, lado: mi.lado, colunas: mi.colunas } : undefined;
  return { versao: CATALOGO_VERSAO, gerado: typeof o.gerado === 'string' ? o.gerado : '', ...(miniaturas ? { miniaturas } : {}), itens };
}
