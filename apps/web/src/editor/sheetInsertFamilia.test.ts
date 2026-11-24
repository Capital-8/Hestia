import { describe, expect, it } from 'vitest';
import { createEmptyProject, FAMILIA_FORMATO, FAMILIA_VERSAO, ProjectStore, type Familia } from '@hestia/model';
import { viewportPartsCached } from '@hestia/render';
import { instanciaParaDetalhe, inserirDetalheDeFamilia } from './sheetInsert.ts';

/* Inserção do detalhe de uma instância de família na prancha (D6b): cria a prancha, usa a escala do detalhe e acompanha a instância. */

const familia: Familia = {
  formato: FAMILIA_FORMATO, versao: FAMILIA_VERSAO, id: 'caixa', nome: 'Caixa', categoria: 'marcenaria', unidade: 'mm', hospedagem: 'nivel', origem: 'canto',
  parametros: [
    { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 1000 },
    { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: 600 },
    { id: 'A', nome: 'Altura', tipo: 'comprimento', escopo: 'instancia', padrao: 800 },
  ],
  planos: [{ id: 'x0', nome: 'E', eixo: 'x', posicao: '0' }, { id: 'x1', nome: 'D', eixo: 'x', posicao: 'L' }],
  pecas: [{ id: 'b', nome: 'B', papel: 'lateral', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'A', material: 'm' }],
  aninhados: [], ferragens: [], ligacoes: [], simbolos: [],
  detalhes: [{ id: 'pl', nome: 'Planta', vista: 'planta', escala: 20, cotas: [{ id: 'cL', de: { tipo: 'plano', id: 'x0' }, ate: { tipo: 'plano', id: 'x1' }, parametro: 'L' }] }],
  tipos: [],
};

function loja(): ProjectStore {
  const s = new ProjectStore(createEmptyProject('t'));
  s.exec({ type: 'upsertFamily', family: familia });
  s.exec({ type: 'addComponent', component: { id: 'c1', kind: 'component', familyId: 'caixa', typeId: null, levelId: s.project.levels[0]!.id, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: 'c1' } });
  return s;
}

describe('inserirDetalheDeFamilia (D6b)', () => {
  it('cria a prancha, usa a escala do detalhe e atualiza ao mudar a instância', () => {
    const s = loja();
    expect(instanciaParaDetalhe(s.project, 'caixa', null)).toBe('c1');
    expect(instanciaParaDetalhe(s.project, 'outra', null)).toBeNull();
    const id = inserirDetalheDeFamilia(s, 'c1', 'pl');
    const vp = s.project.sheets![0]!.viewports.find((v) => v.id === id)!;
    expect(vp.scale).toBe(20);
    expect(vp.view).toEqual({ kind: 'familyDetail', componentId: 'c1', detailId: 'pl' });
    const antes = viewportPartsCached(s.project, vp, 'pt').parts.texts.map((t) => t.text);
    expect(antes).toContain('1000');
    s.exec({ type: 'updateComponent', id: 'c1', patch: { values: { L: 1400 } } });
    const depois = viewportPartsCached(s.project, vp, 'pt').parts.texts.map((t) => t.text);
    expect(depois).toContain('1400');
  });

  it('instância inexistente lança erro (o painel mostra o aviso)', () => {
    expect(() => inserirDetalheDeFamilia(loja(), 'nada', 'pl')).toThrow();
  });
});
