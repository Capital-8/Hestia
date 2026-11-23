import { describe, expect, it } from 'vitest';
import {
  FAMILIA_ARMARIO,
  ProjectStore,
  createEmptyProject,
  makeView3DView,
  perfilDaDisciplina,
  view3dOf,
  type Familia,
  type Project,
} from './index.ts';

/** Store com a disciplina do projeto `seguranca` criada por comando (id e nome literais). */
function comDisciplina(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addProjectDiscipline', discipline: { id: 'seguranca', name: 'Segurança' } });
  return s;
}

const familiaCom = (id: string, disciplina: string): Familia => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.id = id;
  f.disciplina = disciplina;
  return f;
};

describe('setDisciplineProfile (perfil por disciplina)', () => {
  it('grava o perfil, lê com perfilDaDisciplina, desfaz e refaz', () => {
    const s = comDisciplina();
    s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: { wall: 'hidden', door: 'halftone' } });
    expect(s.project.disciplineProfiles).toEqual({ seguranca: { wall: 'hidden', door: 'halftone' } });
    expect(perfilDaDisciplina(s.project, 'seguranca')).toEqual({
      wall: { tone: 'hidden', clareamento: 0, opacidade: 1 },
      door: { tone: 'halftone', clareamento: 0.5, opacidade: 1 },
    });

    s.undo();
    expect(s.project.disciplineProfiles).toBeUndefined();
    expect(perfilDaDisciplina(s.project, 'seguranca')).toEqual({});

    s.redo();
    expect(perfilDaDisciplina(s.project, 'seguranca')).toEqual({
      wall: { tone: 'hidden', clareamento: 0, opacidade: 1 },
      door: { tone: 'halftone', clareamento: 0.5, opacidade: 1 },
    });
  });

  it('perfil vazio e null removem a disciplina de disciplineProfiles', () => {
    const s = comDisciplina();
    s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: { wall: 'hidden' } });
    s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: {} });
    expect(s.project.disciplineProfiles).toBeUndefined();

    s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: { slab: 'normal' } });
    expect(s.project.disciplineProfiles).toEqual({ seguranca: { slab: 'normal' } });
    s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: null });
    expect(s.project.disciplineProfiles).toBeUndefined();
  });

  it('categoria ou tom inválido é recusado e não altera o projeto', () => {
    const s = comDisciplina();
    const antes = s.project;
    expect(() => s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: { inventada: 'hidden' } as never })).toThrow();
    expect(s.project).toBe(antes);
    expect(() => s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: { wall: 'apagado' } as never })).toThrow();
    expect(s.project).toBe(antes);
    expect(() => s.exec({ type: 'setDisciplineProfile', discipline: 'nao_existe', tones: { wall: 'hidden' } })).toThrow();
    expect(s.project).toBe(antes);
    expect(s.project.disciplineProfiles).toBeUndefined();
  });
});

describe('setCategoryDiscipline (remapeamento da categoria)', () => {
  it('grava, undefined remove (e o mapa vazio sai do projeto), disciplina desconhecida recusa', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setCategoryDiscipline', category: 'wall', discipline: 'estrutura' });
    expect(s.project.categoryDiscipline).toEqual({ wall: 'estrutura' });

    s.exec({ type: 'setCategoryDiscipline', category: 'wall' });
    expect(s.project.categoryDiscipline).toBeUndefined();

    const antes = s.project;
    expect(() => s.exec({ type: 'setCategoryDiscipline', category: 'wall', discipline: 'nao_existe' })).toThrow();
    expect(s.project).toBe(antes);
  });
});

describe('addProjectDiscipline (disciplina do projeto)', () => {
  it('cria com nome aparado e cor; duplicado, embutida e id vazio recusam', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addProjectDiscipline', discipline: { id: 'seguranca', name: '  Segurança  ', color: ' #ff0000 ' } });
    expect(s.project.disciplines).toEqual([{ id: 'seguranca', name: 'Segurança', color: '#ff0000' }]);

    expect(() => s.exec({ type: 'addProjectDiscipline', discipline: { id: 'seguranca', name: 'Outra' } })).toThrow();
    expect(() => s.exec({ type: 'addProjectDiscipline', discipline: { id: 'estrutura', name: 'Estrutura' } })).toThrow();
    expect(() => s.exec({ type: 'addProjectDiscipline', discipline: { id: '', name: 'Vazia' } })).toThrow();
    expect(() => s.exec({ type: 'addProjectDiscipline', discipline: { id: 'sem_nome', name: '   ' } })).toThrow();
    expect(s.project.disciplines).toEqual([{ id: 'seguranca', name: 'Segurança', color: '#ff0000' }]);
  });
});

