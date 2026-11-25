import { describe, expect, it } from 'vitest';
import { resolveRoofs } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeRoof, type Id } from '@hestia/model';
import { arestasPorAngulo } from './arestasRapidas3d.ts';
import { ANGULO_ARESTA_TELHADO, arestasDosLotes } from './lotesMalha3d.ts';
import { buildRoofSolids } from './solids.ts';

const P = (x: number, y: number) => ({ x, y });
const EDGE_ANGLE_DAS_PECAS = 28;

function telhado(shape: 'hip' | 'gable', boundary: ReturnType<typeof P>[], percent: number) {
  const st = new ProjectStore(createEmptyProject());
  st.exec({ type: 'addRoof', roof: makeRoof({ id: 'r' as Id, typeId: 'rt_ceramica', levelId: 'lv_0', boundary, heightOffset: 2.8, shape, slopePercent: percent, dir: P(1, 0) } as never) });
  return resolveRoofs(st.project, 'lv_0');
}

/** Segmentos de aresta desenhados (par de pontos) cujos dois extremos estão sobre a reta a→b (no plano), dentro de 1e-3. */
function arestasSobre(g: ReturnType<typeof arestasDosLotes> | number[], a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (!g) return 0;
  const pos = Array.isArray(g) ? g : g.getAttribute('position').array;
  const sobre = (x: number, y: number): boolean => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy);
    return t > -1e-6 && t < 1 + 1e-6 && Math.hypot(a.x + t * dx - x, a.y + t * dy - y) < 1e-3;
  };
  let n = 0;
  for (let i = 0; i < pos.length; i += 6) {
    // Só aresta inclinada em planta (comprimento horizontal > 0,5 m): as verticais dos cantos passam pelo mesmo ponto.
    if (Math.hypot(pos[i + 3]! - pos[i]!, pos[i + 4]! - pos[i + 1]!) < 0.5) continue;
    if (sobre(pos[i]!, pos[i + 1]!) && sobre(pos[i + 3]!, pos[i + 4]!)) n++;
  }
  return n;
}

describe('arestas do telhado no 3D: espigão e rincão aparecem, não só a cumeeira', () => {
  it('o limite do telhado é menor que o das outras peças e maior que a faceta de um arco (7,5°)', () => {
    expect(ANGULO_ARESTA_TELHADO).toBe(8);
    expect(ANGULO_ARESTA_TELHADO).toBeLessThan(EDGE_ANGLE_DAS_PECAS);
    expect(ANGULO_ARESTA_TELHADO).toBeGreaterThan(7.5);
  });

  it('com o limite de 28° das outras peças o espigão de um telhado a 30% NÃO era desenhado (a causa do defeito)', () => {
    const lotes = buildRoofSolids(telhado('hip', [P(0, 0), P(8, 0), P(8, 4), P(0, 4)], 30));
    let antigas: number[] = [];
    // A camada de telha é a que se vê por cima (a de madeira, por baixo, já tinha a aresta).
    for (const l of lotes.filter((b) => b.materialId === 'mat_telha_ceramica')) antigas = antigas.concat(arestasPorAngulo(l.positions, l.indices, EDGE_ANGLE_DAS_PECAS));
    expect(antigas.length).toBeGreaterThan(0);
    expect(arestasSobre(antigas, P(0, 0), P(2, 2))).toBe(0);
    // a cumeeira (4 m de comprimento, de (2,2) a (6,2)) já era desenhada
    expect(arestasSobre(antigas, P(2, 2), P(6, 2))).toBeGreaterThan(0);
  });

  it('o espigão (diagonal do canto) ganha aresta com o limite do telhado, em 30%, 15% e 10% de inclinação', () => {
    for (const pct of [30, 15, 10]) {
      const lotes = buildRoofSolids(telhado('hip', [P(0, 0), P(8, 0), P(8, 4), P(0, 4)], pct));
      const g = arestasDosLotes(lotes.filter((b) => b.materialId === 'mat_telha_ceramica'), EDGE_ANGLE_DAS_PECAS);
      expect(g, `${pct}%`).not.toBeNull();
      // Cada espigão deve aparecer com pelo menos uma aresta; as quatro diagonais saem dos cantos para a cumeeira.
      const diagonais = [
        [P(0, 0), P(2, 2)],
        [P(8, 0), P(6, 2)],
        [P(8, 4), P(6, 2)],
        [P(0, 4), P(2, 2)],
      ] as const;
      for (const [a, b] of diagonais) expect(arestasSobre(g, a, b), `${pct}% espigão ${a.x},${a.y}`).toBeGreaterThan(0);
    }
  });

  it('o limite do telhado só vale para telhado: a mesma geometria numa parede mantém o limite pedido', () => {
    const lotes = buildRoofSolids(telhado('hip', [P(0, 0), P(8, 0), P(8, 4), P(0, 4)], 30));
    const comoParede = lotes.filter((b) => b.materialId === 'mat_telha_ceramica').map((l) => ({ ...l, category: 'wall' as const }));
    expect(comoParede.length).toBeGreaterThan(0);
    expect(arestasSobre(arestasDosLotes(comoParede, EDGE_ANGLE_DAS_PECAS), P(0, 0), P(2, 2))).toBe(0);
  });

  it('telhado em L (rincão no canto interno) em 30%, 15% e 10%: toda linha de espigão e de rincão tem aresta desenhada na telha', () => {
    const L = [P(0, 0), P(8, 0), P(8, 4), P(4, 4), P(4, 8), P(0, 8)];
    for (const pct of [30, 15, 10]) {
      const roofs = telhado('hip', L, pct);
      const linhas = roofs.flatMap((r) => r.lines).filter((l) => l.kind === 'hip' || l.kind === 'valley');
      expect(linhas.some((l) => l.kind === 'valley'), `${pct}% tem rincão`).toBe(true);
      const g = arestasDosLotes(buildRoofSolids(roofs).filter((b) => b.materialId === 'mat_telha_ceramica'), EDGE_ANGLE_DAS_PECAS);
      for (const l of linhas) {
        if (Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) < 0.5) continue;
        expect(arestasSobre(g, l.a, l.b), `${pct}% ${l.kind} (${l.a.x},${l.a.y})→(${l.b.x},${l.b.y})`).toBeGreaterThan(0);
      }
    }
  });
});
