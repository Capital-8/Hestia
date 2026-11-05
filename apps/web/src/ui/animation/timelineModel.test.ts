import { describe, expect, it } from 'vitest';
import type { CameraKeyframe } from '@hestia/render';
import {
  MIN_VISIBLE_SPAN,
  chooseTickStep,
  clampKeyframeTime,
  formatHour,
  formatSolarHour,
  formatTime,
  frameAt,
  frameTicks,
  hitKeyframe,
  snapTargets,
  snapTime,
  solarHourAt,
  solarHourTicks,
  ticksBetween,
  timeToX,
  visibleRange,
  xToTime,
  zoomRange,
  type TimelineView,
} from './timelineModel.ts';

const camera = {
  azimuth: 0.5,
  elevation: 0.3,
  distance: 10,
  target: { x: 0, y: 0, z: 0 },
  ortho: false,
};

const keyframe = (id: string, t: number): CameraKeyframe => ({ id, t, camera, easing: 'smooth' });

const view: TimelineView = { start: 2, end: 12, width: 500 };

describe('timeToX e xToTime', () => {
  it('mapeiam o trecho visível para a largura da pista', () => {
    expect(timeToX(2, view)).toBe(0);
    expect(timeToX(7, view)).toBe(250);
    expect(timeToX(12, view)).toBe(500);
    expect(xToTime(0, view)).toBe(2);
    expect(xToTime(250, view)).toBe(7);
    expect(xToTime(500, view)).toBe(12);
  });

  it('fazem a volta para um tempo arbitrário', () => {
    const t = 8.25;
    expect(xToTime(timeToX(t, view), view)).toBeCloseTo(t, 10);
  });

  it('não dividem por zero quando a pista ainda não foi medida', () => {
    const vazio: TimelineView = { start: 5, end: 5, width: 0 };
    expect(timeToX(9, vazio)).toBe(0);
    expect(xToTime(300, vazio)).toBe(5);
    const semLargura: TimelineView = { start: 0, end: 10, width: 0 };
    expect(xToTime(300, semLargura)).toBe(0);
  });

  it('troca entrada não finita pelo início do trecho', () => {
    expect(timeToX(Number.NaN, view)).toBe(0);
    expect(xToTime(Number.POSITIVE_INFINITY, view)).toBe(2);
  });
});

describe('visibleRange', () => {
  it('recorta o trecho para a duração', () => {
    expect(visibleRange(10, -5, 12)).toEqual({ start: 0, end: 10 });
  });

  it('garante o vão mínimo quando o pedido é degenerado', () => {
    expect(visibleRange(10, 9, 9)).toEqual({ start: 9, end: 9 + MIN_VISIBLE_SPAN });
  });

  it('puxa o início para trás quando o trecho passa do fim', () => {
    expect(visibleRange(10, 20, 30)).toEqual({ start: 10 - MIN_VISIBLE_SPAN, end: 10 });
  });

  it('não inventa vão maior que a própria sequência', () => {
    expect(visibleRange(0.05, 0, 0)).toEqual({ start: 0, end: 0.05 });
    expect(visibleRange(0, 0, 1)).toEqual({ start: 0, end: 0 });
  });
});

describe('clampKeyframeTime', () => {
  it('limita ao intervalo da sequência', () => {
    expect(clampKeyframeTime(-2, 8)).toBe(0);
    expect(clampKeyframeTime(3.5, 8)).toBe(3.5);
    expect(clampKeyframeTime(12, 8)).toBe(8);
  });

  it('trata entrada inválida como zero', () => {
    expect(clampKeyframeTime(Number.NaN, 8)).toBe(0);
    expect(clampKeyframeTime(3, 0)).toBe(0);
    expect(clampKeyframeTime(3, -1)).toBe(0);
  });
});

