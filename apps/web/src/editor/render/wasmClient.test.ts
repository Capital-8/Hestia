/**
 * Testes do adaptador Rust/WASM (T8).
 *
 * Duas camadas:
 * 1. bytes e matemática — não precisam de wasm nenhum;
 * 2. cliente com um mock de `WebAssembly.Memory`/exportações, que força crescimento de memória
 *    entre `alocar` e a escrita para provar que o cliente relê `memory.buffer`;
 * 3. integração opcional com o asset real (`packages/render/assets/render_wasm.wasm`), pulada
 *    quando o wasm ainda não foi buildado (a suíte padrão não pode depender do artefato).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SheetView3DCamera } from '@hestia/model';
import type { RenderSceneSnapshot } from '@hestia/render';
import {
  ClienteRenderWasm,
  CODIGO_RENDER,
  ErroRenderWasm,
  codificarCamera,
  codificarCena,
  codificarSol,
  codificarTrabalho,
  criarClienteWasm,
  ehCancelamento,
  fatorExposicao,
  type ExportsRenderWasm,
} from './wasmClient.ts';
import { quadroDaCamera, renderizarQuadroRgba } from './rustStillRenderer.ts';

const CAMERA: SheetView3DCamera = {
  azimuth: 0,
  elevation: 0.8,
  distance: 8,
  target: { x: 0, y: 0, z: 0 },
  ortho: false,
};

/** Triângulo no chão, um material e um lote: cena mínima válida para o Rust. */
function cenaExemplo(): RenderSceneSnapshot {
  return {
    version: 1,
    positions: new Float32Array([-2, -2, 0, 2, -2, 0, 0, 2, 0]),
    indices: new Uint32Array([0, 1, 2]),
    materials: [
      {
        baseColor: [0.6, 0.4, 0.2],
        roughness: 0.8,
        metallic: 0,
        opacity: 1,
        transmission: 0,
        ior: 1.5,
        emissive: [0, 0, 0],
      },
    ],
    batches: [{ indexStart: 0, indexCount: 3, material: 0 }],
    sun: { azimuth: 135, elevation: 45, intensity: 3 },
    background: [0.8, 0.85, 0.9],
    camera: quadroDaCamera(CAMERA, 1),
  };
}

function lerTexto(bytes: Uint8Array, inicio: number, tamanho: number): string {
  return String.fromCharCode(...bytes.subarray(inicio, inicio + tamanho));
}

