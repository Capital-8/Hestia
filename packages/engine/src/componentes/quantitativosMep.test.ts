import { applyCommand as aplicar, BIBLIOTECA_MEP, createEmptyProject, type Command, type Component, type Familia, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { DENSIDADE_ACO_KG_M3, quantitativosMepDoProjeto } from './quantitativosMep.ts';

/*
 * Quantitativos MEP e estruturais (ficha E3). Os dois casos numéricos do CONTRATO/ficha: 3 trechos DN50 e um perfil I N5.
 */

const aplicarCopia = (p: Project, c: Command): Project => {
  const q = structuredClone(p);
  aplicar(q, c);
  return q;
};

/** Tubo de água fria PVC (DN 25 a 110, tipos `dnNN`), da biblioteca MEP. */
const FAMILIA_TUBO: Familia = (() => {
  const f = BIBLIOTECA_MEP.find((x) => x.id === 'fam_tubo_agua_fria');
  if (f === undefined) throw new Error('fam_tubo_agua_fria ausente da biblioteca MEP');
  return f;
})();

/** Família de perfil I N5 (área 3080 mm²): mesa 100 × 10, alma 6, altura 200, comprimento `L` (mm). */
const FAMILIA_PERFIL_I: Familia = (() => {
  const f = structuredClone(FAMILIA_TUBO);
  f.id = 'fam_perfil_i_n5';
  f.nome = 'Perfil I N5';
  f.categoria = 'perfil_estrutural';
  f.corpos = [{
    id: 'viga',
    nome: 'Viga',
    papel: 'perfil',
    forma: { tipo: 'extrusao', perfil: { tipo: 'perfilI', largura: '100', altura: '200', almaEsp: '6', mesaEsp: '10' }, comprimento: 'L' },
    quadro: { origem: ['0', '0', '0'] },
  }];
  return f;
})();

const projetoBase = (): Project => {
  let p = createEmptyProject('t');
  p = aplicarCopia(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_TUBO) });
  return aplicarCopia(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_PERFIL_I) });
};

const addComp = (p: Project, id: string, familyId: string, typeId: string | null, values: Record<string, number>): Project =>
  aplicarCopia(p, {
    type: 'addComponent',
    component: {
      id, kind: 'component', familyId, typeId, levelId: p.levels[0]!.id,
      x: 1, y: 1, z: 0, rotation: 0, mirrored: false, mark: id, values,
    } as Component,
  });

describe('quantitativosMepDoProjeto', () => {
  it('projeto sem componentes: listas vazias', () => {
    const q = quantitativosMepDoProjeto(projetoBase());
    expect(q.tubulacao).toEqual([]);
    expect(q.perfisEstruturais).toEqual([]);
  });

  it('três trechos de DN50 (1 m, 2 m, 0,5 m) somam 3,5 m no mesmo DN', () => {
    let p = projetoBase();
    p = addComp(p, 't1', 'fam_tubo_agua_fria', 'dn50', { L: 1000 });
    p = addComp(p, 't2', 'fam_tubo_agua_fria', 'dn50', { L: 2000 });
    p = addComp(p, 't3', 'fam_tubo_agua_fria', 'dn50', { L: 500 });
    const q = quantitativosMepDoProjeto(p);
    expect(q.tubulacao).toHaveLength(1);
    expect(q.tubulacao[0]!.dn).toBe(50);
    expect(q.tubulacao[0]!.trechos).toBe(3);
    expect(q.tubulacao[0]!.comprimentoM).toBeCloseTo(3.5, 9);
  });

  it('perfil I de N5 com 2 m tem massa 48,356 kg (3080e-6 × 2 × 7850)', () => {
    let p = projetoBase();
    p = addComp(p, 'v1', 'fam_perfil_i_n5', null, { L: 2000 });
    const q = quantitativosMepDoProjeto(p);
    expect(DENSIDADE_ACO_KG_M3).toBe(7850);
    expect(q.perfisEstruturais).toHaveLength(1);
    expect(q.perfisEstruturais[0]!.quantidade).toBe(1);
    expect(q.perfisEstruturais[0]!.comprimentoM).toBeCloseTo(2, 9);
    expect(q.perfisEstruturais[0]!.massaKg).toBeCloseTo(48.356, 3);
  });
});