describe('snapTime', () => {
  it('encaixa no quadro mais próximo', () => {
    expect(snapTime(0.53, { fps: 24 })).toBeCloseTo(13 / 24, 10);
    expect(snapTime(0.99, { fps: 30 })).toBe(1);
    expect(snapTime(3.04, { fps: 24 })).toBeCloseTo(73 / 24, 10);
  });

  it('prefere candidatos dentro da tolerância', () => {
    expect(snapTime(3.04, { fps: 24, alvos: [0, 3], tolerancia: 0.1 })).toBe(3);
    expect(snapTime(3.04, { fps: 24, alvos: [0, 5], tolerancia: 0.1 })).toBeCloseTo(73 / 24, 10);
  });

  it('escolhe o candidato mais próximo e ignora valores inválidos', () => {
    expect(snapTime(5.12, { alvos: [5, Number.NaN, 5.2], tolerancia: 0.2 })).toBe(5.2);
    expect(snapTime(5.16, { alvos: [5, 5.2], tolerancia: 0.2 })).toBe(5.2);
  });

  it('devolve o tempo original sem fps nem alvos', () => {
    expect(snapTime(7.3)).toBe(7.3);
    expect(snapTime(Number.NaN)).toBe(0);
  });
});

describe('hitKeyframe', () => {
  const kfs = [keyframe('a', 2), keyframe('b', 5), keyframe('c', 8)];
  const pista: TimelineView = { start: 0, end: 10, width: 1000 };

  it('encontra o keyframe dentro do raio', () => {
    expect(hitKeyframe(200, kfs, pista)).toBe('a');
    expect(hitKeyframe(500, kfs, pista)).toBe('b');
    expect(hitKeyframe(802, kfs, pista)).toBe('c');
  });

  it('devolve null longe dos losangos', () => {
    expect(hitKeyframe(600, kfs, pista)).toBeNull();
    expect(hitKeyframe(200, [], pista)).toBeNull();
  });

  it('respeita o raio pedido', () => {
    expect(hitKeyframe(208, kfs, pista, 4)).toBeNull();
    expect(hitKeyframe(208, kfs, pista, 9)).toBe('a');
  });
});

describe('formatTime', () => {
  it('formata minutos, segundos e décimos', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(5.24)).toBe('0:05.2');
    expect(formatTime(65.24)).toBe('1:05.2');
    expect(formatTime(65.99)).toBe('1:06.0');
  });

  it('protege contra tempos inválidos', () => {
    expect(formatTime(-1)).toBe('0:00.0');
    expect(formatTime(Number.NaN)).toBe('0:00.0');
  });

  it('aceita mais casas e o número do quadro', () => {
    expect(formatTime(5.246, 0, 2)).toBe('0:05.25');
    expect(formatTime(5, 0, 0)).toBe('0:05');
    expect(formatTime(1.5, 30)).toBe('0:01.5 · 45f');
  });
});

describe('frameAt', () => {
  it('converte tempo em quadro', () => {
    expect(frameAt(1.5, 30)).toBe(45);
    expect(frameAt(0.53, 24)).toBe(13);
    expect(frameAt(-1, 30)).toBe(0);
  });

  it('assume 30 fps quando a taxa é inválida', () => {
    expect(frameAt(2, 0)).toBe(60);
    expect(frameAt(2, Number.NaN)).toBe(60);
  });
});

describe('zoomRange', () => {
  it('faz zoom em torno da âncora mantendo a posição relativa', () => {
    expect(zoomRange({ start: 0, end: 10 }, 10, 2, 5)).toEqual({ start: 2.5, end: 7.5 });
    expect(zoomRange({ start: 0, end: 10 }, 10, 2, 0)).toEqual({ start: 0, end: 5 });
  });

  it('limita o trecho à duração ao afastar', () => {
    expect(zoomRange({ start: 0, end: 10 }, 10, 0.5, 5)).toEqual({ start: 0, end: 10 });
  });

  it('não colapsa abaixo do vão mínimo', () => {
    const r = zoomRange({ start: 0, end: 10 }, 10, 1e6, 5);
    expect(r.end - r.start).toBeCloseTo(MIN_VISIBLE_SPAN, 10);
    expect(r.start).toBeCloseTo(5 - MIN_VISIBLE_SPAN / 2, 10);
  });

  it('devolve o trecho atual com fator inválido', () => {
    expect(zoomRange({ start: 3, end: 7 }, 10, 0, 5)).toEqual({ start: 3, end: 7 });
  });
});

