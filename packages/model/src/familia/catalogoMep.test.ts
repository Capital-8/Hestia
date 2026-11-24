import { describe, expect, it } from 'vitest';
import { bitolaNumerica, bitolasDoItem, buscaDaColuna, conferirItem, editarLinha, linhaDaBitola, pendentesDeConferencia, validarCatalogoMep, validarItemCatalogo, valorDoItem, type ItemCatalogo } from './catalogoMep.ts';
import { csvDoItem, itemDeCsv, lerCsvCatalogo } from './catalogoMepCsv.ts';
import { KRONA_ESGOTO } from './catalogosMep/kronaEsgoto.ts';
import { avaliar, parse } from './expressao.ts';

const tuboNormal = (): ItemCatalogo => {
  const it = KRONA_ESGOTO.itens.find((i) => i.id === 'tubo_de_pvc_esgoto_primario_6m');
  if (!it) throw new Error('item de referência ausente');
  return it;
};

describe('catálogo MEP: dados da Krona (esgoto)', () => {
  it('não tem erro de forma, salvo a anomalia conhecida do PDF (tubo da série reforçada com a bitola 50 em duas linhas)', () => {
    // Anomalia do próprio catálogo, página 31: as linhas 0135 e 0136 saem ambas como "50" (a 0135 tem D = 40, parece ser DN 40).
    // Mantida como impressa até alguém conferir com o fabricante; o validador a acusa de propósito.
    const erros = validarCatalogoMep(KRONA_ESGOTO).filter((p) => p.nivel === 'erro').map((p) => `${p.onde}: ${p.mensagem}`);
    expect(erros).toEqual(['item tubo_de_pvc_esgoto_serie_reforcada_6m, bitola 50: bitola repetida']);
  });
  it('nasce todo CONFERIR e sem conferente', () => {
    expect(pendentesDeConferencia(KRONA_ESGOTO)).toBe(KRONA_ESGOTO.itens.length);
    expect(KRONA_ESGOTO.itens.every((i) => i.conferidoPor === undefined)).toBe(true);
  });
  it('tem a fonte rastreável (url e hash do PDF)', () => {
    expect(KRONA_ESGOTO.fonte.url).toMatch(/^https:\/\/www\.krona\.com\.br\//);
    expect(KRONA_ESGOTO.fonte.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('o De do tubo de esgoto NÃO é o DN (DN 100 = 101,6; DN 50 = 50,7; DN 75 = 75,5)', () => {
    const t = tuboNormal();
    expect(valorDoItem(t, 100, 'd')).toBe(101.6);
    expect(valorDoItem(t, 50, 'd')).toBe(50.7);
    expect(valorDoItem(t, 75, 'd')).toBe(75.5);
    expect(valorDoItem(t, 100, 'B')).toBe(50);
    expect(valorDoItem(t, 100, 'e')).toBe(1.8);
    expect(bitolasDoItem(t)).toEqual([50, 75, 100, 150, 200]);
  });
  it('cobre os tipos de conexão do catálogo', () => {
    const tipos = new Set(KRONA_ESGOTO.itens.map((i) => i.tipo));
    for (const t of ['tubo', 'joelho90', 'joelho45', 'curva90', 'curva45', 'luva', 'te', 'juncao', 'reducao', 'cap']) expect(tipos.has(t)).toBe(true);
  });
  it('valorDoItem não devolve zero por omissão', () => {
    expect(() => valorDoItem(tuboNormal(), 100, 'Q')).toThrow(/não tem a coluna Q/);
    expect(() => valorDoItem(tuboNormal(), 999, 'd')).toThrow();
  });
});

describe('catálogo MEP: leitura pela família', () => {
  it('buscaDaColuna gera uma expressão que a família avalia', () => {
    const expr = buscaDaColuna(tuboNormal(), 'd', 'DN');
    expect(expr).toBe('busca(DN, 50, 50.7, 75, 75.5, 100, 101.6, 150, 150, 200, 200)');
    expect(avaliar(parse(expr ?? ''), { DN: 100 })).toBeCloseTo(101.6, 9);
  });
  it('coluna inexistente devolve null', () => {
    expect(buscaDaColuna(tuboNormal(), 'Q', 'DN')).toBeNull();
  });
  it('bitola composta não vira chave de busca', () => {
    expect(bitolaNumerica('50 x 40')).toBeNull();
    expect(bitolaNumerica('100')).toBe(100);
    expect(linhaDaBitola(tuboNormal(), 100)?.codigo).toBe('0103');
  });
});

describe('catálogo MEP: fidelidade', () => {
  it('conferir exige quem e quando; editar volta para CONFERIR', () => {
    const t = tuboNormal();
    expect(() => conferirItem(t, '', '2026-11-24')).toThrow();
    const ok = conferirItem(t, 'Fulana', '2026-11-24');
    expect(ok.estado).toBe('conferido');
    expect(validarItemCatalogo(ok).filter((p) => p.nivel === 'erro')).toEqual([]);
    const alterado = editarLinha(ok, '100', { e: 2 });
    expect(alterado.estado).toBe('CONFERIR');
    expect(alterado.conferidoPor).toBeUndefined();
  });
  it('item conferido sem conferente é erro', () => {
    expect(validarItemCatalogo({ ...tuboNormal(), estado: 'conferido' }).some((p) => p.nivel === 'erro')).toBe(true);
  });
  it('acusa espessura impossível, bolsa maior que o comprimento e bitola repetida', () => {
    const t = tuboNormal();
    const ruim = editarLinha(editarLinha(t, '100', { e: 80 }), '75', { B: 9000 });
    const msgs = validarItemCatalogo({ ...ruim, linhas: [...ruim.linhas, { bitola: '50', valores: {} }] }).map((p) => p.mensagem).join(' | ');
    expect(msgs).toMatch(/espessura/);
    expect(msgs).toMatch(/maior que o comprimento/);
    expect(msgs).toMatch(/repetida/);
  });
  it('avisa quando D difere de d (pede conferir o significado)', () => {
    const t = editarLinha(tuboNormal(), '100', { D: 110 });
    expect(validarItemCatalogo(t).some((p) => p.nivel === 'aviso' && /D \(110\)/.test(p.mensagem))).toBe(true);
  });
});

describe('catálogo MEP: criar à mão por CSV', () => {
  it('ida e volta preserva as linhas', () => {
    const t = tuboNormal();
    const volta = itemDeCsv(csvDoItem(t), { id: 'x', nome: 'x', tipo: 'tubo', serie: 's', colunas: t.colunas });
    expect(volta.problemas).toEqual([]);
    expect(volta.item?.linhas).toEqual(t.linhas);
    expect(volta.item?.estado).toBe('CONFERIR');
  });
  it('aceita decimal com vírgula e tab, e reporta célula ruim sem lançar', () => {
    const r = lerCsvCatalogo('bitola\tB\td\n100\t50,5\t101,6\n75\tabc\t75,5');
    expect(r.linhas[0]?.valores).toEqual({ B: 50.5, d: 101.6 });
    expect(r.linhas[1]?.valores).toEqual({ d: 75.5 });
    expect(r.problemas.join(' ')).toMatch(/“abc” não é número/);
  });
  it('recusa CSV sem cabeçalho de bitola', () => {
    expect(lerCsvCatalogo('a;b\n1;2').problemas[0]).toMatch(/bitola/);
    expect(lerCsvCatalogo('').linhas).toEqual([]);
  });
});
