import { describe, expect, it } from 'vitest';
import {
  PLUGIN_IO_MAX_BYTES, PluginIoError, checkImportFile, deepFreeze, parseExportResult, parseImportResult, previewCommands, renderTemplate,
  toExportBytes, validateExportName,
} from './pluginIo.ts';

const code = (f: () => unknown): string | undefined => {
  try { f(); } catch (e) { return e instanceof PluginIoError ? e.code : 'other'; }
  return undefined;
};

describe('bytes do exportador', () => {
  it('aceita texto, Uint8Array e ArrayBuffer', () => {
    expect(new TextDecoder().decode(toExportBytes('olá'))).toBe('olá');
    expect(toExportBytes(new Uint8Array([1, 2])).byteLength).toBe(2);
    expect(toExportBytes(new Uint8Array([1, 2, 3]).buffer).byteLength).toBe(3);
  });
  it('recusa outros tipos e acima de 64 MiB', () => {
    expect(code(() => toExportBytes({ a: 1 }))).toBe('bad_bytes');
    expect(code(() => toExportBytes(42))).toBe('bad_bytes');
    expect(code(() => toExportBytes(new Uint8Array(PLUGIN_IO_MAX_BYTES + 1)))).toBe('too_large');
    expect(toExportBytes(new Uint8Array(PLUGIN_IO_MAX_BYTES)).byteLength).toBe(PLUGIN_IO_MAX_BYTES);
  });
});

describe('nome do arquivo exportado', () => {
  it('valida caminho, extensão e tamanho', () => {
    expect(validateExportName('paredes.csv', 'csv')).toBe('paredes.csv');
    expect(code(() => validateExportName('../x.csv', 'csv'))).toBe('bad_name');
    expect(code(() => validateExportName('a/b.csv', 'csv'))).toBe('bad_name');
    expect(code(() => validateExportName('a\\b.csv', 'csv'))).toBe('bad_name');
    expect(code(() => validateExportName('a..csv', 'csv'))).toBe('bad_name');
    expect(code(() => validateExportName('', 'csv'))).toBe('bad_name');
    expect(code(() => validateExportName('x'.repeat(200) + '.csv', 'csv'))).toBe('bad_name');
    expect(code(() => validateExportName('paredes.exe', 'csv'))).toBe('bad_extension');
  });
  it('resultado: nome padrão vem do projeto e `{ data, name }` é validado', () => {
    expect(parseExportResult('x', 'csv', 'Casa Árvore').name).toBe('Casa-Arvore.csv');
    expect(parseExportResult({ data: 'x', name: 'a.csv' }, 'csv', 'p').name).toBe('a.csv');
    expect(code(() => parseExportResult({ data: 'x', name: 'a.txt' }, 'csv', 'p'))).toBe('bad_extension');
  });
});

describe('arquivo escolhido para importar', () => {
  it('confere extensão (sem diferenciar maiúsculas) e tamanho', () => {
    expect(() => checkImportFile('A.CSV', 10, ['csv'])).not.toThrow();
    expect(code(() => checkImportFile('a.txt', 10, ['csv']))).toBe('bad_extension');
    expect(code(() => checkImportFile('semext', 10, ['csv']))).toBe('bad_extension');
    expect(code(() => checkImportFile('a.csv', PLUGIN_IO_MAX_BYTES + 1, ['csv']))).toBe('too_large');
  });
});

describe('lote do importador', () => {
  it('aceita vetor ou { commands, report }', () => {
    expect(parseImportResult([{ type: 'addWall' }]).commands).toHaveLength(1);
    expect(parseImportResult({ commands: [{ type: 'a' }], report: 'aviso' }).report).toBe('aviso');
  });
  it('recusa formato errado, vazio e lote grande demais', () => {
    expect(code(() => parseImportResult('x'))).toBe('bad_result');
    expect(code(() => parseImportResult(null))).toBe('bad_result');
    expect(code(() => parseImportResult([]))).toBe('no_commands');
    expect(code(() => parseImportResult(new Array(5001).fill({ type: 'addWall' })))).toBe('too_many_commands');
  });
  it('prévia conta elementos criados por tipo', () => {
    const p = previewCommands([{ type: 'addWall' }, { type: 'addWall' }, { type: 'updateElements' }, { type: 'addCeilings', ceilings: [1, 2, 3] }, 5]);
    expect(p.commands).toBe(5);
    expect(p.created).toBe(5);
    expect(p.byType).toMatchObject({ addWall: 2, updateElements: 1, '?': 1 });
  });
});

describe('modelo declarativo de exportação', () => {
  const project = {
    name: 'Casa "A"',
    elements: {
      w1: { id: 'w1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 3.5, y: 0 } },
      d1: { id: 'd1', kind: 'door' },
      w2: { id: 'w2', kind: 'wall', a: { x: 3.5, y: 0 }, b: { x: 3.5, y: 4 } },
    },
  };
  it('repete a linha por elemento do tipo e substitui campos', () => {
    const t = { header: '{{project.name}};{{count.wall}};{{count.total}}\n', each: { kind: 'wall', line: '{{index}};{{id}};{{a.x}};{{b.y}}\n' }, footer: 'fim', escape: 'csv' };
    expect(renderTemplate(t, project)).toBe('"Casa ""A""";2;3\n1;w1;0;0\n2;w2;3.5;4\nfim');
  });
  it('campo inexistente, objeto e chaves perigosas viram vazio; texto simples também vale', () => {
    expect(renderTemplate('[{{nada}}][{{project}}][{{__proto__.x}}][{{constructor}}]', project)).toBe('[][][][]');
  });
  it('escapa XML e JSON', () => {
    expect(renderTemplate({ header: '<n>{{project.name}}</n>', escape: 'xml' }, project)).toBe('<n>Casa &quot;A&quot;</n>');
    expect(renderTemplate({ header: '{{project.name}}', escape: 'json' }, project)).toBe('Casa \\"A\\"');
  });
  it('template inválido é recusado', () => {
    expect(code(() => renderTemplate([1], project))).toBe('bad_result');
    expect(code(() => renderTemplate(7, project))).toBe('bad_result');
  });
});

describe('cópia imutável', () => {
  it('deepFreeze congela em profundidade', () => {
    const o = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(o.a.b[1])).toBe(true);
    expect(() => { (o.a as { x?: number }).x = 1; }).toThrow();
  });
});