describe('formato HSTR/HSWK', () => {
  it('serializa a cena com cabeçalho e seções na ordem do Rust', () => {
    const cena = cenaExemplo();
    const bytes = codificarCena(cena);
    // 32 do cabeçalho + 3 vértices + 3 índices + 1 material (52 bytes na v2) + 1 lote + sol + fundo + câmera.
    expect(bytes.length).toBe(32 + 36 + 12 + 52 + 12 + 12 + 12 + 148);
    expect(lerTexto(bytes, 0, 4)).toBe('HSTR');

    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(2); // versão
    expect(view.getUint32(8, true)).toBe(3); // vértices
    expect(view.getUint32(12, true)).toBe(3); // índices
    expect(view.getUint32(16, true)).toBe(0); // sem normais
    expect(view.getUint32(20, true)).toBe(1); // materiais
    expect(view.getUint32(24, true)).toBe(1); // lotes
    expect(view.getUint32(28, true)).toBe(2); // bit 1 = fundo

    expect(view.getFloat32(32, true)).toBeCloseTo(-2, 6);
    expect(view.getUint32(32 + 36, true)).toBe(0); // primeiro índice
    expect(view.getFloat32(32 + 36 + 12, true)).toBeCloseTo(0.6, 6); // cor base
    expect(view.getUint32(32 + 36 + 12 + 52, true)).toBe(0); // início do lote
    expect(view.getFloat32(32 + 36 + 12 + 52 + 12, true)).toBe(135); // azimute
    expect(view.getFloat32(32 + 36 + 12 + 52 + 12 + 12, true)).toBeCloseTo(0.8, 5); // fundo
    expect(view.getFloat32(bytes.length - 1 * 4, true)).toBeCloseTo(cena.camera.far, 3);
  });

  it('liga o bit de normais e aceita o snapshot sem fundo', () => {
    const cena = { ...cenaExemplo(), background: null as null, normals: new Float32Array(9) };
    const bytes = codificarCena(cena);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16, true)).toBe(3);
    expect(view.getUint32(28, true)).toBe(1);
    expect(bytes.length).toBe(32 + 36 + 12 + 36 + 52 + 12 + 12 + 148);
  });

  it('recusa cena fora do contrato antes de tocar no wasm', () => {
    const base = cenaExemplo();
    expect(() => codificarCena({ ...base, positions: new Float32Array([0, 0, 0]) })).toThrow(ErroRenderWasm);
    expect(() => codificarCena({ ...base, indices: new Uint32Array([0, 1, 9]) })).toThrow(ErroRenderWasm);
    const versaoErrada = { ...base, version: 2 } as unknown as RenderSceneSnapshot;
    expect(() => codificarCena(versaoErrada)).toThrow(ErroRenderWasm);
    const comNan = new Float32Array(base.positions);
    comNan[0] = Number.NaN;
    expect(() => codificarCena({ ...base, positions: comNan })).toThrow(ErroRenderWasm);
  });

  it('serializa o trabalho HSWK v1 em 24 bytes', () => {
    const bytes = codificarTrabalho({ largura: 320, altura: 180, exposicao: 1.25 });
    expect(bytes.length).toBe(24);
    expect(lerTexto(bytes, 0, 4)).toBe('HSWK');
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(1);
    expect(view.getUint32(8, true)).toBe(320);
    expect(view.getUint32(12, true)).toBe(180);
    expect(view.getFloat32(16, true)).toBeCloseTo(1.25, 6);
    expect(view.getUint32(20, true)).toBe(0);
    expect(() => codificarTrabalho({ largura: 0, altura: 10, exposicao: 1 })).toThrow(ErroRenderWasm);
  });

  it('serializa câmera (37 f32) e sol (3 f32) para o vídeo', () => {
    const quadro = quadroDaCamera(CAMERA, 16 / 9);
    const bytesCamera = codificarCamera(quadro);
    expect(bytesCamera.length).toBe(148);
    const view = new DataView(bytesCamera.buffer);
    expect(view.getFloat32(0, true)).toBeCloseTo(quadro.view[0] as number, 6);
    expect(view.getFloat32(32 * 4, true)).toBeCloseTo(quadro.position[0], 5);
    expect(view.getFloat32(36 * 4, true)).toBeCloseTo(quadro.far, 3);

    const bytesSol = codificarSol({ azimuth: 30, elevation: 60, intensity: 2.5 });
    expect(bytesSol.length).toBe(12);
    const viewSol = new DataView(bytesSol.buffer);
    expect(viewSol.getFloat32(0, true)).toBeCloseTo(30, 5);
    expect(viewSol.getFloat32(8, true)).toBeCloseTo(2.5, 6);
  });

  it('exposição é em paradas, como no inspetor', () => {
    expect(fatorExposicao(0)).toBe(1);
    expect(fatorExposicao(1)).toBe(2);
    expect(fatorExposicao(-2)).toBe(0.25);
  });
});

/** Fixture commitável gerado pelo encoder (ver o cabeçalho de `cenaTiposV2`): lido também pelo Rust. */
const FIXTURE_TIPOS_V2 = fileURLToPath(new URL('./fixtures/cena-tipos-v2.hstr', import.meta.url));

/**
 * Três triângulos, um por material: tipo 1 (reboco) com escala 2.5, tipo 3 (telha) e tipo 6 (vidro).
 * O fixture `fixtures/cena-tipos-v2.hstr` é exatamente `codificarCena` desta cena; o teste abaixo confere os dois.
 */
function cenaTiposV2(): RenderSceneSnapshot {
  const base = cenaExemplo().materials[0]!;
  return {
    version: 1,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0, 4, 0, 0, 5, 0, 0, 4, 1, 0]),
    indices: new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]),
    materials: [
      { ...base, tipo: 1, escala: 2.5 },
      { ...base, tipo: 3 },
      { ...base, tipo: 6 },
    ],
    batches: [
      { indexStart: 0, indexCount: 3, material: 0 },
      { indexStart: 3, indexCount: 3, material: 1 },
      { indexStart: 6, indexCount: 3, material: 2 },
    ],
    sun: { azimuth: 135, elevation: 45, intensity: 3 },
    background: [0.8, 0.85, 0.9],
    camera: quadroDaCamera(CAMERA, 1),
  };
}

