/**
 * Texturas da casa de alto padrão pelo caminho de exportação (sem navegador): o template vira snapshot com
 * `exportarCenaDeRender`, a lista de texturas é carregada com o carregador mockado (pixels pequenos) e o HSTR v3 é
 * conferido índice a índice. Também confere que todo arquivo que um preset aponta existe na biblioteca publicada.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTemplate, view3dOf, type MaterialTexturePreset } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, type RenderSceneSnapshot } from '@hestia/render';
import { arquivosDoPreset } from '../../../../../packages/render/src/offline/texturasPreset.ts';
import { carregarTexturaRgba, urlDaTextura } from './texturaRender.ts';
import { SEM_TEXTURA, comTexturasCarregadas } from './texturasCena.ts';
import { codificarCena } from './wasmClient.ts';

vi.mock('./texturaRender.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./texturaRender.ts')>();
  return { ...original, carregarTexturaRgba: vi.fn() };
});

const mockCarregar = vi.mocked(carregarTexturaRgba);

/** Pasta publicada da biblioteca (`apps/web/public/texturas-render/`), a partir deste arquivo em `apps/web/src/editor/render/`. */
const PASTA_PUBLICA = join(dirname(fileURLToPath(import.meta.url)), '../../../public/texturas-render');

const PRESETS: Exclude<MaterialTexturePreset, 'nenhum'>[] = ['tijolo', 'reboco', 'madeira', 'telha', 'pedra', 'concreto', 'metal', 'piso'];

/** Imagem 2×2 RGBA8 (16 bytes): o que o carregador mockado devolve para qualquer arquivo. */
const imagem2x2 = () => ({ largura: 2, altura: 2, rgba: Uint8Array.from({ length: 16 }, (_, i) => (i * 37) & 0xff) });

/** Exporta o template de alto padrão pelo caminho de render (estilo realista, como o diálogo e o vídeo). */
function exportarCasa(): RenderSceneSnapshot {
  const base = buildTemplate('house-premium');
  const p = { ...base, view3d: { ...view3dOf(base), style: 'realistic' as const, shadows: true, edges: true } };
  const cena = new ModelScene();
  try {
    cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { dark: false, edges: true, shadows: true });
    return cena.exportarCenaDeRender({ aspect: 16 / 9 });
  } finally {
    cena.dispose();
  }
}

/** Lê o material k (68 bytes na v3) e devolve os quatro índices de textura, como o Rust os lê. */
function indicesLidos(bytes: Uint8Array, k: number): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nVertices = view.getUint32(8, true);
  const nIndices = view.getUint32(12, true);
  const nNormais = view.getUint32(16, true);
  const inicio = 32 + nVertices * 12 + nIndices * 4 + nNormais * 12 + k * 68;
  return [0, 1, 2, 3].map((canal) => view.getUint32(inicio + 52 + canal * 4, true));
}

/** Nome do arquivo de albedo de um material (pelo caminho da lista de texturas), ou `undefined` sem albedo. */
function albedoDo(snap: RenderSceneSnapshot, indice: number | undefined): string | undefined {
  if (indice === undefined) return undefined;
  return snap.texturas?.[indice]?.caminho;
}

describe('arquivos dos presets de textura', () => {
  it('todo arquivo que um preset aponta existe em apps/web/public/texturas-render/', () => {
    const faltando: string[] = [];
    for (const preset of PRESETS) {
      const arquivos = arquivosDoPreset(preset);
      if (!arquivos) {
        faltando.push(`${preset}: sem arquivos`);
        continue;
      }
      for (const nome of Object.values(arquivos)) {
        if (!existsSync(join(PASTA_PUBLICA, nome))) faltando.push(`${preset}: ${nome}`);
      }
    }
    expect(faltando).toEqual([]);
  });

  it('o caminho guardado é relativo à biblioteca e a URL do navegador é absoluta na raiz publicada', () => {
    const telha = arquivosDoPreset('telha');
    expect(telha?.albedo).toBe('telha_argila_albedo.jpg');
    expect(urlDaTextura(telha!.albedo)).toBe('/texturas-render/telha_argila_albedo.jpg');
  });
});

describe('casa de alto padrão: texturas pelo caminho de exportação', () => {
  let snap: RenderSceneSnapshot;

  beforeEach(() => {
    mockCarregar.mockReset();
    mockCarregar.mockImplementation(async () => imagem2x2());
    snap = exportarCasa();
  });

  it('a lista tem 6 ou mais texturas, todas pendentes e com arquivo existente', () => {
    const texturas = snap.texturas ?? [];
    expect(texturas.length).toBeGreaterThanOrEqual(6);
    expect(texturas.every((t) => t.mips.length === 0)).toBe(true);
    const inexistentes = texturas.map((t) => t.caminho).filter((c) => !existsSync(join(PASTA_PUBLICA, c ?? '')));
    expect(inexistentes).toEqual([]);
  });

  it('os materiais de reboco e de telha têm índice de albedo válido na lista', () => {
    const materiais = snap.materials;
    const comReboco = materiais.filter((m) => albedoDo(snap, m.mapas?.albedo)?.startsWith('reboco_estuque'));
    const comTelha = materiais.filter((m) => albedoDo(snap, m.mapas?.albedo)?.startsWith('telha_argila'));
    expect(comReboco.length).toBeGreaterThan(0);
    expect(comTelha.length).toBeGreaterThan(0);
    for (const m of [...comReboco, ...comTelha]) {
      const albedo = m.mapas?.albedo;
      expect(Number.isInteger(albedo)).toBe(true);
      expect(albedo).toBeGreaterThanOrEqual(0);
      expect(albedo).toBeLessThan(snap.texturas!.length);
    }
  });

  it('carrega só URLs de arquivos existentes, na raiz /texturas-render/, e todas ficam com mips', async () => {
    const cena = await comTexturasCarregadas(snap);
    const urls = mockCarregar.mock.calls.map((c) => c[0]);
    expect(urls.length).toBe(snap.texturas!.length);
    for (const url of urls) {
      expect(url.startsWith('/texturas-render/')).toBe(true);
      expect(existsSync(join(PASTA_PUBLICA, url.slice('/texturas-render/'.length)))).toBe(true);
    }
    expect(cena.texturas!.every((t) => t.mips.length > 0 && t.largura > 0 && t.altura > 0)).toBe(true);
  });

  it('o HSTR é a versão 3 e cada canal com mapa grava o índice certo (albedo nunca 0xFFFFFFFF quando há mapa)', async () => {
    const cena = await comTexturasCarregadas(snap);
    const bytes = codificarCena(cena);
    expect(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true)).toBe(3);
    let comAlbedo = 0;
    snap.materials.forEach((material, k) => {
      const m = material.mapas;
      const esperado = [m?.albedo, m?.normal, m?.roughness, m?.metallic].map((x) => x ?? SEM_TEXTURA);
      expect(indicesLidos(bytes, k)).toEqual(esperado);
      if (m?.albedo !== undefined) {
        comAlbedo++;
        expect(indicesLidos(bytes, k)[0]).not.toBe(SEM_TEXTURA);
      }
    });
    expect(comAlbedo).toBeGreaterThan(0);
  });
});
