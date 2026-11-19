import { describe, expect, it } from 'vitest';
import { areaUtilDaChapa, CATALOGO_FORMATO, CATALOGO_LIMITES, CATALOGO_PADRAO, CATALOGO_VERSAO, chapaPorId, exportarCatalogo, fitaPorId, importarCatalogo, mesclarCatalogo, opcoesDeChapa, validarCatalogo, type Catalogo } from './catalogo.ts';

const nova = (): Catalogo => structuredClone(CATALOGO_PADRAO);
const onde = (c: Catalogo, codigo: string, o?: string) => validarCatalogo(c).filter((p) => p.codigo === codigo && (o === undefined || p.onde === o));

describe('validarCatalogo', () => {
  it('o catálogo padrão é limpo', () => { expect(validarCatalogo(CATALOGO_PADRAO)).toEqual([]); });
  it('ids: formato e repetição', () => {
    const c = nova();
    c.chapas[0]!.id = '9mdf';
    c.fitas[1]!.id = c.fitas[0]!.id;
    c.ferragens[2]!.id = 'com espaço';
    expect(onde(c, 'id_invalido', 'chapa:9mdf')).toHaveLength(1);
    expect(onde(c, 'id_duplicado', `fita:${c.fitas[0]!.id}`)).toHaveLength(1);
    expect(onde(c, 'id_invalido', 'ferragem:com espaço')).toHaveLength(1);
  });
  it('valores: nome, medidas, refilo, custo e unidade', () => {
    const c = nova();
    c.chapas[1]!.nome = '  ';
    c.chapas[2]!.espessura = 0;
    c.chapas[3]!.largura = Number.NaN;
    c.chapas[4]!.refilo = -1;
    c.chapas[5]!.refilo = 1000;
    c.fitas[0]!.altura = -5;
    c.fitas[1]!.custoM = -1;
    c.ferragens[0]!.custo = Number.POSITIVE_INFINITY;
    (c.ferragens[1] as { unidade: string }).unidade = 'kg';
    for (const o of ['chapa:mdf15', 'chapa:mdf18', 'chapa:mdf25', 'chapa:mdp15', 'chapa:mdp18', 'fita:fita_pvc_045', 'fita:fita_pvc_1', 'ferragem:dobradica', 'ferragem:corredica']) {
      expect(validarCatalogo(c).some((p) => p.codigo === 'valor' && p.onde.startsWith(o)), o).toBe(true);
    }
  });
  it('limite e cor', () => {
    const c = nova();
    c.fitas = Array.from({ length: CATALOGO_LIMITES.fitas + 1 }, (_, i) => ({ id: `f${i}`, nome: 'f', espessura: 1, altura: 22 }));
    expect(onde(c, 'limite', 'catalogo')).toHaveLength(1);
    const d = nova();
    d.chapas[0]!.cor = 'vermelho';
    expect(onde(d, 'cor', 'chapa:mdf6')).toHaveLength(1);
  });
  it('lixo não derruba', () => {
    expect(() => validarCatalogo({ chapas: [{}], fitas: null, ferragens: undefined } as unknown as Catalogo)).not.toThrow();
    expect(validarCatalogo({ chapas: [{}], fitas: [], ferragens: [] } as unknown as Catalogo).length).toBeGreaterThan(0);
  });
});

describe('consultas', () => {
  it('chapaPorId, fitaPorId', () => {
    expect(chapaPorId(CATALOGO_PADRAO, 'mdf18')?.espessura).toBe(18);
    expect(chapaPorId(CATALOGO_PADRAO, 'x')).toBeUndefined();
    expect(fitaPorId(CATALOGO_PADRAO, 'fita_pvc_1')?.espessura).toBe(1);
    expect(fitaPorId(CATALOGO_PADRAO, 'x')).toBeUndefined();
  });
  it('opcoesDeChapa: todas, ou só as pedidas na ordem pedida', () => {
    const todas = opcoesDeChapa(CATALOGO_PADRAO);
    expect(todas).toHaveLength(6);
    expect(todas[2]).toEqual({ valor: 'mdf18', rotulo: 'MDF 18 mm', esp: 18 });
    expect(opcoesDeChapa(CATALOGO_PADRAO, ['mdf25', 'nao_existe', 'mdf15']).map((o) => o.valor)).toEqual(['mdf25', 'mdf15']);
    expect(opcoesDeChapa(CATALOGO_PADRAO, [])).toEqual([]);
  });
  it('areaUtilDaChapa desconta o refilo dos dois lados', () => {
    expect(areaUtilDaChapa({ ...chapaPorId(CATALOGO_PADRAO, 'mdf18')!, largura: 2750, altura: 1850, refilo: 10 })).toBeCloseTo((2730 * 1830) / 1e6, 9);
    expect(areaUtilDaChapa({ ...chapaPorId(CATALOGO_PADRAO, 'mdf18')!, largura: 1000, altura: 1000, refilo: 0 })).toBe(1);
  });
});