describe('updateProjectDiscipline (editar disciplina do projeto)', () => {
  it('renomeia e muda a cor; embutida recusa e nome vazio recusa', () => {
    const s = comDisciplina();
    s.exec({ type: 'updateProjectDiscipline', id: 'seguranca', name: '  Proteção  ', color: '#00ff00' });
    expect(s.project.disciplines).toEqual([{ id: 'seguranca', name: 'Proteção', color: '#00ff00' }]);

    const antes = s.project;
    expect(() => s.exec({ type: 'updateProjectDiscipline', id: 'estrutura', name: 'Tragwerk' })).toThrow();
    expect(s.project).toBe(antes);
    expect(() => s.exec({ type: 'updateProjectDiscipline', id: 'seguranca', name: '   ' })).toThrow();
    expect(s.project).toBe(antes);
  });
});

describe('removeProjectDiscipline (excluir disciplina do projeto)', () => {
  function projetoComTudo(): Project {
    const p = createEmptyProject();
    p.disciplines = [{ id: 'seguranca', name: 'Segurança' }];
    p.disciplineProfiles = { seguranca: { wall: 'hidden' } };
    p.categoryDiscipline = { wall: 'seguranca', door: 'estrutura' };
    p.planViews = [{ id: 'pv_seg', levelId: 'lv_0', discipline: 'seguranca', name: 'Térreo - Segurança' }];
    p.levels[0]!.discipline = 'seguranca';
    p.view3d = { ...view3dOf(p), discipline: 'seguranca' };
    p.view3dViews = [
      { ...makeView3DView(p, { id: 'v3d_seg', name: '3D Seg' }), discipline: 'seguranca', tones: { seguranca: 'hidden', arquitetura: 'normal' } },
    ];
    p.componentFamilies = {
      fam_seg: familiaCom('fam_seg', 'seguranca'),
      fam_hid: familiaCom('fam_hid', 'hidrossanitario'),
    };
    return p;
  }

  it('limpa perfil, remapeamento, planta, nível, 3D e família; desfazer restaura tudo', () => {
    const s = new ProjectStore(projetoComTudo());
    s.exec({ type: 'removeProjectDiscipline', id: 'seguranca' });

    expect(s.project.disciplines).toBeUndefined();
    expect(s.project.disciplineProfiles).toBeUndefined();
    expect(s.project.categoryDiscipline).toEqual({ door: 'estrutura' });
    expect(s.project.planViews).toEqual([{ id: 'pv_seg', levelId: 'lv_0', discipline: 'arquitetura', name: 'Térreo - Segurança' }]);
    expect(s.project.levels[0]!.discipline).toBeUndefined();
    expect(s.project.view3d?.discipline).toBeUndefined();
    expect(s.project.view3dViews?.[0]?.discipline).toBeUndefined();
    expect(s.project.view3dViews?.[0]?.tones).toEqual({ arquitetura: 'normal' });
    expect(s.project.componentFamilies?.fam_seg?.disciplina).toBe('arquitetura');
    expect(s.project.componentFamilies?.fam_hid?.disciplina).toBe('hidrossanitario');

    s.undo();
    expect(s.project.disciplines).toEqual([{ id: 'seguranca', name: 'Segurança' }]);
    expect(s.project.disciplineProfiles).toEqual({ seguranca: { wall: 'hidden' } });
    expect(s.project.categoryDiscipline).toEqual({ wall: 'seguranca', door: 'estrutura' });
    expect(s.project.planViews).toEqual([{ id: 'pv_seg', levelId: 'lv_0', discipline: 'seguranca', name: 'Térreo - Segurança' }]);
    expect(s.project.levels[0]!.discipline).toBe('seguranca');
    expect(s.project.view3d?.discipline).toBe('seguranca');
    expect(s.project.view3dViews?.[0]?.discipline).toBe('seguranca');
    expect(s.project.view3dViews?.[0]?.tones).toEqual({ seguranca: 'hidden', arquitetura: 'normal' });
    expect(s.project.componentFamilies?.fam_seg?.disciplina).toBe('seguranca');
    expect(s.project.componentFamilies?.fam_hid?.disciplina).toBe('hidrossanitario');
  });

  it('embutida recusa', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'removeProjectDiscipline', id: 'estrutura' })).toThrow();
  });

  it('duas alterações em comandos separados são dois passos de desfazer', () => {
    const s = comDisciplina();
    s.exec({ type: 'setDisciplineProfile', discipline: 'seguranca', tones: { wall: 'hidden' } });
    s.exec({ type: 'setCategoryDiscipline', category: 'wall', discipline: 'seguranca' });

    s.undo();
    expect(s.project.categoryDiscipline).toBeUndefined();
    expect(s.project.disciplineProfiles).toEqual({ seguranca: { wall: 'hidden' } });
    expect(s.project.disciplines).toEqual([{ id: 'seguranca', name: 'Segurança' }]);

    s.undo();
    expect(s.project.disciplineProfiles).toBeUndefined();
    expect(s.project.disciplines).toEqual([{ id: 'seguranca', name: 'Segurança' }]);

    s.undo();
    expect(s.project.disciplines).toBeUndefined();
  });
});
