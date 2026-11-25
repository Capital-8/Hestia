import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { ESPESSURA_ELETRICA, KRONA_ELETRICA_FAMILIAS } from './kronaEletrica.ts';

/*
 * Linha elétrica da Krona montada do catálogo (páginas 6 a 11 do PDF): medidas lidas do catálogo, espessura fixa de tipo
 * (não consta do catálogo: CONFERIR), ligações de eletroduto com encaixe nas peças e entradas nas caixas. Valores CONFERIR.
 */

function ambiente(f: Familia, tipoId: string): Env {
  const t = f.tipos.find((x) => x.id === tipoId);
  const env: Record<string, Valor> = {};
  for (const p of f.parametros) env[p.id] = t?.valores[p.id] ?? p.padrao;
  for (let r = 0; r <= f.parametros.length; r++) {
    for (const p of f.parametros) {
      if (p.formula === undefined) continue;
      const x = tentar(p.formula, env);
      if (x.ok) env[p.id] = x.valor;
    }
  }
  return env;
}
const n = (src: string, env: Env): number => {
  const r = tentar(src, env);
  if (!r.ok || typeof r.valor !== 'number') throw new Error(`fórmula não numérica: ${src}`);
  return r.valor;
};
const f = (id: string): Familia => {
  const x = KRONA_ELETRICA_FAMILIAS.find((q) => q.id === id);
  if (!x) throw new Error(id);
  return x;
};
const pos = (fam: Familia, i: number, env: Env): number[] => (fam.ligacoes?.[i]?.posicao ?? []).map((s) => n(s, env));
const bitolas = (fam: Familia): Valor[] => fam.tipos.map((t) => t.valores.DN ?? t.valores.COD ?? null);

