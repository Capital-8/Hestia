import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { DEFAULT_BEAM_TYPES, makeBeam } from './beam.ts';
import { DEFAULT_COLUMN_TYPES, makeColumn } from './column.ts';
import { DEFAULT_FOOTING_TYPES, makeFooting } from './footing.ts';
import { beamIssue, beamTypeIssue, columnIssue, columnTypeIssue, footingIssue, footingTypeIssue, hospedeiroIssue, materiaisIssue, nivelIssue } from './validateEstr.ts';
import type { Beam, Column, Footing } from './estrTypes.ts';

const est = DEFAULT_COLUMN_TYPES.pil_est_25x25!;
const arq = DEFAULT_COLUMN_TYPES.pil_arq_20x20!;
const pilar = (x: Partial<Column> = {}): Column => ({ ...makeColumn({ id: 'c', typeId: est.id, levelId: 'lv_0', pos: { x: 0, y: 0 }, ...x }), order: 0 });
const viga = (x: Partial<Beam> = {}): Beam => ({ ...makeBeam({ id: 'b', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, ...x }), order: 0 });
const sap = (x: Partial<Footing> = {}): Footing => ({ ...makeFooting({ id: 'f', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 0, y: 0 }, ...x }), order: 0 });

describe('validação de tipos e elementos de estrutura', () => {
  it('os tipos padrão são válidos', () => {
    for (const t of Object.values(DEFAULT_COLUMN_TYPES)) expect(columnTypeIssue(t)).toBeNull();
    for (const t of Object.values(DEFAULT_BEAM_TYPES)) expect(beamTypeIssue(t)).toBeNull();
    for (const t of Object.values(DEFAULT_FOOTING_TYPES)) expect(footingTypeIssue(t)).toBeNull();
  });

  it('tipo de pilar: custo negativo, disciplina inválida e camadas no estrutural são recusados', () => {
    expect(columnTypeIssue({ ...est, cost: -1 })).not.toBeNull();
    expect(columnTypeIssue({ ...est, disciplina: 'x' as never })).not.toBeNull();
    expect(columnTypeIssue({ ...est, camadas: [] })).not.toBeNull();
    expect(columnTypeIssue({ ...arq, camadas: [{ function: 'finish1', materialId: 'mat_reboco', thickness: 0.02, wraps: false }] })).toBeNull();
    expect(columnTypeIssue({ ...arq, camadas: [{ function: 'finish1', materialId: '', thickness: 0.02, wraps: false }] })).not.toBeNull();
  });

  it('pilar: disciplina do tipo, altura sem topo, parede só no arquitetônico', () => {
    expect(columnIssue(pilar(), est)).toBeNull();
    expect(columnIssue(pilar(), arq)).not.toBeNull();
    expect(columnIssue(pilar({ height: -1 }), est)).not.toBeNull();
    expect(columnIssue(pilar({ topLevelId: 'lv_1', height: null }), est)).toBeNull();
    expect(columnIssue(pilar({ hostWallId: 'w' }), est)).not.toBeNull();
    expect(columnIssue(pilar({ disciplina: 'arquitetonico', hostWallId: 'w' }), arq)).toBeNull();
  });

  it('viga e fundação: eixo mínimo de 1 mm e campos de cada modo', () => {
    expect(beamIssue(viga())).toBeNull();
    expect(beamIssue(viga({ b: { x: 0.001, y: 0 } }))).toBeNull();
    expect(beamIssue(viga({ b: { x: 0.0009, y: 0 } }))).not.toBeNull();
    expect(footingIssue(sap(), DEFAULT_FOOTING_TYPES.sap_80x80x30!)).toBeNull();
    expect(footingIssue(sap({ hostWallId: 'w' }), DEFAULT_FOOTING_TYPES.sap_80x80x30!)).not.toBeNull();
    expect(footingIssue(sap(), DEFAULT_FOOTING_TYPES.bal_40x30!)).not.toBeNull();
  });

  it('referências do projeto: material, nível e parede hospedeira', () => {
    const p = createEmptyProject();
    expect(materiaisIssue(p, ['mat_concreto', 'mat_aco'])).toBeNull();
    expect(materiaisIssue(p, ['mat_concreto', 'nao'])).not.toBeNull();
    expect(nivelIssue(p, 'lv_0')).toBeNull();
    expect(nivelIssue(p, 'nao')).toContain('nao');
    expect(hospedeiroIssue(p, undefined)).toBeNull();
    expect(hospedeiroIssue(p, 'nao')).not.toBeNull();
  });
});
