import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { t } from './i18n.ts';
import { ladosPadrao, makeLot } from './lot.ts';
import type { LadoLote, Lot } from './lotTypes.ts';

const quadrado = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }];
const lados: LadoLote[] = [{ papel: 'frente', recuo: 5 }, { papel: 'lateral', recuo: 1.5 }, { papel: 'fundo', recuo: 3 }, { papel: 'lateral', recuo: 1.5 }];
const msg = (k: Parameters<typeof t>[1], params?: Record<string, string | number>): string => t('pt', k, params);
const L = (s: ProjectStore): Lot => s.project.elements['lt1'] as Lot;

function comLote(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: quadrado, lados }) });
  return s;
}

describe('addLot', () => {
  it('cria o lote com ordem e copia as listas; desfaz e refaz', () => {
    const origem = makeLot({ id: 'lt1', levelId: 'lv_0', contorno: quadrado, lados });
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addLot', lot: origem });
    expect(L(s)).toMatchObject({ kind: 'lot', name: 'Lote', mostrarEdificavel: true, limites: {} });
    expect(L(s).order).toBe(s.project.nextOrder - 1);
    expect(L(s).lados).toEqual(lados);
    expect(L(s).lados).not.toBe(origem.lados);
    s.undo();
    expect(s.project.elements['lt1']).toBeUndefined();
    s.redo();
    expect(L(s).lados).toEqual(lados);
  });

  it('contorno horário é normalizado e os lados vão junto (cada lado liga os mesmos pontos)', () => {
    const s = new ProjectStore(createEmptyProject());
    // Horário: (0,0)(0,30)(20,30)(20,0); lado 0 = esquerdo (frente 5)...
    const horario = [{ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 20, y: 30 }, { x: 20, y: 0 }];
    const ls: LadoLote[] = [{ papel: 'frente', recuo: 5 }, { papel: 'lateral', recuo: 1 }, { papel: 'fundo', recuo: 3 }, { papel: 'lateral', recuo: 2 }];
    s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: horario, lados: ls }) });
    expect(L(s).contorno).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }]);
    // O lado "frente" liga (0,0)–(0,30): no polígono anti-horário é o último lado ((0,30)→(0,0)).
    expect(L(s).lados[3]).toEqual({ papel: 'frente', recuo: 5 });
    expect(L(s).lados[0]).toEqual({ papel: 'lateral', recuo: 2 });
  });

  it('recusa lote inválido e nível inexistente sem mexer no projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'addLot', lot: makeLot({ id: 'x', levelId: 'lv_0', contorno: quadrado, lados: ladosPadrao(3) }) })).toThrow(msg('md_lt_lados'));
    expect(() => s.exec({ type: 'addLot', lot: makeLot({ id: 'x', levelId: 'nao_existe', contorno: quadrado, lados: ladosPadrao(4) }) })).toThrow();
    expect(() => s.exec({ type: 'addLot', lot: makeLot({ id: 'x', levelId: 'lv_0', contorno: quadrado, lados: ladosPadrao(4), limites: { taxaOcupacaoMax: 2 } }) })).toThrow();
    expect(s.project.elements['x']).toBeUndefined();
    expect(s.canUndo).toBe(false);
  });
});

describe('updateLot', () => {
  it('muda nome, limites, mostrarEdificavel e cor; preserva o contorno e a ordem; desfaz e refaz', () => {
    const s = comLote();
    const ordem = L(s).order;
    s.exec({ type: 'updateLot', id: 'lt1', patch: { name: 'Lote 7', limites: { taxaOcupacaoMax: 0.6, coefAproveitamentoMax: 1.2, permeabilidadeMin: 0.2, gabaritoMax: 9 }, mostrarEdificavel: false, color: '#ff0000' } });
    expect(L(s)).toMatchObject({ name: 'Lote 7', limites: { taxaOcupacaoMax: 0.6, coefAproveitamentoMax: 1.2, permeabilidadeMin: 0.2, gabaritoMax: 9 }, mostrarEdificavel: false, color: '#ff0000', order: ordem });
    expect(L(s).contorno).toEqual(quadrado);
    s.exec({ type: 'updateLot', id: 'lt1', patch: { limites: {} } });
    expect(L(s).limites).toEqual({});
    s.undo();
    expect(L(s).limites.taxaOcupacaoMax).toBe(0.6);
    s.undo();
    expect(L(s)).toMatchObject({ name: 'Lote', mostrarEdificavel: true, limites: {} });
    s.redo();
    s.redo();
    expect(L(s).limites).toEqual({});
  });

  it('recusa limite inválido e id que não é lote', () => {
    const s = comLote();
    expect(() => s.exec({ type: 'updateLot', id: 'lt1', patch: { limites: { permeabilidadeMin: 1.5 } } })).toThrow(msg('md_lt_limite', { campo: 'permeabilidadeMin', max: 1 }));
    expect(() => s.exec({ type: 'updateLot', id: 'nada', patch: { name: 'x' } })).toThrow(msg('md_cmd_lot_missing'));
    expect(L(s).limites).toEqual({});
  });
});

describe('setLotContorno', () => {
  it('troca o contorno e os lados juntos; desfaz e refaz', () => {
    const s = comLote();
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }];
    const ls: LadoLote[] = [{ papel: 'frente', recuo: 4 }, { papel: 'lateral', recuo: 1 }, { papel: 'lateral', recuo: 1 }];
    s.exec({ type: 'setLotContorno', id: 'lt1', contorno: tri, lados: ls });
    expect(L(s).contorno).toEqual(tri);
    expect(L(s).lados).toEqual(ls);
    expect(L(s).name).toBe('Lote');
    s.undo();
    expect(L(s).contorno).toEqual(quadrado);
    expect(L(s).lados).toEqual(lados);
    s.redo();
    expect(L(s).contorno).toEqual(tri);
  });

  it('recusa lados de tamanho diferente e contorno com cruzamento', () => {
    const s = comLote();
    expect(() => s.exec({ type: 'setLotContorno', id: 'lt1', contorno: quadrado.slice(0, 3), lados })).toThrow(msg('md_lt_lados'));
    expect(() => s.exec({ type: 'setLotContorno', id: 'lt1', contorno: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }], lados })).toThrow(msg('md_lt_simples'));
    expect(() => s.exec({ type: 'setLotContorno', id: 'nada', contorno: quadrado, lados })).toThrow(msg('md_cmd_lot_missing'));
    expect(L(s).contorno).toEqual(quadrado);
  });
});

describe('apagar lote', () => {
  it('deleteElements apaga o lote e o desfazer devolve', () => {
    const s = comLote();
    const antes = structuredClone(L(s));
    s.exec({ type: 'deleteElements', ids: ['lt1'] });
    expect(s.project.elements['lt1']).toBeUndefined();
    s.undo();
    expect(L(s)).toEqual(antes);
  });
});
