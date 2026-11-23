import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import {
  criarDisciplina,
  definirOrigemDaCategoria,
  definirTomDaCategoria,
  excluirDisciplina,
  linhasDaMatriz,
  restaurarPerfil,
} from './disciplineConfig.ts';

const projeto = (): ProjectStore => new ProjectStore(createEmptyProject());

describe('linhasDaMatriz', () => {
  it('devolve uma linha por categoria, com a origem efetiva e os tons literais de Estrutura', () => {
    const s = projeto();
    const linhas = linhasDaMatriz(s.project, 'estrutura');
    expect(linhas).toHaveLength(23);
    expect(new Set(linhas.map((l) => l.categoria)).size).toBe(23);
    const porCategoria = new Map(linhas.map((l) => [l.categoria, l]));
    expect(porCategoria.get('wall')).toEqual({ categoria: 'wall', origem: 'arquitetura', tom: 'halftone', predefinido: 'halftone' });
    expect(porCategoria.get('column')).toEqual({ categoria: 'column', origem: 'estrutura', tom: 'normal', predefinido: 'normal' });
    expect(porCategoria.get('plumbingFixture')).toEqual({ categoria: 'plumbingFixture', origem: 'hidrossanitario', tom: 'hidden', predefinido: 'hidden' });
  });
});

describe('perfil da disciplina', () => {
  it('aplicar um tom grava um passo de desfazer; restaurarPerfil desfaz o perfil inteiro', () => {
    const s = projeto();
    expect(definirTomDaCategoria(s, 'arquitetura', 'wall', 'hidden')).toEqual({ ok: true, error: null });
    expect(s.project.disciplineProfiles).toEqual({ arquitetura: { wall: 'hidden' } });
    expect(linhasDaMatriz(s.project, 'arquitetura').find((l) => l.categoria === 'wall')!.tom).toBe('hidden');

    s.undo();
    expect(s.project.disciplineProfiles).toBeUndefined();
    s.redo();
    expect(s.project.disciplineProfiles).toEqual({ arquitetura: { wall: 'hidden' } });

    // A segunda categoria preserva a primeira; restaurar limpa as duas num só passo.
    definirTomDaCategoria(s, 'arquitetura', 'door', 'halftone');
    expect(s.project.disciplineProfiles).toEqual({ arquitetura: { wall: 'hidden', door: 'halftone' } });
    expect(restaurarPerfil(s, 'arquitetura')).toEqual({ ok: true, error: null });
    expect(s.project.disciplineProfiles).toBeUndefined();

    s.undo();
    expect(s.project.disciplineProfiles).toEqual({ arquitetura: { wall: 'hidden', door: 'halftone' } });
  });
});

describe('origem da categoria', () => {
  it('muda o grupo da categoria na matriz e desfaz', () => {
    const s = projeto();
    const parede = (): string => linhasDaMatriz(s.project, 'arquitetura').find((l) => l.categoria === 'wall')!.origem;
    expect(parede()).toBe('arquitetura');
    expect(definirOrigemDaCategoria(s, 'wall', 'estrutura')).toEqual({ ok: true, error: null });
    expect(s.project.categoryDiscipline).toEqual({ wall: 'estrutura' });
    expect(parede()).toBe('estrutura');

    s.undo();
    expect(s.project.categoryDiscipline).toBeUndefined();
    expect(parede()).toBe('arquitetura');
  });
});

describe('gestão das disciplinas do projeto', () => {
  it('criar com nome repetido (ou de embutida) gera id único por slug', () => {
    const s = projeto();
    expect(criarDisciplina(s, 'Segurança', '#ff0000')).toEqual({ ok: true, error: null });
    expect(criarDisciplina(s, 'Segurança')).toEqual({ ok: true, error: null });
    expect(criarDisciplina(s, 'Estrutura')).toEqual({ ok: true, error: null });
    expect(s.project.disciplines).toEqual([
      { id: 'seguranca', name: 'Segurança', color: '#ff0000' },
      { id: 'seguranca_2', name: 'Segurança' },
      { id: 'estrutura_2', name: 'Estrutura' },
    ]);
  });

  it('excluir devolve a planta da disciplina para Arquitetura e desfaz', () => {
    const s = projeto();
    criarDisciplina(s, 'Segurança');
    s.exec({ type: 'addPlanView', plan: { id: 'pv_seg', levelId: 'lv_0', discipline: 'seguranca', name: 'Térreo - Segurança' } });
    expect(excluirDisciplina(s, 'seguranca')).toEqual({ ok: true, error: null });
    expect(s.project.disciplines).toBeUndefined();
    expect(s.project.planViews?.[0]?.discipline).toBe('arquitetura');

    s.undo();
    expect(s.project.disciplines).toEqual([{ id: 'seguranca', name: 'Segurança' }]);
    expect(s.project.planViews?.[0]?.discipline).toBe('seguranca');
  });

  it('recusa (sem lançar) é devolvida como erro e nada é gravado', () => {
    const s = projeto();
    const r = criarDisciplina(s, '   ');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(s.project.disciplines).toBeUndefined();
  });
});
