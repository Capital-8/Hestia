import { describe, expect, it } from 'vitest';
import type { ItemCatalogo } from '@hestia/model';
import { CHAVE_MEUS_CATALOGOS, dataDeHoje, guardarItem, lerMeusItens, proximoIdDeItem, removerItem } from './familiaCatalogoMep.ts';
import type { Armazenamento } from './meusModelos.ts';

function memoria(inicial: Record<string, string> = {}): Armazenamento & { dados: Record<string, string> } {
  const dados = { ...inicial };
  return { dados, getItem: (k) => dados[k] ?? null, setItem: (k, v) => { dados[k] = v; } };
}
const item = (id: string): ItemCatalogo => ({ id, nome: id, tipo: 'tubo', serie: 's', colunas: { B: 'bolsa' }, linhas: [{ bitola: '50', valores: { B: 39 } }], estado: 'CONFERIR' });

describe('Meus catálogos (armazenamento)', () => {
  it('guarda, substitui pelo id, lê e remove', () => {
    const m = memoria();
    guardarItem(m, item('a'));
    guardarItem(m, item('b'));
    expect(guardarItem(m, { ...item('a'), nome: 'novo' }).map((i) => i.nome)).toEqual(['b', 'novo']);
    expect(lerMeusItens(m).map((i) => i.id)).toEqual(['b', 'a']);
    expect(removerItem(m, 'b').map((i) => i.id)).toEqual(['a']);
  });
  it('JSON corrompido, formato estranho ou armazenamento que lança viram lista vazia', () => {
    expect(lerMeusItens(memoria({ [CHAVE_MEUS_CATALOGOS]: '{nao e json' }))).toEqual([]);
    expect(lerMeusItens(memoria({ [CHAVE_MEUS_CATALOGOS]: '{"a":1}' }))).toEqual([]);
    expect(lerMeusItens({ getItem: () => { throw new Error('bloqueado'); }, setItem: () => undefined })).toEqual([]);
    expect(() => guardarItem({ getItem: () => null, setItem: () => { throw new Error('cheio'); } }, item('x'))).not.toThrow();
  });
  it('descarta itens e linhas malformados e normaliza o estado (nada vira conferido sem querer)', () => {
    const sujo = JSON.stringify([{ id: 'ok', nome: 'ok', colunas: {}, linhas: [{ bitola: '1', valores: {} }, { x: 1 }], estado: 'qualquer' }, { id: 3 }, 'texto']);
    const lido = lerMeusItens(memoria({ [CHAVE_MEUS_CATALOGOS]: sujo }));
    expect(lido).toHaveLength(1);
    expect(lido[0]?.linhas).toHaveLength(1);
    expect(lido[0]?.estado).toBe('CONFERIR');
  });
  it('próximo id livre e data de hoje', () => {
    expect(proximoIdDeItem(['meu_item_1', 'meu_item_3'])).toBe('meu_item_2');
    expect(dataDeHoje(new Date('2026-11-24T15:00:00Z'))).toBe('2026-11-24');
  });
});
