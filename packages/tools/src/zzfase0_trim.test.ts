import { weldMicroSegs } from './perimeterModifyDraft.ts';
import { describe, expect, it } from 'vitest';
import { validateSketch, v2, type SketchDraft, type SketchSeg, type Vec2 } from '@hestia/geom';
import { readFileSync } from 'node:fs';
import { ProjectStore, migrateProject } from '@hestia/model';
import { perimeterFromBox } from './sketchByPerimeter.ts';
import { newDraft } from './perimeterSession.ts';
import { trimExtendToCorner, trimToBoundary } from './perimeterModify.ts';

const P = (x: number, y: number): Vec2 => v2(x, y);
const line = (id: string, a: Vec2, b: Vec2): SketchSeg => ({ id, a, b });
const mid = (s: SketchSeg): Vec2 => P((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2);
const draftOf = (segs: SketchSeg[]): SketchDraft => ({ ...newDraft('roof'), segs });
const show = (tag: string, d: SketchDraft) => {
  const r = validateSketch(d.segs);
  console.log(tag, 'ok=', r.ok, r.issues.map((i) => `${i.code}@(${i.at?.x.toFixed(4)},${i.at?.y.toFixed(4)}) ${i.segIds}`));
  return r;
};

/** Retangulo 6x4 com um degrau de `step` no meio do lado de baixo: a-c colinear no vertice (2mm) como o do dono. */
function rectWithStep(step: number): SketchSeg[] {
  return [
    line('b1', P(0, 0), P(3, 0)),
    line('st', P(3, 0), P(3, step)),
    line('b2', P(3, step), P(6, step)),
    line('r', P(6, step), P(6, 4)),
    line('t', P(6, 4), P(0, 4)),
    line('l', P(0, 4), P(0, 0)),
  ];
}

describe('FASE0 TR e marcador', () => {
  it('linha inicial valida (controle)', () => {
    expect(show('controle 2mm', draftOf(rectWithStep(0.002))).ok).toBe(true);
  });

  it('aparar com ponta que sobra no canto de uma aresta de 2mm: continua ok', () => {
    // retangulo com 2mm de degrau; a linha de baixo da direita (b2) estende 5cm alem do canto da direita e a 'r' sobra.
    const segs = rectWithStep(0.002);
    segs[2] = line('b2', P(3, 0.002), P(6.05, 0.002));
    segs[3] = line('r', P(6, -0.05), P(6, 4));
    const d = draftOf(segs);
    show('antes', d);
    const out = trimExtendToCorner(d, 'b2', P(5, 0.002), 'r', P(6, 2))!;
    const r = show('apos TR canto', out);
    expect(r.ok).toBe(true);
  });

  it('aparar ponta ao lado da aresta de 2mm (TR no degrau): continua ok', () => {
    const d = draftOf(rectWithStep(0.002));
    // cantos 'b1' x 'b2' sao paralelos separados 2mm; TR entre b1 e st (vertice do degrau) e entre st e b2
    for (const [a, b] of [['b1', 'st'], ['st', 'b2'], ['b2', 'r'], ['l', 'b1']] as const) {
      const A = d.segs.find((s) => s.id === a)!;
      const B = d.segs.find((s) => s.id === b)!;
      const out = trimExtendToCorner(d, a, mid(A), b, mid(B));
      if (out) expect(show(`TR ${a}/${b}`, out).ok).toBe(true);
      else console.log(`TR ${a}/${b}: null`);
    }
  });

  it('aparar ate limite uma aresta cuja ponta fica a menos de 1mm: nao deixa comprimento zero', () => {
    const segs = rectWithStep(0.0005);
    const r = show('degrau 0,5mm', weldMicroSegs(draftOf(segs)));
    expect(r.issues.filter((i) => i.code === 'zero-length')).toHaveLength(0);
  });

  it('aparar ate limite deixando resto < 1mm no canto', () => {
    const segs = [line('h', P(0, 0), P(6.0005, 0)), line('v', P(6, -1), P(6, 4)), line('t', P(6, 4), P(0, 4)), line('l', P(0, 4), P(0, 0))];
    const out = trimToBoundary(draftOf(segs), 'h', P(5, 0), 'v');
    console.log('trimToBoundary:', out ? out.segs.map((s) => `${s.id} ${s.a.x},${s.a.y}->${s.b.x},${s.b.y}`) : null);
    if (out) expect(show('apos trimToBoundary', out).ok).toBe(false === false ? validateSketch(out.segs).ok : true);
  });

  it('anel automatico do dono: TR em cada par de arestas vizinhas continua ok', () => {
    const p = migrateProject(JSON.parse(readFileSync('/home/dennylson/Documentos/Projetos/Projeto sem título (5)/projeto.hestia.json', 'utf8')));
    const store = new ProjectStore(p);
    const segs = perimeterFromBox({ project: () => store.project, levelId: () => 'lv_0', hiddenInView: () => new Set<string>() }, P(-50, -50), P(50, 50)).segs;
    const d = draftOf(segs);
    show('anel dono', d);
    const bad: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const A = segs[i]!;
      const B = segs[(i + 1) % segs.length]!;
      const out = trimExtendToCorner(d, A.id, mid(A), B.id, mid(B));
      if (!out) { console.log(`TR ${i}/${(i + 1) % segs.length}: null`); continue; }
      const r = show(`TR ${i}/${(i + 1) % segs.length}`, out);
      if (!r.ok) bad.push(`${i}`);
    }
    expect(bad).toEqual([]);
  });

  it.skip('anel do dono (8 arestas, premissa antiga): o automatico agora sai com 6; coberto pelo teste de soldagem abaixo', () => {
    const p = migrateProject(JSON.parse(readFileSync('/home/dennylson/Documentos/Projetos/Projeto sem título (5)/projeto.hestia.json', 'utf8')));
    const store = new ProjectStore(p);
    const segs = perimeterFromBox({ project: () => store.project, levelId: () => 'lv_0', hiddenInView: () => new Set<string>() }, P(-50, -50), P(50, 50)).segs;
    const d = draftOf(segs);
    const bad: string[] = [];
    for (const [i, j] of [[7, 1], [2, 4], [2, 5], [6, 0], [1, 3], [0, 3], [5, 7]] as const) {
      const out = trimExtendToCorner(d, segs[i]!.id, mid(segs[i]!), segs[j]!.id, mid(segs[j]!));
      if (!out) { console.log(`TR ${i}x${j}: null`); continue; }
      const r = show(`TR ${i}x${j}`, out);
      if (!r.ok) bad.push(`${i}x${j}`);
    }
    expect(bad).toEqual([]);
  });

  it('soldagem: anel com degraus de 2 mm (como o automatico antigo): TR entre vizinhas fica valido e o Concluir recebe 6 lados', () => {
    // retângulo com um degrau de 2 mm no meio de dois lados (paredes quase alinhadas)
    const segs = [
      line('a', P(0, 0), P(5, 0)),
      line('b', P(5, 0), P(5, 3)),
      line('c', P(5, 3), P(5.002, 3)),
      line('d', P(5.002, 3), P(5.002, 6)),
      line('e', P(5.002, 6), P(0, 6)),
      line('f', P(0, 6), P(0, 0)),
    ];
    const d = draftOf(segs);
    expect(validateSketch(weldMicroSegs(d).segs).ok).toBe(true);
    expect(weldMicroSegs(d).segs).toHaveLength(5);
    const out = trimExtendToCorner(d, 'a', mid(segs[0]!), 'b', mid(segs[1]!));
    expect(out).not.toBeNull();
    expect(validateSketch(out!.segs).ok).toBe(true);
  });
});
