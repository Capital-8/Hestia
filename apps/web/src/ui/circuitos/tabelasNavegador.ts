import { mesclarTabelas, TABELAS_PROVISORIAS, type TabelasEletricas } from '@hestia/engine';
import { useSyncExternalStore } from 'react';

/*
 * Tabelas elétricas EDITADAS (ficha C5), guardadas no NAVEGADOR (localStorage), como os "Meus catálogos": valem para este
 * navegador, não viajam com o arquivo do projeto, e ficam de fora do histórico de desfazer. Sem armazenamento (janela privada,
 * dados bloqueados) o app usa as tabelas provisórias e as edições valem só até recarregar. Tudo em português.
 */

export const CHAVE_TABELAS = 'hestia.eletrica.tabelas';

const ouvintes = new Set<() => void>();
let memoria: TabelasEletricas | null = null;
let bruto: string | null = null;

function armazenamento(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function ler(): TabelasEletricas {
  const s = armazenamento();
  let texto: string | null = null;
  try {
    texto = s?.getItem(CHAVE_TABELAS) ?? null;
  } catch {
    texto = null;
  }
  if (memoria && (s === null || texto === bruto)) return memoria;
  bruto = texto;
  let parcial: unknown = null;
  try {
    parcial = texto === null ? null : JSON.parse(texto);
  } catch {
    parcial = null;
  }
  memoria = parcial === null ? TABELAS_PROVISORIAS : mesclarTabelas(TABELAS_PROVISORIAS, parcial);
  return memoria;
}

/** Tabelas em uso (as editadas do navegador, mescladas sobre as provisórias). */
export const tabelasEletricas = (): TabelasEletricas => ler();

/** Grava as tabelas (ou volta ao provisório com `null`) e avisa quem escuta. */
export function guardarTabelas(t: TabelasEletricas | null): void {
  const s = armazenamento();
  try {
    if (t === null) s?.removeItem(CHAVE_TABELAS);
    else s?.setItem(CHAVE_TABELAS, JSON.stringify(t));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  memoria = t === null ? TABELAS_PROVISORIAS : t;
  try {
    bruto = s?.getItem(CHAVE_TABELAS) ?? null;
  } catch {
    bruto = null;
  }
  for (const f of ouvintes) f();
}

/** Restaura as tabelas provisórias (CONFERIR). */
export const restaurarTabelas = (): void => guardarTabelas(null);

const assinar = (f: () => void): (() => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};

/** Hook: as tabelas em uso; re-renderiza quando mudam. */
export const useTabelasEletricas = (): TabelasEletricas => useSyncExternalStore(assinar, ler, ler);
