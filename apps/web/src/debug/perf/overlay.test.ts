import { describe, expect, it } from 'vitest';
import type { SnapshotPerf } from '@hestia/render';
import { compacto, formatarSnapshot } from './overlay.ts';

const snapshot = (): SnapshotPerf => ({
  ativo: true,
  backend: 'webgl2',
  ts: 1,
  fps: 60,
  ocioso: false,
  quadro: { indice: 10, ms: 4.24, intervaloMs: 16.7, drawCalls: 128, triangulos: 1500, uploads: 2, uploadBytes: 0, rebuilds: 0 },
  janela: {
    n: 10,
    frameMs: { n: 10, min: 3, mediana: 4.2, p95: 7.25, media: 4.5, max: 8 },
    intervaloMs: { n: 9, min: 16, mediana: 16, p95: 18, media: 16, max: 18 },
    drawCalls: { n: 10, min: 120, mediana: 128, p95: 140, media: 130, max: 140 },
    triangulos: null,
    uploads: null,
    rebuilds: null,
  },
  total: { quadros: 10, drawCalls: 1280, triangulos: 15000, uploads: 20, uploadBytes: 2_000_000, rebuilds: 3, commitsReact: 5 },
  camadas: { geometria: 1, sobreposicao: 1, grade: 1, guardaCorpo: 0 },
  gpu: { timer: 'disponivel', ms: 4.2 },
  indisponiveis: [],
});

describe('texto do overlay', () => {
  it('resume backend, FPS, quadro, GPU, draw, upload, camadas e commits', () => {
    const t = formatarSnapshot(snapshot());
    expect(t).toContain('webgl2 · 60.0 fps');
    expect(t).toContain('frame 4.2 ms (p95 7.3) · gpu 4.2 ms');
    expect(t).toContain('draw 128 (p95 140.0) · tri 1.5k');
    expect(t).toContain('upload 2 · 2.0M B · rebuild 0');
    expect(t).toContain('camadas g1/s1/gr1 · commits 5');
  });

  it('mostra ocioso e GPU indisponível sem inventar número', () => {
    const s = snapshot();
    const t = formatarSnapshot({ ...s, fps: null, ocioso: true, gpu: { timer: 'indisponivel', ms: null } });
    expect(t).toContain('ocioso');
    expect(t).toContain('gpu —');
  });

  it('compacta números grandes', () => {
    expect(compacto(999)).toBe('999');
    expect(compacto(1500)).toBe('1.5k');
    expect(compacto(2_000_000)).toBe('2.0M');
  });
});
