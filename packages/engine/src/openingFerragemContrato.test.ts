import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, outline, shapeIncompatible, type OpeningType } from '@hestia/model';
import { formaDaEsquadria } from './openingShapeEsquadria.ts';
import { violacoesDeFerragem } from './openingFerragemContrato.ts';
import { NOMES_FORMAS, cenaDoTipo, formaDaVarredura, type NomeForma } from './openingFerragemCenas.ts';

/*
 * docs/estudo-esquadrias/42: contrato de posição válida das ferragens, varrido nos 162 tipos do catálogo x 14 formas (os 9 tipos de forma,
 * com parâmetros extremos) x os dois lados do eixo (flipHand) e, nas formas mais agudas, as duas faces (flipFacing). Dobradiça: dentro do
 * contorno, encostada na folha e no batente, sobre a aresta de articulação que existe, espaçamento >= 2 x altura e regular, quantidade
 * preservada ou reduzida com aviso, lado do eixo. Maçaneta: dentro do contorno, sobre a folha, encostada. Nenhum modelo lança.
 */

const TIPOS = DEFAULT_OPENING_TYPES.filter((t) => cenaDoTipo(t).m.parts.some((q) => q.role === 'hinge' || q.role === 'handle'));
const FACE_TAMBEM: ReadonlySet<NomeForma> = new Set<NomeForma>(['ogival-3', 'circle', 'empena-triangulo', 'trapezio']);

/** Violações de um tipo (com `w` x `h`) numa forma; `null` quando a forma não vale na esquadria ou a operação é incompatível (sai fixa). */
function varre(t: OpeningType, nome: NomeForma, hand: boolean, facing: boolean): { v: string[]; hinges: number; handles: number } | null {
  const forma = formaDaVarredura(nome, t.width, t.height);
  const { m } = cenaDoTipo(t, forma, hand, facing);
  if (shapeIncompatible(t, forma)) {
    expect(m.parts.filter((q) => q.role === 'hinge' || q.role === 'handle'), `${t.id}/${nome}: esquadria fixa sem ferragem`).toEqual([]);
    return null;
  }
  const s = formaDaEsquadria(forma, m.width, m.height);
  if (!s) return null; // a flecha não cabe na esquadria: peças retangulares (aviso forma-esquadria-retangular)
  const sem = cenaDoTipo(t, undefined, hand, facing).m;
  return { v: violacoesDeFerragem(m, sem, outline(s)).map((x) => `${t.id}/${nome}/hand=${hand}/facing=${facing}: ${x}`), hinges: m.parts.filter((q) => q.role === 'hinge').length, handles: m.parts.filter((q) => q.role === 'handle').length };
}

describe('contrato das ferragens nos 162 tipos', { timeout: 300000 }, () => {
  it('o catálogo tem 162 tipos e os com ferragem estão na varredura', () => {
    expect(DEFAULT_OPENING_TYPES).toHaveLength(162);
    expect(TIPOS.length).toBeGreaterThan(60);
  });

  it.each(NOMES_FORMAS)('forma %s: dobradiças e maçaneta cumprem o contrato em todos os tipos, nos dois lados do eixo', (nome) => {
    const violacoes: string[] = [];
    let aplicadas = 0;
    for (const t of TIPOS) {
      for (const hand of [false, true]) {
        for (const facing of FACE_TAMBEM.has(nome) ? [false, true] : [false]) {
          const r = varre(t, nome, hand, facing);
          if (!r) continue;
          aplicadas++;
          violacoes.push(...r.v);
        }
      }
    }
    expect(violacoes).toEqual([]);
    expect(aplicadas, `${nome}: a forma tem de valer na varredura`).toBeGreaterThan(nome === 'ferradura-estreita' ? 8 : 30); // a ferradura só vale nas pivotantes (as de giro são incompatíveis)
  });

  it('o vão retangular continua idêntico (forma ausente ou rect) e sem aviso de ferragem', () => {
    for (const t of TIPOS) {
      const a = cenaDoTipo(t).m;
      const b = cenaDoTipo(t, { kind: 'rect', width: t.width, height: t.height }).m;
      expect(JSON.stringify(b), t.id).toBe(JSON.stringify(a));
      expect(a.ferragemAvisos, t.id).toBeUndefined();
    }
  });
});

describe('proporções extremas: portas largas e estreitas, janelas baixas e altas', { timeout: 300000 }, () => {
  const BASE = ['ot_pgiro90', 'ot_pgiro2_160', 'ot_pvv90', 'ot_pvid82_8', 'ot_pband40_90', 'ot_ppiv_100_vid'];
  const DIMS: Array<[number, number]> = [[0.5, 2.1], [0.7, 2.4], [1.4, 2.1], [0.9, 1.7], [0.9, 3.0], [1.2, 1.2]];
  it.each(NOMES_FORMAS)('forma %s em 6 proporções', (nome) => {
    const violacoes: string[] = [];
    for (const id of BASE) {
      const t0 = DEFAULT_OPENING_TYPES.find((x) => x.id === id)!;
      for (const [w, h] of DIMS) {
        const r = varre({ ...t0, width: w, height: h }, nome, false, false);
        if (r) violacoes.push(...r.v.map((x) => `${w}x${h} ${x}`));
      }
    }
    expect(violacoes).toEqual([]);
  });

  it('com divisão decorativa do vidro (leque) e em cada estilo de maçaneta o contrato vale', () => {
    const violacoes: string[] = [];
    const t0 = DEFAULT_OPENING_TYPES.find((x) => x.id === 'ot_pgiro90')!;
    for (const handle of ['lever', 'knob', 'pull'] as const) {
      for (const nome of ['ogival-3', 'circle', 'empena-triangulo', 'trapezio-min'] as const) {
        const r = varre({ ...t0, handle, muntinPattern: { kind: 'fan', cols: 3, rows: 2, on: 'all' } }, nome, false, false);
        if (r) violacoes.push(...r.v.map((x) => `${handle} ${x}`));
      }
    }
    expect(violacoes).toEqual([]);
  });
});
