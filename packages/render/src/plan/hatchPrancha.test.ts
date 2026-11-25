import { describe, expect, it } from 'vitest';
import type { Polygon, Vec2 } from '@hestia/geom';
import type { HatchKind } from '@hestia/model';
import { HATCH_SPACING, hachuraDePrancha, hatchSegments, medidasDaHachura } from './hatch.ts';
import { CODIGO_HACHURA } from './lotesGpu.ts';
import { MAX_PRIMS, PRIM_CODE_BASE, PRIM_HATCHES, PRIM_KINDS, primCode, primsOfCode } from './hatchDefs.ts';
import { hachuraCobertura, hachuraCobre } from './rasterSoftware.ts';
import { buildPlanDrawList } from './build.ts';
import { canonico, cenarios, entradaDe } from './cenariosZoom.ts';
import { thinHatches } from './thin.ts';
import type { FillOp } from './types.ts';

const quadrado: Polygon = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]];
const distAoSegmento = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

describe('hachura de prancha em mm de papel', () => {
  it('as medidas valem no papel: em 1:100 o passo de 1,5 mm é 0,15 m, a linha de 0,09 mm tem piso de 0,5 px e engrossa com o zoom', () => {
    const p = hachuraDePrancha(100);
    expect(p).toEqual({ pitchMm: 1.5, lineMm: 0.09, dotMm: 0.3, escala: 100 });
    const baixo = medidasDaHachura(p, 50);
    expect(baixo.espaco).toBeCloseTo(0.15, 12);
    // 0,09 mm × (100/1000) × 50 px/m = 0,45 px → piso de 0,5 px; ponto: 0,3 mm × 0,1 × 50 = 1,5 px
    expect(baixo.linhaPx).toBe(0.5);
    expect(baixo.pontoPx).toBeCloseTo(1.5, 12);
    // 0,09 × 0,1 × 400 = 3,6 px
    expect(medidasDaHachura(p, 400).linhaPx).toBeCloseTo(3.6, 12);
  });

  it('em 1:50 a linha é de 0,13 mm e o passo 0,075 m', () => {
    const p = hachuraDePrancha(50);
    expect(p.lineMm).toBe(0.13);
    // 0,13 mm × (50/1000) × 400 px/m = 2,6 px
    expect(medidasDaHachura(p, 400).linhaPx).toBeCloseTo(2.6, 12);
    expect(medidasDaHachura(p, 400).espaco).toBeCloseTo(0.075, 12);
  });

  it('com "Linhas finas (tela)" a espessura da hachura fica limitada a um fio (1 px a linha, 1,5 px o ponto) e o passo não muda', () => {
    const p = hachuraDePrancha(100);
    const fina = medidasDaHachura(p, 400, true);
    expect(fina.linhaPx).toBe(1);
    expect(fina.pontoPx).toBe(1.5);
    expect(fina.espaco).toBeCloseTo(0.15, 12);
    // abaixo do teto a linha fina não engorda: no zoom 50 continua em 0,5 px
    expect(medidasDaHachura(p, 50, true).linhaPx).toBe(0.5);
    // sem a opção, o zoom 400 dá 3,6 px
    expect(medidasDaHachura(p, 400, false).linhaPx).toBeCloseTo(3.6, 12);
  });

  it('sem papel valem as constantes de tela de sempre', () => {
    expect(medidasDaHachura(undefined, 123)).toEqual({ espaco: HATCH_SPACING, linhaPx: 1, pontoPx: 2 });
  });

  it('o passo do gerador de CPU muda a distância entre as linhas (madeira, passo 0,1: linhas a cada 0,08 m)', () => {
    const segs = hatchSegments(quadrado, 'timber', 0.1);
    const ys = [...new Set(segs.map((s) => Math.round(s.a.y * 1e6) / 1e6))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(10);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeCloseTo(0.08, 6);
  });

  it('sem o argumento de passo o resultado é o de antes (0,05 m)', () => {
    const a = hatchSegments(quadrado, 'diagonal');
    const b = hatchSegments(quadrado, 'diagonal', HATCH_SPACING);
    expect(a).toEqual(b);
  });
});

describe('o espelho em software do shader concorda com o gerador de CPU (padrões 1 a 9 e por primitivas)', () => {
  const kinds: HatchKind[] = ['diagonal', 'cross', 'gesso', 'dots', 'brick', 'concrete', 'timber', 'insulation', 'earth', ...PRIM_KINDS];
  const zoom = 200;
  const papel = hachuraDePrancha(100);
  const med = medidasDaHachura(papel, zoom);
  const pontoM = med.espaco / 4;

  for (const kind of kinds) {
    it(`${kind}: o meio de cada traço do gerador é coberto, e a grade de pontos de prova concorda em 96% ou mais`, () => {
      const codigo = CODIGO_HACHURA[kind];
      expect(codigo).toBeGreaterThan(0);
      const segs = hatchSegments(quadrado, kind, med.espaco);
      expect(segs.length).toBeGreaterThan(5);
      for (const s of segs) {
        const m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
        expect(hachuraCobre(codigo, m.x, m.y, zoom, 0, med.espaco, med.linhaPx, med.pontoPx, pontoM), `${kind} meio de ${JSON.stringify(s)}`).toBe(true);
      }
      let concordam = 0;
      let total = 0;
      const meiaLinha = (0.5 * med.linhaPx) / zoom;
      const meiaPonto = (0.5 * med.pontoPx) / zoom;
      for (let i = 0; i < 90; i++) {
        for (let j = 0; j < 90; j++) {
          const p = { x: 0.1 + (i * 0.8) / 89 + 0.0013, y: 0.1 + (j * 0.8) / 89 + 0.0007 };
          // distância ao traço mais próximo menos a meia espessura dele: negativa = dentro do traço, positiva = fora
          const folga = Math.min(...segs.map((sg) => distAoSegmento(p, sg.a, sg.b) - (sg.dot ? meiaPonto : meiaLinha)));
          if (Math.abs(folga) < 1.5 * meiaLinha) continue; // margem do traço: aqui os dois modelos podem divergir por arredondamento
          const cpu = folga < 0;
          const gpu = hachuraCobre(codigo, p.x, p.y, zoom, 0, med.espaco, med.linhaPx, med.pontoPx, pontoM);
          total++;
          if (cpu === gpu) concordam++;
        }
      }
      expect(total).toBeGreaterThan(800);
      expect(concordam / total).toBeGreaterThanOrEqual(0.96);
    });
  }
});

describe('cobertura analítica da hachura (antialiasing)', () => {
  const zoom = 100;
  const espaco = 0.15;

  it('uma linha mais fina que o pixel sai como fio parcial: 0,4 px de largura dá 40 % de cobertura no centro', () => {
    // diagonal de índice 0: x = y = 0,3 está sobre a linha (diag1 = 0)
    expect(hachuraCobertura(1, 0.3, 0.3, zoom, 0, espaco, 0.4, 2, espaco / 4)).toBeCloseTo(0.4, 9);
  });

  it('uma linha de 2 px cobre 100 % no centro e 50 % a 1 px do centro (a borda dela)', () => {
    expect(hachuraCobertura(1, 0.3, 0.3, zoom, 0, espaco, 2, 2, espaco / 4)).toBeCloseTo(1, 9);
    // ponto com diag1 = 0,01 m = 1 px do centro da linha
    expect(hachuraCobertura(1, 0.3, 0.3 + 0.01 * Math.SQRT2, zoom, 0, espaco, 2, 2, espaco / 4)).toBeCloseTo(0.5, 9);
  });

  it('longe das linhas a cobertura é 0 (meio passo = 7,5 px do centro)', () => {
    // diag1 = 0,075 m: ponto (0,3 ; 0,3 + 0,075·√2)
    expect(hachuraCobertura(1, 0.3, 0.3 + 0.075 * Math.SQRT2, zoom, 0, espaco, 2, 2, espaco / 4)).toBe(0);
  });

  it('a borda de um tracejado também é suavizada: no fim do trecho pintado do gesso a cobertura é 50 %', () => {
    // gesso: pintado 10/16 do passo; no limite (x = 0,09375), em cima da linha horizontal de 2 px
    expect(hachuraCobertura(3, (espaco * 10) / 16, 0, zoom, 0, espaco, 2, 2, espaco / 4)).toBeCloseTo(0.5, 9);
  });

  it('nunca passa de 1 nem fica negativa, em nenhum padrão', () => {
    for (const codigo of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      for (let i = 0; i < 60; i++) {
        for (let j = 0; j < 60; j++) {
          const c = hachuraCobertura(codigo, i * 0.0137, j * 0.0119, zoom, 0, espaco, 1.3, 1.5, espaco / 4);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('com o passo menor que um pixel vale a densidade média (tom uniforme, sem moiré): linha de 1 px a cada 0,5 px cobre 100 %', () => {
    // espaco 0,005 m a zoom 100 = 0,5 px; w = 1 px → w/passo = 2, limitado a 1
    expect(hachuraCobertura(1, 0.3, 0.3, 100, 0, 0.005, 1, 2, 0.001)).toBe(1);
    // espaco 0,01 m = 1 px de passo (limite): vale a conta de distância, não a densidade
    expect(hachuraCobertura(1, 0.3, 0.3, 100, 0, 0.01, 0.4, 2, 0.001)).toBeCloseTo(0.4, 9);
    // linha de 0,25 px a cada 0,5 px: densidade 0,5
    expect(hachuraCobertura(1, 0.3, 0.3, 100, 0, 0.005, 0.25, 2, 0.001)).toBeCloseTo(0.5, 9);
  });

  it('abaixo do zoom mínimo não cobre nada; o sólido cobre tudo', () => {
    expect(hachuraCobertura(1, 0.3, 0.3, 10, 40, espaco, 2, 2, espaco / 4)).toBe(0);
    expect(hachuraCobertura(0, 0.31, 0.77, zoom, 0, espaco, 2, 2, espaco / 4)).toBe(1);
  });
});

describe('Linhas finas (tela) valem também para as hachuras', () => {
  it('thinHatches marca como fina só a hachura de papel e copia os objetos (não altera os originais)', () => {
    const original = { polygons: quadrado.map((r) => [r]), color: '#fff', alpha: 1, hatch: { kind: 'diagonal' as const, color: '#454649', papel: hachuraDePrancha(100) } };
    const semPapel = { polygons: [quadrado], color: '#fff', alpha: 1, hatch: { kind: 'diagonal' as const, color: '#777777' } };
    const fills: FillOp[] = [original, semPapel];
    thinHatches(fills);
    expect(fills[0]!.hatch!.fina).toBe(true);
    expect(original.hatch).not.toHaveProperty('fina');
    expect(fills[1]!.hatch).not.toHaveProperty('fina');
  });

  it('a planta com linhas finas leva hachura fina; sem a opção, nenhuma', () => {
    const cs = cenarios();
    const com = cs.find((c) => c.nome === 'completo linhas finas')!;
    const sem = cs.find((c) => c.nome === 'completo')!;
    const hachuras = (c: typeof com) => buildPlanDrawList(entradaDe(c, 60)).fills.filter((f) => f.hatch?.papel);
    const comFina = hachuras(com);
    const semFina = hachuras(sem);
    expect(comFina.length).toBeGreaterThan(0);
    expect(comFina.every((f) => f.hatch!.fina === true)).toBe(true);
    expect(semFina.length).toBeGreaterThan(0);
    expect(semFina.every((f) => f.hatch!.fina === undefined)).toBe(true);
    void canonico;
  });
});

describe('tabela de padrões por primitivas (hatchDefs)', () => {
  it('são 11 padrões novos, cada um com 1 a MAX_PRIMS primitivas', () => {
    expect(PRIM_KINDS).toEqual(['cmu', 'exposedBrick', 'rcConcrete', 'stone', 'gravel', 'sand', 'eps', 'woolZigzag', 'gypsum', 'timberEnd', 'steel']);
    for (const k of PRIM_KINDS) {
      const n = PRIM_HATCHES[k]!.length;
      expect(n, k).toBeGreaterThanOrEqual(1);
      expect(n, k).toBeLessThanOrEqual(MAX_PRIMS);
    }
  });

  it('os códigos de shader são consecutivos a partir de 10 e voltam à mesma lista de primitivas', () => {
    PRIM_KINDS.forEach((k, i) => {
      expect(primCode(k)).toBe(PRIM_CODE_BASE + i);
      expect(CODIGO_HACHURA[k]).toBe(10 + i);
      expect(primsOfCode(10 + i)).toBe(PRIM_HATCHES[k]);
    });
    expect(primCode('diagonal')).toBeUndefined();
    expect(primsOfCode(5)).toEqual([]);
  });

  it('o gerador de CPU de cada padrão novo desenha segmentos dentro do contorno (3 m × 3 m, passo 0,05 m)', () => {
    const q: Polygon = [[{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }]];
    for (const k of PRIM_KINDS) {
      const segs = hatchSegments(q, k, 0.05);
      expect(segs.length, k).toBeGreaterThan(20);
      for (const sg of segs) {
        for (const p of [sg.a, sg.b]) {
          expect(p.x, k).toBeGreaterThanOrEqual(-1e-9);
          expect(p.x, k).toBeLessThanOrEqual(3 + 1e-9);
          expect(p.y, k).toBeGreaterThanOrEqual(-1e-9);
          expect(p.y, k).toBeLessThanOrEqual(3 + 1e-9);
        }
      }
    }
  });

  it('cmu: o quadriculado tem retas horizontais e verticais a cada 3 passos (0,15 m com passo 0,05 m)', () => {
    const q: Polygon = [[{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }]];
    const segs = hatchSegments(q, 'cmu', 0.05);
    const horiz = segs.filter((s) => Math.abs(s.a.y - s.b.y) < 1e-9);
    const vert = segs.filter((s) => Math.abs(s.a.x - s.b.x) < 1e-9);
    expect(horiz.length + vert.length).toBe(segs.length);
    const ys = [...new Set(horiz.map((s) => Math.round(s.a.y * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeCloseTo(0.15, 6);
    const xs = [...new Set(vert.map((s) => Math.round(s.a.x * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(0.15, 6);
  });
});
