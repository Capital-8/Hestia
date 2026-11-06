/**
 * Desempenho do carregamento das texturas da casa de alto padrão (22 texturas, P-perf). A medida é SEM rede e SEM
 * decodificação de imagem real: o ambiente de teste é `node` (sem `createImageBitmap`/`OffscreenCanvas`), então o
 * carregador é simulado e devolve pixels sintéticos (1024 px, e 512 px no caminho da prévia) gerados ANTES do
 * cronômetro. Medido: montagem da lista (inclui os mips), codificação do HSTR e o caminho com cache. Busca e
 * decodificação ficam de fora. Os tempos vão para o console mediana de 3; não há limite de tempo (máquina
 * compartilhada). Os asserts são de contagem de chamadas, não de tempo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTemplate, view3dOf } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, type RenderSceneSnapshot } from '@hestia/render';
import { carregarTexturaRgba, dimensoesReduzidas, LADO_PREVIA_TEXTURA } from './texturaRender.ts';
import { comTexturasCarregadas, limparCacheDeTexturas } from './texturasCena.ts';
import { codificarCena } from './wasmClient.ts';

vi.mock('./texturaRender.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./texturaRender.ts')>();
  return { ...original, carregarTexturaRgba: vi.fn() };
});

const mockCarregar = vi.mocked(carregarTexturaRgba);

/** Pixels sintéticos RGBA8 de um quadrado `lado`×`lado` (padrão determinístico, não uniforme para o mip não ser trivial). */
function pixelsSinteticos(lado: number): Uint8Array {
  const rgba = new Uint8Array(lado * lado * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 31 + (i >> 9)) & 0xff;
  return rgba;
}

const PIXELS_POR_LADO = new Map<number, Uint8Array>([
  [1024, pixelsSinteticos(1024)],
  [512, pixelsSinteticos(512)],
]);

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

const ms = (inicio: number): number => Math.round((performance.now() - inicio) * 10) / 10;

/** Mediana de três execuções de `fazer` (cada uma começa de onde a anterior parou; quem quer frio limpa antes). */
async function medianaDe3(fazer: () => Promise<void> | void, antesDeCada?: () => void): Promise<number> {
  const tempos: number[] = [];
  for (let i = 0; i < 3; i++) {
    antesDeCada?.();
    const t = performance.now();
    await fazer();
    tempos.push(ms(t));
  }
  return tempos.sort((a, b) => a - b)[1]!;
}

beforeEach(() => {
  mockCarregar.mockReset();
  limparCacheDeTexturas();
  // Carregador simulado: sem rede e sem decodificação; devolve pixels do lado pedido (como o real faria ao reduzir).
  mockCarregar.mockImplementation(async (_url, lado = 1024) => {
    const [largura, altura] = dimensoesReduzidas(1024, 1024, lado);
    return { largura, altura, rgba: PIXELS_POR_LADO.get(largura)! };
  });
});

describe('desempenho das texturas da casa de alto padrão (medida, sem rede)', () => {
  it('mede carga fria, cache, codificação e a prévia em 512 px', async () => {
    const snap = exportarCasa();
    const n = snap.texturas?.length ?? 0;
    expect(n).toBeGreaterThan(0);

    // Carga fria em 1024 (final): o caminho inteiro, como na primeira prévia de uma sessão.
    let cena1 = await comTexturasCarregadas(snap);
    const chamadasFrias = mockCarregar.mock.calls.length;
    const cargaFria = await medianaDe3(
      async () => { cena1 = await comTexturasCarregadas(snap); },
      () => { limparCacheDeTexturas(); mockCarregar.mockClear(); },
    );

    // Codificação com lista nova (sem seção reaproveitada): é o custo de uma prévia que não tem cache.
    const codificacaoFria = await medianaDe3(() => { codificarCena({ ...cena1, texturas: [...cena1.texturas!] }); });

    // Segunda carga (cache): mesma lista, sem chamar o carregador, e codificação com a seção reaproveitada.
    mockCarregar.mockClear();
    const cargaCache = await medianaDe3(async () => { await comTexturasCarregadas(snap); });
    const chamadasCache = mockCarregar.mock.calls.length;
    const codificacaoCache = await medianaDe3(() => { codificarCena(cena1); });

    // Prévia em 512 px (lista nova no lado de prévia): carga fria e carga com cache.
    const previaFria = await medianaDe3(
      async () => {
        const cenaPrevia = await comTexturasCarregadas(snap, { lado: LADO_PREVIA_TEXTURA });
        codificarCena(cenaPrevia);
      },
      () => { limparCacheDeTexturas(); mockCarregar.mockClear(); },
    );
    const chamadasPrevia = mockCarregar.mock.calls.length;
    const previaCache = await medianaDe3(async () => {
      const cenaPrevia = await comTexturasCarregadas(snap, { lado: LADO_PREVIA_TEXTURA });
      codificarCena(cenaPrevia);
    });

    console.info(
      `[P-perf] texturas=${n} (mediana de 3, ms)\n` +
        `  final 1024: carga fria=${cargaFria} (carregador ${chamadasFrias} chamadas) | codificacao (lista nova)=${codificacaoFria}\n` +
        `  final 1024: segunda carga com cache=${cargaCache} (carregador ${chamadasCache} chamadas) | codificacao (seção reaproveitada)=${codificacaoCache}\n` +
        `  previa 512: carga fria + codificacao=${previaFria} (carregador ${chamadasPrevia} chamadas) | segunda previa com cache=${previaCache}`,
    );
    expect(chamadasFrias).toBe(n);
    expect(chamadasCache).toBe(0);
    expect(chamadasPrevia).toBe(n);
    expect(cena1.texturas!.every((x) => x.mips.length > 0)).toBe(true);
  }, 120_000);
});
