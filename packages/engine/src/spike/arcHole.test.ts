/**
 * SPIKE 1a: furo por contorno não retangular (meia-lua e arco abatido). Ver docs/estudo-esquadrias/09-spike-furo-por-contorno.md.
 * Prova em três degraus: (1) o contorno, (2) a aproximação em faixas, (3) o motor real furando a parede pelas faixas.
 */
import { describe, expect, it } from 'vitest';
import { difference, multiArea, type MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { resolveLevel } from '../resolve.ts';
import { bandVolume } from '../profile.ts';
import { halfWidthAt, holeSlices, outline, ringArea, slicesArea, type OPt } from './outline.ts';

const inBox = (r: readonly OPt[], w: number, h: number): boolean => r.every((p) => Math.abs(p[0]) <= w / 2 + 1e-12 && p[1] >= -1e-12 && p[1] <= h + 1e-12);
const top = (r: readonly OPt[]): number => Math.max(...r.map((p) => p[1]));
/** Área exata do segmento circular (arco abatido) + a parte reta. */
const segmentalArea = (w: number, h: number, f: number): number => {
  const half = w / 2;
  const R = (half * half + f * f) / (2 * f);
  const alpha = Math.asin(half / R);
  return w * (h - f) + R * R * alpha - half * (R - f);
};
/** Perímetro curvo (para o limite do erro de corda: área perdida <= comprimento do arco x sagita). */
const arcLen = (w: number, f: number): number => {
  const half = w / 2;
  const R = (half * half + f * f) / (2 * f);
  return 2 * R * Math.asin(half / R);
};

describe('outline: meia-lua (arco pleno, flecha = w/2)', () => {
  for (const w of [0.6, 0.9, 1.2, 2.4]) {
    it(`w=${w}: área = πw²/8, tudo em [-w/2,w/2]x[0,h], topo = h`, () => {
      const h = w / 2;
      const r = outline('round', w, h, 0);
      const exata = (Math.PI * w * w) / 8;
      const a = ringArea(r);
      expect(a).toBeLessThanOrEqual(exata + 1e-12); // polígono inscrito nunca passa da área exata
      expect(exata - a).toBeLessThanOrEqual((arcLen(w, w / 2) * 0.001) + 1e-9); // perda <= comprimento x sagita máx (1 mm)
      expect(Math.abs(a / exata - 1)).toBeLessThan(0.005);
      expect(inBox(r, w, h)).toBe(true);
      expect(top(r)).toBeCloseTo(h, 9);
      // Contorno simétrico e com a base reta de ponta a ponta.
      expect(r[0]![1]).toBeCloseTo(0, 12);
      expect(r[r.length - 1]![1]).toBeCloseTo(0, 12);
      expect(r[0]![0]).toBeCloseTo(w / 2, 12);
    });
  }
  it('erro de corda <= 1 mm: todo vértice está no círculo e o ponto médio de cada corda a <= 1 mm dele', () => {
    const w = 1.2;
    const r = outline('round', w, w / 2, 0);
    const R = w / 2;
    for (let i = 1; i + 1 < r.length - 1; i++) {
      const p = r[i]!;
      const q = r[i + 1]!;
      expect(Math.hypot(p[0], p[1])).toBeCloseTo(R, 9);
      expect(R - Math.hypot((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)).toBeLessThanOrEqual(0.001 + 1e-9);
    }
  });
  it('arco pleno com parte reta (h > w/2): topo = h, área = w(h - w/2) + πw²/8', () => {
    const w = 0.9;
    const h = 1.8;
    const r = outline('round', w, h, 0);
    expect(inBox(r, w, h)).toBe(true);
    expect(top(r)).toBeCloseTo(h, 9);
    expect(Math.abs(ringArea(r) / (w * (h - w / 2) + (Math.PI * w * w) / 8) - 1)).toBeLessThan(0.002);
  });
  it('recuo (inset) encolhe o contorno concentricamente; recuo grande demais devolve []', () => {
    const w = 1;
    const r = outline('round', w, w / 2, 0, 0.05);
    expect(top(r)).toBeCloseTo(w / 2 - 0.05, 9);
    expect(r[0]![0]).toBeCloseTo(w / 2 - 0.05, 9);
    expect(ringArea(r) / ((Math.PI * (w / 2 - 0.05) ** 2) / 2)).toBeGreaterThan(0.995);
    expect(outline('round', w, w / 2, 0, 0.6)).toEqual([]);
  });
});

describe('outline: arco abatido (segmental)', () => {
  for (const [w, h, f] of [[1.2, 1.5, 0.2], [2, 2.2, 0.3], [0.9, 2.1, 0.1]] as const) {
    it(`w=${w} h=${h} flecha=${f}: área exata, caixa e topo`, () => {
      const r = outline('segmental', w, h, f);
      const exata = segmentalArea(w, h, f);
      expect(ringArea(r)).toBeLessThanOrEqual(exata + 1e-12);
      expect(exata - ringArea(r)).toBeLessThanOrEqual(arcLen(w, f) * 0.001 + 1e-9);
      expect(inBox(r, w, h)).toBe(true);
      expect(top(r)).toBeCloseTo(h, 9);
      // Nascença em h - flecha: a largura plena vai até lá e depois diminui.
      expect(halfWidthAt(r, h - f - 1e-6)).toBeCloseTo(w / 2, 9);
      expect(halfWidthAt(r, h - 1e-4)).toBeLessThan(w / 2);
    });
  }
  it('recuo mantém concentricidade: topo recua exatamente o inset', () => {
    const r = outline('segmental', 1.2, 1.5, 0.2, 0.04);
    expect(top(r)).toBeCloseTo(1.5 - 0.04, 9);
    expect(inBox(r, 1.2 - 0.08, 1.5)).toBe(true);
  });
  it('flecha inválida (>= w/2 não é abatido... > w/2) lança erro', () => {
    expect(() => outline('segmental', 1, 1, 0.6)).toThrow();
  });
});

describe('faixas horizontais (aproximação do furo)', () => {
  const w = 1.2;
  const ring = outline('round', w, w / 2, 0);
  const exata = (Math.PI * w * w) / 8;
  const tabela: Array<[number, number, number]> = [];
  for (const n of [6, 12, 24, 48, 96]) {
    it(`n=${n}: modo outer contém o contorno; mid tem erro de área pequeno`, () => {
      const outer = holeSlices(ring, n, 'outer');
      const inner = holeSlices(ring, n, 'inner');
      const mid = holeSlices(ring, n, 'mid');
      expect(slicesArea(outer)).toBeGreaterThanOrEqual(exata - 0.0005);
      expect(slicesArea(inner)).toBeLessThanOrEqual(exata + 1e-9);
      // Cada faixa 'outer' contém o contorno naquela altura (a meia-largura é a maior da faixa).
      for (const s of outer) expect(s.half + 1e-6).toBeGreaterThanOrEqual(halfWidthAt(ring, (s.z0 + s.z1) / 2));
      // As faixas cobrem [0, h] sem lacuna.
      expect(outer[0]!.z0).toBe(0);
      expect(outer[outer.length - 1]!.z1).toBeCloseTo(w / 2, 9);
      for (let i = 1; i < outer.length; i++) expect(outer[i]!.z0).toBeCloseTo(outer[i - 1]!.z1, 9);
      const err = Math.abs(slicesArea(mid) / ringArea(ring) - 1); // contra o contorno (a corda de 1 mm é outro erro, já medido)
      tabela.push([n, outer.length, err]);
      if (n >= 24) expect(err).toBeLessThan(0.01);
      if (n >= 96) expect(err).toBeLessThan(0.001);
    });
  }
  it('erro de área (modo mid) cai com o número de faixas', () => {
    const e = [6, 12, 24, 48, 96].map((n) => Math.abs(slicesArea(holeSlices(ring, n, 'mid')) / ringArea(ring) - 1));
    for (let i = 1; i < e.length; i++) expect(e[i]!).toBeLessThan(e[i - 1]!);
  });
  it('desvio máximo da escada ao contorno (modo outer) <= passo de arco', () => {
    // Folga horizontal máxima entre a faixa e o contorno na cota mais baixa da faixa seguinte.
    for (const n of [24, 48, 96]) {
      const sl = holeSlices(ring, n, 'outer');
      const desvio = Math.max(...sl.map((s) => s.half - halfWidthAt(ring, s.z1 - 1e-7)));
      // passo de arco = (π/2·R)/n; no pior caso (coroa) a folga horizontal é ~ o passo.
      expect(desvio).toBeLessThanOrEqual(((Math.PI / 2) * (w / 2)) / n * 1.01 + 0.0011);
    }
  });
});

describe('furo de uma parede de teste pelas faixas (geom: difference)', () => {
  it('volume removido = área do contorno x espessura, dentro do erro da escada', () => {
    const w = 1.2;
    const e = 0.2;
    const L = 4;
    const ring = outline('round', w, w / 2, 0);
    const parede: MultiPolygon = [[[{ x: 0, y: -e / 2 }, { x: L, y: -e / 2 }, { x: L, y: e / 2 }, { x: 0, y: e / 2 }]]];
    const cx = 2;
    let removido = 0;
    for (const s of holeSlices(ring, 48, 'mid')) {
      const furo: MultiPolygon = [[[{ x: cx - s.half, y: -e }, { x: cx + s.half, y: -e }, { x: cx + s.half, y: e }, { x: cx - s.half, y: e }]]];
      removido += (multiArea(parede) - multiArea(difference(parede, furo))) * (s.z1 - s.z0);
    }
    const esperado = ringArea(ring) * e;
    expect(Math.abs(removido / esperado - 1)).toBeLessThan(0.005);
  });
});

/** Parede de 4 m x 2,8 m (wt_alv14), nível 0, com uma janela-vão-livre por faixa empilhada na mesma vertical. */
function paredeFurada(slices: ReadonlyArray<{ z0: number; z1: number; half: number }>, base: number, retorno: 'none' | 'both' = 'none') {
  const s = new ProjectStore(createEmptyProject());
  // `wrapInserts: none` isola o furo; com `both` o motor acrescenta o retorno do acabamento em cada degrau (item R5).
  s.exec({ type: 'upsertWallType', wallType: { ...s.project.wallTypes.wt_alv14!, wrapInserts: retorno } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'a', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  slices.forEach((sl, i) => {
    const tipo = { ...s.project.openingTypes.ot_jv120!, id: `ot_f${i}`, width: 2 * sl.half, height: sl.z1 - sl.z0, sill: base + sl.z0 };
    s.exec({ type: 'upsertOpeningType', openingType: tipo });
    s.exec({ type: 'addOpening', opening: { id: `f${i}`, kind: 'window', typeId: tipo.id, hostId: 'a', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  });
  return s;
}
const volumeDaParede = (s: ProjectStore): { vol: number; bandas: number; ms: number } => {
  const t0 = performance.now();
  const w = resolveLevel(s.project, 'lv_0').walls.a!;
  const ms = performance.now() - t0;
  let vol = 0;
  let bandas = 0;
  for (const l of w.layers) {
    for (const b of l.bands) vol += bandVolume(b);
    bandas = Math.max(bandas, l.bands.length);
  }
  return { vol, bandas, ms };
};

describe('motor real: faixas empilhadas fazem o motor furar por contorno SEM mudar o motor', () => {
  const w = 1.2;
  const base = 0.3;
  const ring = outline('round', w, w / 2, 0);
  const vazia = volumeDaParede(paredeFurada([], base));
  for (const n of [12, 24, 48]) {
    it(`meia-lua w=${w}, n=${n}: volume removido da parede bate com área do contorno x espessura`, () => {
      const sl = holeSlices(ring, n, 'mid');
      const furada = volumeDaParede(paredeFurada(sl, base));
      const ms = furada.ms;
      const removido = vazia.vol - furada.vol;
      const esperado = ringArea(ring) * 0.184; // espessura total do tipo (soma das 5 camadas)
      const erro = removido / esperado - 1;
      // eslint-disable-next-line no-console
      console.log(`[spike] n=${n} faixas=${sl.length} bandas/camada=${furada.bandas} removido=${removido.toFixed(5)} esperado=${esperado.toFixed(5)} erro=${(erro * 100).toFixed(3)}% resolveLevel=${ms.toFixed(0)}ms (vazia: ${vazia.ms.toFixed(0)}ms)`);
      expect(Math.abs(erro)).toBeLessThan(n >= 24 ? 0.01 : 0.03);
      // Uma banda por faixa do furo (mais as bandas acima e abaixo da meia-lua).
      expect(furada.bandas).toBeGreaterThanOrEqual(sl.length);
    });
  }
});

describe('motor real: arco abatido e retorno do acabamento', () => {
  const base = 0.3;
  it('arco abatido (w=1,2 h=1,5 flecha=0,2), n=24: volume removido bate com o contorno', () => {
    const ring = outline('segmental', 1.2, 1.5, 0.2);
    const vazia = volumeDaParede(paredeFurada([], base));
    const furada = volumeDaParede(paredeFurada(holeSlices(ring, 24, 'mid'), base));
    const erro = (vazia.vol - furada.vol) / (ringArea(ring) * 0.184) - 1;
    // eslint-disable-next-line no-console
    console.log(`[spike] abatido n=24 bandas/camada=${furada.bandas} erro=${(erro * 100).toFixed(3)}%`);
    expect(Math.abs(erro)).toBeLessThan(0.01);
  });
  it('com retorno (wrapInserts both) o motor acrescenta material nos degraus: o retorno hoje segue a escada, não o contorno', () => {
    const ring = outline('round', 1.2, 0.6, 0);
    const sl = holeSlices(ring, 24, 'mid');
    const vazia = volumeDaParede(paredeFurada([], base, 'both'));
    const furada = volumeDaParede(paredeFurada(sl, base, 'both'));
    const semRetorno = volumeDaParede(paredeFurada(sl, base, 'none'));
    const retorno = furada.vol - semRetorno.vol;
    // eslint-disable-next-line no-console
    console.log(`[spike] retorno acrescenta ${retorno.toFixed(5)} m3 (${((retorno / (ringArea(ring) * 0.184)) * 100).toFixed(1)}% do volume furado)`);
    expect(vazia.vol).toBeGreaterThan(0);
    expect(retorno).toBeGreaterThan(0);
  });
});
