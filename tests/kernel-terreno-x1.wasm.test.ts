/**
 * Terreno, ficha X1, sobre o Rust REAL: o IFC (IFCGEOGRAPHICELEMENT TERRAIN com a malha da superfície proposta, sem saia nem base), o DXF da planta
 * (curvas de nível com a elevação no código 38, igual à cota exibida) e do corte (CORTE_TERRENO) e o PDF da prancha com planta, corte e 3D vetorial.
 * Nada é calculado em TS: o teste só confere o que o kernel devolveu. Roda só na suíte WASM.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore } from '../packages/model/src/index.ts';
import { definirGerenciadorDoTerreno, projetoTerreno } from '../packages/engine/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { planDxf, sectionDxf } from '../apps/web/src/editor/dxfExport.ts';
import { ifcGeometryOf, projectIfcComAvisos } from '../apps/web/src/editor/ifcExport.ts';
import { addSheetAction, addViewAction, sheetsPdfOf } from '../apps/web/src/editor/sheetActions.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
  definirGerenciadorDoTerreno(() => ger);
});
afterAll(() => definirGerenciadorDoTerreno(() => null));

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const DATA = new Date('2026-01-01T00:00:00Z');

/** Elevações (código 38) das LWPOLYLINE de uma camada. */
function elevacoes(dxf: string, camada: string): number[] {
  const l = dxf.split('\r\n');
  const out: number[] = [];
  for (let i = 0; i + 1 < l.length; i += 2) {
    if (l[i]!.trim() !== '0' || l[i + 1] !== 'LWPOLYLINE') continue;
    let layer = '';
    let z = NaN;
    for (let j = i + 2; j + 1 < l.length && l[j]!.trim() !== '0'; j += 2) {
      if (l[j]!.trim() === '8') layer = l[j + 1]!;
      if (l[j]!.trim() === '38') z = Number(l[j + 1]);
    }
    if (layer === camada) out.push(z);
  }
  return out;
}

describe('terreno no IFC com o kernel real', () => {
  it.skipIf(!bytes)('T5: um IFCGEOGRAPHICELEMENT TERRAIN no IFCSITE, só a superfície (sem saia nem base), RefElevation = cotaZero', () => {
    const s = new ProjectStore(projetoTerreno('T5'));
    s.exec({ type: 'setLocalizacao', localizacao: { origemE: 0, origemN: 0, cotaZero: 700, norteVerdadeiro: 0 } });
    const geo = ifcGeometryOf(s.project);
    expect(geo.terrenos).toHaveLength(1);
    const z = geo.terrenos![0]!.mesh.positions.filter((_, i) => i % 3 === 2);
    // Superfície proposta: terreno a 10 m e plataforma a 8 m. A saia e a base chegariam a 7 m (espessuraBase 3).
    expect(Math.min(...z)).toBeGreaterThan(8 - 1e-9);
    expect(Math.max(...z)).toBeLessThan(10 + 1e-9);
    const { texto, avisos } = projectIfcComAvisos(s.project, DATA, 'pt');
    expect(avisos).toEqual([]);
    expect(count(texto, 'IFCGEOGRAPHICELEMENT')).toBe(1);
    expect(texto.split('\n').find((l) => l.includes('=IFCGEOGRAPHICELEMENT('))).toContain('.TERRAIN.');
    expect(texto.split('\n').find((l) => l.includes('=IFCSITE('))).toMatch(/,700\.0+,\$,\$\);$/);
  });
});

describe('terreno no DXF com o kernel real', () => {
  it.skipIf(!bytes)('T3: 4 curvas fechadas com a elevação (código 38) = cota; com cotaZero = cota exibida', () => {
    const dxf = planDxf(projetoTerreno('T3'), 'lv_0');
    expect(elevacoes(dxf, 'TERRENO_CURVAS').sort()).toEqual([1, 2, 3, 4]);
    expect(dxf).toContain('TERRENO_BORDA');
    const s = new ProjectStore(projetoTerreno('T3'));
    s.exec({ type: 'setLocalizacao', localizacao: { origemE: 0, origemN: 0, cotaZero: 100, norteVerdadeiro: 0 } });
    expect(elevacoes(planDxf(s.project, 'lv_0'), 'TERRENO_CURVAS').sort()).toEqual([101, 102, 103, 104]);
  });

  it.skipIf(!bytes)('T5: o corte por y = 10 leva o terreno na camada CORTE_TERRENO', () => {
    const s = new ProjectStore(projetoTerreno('T5'));
    s.exec({ type: 'addView', view: { id: 'corte_t5', name: 'Corte T5', kind: 'section', a: { x: -2, y: 10 }, b: { x: 22, y: 10 }, depth: 12 } });
    expect(sectionDxf(s.project, 'corte_t5')).toContain('CORTE_TERRENO');
  });
});

describe('terreno na prancha com o kernel real', () => {
  it.skipIf(!bytes)('T5: planta, corte e 3D vetorial geram o PDF, maior que o do mesmo projeto sem terreno desenhado', () => {
    const s = new ProjectStore(projetoTerreno('T5'));
    s.exec({ type: 'addView', view: { id: 'corte_t5', name: 'Corte T5', kind: 'section', a: { x: -2, y: 10 }, b: { x: 22, y: 10 }, depth: 12 } });
    const sheet = addSheetAction(s);
    addViewAction(s, sheet, { kind: 'plan', levelId: 'lv_0' }, 100);
    addViewAction(s, sheet, { kind: 'section', sectionId: 'corte_t5' }, 100);
    addViewAction(s, sheet, { kind: '3d' }, 100);
    const com = sheetsPdfOf(s.project)!;
    definirGerenciadorDoTerreno(() => null);
    const sem = sheetsPdfOf({ ...s.project })!;
    definirGerenciadorDoTerreno(() => ger);
    expect(new TextDecoder().decode(com.slice(0, 5))).toBe('%PDF-');
    expect(com.length).toBeGreaterThan(sem.length);
  });
});
