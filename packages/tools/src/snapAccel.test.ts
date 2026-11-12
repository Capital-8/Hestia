import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import { infer } from './infer.ts';
import { sectionInferContext } from './sectionContext.ts';
import { buildSectionSnapIndex } from './sectionSnapIndex.ts';
import { aceleracaoLigadaParaTeste, arestasPerto, pontosNasFaixas, pontosPerto, registrarCauda, trilhasPerto } from './snapAccel.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Gerador pseudoaleatório determinístico (os testes não podem depender de sorte). */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const R = rng(7);
const pontos = Array.from({ length: 3000 }, () => ({ ...v(R() * 40, R() * 6), hostId: 'h' }));
const segs = Array.from({ length: 3000 }, () => {
  const a = v(R() * 40, R() * 6);
  const horizontal = R() < 0.4;
  const vertical = !horizontal && R() < 0.5;
  const b = horizontal ? v(a.x + R() * 3, a.y) : vertical ? v(a.x, a.y + R() * 1.5) : v(a.x + R() * 1.5, a.y + R() * 1.5);
  return { a, b, axis: horizontal ? ('h' as const) : vertical ? ('v' as const) : ('d' as const) };
});
// Uma linha de nível que atravessa tudo (aresta longa demais para a grade).
segs.push({ a: v(0, 3), b: v(40, 3), axis: 'h' });

const cursores = Array.from({ length: 300 }, () => v(R() * 40, R() * 6));
const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
function distSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distReta(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l;
}

describe('consulta espacial das listas de captura', () => {
  it('pontos: devolve todos os que estão ao alcance, na ordem original', () => {
    for (const c of cursores) {
      const got = pontosPerto(pontos, c, 0.08);
      const ao = pontos.filter((p) => dist2(p, c) <= 0.08 * 0.08);
      expect(ao.every((p) => got.includes(p))).toBe(true);
      const idx = got.map((p) => pontos.indexOf(p));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it('faixas de x e de y: todo ponto alinhado com o cursor entra, mesmo longe na outra direção', () => {
    for (const c of cursores.slice(0, 60)) {
      const got = new Set(pontosNasFaixas(pontos, c, 0.08));
      for (const p of pontos) if (Math.abs(p.x - c.x) <= 0.08 || Math.abs(p.y - c.y) <= 0.08) expect(got.has(p)).toBe(true);
    }
  });

  it('arestas: toda aresta a até r do cursor entra, inclusive as longas', () => {
    for (const c of cursores) {
      const got = new Set(arestasPerto(segs, c, 0.1));
      for (const e of segs) if (distSeg(c, e.a, e.b) <= 0.1) expect(got.has(e)).toBe(true);
    }
  });

  it('trilhas: horizontais e verticais pela faixa, inclinadas pela distância à reta suporte (também além das pontas)', () => {
    for (const c of cursores) {
      const got = new Set(trilhasPerto(segs, c, 0.1));
      for (const e of segs) {
        const perto = e.axis === 'h' ? Math.abs(c.y - e.a.y) <= 0.1 : e.axis === 'v' ? Math.abs(c.x - e.a.x) <= 0.1 : distReta(c, e.a, e.b) <= 0.1;
        if (perto) expect(got.has(e)).toBe(true);
      }
    }
  });

  it('lista "base + cauda" reaproveita a estrutura da base e sempre inclui a cauda', () => {
    const cauda = [{ ...v(1, 1), hostId: 'x' }, { ...v(30, 5), hostId: 'x' }];
    const lista = registrarCauda(pontos.concat(cauda), pontos);
    const got = pontosPerto(lista, v(1, 1), 0.05);
    expect(got).toContain(cauda[0]);
    expect(got).toContain(cauda[1]);
    expect(got.length).toBeLessThan(lista.length / 10);
  });

  it('lista pequena não monta estrutura: devolve a própria lista', () => {
    const pouca = pontos.slice(0, 50);
    expect(pontosPerto(pouca, v(1, 1), 0.1)).toBe(pouca);
    expect(arestasPerto(segs.slice(0, 50), v(1, 1), 0.1)).toHaveLength(50);
  });

  it('infer dá o MESMO resultado com e sem a estrutura espacial (vista cheia de arestas, com e sem ponto de partida)', () => {
    const rings = Array.from({ length: 400 }, (_, i) => {
      const x = (i % 40) * 1;
      const y = Math.floor(i / 40) * 0.5 + (i % 3) * 0.07;
      return { hostId: `s${i % 20}`, ring: [v(x, y), v(x + 0.3, y), v(x + 0.3, y + 0.2), v(x, y + 0.2)] };
    });
    const section: SectionResult = { length: 40, zMin: 0, zMax: 6, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [{ levelId: 'n1', name: 'N1', z: 3 }], snapRings: rings };
    const project = createEmptyProject();
    const cenaCtx = () => sectionInferContext(section, project, 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(40, 0) }, grids: false });
    const pontosDeTeste = Array.from({ length: 250 }, (_, k) => v(0.3 + (k % 50) * 0.79, 0.05 + (k % 11) * 0.51));
    const run = (): string[] => {
      const out: string[] = [];
      for (const [k, c] of pontosDeTeste.entries()) {
        const ctx = cenaCtx();
        const r = infer(c, k % 2 ? { ...ctx, from: v(5, 1) } : ctx);
        out.push(`${r.kind}|${r.point.x.toFixed(9)}|${r.point.y.toFixed(9)}|${r.hostId ?? ''}|${r.guides.length}`);
      }
      return out;
    };
    expect(buildSectionSnapIndex(section).points.length).toBeGreaterThan(256);
    aceleracaoLigadaParaTeste(false);
    const completo = run();
    aceleracaoLigadaParaTeste(true);
    const acelerado = run();
    expect(acelerado).toEqual(completo);
    expect(completo.some((r) => r.startsWith('endpoint'))).toBe(true);
    expect(completo.some((r) => r.startsWith('alignment'))).toBe(true);
  });
});
