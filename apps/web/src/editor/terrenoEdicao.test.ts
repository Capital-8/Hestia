import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno, projetoTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import type { ToolId } from '@hestia/tools';
import { entrarEdicaoTerreno, entrarPorDuploClique, ligarSincroniaDaEdicao, sairEdicaoTerreno, terrenoDoElemento, terrenoEmEdicao, terrenoNoDuploClique } from './terrenoEdicao.ts';
import { useUi } from './state.ts';

const trocar = (id: ToolId): void => useUi.setState({ tool: id });
const projeto = (nome: 'T3' | 'T5' = 'T5') => projetoTerreno(nome);

beforeEach(() => useUi.setState({ tool: 'select', terrenoEdicao: null, selection: [] }));
afterEach(() => useUi.setState({ tool: 'select', terrenoEdicao: null, selection: [] }));

describe('estado do modo Editar terreno', () => {
  it('começa desligado', () => {
    expect(useUi.getState().terrenoEdicao).toBeNull();
    expect(terrenoEmEdicao(useUi.getState())).toBeNull();
  });

  it('entrar guarda o terreno, o seleciona e ativa a ferramenta; sair limpa e volta à seleção', () => {
    const p = projeto();
    expect(entrarEdicaoTerreno(p, 'tn_t5', trocar)).toBe(true);
    const ui = useUi.getState();
    expect(ui.terrenoEdicao).toEqual({ terrenoId: 'tn_t5' });
    expect(ui.selection).toEqual(['tn_t5']);
    expect(ui.tool).toBe('terrainEdit');
    expect(terrenoEmEdicao(ui)).toBe('tn_t5');
    sairEdicaoTerreno(trocar);
    expect(useUi.getState().terrenoEdicao).toBeNull();
    expect(useUi.getState().tool).toBe('select');
    expect(terrenoEmEdicao(useUi.getState())).toBeNull();
  });

  it('a região leva ao terreno dela; elemento que não é terreno não entra e nada muda', () => {
    const p = projeto();
    expect(terrenoDoElemento(p, 'rg_t5')).toBe('tn_t5');
    expect(entrarEdicaoTerreno(p, 'rg_t5', trocar)).toBe(true);
    expect(useUi.getState().terrenoEdicao).toEqual({ terrenoId: 'tn_t5' });
    sairEdicaoTerreno(trocar);
    expect(entrarEdicaoTerreno(p, 'nao_existe', trocar)).toBe(false);
    expect(entrarEdicaoTerreno(createEmptyProject(), 'lv_0', trocar)).toBe(false);
    expect(useUi.getState().terrenoEdicao).toBeNull();
    expect(useUi.getState().tool).toBe('select');
    expect(terrenoDoElemento(p, null)).toBeNull();
  });

  it('sincronia: trocar para outra ferramenta limpa o campo; a ferramenta de edição mantém', () => {
    const desliga = ligarSincroniaDaEdicao();
    try {
      entrarEdicaoTerreno(projeto(), 'tn_t5', trocar);
      expect(useUi.getState().terrenoEdicao).not.toBeNull();
      trocar('wall');
      expect(useUi.getState().terrenoEdicao).toBeNull();
    } finally {
      desliga();
    }
  });
});

describe('duplo clique no terreno entra no modo', () => {
  it('pela borda (ou curva, ou contorno de região); o interior não conta', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T3');
    expect(terrenoNoDuploClique(s.project, 'lv_0', { x: 10, y: 0.03 }, 0.1)).toBe('tn_t3');
    expect(terrenoNoDuploClique(s.project, 'lv_0', { x: 10, y: 10 }, 0.1)).toBeNull();
    expect(entrarPorDuploClique(s.project, 'lv_0', { x: 10, y: 10 }, 0.1, trocar)).toBe(false);
    expect(useUi.getState().tool).toBe('select');
    expect(entrarPorDuploClique(s.project, 'lv_0', { x: 0.02, y: 10 }, 0.1, trocar)).toBe(true);
    expect(useUi.getState().terrenoEdicao).toEqual({ terrenoId: 'tn_t3' });
    expect(useUi.getState().tool).toBe('terrainEdit');
  });

  it('no contorno da região entra no modo do terreno dela; terreno oculto ou de outro nível não entra', () => {
    const p = projeto();
    expect(entrarPorDuploClique(p, 'lv_0', { x: 10, y: 5.03 }, 0.1, trocar)).toBe(true);
    expect(useUi.getState().terrenoEdicao).toEqual({ terrenoId: 'tn_t5' });
    sairEdicaoTerreno(trocar);
    expect(terrenoNoDuploClique(p, 'lv_0', { x: 10, y: 5.03 }, 0.1, new Set(['rg_t5']))).toBeNull();
    expect(terrenoNoDuploClique(p, 'lv_9', { x: 10, y: 5.03 }, 0.1)).toBeNull();
  });
});
