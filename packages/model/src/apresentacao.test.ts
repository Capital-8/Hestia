import { describe, expect, it } from 'vitest';
import {
  apresentacaoDaCategoria,
  apresentacaoDe,
  perfilDaDisciplina,
  presetApresentacao,
  tomDaCategoria,
  type Project,
} from './index.ts';

/*
 * Apresentação por disciplina (plano de UX das disciplinas, 2026-11-23): tom + clareamento + opacidade. Valores de
 * referência LITERAIS, escritos à mão a partir do plano, nunca calculados pelo código testado.
 */

const projeto = (campos: Partial<Project> = {}): Project => ({ levels: [], ...campos }) as Project;
const normalOpaco = { tone: 'normal', clareamento: 0, opacidade: 1 };

describe('apresentacaoDe normaliza tom, clareamento e opacidade', () => {
  it('textos legados: halftone herda clareamento 0,5; normal e hidden ficam opacos', () => {
    expect(apresentacaoDe('halftone')).toEqual({ tone: 'halftone', clareamento: 0.5, opacidade: 1 });
    expect(apresentacaoDe('normal')).toEqual(normalOpaco);
    expect(apresentacaoDe('hidden')).toEqual({ tone: 'hidden', clareamento: 0, opacidade: 1 });
  });

  it('objeto válido preserva os dois sliders', () => {
    expect(apresentacaoDe({ tone: 'halftone', clareamento: 0.2, opacidade: 0.5 })).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.5 });
  });

  it('objeto válido sem os campos usa o padrão do tom', () => {
    expect(apresentacaoDe({ tone: 'halftone' })).toEqual({ tone: 'halftone', clareamento: 0.5, opacidade: 1 });
    expect(apresentacaoDe({ tone: 'normal' })).toEqual(normalOpaco);
  });

  it('números fora de 0..1 são limitados', () => {
    expect(apresentacaoDe({ tone: 'halftone', clareamento: -2, opacidade: 3 })).toEqual({ tone: 'halftone', clareamento: 0, opacidade: 1 });
    expect(apresentacaoDe({ tone: 'normal', clareamento: 0.4, opacidade: 0.25 })).toEqual({ tone: 'normal', clareamento: 0.4, opacidade: 0.25 });
  });

  it('ausente ou inválido cai em normal opaco sem lançar', () => {
    for (const valor of [undefined, null, 'x', 42, [], { tone: 'x' }, { clareamento: 0.2 }]) {
      expect(() => apresentacaoDe(valor)).not.toThrow();
      expect(apresentacaoDe(valor)).toEqual(normalOpaco);
    }
  });
});

describe('presetApresentacao converte a tabela §4.2', () => {
  it('parede em Estrutura é a referência especial: halftone, clareamento 0,2 e opacidade 0,12', () => {
    expect(presetApresentacao('estrutura', 'arquitetura')).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.12 });
  });

  it('estrutura na planta de Arquitetura é normal opaco', () => {
    expect(presetApresentacao('arquitetura', 'estrutura')).toEqual(normalOpaco);
  });

  it('as demais referências halftone mantêm o visual de hoje (clareamento 0,5 e opaco)', () => {
    expect(presetApresentacao('arquitetura', 'hidrossanitario')).toEqual({ tone: 'halftone', clareamento: 0.5, opacidade: 1 });
    expect(presetApresentacao('estrutura', 'hvac')).toEqual({ tone: 'hidden', clareamento: 0, opacidade: 1 });
    expect(presetApresentacao('paisagismo', 'arquitetura')).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.12 });
  });

  it('a própria disciplina é normal opaco e geral nunca recebe tom', () => {
    expect(presetApresentacao('arquitetura', 'arquitetura')).toEqual(normalOpaco);
    expect(presetApresentacao('paisagismo', 'paisagismo')).toEqual(normalOpaco);
    expect(presetApresentacao('arquitetura', 'geral')).toEqual(normalOpaco);
    expect(presetApresentacao('estrutura', 'geral')).toEqual(normalOpaco);
  });
});

describe('perfilDaDisciplina normaliza em vez de descartar objeto válido', () => {
  it('objeto válido vira objeto com os campos padrão; texto legado é normalizado; inválido é descartado', () => {
    const p = projeto({
      disciplineProfiles: {
        estrutura: {
          wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 },
          slab: 'hidden',
          door: { tone: 'x' } as never,
        },
      },
    });
    expect(perfilDaDisciplina(p, 'estrutura')).toEqual({
      wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 },
      slab: { tone: 'hidden', clareamento: 0, opacidade: 1 },
    });
  });

  it('categoria desconhecida continua descartada', () => {
    const p = projeto({ disciplineProfiles: { estrutura: { inexistente: 'hidden' } as never } });
    expect(perfilDaDisciplina(p, 'estrutura')).toEqual({});
  });
});

describe('apresentacaoDaCategoria: exceção da vista → perfil → predefinido', () => {
  it('sem perfil nem exceção aplica o predefinido (parede em Estrutura com a referência especial)', () => {
    expect(apresentacaoDaCategoria(projeto(), { discipline: 'estrutura' }, 'wall')).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.12 });
  });

  it('o perfil vence o predefinido e preserva clareamento e opacidade', () => {
    const p = projeto({
      disciplineProfiles: { estrutura: { wall: { tone: 'normal', clareamento: 0.3, opacidade: 0.7 } } },
    });
    expect(apresentacaoDaCategoria(p, { discipline: 'estrutura' }, 'wall')).toEqual({ tone: 'normal', clareamento: 0.3, opacidade: 0.7 });
  });

  it('a exceção da vista vence o perfil', () => {
    const p = projeto({ disciplineProfiles: { estrutura: { wall: 'hidden' } } });
    const plan = { discipline: 'estrutura', tones: { arquitetura: { tone: 'halftone' as const, clareamento: 0.1, opacidade: 0.9 } } };
    expect(apresentacaoDaCategoria(p, plan, 'wall', 'arquitetura')).toEqual({ tone: 'halftone', clareamento: 0.1, opacidade: 0.9 });
  });

  it('tomDaCategoria continua devolvendo só o tom', () => {
    const p = projeto({ disciplineProfiles: { estrutura: { wall: { tone: 'hidden', clareamento: 0.2, opacidade: 0.5 } } } });
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'wall')).toBe('hidden');
  });

  it('terreno e lote agora seguem Arquitetura: normal na planta de Arquitetura e referência em Estrutura', () => {
    expect(apresentacaoDaCategoria(projeto(), { discipline: 'arquitetura' }, 'site')).toEqual(normalOpaco);
    expect(apresentacaoDaCategoria(projeto(), { discipline: 'estrutura' }, 'site')).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.12 });
    expect(apresentacaoDaCategoria(projeto(), { discipline: 'estrutura' }, 'lot')).toEqual({ tone: 'halftone', clareamento: 0.2, opacidade: 0.12 });
  });

  it('categoria geral continua normal opaco mesmo com perfil contrário', () => {
    const p = projeto({
      disciplineProfiles: { arquitetura: { annotation: { tone: 'hidden', clareamento: 0.4, opacidade: 0.2 } } },
    });
    expect(apresentacaoDaCategoria(p, { discipline: 'arquitetura' }, 'annotation')).toEqual(normalOpaco);
    expect(tomDaCategoria(p, { discipline: 'arquitetura' }, 'annotation')).toBe('normal');
  });
});
