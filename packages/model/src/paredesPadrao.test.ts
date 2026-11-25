import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, migrateProject } from './index.ts';
import { materials } from './defaults.ts';
import { LANGS } from './i18n.ts';

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

// Os 13 tipos de parede prontos (EP-14) ficaram de fora deste PR: deixavam os testes de propriedade e o kernel lentos
// demais na CI. Estão guardados no ramo local feat/paredes-novas-pendente; aqui ficam só os materiais e as hachuras.
describe('materiais padrão com hachura por camada (EP-14)', () => {
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

  it('o arquivo antigo abre igual: não troca a hachura da lã', () => {
    const antigo = migrateProject(JSON.parse(readFileSync(FIXTURE, 'utf8')));
    expect(antigo.materials['mat_la']!.hatch).toBe('dots');
  });

  it.each([...LANGS])('os nomes dos materiais novos existem em %s', (lang) => {
    const materiais = materials(lang);
    for (const [id] of MATERIAIS_NOVOS) expect(materiais.find((material) => material.id === id)!.name.trim().length).toBeGreaterThan(0);
  });
});
