import { useSyncExternalStore } from 'react';
import { newId, type Command, type Id, type ProjectStore } from '@hestia/model';
import type { Lang } from './i18n.ts';
import {
  bloqueioDaImportacao,
  fontesFinais,
  localizacaoDaProposta,
  terrenoDasFontes,
  contarVertices,
  fontesVazias,
  type Bloqueio,
  type FontesImportadas,
  type PropostaLocalizacao,
} from './importTerrenoModel.ts';

/**
 * Importação de levantamento pela interface (ficha I1). O diálogo (`ImportTerrenoDialog`) monta as FONTES do terreno com o
 * `importTerrenoModel.ts`; aqui elas viram comandos do modelo, numa só transação. Não toca no controller: quem chama passa
 * a store (o diálogo passa `editor.store`; os testes passam uma store própria).
 */

/** Tipo de arquivo de levantamento pela extensão; null se não for `.dxf` nem `.csv`. */
export function tipoDoArquivoTerreno(nome: string): 'dxf' | 'csv' | null {
  const ext = /\.([^.]+)$/.exec(nome.trim())?.[1]?.toLowerCase();
  return ext === 'dxf' || ext === 'csv' ? ext : null;
}

/** Nome do terreno a partir do nome do arquivo ("lote 7.dxf" vira "lote 7"); sem nome aproveitável, "Terreno". */
export function nomeDoTerreno(arquivo: string): string {
  const base = arquivo.trim().replace(/\.[^.]+$/, '').trim();
  return base === '' ? 'Terreno' : base;
}

let aberto = false;
const ouvintes = new Set<() => void>();
const definirAberto = (v: boolean): void => {
  if (aberto === v) return;
  aberto = v;
  for (const o of ouvintes) o();
};

/** O diálogo está aberto? (leitura direta, para testes e para quem não usa React). */
export const importTerrenoAberto = (): boolean => aberto;

/** Hook de abertura do diálogo (também responde na renderização no servidor, usada pelos testes). */
export function useImportTerrenoAberto(): boolean {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    importTerrenoAberto,
    importTerrenoAberto,
  );
}

/** Abre o diálogo "Importar levantamento". A faixa (ficha U1) liga um botão a esta função e o `App` monta o diálogo. */
export function abrirImportTerreno(): void {
  definirAberto(true);
}

/** Fecha o diálogo. */
export function fecharImportTerreno(): void {
  definirAberto(false);
}

/** O que a importação aplica. `fontes` está nas coordenadas do ARQUIVO; a conversão para locais é feita aqui. */
export interface EntradaImportacao {
  levelId: Id;
  nome: string;
  fontes: FontesImportadas;
  /** Proposta de `localizacao` (só existe quando o projeto não tem). */
  proposta?: PropostaLocalizacao | null;
  /** A proposta foi aceita: grava a localização e leva as fontes para coordenadas locais. */
  aceitarProposta?: boolean;
  /** Rótulo do passo de desfazer (já traduzido). */
  rotulo?: string;
}

export interface ResultadoImportacao {
  terrenoId: Id;
  vertices: number;
}

/** Importação recusada antes de tocar no projeto; `bloqueio` traz a chave do dicionário para a interface traduzir. */
export class ImportacaoBloqueada extends Error {
  constructor(readonly bloqueio: Bloqueio) {
    super(bloqueio.chave);
  }
}

/**
 * Aplica a importação: `setLocalizacao` (se a proposta foi aceita), `addTerrain` e `editTerrainFontes` com
 * `substituirFontes`, num único comando `batch` (um desfazer remove terreno e localização juntos). Lança, sem alterar o
 * projeto, `ImportacaoBloqueada` se houver bloqueio (A.6) ou o erro do modelo se ele recusar o terreno.
 */
export function aplicarImportacaoTerreno(store: ProjectStore, entrada: EntradaImportacao, lang: Lang = 'pt'): ResultadoImportacao {
  const proposta = entrada.proposta ?? null;
  const aceita = entrada.aceitarProposta === true && proposta !== null;
  const finais = fontesFinais(entrada.fontes, proposta, aceita);
  const bloqueio = bloqueioDaImportacao(finais, entrada.levelId, lang);
  if (bloqueio !== null) throw new ImportacaoBloqueada(bloqueio);
  const id = newId('terreno');
  const comandos: Command[] = [];
  if (aceita) comandos.push({ type: 'setLocalizacao', localizacao: localizacaoDaProposta(proposta) });
  comandos.push(
    { type: 'addTerrain', terrain: terrenoDasFontes(id, entrada.levelId, entrada.nome, fontesVazias()) },
    { type: 'editTerrainFontes', terrenoId: id, ops: [{ op: 'substituirFontes', pontos: finais.pontos, curvas: finais.curvas, quebras: finais.quebras }] },
  );
  store.exec({ type: 'batch', commands: comandos }, entrada.rotulo, lang);
  return { terrenoId: id, vertices: contarVertices(finais) };
}
