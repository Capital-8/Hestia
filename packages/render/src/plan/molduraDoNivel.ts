import { add, boxOf, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { resolveAngularDimension } from '@hestia/engine';
import { angularDimensionGeometry, dimensionPoints, levelDimensions, type Id, type Project } from '@hestia/model';
import { extensaoDoModelo } from './extensaoDoModelo.ts';

/**
 * Caixa de tudo o que aparece do nível (paredes, escadas, rampas, guarda-corpos, lajes, pisos, forros, telhados...), com
 * 0,5 m de folga, para "enquadrar tudo". Vem da extensão do modelo (`extensaoDoModelo`), nunca só das paredes.
 */
export function levelBox(p: Project, levelId: Id): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const b = extensaoDoModelo(p, levelId);
  if (!b) return null;
  const pad = 0.5;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

/**
 * Caixa para enquadrar a planta na vista: a de `levelBox` mais as cotas. A linha de cota fica deslocada das paredes
 * (`offset`), então sem ela o "Enquadrar" cortava as cotas da borda e deixava a barra de escala por cima delas.
 */
export function levelFrameBox(p: Project, levelId: Id): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const base = levelBox(p, levelId);
  const pts: Vec2[] = [];
  for (const d of levelDimensions(p, levelId)) {
    if (d.angular) {
      const g = angularDimensionGeometry(resolveAngularDimension(p, levelId, d));
      if (g) pts.push(...g.arc, ...g.extensions.flat());
      continue;
    }
    const { a, b } = dimensionPoints(p, d);
    const n = perp(norm(sub(b, a)));
    pts.push(a, b, add(a, mul(n, d.offset)), add(b, mul(n, d.offset)));
  }
  if (!pts.length) return base;
  if (base) pts.push({ x: base.minX, y: base.minY }, { x: base.maxX, y: base.maxY });
  const b = boxOf(pts);
  const pad = 0.5;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

/**
 * Caixa em planta para gerar as elevações: a do nível ativo (`levelFrameBox`, com cotas) unida à extensão do MODELO
 * INTEIRO, porque a elevação desenha todos os pavimentos. Sem parede nenhuma, o que existir (escada, guarda-corpo, laje,
 * telhado...) define os limites; null só quando não há nada que apareça em elevação.
 */
export function elevationFrameBox(p: Project, levelId: Id): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const nivel = levelFrameBox(p, levelId);
  const modelo = extensaoDoModelo(p);
  if (!modelo) return nivel;
  const pad = 0.5;
  const m = { minX: modelo.minX - pad, minY: modelo.minY - pad, maxX: modelo.maxX + pad, maxY: modelo.maxY + pad };
  if (!nivel) return m;
  return { minX: Math.min(nivel.minX, m.minX), minY: Math.min(nivel.minY, m.minY), maxX: Math.max(nivel.maxX, m.maxX), maxY: Math.max(nivel.maxY, m.maxY) };
}
