import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { adicionarFixtureTerreno, idRegiaoFixture, idTerrenoFixture, projetoTerreno } from './fixtureTerreno.ts';
import { PASSO_ID_TERRENO } from './kernelTerreno.ts';
import { CODIGOS_AVISO_TERRENO, decodificarAvisosTN, terrenoAvisosDeGeometria, terrenoAvisosInvalido, terrenoAvisosSemKernel, type MedidaAvisoTN } from './terrenoIssues.ts';

const AUSENTE = 0xffffffff;
const medida = (m: Partial<MedidaAvisoTN>): MedidaAvisoTN => ({ terrenoId: idTerrenoFixture('T5'), codigo: 5, regiaoId: null, outraRegiaoId: null, indice: null, medido: 0, limite: 0, x: 0, y: 0, z: 0, ...m });

describe('avisos do terreno', () => {
  it('há os dois avisos do TS e os seis do kernel', () => {
    expect(CODIGOS_AVISO_TERRENO).toHaveLength(8);
  });

  it('terreno-sem-kernel: um por terreno, em pt e en, apontando para o terreno', () => {
    const p = projetoTerreno('T5');
    const pt = terrenoAvisosSemKernel(p);
    expect(pt).toHaveLength(1);
    expect(pt[0]).toMatchObject({ code: 'terreno-sem-kernel', severity: 'warning', elementId: idTerrenoFixture('T5') });
    expect(pt[0]!.message).toContain('T5');
    expect(pt[0]!.message).toContain('kernel');
    expect(terrenoAvisosSemKernel(p, 'en')[0]!.message).toContain('Terrain T5');
    expect(terrenoAvisosSemKernel(createEmptyProject())).toEqual([]);
  });

  it('terreno-invalido leva o detalhe do erro', () => {
    const a = terrenoAvisosInvalido(projetoTerreno('T1'), 'ENTRADA', 'en');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ code: 'terreno-invalido' });
    expect(a[0]!.message).toContain('ENTRADA');
  });

  it('decodifica as colunas: posição do vértice, região e a outra região do aviso 3', () => {
    const num = 2;
    const m = decodificarAvisosTN(
      [num, 2, AUSENTE, num * PASSO_ID_TERRENO + 7, num, 3, 4, 9, num, 6, 4, AUSENTE, 9, 5, AUSENTE, AUSENTE],
      [0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      (n) => (n === num ? 'tn_b' : undefined),
      (n) => (n === 4 ? 'rg_a' : n === 9 ? 'rg_b' : undefined),
    );
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ terrenoId: 'tn_b', codigo: 2, indice: 7, regiaoId: null, x: 1, y: 2, z: 3 });
    expect(m[1]).toMatchObject({ codigo: 3, regiaoId: 'rg_a', outraRegiaoId: 'rg_b', indice: null });
    expect(m[2]).toMatchObject({ codigo: 6, regiaoId: 'rg_a', medido: 0.5 });
  });

  it('textos dos seis avisos do kernel, com a região como alvo do "Ir para" e número pela unidade do projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    const rg = idRegiaoFixture('T5');
    const avisos = terrenoAvisosDeGeometria(
      s.project,
      [
        medida({ codigo: 1, medido: 0.5, limite: 0.001 }),
        medida({ codigo: 2, x: 2.5, y: 3 }),
        medida({ codigo: 3, regiaoId: rg, outraRegiaoId: rg }),
        medida({ codigo: 4, regiaoId: rg, medido: 0.5, limite: 0.25 }),
        medida({ codigo: 5 }),
        medida({ codigo: 6, regiaoId: rg, medido: 0.25 }),
      ],
      'pt',
    );
    expect(avisos.map((a) => a.code)).toEqual(['terreno-pontos-coincidentes', 'terreno-linha-cruza', 'terreno-regioes-sobrepostas', 'terreno-precisao-reduzida', 'terreno-sem-triangulos', 'terreno-regiao-fora']);
    expect(avisos.map((a) => a.elementId)).toEqual([idTerrenoFixture('T5'), idTerrenoFixture('T5'), rg, rg, idTerrenoFixture('T5'), rg]);
    expect(avisos[0]!.message).toMatch(/0[.,]5/);
    expect(avisos[2]!.message).toContain('Plataforma');
    expect(avisos[5]!.message).toContain('25');
    expect(terrenoAvisosDeGeometria(s.project, [medida({ codigo: 5 })], 'en')[0]!.message).toContain('not enough points');
  });

  it('avisos iguais são agrupados com a contagem; sem medidas (kernel desligado) não há avisos de geometria', () => {
    const p = projetoTerreno('T5');
    const dois = terrenoAvisosDeGeometria(p, [medida({ codigo: 5 }), medida({ codigo: 5 })], 'pt');
    expect(dois).toHaveLength(1);
    expect(dois[0]!.message).toContain('2 ocorrências');
    expect(terrenoAvisosDeGeometria(p, null)).toEqual([]);
    expect(terrenoAvisosDeGeometria(p, [medida({ terrenoId: 'inexistente' })])).toEqual([]);
  });
});
