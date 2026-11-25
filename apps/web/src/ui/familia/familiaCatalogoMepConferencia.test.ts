import { describe, expect, it } from 'vitest';
import { KRONA_ESGOTO, type ItemCatalogo } from '@hestia/model';
import {
  aplicarConferencias,
  CHAVE_CONFERENCIAS,
  conferenciasDoItem,
  desmarcarLinhaConferida,
  exportarConferencias,
  itensComConferenciaIgnorada,
  lerConferencias,
  marcarLinhasConferidas,
} from './familiaCatalogoMep.ts';
import type { Armazenamento } from './meusModelos.ts';

const CAT = KRONA_ESGOTO.id;
const SHA = KRONA_ESGOTO.fonte.sha256 ?? '';
const ITEM = 'tubo_de_pvc_esgoto_primario_6m';

function memoria(inicial: Record<string, string> = {}): Armazenamento & { dados: Record<string, string> } {
  const dados = { ...inicial };
  return { dados, getItem: (k) => dados[k] ?? null, setItem: (k, v) => { dados[k] = v; } };
}
const quebrado: Armazenamento = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
const itemFabricante = (): ItemCatalogo => {
  const it = KRONA_ESGOTO.itens.find((i) => i.id === ITEM);
  if (!it) throw new Error('item de referência ausente');
  return it;
};

describe('conferência do fabricante: armazenamento', () => {
  it('marca linhas, grava e lê de volta com quem e quando', () => {
    const s = memoria();
    marcarLinhasConferidas(s, CAT, SHA, ITEM, ['100', '75'], 'Fulana', '2026-11-25');
    const lido = conferenciasDoItem(lerConferencias(s), CAT, SHA, ITEM);
    expect(lido.ignoradas).toBe(false);
    expect(lido.linhas).toEqual({ '100': { por: 'Fulana', em: '2026-11-25' }, '75': { por: 'Fulana', em: '2026-11-25' } });
    expect(JSON.parse(s.dados[CHAVE_CONFERENCIAS] ?? '{}')).toHaveProperty(`${CAT}:${ITEM}.sha256`, SHA);
  });

  it('chaves de itens diferentes ficam separadas', () => {
    const s = memoria();
    marcarLinhasConferidas(s, CAT, SHA, ITEM, ['100'], 'Fulana', '2026-11-25');
    marcarLinhasConferidas(s, CAT, SHA, 'joelho_90_esgoto_primario', ['50'], 'Beltrana', '2026-11-26');
    const mapa = lerConferencias(s);
    expect(Object.keys(mapa).sort()).toEqual([`${CAT}:${ITEM}`, `${CAT}:joelho_90_esgoto_primario`].sort());
    expect(conferenciasDoItem(mapa, CAT, SHA, ITEM).linhas['50']).toBeUndefined();
  });

  it('se o SHA-256 da fonte mudou, a conferência é IGNORADA e a marcação nova a substitui', () => {
    const s = memoria();
    marcarLinhasConferidas(s, CAT, 'hash_antigo', ITEM, ['100', '75'], 'Fulana', '2026-11-25');
    const ignorado = conferenciasDoItem(lerConferencias(s), CAT, SHA, ITEM);
    expect(ignorado).toEqual({ linhas: {}, ignoradas: true });
    marcarLinhasConferidas(s, CAT, SHA, ITEM, ['50'], 'Beltrano', '2026-11-26');
    expect(Object.keys(conferenciasDoItem(lerConferencias(s), CAT, SHA, ITEM).linhas)).toEqual(['50']);
  });

  it('JSON corrompido, forma estranha ou armazenamento que lança viram mapa vazio, sem lançar', () => {
    expect(lerConferencias(memoria({ [CHAVE_CONFERENCIAS]: '{nao e json' }))).toEqual({});
    expect(lerConferencias(memoria({ [CHAVE_CONFERENCIAS]: '[1,2]' }))).toEqual({});
    expect(lerConferencias(quebrado)).toEqual({});
    expect(() => marcarLinhasConferidas(quebrado, CAT, SHA, ITEM, ['100'], 'Fulana', '2026-11-25')).not.toThrow();
  });

  it('descarta registros e linhas malformados (sem nome ou data, forma errada)', () => {
    const sujo = JSON.stringify({
      a: { sha256: SHA, linhas: { '100': { por: 'Fulana', em: '2026-11-25' }, '75': { por: '', em: '2026-11-25' }, '50': 'x' } },
      b: { linhas: {} },
      c: 7,
    });
    const mapa = lerConferencias(memoria({ [CHAVE_CONFERENCIAS]: sujo }));
    expect(Object.keys(mapa)).toEqual(['a']);
    expect(Object.keys(mapa.a?.linhas ?? {})).toEqual(['100']);
  });

  it('desmarcar uma linha mantém as outras; a última remove o registro do item', () => {
    const s = memoria();
    marcarLinhasConferidas(s, CAT, SHA, ITEM, ['100', '75'], 'Fulana', '2026-11-25');
    desmarcarLinhaConferida(s, CAT, SHA, ITEM, '100');
    expect(Object.keys(conferenciasDoItem(lerConferencias(s), CAT, SHA, ITEM).linhas)).toEqual(['75']);
    desmarcarLinhaConferida(s, CAT, SHA, ITEM, '75');
    expect(lerConferencias(s)).toEqual({});
  });

  it('desmarcar com a fonte trocada não mexe em nada', () => {
    const s = memoria();
    marcarLinhasConferidas(s, CAT, 'hash_antigo', ITEM, ['100'], 'Fulana', '2026-11-25');
    const antes = s.dados[CHAVE_CONFERENCIAS];
    desmarcarLinhaConferida(s, CAT, SHA, ITEM, '100');
    expect(s.dados[CHAVE_CONFERENCIAS]).toBe(antes);
  });

  it('conta os itens com conferência ignorada por troca da fonte', () => {
    const s = memoria();
    marcarLinhasConferidas(s, CAT, 'hash_antigo', ITEM, ['100'], 'Fulana', '2026-11-25');
    marcarLinhasConferidas(s, CAT, 'hash_antigo', 'joelho_90_esgoto_primario', ['50'], 'Fulana', '2026-11-25');
    expect(itensComConferenciaIgnorada(lerConferencias(s), CAT, SHA, KRONA_ESGOTO.itens)).toBe(2);
    expect(itensComConferenciaIgnorada(lerConferencias(s), CAT, 'hash_antigo', KRONA_ESGOTO.itens)).toBe(0);
  });
});

