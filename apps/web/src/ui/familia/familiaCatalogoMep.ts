import { conferirLinha, type ConferenciaDeLinha, type FonteCatalogo, type ItemCatalogo } from '@hestia/model';
import { armazenamentoDoNavegador, type Armazenamento } from './meusModelos.ts';

/*
 * "Meus catálogos" do editor de famílias (ficha P3): tabelas de tubos e conexões criadas ou copiadas pela pessoa, guardadas no
 * navegador (fora do projeto), como "Meus modelos". O armazenamento é injetado para os testes; no app use as funções
 * *DoNavegador, que tratam a ausência ou o bloqueio do localStorage sem lançar. A família criada leva as fórmulas embutidas,
 * então o arquivo dela continua autossuficiente sem o catálogo.
 */

export const CHAVE_MEUS_CATALOGOS = 'hestia.catalogoMep.meus';
export const LIMITE_MEUS_ITENS = 100;

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Aceita só o que tem a forma de um item; o resto (JSON antigo, estranho ou corrompido) é descartado sem lançar. */
function comoItem(v: unknown): ItemCatalogo | null {
  if (!ehObjeto(v) || typeof v.id !== 'string' || typeof v.nome !== 'string' || !ehObjeto(v.colunas) || !Array.isArray(v.linhas)) return null;
  const linhas = v.linhas.filter((l): l is Record<string, unknown> => ehObjeto(l) && typeof l.bitola === 'string' && ehObjeto(l.valores));
  return { ...(v as unknown as ItemCatalogo), linhas: linhas as unknown as ItemCatalogo['linhas'], estado: v.estado === 'conferido' ? 'conferido' : 'CONFERIR' };
}

export function lerMeusItens(storage: Armazenamento): ItemCatalogo[] {
  try {
    const texto = storage.getItem(CHAVE_MEUS_CATALOGOS);
    if (texto === null || texto.trim() === '') return [];
    const dados: unknown = JSON.parse(texto);
    return Array.isArray(dados) ? dados.map(comoItem).filter((i): i is ItemCatalogo => i !== null) : [];
  } catch {
    return [];
  }
}

function gravar(storage: Armazenamento, itens: readonly ItemCatalogo[]): void {
  try {
    storage.setItem(CHAVE_MEUS_CATALOGOS, JSON.stringify(itens));
  } catch {
    // Sem espaço ou armazenamento bloqueado: a sessão continua com o que já estava carregado.
  }
}

/** Guarda (ou substitui, pelo id) e devolve a lista; acima de 100, o mais antigo sai. */
export function guardarItem(storage: Armazenamento, item: ItemCatalogo): ItemCatalogo[] {
  const lista = [...lerMeusItens(storage).filter((i) => i.id !== item.id), structuredClone(item)].slice(-LIMITE_MEUS_ITENS);
  gravar(storage, lista);
  return lista;
}

export function removerItem(storage: Armazenamento, id: string): ItemCatalogo[] {
  const lista = lerMeusItens(storage).filter((i) => i.id !== id);
  gravar(storage, lista);
  return lista;
}

/** Primeiro `meu_item_<n>` livre. */
export function proximoIdDeItem(existentes: readonly string[]): string {
  const usados = new Set(existentes);
  let n = 1;
  while (usados.has(`meu_item_${n}`)) n += 1;
  return `meu_item_${n}`;
}

export function lerMeusItensDoNavegador(): ItemCatalogo[] {
  const s = armazenamentoDoNavegador();
  return s === null ? [] : lerMeusItens(s);
}
export function guardarItemNoNavegador(item: ItemCatalogo): ItemCatalogo[] {
  const s = armazenamentoDoNavegador();
  return s === null ? [] : guardarItem(s, item);
}
export function removerItemDoNavegador(id: string): ItemCatalogo[] {
  const s = armazenamentoDoNavegador();
  return s === null ? [] : removerItem(s, id);
}

