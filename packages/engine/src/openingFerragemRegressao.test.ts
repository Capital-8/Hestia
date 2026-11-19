import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, outline } from '@hestia/model';
import { formaDaEsquadria } from './openingShapeEsquadria.ts';
import { openingShapeIssues } from './openingShapeIssues.ts';
import { violacoesDeFerragem } from './openingFerragemContrato.ts';
import { anelDaPeca, distRetAnel, fatiaEm, folgaAteAlguma } from './openingFerragemGeom.ts';
import { cenaDoTipo, formaDaVarredura, type NomeForma } from './openingFerragemCenas.ts';
import type { Lang } from './i18nMessages.ts';
import type { OpeningPart } from './openingModelTypes.ts';

/*
 * docs/estudo-esquadrias/42: regressões nomeadas do relato "numa ogival muito triangular a dobradiça sai da posição e se separa da porta",
 * a geometria de contato e o aviso (7 idiomas) quando a folha não comporta todas as dobradiças.
 */

const tipo = (id: string) => DEFAULT_OPENING_TYPES.find((x) => x.id === id)!;
const PORTA = tipo('ot_pgiro90');

function modelo(nome: NomeForma, t = PORTA, hand = false) {
  const forma = formaDaVarredura(nome, t.width, t.height);
  const { m } = cenaDoTipo(t, forma, hand);
  const s = formaDaEsquadria(forma, m.width, m.height)!;
  expect(s, `${nome}: a forma vale na esquadria`).not.toBeNull();
  const sem = cenaDoTipo(t, undefined, hand).m;
  const folha = m.parts.filter((q) => q.role === 'leaf');
  const hinges = m.parts.filter((q) => q.role === 'hinge');
  return { m, sem, s, folha, hinges, violacoes: violacoesDeFerragem(m, sem, outline(s)) };
}

describe('ogival muito triangular (flecha de 2 a 3 vezes a largura)', () => {
  for (const nome of ['ogival-2', 'ogival-3'] as const) {
    for (const hand of [false, true]) {
      it(`${nome}, eixo ${hand ? 'direito' : 'esquerdo'}: as 3 dobradiças ficam presas à folha e ao batente`, () => {
        const { hinges, folha, m, violacoes } = modelo(nome, PORTA, hand);
        expect(violacoes).toEqual([]);
        expect(hinges).toHaveLength(3);
        for (const h of hinges) {
          expect(folgaAteAlguma(h.box, folha), h.id).toBeLessThanOrEqual(1e-3);
          expect(folgaAteAlguma(h.box, m.parts.filter((q) => q.role === 'jamb' || q.role === 'head')), h.id).toBeLessThanOrEqual(1e-3);
        }
      });
    }
  }

  it('onde o antigo deslocamento "o mínimo em z" soltava a dobradiça (ombreira vertical curta), a nova fica sobre a aresta curva da folha', () => {
    const { hinges, folha } = modelo('ogival-3');
    const aneis = folha.map(anelDaPeca);
    const zs = hinges.map((h) => (h.box.z0 + h.box.z1) / 2).sort((a, b) => a - b);
    for (const z of zs) {
      const f = fatiaEm(aneis, z)!;
      const h = hinges.find((q) => Math.abs((q.box.z0 + q.box.z1) / 2 - z) < 1e-9)!;
      expect(Math.abs(f.min - (h.box.t0 + h.box.t1) / 2), `z=${z}`).toBeLessThanOrEqual(0.05);
    }
    expect(zs[2]! - zs[1]!).toBeCloseTo(zs[1]! - zs[0]!, 3); // distribuição regular
    expect(zs[1]! - zs[0]!).toBeGreaterThanOrEqual(0.2);
  });

  it('largura estreita: porta de 50 cm com ogival muito agudo', () => {
    const t = { ...PORTA, width: 0.5, height: 2.1 };
    const { violacoes, hinges } = modelo('ogival-3', t);
    expect(violacoes).toEqual([]);
    expect(hinges.length).toBeGreaterThan(0);
  });
});

describe('empena triangular (cumeeira = altura)', () => {
  it.each([false, true])('as dobradiças acompanham a aresta inclinada da folha (eixo à direita: %s)', (hand) => {
    const { hinges, violacoes, folha } = modelo('empena-triangulo', PORTA, hand);
    expect(violacoes).toEqual([]);
    expect(hinges).toHaveLength(3);
    const aneis = folha.map(anelDaPeca);
    // a aresta lateral é inclinada: as três dobradiças não ficam na mesma posição em t
    const ts = new Set(hinges.map((h) => Math.round(((h.box.t0 + h.box.t1) / 2) * 1000)));
    expect(ts.size).toBeGreaterThan(1);
    for (const h of hinges) expect(fatiaEm(aneis, (h.box.z0 + h.box.z1) / 2)!.max - fatiaEm(aneis, (h.box.z0 + h.box.z1) / 2)!.min).toBeGreaterThanOrEqual(0.1);
  });
});

describe('círculo', () => {
  it('porta de giro em círculo: dobradiças na aresta curva da folha, maçaneta sobre a folha', () => {
    const { violacoes, hinges, m } = modelo('circle');
    expect(violacoes).toEqual([]);
    expect(hinges.length).toBeGreaterThan(0);
    expect(m.parts.some((q) => q.role === 'handle')).toBe(true);
  });
});

