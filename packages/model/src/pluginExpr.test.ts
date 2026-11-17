import { describe, expect, it } from 'vitest';
import { EXPR_LIMITS, ExprError, evalExpr, fillTemplate, validateExpr } from './pluginExpr.ts';
import { runDeclarativeChecks, issuesFromHandlerResult, type PluginCheckSpec } from './pluginChecks.ts';
import { buildSchedule, scheduleToCsv } from './pluginSchedules.ts';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { makeWall } from './wall.ts';

const V = { width: 0.7, height: 2.1, name: 'Porta', tags: ['a', 'b'], none: null };
const ev = (e: unknown, v = V): unknown => evalExpr(e, v);

describe('pluginExpr: operadores permitidos', () => {
  it('var, aritmética e comparações', () => {
    expect(ev({ var: 'width' })).toBe(0.7);
    expect(ev({ var: ['ausente', 5] })).toBe(5);
    expect(ev({ '+': [1, 2, 3] })).toBe(6);
    expect(ev({ '-': [{ var: 'height' }, 0.1] })).toBeCloseTo(2);
    expect(ev({ '-': [3] })).toBe(-3);
    expect(ev({ '*': [2, 3] })).toBe(6);
    expect(ev({ '/': [1, 4] })).toBe(0.25);
    expect(ev({ '>=': [{ var: 'width' }, 0.8] })).toBe(false);
    expect(ev({ '<': [0, { var: 'width' }, 1] })).toBe(true);
    expect(ev({ '==': [{ var: 'name' }, 'Porta'] })).toBe(true);
    expect(ev({ '!==': [1, '1'] })).toBe(true);
  });
  it('lógica, if, in, round, min, max', () => {
    expect(ev({ and: [true, { '>': [1, 0] }] })).toBe(true);
    expect(ev({ or: [false, 0, 'x'] })).toBe('x');
    expect(ev({ '!': [[]] })).toBe(true);
    expect(ev({ '!!': ['a'] })).toBe(true);
    expect(ev({ if: [{ '<': [{ var: 'width' }, 0.8] }, 'estreita', 'ok'] })).toBe('estreita');
    expect(ev({ in: ['a', { var: 'tags' }] })).toBe(true);
    expect(ev({ in: ['ort', { var: 'name' }] })).toBe(true);
    expect(ev({ round: [3.14159, 2] })).toBe(3.14);
    expect(ev({ round: [2.5] })).toBe(3);
    expect(ev({ min: [3, 1, 2] })).toBe(1);
    expect(ev({ max: [3, 1, 2] })).toBe(3);
  });
  it('valor ausente não lança: aritmética dá null e comparação dá false; divisão por zero dá null', () => {
    expect(ev({ '+': [{ var: 'none' }, 1] })).toBeNull();
    expect(ev({ '<': [{ var: 'none' }, 1] })).toBe(false);
    expect(ev({ '/': [1, 0] })).toBeNull();
  });
  it('sum e count só existem com linhas (quantitativos)', () => {
    expect(() => evalExpr({ sum: 'x' }, { x: 1 })).toThrow(ExprError);
    const rows = [{ x: 1 }, { x: 2 }, { x: 3 }];
    expect(evalExpr({ sum: [{ var: 'x' }] }, rows[0]!, { rows })).toBe(6);
    expect(evalExpr({ count: [] }, rows[0]!, { rows })).toBe(3);
    expect(evalExpr({ count: [{ '>': [{ var: 'x' }, 1] }] }, rows[0]!, { rows })).toBe(2);
  });
});

describe('pluginExpr: restrições de segurança', () => {
  it('recusa operadores fora da lista branca', () => {
    for (const op of ['map', 'reduce', 'filter', 'all', 'some', 'cat', 'substr', 'log', 'missing', 'merge', '%', 'eval', 'constructor', '__proto__']) {
      expect(validateExpr({ [op]: [1] })?.code, op).toMatch(/operator|shape/);
    }
    expect(() => ev({ map: [[1], { var: '' }] })).toThrow(ExprError);
  });
  it('var não acessa protótipo nem caminho inválido', () => {
    expect(validateExpr({ var: '__proto__.x' })?.code).toBe('var_path');
    expect(validateExpr({ var: 'constructor' })?.code).toBe('var_path');
    expect(validateExpr({ var: '' })?.code).toBe('var_path');
    expect(validateExpr({ var: { var: 'name' } })?.code).toBe('var_path'); // caminho calculado é recusado
    expect(ev({ var: 'toString' })).toBeNull(); // só propriedades próprias
    expect(ev({ var: 'name.length' })).toBeNull();
  });
  it('limita profundidade e número de nós', () => {
    let e: unknown = 1;
    for (let i = 0; i < EXPR_LIMITS.maxDepth + 2; i++) e = { '+': [e, 1] };
    expect(validateExpr(e)?.code).toBe('depth');
    expect(validateExpr({ '+': Array(EXPR_LIMITS.maxArray + 1).fill(1) })?.code).toBe('too_big');
  });
  it('recusa formas inválidas (objeto com várias chaves, NaN, agregação aninhada)', () => {
    expect(validateExpr({ '+': [1], '-': [2] })?.code).toBe('shape');
    expect(validateExpr({ '+': [Number.NaN, 1] })?.code).toBe('shape');
    expect(validateExpr({ sum: [{ sum: [1] }] }, { aggregate: true })?.code).toBe('nested_aggregate');
  });
  it('round recusa casas decimais fora de 0 a 6', () => {
    expect(() => ev({ round: [1.5, 9] })).toThrow(ExprError);
  });
});

