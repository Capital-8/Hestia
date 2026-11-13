import { describe, expect, it } from 'vitest';
import { DEFAULT_COLUMN_TYPES, ProjectStore, createEmptyProject, makeBeam, makeColumn, makeFooting, type BeamType, type ColumnType, type FootingType } from '@hestia/model';
import { compatibleTypes, duplicateEstrType, estrTypeDeleteBlock, estrTypeError, estrTypeUsage, estrTypesOf, instancesOfType, replaceType, tryDeleteEstrType, upsertEstrType, whereUsedTarget } from './typeActions.ts';

const novo = (): ProjectStore => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'c1', typeId: 'pil_est_25x25', levelId: 'lv_0', pos: { x: 0, y: 0 } }) });
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'c2', typeId: 'pil_est_25x25', levelId: 'lv_1', pos: { x: 1, y: 0 } }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'b1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f1', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 0, y: 0 } }) });
  return s;
};

const colunaEstrutural = (id: string): ColumnType => ({ ...structuredClone(DEFAULT_COLUMN_TYPES['pil_est_25x25']!), id, name: id });

describe('tipos de estrutura: uso e troca', () => {
  it('conta os elementos de cada tipo em todos os níveis', () => {
    const p = novo().project;
    expect(instancesOfType(p, 'column', 'pil_est_25x25').sort()).toEqual(['c1', 'c2']);
    expect(estrTypeUsage(p, 'beam', 'vig_15x40')).toBe(1);
    expect(estrTypeUsage(p, 'footing', 'sap_80x80x30')).toBe(1);
    expect(estrTypeUsage(p, 'footing', 'bal_40x30')).toBe(0);
    expect(whereUsedTarget(p, 'column', 'pil_est_25x25')?.ids).toEqual(['c1']);
  });

  it('os compatíveis são os da mesma disciplina (pilar) e do mesmo modo (fundação)', () => {
    const s = novo();
    upsertEstrType(s, 'column', colunaEstrutural('pil_est_30'), 'x');
    const p = s.project;
    expect(compatibleTypes(p, 'column', 'pil_est_25x25').map((t) => t.id)).toEqual(['pil_est_30']);
    expect(compatibleTypes(p, 'footing', 'sap_80x80x30')).toEqual([]);
    expect(compatibleTypes(p, 'beam', 'vig_15x40')).toEqual([]);
  });

  it('substituir o tipo troca todos os pilares num só passo de desfazer', () => {
    const s = novo();
    upsertEstrType(s, 'column', colunaEstrutural('pil_est_30'), 'x');
    expect(replaceType(s, 'column', 'pil_est_25x25', 'pil_est_30')).toBe(2);
    expect(instancesOfType(s.project, 'column', 'pil_est_30').sort()).toEqual(['c1', 'c2']);
    s.undo();
    expect(instancesOfType(s.project, 'column', 'pil_est_25x25')).toHaveLength(2);
    expect(() => replaceType(s, 'column', 'pil_est_25x25', 'pil_arq_20x20')).toThrow();
  });
});

describe('tipos de estrutura: excluir, duplicar e validar', () => {
  it('tipo em uso não se exclui; o último do grupo também não; o livre sim', () => {
    const s = novo();
    expect(estrTypeDeleteBlock(s.project, 'column', 'pil_est_25x25')).toContain('2');
    expect(estrTypeDeleteBlock(s.project, 'column', 'pil_arq_20x20')).not.toBeNull();
    upsertEstrType(s, 'column', colunaEstrutural('pil_est_30'), 'x');
    expect(estrTypeDeleteBlock(s.project, 'column', 'pil_est_30')).toBeNull();
    expect(tryDeleteEstrType(s, 'column', 'pil_est_30')).toEqual({ ok: true });
    expect(estrTypesOf(s.project, 'column')['pil_est_30']).toBeUndefined();
    expect(tryDeleteEstrType(s, 'column', 'pil_est_25x25').ok).toBe(false);
  });

  it('duplicar cria um tipo novo com o nome de cópia e o mesmo conteúdo; desfaz num passo', () => {
    const s = novo();
    const id = duplicateEstrType(s, 'beam', 'vig_15x40');
    expect(id).not.toBeNull();
    const copia = estrTypesOf(s.project, 'beam')[id!] as BeamType;
    expect(copia.perfil).toEqual({ forma: 'retangular', b: 0.15, h: 0.4 });
    expect(copia.name).not.toBe('Retangular 15 × 40');
    s.undo();
    expect(Object.keys(estrTypesOf(s.project, 'beam'))).toEqual(['vig_15x40']);
    expect(duplicateEstrType(s, 'footing', 'nao_existe')).toBeNull();
  });

  it('estrTypeError devolve a mensagem do modelo para perfil inválido, nome vazio e pescoço sem altura', () => {
    const tipo = structuredClone(estrTypesOf(novo().project, 'column')['pil_est_25x25']!) as ColumnType;
    expect(estrTypeError('column', tipo)).toBeNull();
    expect(estrTypeError('column', { ...tipo, perfil: { forma: 'I', b: 0.1, h: 0.2, tf: 0.2, tw: 0.005 } })).not.toBeNull();
    expect(estrTypeError('column', { ...tipo, name: ' ' })).not.toBeNull();
    const fund = structuredClone(estrTypesOf(novo().project, 'footing')['sap_80x80x30']!) as FootingType;
    expect(estrTypeError('footing', fund)).toBeNull();
    expect(estrTypeError('footing', { ...fund, alturaPescoco: undefined })).not.toBeNull();
    expect(estrTypeError('beam', { ...(estrTypesOf(novo().project, 'beam')['vig_15x40'] as BeamType), cost: -1 })).not.toBeNull();
  });

  it('o modelo recusa gravar tipo inválido (o painel não deixa chegar lá, mas o comando protege)', () => {
    const s = novo();
    const ruim = { ...colunaEstrutural('pil_ruim'), perfil: { forma: 'circular', d: -1 } } as ColumnType;
    expect(() => upsertEstrType(s, 'column', ruim, 'x')).toThrow();
  });
});