describe('chooseTickStep', () => {
  it('escolhe 1, 2 ou 5 vezes uma potência de dez', () => {
    expect(chooseTickStep(50, 70)).toBe(2);
    expect(chooseTickStep(500, 70)).toBe(0.2);
    expect(chooseTickStep(10, 70)).toBe(10);
    expect(chooseTickStep(100, 70)).toBe(1);
  });

  it('devolve um passo positivo mesmo com entrada ruim', () => {
    expect(chooseTickStep(0)).toBeGreaterThan(0);
    expect(chooseTickStep(Number.NaN)).toBeGreaterThan(0);
  });
});

describe('ticksBetween', () => {
  it('gera múltiplos exatos do passo dentro do trecho', () => {
    expect(ticksBetween({ start: 0, end: 10, width: 1000 }, 2)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticksBetween({ start: 2, end: 5, width: 300 }, 1)).toEqual([2, 3, 4, 5]);
  });

  it('descarta tempos negativos e aceita passo inválido', () => {
    expect(ticksBetween({ start: -1, end: 2, width: 300 }, 1)).toEqual([0, 1, 2]);
    expect(ticksBetween({ start: 0, end: 3, width: 300 }, 0)).toEqual([0, 1, 2, 3]);
  });

  it('respeita o limite pedido', () => {
    expect(ticksBetween({ start: 0, end: 100, width: 1000 }, 0.1, 10)).toHaveLength(10);
  });
});

describe('frameTicks', () => {
  it('marca cada quadro quando há espaço', () => {
    const marcas = frameTicks({ start: 0, end: 1, width: 300 }, 30);
    expect(marcas).toHaveLength(31);
    expect(marcas[30]).toBeCloseTo(1, 10);
  });

  it('some quando o quadro fica estreito demais', () => {
    expect(frameTicks({ start: 0, end: 1, width: 100 }, 30)).toEqual([]);
    expect(frameTicks({ start: 0, end: 1, width: 300 }, 30, 11)).toEqual([]);
  });
});

describe('snapTargets', () => {
  const kfs = [keyframe('a', 1), keyframe('b', 5)];

  it('inclui bordas e keyframes', () => {
    expect(snapTargets(10, 3, kfs)).toEqual([0, 10, 1, 5]);
  });

  it('exclui o keyframe em arraste e inclui o playhead quando pedido', () => {
    expect(snapTargets(10, 3, kfs, 'a', true)).toEqual([0, 10, 3, 5]);
  });

  it('protege contra duração e playhead inválidos', () => {
    expect(snapTargets(0, Number.NaN, [])).toEqual([0, 0]);
  });
});

describe('sol', () => {
  it('interpola a hora solar no intervalo', () => {
    expect(solarHourAt(8, 17, 0, 9)).toBe(8);
    expect(solarHourAt(8, 17, 4.5, 9)).toBe(12.5);
    expect(solarHourAt(8, 17, 9, 9)).toBe(17);
    expect(solarHourAt(20, 4, 4, 8)).toBe(0);
    expect(solarHourAt(20, 4, 8, 8)).toBe(4);
  });

  it('formata hora inteira e com minutos', () => {
    expect(formatHour(8)).toBe('08h');
    expect(formatHour(8.5)).toBe('08:30h');
    expect(formatHour(25.25)).toBe('01:15h');
    expect(formatHour(-0.5)).toBe('23:30h');
    expect(formatSolarHour(8, 17, 4.5, 9)).toBe('12:30h');
    expect(formatSolarHour(20, 4, 4, 8)).toBe('00h');
  });

  it('gera marcas de hora ordenadas pelo tempo, inclusive de noite', () => {
    const dia = solarHourTicks(8, 12, 4, { start: 0, end: 4 });
    expect(dia.map((m) => m.hora)).toEqual([8, 9, 10, 11, 12]);
    expect(dia[0]?.t).toBe(0);
    expect(dia[4]?.t).toBe(4);

    const noite = solarHourTicks(20, 4, 8, { start: 0, end: 8 });
    expect(noite.map((m) => m.hora)).toEqual([20, 21, 22, 23, 0, 1, 2, 3, 4]);
    expect(noite[0]?.t).toBe(0);
    expect(noite[noite.length - 1]?.t).toBe(8);
  });

  it('devolve vazio quando o intervalo é degenerado', () => {
    expect(solarHourTicks(8, 8, 4, { start: 0, end: 4 })).toEqual([]);
  });
});
