import { describe, expect, it } from 'vitest';
import { multiArea } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { computeSection } from './index.ts';

/** F2.6 · corte e elevação da parede inclinada: paralelogramo de base t/cosθ, topo deslocado H·tanθ. */

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
function build(a: P, b: P, tilt?: number, sag?: number): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_t', levelId: 'lv_0', height: 3, a, b, ...(tilt ? { tilt } : {}), ...(sag ? { sag } : {}) }) as Wall });
  return s.project;
}
const pts = (r: { cut: Array<{ polygons: { x: number; y: number }[][][] }> }): { x: number; y: number }[] => r.cut.flatMap((c) => c.polygons.flat(2));
const at = (v: { x: number; y: number }[], z: number): [number, number] => {
  const t = v.filter((q) => Math.abs(q.y - z) < 1e-6).map((q) => q.x);
  return [Math.min(...t), Math.max(...t)];
};

describe('F2.6 · corte inclinado', () => {
  // linha de corte perpendicular ao eixo: de (2,-3) a (2,3); t = y + 3 (observador à esquerda: +x? irrelevante)
  const line = { a: { x: 2, y: -3 }, b: { x: 2, y: 3 }, depth: 3 };

  it('15°: paralelogramo, base 0,2071, topo deslocado 0,8038, área t/cosθ·H', () => {
    const r = computeSection(build({ x: 0, y: 0 }, { x: 4, y: 0 }, 15), line);
    const v = pts(r);
    const [b0, b1] = at(v, 0);
    const [h0, h1] = at(v, 3);
    expect(b1 - b0).toBeCloseTo(0.2070552, 4);
    expect(h1 - h0).toBeCloseTo(0.2070552, 4);
    expect(b0).toBeCloseTo(3 - 0.1035276, 4);
    expect(h0 - b0).toBeCloseTo(0.8038476, 4);
    expect(multiArea(r.silhouette)).toBeCloseTo(0.2070552 * 3, 4); // 0,6212
    expect(r.zMax - r.zMin).toBeCloseTo(3, 6);
  });

  it('tilt negativo: topo desloca para o outro lado', () => {
    const r = computeSection(build({ x: 0, y: 0 }, { x: 4, y: 0 }, -15), line);
    const v = pts(r);
    expect(at(v, 3)[0] - at(v, 0)[0]).toBeCloseTo(-0.8038476, 4);
  });

  it('30°: base 0,2309 e topo deslocado 1,7321', () => {
    const r = computeSection(build({ x: 0, y: 0 }, { x: 4, y: 0 }, 30), line);
    const v = pts(r);
    expect(at(v, 0)[1] - at(v, 0)[0]).toBeCloseTo(0.2309401, 4);
    expect(at(v, 3)[0] - at(v, 0)[0]).toBeCloseTo(1.7320508, 4);
  });

  it('vertical: retângulo idêntico ao de hoje (0,2 x 3) e tilt=0 igual ao campo ausente', () => {
    const a = computeSection(build({ x: 0, y: 0 }, { x: 4, y: 0 }), line);
    const b = computeSection(build({ x: 0, y: 0 }, { x: 4, y: 0 }, 0), line);
    expect(b).toEqual(a);
    const v = pts(a);
    expect(at(v, 0)).toEqual(at(v, 3));
    expect(multiArea(a.silhouette)).toBeCloseTo(0.6, 9);
  });

  it('arco 15° cortado pelo meio (perpendicular à corda): topo desloca 0,8038 radialmente', () => {
    const c = 5 * Math.SQRT2;
    const sag = 5 - 5 * Math.cos(Math.PI / 4);
    // meio do arco: x = c/2; a linha vertical atravessa o arco na sua flecha (y = +sag, ponto mais à esquerda de a→b)
    const ln = { a: { x: c / 2, y: -3 }, b: { x: c / 2, y: 3 }, depth: 3 };
    const r = computeSection(build({ x: 0, y: 0 }, { x: c, y: 0 }, 15, sag), ln);
    const v = pts(r);
    // eixo cruza a linha em y = sag; t = y + 3. Afastando do centro (centro à direita, y<0): topo vai a +y
    expect(at(v, 0)[0]).toBeCloseTo(3 + sag - 0.1035276, 3);
    expect(at(v, 0)[1]).toBeCloseTo(3 + sag + 0.1035276, 3);
    expect(at(v, 3)[0]).toBeCloseTo(3 + sag + 0.8038476 - 0.1035276, 3);
    expect(at(v, 3)[1]).toBeCloseTo(3 + sag + 0.8038476 + 0.1035276, 3);
  });

  it('elevação (linha fora, olhando a face): projeção em t cobre 0..4 e a face tem a profundidade da base', () => {
    const r = computeSection(build({ x: 0, y: 0 }, { x: 4, y: 0 }, 15), { a: { x: 0, y: -2 }, b: { x: 4, y: -2 }, depth: 4 });
    expect(r.cut).toHaveLength(0);
    const b = r.beyond.find((x) => x.wallId === 'A')!;
    const v = b.polygons.flat(2);
    expect(Math.min(...v.map((q) => q.x))).toBeCloseTo(0, 4);
    expect(Math.max(...v.map((q) => q.x))).toBeCloseTo(4, 4);
    expect(b.depth).toBeCloseTo(2 - 0.1035276, 4); // base mais próxima do plano: y = -0,1035
    expect(Math.max(...v.map((q) => q.y))).toBeCloseTo(3, 6);
  });

  it('elevação a partir do lado para onde o topo avança: profundidade é a do topo mais próximo', () => {
    // linha em y=+2 olhando para -y (a→b invertida); parede 15° (topo em +y) fica mais perto no topo
    const r = computeSection(build({ x: 0, y: 0 }, { x: 4, y: 0 }, 15), { a: { x: 4, y: 2 }, b: { x: 0, y: 2 }, depth: 4 });
    const b = r.beyond.find((x) => x.wallId === 'A')!;
    expect(b.depth).toBeCloseTo(2 - 0.8038476 - 0.1035276, 4);
  });
});
