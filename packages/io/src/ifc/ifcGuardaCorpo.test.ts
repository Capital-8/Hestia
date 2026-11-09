import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeGuardaCorpo, tiposGuardaCorpo, type GuardaCorpo, type Project, type TipoGuardaCorpo } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import { railingKindOf } from './ifcGuardaCorpo.ts';
import type { IfcGeometry, IfcPapelGC, IfcParteGC } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;

/** Malha sintética: uma caixa (8 vértices, 12 triângulos) em `x`, no lugar da malha de `guarda_malha`. */
const caixa = (x: number): IfcParteGC['mesh'] => ({
  positions: [x, 0, 0, x + 0.05, 0, 0, x + 0.05, 0.05, 0, x, 0.05, 0, x, 0, 1, x + 0.05, 0, 1, x + 0.05, 0.05, 1, x, 0.05, 1],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
});

const parte = (papel: IfcPapelGC, x: number, extra: Partial<IfcParteGC> = {}): IfcParteGC => ({ papel, materialId: 'mat_aco', mesh: caixa(x), ...extra });

function projeto(typeId: string, hospedeiro: GuardaCorpo['hospedeiro']): Project {
  const base = createEmptyProject('Teste');
  const tipos = Object.fromEntries(tiposGuardaCorpo('pt').map((t) => [t.id, t]));
  const g = { ...makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId, hospedeiro, mark: 'G-1' }), order: 1 } as GuardaCorpo;
  return { ...base, tiposGuardaCorpo: tipos, elements: { ...base.elements, gc1: g } };
}

const manual: GuardaCorpo['hospedeiro'] = {
  tipo: 'manual',
  uso: 'varanda',
  caminho: [{ x: 0, y: 0, dz: 0 }, { x: 3, y: 0, dz: 0 }],
  fechado: false,
  ladoDeslocamento: 'esquerdo',
};

const geoDe = (partes: IfcParteGC[]): IfcGeometry => ({
  walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [],
  railings: [{ guardaId: 'gc1', partes, comprimentoDesenvolvido: 3 }],
});

const partesCompletas = [
  parte('poste', 0), parte('poste', 3), parte('balaustre', 1, { pecas: 12 }), parte('trilho', 0.5),
  parte('travessa', 0.2), parte('corrimao', 0.3), parte('suporte', 0.4), parte('painel', 1.5, { vidro: true }), parte('cabo', 2),
];