describe('conferência do fabricante: aplicação ao item e exportação', () => {
  it('aplica as linhas guardadas; o item só vira conferido quando todas estão, com quem e quando da última', () => {
    const s = memoria();
    marcarLinhasConferidas(s, CAT, SHA, ITEM, ['50', '75'], 'Fulana', '2026-11-25');
    const parcial = aplicarConferencias(itemFabricante(), conferenciasDoItem(lerConferencias(s), CAT, SHA, ITEM).linhas);
    expect(parcial.estado).toBe('CONFERIR');
    expect(parcial.linhas.filter((l) => l.conferida !== undefined)).toHaveLength(2);
    const todas = ['100', '150', '200'];
    marcarLinhasConferidas(s, CAT, SHA, ITEM, todas, 'Beltrano', '2026-11-26');
    const total = aplicarConferencias(itemFabricante(), conferenciasDoItem(lerConferencias(s), CAT, SHA, ITEM).linhas);
    expect(total.estado).toBe('conferido');
    expect(total.conferidoPor).toBe('Beltrano');
    expect(total.conferidoEm).toBe('2026-11-26');
  });

  it('não altera o item do catálogo e ignora bitola que não existe nele', () => {
    const original = itemFabricante();
    const aplicado = aplicarConferencias(original, { '999': { por: 'Fulana', em: '2026-11-25' } });
    expect(aplicado.linhas.some((l) => l.conferida !== undefined)).toBe(false);
    expect(original.linhas.some((l) => l.conferida !== undefined)).toBe(false);
  });

  it('exporta JSON com a fonte, o SHA-256 e a conferência de cada linha', () => {
    const texto = exportarConferencias({ id: CAT, fonte: KRONA_ESGOTO.fonte }, [aplicarConferencias(itemFabricante(), { '100': { por: 'Fulana', em: '2026-11-25' } })], '2026-11-25T12:00:00.000Z');
    const dados = JSON.parse(texto) as { formato: string; catalogo: { sha256: string }; itens: Array<{ linhas: Array<{ bitola: string; conferida: unknown }> }> };
    expect(dados.formato).toBe('hestia-conferencias-catalogo-mep');
    expect(dados.catalogo.sha256).toBe(SHA);
    const linha100 = dados.itens[0]?.linhas.find((l) => l.bitola === '100');
    expect(linha100?.conferida).toEqual({ por: 'Fulana', em: '2026-11-25' });
    expect(dados.itens[0]?.linhas.find((l) => l.bitola === '50')?.conferida).toBeNull();
  });
});
