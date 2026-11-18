/**
 * Furo por contorno com as formas novas do vão (docs/estudo-esquadrias/32): empena, trapézio (topo menor e topo maior), ferradura e
 * polígono livre (convexo e côncavo), com o Rust REAL. O contorno de `outline()` vai pela ABI e o volume removido tem que ser a
 * área do contorno x espessura, camada por camada, no cliente de parede e no de prisma pós-junção. Roda só em `npm run test:wasm`
 * (`KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm`); sem o binário com as exportações, a suíte é pulada.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, outline, validateOpeningShape, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { areaPerimetroDoContorno, camadaFurada, clienteFuroContorno, definirClienteFuroContorno, diagnosticoFuroReal, frameOfWall, instalarClienteFuroReal, openingGeometry, resolveLevel } from '../packages/engine/src/index.ts';
import { clearWallLayerCache } from '../packages/render/src/index.ts';
import { carregarFuroContorno, furarParedePorContorno } from '../packages/geom/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
const temExportacoes = ((): boolean => {
  if (!bytes) return false;
  try {
    const n = WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(bytes))).map((e) => e.name);
    return ['furo_contorno_furar', 'furo_prisma_furar', 'furo_retorno_vao'].every((x) => n.includes(x));
  } catch {
    return false;
  }
})();

const L = 6;
const H = 3;
const poly = (...pts: Array<[number, number]>): Array<{ u: number; v: number }> => pts.map(([u, v]) => ({ u, v }));
/** Cada forma com o vão (w x h) e o peitoril; o tipo base só dá os materiais. */
const FORMAS: Array<{ nome: string; shape: OpeningShape; sill: number }> = [
  { nome: 'empena', shape: { kind: 'gable', width: 1.2, height: 1.5, rise: 0.5 }, sill: 0.9 },
  { nome: 'empena triangular', shape: { kind: 'gable', width: 1, height: 1.2, rise: 1.2 }, sill: 1.2 },
  { nome: 'trapézio (topo menor)', shape: { kind: 'trapezoid', width: 1.4, height: 1.1, topWidth: 0.7 }, sill: 1 },
  { nome: 'trapézio (topo maior)', shape: { kind: 'trapezoid', width: 1.4, height: 1.1, topWidth: 1.4, baseWidth: 0.8 }, sill: 1 },
  { nome: 'ferradura', shape: { kind: 'horseshoe', width: 1, height: 2.1, neck: 0.8 }, sill: 0 },
  { nome: 'polígono convexo (casinha assimétrica)', shape: { kind: 'polygon', width: 1.1, height: 1.6, points: poly([0, 0], [1.1, 0], [1.1, 1.0], [0.3, 1.6], [0, 1.2]) }, sill: 0.8 },
  { nome: 'polígono côncavo (L)', shape: { kind: 'polygon', width: 1.2, height: 1.2, points: poly([0, 0], [1.2, 0], [1.2, 0.4], [0.4, 0.4], [0.4, 1.2], [0, 1.2]) }, sill: 0.9 },
  { nome: 'polígono côncavo (estrela de 5 pontas)', shape: { kind: 'polygon', width: 1, height: 0.95, points: estrela() }, sill: 1 },
];

/** Estrela de cinco pontas, anti-horária, na caixa 1 x 0,95 (pontas para cima). */
function estrela(): Array<{ u: number; v: number }> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.2;
    const a = (i * Math.PI) / 5 + Math.PI / 2;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...zs) - z0;
  return pts.map(([x, z]) => ({ u: ((x - x0) / w) * 1, v: ((z - z0) / h) * 0.95 }));
}

function projeto(shape: OpeningShape, sill: number, closure: 'none' | 'both' = 'none'): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_forma = { ...base.openingTypes.ot_j120!, id: 'ot_forma', width: shape.width, height: shape.height, sill, leaves: 0, closure, shape };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: H, a: { x: 0, y: 0 }, b: { x: L, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'o_forma', kind: 'window', typeId: 'ot_forma', hostId: 'w1', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  return s.project;
}

