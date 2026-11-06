/**
 * Carregamento das texturas do snapshot (F3-W): a lista pendente do render vira RGBA8 com mips, falha de uma textura é
 * erro explícito e o encoder recusa textura não carregada. A imagem não é lida de verdade: `carregarTexturaRgba` é mockado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTemplate, createEmptyProject, makeWall, view3dOf } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, type RenderSceneSnapshot, type RenderTextura } from '@hestia/render';
import { carregarTexturaRgba, LADO_PREVIA_TEXTURA } from './texturaRender.ts';
import { LIMITE_BUSCA_TEXTURAS, SEM_TEXTURA, carregarTexturasDoSnapshot, comTexturasCarregadas, limparCacheDeTexturas } from './texturasCena.ts';
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
  limparCacheDeTexturas();
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

/** Cena com texturas pendentes de caminhos dados (o foco é a lista, não a geometria). */
function cenaComTexturas(caminhos: string[]): RenderSceneSnapshot {
  const base = exportarSemPreset();
  return {
    ...base,
    // Sem mapas nos materiais: os índices do preset não existem nesta lista.
    materials: base.materials.map((m) => ({ ...m, mapas: undefined })),
    texturas: caminhos.map((caminho) => ({ caminho, largura: 0, altura: 0, mips: [] })),
  };
}

describe('cache, paralelismo, prévia, progresso e chave das texturas', () => {
  it('cache: a segunda chamada não chama o carregador de novo e devolve a mesma lista (seção reaproveitada)', async () => {
    mockCarregar.mockResolvedValue(imagem2x2());
    const snap = cenaComTexturas(['tijolo_a.jpg', 'tijolo_b.jpg']);
    const primeira = await comTexturasCarregadas(snap);
    expect(mockCarregar).toHaveBeenCalledTimes(2);
    const segunda = await comTexturasCarregadas(snap);
    expect(mockCarregar).toHaveBeenCalledTimes(2);
    expect(segunda.texturas).toBe(primeira.texturas);
    expect(Array.from(codificarCena(segunda))).toEqual(Array.from(codificarCena(primeira)));
  });

  it('paralelismo: nunca mais de LIMITE_BUSCA_TEXTURAS buscas ao mesmo tempo, e o limite é atingido', async () => {
    expect(LIMITE_BUSCA_TEXTURAS).toBe(4);
    let emAndamento = 0;
    let maximo = 0;
    mockCarregar.mockImplementation(async () => {
      emAndamento++;
      maximo = Math.max(maximo, emAndamento);
      await new Promise((resolver) => setTimeout(resolver, 1));
      emAndamento--;
      return imagem2x2();
    });
    const caminhos = Array.from({ length: 22 }, (_, i) => `parallel_${i}.jpg`);
    const carregadas = await carregarTexturasDoSnapshot(cenaComTexturas(caminhos));
    expect(mockCarregar).toHaveBeenCalledTimes(22);
    expect(maximo).toBe(LIMITE_BUSCA_TEXTURAS);
    expect(carregadas.map((t) => t.caminho)).toEqual(caminhos);
  });

  it('prévia em 512 px: o carregador recebe o lado pedido; o final (padrão) continua em 1024', async () => {
    mockCarregar.mockResolvedValue(imagem2x2());
    const snap = cenaComTexturas(['previa_a.jpg']);
    await comTexturasCarregadas(snap, { lado: LADO_PREVIA_TEXTURA });
    expect(LADO_PREVIA_TEXTURA).toBe(512);
    expect(mockCarregar.mock.calls[0]).toEqual(['/texturas-render/previa_a.jpg', 512]);
    // Mesmo arquivo no final: não reaproveita a versão de prévia (o lado faz parte da chave).
    await comTexturasCarregadas(snap);
    expect(mockCarregar.mock.calls[1]).toEqual(['/texturas-render/previa_a.jpg', 1024]);
  });

  it('progresso: avisa (0, total) no começo e (feitas, total) a cada textura pronta', async () => {
    mockCarregar.mockResolvedValue(imagem2x2());
    const avisos: Array<[number, number]> = [];
    await carregarTexturasDoSnapshot(cenaComTexturas(['prog_a.jpg', 'prog_b.jpg', 'prog_c.jpg']), {
      progresso: (feitas, total) => avisos.push([feitas, total]),
    });
    expect(avisos[0]).toEqual([0, 3]);
    expect(avisos.slice(1)).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('erro: falha de uma textura aparece com o caminho, e a tentativa seguinte busca de novo (não fica em cache)', async () => {
    mockCarregar.mockRejectedValueOnce(new Error('textura: HTTP 404 ao buscar /texturas-render/falha.jpg'));
    mockCarregar.mockResolvedValue(imagem2x2());
    const snap = cenaComTexturas(['falha.jpg']);
    await expect(comTexturasCarregadas(snap)).rejects.toThrow(/não foi possível carregar a textura falha\.jpg: textura: HTTP 404/);
    const depois = await comTexturasCarregadas(snap);
    expect(depois.texturas![0]!.mips.length).toBeGreaterThan(0);
    expect(mockCarregar).toHaveBeenCalledTimes(2);
  });

  it('chave: mudar a lista de texturas invalida o cache da lista (devolve outra lista, buscando só o que é novo)', async () => {
    mockCarregar.mockResolvedValue(imagem2x2());
    const a = await comTexturasCarregadas(cenaComTexturas(['chave_a.jpg', 'chave_b.jpg']));
    expect(mockCarregar).toHaveBeenCalledTimes(2);
    const b = await comTexturasCarregadas(cenaComTexturas(['chave_a.jpg', 'chave_c.jpg']));
    expect(b.texturas).not.toBe(a.texturas);
    expect(b.texturas!.map((t) => t.caminho)).toEqual(['chave_a.jpg', 'chave_c.jpg']);
    // chave_a já estava na imagem em cache: só chave_c foi buscada.
    expect(mockCarregar).toHaveBeenCalledTimes(3);
    expect(mockCarregar.mock.calls[2]![0]).toBe('/texturas-render/chave_c.jpg');
  });
});

describe('seção de texturas reaproveitada: só quando os mips são os mesmos', () => {
  it('trocar os mips de uma textura na mesma lista muda os bytes (não reaproveita a seção antiga)', async () => {
    // Pixels que dependem do arquivo: a textura trocada tem de mudar a seção.
    mockCarregar.mockImplementation(async (url) => {
      const semente = [...url].reduce((soma, c) => soma + c.charCodeAt(0), 0);
      return { largura: 2, altura: 2, rgba: Uint8Array.from({ length: 16 }, (_, i) => (i * 10 + semente) & 0xff) };
    });
    const cena = await comTexturasCarregadas(cenaComTexturas(['secao_a.jpg', 'secao_b.jpg']));
    const antes = Array.from(codificarCena(cena));
    const outro = await comTexturasCarregadas(cenaComTexturas(['secao_c.jpg', 'secao_b.jpg']));
    // Mesma lista de objetos, com a textura 0 trocada por outra imagem: a seção tem de ser recodificada.
    cena.texturas![0] = outro.texturas![0]!;
    expect(Array.from(codificarCena(cena))).not.toEqual(antes);
    expect(Array.from(codificarCena(cena))).toEqual(Array.from(codificarCena({ ...cena, texturas: [...cena.texturas!] })));
  });
});
