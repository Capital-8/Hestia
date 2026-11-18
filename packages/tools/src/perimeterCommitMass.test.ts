import { describe, expect, it } from 'vitest';
import type { SketchDraft, Vec2 } from '@hestia/geom';
import { createEmptyProject, isMass, ProjectStore, type Mass } from '@hestia/model';
import { addSegs, newDraft, type NewSeg } from './perimeterSession.ts';
import { commitPerimeter, draftFromElement } from './perimeterCommit.ts';
import { massRing, paraLocal, reduzirAnel } from './perimeterCommitMass.ts';
import type { CommitPerimeterResult } from './perimeterCommitTypes.ts';

const rect = (x0: number, y0: number, x1: number, y1: number): NewSeg[] => [
  { a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
  { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
  { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
  { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
];
const draft = (segs: NewSeg[]): SketchDraft => addSegs(newDraft('mass'), segs);
function ok(r: CommitPerimeterResult): Extract<CommitPerimeterResult, { ok: true }> {
  if (!r.ok) throw new Error(`recusado: ${r.message}`);
  return r;
}
const aplica = (s: ProjectStore, r: CommitPerimeterResult): string => {
  for (const c of ok(r).commands) s.exec(c);
  return ok(r).id;
};
const massa = (s: ProjectStore, id: string): Mass => {
  const m = s.project.elements[id];
  if (!isMass(m)) throw new Error('não é massa');
  return m;
};
describe('esboço de massa: Concluir cria a massa livre', () => {
  it('retângulo 4 x 3, altura 5, nível lv_0: perfil livre local, origem no centro, z 0 e 5', () => {
    const store = new ProjectStore(createEmptyProject());
    const r = commitPerimeter(store.project, draft(rect(0, 0, 4, 3)), { levelId: 'lv_0', massa: { altura: 5 } });
    const m = massa(store, aplica(store, r));
    expect(m.origem).toEqual({ x: 2, y: 1.5 });
    expect(m.secoes.map((s) => s.z)).toEqual([0, 5]);
    expect(m.baseOffset).toBe(0);
    expect(m.secoes[0]!.perfil).toEqual({ forma: 'livre', pontos: [{ x: -2, y: -1.5 }, { x: 2, y: -1.5 }, { x: 2, y: 1.5 }, { x: -2, y: 1.5 }] });
    expect(m.secoes[1]!.perfil).toEqual(m.secoes[0]!.perfil);
    expect(ok(r).message).toContain('4 pontos');
  });

  it('cota absoluta da base 7 (nível a 0 m) e altura 4: baseOffset 7 e topo em 11 m na mensagem', () => {
    const store = new ProjectStore(createEmptyProject());
    const r = commitPerimeter(store.project, draft(rect(0, 0, 2, 2)), { levelId: 'lv_0', massa: { altura: 4, cotaBase: 7 } });
    const m = massa(store, aplica(store, r));
    expect(m.baseOffset).toBe(7);
    expect(m.secoes[1]!.z).toBe(4);
    expect(ok(r).message).toContain('7,00 m');
    expect(ok(r).message).toContain('11,00 m');
  });

  it('com furo (laço interno) é recusado: a massa não tem furos', () => {
    const store = new ProjectStore(createEmptyProject());
    const r = commitPerimeter(store.project, draft([...rect(0, 0, 10, 10), ...rect(3, 3, 6, 6)]), { levelId: 'lv_0', massa: { altura: 5 } });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Massa: o modelo não aceita furos. Apague os laços internos do esboço.');
  });

  it('laço aberto é recusado pela validação do esboço (nada criado)', () => {
    const store = new ProjectStore(createEmptyProject());
    const r = commitPerimeter(store.project, draft(rect(0, 0, 4, 3).slice(0, 3)), { levelId: 'lv_0', massa: { altura: 5 } });
    expect(r.ok).toBe(false);
  });

  it('círculo da galeria (arcos) vira polilinha por cordas de até 256 pontos; área ~ pi r^2', () => {
    const store = new ProjectStore(createEmptyProject());
    const d = addSegs(newDraft('mass'), [{ a: { x: 3, y: 0 }, b: { x: -3, y: 0 }, sag: -3 }, { a: { x: -3, y: 0 }, b: { x: 3, y: 0 }, sag: -3 }]);
    const m = massa(store, aplica(store, commitPerimeter(store.project, d, { levelId: 'lv_0', massa: { altura: 2 } })));
    const pts = (m.secoes[0]!.perfil as { pontos: Vec2[] }).pontos;
    expect(pts.length).toBeGreaterThan(40);
    expect(pts.length).toBeLessThanOrEqual(256);
    const area = Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]!; return s + (a.x * b.y - b.x * a.y); }, 0)) / 2;
    expect(area).toBeGreaterThan(28.2);
    expect(area).toBeLessThan(28.28);
  });
});