/** Data de hoje (AAAA-MM-DD) para o registro de conferência. */
export function dataDeHoje(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

/*
 * Conferência dos catálogos do FABRICANTE (somente leitura no código): guardada no navegador, fora do arquivo do catálogo, por
 * linha: `{ [catalogoId:itemId]: { sha256, linhas: { [bitola]: { por, em } } } }`. Se o SHA-256 da fonte mudou desde a
 * conferência, ela é IGNORADA (a fonte é outra): a interface avisa e a linha volta a CONFERIR. Nada disso altera o catálogo.
 */

export const CHAVE_CONFERENCIAS = 'hestia.catalogoMep.conferencias';
export const CHAVE_CONFERENTE = 'hestia.catalogoMep.conferente';
export const FORMATO_CONFERENCIAS = 'hestia-conferencias-catalogo-mep';

export interface ConferenciaSalva {
  sha256: string;
  linhas: Record<string, ConferenciaDeLinha>;
}
export type MapaConferencias = Record<string, ConferenciaSalva>;

export interface ConferenciasDoItem {
  linhas: Record<string, ConferenciaDeLinha>;
  /** Há conferência guardada, mas de outra versão da fonte (SHA-256 diferente): ela não vale. */
  ignoradas: boolean;
}

export const chaveConferencia = (catalogoId: string, itemId: string): string => `${catalogoId}:${itemId}`;

/** Lê o mapa guardado. JSON corrompido, forma estranha ou armazenamento que lança viram mapa vazio, sem lançar. */
export function lerConferencias(storage: Armazenamento): MapaConferencias {
  try {
    const texto = storage.getItem(CHAVE_CONFERENCIAS);
    if (texto === null || texto.trim() === '') return {};
    const dados: unknown = JSON.parse(texto);
    if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) return {};
    const out: MapaConferencias = {};
    for (const [chave, r] of Object.entries(dados as Record<string, unknown>)) {
      if (typeof r !== 'object' || r === null) continue;
      const reg = r as { sha256?: unknown; linhas?: unknown };
      if (typeof reg.sha256 !== 'string' || typeof reg.linhas !== 'object' || reg.linhas === null) continue;
      const linhas: Record<string, ConferenciaDeLinha> = {};
      for (const [bitola, c] of Object.entries(reg.linhas as Record<string, unknown>)) {
        const conf = c as { por?: unknown; em?: unknown } | null;
        if (conf && typeof conf.por === 'string' && typeof conf.em === 'string' && conf.por.trim() !== '' && conf.em.trim() !== '') linhas[bitola] = { por: conf.por, em: conf.em };
      }
      out[chave] = { sha256: reg.sha256, linhas };
    }
    return out;
  } catch {
    return {};
  }
}

function gravarConferencias(storage: Armazenamento, mapa: MapaConferencias): void {
  try {
    storage.setItem(CHAVE_CONFERENCIAS, JSON.stringify(mapa));
  } catch {
    // Sem espaço ou armazenamento bloqueado: a tela segue com o que estava na memória.
  }
}

/** Conferências de um item do fabricante, para a fonte atual (`sha256` do PDF baixado). */
export function conferenciasDoItem(mapa: MapaConferencias, catalogoId: string, sha256: string, itemId: string): ConferenciasDoItem {
  const r = mapa[chaveConferencia(catalogoId, itemId)];
  if (!r) return { linhas: {}, ignoradas: false };
  if (r.sha256 !== sha256) return { linhas: {}, ignoradas: true };
  return { linhas: r.linhas, ignoradas: false };
}

/** Quantos itens do catálogo têm conferência ignorada por troca da fonte. */
export function itensComConferenciaIgnorada(mapa: MapaConferencias, catalogoId: string, sha256: string, itens: readonly ItemCatalogo[]): number {
  return itens.filter((i) => conferenciasDoItem(mapa, catalogoId, sha256, i.id).ignoradas).length;
}

/**
 * Marca linhas como conferidas e grava. Se a fonte mudou (hash diferente), a conferência antiga é descartada antes: ela já não
 * vale para esta fonte. Devolve o mapa resultante.
 */
