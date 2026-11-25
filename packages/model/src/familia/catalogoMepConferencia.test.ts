import { describe, expect, it } from 'vitest';
import {
  conferirItem,
  conferirLinha,
  desconferirLinha,
  editarLinha,
  pendentesDeConferencia,
  progressoDeConferencia,
  type ItemCatalogo,
} from './catalogoMep.ts';
import { KRONA_ESGOTO } from './catalogosMep/kronaEsgoto.ts';

const tubo = (): ItemCatalogo => {
  const it = KRONA_ESGOTO.itens.find((i) => i.id === 'tubo_de_pvc_esgoto_primario_6m');
  if (!it) throw new Error('item de referência ausente');
  return it;
};
const BITOLAS = ['50', '75', '100', '150', '200'];

describe('catálogo MEP: conferência linha a linha', () => {
  it('exige nome e data para conferir uma linha, como conferirItem', () => {
    expect(() => conferirLinha(tubo(), '100', '', '2026-11-25')).toThrow();
    expect(() => conferirLinha(tubo(), '100', 'Fulana', '   ')).toThrow();
  });

  it('marca só a linha pedida e não altera o item recebido', () => {
    const original = tubo();
    const t = conferirLinha(original, '100', 'Fulana', '2026-11-25');
    expect(t.linhas.find((l) => l.bitola === '100')?.conferida).toEqual({ por: 'Fulana', em: '2026-11-25' });
    expect(t.linhas.filter((l) => l.conferida !== undefined)).toHaveLength(1);
    expect(t.estado).toBe('CONFERIR');
    expect(original.linhas.some((l) => l.conferida !== undefined)).toBe(false);
  });

  it('o item só vira conferido quando TODAS as linhas estão conferidas, com quem e quando da última', () => {
    let t = tubo();
    for (const b of BITOLAS.slice(0, -1)) {
      t = conferirLinha(t, b, 'Fulana', '2026-11-25');
      expect(t.estado).toBe('CONFERIR');
    }
    t = conferirLinha(t, '200', 'Beltrano', '2026-11-26');
    expect(t.estado).toBe('conferido');
    expect(t.conferidoPor).toBe('Beltrano');
    expect(t.conferidoEm).toBe('2026-11-26');
  });

  it('bitola inexistente lança erro claro (não cria linha)', () => {
    expect(() => conferirLinha(tubo(), '999', 'Fulana', '2026-11-25')).toThrow(/bitola 999/);
    expect(() => desconferirLinha(tubo(), '999')).toThrow(/bitola 999/);
  });

  it('desconferir volta a linha e o item para CONFERIR, limpando quem e quando do item', () => {
    let t = conferirItem(tubo(), 'Fulana', '2026-11-25');
    expect(t.estado).toBe('conferido');
    t = desconferirLinha(t, '100');
    expect(t.linhas.find((l) => l.bitola === '100')?.conferida).toBeUndefined();
    expect(t.estado).toBe('CONFERIR');
    expect(t.conferidoPor).toBeUndefined();
    expect(t.conferidoEm).toBeUndefined();
    expect(progressoDeConferencia(t)).toEqual({ conferidas: 4, total: 5 });
  });

  it('editar uma linha apaga a conferência dela, mantém as outras e volta o item para CONFERIR', () => {
    let t = conferirLinha(tubo(), '100', 'Fulana', '2026-11-25');
    t = conferirLinha(t, '75', 'Fulana', '2026-11-25');
    const editado = editarLinha(t, '100', { e: 2 });
    expect(editado.linhas.find((l) => l.bitola === '100')?.conferida).toBeUndefined();
    expect(editado.linhas.find((l) => l.bitola === '75')?.conferida).toEqual({ por: 'Fulana', em: '2026-11-25' });
    expect(editado.estado).toBe('CONFERIR');
    expect(progressoDeConferencia(editado)).toEqual({ conferidas: 1, total: 5 });
  });

  it('editar uma linha de item totalmente conferido deixa as outras conferidas (progresso 4 de 5)', () => {
    const t = editarLinha(conferirItem(tubo(), 'Fulana', '2026-11-25'), '50', { B: 40 });
    expect(progressoDeConferencia(t)).toEqual({ conferidas: 4, total: 5 });
    expect(t.estado).toBe('CONFERIR');
  });

  it('é idempotente: repetir a mesma conferência ou desconferência dá o mesmo resultado', () => {
    const uma = conferirLinha(tubo(), '100', 'Fulana', '2026-11-25');
    expect(conferirLinha(uma, '100', 'Fulana', '2026-11-25')).toEqual(uma);
    const sem = desconferirLinha(uma, '100');
    expect(desconferirLinha(sem, '100')).toEqual(sem);
    expect(sem).toEqual(tubo());
  });

  it('progresso de um item conferido por inteiro conta todas, mesmo com linha antiga sem a marca', () => {
    const legado = { ...tubo(), estado: 'conferido' as const, conferidoPor: 'Fulana', conferidoEm: '2026-11-25' };
    expect(progressoDeConferencia(legado)).toEqual({ conferidas: 5, total: 5 });
    expect(progressoDeConferencia(tubo())).toEqual({ conferidas: 0, total: 5 });
  });

  it('conferirItem marca todas as linhas (progresso 5 de 5), para a conta bater com o selo', () => {
    const t = conferirItem(tubo(), 'Fulana', '2026-11-25');
    expect(progressoDeConferencia(t)).toEqual({ conferidas: 5, total: 5 });
    expect(t.linhas.every((l) => l.conferida?.por === 'Fulana')).toBe(true);
  });

  it('o catálogo do fabricante continua todo CONFERIR depois das funções (nada muta a fonte)', () => {
    conferirLinha(tubo(), '100', 'Fulana', '2026-11-25');
    expect(pendentesDeConferencia(KRONA_ESGOTO)).toBe(KRONA_ESGOTO.itens.length);
    expect(KRONA_ESGOTO.itens.every((i) => i.linhas.every((l) => l.conferida === undefined))).toBe(true);
  });

  it('grava quem e quando aparados (sem espaços nas pontas)', () => {
    const t = conferirLinha(tubo(), '100', '  Fulana  ', ' 2026-11-25 ');
    expect(t.linhas.find((l) => l.bitola === '100')?.conferida).toEqual({ por: 'Fulana', em: '2026-11-25' });
  });
});
