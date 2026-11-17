import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projetoTerreno, projetoTerrenos } from '@hestia/engine';
import { TerrainEditTool, TerrainTool, type Tool, type ToolId } from '@hestia/tools';
import { useUi } from '../editor/state.ts';
import { ativarTopografia, editarTerreno, editorDeTerreno, terrenoParaEditar, topografiaAtiva } from './terrainActions.ts';

beforeEach(() => useUi.setState({ tool: 'select', terrenoEdicao: null, selection: [] }));
afterEach(() => useUi.setState({ tool: 'select', terrenoEdicao: null, selection: [] }));

/** Ferramenta de mentira que passa por `instanceof`, sem precisar do ambiente de ferramentas. */
const falsa = <T extends Tool>(proto: object, extra: Record<string, unknown>): T => Object.assign(Object.create(proto) as T, extra);

describe('ativarTopografia', () => {
  it('liga a ferramenta terrain e escolhe o modo', () => {
    const definirModo = vi.fn();
    const ativa = falsa<TerrainTool>(TerrainTool.prototype, { definirModo });
    const setTool = vi.fn<(id: ToolId) => void>();
    expect(ativarTopografia('curvas', { setTool, activeTool: ativa })).toBe(true);
    expect(setTool).toHaveBeenCalledWith('terrain');
    expect(definirModo).toHaveBeenCalledWith('curvas');
  });

  it('se a ferramenta não ficou ativa (vista que não aceita), não escolhe modo', () => {
    const setTool = vi.fn<(id: ToolId) => void>();
    expect(ativarTopografia('pontos', { setTool, activeTool: falsa<Tool>({}, {}) })).toBe(false);
  });
});

describe('Editar terreno', () => {
  it('escolhe o terreno da seleção, da região selecionada ou o único do nível', () => {
    const p = projetoTerreno('T5');
    expect(terrenoParaEditar(p, ['tn_t5'], 'lv_0')).toBe('tn_t5');
    expect(terrenoParaEditar(p, ['rg_t5'], 'lv_0')).toBe('tn_t5');
    expect(terrenoParaEditar(p, [], 'lv_0')).toBe('tn_t5');
    expect(terrenoParaEditar(p, [], 'outro')).toBeNull();
    expect(terrenoParaEditar(projetoTerrenos(), [], 'lv_0')).toBeNull();
  });

  it('entra no modo de edição do terreno escolhido', () => {
    const setTool = vi.fn<(id: ToolId) => void>((id) => useUi.setState({ tool: id }));
    expect(editarTerreno(projetoTerreno('T5'), ['tn_t5'], 'lv_0', setTool)).toBe(true);
    expect(setTool).toHaveBeenCalledWith('terrainEdit');
    expect(useUi.getState().terrenoEdicao).toEqual({ terrenoId: 'tn_t5' });
  });

  it('sem terreno a escolher liga a ferramenta mesmo assim (ela avisa) e devolve falso', () => {
    const setTool = vi.fn<(id: ToolId) => void>();
    expect(editarTerreno(projetoTerrenos(), [], 'lv_0', setTool)).toBe(false);
    expect(setTool).toHaveBeenCalledWith('terrainEdit');
    expect(useUi.getState().terrenoEdicao).toBeNull();
  });
});

describe('acessos às ferramentas ativas', () => {
  it('só devolve a ferramenta do tipo certo', () => {
    const topo = falsa<TerrainTool>(TerrainTool.prototype, {});
    const edit = falsa<TerrainEditTool>(TerrainEditTool.prototype, {});
    expect(topografiaAtiva({ activeTool: topo })).toBe(topo);
    expect(topografiaAtiva({ activeTool: edit })).toBeNull();
    expect(editorDeTerreno({ activeTool: edit })).toBe(edit);
    expect(editorDeTerreno({ activeTool: topo })).toBeNull();
  });
});
