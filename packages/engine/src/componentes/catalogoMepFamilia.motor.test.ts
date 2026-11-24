import { BIBLIOTECA_MEP, RECEITAS_MEP, csvDoItem, familiaDoItem, itemDeCsv, itemKronaPublico, paraIdsDeParametro, validarFamilia, type DominioMep } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { malhaDosCorpos } from './corposMalha.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Catálogo criado à mão no editor: o CSV da pessoa vira item, o item vira família e a família resolve no motor (malha 3D e
 * ligações com encaixe), igual às da biblioteca. Os números do CSV abaixo são DE EXEMPLO (não são de fabricante).
 */

const CSV_JOELHO = 'bitola;codigo;B;Z;Db;De;e\n25;1;18;14.4;25;25;1.7\n32;2;22;18;32;32;2.1';

describe('catálogo próprio → família', () => {
  it('CSV → item → família de joelho que valida e resolve nos dois tipos', () => {
    const { item, problemas } = itemDeCsv(CSV_JOELHO, { id: 'meu_joelho', nome: 'Meu joelho', tipo: 'joelho90', serie: 'Minha série' });
    expect(problemas).toEqual([]);
    if (!item) throw new Error('item não criado');
    const r = familiaDoItem(item, { receita: 'joelho90', id: 'fam_meu_joelho', nome: 'Meu joelho 90°', dominio: 'agua_fria' });
    if (!r.ok) throw new Error(r.erros.join('; '));
    expect(validarFamilia(r.familia).filter((p) => p.nivel === 'erro')).toEqual([]);
    expect(r.familia.descricao).toMatch(/catálogo próprio/);
    expect(r.familia.descricao).toMatch(/CONFERIR/);
    expect(r.familia.tipos.map((t) => t.id)).toEqual(['dn25', 'dn32']);
    for (const t of r.familia.tipos) {
      const res = resolverFamilia(r.familia, { tipoId: t.id });
      expect(res.erros).toEqual([]);
      expect(malhaDosCorpos(res.corpos ?? []).erros).toEqual([]);
      expect(res.ligacoes?.every((l) => l.dominio === 'agua_fria' && l.encaixe?.tipo === 'bolsa')).toBe(true);
    }
    const lig = resolverFamilia(r.familia, { tipoId: 'dn25' }).ligacoes ?? [];
    expect(lig[0]?.posicao[2]).toBeCloseTo(-(18 + 14.4) / 1000, 9);
  });
  it('coluna ausente vira erro com o nome dela; receita desconhecida também', () => {
    const { item } = itemDeCsv('bitola;B;Db\n25;18;25', { id: 'x', nome: 'x', tipo: 'joelho90', serie: 's' });
    if (!item) throw new Error('item');
    const r = familiaDoItem(item, { receita: 'joelho90', id: 'f', nome: 'f', dominio: 'esgoto' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toMatch(/Faltam as colunas: Z, e/);
    expect(familiaDoItem(item, { receita: 'inexistente', id: 'f', nome: 'f', dominio: 'esgoto' }).ok).toBe(false);
  });
  it('sem De, a ponta lisa assume o diâmetro da bolsa', () => {
    const { item } = itemDeCsv('bitola;B;C;Db;e\n50;39;62.4;50.7;1.6', { id: 'c', nome: 'c', tipo: 'tubo', serie: 's' });
    if (!item) throw new Error('item');
    const r = familiaDoItem(item, { receita: 'tubo', id: 'fam_c', nome: 'c', dominio: 'esgoto' });
    expect(r.ok).toBe(true);
  });
  it('copiar um item do fabricante para editar: as letras do desenho viram ids de parâmetro e a família sai igual à da biblioteca', () => {
    const original = itemKronaPublico('joelho_90_esgoto_primario');
    const meu = paraIdsDeParametro(original, 'meu_copia', 'Cópia do joelho');
    expect(Object.keys(meu.colunas)).toEqual(expect.arrayContaining(['B', 'Z', 'Db', 'De']));
    expect(meu.estado).toBe('CONFERIR');
    // e (espessura) não vem no joelho do fabricante: a pessoa completa; sem ela a família é recusada com motivo claro.
    expect(familiaDoItem(meu, { receita: 'joelho90', id: 'f', nome: 'f', dominio: 'esgoto' }).ok).toBe(false);
    const comE = { ...meu, colunas: { ...meu.colunas, e: 'espessura' }, linhas: meu.linhas.map((l) => ({ ...l, valores: { ...l.valores, e: 1.8 } })) };
    const r = familiaDoItem(comE, { receita: 'joelho90', id: 'fam_copia', nome: 'Cópia', dominio: 'esgoto' });
    if (!r.ok) throw new Error(r.erros.join('; '));
    const oficial = BIBLIOTECA_MEP.find((f) => f.id === 'fam_krona_esgoto_joelho90');
    const a = resolverFamilia(r.familia, { tipoId: 'dn100' }).ligacoes?.[1]?.posicao;
    const b = resolverFamilia(oficial!, { tipoId: 'dn100' }).ligacoes?.[1]?.posicao;
    expect(a).toEqual(b);
  });
  it('o CSV exportado do item volta igual', () => {
    const { item } = itemDeCsv(CSV_JOELHO, { id: 'm', nome: 'm', tipo: 'joelho90', serie: 's' });
    if (!item) throw new Error('item');
    expect(itemDeCsv(csvDoItem(item), { id: 'm', nome: 'm', tipo: 'joelho90', serie: 's', colunas: item.colunas }).item?.linhas).toEqual(item.linhas);
  });
  it('toda receita declara uma ajuda e as colunas que lê', () => {
    expect(RECEITAS_MEP.length).toBeGreaterThanOrEqual(13);
    const dominios: DominioMep[] = ['esgoto', 'agua_fria'];
    for (const r of RECEITAS_MEP) {
      expect(r.ajuda.length).toBeGreaterThan(10);
      for (const d of dominios) expect(r.receita({ dominio: d, sistema: 's' }).usa.length).toBeGreaterThan(2);
    }
  });
});
