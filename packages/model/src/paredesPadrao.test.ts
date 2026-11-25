import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, migrateProject } from './index.ts';
import { materials, wallTypes } from './defaults.ts';
import { LANGS } from './i18n.ts';

/** Tipos de parede que entram só nos projetos novos (EP-14). */
const TIPOS_NOVOS = [
  'wt_bloco19',
  'wt_ca15',
  'wt_ca20',
  'wt_dupla',
  'wt_etics',
  'wt_tijolo',
  'wt_dry70',
  'wt_dry95',
  'wt_dryac',
  'wt_steel',
  'wt_wood',
  'wt_pedra',
  'wt_sanduiche',
] as const;

/** Materiais novos e a hachura de corte que cada um deve mostrar. */
const MATERIAIS_NOVOS: ReadonlyArray<readonly [string, string]> = [
  ['mat_cmu', 'cmu'],
  ['mat_concreto_armado', 'rcConcrete'],
  ['mat_tijolo_aparente', 'exposedBrick'],
  ['mat_pedra', 'stone'],
  ['mat_eps', 'eps'],
  ['mat_brita', 'gravel'],
  ['mat_areia_solo', 'sand'],
  ['mat_madeira_topo', 'timberEnd'],
  ['mat_camara_ar', 'none'],
  ['mat_chapa_aco', 'steel'],
];

const FIXTURE = fileURLToPath(new URL('../../engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url));

const totalDoTipo = (p: ReturnType<typeof createEmptyProject>, id: string): number =>
  p.wallTypes[id]!.layers.reduce((soma, camada) => soma + camada.thickness, 0);

describe('paredes padrão com hachura por camada (EP-14)', () => {
  it('o projeto novo traz os treze tipos e todas as camadas usam materiais existentes', () => {
    const p = createEmptyProject();
    for (const id of TIPOS_NOVOS) {
      const tipo = p.wallTypes[id];
      expect(tipo).toBeDefined();
      expect(tipo!.layers.length).toBeGreaterThan(0);
      for (const camada of tipo!.layers) {
        expect(camada.thickness).toBeGreaterThan(0);
        expect(p.materials[camada.materialId]).toBeDefined();
      }
    }
  });

  // Os literais são a soma exata das camadas prescritas (a ficha trazia alguns totais arredondados/errados: a parede
  // dupla, por exemplo, soma 0,274 m, como a própria lista de camadas dela mostra).
  it('a espessura total de cada tipo é a soma das camadas', () => {
    const p = createEmptyProject();
    expect(totalDoTipo(p, 'wt_bloco19')).toBeCloseTo(0.234, 9);
    expect(totalDoTipo(p, 'wt_ca15')).toBeCloseTo(0.184, 9);
    expect(totalDoTipo(p, 'wt_ca20')).toBeCloseTo(0.234, 9);
    expect(totalDoTipo(p, 'wt_dupla')).toBeCloseTo(0.274, 9);
    expect(totalDoTipo(p, 'wt_etics')).toBeCloseTo(0.217, 9);
    expect(totalDoTipo(p, 'wt_tijolo')).toBeCloseTo(0.222, 9);
    expect(totalDoTipo(p, 'wt_dry70')).toBeCloseTo(0.07, 9);
    expect(totalDoTipo(p, 'wt_dry95')).toBeCloseTo(0.095, 9);
    expect(totalDoTipo(p, 'wt_dryac')).toBeCloseTo(0.1, 9);
    expect(totalDoTipo(p, 'wt_steel')).toBeCloseTo(0.1135, 9);
    expect(totalDoTipo(p, 'wt_wood')).toBeCloseTo(0.1265, 9);
    expect(totalDoTipo(p, 'wt_pedra')).toBeCloseTo(0.4, 9);
    expect(totalDoTipo(p, 'wt_sanduiche')).toBeCloseTo(0.05, 9);
  });

  it('cada material novo mostra a hachura de corte escolhida', () => {
    const p = createEmptyProject();
    for (const [id, hatch] of MATERIAIS_NOVOS) expect(p.materials[id]!.hatch).toBe(hatch);
  });

  it('os materiais que já existiam também mudam de hachura no projeto novo', () => {
    const p = createEmptyProject();
    expect(p.materials['mat_la']!.hatch).toBe('woolZigzag');
    expect(p.materials['mat_gesso']!.hatch).toBe('gypsum');
    expect(p.materials['mat_aco']!.hatch).toBe('steel');
  });

  it('o arquivo antigo abre igual: não ganha os tipos novos nem troca a hachura da lã', () => {
    const antigo = migrateProject(JSON.parse(readFileSync(FIXTURE, 'utf8')));
    for (const id of TIPOS_NOVOS) expect(antigo.wallTypes[id]).toBeUndefined();
    expect(antigo.materials['mat_la']!.hatch).toBe('dots');
  });

  it.each([...LANGS])('os nomes dos tipos e materiais novos existem em %s', (lang) => {
    const tipos = wallTypes(lang);
    for (const id of TIPOS_NOVOS) {
      const tipo = tipos.find((x) => x.id === id)!;
      expect(tipo.name.trim().length).toBeGreaterThan(0);
      expect(tipo.description.trim().length).toBeGreaterThan(0);
    }

    const materiais = materials(lang);
    for (const [id] of MATERIAIS_NOVOS) expect(materiais.find((material) => material.id === id)!.name.trim().length).toBeGreaterThan(0);
  });
});
