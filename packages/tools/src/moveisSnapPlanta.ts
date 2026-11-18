import { pegadaDoComponente, resolverComponente, type PecaResolvida } from '@hestia/engine';
import type { Ring, Vec2 } from '@hestia/geom';
import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { SnapIndexado, type ArestaIndexada, type PontoIndexado } from './snapIndexado.ts';

/**
 * Captura dos MÓVEIS (componentes paramétricos) na PLANTA: cantos (`endpoint`), meios das arestas (`midpoint`) e arestas
 * (`nearest`, pé da perpendicular) da pegada e das peças visíveis em planta (frentes de portas e gavetas, tampo e recortes
 * do tampo), com `hostId` = id do componente (o `ignore` do móvel arrastado funciona). Não confundir com `componentSnap.ts`
 * (escadas, rampas e guarda-corpos) nem com o encaixe de móveis (`componentEncaixe*`).
 *
 * O resultado é um `SnapIndexado` (grade de 1 m + faixas ordenadas): cada consulta custa só o que está ao alcance do cursor,
 * como as demais fontes de planta. Memorizado por projeto (imutável) e nível.
 */

const RECORTE_REGEX = /cuba|cooktop|recorte/i;
/** Casas da chave de deduplicação (1e-5 m): cantos e arestas repetidos entre peças viram um só. */
const ESCALA_CHAVE = 1e5;

function noMundo(c: Component, lx: number, ly: number): Vec2 {
  const cos = Math.cos(c.rotation);
  const sen = Math.sin(c.rotation);
  const sx = c.mirrored ? -lx : lx;
  return { x: c.x + sx * cos - ly * sen, y: c.y + sx * sen + ly * cos };
}

function retangulo(c: Component, x0: number, y0: number, x1: number, y1: number): Ring {
  return [noMundo(c, x0, y0), noMundo(c, x1, y0), noMundo(c, x1, y1), noMundo(c, x0, y1)];
}

function anelDaPeca(c: Component, q: PecaResolvida): Ring {
  const [ox, oy] = q.origem;
  if (q.eixo === 'z' && q.contorno !== null && q.contorno.length >= 6) {
    const ring: Ring = [];
    for (let i = 0; i + 1 < q.contorno.length; i += 2) ring.push(noMundo(c, ox + q.contorno[i]!, oy + q.contorno[i + 1]!));
    return ring;
  }
  const [ex, ey] = q.extensao;
  return retangulo(c, ox, oy, ox + ex, oy + ey);
}

/** Anéis (no mundo) que contribuem com captura: pegada, frentes, tampos e recortes do componente. */
function aneisDoComponente(p: Project, c: Component): Ring[] {
  const res = resolverComponente(p, c);
  if (res.pecas.length === 0) return [];
  const aneis: Ring[] = [];
  for (const poly of pegadaDoComponente(p, c, res)) for (const ring of poly) aneis.push(ring);
  const tampos = res.pecas.filter((q) => !q.vazio && q.papel === 'tampo');
  const tampoZMin = tampos.length > 0 ? Math.min(...tampos.map((t) => t.origem[2])) - 0.05 : -Infinity;
  for (const q of res.pecas) {
    const [ox, oy] = q.origem;
    const [ex, ey] = q.extensao;
    if (!q.vazio && (q.papel === 'porta' || q.papel === 'frente_gaveta')) {
      if (ex > 1e-4 && ey > 1e-4) aneis.push(retangulo(c, ox, oy, ox + ex, oy + ey));
    } else if (!q.vazio && q.papel === 'tampo') {
      aneis.push(anelDaPeca(c, q));
      if (q.eixo === 'z') {
        for (const u of q.usinagens) {
          if (u.tipo === 'recorte' && u.comprimento > 1e-4 && u.largura > 1e-4) aneis.push(retangulo(c, ox + u.u, oy + u.v, ox + u.u + u.comprimento, oy + u.v + u.largura));
        }
      }
    } else if (q.vazio || q.papel === 'generica' || RECORTE_REGEX.test(q.id) || RECORTE_REGEX.test(q.nome)) {
      if (ex > 1e-4 && ey > 1e-4 && !(tampos.length > 0 && q.origem[2] + q.extensao[2] < tampoZMin)) aneis.push(retangulo(c, ox, oy, ox + ex, oy + ey));
    }
  }
  return aneis;
}

const chaveDe = (v: Vec2): string => `${Math.round(v.x * ESCALA_CHAVE)}:${Math.round(v.y * ESCALA_CHAVE)}`;

/** Pontos e arestas de captura de um componente, sem repetição (cantos e arestas compartilhados entre peças). */
export function moveisSnapDoComponente(p: Project, c: Component): { points: PontoIndexado[]; segments: ArestaIndexada[] } {
  const points: PontoIndexado[] = [];
  const segments: ArestaIndexada[] = [];
  const vistosP = new Set<string>();
  const vistosS = new Set<string>();
  const ponto = (v: Vec2, kind: 'endpoint' | 'midpoint'): void => {
    const k = `${kind}|${chaveDe(v)}`;
    if (vistosP.has(k)) return;
    vistosP.add(k);
    points.push({ x: v.x, y: v.y, hostId: c.id, kind });
  };
  for (const ring of aneisDoComponente(p, c)) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 1e-12) continue;
      ponto(a, 'endpoint');
      ponto({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint');
      const ka = chaveDe(a);
      const kb = chaveDe(b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (vistosS.has(k)) continue;
      vistosS.add(k);
      segments.push({ a, b, hostId: c.id, kind: 'nearest' });
    }
  }
  return { points, segments };
}

const cache = new WeakMap<Project, Map<Id, SnapIndexado>>();

/** Índice de captura dos móveis do nível (vazio sem componentes: sem custo na consulta). */
export function moveisSnapIndex(p: Project, levelId: Id): SnapIndexado {
  let porNivel = cache.get(p);
  if (!porNivel) {
    porNivel = new Map();
    cache.set(p, porNivel);
  }
  let ix = porNivel.get(levelId);
  if (!ix) {
    const points: PontoIndexado[] = [];
    const segments: ArestaIndexada[] = [];
    for (const e of Object.values(p.elements)) {
      if (!isComponent(e) || e.levelId !== levelId) continue;
      const g = moveisSnapDoComponente(p, e);
      points.push(...g.points);
      segments.push(...g.segments);
    }
    ix = new SnapIndexado(points, segments);
    porNivel.set(levelId, ix);
  }
  return ix;
}
