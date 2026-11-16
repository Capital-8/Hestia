import { describe, expect, it } from 'vitest';
import type { DialogField } from './contributesTypes.ts';
import { validateContributes } from './contributes.ts';
import { initialFieldValues, validateFieldValues } from './dialogValues.ts';
import { parseView, readFieldPath, viewInputs } from './panelView.ts';
import { sanitizeToolReply, TOOL_LIMITS } from './toolReply.ts';

const campos: DialogField[] = [
  { key: 'w', label: 'W', type: 'length', default: 6, min: 0.5, max: 100 },
  { key: 'a', label: 'A', type: 'angle', default: 0 },
  { key: 'n', label: 'N', type: 'number', min: 1 },
  { key: 't', label: 'T', type: 'text', default: 'x' },
  { key: 'c', label: 'C', type: 'choice', options: ['a', 'b'] },
  { key: 'b', label: 'B', type: 'bool' },
];

describe('valores de campos de diálogo', () => {
  it('valores iniciais usam default, min ou o vazio do tipo', () => {
    expect(initialFieldValues(campos)).toEqual({ w: 6, a: 0, n: 1, t: 'x', c: 'a', b: false });
  });

  it('aceita valores válidos em metro e radiano e descarta chaves desconhecidas', () => {
    const r = validateFieldValues(campos, { w: 3, a: Math.PI, n: 2, t: 'oi', c: 'b', b: true, extra: 1 });
    expect(r).toEqual({ ok: true, values: { w: 3, a: Math.PI, n: 2, t: 'oi', c: 'b', b: true } });
  });

  it('recusa fora dos limites, tipo errado e opção desconhecida, com o código de cada campo', () => {
    const r = validateFieldValues(campos, { w: 0.1, a: 'x', n: 0, t: 'y'.repeat(201), c: 'z', b: 'sim' });
    expect(r).toEqual({
      ok: false,
      errors: [
        { key: 'w', code: 'below_min' }, { key: 'a', code: 'not_number' }, { key: 'n', code: 'below_min' },
        { key: 't', code: 'text_too_long' }, { key: 'c', code: 'bad_option' }, { key: 'b', code: 'not_bool' },
      ],
    });
    expect(validateFieldValues(campos, { w: 101 })).toMatchObject({ ok: false, errors: [{ key: 'w', code: 'above_max' }] });
    expect(validateFieldValues(campos, { w: Number.NaN })).toMatchObject({ ok: false });
  });
});

describe('visão declarativa de painel', () => {
  const view = [
    { type: 'text', text: { pt: 'Olá', en: 'Hi' } },
    { type: 'row', children: [{ type: 'value', field: 'width', unit: 'length', label: 'L' }, { type: 'button', label: 'Ir', run: { type: 'handler', ref: 'ir' } }] },
    { type: 'table', columns: [{ title: 'Id', field: 'id' }, { title: 'Alt', field: 'height', unit: 'length' }] },
    { type: 'input', key: 'passo', label: 'Passo', input: 'length', default: 2, min: 0.5 },
  ];

  it('aceita os seis blocos e lista os campos de entrada', () => {
    const r = parseView(view);
    expect(r.ok).toBe(true);
    if (r.ok) expect(viewInputs(r.view)).toEqual([{ key: 'passo', label: 'Passo', type: 'length', default: 2, min: 0.5 }]);
  });

  it('recusa bloco desconhecido, HTML, caminho perigoso, profundidade e quantidade demais', () => {
    expect(parseView({ type: 'html', html: '<b>x</b>' })).toMatchObject({ ok: false });
    expect(parseView({ type: 'value', field: '__proto__.x' })).toMatchObject({ ok: false });
    expect(parseView({ type: 'value', field: 'a b' })).toMatchObject({ ok: false });
    expect(parseView({ type: 'button', label: 'x', run: { type: 'rm', ref: 'a' } })).toMatchObject({ ok: false });
    expect(parseView({ type: 'input', key: 'k', label: 'K', input: 'choice' })).toMatchObject({ ok: false }); // choice sem options
    let fundo: unknown = { type: 'text', text: 'x' };
    for (let i = 0; i < 8; i++) fundo = { type: 'row', children: [fundo] };
    expect(parseView(fundo)).toMatchObject({ ok: false });
    expect(parseView(Array.from({ length: 201 }, () => ({ type: 'text', text: 'x' })))).toMatchObject({ ok: false });
  });

  it('leitura de campo só lê propriedades próprias e primitivos', () => {
    const el = { id: 'w1', pos: { x: 3 }, lista: [1] };
    expect(readFieldPath(el, 'pos.x')).toBe(3);
    expect(readFieldPath(el, 'id')).toBe('w1');
    expect(readFieldPath(el, 'pos')).toBeUndefined();
    expect(readFieldPath(el, 'constructor')).toBeUndefined();
    expect(readFieldPath(el, 'toString')).toBeUndefined();
    expect(readFieldPath(el, '__proto__.x')).toBeUndefined();
  });

  it('o manifesto com visão inválida é recusado em `contributes.panels`', () => {
    const chk = { runtime: 'declarative' as const, capabilities: ['ui.panels'], i18n: {} };
    const ok = validateContributes({ panels: [{ id: 'p', title: 'P', dock: 'properties', view }] }, chk);
    expect(ok.issues).toEqual([]);
    const ruim = validateContributes({ panels: [{ id: 'p', title: 'P', dock: 'properties', view: { type: 'html' } }] }, chk);
    expect(ruim.issues).toEqual([{ code: 'bad_field', path: 'contributes.panels[0].view' }]);
  });
});

describe('resposta da ferramenta (dado não confiável)', () => {
  it('resposta que não é objeto vira vazia', () => {
    for (const x of [null, undefined, 3, 'x', [1]]) expect(sanitizeToolReply(x)).toEqual({});
  });

  it('valida e limita o rascunho: pontos não finitos e fora da faixa caem, excesso é cortado', () => {
    const linhas = Array.from({ length: TOOL_LIMITS.lines + 50 }, () => ({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }));
    const r = sanitizeToolReply({
      draft: {
        lines: [...linhas, { a: { x: Number.NaN, y: 0 }, b: { x: 1, y: 1 } }, { a: { x: 1e9, y: 0 }, b: { x: 1, y: 1 } }],
        points: [{ x: 1, y: 2 }, { x: 'a', y: 2 }],
        labels: [{ at: { x: 0, y: 0 }, text: 'y'.repeat(500) }, { at: { x: 0, y: 0 }, text: 7 }],
      },
      message: 'm'.repeat(500),
      done: true,
    });
    expect(r.draft!.lines).toHaveLength(TOOL_LIMITS.lines);
    expect(r.draft!.points).toEqual([{ x: 1, y: 2 }]);
    expect(r.draft!.labels).toHaveLength(1);
    expect(r.draft!.labels[0]!.text).toHaveLength(TOOL_LIMITS.labelChars);
    expect(r.message).toHaveLength(TOOL_LIMITS.messageChars);
    expect(r.done).toBe(true);
  });

  it('commit exige lista de comandos; o rótulo tem valor padrão e limite', () => {
    expect(sanitizeToolReply({ commit: { label: 'x', commands: 'nao' } })).toEqual({});
    expect(sanitizeToolReply({ commit: { commands: [{ type: 'a' }] } }).commit).toEqual({ label: 'ferramenta', commands: [{ type: 'a' }] });
    expect(sanitizeToolReply({ commit: { label: 'z'.repeat(200), commands: [] } }).commit!.label).toHaveLength(TOOL_LIMITS.commitLabelChars);
  });
});
