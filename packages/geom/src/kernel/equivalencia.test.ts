/**
 * Harness diferencial do kernel geométrico experimental (Rust → WebAssembly).
 *
 * Prova (ou refuta) a regra de ouro do experimento: o resultado geométrico é o mesmo com o kernel
 * ligado ou desligado. A referência é o `boolean.ts` TypeScript, chamado direto (sem o seam
 * `operacoesKernel.ts`) para que uma falha do kernel não seja mascarada pelo disjuntor.
 *
 * A suíte é **opcional**: se `packages/geom/assets/geom_wasm.wasm` não existir ou o módulo
 * `implementacaoRust.ts` ainda não estiver disponível, o `describe` inteiro é pulado — a suíte padrão
 * do repositório não pode ficar vermelha por causa de um experimento. Os testes do kernel rodam na
 * config separada `vitest.wasm.config.ts`.
 *
 * O carregamento do módulo do kernel é dinâmico e tolerante a falhas de propósito: o arquivo é criado
 * por outro agente e pode não existir no momento em que esta suíte é coletada. Nenhum `import`
 * estático pode quebrar a coleta do Vitest.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MultiPolygon } from '../polygon.ts';
import { caminhoDoWasm } from './caminhoWasm.ts';
import { definirImplKernel, resetarEstadoKernel, type ImplKernel } from './contrato.ts';
import {
  CASOS,
  compararResultados,
  ehNaoImplementada,
  executarKernel,
  executarTs,
  formatarDivergencias,
  rotuloOperacao,
  type Divergencia,
} from './fixtures.ts';

interface ModuloKernel {
  criarImplKernelDoWasm(fonte: ArrayBuffer | Uint8Array): Promise<ImplKernel>;
}

function moduloValido(valor: unknown): valor is ModuloKernel {
  if (typeof valor !== 'object' || valor === null) return false;
  const candidato = valor as { criarImplKernelDoWasm?: unknown };
  return typeof candidato.criarImplKernelDoWasm === 'function';
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const CAMINHO_WASM = caminhoDoWasm();
const CAMINHO_IMPL = resolve(AQUI, 'implementacaoRust.ts');
/** Alvos tentados em ordem: caminho absoluto (Vite resolve), URL de arquivo e caminho relativo. */
const ALVOS_IMPL = [CAMINHO_IMPL, pathToFileURL(CAMINHO_IMPL).href, './implementacaoRust.ts'];

async function carregarModulo(): Promise<ModuloKernel | null> {
  if (!existsSync(CAMINHO_IMPL)) return null;
  for (const alvo of ALVOS_IMPL) {
    try {
      const mod: unknown = await import(/* @vite-ignore */ alvo);
      if (moduloValido(mod)) return mod;
    } catch {
      // alvo indisponível: tenta o próximo (o módulo é escrito em paralelo por outro agente)
    }
  }
  return null;
}

const bytesWasm = existsSync(CAMINHO_WASM) ? new Uint8Array(readFileSync(CAMINHO_WASM)) : null;
const moduloKernel = bytesWasm === null ? null : await carregarModulo();

/**
 * A instância é criada na coleta (top-level await) de propósito: a regra é pular a suíte quando
 * `criarImplKernelDoWasm` rejeitar — por exemplo, enquanto a crate ainda é esqueleto — e uma
 * rejeição dentro de `beforeAll` reprovaria os testes em vez de pulá-los.
 */
let implCriado: ImplKernel | null = null;
let erroDeCriacao: string | null = null;
if (bytesWasm !== null && moduloKernel !== null) {
  try {
    implCriado = await moduloKernel.criarImplKernelDoWasm(bytesWasm);
  } catch (e) {
    erroDeCriacao = mensagem(e);
  }
}

const MOTIVO_SKIP =
  bytesWasm === null
    ? `artefato ausente (${CAMINHO_WASM})`
    : moduloKernel === null
      ? 'módulo implementacaoRust.ts indisponível'
      : erroDeCriacao === null
        ? null
        : `criarImplKernelDoWasm rejeitou: ${erroDeCriacao}`;

describe.skipIf(MOTIVO_SKIP !== null)(
  `equivalência geométrica TS × kernel wasm${MOTIVO_SKIP === null ? '' : ` — SKIP: ${MOTIVO_SKIP}`}`,
  () => {
    let impl: ImplKernel | null = null;

    const registrar = (): void => {
      if (impl !== null) definirImplKernel(impl, { versaoAbi: 1 });
    };

    beforeAll(() => {
      if (implCriado === null) throw new Error('kernel indisponível');
      impl = implCriado;
      registrar();
    });

    beforeEach(registrar);

    afterEach(() => {
      resetarEstadoKernel();
    });

    afterAll(() => {
      impl?.encerrar?.();
      definirImplKernel(null);
      resetarEstadoKernel();
      impl = null;
    });

    it(
      'mesmo resultado canônico em todos os casos e operações',
      () => {
        const kernel = impl;
        if (kernel === null) throw new Error('kernel não instanciado');
        const divergencias: Divergencia[] = [];
        // Operações que o kernel declara não implementar (hoje nenhuma): não são divergência
        // geométrica — o seam refaz só elas em TypeScript —, mas a cobertura é cobrada no fim.
        const naoImplementadas = new Map<string, number>();
        let operacoes = 0;
        for (const caso of CASOS) {
          for (const op of caso.operacoes) {
            operacoes++;
            const rotulo = rotuloOperacao(op);
            let referencia: MultiPolygon;
            try {
              referencia = executarTs(op);
            } catch (e) {
              divergencias.push({ caso: caso.id, operacao: rotulo, motivo: 'erro no caminho TS', delta: mensagem(e) });
              continue;
            }
            let resultado: MultiPolygon;
            try {
              resultado = executarKernel(kernel, op);
            } catch (e) {
              if (ehNaoImplementada(e)) {
                naoImplementadas.set(op.tipo, (naoImplementadas.get(op.tipo) ?? 0) + 1);
                continue;
              }
              divergencias.push({ caso: caso.id, operacao: rotulo, motivo: 'erro no kernel', delta: mensagem(e) });
              continue;
            }
            divergencias.push(...compararResultados(caso.id, rotulo, referencia, resultado));
          }
        }
        const cobertura =
          naoImplementadas.size === 0
            ? 'Cobertura total do kernel.'
            : `Cobertura parcial: ${[...naoImplementadas].map(([tipo, n]) => `${tipo} ×${n}`).join(', ')} não medidos (não implementados no kernel).`;
        if (naoImplementadas.size > 0) console.warn(`[equivalência] ${cobertura}`);
        const resumo = `${CASOS.length} casos, ${operacoes} operações comparadas. ${cobertura}`;
        expect(divergencias, `${resumo}\n\n${formatarDivergencias(divergencias)}`).toEqual([]);
        // Cobertura completa: uma operação que o kernel declara não implementar não é divergência
        // geométrica, mas também não prova equivalência. Falha compacta (uma linha por operação) em
        // vez de 84 linhas de "erro no kernel".
        const pendentes = [...naoImplementadas].map(([tipo, n]) => `${tipo}: ${n} chamada(s) não medidas`);
        expect(pendentes, `Cobertura incompleta do kernel — equivalência NÃO provada para:\n${pendentes.join('\n')}`).toEqual([]);
      },
      120_000,
    );
  },
);
