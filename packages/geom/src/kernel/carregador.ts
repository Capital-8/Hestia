/**
 * Carregamento do kernel geométrico experimental.
 *
 * Regra deste módulo: **importar não tem efeito**. Nenhum `fetch` e nenhum import de asset acontece
 * no topo — só quando alguém chama `ativarKernelExperimental`/`garantirKernelExperimental`. Assim o
 * kernel desligado continua sendo o padrão em Node/vitest e no primeiro carregamento do app.
 *
 * Também nunca lança: qualquer falha vira `desativarKernel(motivo)` e o estado "indisponível".
 * O caminho `opcoes.bytes` existe para testes e para quem já tem o wasm em mãos; sem ele, o asset é
 * resolvido por `new URL(..., import.meta.url)` + `fetch` (em Node, `file:` falha e cai no estado
 * indisponível, como esperado).
 */
import { VERSAO_ABI, definirImplKernel, desativarKernel, estadoKernel, type EstadoKernel } from './contrato.ts';
import { criarImplKernelDoWasm } from './implementacaoRust.ts';

const LIMITE_MOTIVO = 180;

/**
 * Cada ativação/desativação incrementa a geração. Uma ativação que terminar depois de uma
 * desativação (ou de outra ativação) não registra a impl nem derruba a que está valendo.
 */
let geracao = 0;

/** Memoização de `garantirKernelExperimental`: uma única tentativa por sessão. */
let promessaGarantida: Promise<EstadoKernel> | null = null;
let tentativaConcluida = false;

/** Texto curto para o diagnóstico da interface; sem stack e sem quebras de linha. */
function motivoCurto(e: unknown): string {
  const texto = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').trim();
  const semPrefixo = texto.startsWith('kernel wasm: ') ? texto.slice('kernel wasm: '.length) : texto;
  const base = semPrefixo.length > 0 ? semPrefixo : 'wasm indisponível';
  const motivo = `wasm indisponível: ${base}`;
  return motivo.length > LIMITE_MOTIVO ? `${motivo.slice(0, LIMITE_MOTIVO - 3)}...` : motivo;
}

/**
 * URL do asset do kernel.
 *
 * O `.wasm` é um **asset separado**, servido ao lado do app: `scripts/copiar-wasm-dist.mjs` o copia
 * para a raiz do `dist` depois do build (o `vite-plugin-singlefile` inlinaria qualquer asset que
 * entrasse no grafo). Por isso a resolução é relativa à página (thread principal) ou ao próprio
 * script do worker — nos dois casos o arquivo está na mesma pasta.
 *
 * IMPORTANTE: nada de `new URL('../../assets/...', import.meta.url)` aqui. O Vite transforma esse
 * padrão em import de asset (com glob, no caso de caminho parcial) e o plugin single-file inlina o
 * wasm inteiro em base64 no bundle — ~320 kB para todo usuário, mesmo com o recurso desligado.
 */
const NOME_ASSET = 'geom_wasm.wasm';

function urlDoAsset(): URL {
  const g = globalThis as { location?: { href?: string } };
  const base = g.location?.href;
  if (typeof base !== 'string' || base.length === 0) {
    throw new Error('sem base de URL (ambiente sem location); passe `bytes` para ativar o kernel');
  }
  return new URL(NOME_ASSET, base);
}

/** Baixa o asset do wasm. Em Node, `file:` não é suportado por `fetch` e o erro é tratado pelo chamador. */
export async function baixarAsset(urlAbsoluta?: string): Promise<Uint8Array> {
  if (typeof fetch !== 'function') throw new Error('fetch indisponível para carregar o wasm');
  const url = urlAbsoluta ? new URL(urlAbsoluta) : urlDoAsset();
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} ao buscar ${url.pathname}`);
  // Servidor com fallback de SPA devolve o index.html com 200 no lugar do wasm: acusar já aqui, com a causa, em vez de "magic word" no compile.
  if (/text\/html/i.test(resposta.headers.get('content-type') ?? '')) throw new Error(`${url.pathname} devolveu HTML em vez do wasm (URL do asset errada)`);
  return new Uint8Array(await resposta.arrayBuffer());
}

/**
 * Ativa o kernel experimental, se o wasm estiver disponível. Idempotente quando já está ativo.
 * Nunca lança: devolve o estado — com `ativo: false` e `motivo` quando não foi possível.
 */
export async function ativarKernelExperimental(opcoes?: { bytes?: ArrayBuffer }): Promise<EstadoKernel> {
  if (estadoKernel().ativo) return estadoKernel();

  const minhaGeracao = ++geracao;
  try {
    const fonte = opcoes?.bytes ?? (await baixarAsset());
    const impl = await criarImplKernelDoWasm(fonte);
    if (minhaGeracao !== geracao) {
      // Desativado (ou substituído) enquanto instanciava: não registra.
      impl.encerrar?.();
      return estadoKernel();
    }
    definirImplKernel(impl, { versaoAbi: VERSAO_ABI });
    return estadoKernel();
  } catch (e) {
    if (minhaGeracao === geracao) desativarKernel(motivoCurto(e));
    return estadoKernel();
  }
}

/**
 * Ativa uma única vez por sessão e reaproveita a mesma promise: o worker e a thread principal podem
 * pedir em paralelo sem baixar o wasm duas vezes. Se já está ativo, devolve o estado atual.
 */
export function garantirKernelExperimental(): Promise<EstadoKernel> {
  const atual = estadoKernel();
  if (atual.ativo) return Promise.resolve(atual);
  if (promessaGarantida === null) {
    promessaGarantida = ativarKernelExperimental().finally(() => {
      tentativaConcluida = true;
    });
  }
  // Enquanto a tentativa da sessão está em voo, todos recebem a MESMA promise. Depois que ela
  // termina, devolve o estado atual (que pode ter mudado por uma desativação explícita) sem tentar
  // de novo: uma sessão tem no máximo uma tentativa automática.
  return tentativaConcluida ? Promise.resolve(estadoKernel()) : promessaGarantida;
}

/** Desliga o kernel e volta para o TypeScript. */
export function desativarKernelExperimental(razao = 'desligado pelo usuário'): void {
  // Invalida uma ativação em voo para ela não reativar o kernel depois desta chamada.
  geracao++;
  desativarKernel(razao);
}
