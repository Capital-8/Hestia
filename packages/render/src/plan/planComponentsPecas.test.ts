import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Component, type Peca, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { componentsPlanOps } from './planComponents.ts';
import type { FillOp } from './types.ts';
import { LIGHT } from './types.ts';

/** Família de teste só com as peças dadas (medidas em mm); não depende da biblioteca. */
function projeto(pecas: Peca[], x = 2, y = 1, extra: Partial<Component> = {}): Project {
  const p = createEmptyProject('t');
  const f = structuredClone(FAMILIA_ARMARIO);
  Object.assign(f, { id: 'fam_teste_planta', nome: 'Teste', parametros: f.parametros.filter((q) => ['L', 'A', 'P'].includes(q.id)), planos: [], pecas, aninhados: [], ferragens: [], tipos: [], tipoPadrao: undefined, caixaria: undefined, conectores: undefined, escolhas: undefined });
  aplicar(p, { type: 'upsertFamily', family: f });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: 'fam_teste_planta', typeId: null, levelId: p.levels[0]!.id, order: 1, x, y, z: 0, rotation: 0, mirrored: false, mark: 'c1', ...extra };
  return p;
}

const peca = (id: string, papel: Peca['papel'], eixo: Peca['eixo'], origem: [string, string, string], tamanho: [string, string], espessura: string, mais: Partial<Peca> = {}): Peca => ({ id, nome: id, papel, eixo, origem, tamanho, espessura, ...mais });

const ops = (p: Project, sombreado: boolean, detalhe: 'coarse' | 'medium' | 'fine', aramado = false) => componentsPlanOps(p, p.levels[0]!.id, LIGHT, undefined, sombreado, detalhe, aramado);
const pts = (f: FillOp) => f.polygons.flat(2);
const caixa = (f: FillOp): number[] => {
  const q = pts(f);
  return [Math.min(...q.map((v) => v.x)), Math.min(...q.map((v) => v.y)), Math.max(...q.map((v) => v.x)), Math.max(...q.map((v) => v.y))].map((n) => Math.round(n * 1e4) / 1e4);
};

/** Contorno de 64 lados, raio 600 mm, centrado em (600, 600) mm. */
const CIRCULO = Array.from({ length: 64 }, (_, k): [string, string] => [String(600 + 600 * Math.cos((2 * Math.PI * k) / 64)), String(600 + 600 * Math.sin((2 * Math.PI * k) / 64))]);

/** Largura da caixa em mm inteiros (evita ruído de ponto flutuante). */
const largura = (f: FillOp): number => Math.round((caixa(f)[2]! - caixa(f)[0]!) * 1000);

const PES_REDONDA = [['350', '350'], ['800', '350'], ['350', '800'], ['800', '800']].map(([x, y], i) => peca(`pe${i}`, 'bloco', 'z', [x!, y!, '0'], ['50', '50'], '700'));

describe('planta real: mesa redonda', () => {
  const p = projeto([
    peca('tampo', 'tampo', 'z', ['0', '0', '720'], ['1200', '1200'], '30', { contorno: { tipo: 'poligono', pontos: CIRCULO } }),
    ...PES_REDONDA,
  ]);
  const pesNo = (f: FillOp[]) => f.filter((q) => largura(q) === 50);

  it('tampo com 64 vértices a 0,600 m do centro (2,6; 1,6)', () => {
    const t = ops(p, false, 'medium').fills.find((f) => pts(f).length === 64)!;
    expect(t).toBeDefined();
    for (const v of pts(t)) expect(Math.abs(Math.hypot(v.x - 2.6, v.y - 1.6) - 0.6)).toBeLessThan(0.001);
  });

  it('4 pés pequenos (0,05 m) no médio e no fino, nenhum no grosseiro', () => {
    expect(pesNo(ops(p, false, 'coarse').fills)).toHaveLength(0);
    expect(pesNo(ops(p, false, 'medium').fills)).toHaveLength(4);
    expect(pesNo(ops(p, false, 'fine').fills)).toHaveLength(4);
  });

  it('pés vêm antes do tampo (z crescente)', () => {
    const f = ops(p, false, 'medium').fills;
    expect(f.findIndex((q) => pts(q).length === 64)).toBe(4);
  });
});

