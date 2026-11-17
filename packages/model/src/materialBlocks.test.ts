import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIALS, SCHEMA_VERSION, createEmptyProject, materialEfetivo, migrateProject, normalizarMaterial, type Material } from './index.ts';

/** Material base: o primeiro padrão (sem blocos), com cor/hachura/brilho/opacidade fixados para o teste. */
const base = (extra: Partial<Material> = {}): Material => ({
  ...DEFAULT_MATERIALS[0]!,
  id: 'mat_teste',
  color: '#336699',
  hatch: 'diagonal',
  gloss: 0.2,
  opacity: 0.6,
  ...extra,
});

/** Material com valores fora do contrato (arquivo corrompido ou editado à mão). */
const sujo = (extra: Record<string, unknown>): Material => ({ ...DEFAULT_MATERIALS[0]!, id: 'mat_teste', ...extra }) as unknown as Material;

describe('materialEfetivo (sem blocos = comportamento antigo)', () => {
  it('devolve fundo sólido com color, primeiro plano com hatch e cor indefinida, e aparência com color/opacity/gloss', () => {
    const e = materialEfetivo(base());
    expect(e.superficie.planoDeFundo).toEqual({ padrao: 'solid', cor: '#336699' });
    expect(e.corte.planoDeFundo).toEqual({ padrao: 'solid', cor: '#336699' });
    expect(e.superficie.primeiroPlano.padrao).toBe('diagonal');
    expect(e.superficie.primeiroPlano.cor).toBeUndefined();
    expect(e.corte.primeiroPlano.padrao).toBe('diagonal');
    expect(e.corte.primeiroPlano.cor).toBeUndefined();
    expect(e.sombreamento.cor).toBe('#336699');
    expect(e.sombreamento.usarAparenciaRender).toBe(false);
    expect(e.sombreamento.transparencia).toBeCloseTo(0.4, 9);
    expect(e.aparencia.cor).toBe('#336699');
    expect(e.aparencia.rugosidade).toBeCloseTo(1 - 0.2 * 0.75, 9);
    expect(e.aparencia.opacidade).toBe(0.6);
    expect(e.aparencia.metal).toBe(0);
    expect(e.aparencia.textura).toBeUndefined();
  });
});

describe('materialEfetivo (graficos.corte e graficos.superficie)', () => {
  it('sobrescreve só o campo definido em corte.primeiroPlano', () => {
    const e = materialEfetivo(base({ graficos: { corte: { primeiroPlano: { padrao: 'cross' } } } }));
    expect(e.corte.primeiroPlano).toEqual({ padrao: 'cross', cor: undefined });
    expect(e.corte.planoDeFundo).toEqual({ padrao: 'solid', cor: '#336699' });
    expect(e.superficie.primeiroPlano).toEqual({ padrao: 'diagonal', cor: undefined });
    expect(e.superficie.planoDeFundo).toEqual({ padrao: 'solid', cor: '#336699' });
  });

  it('sobrescreve só a cor do plano de fundo do corte e a cor do primeiro plano da superfície', () => {
    const e = materialEfetivo(base({ graficos: { corte: { planoDeFundo: { cor: '#ffffff' } }, superficie: { primeiroPlano: { cor: '#00ff00' } } } }));
    expect(e.corte.planoDeFundo).toEqual({ padrao: 'solid', cor: '#ffffff' });
    expect(e.corte.primeiroPlano).toEqual({ padrao: 'diagonal', cor: undefined });
    expect(e.superficie.primeiroPlano).toEqual({ padrao: 'diagonal', cor: '#00ff00' });
    expect(e.superficie.planoDeFundo).toEqual({ padrao: 'solid', cor: '#336699' });
  });

  it('sobrescreve só o padrão do plano de fundo da superfície', () => {
    const e = materialEfetivo(base({ graficos: { superficie: { planoDeFundo: { padrao: 'dots' } } } }));
    expect(e.superficie.planoDeFundo).toEqual({ padrao: 'dots', cor: '#336699' });
    expect(e.superficie.primeiroPlano).toEqual({ padrao: 'diagonal', cor: undefined });
    expect(e.corte.planoDeFundo).toEqual({ padrao: 'solid', cor: '#336699' });
  });

  it('sombreamento.cor e transparencia sobrescrevem só esses campos', () => {
    const e = materialEfetivo(base({ graficos: { sombreamento: { cor: '#000000' } } }));
    expect(e.sombreamento.cor).toBe('#000000');
    expect(e.sombreamento.transparencia).toBeCloseTo(0.4, 9);
    const t = materialEfetivo(base({ graficos: { sombreamento: { transparencia: 0.9 } } }));
    expect(t.sombreamento.transparencia).toBeCloseTo(0.9, 9);
    expect(t.sombreamento.cor).toBe('#336699');
  });
});

