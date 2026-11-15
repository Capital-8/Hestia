import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVISO_TN, projetoTerreno, servicoTerreno, type MedidaAvisoTN } from '@hestia/engine';
import { createEmptyProject } from '@hestia/model';
import { editor } from './controller.ts';
import { goToIssue } from './goToIssue.ts';
import { useUi } from './state.ts';
import { avisosGeometriaTerreno } from './useIssues.ts';

const medida = (m: Partial<MedidaAvisoTN>): MedidaAvisoTN => ({ terrenoId: 'tn_t5', codigo: AVISO_TN.semTriangulos, regiaoId: null, outraRegiaoId: null, indice: null, medido: 0.5, limite: 1, x: 1, y: 2, z: 3, ...m });

/** Kernel simulado: pronto e devolvendo estas medidas. */
const comKernel = (medidas: MedidaAvisoTN[] | null) => {
  vi.spyOn(servicoTerreno(), 'pronto').mockReturnValue(true);
  vi.spyOn(servicoTerreno(), 'avisos').mockReturnValue(medidas);
};

afterEach(() => vi.restoreAllMocks());

describe('avisos do terreno no painel', () => {
  it('sem terreno no projeto não há aviso', () => {
    expect(avisosGeometriaTerreno(createEmptyProject(), 'pt')).toEqual([]);
  });

  it('sem o kernel pronto aparece terreno-sem-kernel, apontando para o terreno', () => {
    const a = avisosGeometriaTerreno(projetoTerreno('T5'), 'pt');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ code: 'terreno-sem-kernel', elementId: 'tn_t5' });
  });

  it('kernel que recusa os dados vira terreno-invalido', () => {
    comKernel(null);
    expect(avisosGeometriaTerreno(projetoTerreno('T5'), 'en')[0]).toMatchObject({ code: 'terreno-invalido' });
  });

  it('os seis avisos do kernel chegam ao painel, os de região apontando para a região', () => {
    comKernel([
      medida({ codigo: AVISO_TN.cotasDiferentes, indice: 0 }),
      medida({ codigo: AVISO_TN.linhaCruza, indice: 1 }),
      medida({ codigo: AVISO_TN.regioesSobrepostas, regiaoId: 'rg_t5', outraRegiaoId: 'rg_t5' }),
      medida({ codigo: AVISO_TN.precisaoReduzida, regiaoId: 'rg_t5' }),
      medida({ codigo: AVISO_TN.semTriangulos }),
      medida({ codigo: AVISO_TN.regiaoFora, regiaoId: 'rg_t5' }),
    ]);
    const a = avisosGeometriaTerreno(projetoTerreno('T5'), 'pt');
    expect(a.map((x) => x.code)).toEqual([
      'terreno-pontos-coincidentes', 'terreno-linha-cruza', 'terreno-regioes-sobrepostas', 'terreno-precisao-reduzida', 'terreno-sem-triangulos', 'terreno-regiao-fora',
    ]);
    expect(a.every((x) => x.severity === 'warning' && x.message.length > 0)).toBe(true);
    expect(a.map((x) => x.elementId)).toEqual(['tn_t5', 'tn_t5', 'rg_t5', 'rg_t5', 'tn_t5', 'rg_t5']);
  });
});

describe('Ir para do aviso do terreno', () => {
  it('seleciona o terreno e enquadra a caixa dele na planta', () => {
    editor.load(projetoTerreno('T5'), 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', selection: [] });
    editor.ensureViewport(800, 600);
    const antes = editor.viewport()!;
    goToIssue({ severity: 'warning', code: 'terreno-sem-triangulos', message: 'x', elementId: 'tn_t5', ids: ['tn_t5'] });
    expect(useUi.getState().selection).toEqual(['tn_t5']);
    expect(useUi.getState().status).not.toMatchObject({ key: 'edc_element_gone' });
    const depois = editor.viewport()!;
    expect(depois).not.toEqual(antes);
    // A região também é alvo.
    goToIssue({ severity: 'warning', code: 'terreno-regiao-fora', message: 'x', elementId: 'rg_t5', ids: ['rg_t5'] });
    expect(useUi.getState().selection).toEqual(['rg_t5']);
  });
});