describe('HSTR v2: tipo e escala por material', () => {
  it('escreve versão 2 e tamanho exato com 52 bytes por material', () => {
    const bytes = codificarCena(cenaTiposV2());
    // 32 + 9 vértices × 12 + 9 índices × 4 + 3 materiais × 52 + 3 lotes × 12 + sol 12 + fundo 12 + câmera 148.
    expect(bytes.length).toBe(32 + 9 * 12 + 9 * 4 + 3 * 52 + 3 * 12 + 12 + 12 + 148);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(20, true)).toBe(3);
  });

  it('põe tipo (u32) e escala (f32) logo após os 44 bytes de cada material', () => {
    const bytes = codificarCena(cenaTiposV2());
    const view = new DataView(bytes.buffer);
    const material0 = 32 + 9 * 12 + 9 * 4; // 176: início do primeiro material
    expect(view.getFloat32(material0, true)).toBeCloseTo(0.6, 6); // cor base (os 44 bytes antigos seguem iguais)
    expect(view.getUint32(material0 + 44, true)).toBe(1);
    expect(view.getFloat32(material0 + 48, true)).toBe(2.5);
    const material2 = material0 + 2 * 52;
    expect(view.getUint32(material2 + 44, true)).toBe(6);
    expect(view.getFloat32(material2 + 48, true)).toBe(1);
    // A seção seguinte (lotes) começa logo após o último material de 52 bytes.
    expect(view.getUint32(material0 + 3 * 52, true)).toBe(0);
    expect(view.getUint32(material0 + 3 * 52 + 4, true)).toBe(3);
  });

  it('limita tipo a inteiro 0..7 e troca escala inválida por 1.0; material sem campos vira liso', () => {
    const base = cenaExemplo().materials[0]!;
    const materiais = [
      { ...base, tipo: 9, escala: 0 },
      { ...base, tipo: -3, escala: Number.NaN },
      { ...base, tipo: 2.4, escala: 2.5 },
      { ...base, tipo: Number.NaN, escala: Number.POSITIVE_INFINITY },
      { ...base, tipo: 6, escala: -1 },
      base,
    ];
    const cena = {
      ...cenaExemplo(),
      materials: materiais,
      batches: materiais.map((_, i) => ({ indexStart: 0, indexCount: 3, material: i })),
    };
    const view = new DataView(codificarCena(cena).buffer);
    const inicio = 32 + 36 + 12; // primeiro material (um triângulo)
    const tipos = materiais.map((_, i) => view.getUint32(inicio + i * 52 + 44, true));
    const escalas = materiais.map((_, i) => view.getFloat32(inicio + i * 52 + 48, true));
    expect(tipos).toEqual([7, 0, 2, 0, 6, 0]);
    expect(escalas).toEqual([1, 1, 2.5, 1, 1, 1]);
  });

  it('o fixture cena-tipos-v2.hstr é o encoder desta cena e tem o layout v2 nos offsets certos', () => {
    const arquivo = new Uint8Array(readFileSync(FIXTURE_TIPOS_V2));
    expect(Array.from(arquivo)).toEqual(Array.from(codificarCena(cenaTiposV2())));
    expect(arquivo.length).toBe(540);
    expect(lerTexto(arquivo, 0, 4)).toBe('HSTR');
    const view = new DataView(arquivo.buffer);
    expect(view.getUint32(4, true)).toBe(2); // versão
    expect(view.getUint32(8, true)).toBe(9); // vértices
    expect(view.getUint32(12, true)).toBe(9); // índices
    expect(view.getUint32(16, true)).toBe(0); // sem normais
    expect(view.getUint32(20, true)).toBe(3); // materiais
    expect(view.getUint32(24, true)).toBe(3); // lotes
    expect(view.getUint32(28, true)).toBe(2); // bit de fundo
    const material0 = 176;
    expect(view.getUint32(material0 + 44, true)).toBe(1); // tipo do material 0
    expect(view.getFloat32(material0 + 48, true)).toBe(2.5); // escala do material 0
    expect(view.getUint32(material0 + 52 + 44, true)).toBe(3); // tipo do material 1
    expect(view.getUint32(material0 + 104 + 44, true)).toBe(6); // tipo do material 2
  });
});

