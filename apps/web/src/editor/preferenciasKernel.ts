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

import { interpretarLista } from '@hestia/geom';

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
 * Configuração do despacho das fatias A e B (decisões 0047 §12 e 0050, B5; decisão do dono de 2026-11-06): o Rust é o ÚNICO caminho de produção das
 * fatias A e B e das quantidades. Em produção as duas fatias ficam SEMPRE ligadas e o wasm é sempre carregado; não existe opção para desligá-las.
 * Só o modo sombra (comparar com o TypeScript) é preferência do usuário.
 *
 * Em build de desenvolvimento (`import.meta.env.DEV`, o que inclui os testes) a URL ainda pode desligar para depuração: `?kernel=ts` desliga as duas
 * e `?kernelFatias=A`, `?kernelFatias=B` ou `?kernelFatias=A,B` escolhem quais ficam ligadas. Em produção esses parâmetros são ignorados.
 */
export function configDoDespacho(
  amb: AmbienteKernel = ambienteReal(),
  desenvolvimento: boolean = import.meta.env.DEV === true,
): { fatiaA: boolean; fatiaB: boolean; sombra: boolean } {
  let fatiaA = true;
  let fatiaB = true;
  if (desenvolvimento) {
    let params: URLSearchParams | null = null;
    try {
      params = new URLSearchParams(amb.busca ?? '');
    } catch {
      params = null;
    }
    const lista = interpretarLista(params?.get('kernelFatias'));
    if (lista) {
      fatiaA = lista.has('A');
      fatiaB = lista.has('B');
    } else if (params?.get('kernel') === 'ts') {
      fatiaA = false;
      fatiaB = false;
    }
  }
  return { fatiaA, fatiaB, sombra: (fatiaA || fatiaB) && lerModoSombra(amb) };
}
