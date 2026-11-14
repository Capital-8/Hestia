/**
 * O vão da parede acompanha a esquadria com o resolvedor Rust (despacho da fatia A) instalado: apagar, trocar o tipo,
 * mudar a largura e mover o offset de uma porta/janela refazem o vão (planta e 3D), em cena construída e em IFC importado.
 * Espelha `tests/aberturaVao.test.ts` (que roda o TS). Roda em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { multiArea } from '@hestia/geom';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type Project } from '@hestia/model';
import { importIfc } from '@hestia/io';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resolveLevel } from '../packages/engine/src/resolve.ts';
import { instalarDespachoKernel, removerDespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { buildLevelSolids } from '../packages/render/src/model3d/solids.ts';

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
});
afterEach(() => removerDespachoKernel());
afterAll(() => removerDespachoKernel());

const medidas = (p: Project, lv: string) => {
  const r = resolveLevel(p, lv, new Map());
  const planta = Object.values(r.walls).reduce((s, w) => s + w.layers.reduce((a, l) => a + multiArea(l.cut), 0), 0);
  let vol = 0;
  for (const b of buildLevelSolids(r).batches) {
    const P = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
    for (let i = 0; i < b.indices.length; i += 3) {
      const [a, c, d] = [P(b.indices[i]!), P(b.indices[i + 1]!), P(b.indices[i + 2]!)];
      vol += (a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0])) / 6;
    }
  }
  return { planta, vol: Math.abs(vol) };
};

describe.skipIf(!bytes)('vão acompanha a esquadria com o Rust', () => {
  const instalar = () => instalarDespachoKernel({ gerenciador: () => ger, config: () => ({ fatiaA: true, fatiaB: false, sombra: false }) });

  it('apagar, trocar tipo, largura e offset (cena construída)', () => {
    if (!ger) return;
    const d = instalar();
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
    const t0 = Object.values(s.project.openingTypes).find((t) => t.kind === 'door')!;
    s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_a', width: 0.9 } });
    s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_b', width: 1.6 } });
    const sem = medidas(s.project, 'lv_0');
    s.exec({ type: 'addOpening', opening: { id: 'v', kind: 'door', typeId: 'ot_a', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const com = medidas(s.project, 'lv_0');
    expect(com.planta).toBeLessThan(sem.planta - 1e-6);
    expect(com.vol).toBeLessThan(sem.vol - 1e-6);
    s.exec({ type: 'updateElements', ids: ['v'], patch: { typeId: 'ot_b' } as Partial<Opening> });
    expect(medidas(s.project, 'lv_0').planta).toBeLessThan(com.planta - 1e-6);
    s.exec({ type: 'updateElements', ids: ['v'], patch: { typeId: 'ot_a' } as Partial<Opening> });
    s.exec({ type: 'upsertOpeningType', openingType: { ...s.project.openingTypes.ot_a!, width: 1.4 } });
    expect(medidas(s.project, 'lv_0').planta).toBeLessThan(com.planta - 1e-6);
    s.exec({ type: 'upsertOpeningType', openingType: { ...s.project.openingTypes.ot_a!, width: 0.9 } });
    const antes = JSON.stringify(resolveLevel(s.project, 'lv_0', new Map()).walls.w!.layers.map((l) => l.cut));
    s.exec({ type: 'updateElements', ids: ['v'], patch: { offset: 4.5 } as Partial<Opening> });
    expect(JSON.stringify(resolveLevel(s.project, 'lv_0', new Map()).walls.w!.layers.map((l) => l.cut))).not.toBe(antes);
    s.exec({ type: 'deleteElements', ids: ['v'] });
    const dep = medidas(s.project, 'lv_0');
    expect(dep.planta).toBeCloseTo(sem.planta, 6);
    expect(dep.vol).toBeCloseTo(sem.vol, 6);
    expect(d.diagnostico().entreguesPeloRust).toBeGreaterThan(0);
  });

  it('IFC importado (parede-janela): apagar a esquadria devolve a parede cheia', () => {
    if (!ger) return;
    instalar();
    const { project } = importIfc(readFileSync(new URL('./ifc/fixtures/parede-janela.ifc', import.meta.url), 'utf8'));
    const lv = project.levels[0]!.id;
    const ids = Object.values(project.elements).filter((e) => e.kind === 'door' || e.kind === 'window').map((e) => e.id);
    expect(ids.length).toBeGreaterThan(0);
    const s = new ProjectStore(project);
    const com = medidas(s.project, lv);
    s.exec({ type: 'deleteElements', ids });
    const sem = medidas(s.project, lv);
    expect(sem.planta).toBeGreaterThan(com.planta + 1e-6);
    expect(sem.vol).toBeGreaterThan(com.vol + 1e-6);
  });
});
