import { describe, expect, it } from 'vitest';
import type { SnapshotPerf } from './contadores.ts';
import { ORCAMENTO_3D, ORCAMENTO_PLANTA, violacoesOrcamento } from './orcamento.ts';

function snapshot(over: { frameMs?: number; drawCalls?: number; triangulos?: number; rebuilds?: number; fps?: number | null } = {}): SnapshotPerf {
  const nulo = { n: 1, min: 0, mediana: 0, p95: 0, media: 0, max: 0 };
  const stats = (mediana: number) => ({ ...nulo, mediana, min: mediana, p95: mediana, media: mediana, max: mediana });
  return {
    ativo: true,
    backend: 'webgl2',
    ts: 0,
    fps: over.fps === undefined ? 60 : over.fps,
    ocioso: false,
    quadro: { indice: 1, ms: 0, intervaloMs: 16, drawCalls: 0, triangulos: 0, uploads: 0, uploadBytes: 0, rebuilds: 0 },
    janela: {
      n: 1,
      frameMs: stats(over.frameMs ?? 4),
      intervaloMs: stats(16),
      drawCalls: stats(over.drawCalls ?? 32),
      triangulos: stats(over.triangulos ?? 6000),
      uploads: stats(0),
      rebuilds: stats(over.rebuilds ?? 0),
    },
    total: { quadros: 1, drawCalls: 32, triangulos: 6000, uploads: 0, uploadBytes: 0, rebuilds: 0, commitsReact: 0 },
    camadas: { geometria: 0, sobreposicao: 0, grade: 0, guardaCorpo: 0, massa: 0 },
    gpu: { timer: 'disponivel', ms: 1 },
    indisponiveis: [],
  };
}

describe('orçamento do cenário (metas da v3)', () => {
  it('dentro do orçamento da planta não há violação', () => {
    expect(violacoesOrcamento(snapshot(), ORCAMENTO_PLANTA)).toEqual([]);
  });

  it('lista cada métrica acima do limite com valor e limite', () => {
    const v = violacoesOrcamento(snapshot({ frameMs: 10, drawCalls: 700, triangulos: 4_000_000, rebuilds: 2, fps: 30 }), { ...ORCAMENTO_PLANTA, fpsMin: 55 });
    expect(v.map((x) => x.metrica)).toEqual(['frameMs', 'drawCalls', 'triangulos', 'rebuilds', 'fps']);
    expect(v[0]).toEqual({ metrica: 'frameMs', valor: 10, limite: 8 });
    expect(v[4]).toEqual({ metrica: 'fps', valor: 30, limite: 55 });
  });

  it('a 3D usa o limite de 16 ms', () => {
    expect(violacoesOrcamento(snapshot({ frameMs: 12 }), ORCAMENTO_3D)).toEqual([]);
    expect(violacoesOrcamento(snapshot({ frameMs: 17 }), ORCAMENTO_3D).map((x) => x.metrica)).toEqual(['frameMs']);
  });

  it('vista ociosa (fps nulo) e janela vazia não inventam violação', () => {
    const s = snapshot({ fps: null });
    s.janela.frameMs = null;
    s.janela.drawCalls = null;
    s.janela.triangulos = null;
    s.janela.rebuilds = null;
    expect(violacoesOrcamento(s, { frameMsMax: 1, drawCallsMax: 1, triangulosMax: 1, rebuildsMax: 0, fpsMin: 55 })).toEqual([]);
  });
});
