/**
 * `ImplKernel` sobre o módulo wasm do `crates/geom-wasm`.
 *
 * O módulo é opcional: nada aqui toca o padrão do aplicativo. Quem instancia é o carregador
 * (`kernel/carregador.ts`), que trata qualquer rejeição como "indisponível" e deixa o TypeScript
 * atender tudo. Depois de registrada, cada chamada que falhar lança — e `operacoesKernel.ts` desliga
 * o kernel e refaz a operação em TypeScript.
 */
import { multiArea, type MultiPolygon } from '../polygon.ts';
import { contarEntrada, escreverEntrada, lerSaida, type ExportsKernel } from './abis.ts';
import { ERRO, ErroNaoImplementado, OP, VERSAO_ABI, type ImplKernel } from './contrato.ts';

/** Exportações que o ABI exige; a checagem em tempo de execução evita um wasm incompatível. */
const EXPORTACOES_OBRIGATORIAS = [
  'versao_abi',
  'preparar_entrada',
  'executar',
  'saida_vertices_ptr',
  'saida_vertices_len',
  'saida_aneis_ptr',
  'saida_aneis_len',
  'saida_poligonos_ptr',
  'saida_poligonos_len',
  'saida_area',
] as const;

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Confere os tipos das exportações e devolve a visão tipada do módulo. */
function validarExportacoes(brutas: WebAssembly.Exports): ExportsKernel {
  const faltando: string[] = [];
  for (const nome of EXPORTACOES_OBRIGATORIAS) {
    if (typeof brutas[nome] !== 'function') faltando.push(nome);
  }
  if (!(brutas.memory instanceof WebAssembly.Memory)) faltando.push('memory');
  if (faltando.length > 0) {
    throw new Error(`kernel wasm: exportações ausentes ou inválidas (${faltando.join(', ')})`);
  }
  return brutas as unknown as ExportsKernel;
}

/**
 * Travessia completa de uma operação: reservar → escrever → executar → decodificar.
 *
 * A ordem importa para o buffer destacado: as views de escrita só nascem depois de
 * `preparar_entrada`, e as de leitura só depois de `executar`, sempre a partir da `memory.buffer`
 * atual (ver `abis.ts`).
 */
function executarOperacao(exports: ExportsKernel, op: number, args: MultiPolygon[], param = 0): MultiPolygon {
  if (args.length === 0) throw new Error('kernel wasm: operação sem argumentos');
  const contagem = contarEntrada(args);
  const basePtr = exports.preparar_entrada(contagem.vertices, contagem.aneis, contagem.poligonos, contagem.args);
  escreverEntrada(exports.memory, basePtr, args, contagem);
  const codigo = exports.executar(op, contagem.args, param);
  if (codigo !== ERRO.OK) {
    // "Não implementado" não é falha: o seam refaz só esta operação em TypeScript e mantém o
    // kernel ativo para as demais.
    if (codigo === ERRO.NAO_IMPLEMENTADO) throw new ErroNaoImplementado(nomeDaOperacao(op));
    throw new Error('kernel wasm: ' + codigo);
  }
  return lerSaida(exports.memory, exports);
}

/** Nome legível da operação, para a mensagem de `ErroNaoImplementado`. */
function nomeDaOperacao(op: number): string {
  if (op === OP.UNIAO) return 'union';
  if (op === OP.DIFERENCA) return 'difference';
  if (op === OP.INTERSECAO) return 'intersection';
  if (op === OP.OFFSET) return 'offsetMulti';
  return `op ${op}`;
}

/** Quadrado 1×1 alinhado aos eixos, na orientação que o Clipper usa para anel externo. */
function quadradoUnitario(x: number, y: number): MultiPolygon {
  return [
    [
      [
        { x, y },
        { x: x + 1, y },
        { x: x + 1, y: y + 1 },
        { x, y: y + 1 },
      ],
    ],
  ];
}

/** Cria a `ImplKernel` sobre uma cópia do wasm, pronta para `definirImplKernel`. */
export async function criarImplKernelDoWasm(fonte: ArrayBuffer | Uint8Array): Promise<ImplKernel> {
  let instancia: WebAssembly.Instance;
  try {
    // `new Module`/`new Instance` em vez de `instantiate`: com a união `ArrayBuffer | Uint8Array` a
    // resolução de overload do TypeScript escolhe a assinatura de `Module` (que é estruturalmente
    // vazia) e devolveria `Instance` em vez de `{ instance }`.
    // O cast só acerta o genérico `ArrayBufferLike` de `Uint8Array` do TS 5.9; em tempo de execução
    // `BufferSource` aceita tanto `ArrayBuffer` quanto a view.
    instancia = new WebAssembly.Instance(new WebAssembly.Module(fonte as BufferSource), {});
  } catch (e) {
    throw new Error(`kernel wasm: falha ao instanciar (${mensagem(e)})`);
  }

  const exports = validarExportacoes(instancia.exports);

  const versao = exports.versao_abi();
  if (versao !== VERSAO_ABI) {
    throw new Error(`kernel wasm: ABI ${versao} incompatível (esperado ${VERSAO_ABI})`);
  }

  let descartado = false;
  const garantirAtivo = (): void => {
    if (descartado) throw new Error('kernel wasm: instância encerrada');
  };

  const impl: ImplKernel = {
    nome: 'rust',
    uniao(args: MultiPolygon[]): MultiPolygon {
      garantirAtivo();
      return executarOperacao(exports, OP.UNIAO, args);
    },
    diferenca(args: MultiPolygon[]): MultiPolygon {
      garantirAtivo();
      return executarOperacao(exports, OP.DIFERENCA, args);
    },
    interseccao(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
      garantirAtivo();
      return executarOperacao(exports, OP.INTERSECAO, [a, b]);
    },
    offset(m: MultiPolygon, delta: number): MultiPolygon {
      garantirAtivo();
      return executarOperacao(exports, OP.OFFSET, [m], delta);
    },
    encerrar(): void {
      descartado = true;
    },
  };

  // Smoke test de ida e volta: dois quadrados 1×1 disjuntos, união de área 2.
  // Se o wasm for só o esqueleto (ops.rs ainda devolvendo erro), a mensagem diz isso.
  try {
    const resultado = impl.uniao([quadradoUnitario(0, 0), quadradoUnitario(2, 0)]);
    const area = multiArea(resultado);
    if (Math.abs(area - 2) > 1e-6) {
      throw new Error(`área ${area}, esperado 2`);
    }
  } catch (e) {
    throw new Error(`kernel wasm: smoke test falhou — crate ainda é esqueleto ou ABI divergiu (${mensagem(e)})`);
  }

  return impl;
}