describe('exportIfc: guarda-corpo manual completo', () => {
  const p = projeto('gct_balaustres', manual);
  const text = exportIfc(p, geoDe(partesCompletas), { timestamp: TS });

  it('sai um IFCRAILING pai contido no pavimento, com o PredefinedType pela composição', () => {
    // 1 pai + 2 filhos HANDRAIL (travessa e corrimão).
    expect(count(text, 'IFCRAILING')).toBe(3);
    const pai = text.split('\n').find((l) => l.includes("'G-1'") && l.includes('=IFCRAILING('));
    expect(pai).toBeDefined();
    expect(pai).toMatch(/\.(BALUSTRADE|GUARDRAIL)\.\);$/);
    expect(count(text, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(1);
  });

  it('agrega as partes com a entidade e o enum de cada papel', () => {
    expect(count(text, 'IFCMEMBER')).toBe(6);
    expect(count(text, 'IFCPLATE')).toBe(1);
    const vazio = exportIfc(p, { ...geoDe([]), railings: [] }, { timestamp: TS });
    expect(count(text, 'IFCRELAGGREGATES')).toBe(count(vazio, 'IFCRELAGGREGATES') + 1);
    for (const e of ['.POST.', '.RAIL.', '.CURTAIN_PANEL.', "'BALUSTER'", "'CABLE'", "'HANDRAIL_SUPPORT'", '.HANDRAIL.']) expect(text).toContain(e);
    expect(count(text, 'IFCTRIANGULATEDFACESET')).toBe(9);
  });

  it('o agregado lista as 9 partes', () => {
    const rel = text.split('\n').find((l) => l.includes('railing') === false && l.includes('=IFCRELAGGREGATES(') && l.split(',#').length > 9);
    expect(rel).toBeDefined();
  });

  it('grava Pset_RailingCommon com Height e Diameter, e o pset do Hestia com a norma', () => {
    expect(text).toContain("'Pset_RailingCommon'");
    expect(text).toMatch(/'Height',\$,IFCREAL\(1\.100000\)/);
    expect(text).toContain("'Diameter'");
    expect(text).toContain("'Pset_Hestia_GuardaCorpo'");
    expect(text).toContain("'Hospedeiro',$,IFCLABEL('manual')");
    expect(text).toContain("'Norma'");
    expect(text).toContain("'Qto_RailingBaseQuantities'");
  });

  it('liga o tipo (IFCRAILINGTYPE) e o material de cada parte', () => {
    expect(count(text, 'IFCRAILINGTYPE')).toBe(1);
    expect(text).toContain('IFCRELDEFINESBYTYPE');
    expect(count(text, 'IFCRELASSOCIATESMATERIAL')).toBeGreaterThanOrEqual(10);
  });

  it('é determinístico e sem undefined nem NaN', () => {
    expect(exportIfc(p, geoDe(partesCompletas), { timestamp: TS })).toBe(text);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });
});

describe('exportIfc: guarda-corpo sem malha', () => {
  it('guarda sem geometria no geo não sai; parte de malha vazia é ignorada', () => {
    const p = projeto('gct_balaustres', manual);
    expect(count(exportIfc(p, { ...geoDe([]), railings: [] }, { timestamp: TS }), 'IFCRAILING')).toBe(0);
    const t = exportIfc(p, geoDe([{ papel: 'poste', materialId: 'mat_aco', mesh: { positions: [], indices: [] } }]), { timestamp: TS });
    expect(count(t, 'IFCRAILING')).toBe(1);
    expect(count(t, 'IFCMEMBER')).toBe(0);
  });
});

describe('railingKindOf: PredefinedType pela composição', () => {
  const t = (id: string): TipoGuardaCorpo => tiposGuardaCorpo('pt').find((x) => x.id === id)!;
  it('corrimão de parede é HANDRAIL', () => expect(railingKindOf(t('gct_corrimao_parede'))).toBe('HANDRAIL'));
  it('vidro é GUARDRAIL', () => expect(railingKindOf(t('gct_vidro'))).toBe('GUARDRAIL'));
  it('só balaústres sem corrimão é BALUSTRADE', () => {
    const base = t('gct_balaustres');
    expect(railingKindOf({ ...base, corrimaos: [], ifcPredefinido: null })).toBe('BALUSTRADE');
  });
  it('balaústres com corrimão é GUARDRAIL', () => {
    const base = t('gct_balaustres');
    const rimao = t('gct_corrimao_parede').corrimaos.filter((r) => r.funcao === 'corrimao');
    expect(railingKindOf({ ...base, corrimaos: rimao, ifcPredefinido: null })).toBe('GUARDRAIL');
  });
  it('sem nada é USERDEFINED e o tipo escolhido vence a composição', () => {
    const base = t('gct_balaustres');
    expect(railingKindOf({ ...base, corrimaos: [], preenchimentos: [], ifcPredefinido: null })).toBe('USERDEFINED');
    expect(railingKindOf({ ...base, ifcPredefinido: 'HANDRAIL' })).toBe('HANDRAIL');
  });
});

describe('exportIfc: guarda-corpo hospedado em escada', () => {
  it('liga o guarda-corpo à escada por IFCRELCONNECTSELEMENTS', () => {
    const base = projeto('gct_vidro', {
      tipo: 'escada',
      escadaId: 'st1',
      lados: { esquerdo: { lance: true, patamar: true }, direito: { lance: true, patamar: false } },
      posicaoBase: 'degrau',
    });
    const p: Project = { ...base, elements: { ...base.elements, st1: { id: 'st1', kind: 'stair', typeId: 'x', levelId: 'lv_0' } as never } };
    const geo = geoDe([parte('painel', 1)]);
    geo.stairs = [{ stairId: 'st1', levelId: 'lv_0', spiral: false, riserHeight: 0.18, flights: [], landings: [] }];
    const text = exportIfc(p, geo, { timestamp: TS });
    expect(count(text, 'IFCRELCONNECTSELEMENTS')).toBe(1);
    expect(text).toContain("'HospedeiroId',$,IFCLABEL('st1')");
    expect(text).toContain("IFCLABEL('esquerdo:lance+patamar;direito:lance')");
    expect(text).toContain('.GUARDRAIL.');
  });
});
