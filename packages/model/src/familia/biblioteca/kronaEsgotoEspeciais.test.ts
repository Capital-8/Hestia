import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import { destinoDaFamilia } from '../destinosCategoria.ts';
import type { Familia, Valor } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { BIBLIOTECA_MEP } from './index.ts';
import { KRONA_ESGOTO_ESPECIAIS } from './kronaEsgotoEspeciais.ts';
import { itemKrona } from './kronaEsgotoApoio.ts';

/* Ficha D3b: peças especiais da Krona esgoto montadas do catálogo; as cotas esperadas são lidas do catálogo (nenhum número solto). */

const f = (id: string): Familia => {
  const x = KRONA_ESGOTO_ESPECIAIS.find((q) => q.id === id);
  if (!x) throw new Error(id);
  return x;
};
function ambiente(fam: Familia, tipoId: string): Env {
  const t = fam.tipos.find((x) => x.id === tipoId);
  if (!t) throw new Error(`tipo ${tipoId} ausente em ${fam.id}`);
  const env: Record<string, Valor> = {};
  for (const p of fam.parametros) env[p.id] = t.valores[p.id] ?? p.padrao;
  for (let r = 0; r <= fam.parametros.length; r++) {
    for (const p of fam.parametros) {
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
const pt = (p: readonly string[] | undefined, env: Env): number[] => (p ?? []).map((s) => n(s, env));
const cota = (item: string, cod: string, col: string): number => {
  const l = itemKrona(item).linhas.find((x) => x.codigo === cod);
  const v = l?.valores[col];
  if (v === undefined) throw new Error(`${item} ${cod} ${col}`);
  return v;
};

const PECAS: { id: string; item: string; cods: string[]; lig: number; reforcada: boolean; dn?: number[] }[] = [
  { id: 'fam_krona_esgoto_te_inspecao', item: 'te_de_inspecao_esgoto', cods: ['0728'], lig: 2, reforcada: false },
  { id: 'fam_krona_esgoto_reforcado_te_inspecao', item: 'te_de_inspecao_esgoto_serie_reforcada', cods: ['1467', '1468', '1469'], lig: 2, reforcada: true },
  { id: 'fam_krona_esgoto_juncao45_dupla', item: 'juncao_45_esgoto_dupla_primario', cods: ['0708', '0710'], lig: 4, reforcada: false },
  { id: 'fam_krona_esgoto_reforcado_juncao45_dupla', item: 'juncao_dupla_esgoto_serie_reforcada', cods: ['1426'], lig: 4, reforcada: true, dn: [100] },
  { id: 'fam_krona_esgoto_joelho90_visita', item: 'joelho_90_esgoto_com_visita', cods: ['0622'], lig: 2, reforcada: false },
  { id: 'fam_krona_esgoto_reforcado_joelho90_visita', item: 'joelho_90_visita_esgoto_serie_reforcada', cods: ['1472'], lig: 2, reforcada: true },
  { id: 'fam_krona_esgoto_reforcado_curva90_pe_coluna', item: 'curva_90_curta_pe_coluna_esgoto_serie_reforcada', cods: ['1409', '1410', '1411'], lig: 2, reforcada: true, dn: [75, 100, 150] },
];

describe('Krona esgoto especiais (D3b): cadastro', () => {
  it('são 7 famílias válidas, ids únicos, em Hidráulica > Conexões, material PVC da série e CONFERIR na nota', () => {
    expect(KRONA_ESGOTO_ESPECIAIS).toHaveLength(PECAS.length);
    expect(new Set(KRONA_ESGOTO_ESPECIAIS.map((x) => x.id)).size).toBe(PECAS.length);
    for (const x of KRONA_ESGOTO_ESPECIAIS) {
      expect(x.id).toMatch(/^fam_krona_esgoto_/);
      expect(x.categoria).toBe('conexao_tubo');
      expect(destinoDaFamilia(x.categoria)).toEqual({ aba: 'sistemas', painel: 'hidraulica' });
      expect(validarFamilia(x).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(x.descricao).toMatch(/CONFERIR/);
      expect(x.descricao).toMatch(/Não afirma conformidade/);
      expect(x.ifc?.classe).toBe('IFCPIPEFITTING');
      const mat = x.id.includes('_reforcado_') ? 'mat_pvc_bege' : 'mat_pvc_branco';
      for (const c of x.corpos ?? []) expect(c.material).toBe(mat);
    }
  });
  it('todas estão em BIBLIOTECA_MEP, sem id repetido', () => {
    const ids = BIBLIOTECA_MEP.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of KRONA_ESGOTO_ESPECIAIS) expect(ids).toContain(x.id);
  });
  it.each(PECAS)('$id: um tipo por linha do catálogo (chave COD ou DN, como as irmãs)', (p) => {
    const fam = f(p.id);
    const chave = p.dn ? 'DN' : 'COD';
    const esperado = p.dn ? p.dn : p.cods.map(Number);
    expect(fam.tipos.map((t) => t.valores[chave]).sort()).toEqual(esperado.sort());
  });
  it.each(PECAS)('$id: ligações com encaixe correto e sem ligação na tampa', (p) => {
    const fam = f(p.id);
    expect(fam.ligacoes).toHaveLength(p.lig);
    for (const l of fam.ligacoes ?? []) expect(l.dominio).toBe('esgoto');
    const tipos = (fam.ligacoes ?? []).map((l) => l.encaixe?.tipo);
    expect(tipos.filter((t) => t === 'ponta').length).toBe(p.id.includes('te_inspecao') || p.id.includes('juncao') ? 1 : 0);
    expect(tipos.filter((t) => t === 'bolsa').length).toBe(p.lig - tipos.filter((t) => t === 'ponta').length);
  });
});

describe('Krona esgoto especiais (D3b): cotas do catálogo', () => {
  it('tê de inspeção: corrida = C1, bolsa B, ramal até C2, tampa de diâmetro T e sem bolsa de ramal', () => {
    const fam = f('fam_krona_esgoto_te_inspecao');
    const env = ambiente(fam, 'cod0728');
    const [a, b] = fam.ligacoes ?? [];
    expect(n('C', env)).toBe(cota('te_de_inspecao_esgoto', '0728', 'C1'));
    expect(pt(a?.posicao, env)[2]! - pt(b?.posicao, env)[2]!).toBe(cota('te_de_inspecao_esgoto', '0728', 'C1'));
    expect(n(a?.encaixe?.profundidade ?? '', env)).toBe(cota('te_de_inspecao_esgoto', '0728', 'B'));
    expect(n('C2', env)).toBe(cota('te_de_inspecao_esgoto', '0728', 'C2'));
    expect(n('T', env)).toBe(cota('te_de_inspecao_esgoto', '0728', 'T'));
    const tampa = fam.corpos?.find((c) => c.id === 'tampa');
    expect(tampa).toBeDefined();
    expect(fam.ligacoes?.some((l) => l.id === 'c')).toBe(false);
  });
  it('tê de inspeção reforçado: B1, C1 e Z lidos do catálogo (1468)', () => {
    const fam = f('fam_krona_esgoto_reforcado_te_inspecao');
    const env = ambiente(fam, 'cod1468');
    const it = 'te_de_inspecao_esgoto_serie_reforcada';
    expect(n('B', env)).toBe(cota(it, '1468', 'B1'));
    expect(n('C', env)).toBe(cota(it, '1468', 'C1'));
    expect(n('Z', env)).toBe(cota(it, '1468', 'Z'));
    expect(n('Db', env)).toBe(cota(it, '1468', 'D'));
  });
  it('junção dupla: corrida C e dois ramais simétricos a 45°, a Z + B do cruzamento', () => {
    const fam = f('fam_krona_esgoto_juncao45_dupla');
    const env = ambiente(fam, 'cod0710');
    const it = 'juncao_45_esgoto_dupla_primario';
    const [a, b, c, d] = fam.ligacoes ?? [];
    expect(pt(a?.posicao, env)[2]! - pt(b?.posicao, env)[2]!).toBe(cota(it, '0710', 'C'));
    const dist = cota(it, '0710', 'Z') + cota(it, '0710', 'B');
    const [cx = NaN, , cz = NaN] = pt(c?.posicao, env);
    const [dx = NaN, , dz = NaN] = pt(d?.posicao, env);
    expect(Math.hypot(cx, cz)).toBeCloseTo(dist, 6);
    expect(dx).toBeCloseTo(-cx, 6);
    expect(dz).toBeCloseTo(cz, 6);
    expect(cx / cz).toBeCloseTo(1, 6);
  });
  it('joelho com visita: C total na vertical e bolsa horizontal a Z2 + B2 (0622)', () => {
    const fam = f('fam_krona_esgoto_joelho90_visita');
    const env = ambiente(fam, 'cod0622');
    const it = 'joelho_90_esgoto_com_visita';
    const [a, b] = fam.ligacoes ?? [];
    expect(pt(a?.posicao, env)[2]).toBe(-(cota(it, '0622', 'Z') + cota(it, '0622', 'B1')));
    expect(pt(b?.posicao, env)[0]).toBe(cota(it, '0622', 'Z2') + cota(it, '0622', 'B2'));
    expect(n(b?.diametro ?? '', env)).toBe(cota(it, '0622', 'D2'));
    expect(n('C', env)).toBe(cota(it, '0622', 'C'));
  });
  it('joelho com visita reforçado: Z1/Z2 e bolsas do catálogo (1472)', () => {
    const fam = f('fam_krona_esgoto_reforcado_joelho90_visita');
    const env = ambiente(fam, 'cod1472');
    const it = 'joelho_90_visita_esgoto_serie_reforcada';
    expect(n('Z', env)).toBe(cota(it, '1472', 'Z1'));
    expect(n('Z2', env)).toBe(cota(it, '1472', 'Z2'));
    expect(n('Db', env)).toBe(cota(it, '1472', 'd'));
    expect(n('B2', env)).toBe(cota(it, '1472', 'B2'));
  });
  it('pé de coluna: pernas A1 ≠ A2 do catálogo, entradas das bolsas nelas (100: 125 e 120)', () => {
    const fam = f('fam_krona_esgoto_reforcado_curva90_pe_coluna');
    const it = 'curva_90_curta_pe_coluna_esgoto_serie_reforcada';
    const env = ambiente(fam, 'dn100');
    const [a, b] = fam.ligacoes ?? [];
    expect(pt(a?.posicao, env)[2]).toBe(-cota(it, '1410', 'A1'));
    expect(pt(b?.posicao, env)[0]).toBe(cota(it, '1410', 'A2'));
    expect(cota(it, '1410', 'A1')).not.toBe(cota(it, '1410', 'A2'));
    expect(n(a?.encaixe?.profundidade ?? '', env)).toBe(cota(it, '1410', 'B1'));
  });
});
