import { describe, expect, it } from 'vitest';
import {
  disciplinaDaCategoria,
  disciplinaExiste,
  disciplinasDoProjeto,
  perfilDaDisciplina,
  planOf,
  tomDaCategoria,
  type Project,
  type Tone,
} from './index.ts';

/*
 * Perfis por disciplina (decisão 0060, adendo 3, decisões 1, 3, 4 e 6): disciplinas do projeto, remapeamento de
 * categoria, perfil e a função única de tom. Valores de referência LITERAIS, escritos à mão a partir da ficha, nunca
 * calculados pelo código testado. Projeto mínimo por leitura, como os outros testes do pacote.
 */

const projeto = (campos: Partial<Project> = {}): Project => ({ levels: [], ...campos }) as Project;

describe('tomDaCategoria sem perfil: predefinido da disciplina de trabalho', () => {
  it('estrutura: parede em meio-tom, pilar normal, peça hidráulica oculta', () => {
    const p = projeto();
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'wall')).toBe('halftone');
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'column')).toBe('normal');
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'plumbingFixture')).toBe('hidden');
  });
});

describe('perfil da disciplina vence o predefinido', () => {
  it('wall desviado para hidden; column continua normal', () => {
    const p = projeto({ disciplineProfiles: { estrutura: { wall: 'hidden' } } });
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'wall')).toBe('hidden');
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'column')).toBe('normal');
  });

  it('tom inválido no perfil é ignorado', () => {
    const p = projeto({ disciplineProfiles: { estrutura: { wall: 'x' as unknown as Tone } } });
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'wall')).toBe('halftone');
  });

  it('categoria desconhecida no perfil é ignorada e não lança', () => {
    const p = projeto({ disciplineProfiles: { estrutura: { inexistente: 'hidden' } as never } });
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'wall')).toBe('halftone');
    expect(perfilDaDisciplina(p, 'estrutura')).toEqual({});
  });
});

describe('exceção da vista vence o perfil', () => {
  it('tones da planta para a disciplina do elemento vale mesmo com perfil contrário', () => {
    const p = projeto({ disciplineProfiles: { estrutura: { wall: 'hidden' } } });
    const plan = { discipline: 'estrutura', tones: { arquitetura: 'normal' as Tone } };
    expect(tomDaCategoria(p, plan, 'wall', 'arquitetura')).toBe('normal');
  });
});

describe('disciplina criada pelo usuário', () => {
  it('sem perfil cai no predefinido (outra disciplina = halftone)', () => {
    const p = projeto({ disciplines: [{ id: 'paisagismo', name: 'Paisagismo' }] });
    expect(tomDaCategoria(p, { discipline: 'paisagismo' }, 'wall')).toBe('halftone');
  });

  it('com perfil próprio, o tom desviado vence', () => {
    const p = projeto({
      disciplines: [{ id: 'paisagismo', name: 'Paisagismo' }],
      disciplineProfiles: { paisagismo: { wall: 'normal' } },
    });
    expect(tomDaCategoria(p, { discipline: 'paisagismo' }, 'wall')).toBe('normal');
  });
});

describe('remapeamento da disciplina de origem da categoria', () => {
  it('wall remapeada para eletrico: halftone na planta de arquitetura e normal na de elétrico', () => {
    const p = projeto({ categoryDiscipline: { wall: 'eletrico' } });
    expect(disciplinaDaCategoria(p, 'wall')).toBe('eletrico');
    expect(tomDaCategoria(p, { discipline: 'arquitetura' }, 'wall')).toBe('halftone');
    expect(tomDaCategoria(p, { discipline: 'eletrico' }, 'wall')).toBe('normal');
  });
});

describe('categoria geral nunca recebe tom', () => {
  it('a anotação continua normal mesmo com perfil de arquitetura', () => {
    const p = projeto({ disciplineProfiles: { arquitetura: { annotation: 'hidden' } } });
    expect(tomDaCategoria(p, undefined, 'annotation')).toBe('normal');
  });
});

describe('disciplinasDoProjeto e disciplinaExiste', () => {
  it('devolve as cinco embutidas e as do projeto válidas, ignorando repetida, vazia e com espaço', () => {
    const p = projeto({
      disciplines: [
        { id: 'paisagismo', name: 'Paisagismo' },
        { id: 'estrutura', name: 'Estrutura', color: '#ff0000' },
        { id: '', name: 'Vazia' },
        { id: ' espaco', name: 'Com espaço' },
        { id: 'paisagismo', name: 'Repetida' },
      ],
    });
    const lista = disciplinasDoProjeto(p);
    expect(lista.map((d) => d.id)).toEqual(['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac', 'paisagismo']);
    expect(lista[0]).toEqual({ id: 'arquitetura', name: 'arquitetura' });
    expect(lista.at(-1)).toEqual({ id: 'paisagismo', name: 'Paisagismo' });
    expect(disciplinaExiste(p, 'paisagismo')).toBe(true);
    expect(disciplinaExiste(p, 'estrutura')).toBe(true);
    expect(disciplinaExiste(p, 'inexistente')).toBe(false);
    expect(disciplinaExiste(p, ' ')).toBe(false);
  });
});

describe('planOf usa a disciplina do nível na planta padrão', () => {
  it('nível com discipline estrutura devolve estrutura; sem campo ou inválida volta a arquitetura', () => {
    const p = {
      levels: [
        { id: 'lv_est', name: 'Térreo', discipline: 'estrutura' },
        { id: 'lv_espaco', name: 'Pavimento 2', discipline: ' ' },
        { id: 'lv_sem', name: 'Pavimento 3' },
      ],
    } as unknown as Project;
    expect(planOf(p, 'lv_est').discipline).toBe('estrutura');
    expect(planOf(p, 'lv_espaco').discipline).toBe('arquitetura');
    expect(planOf(p, 'lv_sem').discipline).toBe('arquitetura');
  });
});
