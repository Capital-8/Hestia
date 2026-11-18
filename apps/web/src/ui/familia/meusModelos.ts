import { exportarFamilias, importarFamilias, serializar, type Familia } from '@hestia/model';

/*
 * "Meus modelos": famílias guardadas no navegador, fora do projeto. O armazenamento é injetado (getItem/setItem) para os
 * testes; no app use as funções *DoNavegador, que tratam a ausência ou o bloqueio do localStorage sem lançar.
 */

export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

export const CHAVE_MEUS_MODELOS = 'hestia.familia.meus';
export const LIMITE_MEUS_MODELOS = 100;

/** Lê e valida a lista; JSON corrompido, formato estranho ou armazenamento bloqueado viram lista vazia. */
export function lerMeusModelos(storage: Armazenamento): Familia[] {
  let texto: string | null;
  try {
    texto = storage.getItem(CHAVE_MEUS_MODELOS);
  } catch {
    return [];
  }
  if (texto === null || texto.trim() === '') return [];
  try {
    const dados: unknown = JSON.parse(texto);
    return importarFamilias(dados).familias;
  } catch {
    return [];
  }
}

function gravar(storage: Armazenamento, familias: readonly Familia[]): void {
  try {
    storage.setItem(CHAVE_MEUS_MODELOS, serializar(exportarFamilias(familias)));
  } catch {
    // Sem espaço ou armazenamento bloqueado: a sessão continua com o que já estava carregado.
  }
}

/** Guarda (ou substitui, pelo id) e devolve a lista atualizada; acima de 100, a mais antiga sai. */
export function guardarModelo(storage: Armazenamento, familia: Familia): Familia[] {
  const atuais = lerMeusModelos(storage).filter((f) => f.id !== familia.id);
  atuais.push(structuredClone(familia));
  const lista = atuais.slice(Math.max(0, atuais.length - LIMITE_MEUS_MODELOS));
  gravar(storage, lista);
  return lista;
}

/**
 * Acrescenta várias famílias de uma vez (importação de arquivo): a de mesmo id é substituída; acima do limite, as mais
 * antigas saem. Devolve a lista resultante.
 */
export function mesclarMeusModelos(storage: Armazenamento, novas: readonly Familia[]): Familia[] {
  const ids = new Set(novas.map((f) => f.id));
  const atuais = lerMeusModelos(storage).filter((f) => !ids.has(f.id));
  const todas = [...atuais, ...novas.map((f) => structuredClone(f))];
  const lista = todas.slice(Math.max(0, todas.length - LIMITE_MEUS_MODELOS));
  gravar(storage, lista);
  return lista;
}

/** Remove pelo id e devolve a lista restante. */
export function removerModelo(storage: Armazenamento, id: string): Familia[] {
  const lista = lerMeusModelos(storage).filter((f) => f.id !== id);
  gravar(storage, lista);
  return lista;
}

/** Baixa um texto como arquivo (blob + link temporário). Só roda no navegador. */
export function baixarTexto(nome: string, texto: string, tipo = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const ancora = document.createElement('a');
  ancora.href = url;
  ancora.download = nome;
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  URL.revokeObjectURL(url);
}

/** localStorage do navegador, ou `null` quando não existe ou o acesso é bloqueado. */
export function armazenamentoDoNavegador(): Armazenamento | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Lista de "Meus modelos" do navegador (vazia quando não há armazenamento). */
export function lerMeusModelosDoNavegador(): Familia[] {
  const storage = armazenamentoDoNavegador();
  return storage === null ? [] : lerMeusModelos(storage);
}

/** Guarda no navegador e devolve a lista resultante (vazia quando não há armazenamento). */
export function guardarModeloNoNavegador(familia: Familia): Familia[] {
  const storage = armazenamentoDoNavegador();
  return storage === null ? [] : guardarModelo(storage, familia);
}

/** Remove do navegador e devolve a lista resultante (vazia quando não há armazenamento). */
export function removerModeloDoNavegador(id: string): Familia[] {
  const storage = armazenamentoDoNavegador();
  return storage === null ? [] : removerModelo(storage, id);
}