const geom = (p: Project) => openingGeometry(p, p.elements.o_forma as Opening, frameOfWall(p, 'w1')!);
const espessuras = (p: Project): number[] => p.wallTypes.wt_alv14!.layers.map((l) => l.thickness);

describe.skipIf(!temExportacoes)(`furo por contorno real com as formas novas (pulado sem KERNEL_WASM_PATH com as exportações; wasm: ${caminho})`, () => {
  beforeAll(async () => {
    definirClienteFuroContorno(null);
    const r = await instalarClienteFuroReal(bytes as Uint8Array);
    expect(r).toMatchObject({ instalado: true, prisma: true });
    expect(clienteFuroContorno()).not.toBeNull();
    await carregarFuroContorno(bytes as Uint8Array);
  });
  afterAll(() => {
    definirClienteFuroContorno(null);
    clearWallLayerCache();
  });

  for (const { nome, shape, sill } of FORMAS) {
    describe(nome, () => {
      it('a forma é válida e o contorno é simples e anti-horário (o Rust recusa o resto)', () => {
        expect(validateOpeningShape(shape)).toEqual([]);
        expect(areaPerimetroDoContorno(shape).area).toBeGreaterThan(0);
      });

      it('ABI de parede (furo_contorno_furar): volume removido = área x espessura, por camada e no total', () => {
        const ring = outline(shape);
        const { area } = areaPerimetroDoContorno(shape);
        const camadas = espessuras(projeto(shape, sill));
        const r = furarParedePorContorno([{ contorno: ring, x: 3, soleira: sill }], camadas, L, H);
        r.camadas.forEach((c, k) => expect(Math.abs(c.volumeSemFuro - c.volume - area * camadas[k]!)).toBeLessThan(1e-9));
        expect(Math.abs(r.volumeRemovido - area * camadas.reduce((a, b) => a + b, 0))).toBeLessThan(1e-9);
      });

      it('cliente de prisma pós-junção (resolveLevel + camadaFurada): cada camada remove área x espessura sem falha', () => {
        const p = projeto(shape, sill);
        const antes = diagnosticoFuroReal();
        const rw = resolveLevel(p, 'lv_0').walls.w1!;
        expect(rw.furosContorno?.map((f) => f.g.openingId)).toEqual(['o_forma']);
        const { area } = areaPerimetroDoContorno(geom(p).forma!);
        for (const l of rw.layers) {
          const cf = camadaFurada(rw, l, l.bands)!;
          expect(cf.malhas, `camada ${l.layerIndex} furada pelo cliente`).not.toBeNull();
          expect(cf.removido).toBeCloseTo(area * espessuras(p)[l.layerIndex]!, 9);
        }
        const dep = diagnosticoFuroReal();
        expect(dep.chamadasPrisma).toBeGreaterThan(antes.chamadasPrisma);
        expect(dep.falhas).toBe(antes.falhas);
      });
    });
  }

  it('retorno do acabamento (closure both) segue o contorno de cada forma nova, sem falha do Rust', () => {
    for (const { nome, shape, sill } of FORMAS) {
      const p = projeto(shape, sill, 'both');
      const antes = diagnosticoFuroReal();
      const rw = resolveLevel(p, 'lv_0').walls.w1!;
      const rets = rw.furosContorno![0]!.retornos;
      expect(rets.length, nome).toBeGreaterThan(1);
      for (const l of rw.layers) {
        const cf = camadaFurada(rw, l, l.bands)!;
        expect(cf.retornos.length, `${nome}, camada ${l.layerIndex}`).toBe(rets.filter((x) => x.layerIndex === l.layerIndex).length);
        for (const r of cf.retornos) expect(r.volume).toBeGreaterThan(0);
      }
      expect(diagnosticoFuroReal().falhas, nome).toBe(antes.falhas);
    }
  });

  it('o furo não é o retângulo: a área removida é menor que largura x altura, exceto no trapézio com topo = base', () => {
    for (const { shape, sill } of FORMAS) {
      const g = geom(projeto(shape, sill));
      expect(areaPerimetroDoContorno(g.forma!).area).toBeLessThan(g.roughWidth * g.roughHeight);
    }
  });
});