/** SHA-256 do `codificarCena(cenaExemplo())` gerado pelo encoder v2 ANTES da v3 (regressão: sem textura, bytes idênticos). */
const HASH_V2_CENA_EXEMPLO = '29abe30f499415e6d21e137e77bc848b071a10b102d4750fe3e48835476c3edd';
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Textura 2×2 RGBA8 com dois níveis de mip (2×2 e 1×1), referenciada pelo albedo do único material. */
function cenaComTextura(): RenderSceneSnapshot {
  const base = cenaExemplo();
  const nivel0 = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const nivel1 = Uint8Array.from([100, 110, 120, 255]);
  return {
    ...base,
    materials: [{ ...base.materials[0]!, mapas: { albedo: 0 } }],
    texturas: [{ largura: 2, altura: 2, mips: [nivel0, nivel1] }],
  };
}

describe('HSTR v3: texturas', () => {
  it('sem texturas (ausente ou lista vazia) a cena continua v2 com bytes idênticos aos de antes', () => {
    // Mesma cena da captura de hash feita antes da v3: 4 vértices (o quarto solto), fundo, um material, um lote.
    const base = cenaExemplo();
    const cena = { ...base, positions: new Float32Array([-2, -2, 0, 2, -2, 0, 0, 2, 0, 1, 1, 1]) };
    expect(codificarCena(cena).length).toBe(328);
    expect(sha256(codificarCena(cena))).toBe(HASH_V2_CENA_EXEMPLO);
    expect(sha256(codificarCena({ ...cena, texturas: [] }))).toBe(HASH_V2_CENA_EXEMPLO);
    const view = new DataView(codificarCena(cena).buffer);
    expect(view.getUint32(4, true)).toBe(2);
  });

  it('com textura: versão 3, material de 68 bytes com índice 0 no albedo e 0xFFFFFFFF nos demais canais', () => {
    const bytes = codificarCena(cenaComTextura());
    // 32 + 3 vértices (36) + 3 índices (12) + 1 material v3 (68) + seção de texturas (36) + lote (12) + sol, fundo, câmera.
    expect(bytes.length).toBe(32 + 36 + 12 + 68 + 36 + 12 + 12 + 12 + 148);
    expect(lerTexto(bytes, 0, 4)).toBe('HSTR');
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(3);
    const indicesDoMaterial = 32 + 36 + 12 + 52; // offset dos 4 u32 de textura do material 0
    expect(view.getUint32(indicesDoMaterial, true)).toBe(0); // albedo
    expect(view.getUint32(indicesDoMaterial + 4, true)).toBe(0xffffffff); // normal
    expect(view.getUint32(indicesDoMaterial + 8, true)).toBe(0xffffffff); // rugosidade
    expect(view.getUint32(indicesDoMaterial + 12, true)).toBe(0xffffffff); // metálico
  });

  it('seção de texturas logo após os materiais: quantidade, largura, altura, níveis e pixels nos offsets certos', () => {
    const bytes = codificarCena(cenaComTextura());
    const view = new DataView(bytes.buffer);
    const secao = 32 + 36 + 12 + 68; // 148: início da seção
    expect(view.getUint32(secao, true)).toBe(1); // quantidade de texturas
    expect(view.getUint32(secao + 4, true)).toBe(2); // largura
    expect(view.getUint32(secao + 8, true)).toBe(2); // altura
    expect(view.getUint32(secao + 12, true)).toBe(2); // níveis de mip
    expect(Array.from(bytes.subarray(secao + 16, secao + 32))).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(Array.from(bytes.subarray(secao + 32, secao + 36))).toEqual([100, 110, 120, 255]);
    // Os lotes vêm logo depois da seção: primeiro índice 0, contagem 3.
    expect(view.getUint32(secao + 36, true)).toBe(0);
    expect(view.getUint32(secao + 40, true)).toBe(3);
  });

  it('material sem mapa explícito recebe 0xFFFFFFFF nos quatro canais mesmo com texturas na cena', () => {
    const cena = cenaComTextura();
    const semMapa = { ...cena, materials: [{ ...cena.materials[0]!, mapas: undefined }] };
    const view = new DataView(codificarCena(semMapa).buffer);
    for (let canal = 0; canal < 4; canal++) expect(view.getUint32(32 + 36 + 12 + 52 + canal * 4, true)).toBe(0xffffffff);
  });

  it('recusa textura de 0 ou acima de 8192 pixels de lado, em pt-BR', () => {
    const base = cenaComTextura();
    const comLargura = (largura: number) => ({ ...base, texturas: [{ ...base.texturas![0]!, largura }] });
    expect(() => codificarCena(comLargura(8193))).toThrow(/entre 1 e 8192/);
    expect(() => codificarCena(comLargura(0))).toThrow(ErroRenderWasm);
    const alturaGrande = { ...base, texturas: [{ ...base.texturas![0]!, altura: 9000 }] };
    expect(() => codificarCena(alturaGrande)).toThrow(/textura 0 tem 2×9000/);
  });

  it('recusa mais de 64 texturas, em pt-BR', () => {
    const textura = { largura: 1, altura: 1, mips: [new Uint8Array(4)] };
    const sessenta = Array.from({ length: 64 }, () => textura);
    const cena = { ...cenaComTextura(), texturas: sessenta };
    expect(codificarCena(cena).length).toBeGreaterThan(0);
    expect(() => codificarCena({ ...cena, texturas: [...sessenta, textura] })).toThrow(/o máximo é 64/);
  });

  it('recusa pixels com tamanho errado e níveis de mip além da cadeia', () => {
    const base = cenaComTextura();
    const pixelsCurtos = { ...base, texturas: [{ largura: 2, altura: 2, mips: [new Uint8Array(15), new Uint8Array(4)] }] };
    expect(() => codificarCena(pixelsCurtos)).toThrow(/textura 0, nível 0: esperados 16 bytes/);
    const niveisDemais = { ...base, texturas: [{ largura: 2, altura: 2, mips: [new Uint8Array(16), new Uint8Array(4), new Uint8Array(4)] }] };
    expect(() => codificarCena(niveisDemais)).toThrow(/níveis de mip/);
  });

  it('recusa índice de textura fora da lista, inclusive com a cena sem texturas', () => {
    const base = cenaComTextura();
    const indiceErrado = { ...base, materials: [{ ...base.materials[0]!, mapas: { normal: 1 } }] };
    expect(() => codificarCena(indiceErrado)).toThrow(/normal aponta para a textura 1, fora de 0..0/);
    const semTexturas = { ...cenaExemplo(), materials: [{ ...cenaExemplo().materials[0]!, mapas: { albedo: 0 } }] };
    expect(() => codificarCena(semTexturas)).toThrow(ErroRenderWasm);
  });
});