describe('fillTemplate', () => {
  it('preenche {campos} e usa ? para ausentes', () => {
    expect(fillTemplate('Largura {width} m ({x}) {name}', V)).toBe('Largura 0.7 m (?) Porta');
    expect(fillTemplate('{__proto__}', V)).toBe('?');
  });
});

const proj = (): ProjectStore => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 0, y: 3 } }) });
  const ab = (id: string, typeId: string, offset: number) =>
    ({ type: 'addOpening' as const, opening: { id, kind: 'door' as const, typeId, hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  s.exec(ab('d1', 'ot_p80', 1));
  s.exec(ab('d2', 'ot_p80', 3));
  return s;
};

describe('checks declarativos', () => {
  const check: PluginCheckSpec = { pluginId: 'dev.t', id: 'larg', severity: 'warning', applyTo: 'opening', rule: { '>=': [{ var: 'width' }, 0.9] }, message: 'Porta {mark} com {width} m; mínimo 0,9 m.' };
  it('gera itens no formato ValidationIssue para os elementos que violam', () => {
    const p = proj().project;
    const { issues, errors } = runDeclarativeChecks(p, [check]);
    expect(errors).toEqual([]);
    expect(issues.map((i) => i.elementId)).toEqual(['d1', 'd2']);
    expect(issues[0]).toMatchObject({ severity: 'warning', code: 'plugin:dev.t:larg', message: 'Porta  com 0.8 m; mínimo 0,9 m.' });
  });
  it('regra conforme não gera item; regra inválida vira erro sem lançar', () => {
    const p = proj().project;
    expect(runDeclarativeChecks(p, [{ ...check, rule: { '>=': [{ var: 'width' }, 0.5] } }]).issues).toEqual([]);
    const r = runDeclarativeChecks(p, [{ ...check, rule: { eval: ['x'] } }]);
    expect(r.issues).toEqual([]);
    expect(r.errors[0]).toMatchObject({ code: 'operator' });
  });
  it('resultado de handler vira itens, descartando elemento inexistente e lixo', () => {
    const p = proj().project;
    const out = issuesFromHandlerResult(p, { ...check, rule: undefined }, [{ elementId: 'd1', message: 'ruim' }, { elementId: 'nao-existe' }, 5, null, { elementId: 'd2' }]);
    expect(out.map((i) => [i.elementId, i.message])).toEqual([['d1', 'ruim'], [undefined, 'Porta ? com ? m; mínimo 0,9 m.'], ['d2', 'Porta  com 0.8 m; mínimo 0,9 m.']]);
    expect(issuesFromHandlerResult(p, check, 'x')).toEqual([]);
  });
});

describe('schedules', () => {
  it('agrupa por material, soma comprimento e conta paredes, com totais', () => {
    const p = proj().project;
    const t = buildSchedule(p, {
      pluginId: 'dev.t', id: 's', title: 'Paredes por material', source: 'wall', groupBy: ['mat'],
      columns: [
        { key: 'mat', title: 'Material', expr: { var: 'material' } },
        { key: 'n', title: 'Paredes', expr: 1, total: 'count' },
        { key: 'len', title: 'Comprimento', expr: { var: 'length' }, unit: 'm', total: 'sum' },
      ],
    });
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]!.cells[1]).toBe(2);
    expect(t.rows[0]!.cells[2]).toBe(7);
    expect(t.totals).toEqual([null, 2, 7]);
    expect(t.errors).toBe(0);
  });
  it('filtro, linhas simples e erro de coluna sem lançar', () => {
    const p = proj().project;
    const t = buildSchedule(p, {
      pluginId: 'dev.t', id: 's', title: 'x', source: 'wall', filter: { '>': [{ var: 'length' }, 3.5] },
      columns: [{ key: 'id', title: 'Id', expr: { var: 'id' } }, { key: 'bad', title: 'Ruim', expr: { map: [1] } }],
    });
    expect(t.rows.map((r) => r.cells[0])).toEqual(['w1']);
    expect(t.errors).toBeGreaterThan(0);
    expect(t.totals).toBeNull();
  });
  it('agregação por coluna (count e sum) e CSV com separador, decimal e proteção de fórmula', () => {
    const p = proj().project;
    const t = buildSchedule(p, { pluginId: 'dev.t', id: 's', title: 'x', source: 'opening', columns: [{ key: 'n', title: 'Qtd', expr: { count: [] } }, { key: 'a', title: '=Área', expr: { sum: [{ var: 'area' }] }, unit: 'm²' }] });
    expect(t.rows.map((r) => r.cells)).toEqual([[2, 3.36], [2, 3.36]]);
    const csv = scheduleToCsv({ ...t, rows: [{ cells: ['=cmd|x', 1.5], count: 1, elementIds: [] }], totals: [null, 1.5] }, { separator: ';', decimalComma: true });
    expect(csv).toBe("Qtd;\"=Área (m²)\"\r\n'=cmd|x;1,5\r\nTotal;1,5\r\n".replace('"=Área (m²)"', "'=Área (m²)"));
  });
});
