import { intersection, ringArea, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import { isComponent, levelElevation, resolverMaterialVisualPeca, type Component, type Id, type Project } from '@hestia/model';
import { resolverComponente } from './componentes/instancia.ts';
import type { PecaResolvida } from './componentes/pecas.ts';
import type { SectionBeyond, SectionOrigin } from './section.ts';
import { EPS_T, lineIntervals, rect, sectionFrame, type SectionLine } from './sectionGeom.ts';

/** Corte e projeção dos componentes (móveis) de um nível na vista de corte ou elevação. */
export interface ComponentSection {
  cut: Array<{ materialId: Id; polygon: Polygon; origin: SectionOrigin }>;
  beyond: SectionBeyond[];
  zMin: number;
  zMax: number;
}

function pontoNoMundo(c: Component, lx: number, ly: number): Vec2 {
  const cos = Math.cos(c.rotation);
  const sen = Math.sin(c.rotation);
  const sx = c.mirrored ? -lx : lx;
  return { x: c.x + sx * cos - ly * sen, y: c.y + sx * sen + ly * cos };
}

function anelDaPeca(c: Component, peca: PecaResolvida): Ring | null {
  const [ox, oy] = peca.origem;
  if (peca.eixo === 'z' && peca.contorno !== null && peca.contorno.length >= 6) {
    const ring: Ring = [];
    for (let i = 0; i + 1 < peca.contorno.length; i += 2) {
      ring.push(pontoNoMundo(c, ox + peca.contorno[i]!, oy + peca.contorno[i + 1]!));
    }
    if (ringArea(ring) < 0) ring.reverse();
    return Math.abs(ringArea(ring)) > 1e-10 ? ring : null;
  }
  const [ex, ey] = peca.extensao;
  if (ex <= 1e-9 || ey <= 1e-9) return null;
  const ring: Ring = [
    pontoNoMundo(c, ox, oy),
    pontoNoMundo(c, ox + ex, oy),
    pontoNoMundo(c, ox + ex, oy + ey),
    pontoNoMundo(c, ox, oy + ey),
  ];
  if (ringArea(ring) < 0) ring.reverse();
  return ring;
}

/**
 * Resolve cada componente paramétrico do nível e projeta suas peças sólidas em (t, z) no plano de corte (`cut`) e na
 * faixa de visão além do corte (`beyond`), preservando `componentId` para oclusão, seleção e visibilidade.
 */
export function sectionOfComponents(p: Project, levelId: Id, line: SectionLine): ComponentSection {
  const out: ComponentSection = { cut: [], beyond: [], zMin: Infinity, zMax: -Infinity };
  const { length, d, n, slab } = sectionFrame(line);
  if (length < 1e-6) return out;

  const along = (v: Vec2): number => (v.x - line.a.x) * d.x + (v.y - line.a.y) * d.y;
  const dist = (v: Vec2): number => (v.x - line.a.x) * n.x + (v.y - line.a.y) * n.y;
  const grow = (z0: number, z1: number): void => {
    out.zMin = Math.min(out.zMin, z0);
    out.zMax = Math.max(out.zMax, z1);
  };

  const componentes = Object.values(p.elements)
    .filter((e): e is Component => isComponent(e) && e.levelId === levelId)
    .sort((a, b) => a.order - b.order);

  for (const c of componentes) {
    const res = resolverComponente(p, c);
    if (res.pecas.length === 0) continue;
    const baseZ = levelElevation(p, c.levelId) + c.z;
    const origin: SectionOrigin = { componentId: c.id };

    for (const peca of res.pecas) {
      if (peca.vazio) continue;
      const ring = anelDaPeca(c, peca);
      if (!ring) continue;
      const z0 = baseZ + peca.origem[2];
      const z1 = z0 + peca.extensao[2];
      if (z1 - z0 <= 1e-9) continue;
      const materialId = resolverMaterialVisualPeca(c, peca.papel, peca.material ?? undefined);

      for (const [t0, t1] of lineIntervals([ring], line.a, d, n)) {
        const lo = Math.max(0, t0);
        const hi = Math.min(length, t1);
        if (hi - lo < EPS_T) continue;
        out.cut.push({ materialId, polygon: [rect(lo, hi, z0, z1)], origin });
        grow(z0, z1);
      }

      for (const sp of intersection([[ring]], slab)) {
        const outer = sp[0];
        if (!outer || outer.length < 3) continue;
        const ts = outer.map(along);
        const tMin = Math.max(0, Math.min(...ts));
        const tMax = Math.min(length, Math.max(...ts));
        if (tMax - tMin < EPS_T) continue;
        out.beyond.push({
          componentId: c.id,
          materialId,
          layerIndex: 0,
          depth: Math.max(0, Math.min(...outer.map(dist))),
          polygons: [[rect(tMin, tMax, z0, z1)]],
        });
        grow(z0, z1);
      }
    }
  }
  return out;
}
