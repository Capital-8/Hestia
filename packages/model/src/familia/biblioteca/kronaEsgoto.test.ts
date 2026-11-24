import { describe, expect, it } from 'vitest';
import { linhaDaBitola, valorDoItem } from '../catalogoMep.ts';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { KRONA_ESGOTO_FAMILIAS } from './kronaEsgoto.ts';
import { itemKrona } from './kronaEsgotoApoio.ts';

const ITEM_TUBO_PRIMARIO = 'tubo_de_pvc_esgoto_primario_6m';

/*
 * Famílias de esgoto montadas do catálogo da Krona: cada medida da família tem de ser IGUAL à do catálogo (a família lê o dado,
 * não o repete), e os pontos de ligação têm de cair onde o catálogo manda. Os números esperados aqui vêm da tabela do PDF
 * (páginas 10, 13, 16 e 17), conferidos à mão no desenho; continuam CONFERIR até alguém do projeto validar.
 */

function ambiente(f: Familia, tipoId: string, extra: Record<string, Valor> = {}): Env {
  const t = f.tipos.find((x) => x.id === tipoId);
  const env: Record<string, Valor> = {};
  for (const p of f.parametros) env[p.id] = extra[p.id] ?? t?.valores[p.id] ?? p.padrao;
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
  const x = KRONA_ESGOTO_FAMILIAS.find((q) => q.id === id);
  if (!x) throw new Error(id);
  return x;
};
const ponto = (p: readonly string[], env: Env): number[] => p.map((s) => n(s, env));

