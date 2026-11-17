import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { makeTerrain, makeTerrainRegion } from './terrain.ts';
import { camposDoPapel, neutralizarCamposNaoUsados, normalizarEdicaoRegiao, PADROES_PAPEL_REGIAO } from './terrainPapel.ts';
import { terrainRegionIssue } from './validateTerrain.ts';
import type { TerrainRegion } from './terrainTypes.ts';

const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }];

/** Região de plataforma com plano (cota 8, 2 %, direção 1 rad) e taludes 0. Os valores são literais. */
const plataforma: TerrainRegion = {
  id: 'tr1', kind: 'terrainRegion', levelId: 'lv_0', name: 'R', terrenoId: 'tn1', contorno: tri, papel: 'plataforma',
  cota: 8, inclinacao: 0.02, direcao: 1, taludeCorte: 0, taludeAterro: 0, permeavel: false, order: 0,
};
/** A mesma região como subdivisão de origem: plano em 0, taludes em 0, permeável. */
const subdivisao: TerrainRegion = { ...plataforma, papel: 'subdivisao', cota: 0, inclinacao: 0, direcao: 0, permeavel: true };
/** Região nivelada com os padrões da predefinição (taludes 1,5 e 2) e cota 8. */
const nivelada: TerrainRegion = { ...plataforma, papel: 'nivelada', taludeCorte: 1.5, taludeAterro: 2 };

describe('campos com efeito por papel', () => {
  it('plano e talude só valem nos papéis de plano; subdivisão não usa nenhum dos dois', () => {
    expect(camposDoPapel('subdivisao')).toEqual({ plano: false, talude: false });
    expect(camposDoPapel('plataforma')).toEqual({ plano: true, talude: true });
    expect(camposDoPapel('nivelada')).toEqual({ plano: true, talude: true });
  });

  it('padrões de cada papel (A.6): subdivisão 0/0 permeável; plataforma 0/0; nivelada 1,5 e 2', () => {
    expect(PADROES_PAPEL_REGIAO.subdivisao).toEqual({ taludeCorte: 0, taludeAterro: 0, permeavel: true });
    expect(PADROES_PAPEL_REGIAO.plataforma).toEqual({ taludeCorte: 0, taludeAterro: 0, permeavel: false });
    expect(PADROES_PAPEL_REGIAO.nivelada).toEqual({ taludeCorte: 1.5, taludeAterro: 2, permeavel: false });
  });
});

describe('neutralizarCamposNaoUsados', () => {
  it('subdivisão zera cota, inclinação, direção e taludes e mantém o resto', () => {
    const r = neutralizarCamposNaoUsados({ ...subdivisao, cota: 8, inclinacao: 0.1, direcao: 1, taludeCorte: 3, taludeAterro: 4 });
    expect(r).toMatchObject({ papel: 'subdivisao', cota: 0, inclinacao: 0, direcao: 0, taludeCorte: 0, taludeAterro: 0, permeavel: true, name: 'R' });
  });

  it('plataforma e nivelada não mudam (mesmo objeto)', () => {
    expect(neutralizarCamposNaoUsados(plataforma)).toBe(plataforma);
    expect(neutralizarCamposNaoUsados(nivelada)).toBe(nivelada);
  });
});

describe('normalizarEdicaoRegiao: troca de papel', () => {
  it('subdivisão -> nivelada: entra no plano em 0 e recebe os taludes 1,5 e 2 da predefinição; permeável vira falso', () => {
    const r = normalizarEdicaoRegiao(subdivisao, { papel: 'nivelada' });
    expect(r).toMatchObject({ papel: 'nivelada', cota: 0, inclinacao: 0, direcao: 0, taludeCorte: 1.5, taludeAterro: 2, permeavel: false });
  });

  it('plataforma -> nivelada: mantém cota, inclinação e direção; troca os taludes pelos da nivelada', () => {
    const r = normalizarEdicaoRegiao(plataforma, { papel: 'nivelada' });
    expect(r).toMatchObject({ papel: 'nivelada', cota: 8, inclinacao: 0.02, direcao: 1, taludeCorte: 1.5, taludeAterro: 2, permeavel: false });
  });

  it('nivelada -> subdivisão: some com plano e taludes e volta a permeável', () => {
    const r = normalizarEdicaoRegiao(nivelada, { papel: 'subdivisao' });
    expect(r).toMatchObject({ papel: 'subdivisao', cota: 0, inclinacao: 0, direcao: 0, taludeCorte: 0, taludeAterro: 0, permeavel: true });
  });

  it('o valor digitado no mesmo patch vence o padrão do papel novo', () => {
    const r = normalizarEdicaoRegiao(plataforma, { papel: 'nivelada', taludeCorte: 1 });
    expect([r.taludeCorte, r.taludeAterro]).toEqual([1, 2]);
  });
});

describe('normalizarEdicaoRegiao: edição sem troca de papel', () => {
  it('subdivisão: talude digitado não é gravado e o nome muda', () => {
    const r = normalizarEdicaoRegiao(subdivisao, { taludeCorte: 3, permeavel: false, name: 'Sub' });
    expect(r).toMatchObject({ papel: 'subdivisao', taludeCorte: 0, taludeAterro: 0, permeavel: false, name: 'Sub' });
  });

  it('plataforma: patch de cota passa sem alteração de talude', () => {
    const r = normalizarEdicaoRegiao(plataforma, { cota: 9 });
    expect(r).toMatchObject({ papel: 'plataforma', cota: 9, taludeCorte: 0, taludeAterro: 0, permeavel: false });
  });
});

describe('comandos de região aplicam a regra do papel', () => {
  const tn = makeTerrain({ id: 'tn1', levelId: 'lv_0', pontos: [0, 0, 1, 10, 0, 2, 5, 8, 3] });

  it('addTerrainRegion de subdivisão com plano e talude grava só o permeável e o contorno', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: tn });
    s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, papel: 'subdivisao', cota: 8, inclinacao: 0.1, taludeCorte: 3 }) });
    expect(s.project.elements.tr1).toMatchObject({ papel: 'subdivisao', cota: 0, inclinacao: 0, direcao: 0, taludeCorte: 0, taludeAterro: 0, permeavel: true });
  });

  it('updateTerrainRegion: subdivisão -> plataforma -> nivelada, e desfazer volta à subdivisão', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: tn });
    s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, papel: 'subdivisao' }) });
    s.exec({ type: 'updateTerrainRegion', id: 'tr1', patch: { papel: 'plataforma', cota: 5 } });
    expect(s.project.elements.tr1).toMatchObject({ papel: 'plataforma', cota: 5, inclinacao: 0, direcao: 0, taludeCorte: 0, taludeAterro: 0, permeavel: false });
    s.exec({ type: 'updateTerrainRegion', id: 'tr1', patch: { papel: 'nivelada' } });
    expect(s.project.elements.tr1).toMatchObject({ papel: 'nivelada', cota: 5, taludeCorte: 1.5, taludeAterro: 2, permeavel: false });
    s.undo();
    s.undo();
    expect(s.project.elements.tr1).toMatchObject({ papel: 'subdivisao', cota: 0, permeavel: true });
  });

  it('modelo antigo com subdivisão e cota continua válido na leitura (sem endurecer a validação)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: tn });
    const antigo = { ...makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', contorno: tri, papel: 'subdivisao' }), cota: 8, taludeCorte: 3, order: 0 } as TerrainRegion;
    expect(terrainRegionIssue(antigo, s.project)).toBeNull();
  });
});