describe('câmera orbital → matrizes do Rust', () => {
  it('posiciona a câmera e leva o olho para a origem da view', () => {
    const camera: SheetView3DCamera = { azimuth: 0, elevation: 0, distance: 10, target: { x: 0, y: 0, z: 0 }, ortho: false };
    const quadro = quadroDaCamera(camera, 16 / 9);
    expect(quadro.position[0]).toBeCloseTo(10, 6);
    expect(quadro.position[1]).toBeCloseTo(0, 6);
    expect(quadro.position[2]).toBeCloseTo(0, 6);

    const x = quadro.position[0];
    const y = quadro.position[1];
    const z = quadro.position[2];
    const view = quadro.view;
    // Coluna maior: v' = M · v.
    expect(view[0]! * x + view[4]! * y + view[8]! * z + view[12]!).toBeCloseTo(0, 5);
    expect(view[1]! * x + view[5]! * y + view[9]! * z + view[13]!).toBeCloseTo(0, 5);
    expect(view[2]! * x + view[6]! * y + view[10]! * z + view[14]!).toBeCloseTo(0, 5);
    expect(quadro.near).toBeGreaterThan(0);
    expect(quadro.far).toBeGreaterThan(quadro.near);
    expect(quadro.projection[11]).toBe(-1);
  });

  it('usa projeção ortográfica quando a câmera pede', () => {
    const quadro = quadroDaCamera({ ...CAMERA, ortho: true }, 1);
    expect(quadro.projection[11]).toBe(0);
    expect(quadro.projection[15]).toBe(1);
    expect(quadro.projection.every(Number.isFinite)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Cliente com wasm mockado (cresce a memória em `alocar` de propósito)
// ---------------------------------------------------------------------------------------------

const BASE_ENTRADA = 4096;
const BASE_SAIDA = 49152;

interface EstadoMock {
  cena: Uint8Array | null;
  trabalho: Uint8Array | null;
  camera: Uint8Array | null;
  sol: Uint8Array | null;
  bloco: [number, number, number, number, number, number] | null;
  cancelado: boolean;
  crescimento: number;
}

function criarMock(): { exports: ExportsRenderWasm; estado: EstadoMock } {
  const memoria = new WebAssembly.Memory({ initial: 1, maximum: 256 });
  const estado: EstadoMock = {
    cena: null,
    trabalho: null,
    camera: null,
    sol: null,
    bloco: null,
    cancelado: false,
    crescimento: 0,
  };
  const exports: ExportsRenderWasm = {
    memory: memoria,
    versao_abi: () => 1,
    alocar: (bytes) => {
      if (bytes <= 0) return 0;
      // Cresce SEMPRE: qualquer view antiga de memory.buffer ficaria destacada aqui.
      memoria.grow(1);
      estado.crescimento++;
      return BASE_ENTRADA;
    },
    carregar_cena: (ptr, len) => {
      estado.cena = new Uint8Array(memoria.buffer, ptr, len).slice();
      return 0;
    },
    preparar_trabalho: (ptr, len) => {
      estado.trabalho = new Uint8Array(memoria.buffer, ptr, len).slice();
      return 0;
    },
    renderizar_bloco: (x, y, w, h, spp, seed) => {
      if (estado.cancelado) return CODIGO_RENDER.cancelado;
      estado.bloco = [x, y, w, h, spp, seed];
      const total = w * h * 4;
      const saida = new Uint8Array(memoria.buffer, BASE_SAIDA, total);
      for (let i = 0; i < total; i += 4) {
        saida[i] = 200;
        saida[i + 1] = 100;
        saida[i + 2] = 50;
        saida[i + 3] = 255;
      }
      return 0;
    },
    saida_ptr: () => BASE_SAIDA,
    saida_len: () => (estado.bloco ? estado.bloco[2] * estado.bloco[3] * 4 : 0),
    atualizar_camera: (ptr, len) => {
      estado.camera = new Uint8Array(memoria.buffer, ptr, len).slice();
      return 0;
    },
    atualizar_sol: (ptr, len) => {
      estado.sol = new Uint8Array(memoria.buffer, ptr, len).slice();
      return 0;
    },
    cancelar: () => {
      estado.cancelado = true;
      return 0;
    },
    limpar_cancelamento: () => {
      estado.cancelado = false;
      return 0;
    },
  };
  return { exports, estado };
}

describe('ClienteRenderWasm (mock)', () => {
  it('entrega exatamente os bytes HSTR/HSWK e sobrevive ao crescimento da memória', () => {
    const { exports, estado } = criarMock();
    const cliente = new ClienteRenderWasm(exports);
    const cena = cenaExemplo();

    cliente.carregarCena(cena);
    expect(Array.from(estado.cena!)).toEqual(Array.from(codificarCena(cena)));
    expect(estado.crescimento).toBe(1);

    cliente.prepararTrabalho({ largura: 4, altura: 4, exposicao: 1 });
    expect(lerTexto(estado.trabalho!, 0, 4)).toBe('HSWK');
    expect(estado.crescimento).toBe(2);

    const pixels = cliente.renderizarBloco(0, 0, 4, 4, 1, 7);
    expect(pixels.length).toBe(64);
    expect(Array.from(pixels.subarray(0, 4))).toEqual([200, 100, 50, 255]);
    expect(estado.bloco).toEqual([0, 0, 4, 4, 1, 7]);
  });

  it('atualiza câmera e sol sem recarregar a cena', () => {
    const { exports, estado } = criarMock();
    const cliente = new ClienteRenderWasm(exports);
    const quadro = quadroDaCamera(CAMERA, 1);
    cliente.carregarCena(cenaExemplo());

    cliente.atualizarCamera(quadro);
    expect(Array.from(estado.camera!)).toEqual(Array.from(codificarCamera(quadro)));
    cliente.atualizarSol({ azimuth: 30, elevation: 60, intensity: 2.5 });
    expect(estado.sol!.length).toBe(12);
    expect(new DataView(estado.sol!.buffer).getFloat32(8, true)).toBeCloseTo(2.5, 6);
  });

  it('cancela, sinaliza o código 4 e volta ao normal com limparCancelamento', () => {
    const { exports } = criarMock();
    const cliente = new ClienteRenderWasm(exports);
    cliente.prepararTrabalho({ largura: 4, altura: 4, exposicao: 1 });

    cliente.cancelar();
    expect(() => cliente.renderizarBloco(0, 0, 4, 4, 1, 1)).toThrow(ErroRenderWasm);
    try {
      cliente.renderizarBloco(0, 0, 4, 4, 1, 1);
    } catch (erro) {
      expect(ehCancelamento(erro)).toBe(true);
    }
    cliente.limparCancelamento();
    expect(cliente.renderizarBloco(0, 0, 4, 4, 1, 1).length).toBe(64);
  });

  it('recusa ABI incompatível e encerra depois de dispose', () => {
    const { exports } = criarMock();
    expect(() => new ClienteRenderWasm({ ...exports, versao_abi: () => 2 })).toThrow(/compat/i);
    const cliente = new ClienteRenderWasm(exports);
    cliente.dispose();
    expect(cliente.descartado).toBe(true);
    expect(() => cliente.limparCancelamento()).toThrow(/descartado/);
  });

  it('monta o RGBA do quadro inteiro a partir dos blocos', async () => {
    const { exports, estado } = criarMock();
    const cliente = new ClienteRenderWasm(exports);
    const progresso: number[] = [];
    const pixels = await renderizarQuadroRgba({
      cena: cenaExemplo(),
      largura: 40,
      altura: 24,
      bloco: 16,
      cliente,
      aoProgredir: (p) => progresso.push(p.fracao),
    });
    expect(pixels.length).toBe(40 * 24 * 4);
    expect(progresso.length).toBe(6); // 3 colunas × 2 linhas
    expect(progresso.at(-1)).toBe(1);
    // O último bloco é parcial (8×8) e a cópia respeita o passo da largura do quadro.
    expect(estado.bloco).toEqual([32, 16, 8, 8, 1, 1]);
    const ultimoPixel = pixels.length - 4;
    expect(Array.from(pixels.subarray(ultimoPixel, ultimoPixel + 4))).toEqual([200, 100, 50, 255]);
    expect(Array.from(pixels.subarray(0, 4))).toEqual([200, 100, 50, 255]);
  });
});

// ---------------------------------------------------------------------------------------------
// Integração opcional com o asset real
// ---------------------------------------------------------------------------------------------

const caminhoAsset = fileURLToPath(
  new URL('../../../../../packages/render/assets/render_wasm.wasm', import.meta.url),
);
const temAsset = existsSync(caminhoAsset);
let clienteReal: ClienteRenderWasm | null = null;
let erroAsset: string | null = null;
if (temAsset) {
  try {
    clienteReal = await criarClienteWasm({ bytes: new Uint8Array(readFileSync(caminhoAsset)) });
  } catch (erro) {
    erroAsset = erro instanceof Error ? erro.message : String(erro);
  }
}
const suiteReal = clienteReal ? describe : describe.skip;

it('carrega o asset real sem erro de ABI', () => {
  if (!temAsset) return; // sem build do wasm, a suíte padrão continua verde
  expect(erroAsset).toBeNull();
});

suiteReal('renderizador Rust real', () => {
  it('aceita a cena HSTR e devolve RGBA8 determinístico', () => {
    const cliente = clienteReal!;
    cliente.limparCancelamento();
    cliente.carregarCena(cenaExemplo());
    cliente.prepararTrabalho({ largura: 16, altura: 16, exposicao: 1 });

    const primeiro = cliente.renderizarBloco(0, 0, 16, 16, 1, 9);
    expect(primeiro.length).toBe(16 * 16 * 4);
    expect(primeiro.some((valor) => valor !== 0)).toBe(true);
    for (let i = 3; i < primeiro.length; i += 4) expect(primeiro[i]).toBe(255);

    const segundo = cliente.renderizarBloco(0, 0, 16, 16, 1, 9);
    expect(Array.from(primeiro)).toEqual(Array.from(segundo));
  });
});

describe('HSTR v3: os quatro índices de textura de cada material', () => {
  it('albedo, normal, rugosidade e metálico saem nos quatro u32 do material, na ordem do layout', () => {
    const base = cenaComTextura();
    const textura = base.texturas![0]!;
    const cena = {
      ...base,
      texturas: [textura, textura, textura, textura],
      materials: [{ ...base.materials[0]!, mapas: { albedo: 3, normal: 1, roughness: 2, metallic: 0 } }],
    };
    const view = new DataView(codificarCena(cena).buffer);
    const indices = 32 + 36 + 12 + 52;
    expect([0, 1, 2, 3].map((canal) => view.getUint32(indices + canal * 4, true))).toEqual([3, 1, 2, 0]);
  });
});