describe('materialEfetivo (usarAparenciaRender)', () => {
  it('com usarAparenciaRender, o sombreamento segue a aparência (cor e opacidade)', () => {
    const e = materialEfetivo(base({ color: '#111111', opacity: 1, aparencia: { cor: '#222222', opacidade: 0.5 }, graficos: { sombreamento: { usarAparenciaRender: true } } }));
    expect(e.sombreamento.usarAparenciaRender).toBe(true);
    expect(e.sombreamento.cor).toBe('#222222');
    expect(e.sombreamento.transparencia).toBeCloseTo(0.5, 9);
  });

  it('sem usarAparenciaRender, o sombreamento ignora a aparência e usa color/opacity', () => {
    const e = materialEfetivo(base({ color: '#111111', opacity: 1, aparencia: { cor: '#222222', opacidade: 0.5 } }));
    expect(e.sombreamento.usarAparenciaRender).toBe(false);
    expect(e.sombreamento.cor).toBe('#111111');
    expect(e.sombreamento.transparencia).toBe(0);
  });
});

describe('materialEfetivo (valores inválidos caem na reserva)', () => {
  it('cor inválida e número NaN voltam ao valor de reserva', () => {
    const e = materialEfetivo(
      base({
        aparencia: { cor: 'vermelho', rugosidade: NaN },
        graficos: { corte: { planoDeFundo: { cor: '#fff' } }, superficie: { primeiroPlano: { cor: '#12345' } }, sombreamento: { cor: 'azul' } },
      }),
    );
    expect(e.aparencia.cor).toBe('#336699');
    expect(e.aparencia.rugosidade).toBeCloseTo(1 - 0.2 * 0.75, 9);
    expect(e.corte.planoDeFundo.cor).toBe('#336699');
    expect(e.superficie.primeiroPlano.cor).toBeUndefined();
    expect(e.sombreamento.cor).toBe('#336699');
  });
});

describe('normalizarMaterial', () => {
  it('sem blocos devolve a mesma referência', () => {
    const m = base();
    expect(normalizarMaterial(m)).toBe(m);
  });

  it('descarta cor inválida, hachura inválida e números NaN, sem rejeitar o material', () => {
    const n = normalizarMaterial(
      sujo({
        graficos: {
          corte: { primeiroPlano: { padrao: 'zigzag', cor: '#12' } },
          superficie: { planoDeFundo: { padrao: 'diagonal', cor: 'vermelho' } },
          sombreamento: { cor: 'azul', transparencia: NaN, usarAparenciaRender: 'sim' },
        },
        aparencia: { cor: 'azul', rugosidade: NaN, metal: 'x', opacidade: 0.5, textura: { imagemId: 'img', escalaMetros: 0, rotacao: 0, deslocamento: [0, 0], repetir: true } },
        fisico: { densidade: NaN, condutividade: 0.8 },
        termico: { emissividade: Infinity },
      }),
    );
    expect(n.graficos).toEqual({ superficie: { planoDeFundo: { padrao: 'diagonal' } } });
    expect(n.aparencia).toEqual({ opacidade: 0.5 });
    expect(n.fisico).toEqual({ condutividade: 0.8 });
    expect(n.termico).toBeUndefined();
    expect(n.name).toBe(DEFAULT_MATERIALS[0]!.name);
  });

  it('descarta identidade com campos de tipo errado e mantém as palavras-chave válidas', () => {
    const n = normalizarMaterial(sujo({ identidade: { fabricante: 42, palavrasChave: ['a', 3, 'b'] } }));
    expect(n.identidade).toEqual({ palavrasChave: ['a', 'b'] });
  });

  it('mantém valores válidos sem alterar nada', () => {
    const m = base({
      identidade: { descricao: 'Tinta acrílica', fabricante: 'X', palavrasChave: ['tinta', 'parede'] },
      graficos: {
        corte: { primeiroPlano: { padrao: 'cross', cor: '#abcdef' }, planoDeFundo: { cor: '#ffffff' } },
        sombreamento: { transparencia: 0.4, usarAparenciaRender: true },
      },
      aparencia: { cor: '#123456', rugosidade: 0.3, metal: 1, opacidade: 0.8 },
      termico: { condutividadeTermica: 1.2 },
    });
    expect(normalizarMaterial(m)).toEqual(m);
  });
});

describe('migrateProject com material de blocos inválidos', () => {
  it('normaliza o material na carga e não muda SCHEMA_VERSION', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as { schemaVersion: number; materials: Record<string, Record<string, unknown>> };
    raw.materials.mat_tinta = {
      ...raw.materials.mat_tinta,
      graficos: { corte: { primeiroPlano: { padrao: 'zigzag' } }, sombreamento: { transparencia: 'x' } },
      aparencia: { rugosidade: 'alta', cor: 'azul' },
    };
    raw.materials.mat_gesso = { ...raw.materials.mat_gesso, graficos: { corte: { primeiroPlano: { padrao: 'cross' } } } };

    expect(SCHEMA_VERSION).toBe(28);
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(28);
    expect(p.materials.mat_tinta!.graficos).toBeUndefined();
    expect(p.materials.mat_tinta!.aparencia).toBeUndefined();
    expect(p.materials.mat_gesso!.graficos).toEqual({ corte: { primeiroPlano: { padrao: 'cross' } } });
  });
});
