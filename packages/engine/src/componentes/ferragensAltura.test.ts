import { BIBLIOTECA_BASE, FAMILIA_ARMARIO, familiaDaBiblioteca, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import type { PecaResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Regra de marcenaria: o número de dobradiças por porta cresce com a altura da porta (até 900 mm → 2; até 1600 → 3;
 * até 2200 → 4; acima → 5). O teste descobre as famílias que têm dobradiça e porta própria, resolve e confere a
 * quantidade a partir da altura das portas resolvidas (sem repetir a fórmula da família).
 */

/** Dobradiças por porta, calculadas a partir da altura já resolvida (mm). */
const dobradicasPorPorta = (alturaMm: number): number =>
  alturaMm <= 900 ? 2 : alturaMm <= 1600 ? 3 : alturaMm <= 2200 ? 4 : 5;

const temDobradica = (f: Familia): boolean => f.ferragens.some((g) => g.id === 'dobradica');
const temPortaPropria = (f: Familia): boolean => f.pecas.some((p) => p.papel === 'porta');
const ehBasculante = (f: Familia): boolean =>
  f.pecas.some((p) => p.papel === 'porta' && p.nome.toLowerCase().includes('basculante'));

const FAMILIAS_DA_REGRA: readonly Familia[] = [...new Map(
  [...BIBLIOTECA_BASE, FAMILIA_ARMARIO].map((f) => [f.id, f]),
).values()].filter((f) => temDobradica(f) && temPortaPropria(f) && !ehBasculante(f));

const portasDe = (pecas: readonly PecaResolvida[]): PecaResolvida[] => pecas.filter((p) => p.papel === 'porta');

/** Altura da porta em mm: extensão no eixo Z (metros) × 1000. */
const alturaDaPorta = (p: PecaResolvida): number => p.extensao[2] * 1000;

const quantidadeDeDobradicas = (f: Familia, entrada: { tipoId?: string; valores?: Record<string, number> }, rotulo: string): void => {
  const r = resolverFamilia(f, { ...entrada, biblioteca: familiaDaBiblioteca });
  expect(r.erros, `${f.id} ${rotulo}`).toEqual([]);
  const esperado = portasDe(r.pecas).reduce((soma, p) => soma + dobradicasPorPorta(alturaDaPorta(p)), 0);
  const dobradica = r.ferragens.find((g) => g.id === 'dobradica');
  expect(dobradica?.quantidade ?? 0, `${f.id} ${rotulo}`).toBe(esperado);
};

describe('dobradiças por altura da porta', () => {
  it('a varredura encontra as famílias alteradas e deixa de fora basculante e sem porta própria', () => {
    const ids = FAMILIAS_DA_REGRA.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([
      'fam_armario_baixo',
      'fam_aereo',
      'fam_base_pia',
      'fam_torre_forno',
      'fam_guarda_roupa_modulo',
      'fam_gabinete_banheiro',
      'fam_armario_lavanderia',
      'fam_rack',
    ]));
    expect(ids).not.toContain('fam_aereo_basculante');
    expect(ids).not.toContain('fam_canto_l');
    expect(ids).not.toContain('fam_cama_bau');
  });

  for (const f of FAMILIAS_DA_REGRA) {
    describe(f.id, () => {
      it('cada tipo segue a regra para a altura das portas resolvidas', () => {
        for (const t of f.tipos) quantidadeDeDobradicas(f, { tipoId: t.id }, `tipo ${t.id}`);
      });

      it('os extremos do parâmetro de altura seguem a regra', () => {
        const altura = f.parametros.find((p) => p.id === 'A');
        if (altura?.min === undefined || altura.max === undefined) return;
        for (const A of [altura.min, altura.max]) {
          quantidadeDeDobradicas(f, { tipoId: f.tipoPadrao, valores: { A } }, `A=${A}`);
        }
      });
    });
  }

  it('o armário A80 (porta de 0,72 m) fica com 2 dobradiças por porta, 4 no total', () => {
    const r = resolverFamilia(FAMILIA_ARMARIO, { tipoId: 'A80', biblioteca: familiaDaBiblioteca });
    expect(r.erros).toEqual([]);
    const portas = portasDe(r.pecas);
    expect(portas).toHaveLength(2);
    for (const porta of portas) expect(dobradicasPorPorta(alturaDaPorta(porta))).toBe(2);
    expect(r.ferragens.find((g) => g.id === 'dobradica')!.quantidade).toBe(4);
  });

  it('porta acima de 1600 mm fica com 4 dobradiças por porta', () => {
    const alta = structuredClone(FAMILIA_ARMARIO);
    const altura = alta.parametros.find((p) => p.id === 'A')!;
    altura.max = 2500;
    const r = resolverFamilia(alta, { tipoId: 'A80', valores: { A: 1900 }, biblioteca: familiaDaBiblioteca });
    expect(r.erros).toEqual([]);
    const portas = portasDe(r.pecas);
    expect(portas).toHaveLength(2);
    for (const porta of portas) {
      const h = alturaDaPorta(porta);
      expect(h).toBeGreaterThan(1600);
      expect(h).toBeLessThanOrEqual(2200);
      expect(dobradicasPorPorta(h)).toBe(4);
    }
    expect(r.ferragens.find((g) => g.id === 'dobradica')!.quantidade).toBe(8);
  });
});