describe('arquivo hestia-catalogo', () => {
  it('ida e volta, com cópia profunda', () => {
    const a = exportarCatalogo(CATALOGO_PADRAO);
    expect(a).toMatchObject({ formato: CATALOGO_FORMATO, versao: CATALOGO_VERSAO });
    expect(a.catalogo).toEqual(CATALOGO_PADRAO);
    expect(a.catalogo).not.toBe(CATALOGO_PADRAO);
    const r = importarCatalogo(JSON.parse(JSON.stringify(a)));
    expect(r.ignorados).toEqual([]);
    expect(r.catalogo).toEqual(CATALOGO_PADRAO);
  });
  it('fatais', () => {
    for (const ruim of [null, 3, [], { formato: 'x', versao: 1, catalogo: nova() }, { formato: CATALOGO_FORMATO, versao: 'a', catalogo: nova() }, { formato: CATALOGO_FORMATO, versao: 0, catalogo: nova() }, { formato: CATALOGO_FORMATO, versao: 1 }, { formato: CATALOGO_FORMATO, versao: 1, catalogo: { chapas: [] } }]) {
      expect(() => importarCatalogo(ruim), JSON.stringify(ruim)).toThrow(Error);
    }
    expect(() => importarCatalogo({ formato: CATALOGO_FORMATO, versao: CATALOGO_VERSAO + 1, catalogo: nova() })).toThrow(/mais novo/);
  });
  it('itens ruins são ignorados com motivo; os bons entram', () => {
    const c = nova() as unknown as { chapas: Array<Record<string, unknown>>; fitas: Array<Record<string, unknown>>; ferragens: Array<Record<string, unknown>> };
    c.chapas[0]!.espessura = 'grossa';
    c.chapas[1]!.id = c.chapas[2]!.id;
    c.fitas.push({ id: 'ok2', nome: 'Fita', espessura: 1, altura: 22, __proto__x: 1 });
    c.ferragens[0] = { id: 'x', nome: 'n', unidade: 'un', constructor: { a: 1 } };
    const r = importarCatalogo({ formato: CATALOGO_FORMATO, versao: 1, catalogo: JSON.parse(JSON.stringify(c).replace('"__proto__x"', '"__proto__"')) });
    expect(r.ignorados.length).toBeGreaterThanOrEqual(3);
    expect(r.ignorados.some((i) => i.tipo === 'chapa')).toBe(true);
    expect(r.ignorados.some((i) => i.tipo === 'ferragem' && /proibida/.test(i.motivo))).toBe(true);
    expect(r.catalogo.chapas.some((x) => x.id === 'mdf18')).toBe(true);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });
});

describe('mesclarCatalogo', () => {
  it('o de base vence em conflito de id; devolve cópia e os ids ignorados', () => {
    const base = nova();
    const extra: Catalogo = { chapas: [{ ...base.chapas[0]!, nome: 'Outro nome' }, { id: 'nova', nome: 'Nova', material: 'MDF', espessura: 9, largura: 2000, altura: 1000, veio: false, refilo: 5 }], fitas: [], ferragens: [{ id: 'novo', nome: 'Novo', unidade: 'un' }] };
    const r = mesclarCatalogo(base, extra);
    expect(r.ignorados).toEqual(['mdf6']);
    expect(r.catalogo.chapas.find((c) => c.id === 'mdf6')!.nome).toBe('MDF 6 mm');
    expect(r.catalogo.chapas.some((c) => c.id === 'nova')).toBe(true);
    expect(r.catalogo.ferragens.some((c) => c.id === 'novo')).toBe(true);
    expect(r.catalogo.chapas).not.toBe(base.chapas);
    expect(base.chapas).toHaveLength(6);
  });
});
