import { afterEach, describe, expect, it } from 'vitest';
import { contadores, type OrbitCamera, type SnapshotPerf } from '@hestia/render';
import { iniciarBenchOrbita, QUADROS_BENCH, resumoBench } from './bench.ts';

const est = (mediana: number) => ({ n: 1, min: mediana, mediana, p95: mediana, media: mediana, max: mediana });

const snapshot = (parcial: Partial<SnapshotPerf> = {}): SnapshotPerf => ({
  ativo: true,
  backend: 'webgl2',
  ts: 0,
  fps: null,
  ocioso: false,
  quadro: null,
  janela: { n: 1, frameMs: est(10), intervaloMs: est(16.6), drawCalls: est(120), triangulos: est(24000), uploads: null, rebuilds: null },
  total: { quadros: 1, drawCalls: 0, triangulos: 0, uploads: 0, uploadBytes: 0, rebuilds: 0, commitsReact: 0 },
  camadas: { geometria: 0, sobreposicao: 0, grade: 0, guardaCorpo: 0, massa: 0 },
  gpu: { timer: 'disponivel', ms: 6.5 },
  indisponiveis: [],
  ...parcial,
});

describe('resumoBench (linha do document.title)', () => {
  it('formata o resumo pedido: fps, cpuMs, gpuMs, calls e tris', () => {
    expect(resumoBench(snapshot(), 300, 5000)).toBe('HESTIA-BENCH fps=60.0 cpuMs=10.00 gpuMs=6.50 calls=120 tris=24000');
  });

  it('marca n/a o que o ambiente não mediu (sem janela, sem timer de GPU)', () => {
    const vazio = snapshot({ janela: { n: 0, frameMs: null, intervaloMs: null, drawCalls: null, triangulos: null, uploads: null, rebuilds: null }, gpu: { timer: 'indisponivel', ms: null } });
    expect(resumoBench(vazio, 10, 1000)).toBe('HESTIA-BENCH fps=10.0 cpuMs=n/a gpuMs=n/a calls=n/a tris=n/a');
  });

  it('sem tempo decorrido não inventa fps', () => {
    expect(resumoBench(snapshot(), 10, 0)).toContain('fps=n/a');
  });
});

interface OrbitaFalsa {
  px: number;
  orbit(dx: number, dy: number): void;
}

const orbitaFalsa = (): { orbit: OrbitCamera; lida: OrbitaFalsa } => {
  const lida: OrbitaFalsa = { px: 0, orbit(dx) { this.px += dx; } };
  return { orbit: lida as unknown as OrbitCamera, lida };
};

/** Um quadro medido de verdade nos contadores (CPU de 10 ms, 120 draws, 24k tris). */
const quadro = (t: number): void => {
  contadores.iniciarQuadro(t);
  contadores.contarDesenho(120, 24000);
  contadores.encerrarQuadro(t + 10);
};

describe('iniciarBenchOrbita', () => {
  afterEach(() => {
    contadores.desativar();
    contadores.reset();
  });

  it('gira por N quadros, uma volta completa, e devolve true enquanto há frames', () => {
    const { orbit, lida } = orbitaFalsa();
    const b = iniciarBenchOrbita(orbit, () => undefined, 50);
    for (let i = 0; i < 49; i++) expect(b.passo(1000 + i * 16)).toBe(true);
    expect(b.passo(1784)).toBe(false);
    expect(lida.px * 0.006).toBeCloseTo(Math.PI * 2, 6);
  });

  it('no fim escreve o resumo com os números medidos nos contadores', () => {
    const { orbit } = orbitaFalsa();
    let titulo = '';
    const b = iniciarBenchOrbita(orbit, (t) => { titulo = t; }, 3);
    for (let i = 0; i < 3; i++) {
      quadro(1000 + i * 16);
      b.passo(1000 + i * 16);
    }
    expect(titulo).toMatch(/^HESTIA-BENCH fps=\d+\.\d cpuMs=10\.00 gpuMs=n\/a calls=120 tris=24000$/);
    expect(titulo).toContain(`fps=${((3 * 1000) / 32).toFixed(1)}`);
  });

  it('conclui uma vez só; passos depois do fim são no-op', () => {
    const { orbit, lida } = orbitaFalsa();
    let n = 0;
    const b = iniciarBenchOrbita(orbit, () => { n += 1; }, 2);
    b.passo(0);
    b.passo(16);
    b.passo(32);
    expect(n).toBe(1);
    const px = lida.px;
    b.passo(48);
    expect(lida.px).toBe(px);
  });

  it('cancelar interrompe sem escrever e desliga a medição que o bench ligou', () => {
    const { orbit } = orbitaFalsa();
    let escrito = false;
    const b = iniciarBenchOrbita(orbit, () => { escrito = true; }, 10);
    expect(contadores.ativo).toBe(true);
    b.passo(0);
    b.cancelar();
    b.passo(16);
    expect(escrito).toBe(false);
    expect(contadores.ativo).toBe(false);
  });

  it('com ?perf já medindo, o fim do bench não desliga os contadores do overlay', () => {
    const { orbit } = orbitaFalsa();
    contadores.ativar();
    const b = iniciarBenchOrbita(orbit, () => undefined, 1);
    b.passo(0);
    expect(contadores.ativo).toBe(true);
  });

  it('o padrão é ~300 quadros (≈5 s a 60 fps)', () => {
    expect(QUADROS_BENCH).toBe(300);
  });
});