describe('trapézio com topo mínimo e ferradura estreita', () => {
  it('trapézio de topo mínimo: contrato vale mesmo com o batente recusado', () => {
    expect(modelo('trapezio-min').violacoes).toEqual([]);
  });
  it('ferradura de pescoço estreito: a porta de giro é incompatível (sai fixa, sem ferragem solta); a pivotante mantém a maçaneta presa', () => {
    const giro = cenaDoTipo(PORTA, formaDaVarredura('ferradura-estreita', PORTA.width, PORTA.height)).m;
    expect(giro.parts.filter((q) => q.role === 'hinge' || q.role === 'handle')).toEqual([]);
    const piv = tipo('ot_ppiv_100_vid');
    const forma = formaDaVarredura('ferradura-estreita', piv.width, piv.height);
    const { m } = cenaDoTipo(piv, forma);
    const s = formaDaEsquadria(forma, m.width, m.height);
    if (s) expect(violacoesDeFerragem(m, cenaDoTipo(piv).m, outline(s))).toEqual([]);
  });
});

describe('aviso quando a folha não comporta todas as ferragens', () => {
  const t = tipo('ot_pvid82_8'); // porta de vidro: sem batente, a folha é o aro de 10 cm
  const { p, m } = cenaDoTipo(t, formaDaVarredura('trapezio-min', t.width, t.height));
  const avisos = m.ferragemAvisos ?? [];

  it('o modelo reduz as dobradiças e remove a maçaneta, sem deixar nada solto, e registra o aviso', () => {
    const h = avisos.find((a) => a.tipo === 'hinge')!;
    expect(h.colocado).toBeLessThan(h.pedido);
    expect(m.parts.filter((q) => q.role === 'hinge')).toHaveLength(h.colocado);
    expect(avisos.some((a) => a.tipo === 'handle' && a.colocado === 0)).toBe(true);
    expect(m.parts.some((q) => q.role === 'handle')).toBe(false);
    const forma = formaDaVarredura('trapezio-min', t.width, t.height);
    expect(violacoesDeFerragem(m, cenaDoTipo(t).m, outline(formaDaEsquadria(forma, m.width, m.height)!))).toEqual([]);
  });

  it.each(['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as Lang[])('openingShapeIssues avisa em %s (dobradiças reduzidas e maçaneta removida)', (lang) => {
    const issues = openingShapeIssues(p, lang);
    const h = issues.find((i) => i.code === 'ferragem-dobradicas-reduzidas')!;
    const mac = issues.find((i) => i.code === 'ferragem-macaneta-removida')!;
    expect(h).toBeDefined();
    expect(mac).toBeDefined();
    for (const i of [h, mac]) {
      expect(i.severity).toBe('warning');
      expect(i.elementId).toBe('v');
      expect(i.message).toContain('"v"');
      expect(i.message).not.toMatch(/[{}]/);
    }
    const a = avisos.find((x) => x.tipo === 'hinge')!;
    expect(h.message).toContain(String(a.colocado));
    expect(h.message).toContain(String(a.pedido));
  });

  it('sem redução nenhum aviso de ferragem (ogival comum e vão retangular)', () => {
    for (const forma of [formaDaVarredura('ogival', PORTA.width, PORTA.height), undefined]) {
      const { p: p2, m: m2 } = cenaDoTipo(PORTA, forma);
      expect(m2.ferragemAvisos).toBeUndefined();
      expect(openingShapeIssues(p2).filter((i) => i.code.startsWith('ferragem-'))).toEqual([]);
    }
  });
});

describe('geometria de contato', () => {
  const quadrado: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
  it('distRetAnel: 0 quando sobrepõe, toca ou contém; distância quando afastado', () => {
    expect(distRetAnel({ t0: 0.5, t1: 2, z0: 0.5, z1: 2 }, quadrado)).toBe(0); // cruza
    expect(distRetAnel({ t0: 1, t1: 2, z0: 0, z1: 1 }, quadrado)).toBe(0); // encosta
    expect(distRetAnel({ t0: -1, t1: 2, z0: -1, z1: 2 }, quadrado)).toBe(0); // contém
    expect(distRetAnel({ t0: 0.2, t1: 0.4, z0: 0.2, z1: 0.4 }, quadrado)).toBe(0); // dentro
    expect(distRetAnel({ t0: 1.5, t1: 2, z0: 0, z1: 1 }, quadrado)).toBeCloseTo(0.5, 9);
    expect(distRetAnel({ t0: 2, t1: 3, z0: 2, z1: 3 }, quadrado)).toBeCloseTo(Math.SQRT2, 9);
  });
  it('fatiaEm: extremos em t da fatia; nulo fora do anel', () => {
    const tri: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, 2]];
    expect(fatiaEm([tri], 1)).toEqual({ min: -0.5, max: 0.5 });
    expect(fatiaEm([tri], 3)).toBeNull();
  });
  it('folgaAteAlguma soma a folga em s: peça a 3 mm de profundidade da folha não está encostada', () => {
    const peca = { id: 'x', role: 'leaf', material: 'leaf', box: { t0: 0, t1: 1, s0: 0, s1: 0.04, z0: 0, z1: 1 } } as OpeningPart;
    expect(folgaAteAlguma({ t0: 0.5, t1: 0.6, s0: 0.04, s1: 0.05, z0: 0.2, z1: 0.3 }, [peca])).toBe(0);
    expect(folgaAteAlguma({ t0: 0.5, t1: 0.6, s0: 0.043, s1: 0.05, z0: 0.2, z1: 0.3 }, [peca])).toBeCloseTo(0.003, 9);
  });
});
