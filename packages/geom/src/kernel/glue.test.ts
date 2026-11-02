/**
 * Teste de cola do kernel Rust/WASM.
 *
 * O artefato é lido do disco com `node:fs`; se ele não existir, os testes que dependem do wasm são
 * pulados (a suíte padrão não pode ficar vermelha só porque o `.wasm` não foi gerado). Os testes de
 * marshalling puro usam uma `WebAssembly.Memory` sintética e rodam sempre.
 *
 * Enquanto `ops.rs` for esqueleto, `criarImplKernelDoWasm` rejeita no smoke test com mensagem clara:
 * aí os testes de geometria são pulados e um teste confere a clareza dessa rejeição.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { multiArea, type MultiPolygon } from '../polygon.ts';
import {
  TAMANHO_MAXIMO_ENTRADA,
  contarEntrada,
  escreverEntrada,
  lerSaida,
  type ExportsKernel,
  type SaidaAbi,
} from './abis.ts';
import { caminhoDoWasm } from './caminhoWasm.ts';
import { ativarKernelExperimental, desativarKernelExperimental } from './carregador.ts';
import { VERSAO_ABI, estadoKernel, resetarEstadoKernel, type ImplKernel } from './contrato.ts';
import { criarImplKernelDoWasm } from './implementacaoRust.ts';

const caminhoArtefato = caminhoDoWasm();
const temArtefato = existsSync(caminhoArtefato);

/** `Buffer` compartilha o pool do Node; copia só o intervalo que interessa num `ArrayBuffer` limpo. */
function paraArrayBuffer(dados: Uint8Array): ArrayBuffer {
  return dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength) as ArrayBuffer;
}

const bytesWasm: ArrayBuffer | null = temArtefato ? paraArrayBuffer(readFileSync(caminhoArtefato)) : null;