describe('planta real: mesa de vidro 1,60 x 0,90 sobre 4 pés de metal', () => {
  const pe = (id: string, x: string, y: string) => peca(id, 'bloco', 'z', [x, y, '0'], ['40', '40'], '710', { material: 'mat_metal' });
  const p = projeto([
    pe('p1', '20', '20'), pe('p2', '1540', '20'), pe('p3', '20', '840'), pe('p4', '1540', '840'),
    peca('tampo', 'tampo', 'z', ['0', '0', '720'], ['1600', '900'], '10', { material: 'mat_vidro' }),
  ]);
  const f = ops(p, true, 'medium').fills;

  it('vidro com alpha 0,25 e caixa 2..3,6 x 1..1,9; pés opacos antes dele', () => {
    const vidro = f.find((q) => largura(q) === 1600)!;
    expect(vidro.alpha).toBe(0.25);
    expect(caixa(vidro)).toEqual([2, 1, 3.6, 1.9]);
    expect(f.indexOf(vidro)).toBe(f.length - 1);
    const pes = f.filter((q) => largura(q) === 40);
    expect(pes).toHaveLength(4);
    for (const q of pes) expect(q.alpha).toBe(1);
  });

  it('os pés têm contorno sólido (o vidro não os encobre)', () => {
    const s = ops(p, true, 'medium').strokes.filter((q) => q.closed && !q.dash);
    expect(s).toHaveLength(5);
  });
});

describe('planta real: eixos, vazio, rotação e espelhamento', () => {
  it('peça de eixo y vira 0,8 x 0,018 e a de eixo x vira 0,018 x 0,4', () => {
    const p = projeto([peca('a', 'painel', 'y', ['100', '50', '0'], ['800', '300'], '18'), peca('b', 'painel', 'x', ['1500', '0', '0'], ['400', '300'], '18')], 0, 0);
    const f = ops(p, false, 'medium').fills;
    expect(f.map(caixa)).toEqual([[0.1, 0.05, 0.9, 0.068], [1.5, 0, 1.518, 0.4]]);
  });

  it('peça vazia não vira sólido', () => {
    const p = projeto([peca('a', 'painel', 'z', ['0', '0', '0'], ['400', '400'], '20'), peca('furo', 'generica', 'z', ['100', '100', '0'], ['100', '100'], '20', { vazio: true })], 0, 0);
    expect(ops(p, false, 'fine').fills).toHaveLength(1);
  });

  const unica = (extra: Partial<Component>) => caixa(ops(projeto([peca('a', 'painel', 'z', ['100', '50', '0'], ['400', '200'], '20')], 1, 1, extra), false, 'medium').fills[0]!);
  it('rotação de 90 graus em (1,1): x 0,75..0,95, y 1,1..1,5', () => {
    expect(unica({ rotation: Math.PI / 2 })).toEqual([0.75, 1.1, 0.95, 1.5]);
  });
  it('espelhado em (1,1): x 0,5..0,9, y 1,05..1,25', () => {
    expect(unica({ mirrored: true })).toEqual([0.5, 1.05, 0.9, 1.25]);
  });
});

describe('planta real: aramado e aéreo', () => {
  const duas = [peca('a', 'painel', 'z', ['0', '0', '1400'], ['300', '300'], '20'), peca('b', 'painel', 'z', ['700', '0', '1400'], ['300', '300'], '20')];
  it('aramado (e sombreado) não preenche', () => {
    const p = projeto([peca('a', 'painel', 'z', ['0', '0', '0'], ['400', '400'], '20')]);
    const o = ops(p, true, 'medium', true);
    expect(o.fills).toHaveLength(0);
    expect(o.strokes.length).toBeGreaterThan(0);
  });
  it('aéreo: duas silhuetas tracejadas de 0,3 m (não a caixa de 1,0 m) e véu 0,25 na cor do corpo', () => {
    const p = projeto(duas);
    const o = ops(p, true, 'medium');
    const s = o.strokes.filter((q) => q.closed);
    expect(s).toHaveLength(2);
    for (const q of s) {
      expect(q.dash).toEqual([4, 3]);
      const xs = q.pts.map((v) => v.x);
      expect(Math.round((Math.max(...xs) - Math.min(...xs)) * 1e3) / 1e3).toBe(0.3);
    }
    expect(o.fills).toHaveLength(1);
    expect(o.fills[0]!.alpha).toBe(0.25);
  });
});

describe('planta real: desempenho', () => {
  it('300 móveis: tempo da projeção real contra o da pegada', () => {
    const p = projeto([
      peca('tampo', 'tampo', 'z', ['0', '0', '720'], ['1200', '1200'], '30', { contorno: { tipo: 'poligono', pontos: CIRCULO } }),
      ...PES_REDONDA,
    ]);
    for (let i = 2; i <= 300; i++) p.elements[`c${i}`] = { ...(p.elements.c1 as Component), id: `c${i}`, x: (i % 20) * 2, y: Math.floor(i / 20) * 2 };
    const t = (d: 'coarse' | 'medium') => { const a = performance.now(); ops(p, true, d); return performance.now() - a; };
    t('medium');
    const grosso = t('coarse');
    const medio = t('medium');
    console.log(`componentsPlanOps 300 moveis: grosseiro ${Math.round(grosso)} ms, medio ${Math.round(medio)} ms`);
    expect(medio).toBeLessThan(1500);
  });
});