describe('reduzirAnel', () => {
  it('anel de 400 pontos num círculo de 50 m cai para <= 256 mantendo a área a menos de 0,1%', () => {
    const n = 400;
    const anel = Array.from({ length: n }, (_, k) => ({ x: 50 * Math.cos((2 * Math.PI * k) / n), y: 50 * Math.sin((2 * Math.PI * k) / n) }));
    const r = reduzirAnel(anel)!;
    expect(r.length).toBeLessThanOrEqual(256);
    const area = (p: Vec2[]): number => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + (a.x * b.y - b.x * a.y); }, 0)) / 2;
    expect(Math.abs(area(r) - area(anel)) / area(anel)).toBeLessThan(0.001);
  });
  it('anel que cabe passa igual', () => {
    const q = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(reduzirAnel(q)).toEqual(q);
  });
});

describe('editar o contorno de uma massa', () => {
  it('Editar contorno: o rascunho traz o anel da base; trocar para 6 x 2 atualiza as duas seções e preserva z, base e torção', () => {
    const store = new ProjectStore(createEmptyProject());
    const id = aplica(store, commitPerimeter(store.project, draft(rect(0, 0, 4, 3)), { levelId: 'lv_0', massa: { altura: 5, cotaBase: 1 } }));
    const d0 = draftFromElement(store.project, id)!;
    expect(d0.target).toBe('mass');
    expect(d0.editing).toBe(id);
    expect(d0.segs).toHaveLength(4);
    // novo contorno: retângulo 6 x 2 de (0,0) a (6,2)
    const novo = addSegs(newDraft('mass'), rect(0, 0, 6, 2));
    const r = commitPerimeter(store.project, { ...novo, editing: id }, { levelId: 'lv_0' });
    aplica(store, r);
    const m = massa(store, id);
    expect(m.secoes.map((s) => s.z)).toEqual([0, 5]);
    expect(m.baseOffset).toBe(1);
    expect(m.origem).toEqual({ x: 2, y: 1.5 });
    const mundo = massRing(m.origem, m.secoes[0]!);
    expect(mundo).toEqual([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 0, y: 2 }]);
    expect(massRing(m.origem, m.secoes[1]!)).toEqual(mundo);
  });

  it('paraLocal inverte rotação, escala e deslocamento', () => {
    const l = paraLocal([{ x: 12, y: 3 }], { x: 10, y: 1 }, { dx: 0, dy: 0, rotacao: Math.PI / 2, escala: 2 });
    expect(l[0]!.x).toBeCloseTo(1, 12);
    expect(l[0]!.y).toBeCloseTo(-1, 12);
  });
});

describe('mistura: base e topo pelo esboço', () => {
  const quadrado = [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }];
  it('base quadrado 4x4 + topo retângulo 2x2 deslocado: 2 seções z 0 e 6, perfis diferentes, origem no centro da base', () => {
    const store = new ProjectStore(createEmptyProject());
    const r = commitPerimeter(store.project, draft(rect(10, 10, 12, 12)), { levelId: 'lv_0', massa: { altura: 6, baseRing: quadrado } });
    const m = massa(store, aplica(store, r));
    expect(m.secoes.map((x) => x.z)).toEqual([0, 6]);
    expect(m.origem).toEqual({ x: 0, y: 0 });
    expect(m.secoes[0]!.perfil).toEqual({ forma: 'livre', pontos: quadrado });
    expect(m.secoes[1]!.perfil).toEqual({ forma: 'livre', pontos: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }] });
    expect([m.secoes[1]!.dx, m.secoes[1]!.dy]).toEqual([11, 11]);
  });
  it('Editar contorno do TOPO troca só a última seção; da BASE troca só a base', () => {
    const store = new ProjectStore(createEmptyProject());
    const id = aplica(store, commitPerimeter(store.project, draft(rect(10, 10, 12, 12)), { levelId: 'lv_0', massa: { altura: 6, baseRing: quadrado } }));
    const topoAntes = massa(store, id).secoes[1]!.perfil;
    const d = draftFromElement(store.project, id, 'topo')!;
    expect(d.segs).toHaveLength(4);
    aplica(store, commitPerimeter(store.project, { ...addSegs(newDraft('mass'), rect(0, 0, 3, 3)), editing: id }, { levelId: 'lv_0', massa: { altura: 6, editar: 'base' } }));
    expect(massa(store, id).secoes[1]!.perfil).toEqual(topoAntes);
    expect(massa(store, id).secoes[0]!.perfil).not.toEqual({ forma: 'livre', pontos: quadrado });
  });
});
