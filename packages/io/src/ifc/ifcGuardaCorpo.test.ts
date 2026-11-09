import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeGuardaCorpo, tiposGuardaCorpo, type Project } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import { ifcPredefinidoGC } from './ifcGuardaCorpo.ts';
import type { IfcGeometry } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const geo: IfcGeometry = { walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [], ramps: [] };
const count = (text: string, type: string): number => text.split(`=${type}(`).length - 1;
const tipos = Object.fromEntries(tiposGuardaCorpo('pt').map((x) => [x.id, x]));

function projeto(typeId: string, n = 1): Project {
  const base = createEmptyProject('Teste');
  const p = structuredClone(base);
  for (let i = 0; i < n; i++) {
    const id = `gc${i}`;
    p.elements[id] = { order: i, ...makeGuardaCorpo({
      id,
      levelId: p.levels[0]!.id,
      typeId,
      hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 3, y: 4, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' },
    }) };
  }
  return p;
}

describe('IFC do guarda-corpo', () => {
  it('um IFCRAILING por guarda-corpo, com Length pelo comprimento do caminho', () => {
    const p = projeto('gct_balaustres', 2);
    const text = exportIfc(p, geo, { timestamp: TS });
    expect(count(text, 'IFCRAILING')).toBe(4);
    expect(text).toContain('Qto_RailingBaseQuantities');
    expect(text).toContain('IFCQUANTITYLENGTH(\'Length\',$,$,5.');
    expect(text).toContain('Pset_RailingCommon');
    expect(text).toContain('Pset_Hestia_GuardaCorpo');
  });

  it('PredefinedType pela composição do tipo', () => {
    const t = (id: string) => tipos[id];
    expect(ifcPredefinidoGC(t('gct_balaustres'))).toBe('GUARDRAIL');
    expect(ifcPredefinidoGC(t('gct_corrimao_parede'))).toBe('HANDRAIL');
    expect(ifcPredefinidoGC(t('gct_vidro'))).toBe('GUARDRAIL');
    expect(ifcPredefinidoGC(undefined)).toBe('USERDEFINED');
    const so = structuredClone(t('gct_balaustres')!);
    so.corrimaos = [];
    so.preenchimentos = so.preenchimentos.filter((x) => x.tipo === 'balaustres');
    expect(ifcPredefinidoGC(so)).toBe('BALUSTRADE');
    expect(ifcPredefinidoGC({ ...so, ifcPredefinido: 'USERDEFINED' })).toBe('USERDEFINED');
  });

  it('corrimão do tipo vira IFCRAILING HANDRAIL agregado', () => {
    const text = exportIfc(projeto('gct_corrimao_parede'), geo, { timestamp: TS });
    expect(text).toContain('.HANDRAIL.');
    expect(count(text, 'IFCRELAGGREGATES')).toBeGreaterThanOrEqual(4);
  });

  it('sem guarda-corpo, nada de IFCRAILING', () => {
    expect(exportIfc(createEmptyProject('T'), geo, { timestamp: TS })).not.toContain('IFCRAILING(');
  });
});
