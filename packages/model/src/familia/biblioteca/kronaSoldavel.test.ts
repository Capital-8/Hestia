import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { KRONA_SOLDAVEL_FAMILIAS } from './kronaSoldavel.ts';

/*
 * Água fria soldável da Krona montada do catálogo (página 5 a 10 do PDF): medidas lidas do catálogo, espessura = (A − D) / 2,
 * ligações de água fria com encaixe bolsa × ponta nas posições do desenho. Valores CONFERIR.
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
  const x = KRONA_SOLDAVEL_FAMILIAS.find((q) => q.id === id);
  if (!x) throw new Error(id);
  return x;
};
const pos = (fam: Familia, i: number, env: Env): number[] => (fam.ligacoes?.[i]?.posicao ?? []).map((s) => n(s, env));

describe('soldável Krona: cadastro', () => {
  it('13 famílias válidas de hidrossanitário com ligações de água fria e encaixe', () => {
    expect(KRONA_SOLDAVEL_FAMILIAS).toHaveLength(13);
    expect(new Set(KRONA_SOLDAVEL_FAMILIAS.map((x) => x.id)).size).toBe(13);
    for (const x of KRONA_SOLDAVEL_FAMILIAS) {
      expect(x.disciplina).toBe('hidrossanitario');
      expect(validarFamilia(x).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(x.ligacoes?.every((l) => l.dominio === 'agua_fria' && l.encaixe !== undefined)).toBe(true);
      expect(x.descricao).toMatch(/Não afirma conformidade/);
    }
  });
  it('o tubo tem as 9 bitolas do catálogo (20 a 110) e De = bitola', () => {
    const fam = f('fam_krona_soldavel_tubo');
    expect(fam.tipos.map((t) => t.valores.DN)).toEqual([20, 25, 32, 40, 50, 60, 75, 85, 110]);
    expect(n('De', ambiente(fam, 'dn110'))).toBe(110);
    expect(n('e', ambiente(fam, 'dn110'))).toBe(6.1);
    expect(n('B', ambiente(fam, 'dn20'))).toBe(32);
  });
});

describe('soldável Krona: as medidas são as do catálogo', () => {
  it('espessura da conexão = (A − D) / 2 (joelho 90° DN 20: (28 − 20) / 2 = 4)', () => {
    expect(n('e', ambiente(f('fam_krona_soldavel_joelho90'), 'dn20'))).toBe(4);
  });
  it('joelho 90° DN 20: bolsas a B + Z = 16,5 + 11,4 do centro', () => {
    const fam = f('fam_krona_soldavel_joelho90');
    const env = ambiente(fam, 'dn20');
    expect(pos(fam, 0, env)[2]).toBeCloseTo(-27.9, 9);
    expect(pos(fam, 1, env)[0]).toBeCloseTo(27.9, 9);
  });
  it('luva DN 20: comprimento 34,5 e batente de 1,5 entre as bolsas de 16,5', () => {
    const fam = f('fam_krona_soldavel_luva');
    const env = ambiente(fam, 'dn20');
    expect(pos(fam, 1, env)[2]).toBe(34.5);
    expect(n('C - B - B2', env)).toBeCloseTo(1.5, 9);
  });
  it('tê DN 20: corrida de 54,8 (±27,4) e ramal de 27,4', () => {
    const fam = f('fam_krona_soldavel_te');
    const env = ambiente(fam, 'dn20');
    expect(pos(fam, 0, env)[2]).toBeCloseTo(-27.4, 9);
    expect(pos(fam, 1, env)[2]).toBeCloseTo(27.4, 9);
    expect(pos(fam, 2, env)[0]).toBe(27.4);
  });
  it('tê de redução 25 x 20 (0463): corrida de 60 e ramal de 29,9 com diâmetro 20 (C1 e C2 trocados em relação ao tê comum)', () => {
    const fam = f('fam_krona_soldavel_te_reducao');
    const env = ambiente(fam, 'cod0463');
    expect(pos(fam, 1, env)[2]).toBe(30);
    expect(pos(fam, 2, env)[0]).toBe(29.9);
    expect(n(fam.ligacoes?.[2]?.diametro ?? '', env)).toBe(20);
    expect(n(fam.ligacoes?.[0]?.diametro ?? '', env)).toBe(25);
  });
  it('as ligações têm o diâmetro da bolsa do catálogo (DN 25: 25 mm)', () => {
    const fam = f('fam_krona_soldavel_curva90');
    expect(n(fam.ligacoes?.[0]?.diametro ?? '', ambiente(fam, 'dn25'))).toBe(25);
  });
});