describe('elétrica Krona: cadastro', () => {
  it('9 famílias válidas, disciplina elétrica, IFC e descrição com CONFERIR e sem afirmar norma', () => {
    expect(KRONA_ELETRICA_FAMILIAS).toHaveLength(9);
    expect(new Set(KRONA_ELETRICA_FAMILIAS.map((x) => x.id)).size).toBe(9);
    for (const x of KRONA_ELETRICA_FAMILIAS) {
      expect(x.disciplina).toBe('eletrico');
      expect(['eletroduto', 'dispositivo_eletrico']).toContain(x.categoria);
      expect(x.ifc).toBeDefined();
      expect(validarFamilia(x).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(x.descricao).toMatch(/catálogo da Krona \(elétrica\), estado CONFERIR/);
      expect(x.descricao).toMatch(/Não afirma conformidade com norma/);
    }
  });
  it('ligações: tubos e conexões no domínio eletroduto com encaixe; caixas com 4 entradas sem encaixe', () => {
    for (const x of KRONA_ELETRICA_FAMILIAS) {
      expect(x.ligacoes?.every((l) => l.dominio === 'eletroduto' && l.secao === 'redonda')).toBe(true);
      if (x.categoria === 'eletroduto') expect(x.ligacoes?.every((l) => l.encaixe !== undefined)).toBe(true);
      else {
        expect(x.ligacoes).toHaveLength(4);
        expect(x.ligacoes?.some((l) => l.encaixe !== undefined)).toBe(false);
      }
    }
  });
});

describe('elétrica Krona: espessura fixa de tipo (não consta do catálogo)', () => {
  it('e é parâmetro de tipo, com o nome CONFERIR e o valor fixo em todos os tipos', () => {
    for (const x of KRONA_ELETRICA_FAMILIAS) {
      const p = x.parametros.find((q) => q.id === 'e');
      expect(p?.escopo).toBe('tipo');
      expect(p?.nome).toMatch(/CONFERIR \(não consta do catálogo\)/);
      expect(p?.formula).toBeUndefined();
      expect(x.tipos.every((t) => t.valores.e === ESPESSURA_ELETRICA)).toBe(true);
    }
  });
});

describe('elétrica Krona: bitolas e medidas do catálogo', () => {
  it('eletroduto com bolsa: DN 20, 25 e 32; De = D, bolsa a A = De + 2e e B do catálogo', () => {
    const fam = f('fam_krona_eletrica_tubo');
    expect(bitolas(fam)).toEqual([20, 25, 32]);
    const env = ambiente(fam, 'dn20');
    expect(n('De', env)).toBe(20);
    expect(n('Db', env)).toBe(20);
    expect(n('B', env)).toBe(16.5);
    expect(n('A', env)).toBe(24);
    expect(fam.ligacoes?.[0]?.encaixe).toEqual({ tipo: 'bolsa', profundidade: 'B' });
  });
  it('eletroduto cortado: ponta lisa nas duas pontas, com aceitaMesmoTipo', () => {
    const fam = f('fam_krona_eletrica_tubo_corte');
    expect(bitolas(fam)).toEqual([20, 25, 32]);
    expect(fam.ligacoes?.every((l) => l.encaixe?.tipo === 'ponta' && l.encaixe.aceitaMesmoTipo === true)).toBe(true);
    expect(n(fam.ligacoes?.[0]?.diametro ?? '', ambiente(fam, 'dn25'))).toBe(25);
  });
  it('curva 90° soldável DN 20: Z = C − B = 61,2 e a bolsa cai a C = 77,2 do centro', () => {
    const fam = f('fam_krona_eletrica_curva90');
    expect(bitolas(fam)).toEqual([20, 25, 32]);
    const env = ambiente(fam, 'dn20');
    expect(n('Z', env)).toBeCloseTo(61.2, 9);
    expect(pos(fam, 1, env)[0]).toBeCloseTo(77.2, 9);
    expect(pos(fam, 0, env)[2]).toBeCloseTo(-77.2, 9);
    expect(n(fam.ligacoes?.[1]?.diametro ?? '', env)).toBe(20);
  });
  it('luva soldável: DN 20 e 25; comprimento C = 35 e batente de 3 entre as bolsas de 16', () => {
    const fam = f('fam_krona_eletrica_luva');
    expect(bitolas(fam)).toEqual([20, 25]);
    const env = ambiente(fam, 'dn20');
    expect(pos(fam, 1, env)[2]).toBe(35);
    expect(n('C - B - B2', env)).toBeCloseTo(3, 9);
  });
  it('luva de pressão corrugada: DN 20, 25 e 32; DN 32 com batente de 2 (C 42, B 20)', () => {
    const fam = f('fam_krona_eletrica_luva_pressao');
    expect(bitolas(fam)).toEqual([20, 25, 32]);
    expect(n('C - B - B2', ambiente(fam, 'dn32'))).toBeCloseTo(2, 9);
  });
  it('caixa 4×2 (código 1265): 116 × 65 × 46,8 com faces ordenadas (L é a maior)', () => {
    const fam = f('fam_krona_eletrica_caixa_4x2');
    expect(fam.tipos.map((t) => t.id)).toEqual(['cod1265']);
    const t = fam.tipos[0];
    expect([t?.valores.L, t?.valores.A, t?.valores.P]).toEqual([116, 65, 46.8]);
    expect(fam.hospedagem).toBe('parede');
  });
  it('caixa 4×4 (código 1266): 111 × 111 × 47 (profundidade pela letra C)', () => {
    const t = f('fam_krona_eletrica_caixa_4x4').tipos[0];
    expect([t?.id, t?.valores.L, t?.valores.A, t?.valores.P]).toEqual(['cod1266', 111, 111, 47]);
  });
  it('caixa 4×4 flexível (código 2369) e octogonal (código 1255): mesmas medidas do catálogo, 104,6 × 91,4 × 51', () => {
    for (const id of ['fam_krona_eletrica_caixa_4x4_flexivel', 'fam_krona_eletrica_caixa_octogonal']) {
      const t = f(id).tipos[0];
      expect([t?.valores.L, t?.valores.A, t?.valores.P]).toEqual([104.6, 91.4, 51]);
    }
    expect(f('fam_krona_eletrica_caixa_octogonal').tipos[0]?.id).toBe('cod1255');
  });
});