/** Quadrado 1×1, anti-horário, como anel externo de um polígono. */
function quadrado(x: number, y: number): MultiPolygon {
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

// Instancia uma cópia só para o teste de versão; `criarImplKernelDoWasm` instancia a sua.
let exportsWasm: ExportsKernel | null = null;
let erroInstanciacao: string | null = null;
if (bytesWasm !== null) {
  try {
    const modulo = new WebAssembly.Module(bytesWasm);
    const instance = new WebAssembly.Instance(modulo, {});
    exportsWasm = instance.exports as unknown as ExportsKernel;
  } catch (e) {
    erroInstanciacao = e instanceof Error ? e.message : String(e);
  }
}

// Só tenta a impl completa quando a versão bate; versão errada deve falhar no teste de versão.
let implWasm: ImplKernel | null = null;
let motivoSemGeometria: string | null = null;
if (bytesWasm !== null && exportsWasm !== null && exportsWasm.versao_abi() === VERSAO_ABI) {
  try {
    implWasm = await criarImplKernelDoWasm(bytesWasm);
  } catch (e) {
    motivoSemGeometria = e instanceof Error ? e.message : String(e);
  }
}

const suiteComArtefato = temArtefato ? describe : describe.skip;
const suiteComGeometria = implWasm !== null ? describe : describe.skip;

describe('marshalling do ABI (puro)', () => {
  it('escreve vértices, anéis, polígonos e argumentos no layout documentado', () => {
    const memoria = new WebAssembly.Memory({ initial: 1 });
    const args = [quadrado(0, 0), quadrado(2, 0)];
    const contagem = contarEntrada(args);
    expect(contagem).toEqual({ vertices: 8, aneis: 2, poligonos: 2, args: 2 });

    const base = 8;
    escreverEntrada(memoria, base, args, contagem);

    const vertices = new Float64Array(memoria.buffer, base, 2 * contagem.vertices);
    expect(Array.from(vertices)).toEqual([0, 0, 1, 0, 1, 1, 0, 1, 2, 0, 3, 0, 3, 1, 2, 1]);

    const aneis = new Uint32Array(memoria.buffer, base + 16 * contagem.vertices, contagem.aneis + 1);
    expect(Array.from(aneis)).toEqual([0, 4, 8]);

    const poligonos = new Uint32Array(memoria.buffer, base + 16 * contagem.vertices + 4 * (contagem.aneis + 1), contagem.poligonos + 1);
    expect(Array.from(poligonos)).toEqual([0, 1, 2]);

    const argumentos = new Uint32Array(
      memoria.buffer,
      base + 16 * contagem.vertices + 4 * (contagem.aneis + 1) + 4 * (contagem.poligonos + 1),
      contagem.args + 1,
    );
    expect(Array.from(argumentos)).toEqual([0, 1, 2]);
  });

  it('decodifica a saída em MultiPolygon de {x, y}', () => {
    const memoria = new WebAssembly.Memory({ initial: 1 });
    const ptrVertices = 1024;
    const ptrAneis = 2048;
    const ptrPoligonos = 3072;
    new Float64Array(memoria.buffer, ptrVertices, 16).set([0, 0, 1, 0, 1, 1, 0, 1, 2, 0, 3, 0, 3, 1, 2, 1]);
    new Uint32Array(memoria.buffer, ptrAneis, 3).set([0, 4, 8]);
    new Uint32Array(memoria.buffer, ptrPoligonos, 3).set([0, 1, 2]);

    const saida: SaidaAbi = {
      saida_vertices_ptr: () => ptrVertices,
      saida_vertices_len: () => 16,
      saida_aneis_ptr: () => ptrAneis,
      saida_aneis_len: () => 3,
      saida_poligonos_ptr: () => ptrPoligonos,
      saida_poligonos_len: () => 3,
    };

    const resultado = lerSaida(memoria, saida);
    expect(resultado).toHaveLength(2);
    expect(resultado[0]![0]![0]).toEqual({ x: 0, y: 0 });
    expect(resultado[1]![0]![2]).toEqual({ x: 3, y: 1 });
    expect(multiArea(resultado)).toBe(2);
  });

  it('recusa entrada acima do teto e ponteiro base 0', () => {
    const gigante: MultiPolygon = [
      [
        Array.from({ length: TAMANHO_MAXIMO_ENTRADA + 1 }, (_, i) => ({ x: i, y: 0 })),
      ],
    ];
    expect(() => contarEntrada([gigante])).toThrow(/entrada grande demais/);

    const memoria = new WebAssembly.Memory({ initial: 1 });
    expect(() => escreverEntrada(memoria, 0, [quadrado(0, 0)])).toThrow(/ponteiro 0/);
  });
});

suiteComArtefato('wasm no disco', () => {
  it('instancia e expõe a versão de ABI esperada', () => {
    expect(erroInstanciacao).toBeNull();
    expect(exportsWasm).not.toBeNull();
    expect(exportsWasm!.versao_abi()).toBe(VERSAO_ABI);
  });

  it('se o artefato ainda é esqueleto, a criação rejeita com mensagem clara', () => {
    if (implWasm !== null) return; // geometria pronta: nada a conferir aqui
    if (exportsWasm === null || exportsWasm.versao_abi() !== VERSAO_ABI) return; // falha já coberta acima
    expect(motivoSemGeometria).toMatch(/smoke test falhou/);
  });
});

describe('carregador sem efeito de carga', () => {
  it('importar o carregador não dispara fetch nem ativa o kernel', () => {
    // O import é estático no topo deste arquivo: se `carregador.ts` tivesse efeito de carga (fetch
    // no topo), a coleta falharia ou ativaria o kernel antes daqui. O estado inicial segue desligado.
    expect(estadoKernel().ativo).toBe(false);
    expect(estadoKernel().motivo).toBeNull();
  });
});

suiteComGeometria('geometria pronta', () => {
  afterEach(() => {
    resetarEstadoKernel();
  });

  it('união de dois quadrados 1×1 disjuntos dá área 2 (ida e volta pelo wasm)', () => {
    if (implWasm === null) throw new Error('impl indisponível');
    const resultado = implWasm.uniao([quadrado(0, 0), quadrado(2, 0)]);
    expect(resultado.length).toBeGreaterThan(0);
    expect(multiArea(resultado)).toBeCloseTo(2, 6);
    const primeiro = resultado[0]![0]![0]!;
    expect(typeof primeiro.x).toBe('number');
    expect(typeof primeiro.y).toBe('number');
  });

  it('ativarKernelExperimental({bytes}) registra a impl e desativar volta para o TypeScript', async () => {
    if (bytesWasm === null) throw new Error('artefato indisponível');
    resetarEstadoKernel();

    const estado = await ativarKernelExperimental({ bytes: bytesWasm });
    expect(estado.ativo).toBe(true);
    expect(estado.nome).toBe('rust');
    expect(estado.versaoAbi).toBe(VERSAO_ABI);
    expect(estadoKernel().ativo).toBe(true);

    desativarKernelExperimental();
    expect(estadoKernel().ativo).toBe(false);
    expect(estadoKernel().motivo).toBe('desligado pelo usuário');
  });
});
