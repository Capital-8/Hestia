import { describe, expect, it } from 'vitest';
import { ProjectStore, buildTemplate, makeLevel } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import { importIfc } from '../ifcImport/index.ts';
import type { IfcGeometry } from './ifcTypes.ts';

/*
 * Plantas de disciplina no IFC (decisão 0060 §8.4, etapa 2.4): `PlanViewsJSON` no Pset_Hestia_Project. Ida e volta preserva
 * as plantas; sem a propriedade (IFC antigo ou de outro programa) o projeto abre só com as plantas padrão.
 */

const TS = '2026-01-01T00:00:00';
const VAZIA: IfcGeometry = { walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/** Projeto com dois níveis e duas plantas de disciplina (uma com gráficos e ocultação, outra com anotação). */
function comPlantas(): ProjectStore {
  const s = new ProjectStore(buildTemplate('house2'));
  s.exec({ type: 'addPlanView', plan: { id: 'pv1', levelId: 'lv_0', name: 'Estrutura — fôrmas', discipline: 'estrutura', hidden: { categories: ['wall'] }, tones: { arquitetura: 'halftone' } } });
  s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50 } });
  s.exec({ type: 'addPlanView', plan: { id: 'pv2', levelId: 'lv_1', name: 'Elétrica', discipline: 'eletrico' } });
  s.exec({ type: 'addText', levelId: 'lv_1', planId: 'pv2', text: { id: 'tpv2', at: { x: 1, y: 2 }, text: 'Circuito 1', height: 3, rotation: 0 } });
  return s;
}

describe('IFC: PlanViewsJSON (plantas de disciplina)', () => {
  it('ida e volta: id, nível, nome, disciplina, gráficos, ocultação, tons e anotações voltam iguais', () => {
    const s = comPlantas();
    const texto = exportIfc(s.project, VAZIA, { timestamp: TS });
    expect(texto).toContain("'PlanViewsJSON'");
    const { project } = importIfc(texto);
    expect(project.planViews).toEqual(s.project.planViews);
    expect(project.planViews!.map((v) => [v.id, v.levelId, v.name, v.discipline])).toEqual([
      ['pv1', 'lv_0', 'Estrutura — fôrmas', 'estrutura'],
      ['pv2', 'lv_1', 'Elétrica', 'eletrico'],
    ]);
    expect(project.planViews![0]!.hidden).toEqual({ categories: ['wall'] });
    expect(project.planViews![0]!.graphics!.scale).toBe(50);
    expect(project.planViews![1]!.annotations!.texts.map((t) => t.text)).toEqual(['Circuito 1']);
  });

  it('o arquivo importado é reexportado com as mesmas plantas (idempotente)', () => {
    const s = comPlantas();
    const primeiro = exportIfc(s.project, VAZIA, { timestamp: TS });
    const { project } = importIfc(primeiro);
    expect(exportIfc(project, VAZIA, { timestamp: TS })).toBe(primeiro);
  });

  it('projeto sem plantas de disciplina não ganha a propriedade e o IFC sai como antes', () => {
    const p = new ProjectStore(buildTemplate('house2')).project;
    const texto = exportIfc(p, VAZIA, { timestamp: TS });
    expect(texto).not.toContain('PlanViewsJSON');
    // O único byte que muda é o SchemaVersion da Hestia: 33 → 34 (o resto do arquivo é o de antes).
    expect([texto.length, fnv(texto)]).toEqual([95531, '7d330221']);
  });

  it('importar IFC sem PlanViewsJSON continua igual: abre só com as plantas padrão', () => {
    const p = new ProjectStore(buildTemplate('house2')).project;
    const { project } = importIfc(exportIfc(p, VAZIA, { timestamp: TS }));
    expect(project.planViews).toBeUndefined();
    expect(project.levels.map((l) => l.id)).toEqual(p.levels.map((l) => l.id));
  });

  it('planta de nível que não está no arquivo não entra (sem nível, sem planta)', () => {
    const s = new ProjectStore(buildTemplate('house2'));
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_9', name: 'Cobertura', elevation: 9 }) });
    s.exec({ type: 'addPlanView', plan: { id: 'pvX', levelId: 'lv_9', name: 'Solta', discipline: 'hvac' } });
    const texto = exportIfc({ ...s.project, levels: s.project.levels.filter((l) => l.id !== 'lv_9') }, VAZIA, { timestamp: TS });
    expect(texto).toContain("'PlanViewsJSON'");
    expect(importIfc(texto).project.planViews).toBeUndefined();
  });
});

describe('IFC e a versão do esquema (35)', () => {
  it('o IFC exportado carrega SchemaVersion 35 no Pset_Hestia_Project', () => {
    const p = new ProjectStore(buildTemplate('house2')).project;
    expect(p.schemaVersion).toBe(35);
    expect(exportIfc(p, VAZIA, { timestamp: TS })).toContain("'SchemaVersion',$,IFCINTEGER(35)");
  });

  it('IFC legado gravado com SchemaVersion 34 continua abrindo, com os elementos e níveis', () => {
    const p = new ProjectStore(buildTemplate('house2')).project;
    const texto = exportIfc(p, VAZIA, { timestamp: TS });
    const legado = texto.replace("IFCINTEGER(35)", 'IFCINTEGER(34)');
    expect(legado).not.toBe(texto);
    const { project } = importIfc(legado);
    expect(project.levels.map((l) => l.id)).toEqual(p.levels.map((l) => l.id));
    expect(Object.keys(project.elements).length).toBe(Object.keys(p.elements).length);
  });
});