describe('esgoto Krona: cadastro', () => {
  it('são 25 famílias de hidrossanitário, todas válidas, com ids únicos', () => {
    expect(KRONA_ESGOTO_FAMILIAS).toHaveLength(25);
    expect(new Set(KRONA_ESGOTO_FAMILIAS.map((x) => x.id)).size).toBe(25);
    for (const x of KRONA_ESGOTO_FAMILIAS) {
      expect(x.disciplina).toBe('hidrossanitario');
      expect(validarFamilia(x).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(x.descricao).toMatch(/Krona/);
      expect(x.descricao).toMatch(/Não afirma conformidade/);
    }
  });
  it('têm um tipo por bitola do catálogo que traz todas as cotas (nada é inventado)', () => {
    const ids = (id: string): string[] => f(id).tipos.map((t) => t.id).sort();
    expect(ids('fam_krona_esgoto_tubo')).toEqual(['dn100', 'dn150', 'dn200', 'dn250', 'dn40', 'dn50', 'dn75']);
    expect(ids('fam_krona_esgoto_joelho90')).toEqual(['dn100', 'dn150', 'dn200', 'dn40', 'dn50', 'dn75']);
    expect(ids('fam_krona_esgoto_curva45_curta')).toEqual(['dn100']);
    expect(ids('fam_krona_esgoto_curva90_longa')).toEqual(['dn100', 'dn150', 'dn50', 'dn75']);
    for (const x of KRONA_ESGOTO_FAMILIAS) expect(x.tipos.length).toBeGreaterThan(0);
  });
  it('a redução excêntrica deixa de fora a linha 0657 (d = 15,0 no PDF, erro de impressão)', () => {
    const cods = f('fam_krona_esgoto_reducao_excentrica').tipos.map((t) => t.valores.COD);
    expect(cods).toEqual(expect.arrayContaining([654, 655, 656, 724]));
    expect(cods).not.toContain(657);
  });
  it('bitola composta usa o código do produto como chave (tê de redução 100 x 75 = 0665)', () => {
    const fam = f('fam_krona_esgoto_te_reducao');
    const env = ambiente(fam, 'cod0665');
    expect(n('Db', env)).toBe(101.6);
    expect(n('Db2', env)).toBe(75.5);
    expect(n('B2', env)).toBe(44);
  });
  it('nenhuma usa material de madeira (nada de carvalho em tubo)', () => {
    for (const x of KRONA_ESGOTO_FAMILIAS) for (const c of x.corpos ?? []) expect(c.material).toBe('mat_pvc');
  });
});

describe('esgoto Krona: as medidas são as do catálogo', () => {
  it('tubo: De, bolsa e espessura de cada DN são os da tabela (De ≠ DN)', () => {
    const fam = f('fam_krona_esgoto_tubo');
    const t = itemKrona(ITEM_TUBO_PRIMARIO);
    for (const dn of [50, 75, 100, 150, 200]) {
      const env = ambiente(fam, `dn${dn}`);
      expect(n('De', env)).toBe(valorDoItem(t, dn, 'd'));
      expect(n('Db', env)).toBe(valorDoItem(t, dn, 'D'));
      expect(n('B', env)).toBe(valorDoItem(t, dn, 'B'));
      expect(n('e', env)).toBe(valorDoItem(t, dn, 'e'));
    }
    expect(n('De', ambiente(fam, 'dn100'))).toBe(101.6);
    expect(n('De', ambiente(fam, 'dn50'))).toBe(50.7);
  });
  it('tubo: ligação A na bolsa e B na ponta, nas posições e diâmetros do catálogo', () => {
    const fam = f('fam_krona_esgoto_tubo');
    const env = ambiente(fam, 'dn100', { L: 3000 });
    const [a, b] = fam.ligacoes ?? [];
    expect(ponto(a?.posicao ?? [], env)).toEqual([0, 0, 0]);
    expect(ponto(b?.posicao ?? [], env)).toEqual([0, 0, 3000]);
    expect(n(a?.diametro ?? '', env)).toBe(101.6);
    expect(n(a?.propriedades?.profundidadeBolsa ?? '', env)).toBe(50);
    expect(b?.propriedades).toBeUndefined();
  });
  it('joelho 90°: bolsas a B + Z do centro (DN 100: 45 + 58 = 103)', () => {
    const fam = f('fam_krona_esgoto_joelho90');
    const env = ambiente(fam, 'dn100');
    const [a, b] = fam.ligacoes ?? [];
    expect(ponto(a?.posicao ?? [], env)).toEqual([0, 0, -103]);
    expect(ponto(b?.posicao ?? [], env)).toEqual([103, 0, 0]);
    expect(ponto(a?.direcao ?? [], env)).toEqual([0, 0, -1]);
    expect(ponto(b?.direcao ?? [], env)).toEqual([1, 0, 0]);
  });
  it('joelho 45°: o braço B desvia 45° e a bolsa fica a B + Z do centro', () => {
    const fam = f('fam_krona_esgoto_joelho45');
    const env = ambiente(fam, 'dn100');
    const b = fam.ligacoes?.[1];
    const dist = (45 + 29.6);
    const [x = NaN, y = NaN, z = NaN] = ponto(b?.posicao ?? [], env);
    expect(x).toBeCloseTo(dist * Math.SQRT1_2, 6);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(dist * Math.SQRT1_2, 6);
    expect(Math.hypot(x, z)).toBeCloseTo(dist, 6);
  });
  it('luva: comprimento total C e bolsas B1 e B2 distintas', () => {
    const fam = f('fam_krona_esgoto_luva');
    const env = ambiente(fam, 'dn100');
    const [a, b] = fam.ligacoes ?? [];
    expect(ponto(b?.posicao ?? [], env)).toEqual([0, 0, 79]);
    expect(n(a?.propriedades?.profundidadeBolsa ?? '', env)).toBe(45);
    expect(n(b?.propriedades?.profundidadeBolsa ?? '', env)).toBe(31);
    expect(n('C - B - B2', env)).toBe(3);
  });
  it('tê: comprimento da corrida = C do catálogo (216) e ramal a Z2 + B (53 + 45)', () => {
    const fam = f('fam_krona_esgoto_te');
    const env = ambiente(fam, 'dn100');
    const [a, b, c] = fam.ligacoes ?? [];
    const topo = ponto(a?.posicao ?? [], env)[2] ?? NaN;
    const base = ponto(b?.posicao ?? [], env)[2] ?? NaN;
    expect(topo - base).toBe(216);
    expect(ponto(c?.posicao ?? [], env)).toEqual([98, 0, 0]);
    expect(n(b?.diametro ?? '', env)).toBe(101.6);
  });
  it('cap: comprimento total C e uma só ligação, na bolsa', () => {
    const fam = f('fam_krona_esgoto_tampao');
    expect(fam.ligacoes).toHaveLength(1);
    const t = itemKrona('cap_esgoto_primario');
    expect(linhaDaBitola(t, 100)?.valores.C).toBe(52.3);
    expect(n('C - B', ambiente(fam, 'dn100'))).toBeCloseTo(2.3, 9);
  });
});
