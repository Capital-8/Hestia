import type { Vec2 } from '@hestia/geom';
import { pegadaDoComponente } from '@hestia/engine';
import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import type { PreviewItem } from './types.ts';

/** Deslocamento nulo da prévia. */
const ZERO: Vec2 = { x: 0, y: 0 };

/**
 * Contorno da pegada em planta de uma instância (só os anéis externos): é o fantasma da ferramenta Componente, do
 * arrasto na seleção e do Colar. `delta` desloca os anéis para a posição de destino sem tocar no modelo.
 */
export function pegadaPreviewItems(p: Project, c: Component, delta: Vec2 = ZERO, dashed = true): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (const poly of pegadaDoComponente(p, c)) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    out.push({ kind: 'polygon', ring: ring.map((q) => ({ x: q.x + delta.x, y: q.y + delta.y })), dashed });
  }
  return out;
}

/** Fantasmas da pegada dos componentes `ids` (os que existem no projeto), deslocados por `delta`. */
export function componentGhostItems(p: Project, ids: readonly Id[], delta: Vec2 = ZERO): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (const id of ids) {
    const c = p.elements[id];
    if (isComponent(c)) out.push(...pegadaPreviewItems(p, c, delta));
  }
  return out;
}
