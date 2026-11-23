import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import {
  criarDisciplina,
  definirApresentacaoDaCategoria,
  definirApresentacaoDaDisciplina,
  definirOpacidadeDasReferencias,
  definirOrigemDaCategoria,
  excluirDisciplina,
  linhasDaMatriz,
  linhasSimples,
  restaurarPerfil,
} from './disciplineConfig.ts';

const projeto = (): ProjectStore => new ProjectStore(createEmptyProject());

const normal = { tone: 'normal' as const, clareamento: 0, opacidade: 1 };
const oculto = { tone: 'hidden' as const, clareamento: 0, opacidade: 1 };

describe('linhasDaMatriz', () => {
  it('devolve uma linha por categoria, com a origem efetiva e as apresentações literais de Estrutura', () => {
    const s = projeto();
    const linhas = linhasDaMatriz(s.project, 'estrutura');
    expect(linhas).toHaveLength(23);
    expect(new Set(linhas.map((l) => l.categoria)).size).toBe(23);
    const porCategoria = new Map(linhas.map((l) => [l.categoria, l]));
    expect(porCategoria.get('wall')).toEqual({
      categoria: 'wall',
      origem: 'arquitetura',
      apresentacao: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 },
      predefinida: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 },
    });
    expect(porCategoria.get('column')).toEqual({ categoria: 'column', origem: 'estrutura', apresentacao: normal, predefinida: normal });
    expect(porCategoria.get('plumbingFixture')).toEqual({
      categoria: 'plumbingFixture',
      origem: 'hidrossanitario',
      apresentacao: oculto,
      predefinida: oculto,
    });
  });
});

describe('linhasSimples', () => {
  it('resume as outras disciplinas de Estrutura: Arquitetura referência 20/50, Hidro/Elétrico/HVAC ocultos', () => {
    const s = projeto();
    expect(linhasSimples(s.project, 'estrutura')).toEqual([
      { disciplina: 'arquitetura', estado: 'halftone', clareamento: 0.2, opacidade: 0.5 },
      { disciplina: 'hidrossanitario', estado: 'hidden', clareamento: 0, opacidade: 1 },
      { disciplina: 'eletrico', estado: 'hidden', clareamento: 0, opacidade: 1 },
      { disciplina: 'hvac', estado: 'hidden', clareamento: 0, opacidade: 1 },
    ]);
  });
});

describe('apresentação da categoria', () => {
  it('grava tom, clareamento e opacidade; desfaz e refaz', () => {
    const s = projeto();
    expect(definirApresentacaoDaCategoria(s, 'estrutura', 'wall', { tone: 'halftone', clareamento: 0.4, opacidade: 0.3 })).toEqual({ ok: true, error: null });
    expect(s.project.disciplineProfiles).toEqual({ estrutura: { wall: { tone: 'halftone', clareamento: 0.4, opacidade: 0.3 } } });
    expect(linhasDaMatriz(s.project, 'estrutura').find((l) => l.categoria === 'wall')!.apresentacao).toEqual({
      tone: 'halftone',
      clareamento: 0.4,
      opacidade: 0.3,
    });

    s.undo();
    expect(s.project.disciplineProfiles).toBeUndefined();
    s.redo();
    expect(s.project.disciplineProfiles).toEqual({ estrutura: { wall: { tone: 'halftone', clareamento: 0.4, opacidade: 0.3 } } });
  });

  it('restaurarPerfil limpa o perfil inteiro num passo; desfazer devolve as duas categorias', () => {
    const s = projeto();
    definirApresentacaoDaCategoria(s, 'arquitetura', 'wall', oculto);
    definirApresentacaoDaCategoria(s, 'arquitetura', 'door', { tone: 'halftone', clareamento: 0.5, opacidade: 1 });
    expect(s.project.disciplineProfiles).toEqual({
      arquitetura: {
        wall: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        door: { tone: 'halftone', clareamento: 0.5, opacidade: 1 },
      },
    });
    expect(restaurarPerfil(s, 'arquitetura')).toEqual({ ok: true, error: null });
    expect(s.project.disciplineProfiles).toBeUndefined();

    s.undo();
    expect(s.project.disciplineProfiles).toEqual({
      arquitetura: {
        wall: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        door: { tone: 'halftone', clareamento: 0.5, opacidade: 1 },
      },
    });
  });
});

describe('apresentação da disciplina inteira', () => {
  it('aplica a todas as categorias da alvo no perfil de trabalho, preservando as demais e um passo de desfazer', () => {
    const s = projeto();
    definirApresentacaoDaCategoria(s, 'estrutura', 'column', normal);
    expect(definirApresentacaoDaDisciplina(s, 'arquitetura', oculto, 'estrutura')).toEqual({ ok: true, error: null });
    expect(s.project.disciplineProfiles).toEqual({
      estrutura: {
        wall: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        door: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        window: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        floor: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        roof: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        stair: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        railing: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        mass: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        site: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        lot: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        room: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        ceiling: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        ramp: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        component: { tone: 'hidden', clareamento: 0, opacidade: 1 },
        column: { tone: 'normal', clareamento: 0, opacidade: 1 },
      },
    });
    expect(linhasSimples(s.project, 'estrutura')[0]).toEqual({ disciplina: 'arquitetura', estado: 'hidden', clareamento: 0, opacidade: 1 });

    s.undo();
    expect(s.project.disciplineProfiles).toEqual({ estrutura: { column: { tone: 'normal', clareamento: 0, opacidade: 1 } } });
  });

  it('sem a disciplina de trabalho, grava no perfil da própria alvo', () => {
    const s = projeto();
    expect(definirApresentacaoDaDisciplina(s, 'hidrossanitario', oculto)).toEqual({ ok: true, error: null });
    expect(s.project.disciplineProfiles).toEqual({ hidrossanitario: { plumbingFixture: { tone: 'hidden', clareamento: 0, opacidade: 1 } } });
  });
});

describe('slider global das referências', () => {
  it('muda a opacidade de todas as referências de Estrutura num comando e desfaz', () => {
    const s = projeto();
    expect(definirOpacidadeDasReferencias(s, 'estrutura', 0.3)).toEqual({ ok: true, error: null });
    const perfil = s.project.disciplineProfiles!.estrutura!;
    expect(Object.keys(perfil)).toHaveLength(14);
    expect(perfil.wall).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.3 });
    expect(perfil.component).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.3 });
    expect(Object.values(perfil).every((v) => typeof v === 'object' && v.tone === 'halftone' && v.opacidade === 0.3)).toBe(true);
    expect(linhasSimples(s.project, 'estrutura')[0]).toEqual({ disciplina: 'arquitetura', estado: 'halftone', clareamento: 0.2, opacidade: 0.3 });

    s.undo();
    expect(s.project.disciplineProfiles).toBeUndefined();
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
