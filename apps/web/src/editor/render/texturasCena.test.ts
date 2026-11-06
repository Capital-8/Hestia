/**
 * Carregamento das texturas do snapshot (F3-W): a lista pendente do render vira RGBA8 com mips, falha de uma textura é
 * erro explícito e o encoder recusa textura não carregada. A imagem não é lida de verdade: `carregarTexturaRgba` é mockado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTemplate, createEmptyProject, makeWall, view3dOf } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, type RenderSceneSnapshot, type RenderTextura } from '@hestia/render';
import { carregarTexturaRgba } from './texturaRender.ts';
import { SEM_TEXTURA, carregarTexturasDoSnapshot, comTexturasCarregadas } from './texturasCena.ts';
import { codificarCena } from './wasmClient.ts';

vi.mock('./texturaRender.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./texturaRender.ts')>();
  return { ...original, carregarTexturaRgba: vi.fn() };
});

const mockCarregar = vi.mocked(carregarTexturaRgba);

/** Imagem 2×2 RGBA8 (16 bytes), o que o mock devolve para qualquer arquivo. */
const imagem2x2 = () => ({ largura: 2, altura: 2, rgba: Uint8Array.from({ length: 16 }, (_, i) => i * 10) });

/** Exporta o template de alto padrão pelo caminho de render (estilo realista, como o diálogo e o vídeo). */
function exportarTemplate(): RenderSceneSnapshot {
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

/** Snapshot sem preset: uma parede com material padrão (sem textura). */
function exportarSemPreset(): RenderSceneSnapshot {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 };
  p.view3d = { ...view3dOf(p), style: 'realistic', shadows: true, edges: true };
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

beforeEach(() => {
  mockCarregar.mockReset();
});

describe('carregarTexturasDoSnapshot', () => {
  it('carrega cada textura pendente da biblioteca, na ordem, com os mips', async () => {
    mockCarregar.mockResolvedValue(imagem2x2());
    const snap: RenderSceneSnapshot = {
      ...exportarSemPreset(),
      texturas: [
        { caminho: 'reboco_estuque_albedo.jpg', largura: 0, altura: 0, mips: [] },
        { caminho: 'madeira_tabua_albedo.jpg', largura: 0, altura: 0, mips: [] },
      ],
    };
    const carregadas = await carregarTexturasDoSnapshot(snap);
    expect(mockCarregar.mock.calls.map((c) => c[0])).toEqual([
      '/texturas-render/reboco_estuque_albedo.jpg',
      '/texturas-render/madeira_tabua_albedo.jpg',
    ]);
    expect(carregadas.map((t) => t.caminho)).toEqual(['reboco_estuque_albedo.jpg', 'madeira_tabua_albedo.jpg']);
    expect(carregadas[0]!.mips).toHaveLength(2); // 2×2 → 1×1
    expect(carregadas[0]!.mips[1]!.length).toBe(4);
  });

  it('falha de uma textura lança erro com o nome do arquivo (nunca branco em silêncio)', async () => {
    mockCarregar.mockRejectedValueOnce(new Error('textura: HTTP 404 ao buscar /texturas-render/x.jpg'));
    const snap: RenderSceneSnapshot = {
      ...exportarSemPreset(),
      texturas: [{ caminho: 'reboco_estuque_albedo.jpg', largura: 0, altura: 0, mips: [] }],
    };
    await expect(carregarTexturasDoSnapshot(snap)).rejects.toThrow(/não foi possível carregar a textura reboco_estuque_albedo\.jpg: textura: HTTP 404/);
  });

  it('sem texturas na cena, comTexturasCarregadas devolve o mesmo snapshot e não carrega nada', async () => {
    // A parede de exportarSemPreset (wt_alv14) tem reboco e tijolo: a lista vazia é o caso "sem texturas" de verdade.
    const snap: RenderSceneSnapshot = { ...exportarSemPreset(), texturas: [] };
    expect(await comTexturasCarregadas(snap)).toBe(snap);
    expect(mockCarregar).not.toHaveBeenCalled();
  });
});

describe('codificarCena e texturas pendentes', () => {
  it('recusa textura ainda não carregada, com mensagem que aponta para carregarTexturasDoSnapshot', () => {
    const pendente: RenderTextura = { caminho: 'reboco_estuque_albedo.jpg', largura: 0, altura: 0, mips: [] };
    const snap: RenderSceneSnapshot = { ...exportarSemPreset(), texturas: [pendente] };
    expect(() => codificarCena(snap)).toThrow(/reboco_estuque_albedo\.jpg\) não foi carregada; carregue os pixels com carregarTexturasDoSnapshot/);
  });
});

describe('ponta a ponta: exportação do template -> carregamento -> HSTR v3', () => {
  it('os quatro índices de cada material do snapshot chegam ao HSTR, e a lista é a da exportação', async () => {
    mockCarregar.mockImplementation(async () => imagem2x2());
    const snap = exportarTemplate();
    const pendentes = snap.texturas ?? [];
    expect(pendentes.length).toBeGreaterThan(0);
    expect(pendentes.every((t) => t.mips.length === 0 && t.caminho !== undefined)).toBe(true);
    expect(() => codificarCena(snap)).toThrow(/não foi carregada/);

    const cena = await comTexturasCarregadas(snap);
    expect(cena.texturas!.map((t) => t.caminho)).toEqual(pendentes.map((t) => t.caminho));
    const bytes = codificarCena(cena);
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(3);

    let comMapa = 0;
    snap.materials.forEach((material, k) => {
      const m = material.mapas;
      const esperado = [m?.albedo, m?.normal, m?.roughness, m?.metallic].map((x) => x ?? SEM_TEXTURA);
      expect(indicesLidos(bytes, k)).toEqual(esperado);
      if (m) comMapa++;
    });
    expect(comMapa).toBeGreaterThan(0);
  });

  it('snapshot sem nenhum preset: sem texturas, versão 2 e os mesmos bytes do encoder sem a lista', async () => {
    // Sem preset, os materiais não têm `mapas` e a cena não tem lista de texturas (o caso que fica na v2).
    const base = exportarSemPreset();
    const snap: RenderSceneSnapshot = { ...base, texturas: undefined, materials: base.materials.map((m) => ({ ...m, mapas: undefined })) };
    expect(snap.texturas).toBeUndefined();
    const bytes = codificarCena(await comTexturasCarregadas(snap));
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(2);
    expect(Array.from(bytes)).toEqual(Array.from(codificarCena({ ...snap, texturas: [] })));
    expect(mockCarregar).not.toHaveBeenCalled();
  });
});
