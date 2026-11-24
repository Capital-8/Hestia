import type { ItemCatalogo } from '@hestia/model';
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
