import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from './index.ts';

/*
 * Disciplina editável na vista (decisão 0060, adendo 3, fase 2): a planta PADRÃO do nível e a vista 3D.
 * Valores de referência LITERAIS; um comando = um passo de desfazer.
 */

const LV0 = 'lv_0';

describe('setLevelDiscipline (planta padrão do nível)', () => {
  it('grava a disciplina, desfaz e refaz num passo', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(s.project.levels[0]!.discipline).toBeUndefined();
    s.exec({ type: 'setLevelDiscipline', levelId: LV0, discipline: 'estrutura' });
    expect(s.project.levels[0]!.discipline).toBe('estrutura');
    s.undo();
    expect(s.project.levels[0]!.discipline).toBeUndefined();
    s.redo();
    expect(s.project.levels[0]!.discipline).toBe('estrutura');
  });

  it('undefined limpa o campo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setLevelDiscipline', levelId: LV0, discipline: 'hidrossanitario' });
    s.exec({ type: 'setLevelDiscipline', levelId: LV0, discipline: undefined });
    expect(s.project.levels[0]!.discipline).toBeUndefined();
  });

  it('aceita disciplina declarada no projeto', () => {
    const p = createEmptyProject();
    p.disciplines = [{ id: 'paisagismo', name: 'Paisagismo' }];
    const s = new ProjectStore(p);
    s.exec({ type: 'setLevelDiscipline', levelId: LV0, discipline: 'paisagismo' });
    expect(s.project.levels[0]!.discipline).toBe('paisagismo');
  });

  it('recusa disciplina inválida e nível inexistente sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setLevelDiscipline', levelId: LV0, discipline: 'estrutura' });
    const antes = JSON.stringify(s.project);
    expect(() => s.exec({ type: 'setLevelDiscipline', levelId: LV0, discipline: ' ' })).toThrow('Disciplina desconhecida');
    expect(JSON.stringify(s.project)).toBe(antes);
    expect(() => s.exec({ type: 'setLevelDiscipline', levelId: 'lv_x', discipline: 'estrutura' })).toThrow('Nível inexistente');
    expect(JSON.stringify(s.project)).toBe(antes);
  });
});

describe('setView3dDiscipline (vista 3D)', () => {
  it('grava a disciplina, desfaz e refaz num passo', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(s.project.view3d).toBeUndefined();
    s.exec({ type: 'setView3dDiscipline', discipline: 'eletrico' });
    expect(s.project.view3d).toEqual({ discipline: 'eletrico' });
    s.undo();
    expect(s.project.view3d).toBeUndefined();
    s.redo();
    expect(s.project.view3d).toEqual({ discipline: 'eletrico' });
  });

  it('undefined limpa só a disciplina e preserva o resto da vista 3D', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setView3D', patch: { shadows: false } });
    s.exec({ type: 'setView3dDiscipline', discipline: 'hvac' });
    expect(s.project.view3d!.discipline).toBe('hvac');
    s.exec({ type: 'setView3dDiscipline', discipline: undefined });
    expect('discipline' in s.project.view3d!).toBe(false);
    expect(s.project.view3d!.shadows).toBe(false);
  });

  it('recusa disciplina inválida sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setView3dDiscipline', discipline: 'arquitetura' });
    const antes = JSON.stringify(s.project);
    expect(() => s.exec({ type: 'setView3dDiscipline', discipline: ' ' })).toThrow('Disciplina desconhecida');
    expect(JSON.stringify(s.project)).toBe(antes);
  });
});