export function marcarLinhasConferidas(storage: Armazenamento, catalogoId: string, sha256: string, itemId: string, bitolas: readonly string[], por: string, em: string): MapaConferencias {
  const mapa = lerConferencias(storage);
  const chave = chaveConferencia(catalogoId, itemId);
  const atual = mapa[chave];
  const base: ConferenciaSalva = atual && atual.sha256 === sha256 ? atual : { sha256, linhas: {} };
  const linhas = { ...base.linhas };
  for (const b of bitolas) linhas[b] = { por: por.trim(), em: em.trim() };
  const novo: MapaConferencias = { ...mapa, [chave]: { sha256, linhas } };
  gravarConferencias(storage, novo);
  return novo;
}

/** Tira a conferência de uma linha; sem linhas restantes, remove o registro do item. Fonte trocada: nada a desfazer. */
export function desmarcarLinhaConferida(storage: Armazenamento, catalogoId: string, sha256: string, itemId: string, bitola: string): MapaConferencias {
  const mapa = lerConferencias(storage);
  const chave = chaveConferencia(catalogoId, itemId);
  const atual = mapa[chave];
  if (!atual || atual.sha256 !== sha256) return mapa;
  const { [bitola]: _removida, ...resto } = atual.linhas;
  const novo = { ...mapa };
  if (Object.keys(resto).length === 0) delete novo[chave];
  else novo[chave] = { sha256, linhas: resto };
  gravarConferencias(storage, novo);
  return novo;
}

/** Item do fabricante com as conferências guardadas aplicadas. A ordem é a da data, para que o "conferido por" seja o da última. */
export function aplicarConferencias(item: ItemCatalogo, linhas: Record<string, ConferenciaDeLinha>): ItemCatalogo {
  let atual = item;
  const ordenadas = Object.entries(linhas).sort(([, a], [, b]) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0));
  for (const [bitola, c] of ordenadas) {
    if (atual.linhas.some((l) => l.bitola === bitola)) atual = conferirLinha(atual, bitola, c.por, c.em);
  }
  return atual;
}

/** Arquivo JSON das conferências exibidas: catálogo, fonte (com SHA-256) e, por item e linha, quem conferiu e quando. */
export function exportarConferencias(catalogo: { id: string; fonte?: FonteCatalogo }, itens: readonly ItemCatalogo[], exportadoEm: string): string {
  return JSON.stringify(
    {
      formato: FORMATO_CONFERENCIAS,
      versao: 1,
      exportadoEm,
      catalogo: { id: catalogo.id, ...(catalogo.fonte ?? {}) },
      itens: itens.map((i) => ({
        id: i.id,
        nome: i.nome,
        pagina: i.pagina ?? null,
        estado: i.estado,
        conferidoPor: i.conferidoPor ?? null,
        conferidoEm: i.conferidoEm ?? null,
        linhas: i.linhas.map((l) => ({ bitola: l.bitola, codigo: l.codigo ?? null, conferida: l.conferida ?? null })),
      })),
    },
    null,
    2,
  );
}

/** Armazenamento de sessão (some ao fechar a aba). Ausente ou bloqueado vira null. */
export function armazenamentoDaSessao(): Armazenamento | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Nome de quem confere, lembrado na sessão para não pedir a cada linha. */
export function conferenteDaSessao(): string {
  const s = armazenamentoDaSessao();
  if (s === null) return '';
  try {
    return s.getItem(CHAVE_CONFERENTE) ?? '';
  } catch {
    return '';
  }
}

export function guardarConferenteNaSessao(nome: string): void {
  const s = armazenamentoDaSessao();
  if (s === null) return;
  try {
    s.setItem(CHAVE_CONFERENTE, nome.trim());
  } catch {
    // Sem armazenamento de sessão: o nome fica só na tela aberta.
  }
}

/** Mapa atual do navegador (vazio sem armazenamento). */
export function conferenciasDoNavegador(): MapaConferencias {
  const s = armazenamentoDoNavegador();
  return s === null ? {} : lerConferencias(s);
}
