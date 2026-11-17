import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist, type SketchSeg, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, migrateProject, wallsOnLevel } from '@hestia/model';
import { perimeterFromBox } from './sketchByPerimeter.ts';
import type { SketchCtx } from './sketchPickFaceGeom.ts';

const FILE = '/home/dennylson/Documentos/Projetos/Projeto sem título (5)/projeto.hestia.json';
const BOX = { min: { x: -50, y: -50 }, max: { x: 50, y: 50 } };

function turns(segs: SketchSeg[]): number[] {
  return segs.map((s, i) => {
    const n = segs[(i + 1) % segs.length]!;
    const u = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
    const v = { x: n.b.x - n.a.x, y: n.b.y - n.a.y };
    return Math.abs((Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y) * 180) / Math.PI);
  });
}
function report(tag: string, segs: SketchSeg[]) {
  const t = turns(segs);
  console.log(tag, `${segs.length} arestas`);
  segs.forEach((s, i) => console.log(`  ${i}: len=${(dist(s.a, s.b) * 1000).toFixed(2)}mm giro_no_fim=${t[i]!.toFixed(3)}deg a=(${s.a.x.toFixed(4)},${s.a.y.toFixed(4)})`));
}
function check(segs: SketchSeg[], n: number) {
  expect(segs).toHaveLength(n);
  expect(Math.min(...segs.map((s) => dist(s.a, s.b)))).toBeGreaterThanOrEqual(0.01);
  expect(Math.min(...turns(segs))).toBeGreaterThanOrEqual(0.5);
}
function ctxOf(store: ProjectStore): SketchCtx {
  return { project: () => store.project, levelId: () => 'lv_0', hiddenInView: () => new Set<string>() };
}

describe('FASE0 telhado automatico', () => {
  it('projeto do dono: contorno externo 6 arestas, sem micro-aresta, sem colinear', () => {
    const p = migrateProject(JSON.parse(readFileSync(FILE, 'utf8')));
    const store = new ProjectStore(p);
    console.log('paredes', wallsOnLevel(p, 'lv_0').map((w) => `${w.id}:(${w.a.x},${w.a.y})->(${w.b.x},${w.b.y}) sag=${w.sag}`));
    const r = perimeterFromBox(ctxOf(store), BOX.min, BOX.max);
    report('dono', r.segs);
    console.log('avisos', r.warnings);
    check(r.segs, 6);
  });

  for (const gap of [0.001, 0.002, 0.01]) {
    it(`caso minimo: lado inferior de retangulo com parede desalinhada ${gap * 1000}mm`, () => {
      const store = new ProjectStore(createEmptyProject());
      const W = (id: string, a: Vec2, b: Vec2) => store.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a, b }) });
      W('a', { x: 0, y: 0 }, { x: 4, y: 0 });
      W('b', { x: 4, y: gap }, { x: 8, y: gap });
      W('c', { x: 8, y: gap }, { x: 8, y: 5 });
      W('d', { x: 8, y: 5 }, { x: 0, y: 5 });
      W('e', { x: 0, y: 5 }, { x: 0, y: 0 });
      W('f', { x: 4, y: 0 }, { x: 4, y: gap });
      const r = perimeterFromBox(ctxOf(store), BOX.min, BOX.max);
      report(`minimo ${gap}`, r.segs);
      check(r.segs, 4);
    });
  }

  it('nenhum segmento do esboco automatico com menos de 1 cm (projeto do dono)', () => {
    const store = new ProjectStore(migrateProject(JSON.parse(readFileSync(FILE, 'utf8'))));
    const r = perimeterFromBox(ctxOf(store), BOX.min, BOX.max);
    expect(r.segs.filter((s) => dist(s.a, s.b) < 0.01).map((s) => dist(s.a, s.b))).toEqual([]);
  });
});
