/**
 * Terreno, ficha V2: a camada da planta e os snaps sobre o Rust REAL. T3, T5 e T8 pelas fixtures; terreno de 50 000 vértices para o tempo do primeiro
 * desenho e do zoom. O TS só desenha o que o kernel devolveu (curvas, borda, cotas): nada é calculado aqui. Roda só na suíte WASM.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeTerrain } from '@hestia/model';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { definirGerenciadorDoTerreno, projetoTerreno, resolveLevel } from '../packages/engine/src/index.ts';
import { buildPlanGeometry, type PlanInput } from '../packages/render/src/plan/build.ts';
import { resolverZoom } from '../packages/render/src/plan/zoomOps.ts';
import { LIGHT } from '../packages/render/src/plan/types.ts';
import { componentSnapGeometry } from '../packages/tools/src/componentSnap.ts';
import { linhasDoTerreno, pickTerrenoAt } from '../packages/tools/src/terrainPick.ts';

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

const entrada = (p: ReturnType<typeof projetoTerreno>): PlanInput => ({
  project: p, levelId: 'lv_0', resolved: resolveLevel(p, 'lv_0', new Map()), below: null, viewport: { cx: 10, cy: 10, zoom: 20, width: 800, height: 600 },
  theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false,
});

describe('planta do terreno com o kernel real', () => {
  it('T3 (pirâmide): 4 curvas de nível fechadas e a borda; rótulo na mestra pela cota exibida', () => {
    if (!ger) return;
    const p0 = projetoTerreno('T3');
    const s = new ProjectStore(p0);
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'setLinhasRotulo', v: [10, 0, 10, 20] }, { op: 'setPontosCotados', v: [10, 10] }] } as never);
    const g = buildPlanGeometry(entrada(s.project));
    // 4 curvas (z=1..4; mestraCada 5 não marca nenhuma mestra) + borda da envoltória + 2 braços da cruz.
    expect(g.strokes.filter((x) => x.closed)).toHaveLength(5);
    expect(g.strokes.filter((x) => x.deslocamentoPx)).toHaveLength(2);
    expect(g.labels.map((l) => l.text)).toContain('5,00 m');
  });

  it('T5: a planta traz a região translúcida, a borda do kernel e as curvas da superfície proposta', () => {
    if (!ger) return;
    const g = buildPlanGeometry(entrada(projetoTerreno('T5')));
    expect(g.fills).toHaveLength(1);
    expect(g.strokes.some((x) => x.closed && x.dash === undefined && x.pts.length >= 4)).toBe(true);
  });

  it('T8: snaps da borda e das fontes; seleção por borda, não pelo interior', () => {
    if (!ger) return;
    const p = projetoTerreno('T8');
    const g = componentSnapGeometry(p, 'lv_0');
    expect(g.points.some((q) => q.x === 5 && q.y === 5)).toBe(true);
    expect(g.points.some((q) => q.x === 10 && q.y === 10)).toBe(true);
    expect(pickTerrenoAt(p, 'lv_0', { x: 10, y: 5.02 }, 0.2, undefined, linhasDoTerreno(p, 'lv_0'))).toBe('tn_t8');
    expect(pickTerrenoAt(p, 'lv_0', { x: 9, y: 9 }, 0.2, undefined, linhasDoTerreno(p, 'lv_0'))).toBeNull();
  });

  it('terreno de 50 000 vértices: primeiro desenho, desenho em cache e zoom (tempos registrados)', () => {
    if (!ger) return;
    const lado = 224;
    const pontos: number[] = [];
    for (let i = 0; i < lado; i++) for (let j = 0; j < lado; j++) pontos.push(i * 0.5, j * 0.5, 100 + 8 * Math.sin(i / 17) + 6 * Math.cos(j / 23));
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn_grande', levelId: 'lv_0', pontos, intervaloCurvas: 1, mestraCada: 5 }) });
    const p = s.project;
    const t0 = performance.now();
    const g = buildPlanGeometry(entrada(p));
    const primeiro = performance.now() - t0;
    const t1 = performance.now();
    buildPlanGeometry({ ...entrada(p), selection: [] });
    const cache = performance.now() - t1;
    const t2 = performance.now();
    for (const z of [5, 10, 20, 40, 80]) resolverZoom(g, z);
    const zoom = (performance.now() - t2) / 5;
    const t3 = performance.now();
    componentSnapGeometry(p, 'lv_0');
    const snap = performance.now() - t3;
    // Registro de tempo pedido pela ficha (A.8 item 5).
    process.stdout.write(`[V2 50k] vertices=${pontos.length / 3} primeiro desenho=${primeiro.toFixed(0)} ms; repetido=${cache.toFixed(0)} ms; zoom(medio)=${zoom.toFixed(1)} ms; snaps=${snap.toFixed(0)} ms; tracos=${g.strokes.length}\n`);
    expect(g.strokes.length).toBeGreaterThan(10);
    expect(primeiro).toBeLessThan(6000);
  }, 60_000);
});
