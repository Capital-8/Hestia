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
