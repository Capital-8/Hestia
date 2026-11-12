import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateProject, type Project } from '@hestia/model';
import { areaPlanDxf } from './dxfExport.ts';

/**
 * Raia E: o DXF da planta de área leva as etiquetas de elemento que estão NA VISTA (as próprias e as cópias do nível feitas
 * na migração 23 → 24), como o desenho em tela; não lê a planta de piso. Projetos do ouro (v23) com a etiqueta "PE-19".
 */
const DIR = new URL('../../../../tests/vistas-ouro/projetos/', import.meta.url);
const bruto = (f: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Record<string, unknown>;
const migrado = (f: string): Project => migrateProject(bruto(f));
/** Quantas entidades TEXT do DXF têm o valor "PE-19" (a etiqueta de tipo da parede h_s). */
const textos = (dxf: string): number => dxf.split(/\r?\n/).filter((l) => l.trim() === 'PE-19').length;

describe('DXF da planta de área: etiquetas de elemento só da vista (raia E)', () => {
  it('planta que herdava: uma etiqueta (a cópia), como sempre', () => {
    expect(textos(areaPlanDxf(migrado('03-area-herda-anotacoes.json'), 'ap_herda'))).toBe(1);
  });

  it('conjunto próprio: a própria e a cópia do nível; `annotations: {}`: só a cópia', () => {
    const p = migrado('04-area-anotacoes-proprias.json');
    expect(textos(areaPlanDxf(p, 'ap_propria'))).toBe(2);
    expect(textos(areaPlanDxf(p, 'ap_vazia'))).toBe(1);
  });

  it('planta sem cópia (showAnnotations desligado) não leva etiqueta do piso', () => {
    const raw = bruto('04-area-anotacoes-proprias.json') as { areaPlans: Array<{ graphics: Record<string, unknown> }> };
    for (const a of raw.areaPlans) a.graphics = { ...a.graphics, showAnnotations: false };
    const p = migrateProject(raw);
    expect(textos(areaPlanDxf(p, 'ap_propria'))).toBe(0);
    expect(textos(areaPlanDxf(p, 'ap_vazia'))).toBe(0);
  });
});
