import { describe, expect, it } from 'vitest';
import { ContadoresPerf, estatisticas, triangulosDeDesenho } from './contadores.ts';

describe('estatísticas da janela (mediana, p95)', () => {
  it('amostra vazia devolve null', () => {
    expect(estatisticas([])).toBeNull();
  });

  it('valor único', () => {
    expect(estatisticas([5])).toEqual({ n: 1, min: 5, mediana: 5, p95: 5, media: 5, max: 5 });
  });

  it('quatro valores: mediana é a média do meio e p95 é o maior (ceil(0,95·4)-1 = 3)', () => {
    const s = estatisticas([4, 1, 3, 2])!;
    expect(s.n).toBe(4);
    expect(s.min).toBe(1);
    expect(s.max).toBe(4);
    expect(s.mediana).toBe(2.5);
    expect(s.p95).toBe(4);
    expect(s.media).toBe(2.5);
  });

  it('ignora valores não finitos', () => {
    expect(estatisticas([1, Number.NaN, 3, Number.POSITIVE_INFINITY])).toMatchObject({ n: 2, mediana: 2, max: 3 });
  });
});

describe('triângulos por chamada de desenho', () => {
  it('TRIANGLES conta n/3; instâncias multiplicam', () => {
    expect(triangulosDeDesenho(4, 6)).toBe(2);
    expect(triangulosDeDesenho(4, 7)).toBe(2);
    expect(triangulosDeDesenho(4, 6, 4)).toBe(8);
  });

  it('TRIANGLE_STRIP e TRIANGLE_FAN contam n-2', () => {
    expect(triangulosDeDesenho(5, 5)).toBe(3);
    expect(triangulosDeDesenho(6, 4)).toBe(2);
  });

  it('pontos, linhas e contagem inválida contam 0', () => {
    expect(triangulosDeDesenho(0, 10)).toBe(0);
    expect(triangulosDeDesenho(1, 10)).toBe(0);
    expect(triangulosDeDesenho(4, 0)).toBe(0);
    expect(triangulosDeDesenho(4, Number.NaN)).toBe(0);
  });
});

describe('ContadoresPerf', () => {
  it('inativo não mede nada', () => {
    const c = new ContadoresPerf();
    c.iniciarQuadro(0);
    c.contarDesenho(5, 15);
    c.contarUpload(100);
    c.contarRebuild('geometria');
    c.contarCommitReact();
    c.encerrarQuadro(1);
    const s = c.snapshot();
    expect(s.ativo).toBe(false);
    expect(s.total).toMatchObject({ quadros: 0, drawCalls: 0, triangulos: 0, uploads: 0, rebuilds: 0, commitsReact: 0 });
    expect(s.janela.n).toBe(0);
    expect(s.quadro).toBeNull();
  });

  it('agrupa desenho/upload/rebuild entre iniciar e encerrar e resume a janela', () => {
    const c = new ContadoresPerf({ janela: 4 });
    const base = performance.now();
    c.ativar();
    c.definirBackend('webgl2');
    c.marcarTimerGpu('disponivel');

    // Quadro 1: 10 draw calls, 1000 triângulos, 2 uploads (200 B), geometria e grade refeitas.
    c.iniciarQuadro(base);
    c.contarDesenho(10, 1000);
    c.contarUpload(120);
    c.contarUpload(80);
    c.contarRebuild('geometria');
    c.contarRebuild('grade');
    c.encerrarQuadro(base + 4);

    // Dois commits do React entre quadros.
    c.contarCommitReact();
    c.contarCommitReact();

    // Quadro 2: intervalo de 20 ms (50 fps), 20 draw calls, sobreposição refeita.
    c.iniciarQuadro(base + 20);
    c.contarDesenho(20, 3000);
    c.contarRebuild('sobreposicao');
    c.encerrarQuadro(base + 26);

    // Quadro 3: intervalo de 1980 ms é ocioso demais e fica fora do FPS.
    c.iniciarQuadro(base + 2000);
    c.contarDesenho(30, 5000);
    c.encerrarQuadro(base + 2003);

    c.registrarGpuMs(7.5);
    const s = c.snapshot();

    expect(s.ativo).toBe(true);
    expect(s.backend).toBe('webgl2');
    expect(s.fps).toBe(50);
    expect(s.janela.n).toBe(3);
    // `performance.now()` pode ser fracionário: as diferenças de tempo são floats, não inteiros exatos.
    expect(s.janela.intervaloMs).toMatchObject({ n: 1 });
    expect(s.janela.intervaloMs!.mediana).toBeCloseTo(20, 6);
    expect(s.janela.frameMs).toMatchObject({ n: 3 });
    expect(s.janela.frameMs!.min).toBeCloseTo(3, 6);
    expect(s.janela.frameMs!.max).toBeCloseTo(6, 6);
    expect(s.janela.frameMs!.mediana).toBeCloseTo(4, 6);
    expect(s.janela.frameMs!.p95).toBeCloseTo(6, 6);
    expect(s.janela.drawCalls).toMatchObject({ n: 3, mediana: 20, max: 30 });
    expect(s.janela.uploads).toMatchObject({ n: 3, mediana: 0, max: 2 });
    expect(s.quadro).toMatchObject({ indice: 3, drawCalls: 30, triangulos: 5000, uploads: 0, rebuilds: 0 });
    expect(s.quadro!.ms).toBeCloseTo(3, 6);

    expect(s.total).toEqual({ quadros: 3, drawCalls: 60, triangulos: 9000, uploads: 2, uploadBytes: 200, rebuilds: 3, commitsReact: 2 });
    expect(s.camadas).toEqual({ geometria: 1, sobreposicao: 1, grade: 1, guardaCorpo: 0 });
    expect(s.gpu).toMatchObject({ timer: 'disponivel', ms: 7.5 });
  });

  it('a janela móvel guarda só os últimos quadros', () => {
    const c = new ContadoresPerf({ janela: 2 });
    c.ativar();
    for (let i = 0; i < 3; i++) {
      c.iniciarQuadro(i * 10);
      c.contarDesenho(i + 1, (i + 1) * 3);
      c.encerrarQuadro(i * 10 + 1);
    }
    const s = c.snapshot();
    expect(s.janela.n).toBe(2);
    expect(s.janela.drawCalls).toMatchObject({ min: 2, max: 3 });
    expect(s.total.drawCalls).toBe(6);
  });

  it('reset zera totais, janela e camadas, mas preserva backend e estado do timer', () => {
    const c = new ContadoresPerf();
    c.ativar();
    c.definirBackend('webgl2');
    c.marcarTimerGpu('indisponivel', 'sem timer');
    c.registrarGpuMs(3);
    c.iniciarQuadro(0);
    c.contarDesenho(1, 3);
    c.contarRebuild('grade');
    c.encerrarQuadro(1);
    c.reset();
    const s = c.snapshot();
    expect(s.total.quadros).toBe(0);
    expect(s.janela.n).toBe(0);
    expect(s.quadro).toBeNull();
    expect(s.camadas).toEqual({ geometria: 0, sobreposicao: 0, grade: 0, guardaCorpo: 0 });
    expect(s.backend).toBe('webgl2');
    expect(s.gpu).toMatchObject({ timer: 'indisponivel', ms: null, nota: 'sem timer' });
    expect(s.indisponiveis).toContain('sem timer');
  });
});
