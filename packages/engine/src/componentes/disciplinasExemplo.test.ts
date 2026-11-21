import {
  BIBLIOTECA_BASE,
  createEmptyProject,
  disciplineOfElement,
  familiaDaBiblioteca,
  validarFamilia,
  type Component,
  type Familia,
} from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { caixaEnvolvente } from './medidas.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Famílias de exemplo por disciplina (ficha 3.4b, adendo 1 do ADR 0060): as oito famílias de hidrossanitário, elétrico
 * e HVAC mais o `fam_ar_split` que ganhou `disciplina: 'hvac'`. Cada família: valida sem problema, traz a disciplina
 * certa (no campo e derivada por `disciplineOfElement` com o fallback da biblioteca base) e cada tipo resolve sem
 * erro, com peças e caixa envolvente LITERAL (metros, calculados à mão: [largura, profundidade, z0 → z1]).
 * A resolução mora aqui no engine (`resolverFamilia`); a validação e a disciplina vêm de `@hestia/model`.
 */

/** Ids das famílias de exemplo e a disciplina LITERAL que cada uma tem de trazer. */
const ESPERADAS: ReadonlyArray<readonly [string, string]> = [
  ['fam_vaso_sanitario', 'hidrossanitario'],
  ['fam_lavatorio', 'hidrossanitario'],
  ['fam_ralo', 'hidrossanitario'],
  ['fam_tomada', 'eletrico'],
  ['fam_interruptor', 'eletrico'],
  ['fam_luminaria_teto', 'eletrico'],
  ['fam_quadro_distribuicao', 'eletrico'],
  ['fam_difusor_teto', 'hvac'],
];

/** [id, tipo (undefined = tipo padrão), x0, y0, z0, x1, y1, z1] em metros, de mão. */
const CAIXAS: ReadonlyArray<readonly [string, string | undefined, number, number, number, number, number, number]> = [
  ['fam_vaso_sanitario', undefined, 0, 0, 0, 0.36, 0.7, 0.4],
  ['fam_vaso_sanitario', 'compacto', 0, 0, 0, 0.34, 0.65, 0.38],
  ['fam_vaso_sanitario', 'conforto', 0, 0, 0, 0.4, 0.75, 0.42],
  ['fam_lavatorio', undefined, 0, 0, 0.85, 0.5, 0.4, 1.0],
  ['fam_lavatorio', 'lav60', 0, 0, 0.85, 0.6, 0.45, 1.01],
  ['fam_lavatorio', 'lav45', 0, 0, 0.8, 0.45, 0.35, 0.94],
  ['fam_ralo', undefined, 0, 0, 0, 0.1, 0.1, 0.02],
  ['fam_ralo', 'ralo150', 0, 0, 0, 0.15, 0.15, 0.02],
  ['fam_ralo', 'ralo100baixo', 0, 0, 0, 0.1, 0.1, 0.015],
  ['fam_tomada', undefined, 0, 0, 0.3, 0.08, 0.05, 0.38],
  ['fam_tomada', 'media1200', 0, 0, 1.2, 0.08, 0.05, 1.28],
  ['fam_tomada', 'dupla', 0, 0, 1.2, 0.115, 0.05, 1.315],
  ['fam_interruptor', undefined, 0, 0, 1.3, 0.08, 0.05, 1.38],
  ['fam_interruptor', 'duplo', 0, 0, 1.3, 0.1, 0.05, 1.38],
  ['fam_interruptor', 'rebaixado', 0, 0, 0.9, 0.08, 0.05, 0.98],
  ['fam_luminaria_teto', undefined, 0, 0, 2.7, 0.3, 0.3, 2.76],
  ['fam_luminaria_teto', 'plafon60', 0, 0, 2.7, 0.6, 0.6, 2.77],
  ['fam_luminaria_teto', 'linear120', 0, 0, 2.7, 1.2, 0.15, 2.76],
  ['fam_quadro_distribuicao', undefined, 0, 0, 0, 0.4, 0.12, 0.5],
  ['fam_quadro_distribuicao', 'quadro8', 0, 0, 0, 0.3, 0.1, 0.4],
  ['fam_quadro_distribuicao', 'quadro24', 0, 0, 0, 0.5, 0.15, 0.7],
  ['fam_difusor_teto', undefined, 0, 0, 2.7, 0.6, 0.6, 2.85],
  ['fam_difusor_teto', 'difusor450', 0, 0, 2.7, 0.45, 0.45, 2.85],
  ['fam_difusor_teto', 'difusor300', 0, 0, 2.7, 0.3, 0.3, 2.82],
];

const familia = (id: string): Familia => {
  const f = familiaDaBiblioteca(id);
  expect(f, id).toBeDefined();
  return f!;
};

/** Componente mínimo apontando para a família da biblioteca (o projeto não a tem: cai no fallback da biblioteca base). */
const componente = (familyId: string): Component =>
  ({ id: 'c1', kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 0, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: '' }) as unknown as Component;

describe('famílias de exemplo por disciplina (ficha 3.4b)', () => {
  it('as oito existem na biblioteca base, com ids únicos no catálogo inteiro', () => {
    const ids = BIBLIOTECA_BASE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id] of ESPERADAS) expect(ids, id).toContain(id);
  });

  it.each(ESPERADAS)('%s valida sem problema e traz disciplina %s', (id, esperada) => {
    const f = familia(id);
    expect(validarFamilia(f)).toEqual([]);
    expect(f.disciplina, id).toBe(esperada);
    expect(disciplineOfElement(componente(id), createEmptyProject()), id).toBe(esperada);
  });

  it('fam_ar_split: ganhou disciplina hvac (no campo e derivada)', () => {
    const f = familia('fam_ar_split');
    expect(f.disciplina).toBe('hvac');
    expect(f.categoria).toBe('equipamento');
    expect(validarFamilia(f)).toEqual([]);
    expect(disciplineOfElement(componente('fam_ar_split'), createEmptyProject())).toBe('hvac');
  });
});

describe('famílias de exemplo: cada tipo resolve com a caixa literal', () => {
  for (const [id, tipo, x0, y0, z0, x1, y1, z1] of CAIXAS) {
    it(`${id}${tipo ? ` (${tipo})` : ''}: caixa ${x0}..${x1} × ${y0}..${y1} × ${z0}..${z1} m`, () => {
      const f = familia(id);
      const r = resolverFamilia(f, { tipoId: tipo, biblioteca: familiaDaBiblioteca });
      expect(r.erros, JSON.stringify(r.erros)).toEqual([]);
      expect(r.pecas.length, `${id}: sem peças`).toBeGreaterThan(0);
      const c = caixaEnvolvente(r.pecas)!;
      expect(c.min[0]).toBeCloseTo(x0, 3);
      expect(c.min[1]).toBeCloseTo(y0, 3);
      expect(c.min[2]).toBeCloseTo(z0, 3);
      expect(c.max[0]).toBeCloseTo(x1, 3);
      expect(c.max[1]).toBeCloseTo(y1, 3);
      expect(c.max[2]).toBeCloseTo(z1, 3);
    });
  }

  it('todas as famílias de exemplo têm a caixa de todos os tipos conferida', () => {
    const conferidas = new Map<string, number>();
    for (const [id, tipo] of CAIXAS) conferidas.set(id, (conferidas.get(id) ?? 0) + (tipo === undefined ? 1 : 0));
    for (const [id] of ESPERADAS) {
      const f = familia(id);
      expect(conferidas.get(id), id).toBe(1);
      expect(f.tipos.length, id).toBeGreaterThan(1);
    }
  });
});
