/**
 * Preferência de aplicação do kernel geométrico experimental (Rust → WebAssembly).
 *
 * O flag é do aplicativo, nunca do projeto: fica no `localStorage` do navegador e **não** entra em
 * `Project.settings` nem no arquivo `.hestia`. Quem quiser forçar o caminho numa medição usa a URL
 * (`?kernel=rust` ou `?kernel=ts`), que vence o armazenamento.
 *
 * Sem efeito colateral no import e tolerante a ambiente sem `localStorage`/`location` (worker, teste):
 * nesse caso o padrão é o TypeScript, exatamente como hoje.
 */

import { CHAVE_FATIAS, FATIAS, interpretarLista, kernelFatiaLigada, type Fatia } from '@hestia/geom';

/** Caminho escolhido pelo usuário: o kernel experimental (`rust`) ou o TypeScript de sempre (`ts`). */
export type FlagKernel = 'rust' | 'ts';

/** Chave do `localStorage`; preferência de aplicação, fora do projeto. */
export const CHAVE_KERNEL = 'hestia:kernel';

const ehFlag = (valor: string | null | undefined): valor is FlagKernel => valor === 'rust' || valor === 'ts';

/** `localStorage` do ambiente, ou `null` quando não existe ou o acesso é bloqueado (modo privado, worker). */
function armazenamento(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Flag vinda da URL (`?kernel=rust` / `?kernel=ts`). Vence o `localStorage`, para o harness de medição
 * conseguir forçar o caminho sem mexer na preferência salva. `null`: a URL não opina.
 */
export function lerFlagDaUrl(): FlagKernel | null {
  try {
    if (typeof location === 'undefined') return null;
    const valor = new URLSearchParams(location.search).get('kernel');
    return ehFlag(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Flag salva no navegador, ou `null` quando não há (ou o armazenamento não está disponível). */
export function lerFlagSalva(): FlagKernel | null {
  try {
    const valor = armazenamento()?.getItem(CHAVE_KERNEL);
    return ehFlag(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** O kernel experimental está ligado? URL > `localStorage` > padrão (`ts`, desligado). */
export function kernelExperimentalLigado(): boolean {
  const daUrl = lerFlagDaUrl();
  if (daUrl !== null) return daUrl === 'rust';
  return lerFlagSalva() === 'rust';
}

/**
 * Grava a preferência. Só persiste o flag: quem chama decide quando ativar/desativar o kernel.
 * Sem `localStorage` a chamada não falha — a escolha vale só para a sessão.
 */
export function ligarKernelExperimental(ligado: boolean): void {
  try {
    armazenamento()?.setItem(CHAVE_KERNEL, ligado ? 'rust' : 'ts');
  } catch {
    // Armazenamento indisponível ou cheio: nada a fazer, o padrão continua valendo ao recarregar.
  }
}

/**
 * Fatias do kernel v2 (decisão 0046 §2.6): `?kernelFatias=A,B` / `hestia:kernel:fatias`. `?kernel=rust` e a preferência acima
 * (`hestia:kernel`) ligam todas as fatias; o comportamento do kernel v1 não muda.
 */
export { kernelFatiaLigada, fatiasLigadas, type Fatia } from '@hestia/geom';

/** Acesso à URL e ao `localStorage`, injetável nos testes. O padrão lê o ambiente real. */
export interface AmbienteKernel {
  busca?: string | null;
  ler?: (chave: string) => string | null;
  gravar?: (chave: string, valor: string | null) => void;
}

function ambienteReal(): AmbienteKernel {
  let busca: string | null = null;
  try {
    busca = typeof location === 'undefined' ? null : location.search;
  } catch {
    busca = null;
  }
  return {
    busca,
    ler: (chave) => armazenamento()?.getItem(chave) ?? null,
    gravar: (chave, valor) => {
      const a = armazenamento();
      if (!a) return;
      if (valor === null) a.removeItem(chave);
      else a.setItem(chave, valor);
    },
  };
}

/** Fatias que o interruptor do diálogo "Experimentais" libera. As demais aparecem desabilitadas. */
export const FATIAS_HABILITADAS: readonly Fatia[] = ['A', 'B'];

/** Lista de fatias gravada pelo diálogo (`hestia:kernel:fatias`); vazia quando não há. */
export function lerFatiasSalvas(amb: AmbienteKernel = ambienteReal()): Set<Fatia> {
  return interpretarLista(amb.ler?.(CHAVE_FATIAS)) ?? new Set<Fatia>();
}

/**
 * Grava a lista de fatias no formato que `fatias.ts` lê (`A,C`, em ordem). Lista vazia grava `-`: texto não nulo
 * sem fatias conhecidas, que `fatias.ts` lê como "nenhuma fatia" e que vence `hestia:kernel=rust`.
 */
export function gravarFatiasSalvas(fatias: ReadonlySet<Fatia>, amb: AmbienteKernel = ambienteReal()): void {
  const texto = FATIAS.filter((f) => fatias.has(f)).join(',') || '-';
  amb.gravar?.(CHAVE_FATIAS, texto);
}

/** Qual parâmetro da URL trava as fatias: `kernelFatias` (lista), `kernel` (`rust`/`ts`) ou `null` (a URL não opina). */
export function forcaDaUrl(amb: AmbienteKernel = ambienteReal()): 'kernelFatias' | 'kernel' | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(amb.busca ?? '');
  } catch {
    return null;
  }
  if (interpretarLista(params.get('kernelFatias'))) return 'kernelFatias';
  const geral = params.get('kernel');
  return geral === 'rust' || geral === 'ts' ? 'kernel' : null;
}

/** Chave do modo sombra (decisão 0046 §7.1). A lógica fica em `packages/engine/src/kernelDespacho.ts` (decisão 0047 §12). */
export const CHAVE_MODO_SOMBRA = 'hestia:kernel:sombra';

/** Modo sombra ligado? Padrão `false`; só `'true'` liga. */
export function lerModoSombra(amb: AmbienteKernel = ambienteReal()): boolean {
  return amb.ler?.(CHAVE_MODO_SOMBRA) === 'true';
}

/** Grava o modo sombra (`'true'` liga; desligar remove a chave). Vale ao recarregar a página. */
export function gravarModoSombra(ligado: boolean, amb: AmbienteKernel = ambienteReal()): void {
  amb.gravar?.(CHAVE_MODO_SOMBRA, ligado ? 'true' : null);
}

/**
 * Configuração do despacho das fatias A e B (decisões 0047 §12 e 0050, B5), lida do ambiente: cada fatia ligada (URL > `localStorage`) e o modo
 * sombra, que só vale com ao menos uma fatia ligada (e vale para cada fatia ligada). Sem fatia, nada é instalado nem baixado: o padrão continua
 * TypeScript.
 */
export function configDoDespacho(amb: AmbienteKernel = ambienteReal()): { fatiaA: boolean; fatiaB: boolean; sombra: boolean } {
  const ambFatias = { busca: amb.busca ?? null, ler: amb.ler ?? (() => null) };
  const fatiaA = kernelFatiaLigada('A', ambFatias);
  const fatiaB = kernelFatiaLigada('B', ambFatias);
  return { fatiaA, fatiaB, sombra: (fatiaA || fatiaB) && lerModoSombra(amb) };
}
