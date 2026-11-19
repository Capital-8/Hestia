/**
 * Vão de contorno em PAREDE CURVA com o Rust REAL (docs/estudo-esquadrias/33 §4): cortador radial em leque sobre o setor anular da
 * camada, hachura de planta, quantitativo, retorno e 3D. O removido esperado vem de uma integral em planta que não usa o kernel
 * (raio a raio sobre as cordas da camada); a fórmula fechada `A x e x rho_medio / R` confere com tolerância das cordas.
 * Roda só em `npm run test:wasm` (`KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { multiArea, type Arc, type MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, outline, type Opening, type OpeningShape, type OPt, type Project } from '@hestia/model';
import {
  areaPerimetroDoContorno, camadaFurada, clienteFuroContorno, definirClienteFuroContorno, frameOfWall, instalarClienteFuroReal, openingGeometry, openingShapeIssues, quantifyLevel, resolveLevel, rotaDoVao,
  type ClienteFuroContorno, type LayerBand, type ResolvedLayer, type ResolvedWall,
} from '../packages/engine/src/index.ts';
import { buildLevelSolids, clearWallLayerCache } from '../packages/render/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
const temExportacoes = ((): boolean => {
  if (!bytes) return false;
  try {
    const n = WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(bytes))).map((e) => e.name);
    return ['furo_prisma_furar_curvo', 'furo_retorno_vao_curvo'].every((x) => n.includes(x));
  } catch {
    return false;
  }
})();

const H = 3;
const MEIA_LUA: OpeningShape = { kind: 'round', width: 1.2, height: 0.6 };
const ABATIDO: OpeningShape = { kind: 'segmental', width: 1.4, height: 2.4, rise: 0.3 };

interface Vao {
  id: string;
  forma?: OpeningShape;
  w: number;
  h: number;
  sill: number;
  kind: 'window' | 'door';
  offset: number;
  closure?: 'none' | 'both';
}
const janela: Vao = { id: 'lua', forma: MEIA_LUA, w: 1.2, h: 0.6, sill: 2.1, kind: 'window', offset: 2.2 };
const arco: Vao = { id: 'arco', forma: ABATIDO, w: 1.4, h: 2.4, sill: 0, kind: 'door', offset: 4.4 };
const arcoComRetorno: Vao = { ...arco, closure: 'both' };
const retangular: Vao = { id: 'ret', w: 0.9, h: 2.1, sill: 0, kind: 'door', offset: 0.9 };

/** Parede de corda 6 m e flecha `sag` (m): `sag > 0` abaula à esquerda (centro à direita). */
function projeto(vaos: Vao[], sag: number): Project {
  const base = createEmptyProject();
  for (const v of vaos) base.openingTypes[`ot_${v.id}`] = { ...base.openingTypes.ot_j120!, id: `ot_${v.id}`, width: v.w, height: v.h, sill: v.sill, leaves: 0, closure: v.closure ?? 'none', ...(v.forma ? { shape: v.forma } : {}) };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: H, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, sag }) });
  for (const v of vaos) s.exec({ type: 'addOpening', opening: { id: `o_${v.id}`, kind: v.kind, typeId: `ot_${v.id}`, hostId: 'w1', offset: v.offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  return s.project;
}

const lv = (p: Project) => resolveLevel(p, 'lv_0');
const geom = (p: Project, id: string) => openingGeometry(p, p.elements[id] as Opening, frameOfWall(p, 'w1')!);

/** Comprimento em z do contorno em x, recortado a [z0, z1] (cota absoluta já somada à soleira). */
function larguraZ(c: readonly OPt[], x: number, sill: number, z0: number, z1: number): number {
  const zs: number[] = [];
  c.forEach((a, i) => {
    const b = c[(i + 1) % c.length]!;
    if (a[0] <= x !== b[0] <= x) zs.push(a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
  });
  zs.sort((p, q) => p - q);
  let w = 0;
  for (let i = 0; i + 1 < zs.length; i += 2) w += Math.max(0, Math.min(z1, sill + zs[i + 1]!) - Math.max(z0, sill + zs[i]!));
  return w;
}

/** Integral de rho d(rho) ao longo do raio de ângulo `th` dentro do anel (interseção exata com as cordas). */
function momentoRadial(arc: Arc, th: number, anel: ReadonlyArray<{ x: number; y: number }>): number {
  const c = arc.center;
  const d = { x: Math.cos(th), y: Math.sin(th) };
  const rs: number[] = [];
  anel.forEach((a, i) => {
    const b = anel[(i + 1) % anel.length]!;
    const e = { x: b.x - a.x, y: b.y - a.y };
    const f = { x: a.x - c.x, y: a.y - c.y };
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-14) return;
    const rho = (f.x * e.y - f.y * e.x) / den;
    const u = (f.x * d.y - f.y * d.x) / den;
    if (rho > 0 && u >= 0 && u < 1) rs.push(rho);
  });
  rs.sort((p, q) => p - q);
  let m = 0;
  for (let i = 0; i + 1 < rs.length; i += 2) m += 0.5 * (rs[i + 1]! ** 2 - rs[i]! ** 2);
  return m;
}

/** Removido esperado (m³) de um vão sobre as faixas de uma camada, por integração raio a raio em planta. */
function removidoIntegral(arc: Arc, bands: LayerBand[], forma: OpeningShape, offset: number, sill: number): number {
  const c = outline(forma);
  const xs = c.map((q) => q[0]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const dir = arc.sweep < 0 ? -1 : 1;
  const n = 20000;
  let tot = 0;
  for (const b of bands) {
    const anel = (b.poly as MultiPolygon).flatMap((poly) => poly[0] ? [poly[0]] : []);
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
      const th = arc.a0 + (dir * (offset + x)) / arc.radius;
      const w = larguraZ(c, x, sill, b.z0, b.z1);
      if (w === 0) continue;
      let m = 0;
      for (const a of anel) m += momentoRadial(arc, th, a);
      tot += (w * m) / arc.radius;
    }
  }
  return (tot * (x1 - x0)) / n;
}

const arcDe = (rw: ResolvedWall): Arc => rw.furosContorno![0]!.g.curve!.arc;
const espDe = (p: Project, l: ResolvedLayer): number => p.wallTypes.wt_alv14!.layers[l.layerIndex]!.thickness;

let real: ClienteFuroContorno;

describe.skipIf(!temExportacoes)(`furo por contorno em parede curva, Rust real (doc 33 §4; pulado sem as exportações; wasm: ${caminho})`, () => {
  beforeAll(async () => {
    definirClienteFuroContorno(null);
    const r = await instalarClienteFuroReal(bytes as Uint8Array);
    expect(r).toMatchObject({ instalado: true, prisma: true, retorno: true });
    real = clienteFuroContorno()!;
  });
  afterAll(() => {
    definirClienteFuroContorno(null);
    clearWallLayerCache();
  });

  it('o cliente real declara `curva` e a rota do vão em parede curva passa a ser contorno; sem `curva` fica retangular com o motivo', () => {
    expect(real.curva).toBe(true);
    const p = projeto([janela, retangular], 1);
    expect(rotaDoVao(geom(p, 'o_lua'), {})).toEqual({ via: 'contorno' });
    expect(rotaDoVao(geom(p, 'o_lua'), { perfil: true })).toEqual({ via: 'retangular', motivo: 'parede-curva-com-perfil' });
    definirClienteFuroContorno({ ...real, curva: undefined });
    expect(rotaDoVao(geom(p, 'o_lua'), {})).toEqual({ via: 'retangular', motivo: 'parede-curva' });
    expect(openingShapeIssues(p).some((i) => i.code === 'forma-vao-ignorada-na-parede')).toBe(true);
    definirClienteFuroContorno(real);
    expect(openingShapeIssues(p).some((i) => i.code === 'forma-vao-ignorada-na-parede')).toBe(false);
    const rw = lv(p).walls.w1!;
    expect(rw.furosContorno).toHaveLength(1); // o vão retangular segue pelo caminho de sempre
  });

  for (const sag of [1, -1]) {
    describe(`parede de corda 6 m, flecha ${sag} (${sag > 0 ? 'centro à direita' : 'centro à esquerda'})`, () => {
      it('volume removido por camada = integral independente em planta e = A x e x rho_medio / R (meia-lua e arco abatido)', () => {
        const p = projeto([janela, arco], sag);
        const rw = lv(p).walls.w1!;
        expect(rw.furosContorno).toHaveLength(2);
        const arc = arcDe(rw);
        expect(arc.k).toBe(sag > 0 ? 1 : -1);
        for (const l of rw.layers) {
          const cf = camadaFurada(rw, l, l.bands)!;
          expect(cf.malhas).not.toBeNull();
          let esperado = 0;
          for (const v of [janela, arco]) esperado += removidoIntegral(arc, l.bands, v.forma!, v.offset, v.sill);
          expect(cf.removido).toBeGreaterThan(0);
          expect(Math.abs(cf.removido - esperado)).toBeLessThanOrEqual(5e-4 * esperado);
          // Fórmula fechada com a camada em círculos exatos: as cordas tiram ~0,1 % da área.
          const rhos = l.bands[0]!.poly.flatMap((poly) => poly[0]!).map((q) => Math.hypot(q.x - arc.center.x, q.y - arc.center.y));
          const rhoMedio = (Math.min(...rhos) + Math.max(...rhos)) / 2;
          const fechada = (areaPerimetroDoContorno(janela.forma!).area + areaPerimetroDoContorno(arco.forma!).area) * espDe(p, l) * (rhoMedio / arc.radius);
          expect(Math.abs(cf.removido - fechada)).toBeLessThanOrEqual(5e-3 * fechada);
        }
      });

      it('quantitativo: volume da parede = sem vão menos o removido; área de face cai removido ÷ espessura; vão usa a área real', () => {
        const p = projeto([janela, arco], sag);
        const sem = projeto([], sag);
        const rw = lv(p).walls.w1!;
        const q = quantifyLevel(p, lv(p));
        const q0 = quantifyLevel(sem, lv(sem));
        const removido = rw.layers.reduce((s, l) => s + camadaFurada(rw, l, l.bands)!.removido, 0);
        const retornos = rw.layers.reduce((s, l) => s + camadaFurada(rw, l, l.bands)!.retornos.reduce((a, r) => a + r.volume, 0), 0);
        expect(q.walls[0]!.volume).toBeCloseTo(q0.walls[0]!.volume - removido + retornos, 6);
        const face = (qq: typeof q) => Object.values(qq.faceAreaByMaterial).reduce((a, b) => a + b, 0);
        const esperadoFace = rw.layers.reduce((s, l) => s + camadaFurada(rw, l, l.bands)!.removido / espDe(p, l), 0);
        expect(face(q0) - face(q)).toBeCloseTo(esperadoFace, 6);
        expect(q.walls[0]!.openingsArea).toBeCloseTo(areaPerimetroDoContorno(janela.forma!).area + areaPerimetroDoContorno(arco.forma!).area, 9);
      });

      it('hachura de planta: o furo na cota do corte é o setor da corda do contorno (arco abatido a 2,3 m e a 1,2 m)', () => {
        const p = projeto([arco], sag);
        const sem = projeto([], sag);
        for (const cutZ of [1.2, 2.3]) {
          const rw = resolveLevel(p, 'lv_0', undefined, { cutZ }).walls.w1!;
          const rw0 = resolveLevel(sem, 'lv_0', undefined, { cutZ }).walls.w1!;
          const arc = arcDe(rw);
          const meia = cutZ === 1.2 ? 0.7 : Math.sqrt(((0.7 ** 2 + 0.3 ** 2) / 0.6) ** 2 - (cutZ - (2.4 - (0.7 ** 2 + 0.3 ** 2) / 0.6)) ** 2);
          for (const l of rw.layers) {
            const l0 = rw0.layers.find((x) => x.layerIndex === l.layerIndex)!;
            const rhos = l0.cut.flatMap((poly) => poly[0]!).map((q) => Math.hypot(q.x - arc.center.x, q.y - arc.center.y));
            const dif = multiArea(l0.cut) - multiArea(l.cut);
            const esperado = (0.5 * (Math.max(...rhos) ** 2 - Math.min(...rhos) ** 2) * (2 * meia)) / arc.radius;
            expect(Math.abs(dif - esperado)).toBeLessThanOrEqual(6e-3 * esperado);
          }
        }
      });

      it('3D: o volume da malha do bloco = sem vão menos o removido (e os retornos entram na malha)', () => {
        const p = projeto([janela, arco], sag);
        const sem = projeto([], sag);
        const vol = (pp: Project, mat: string): number => {
          clearWallLayerCache();
          const bs = buildLevelSolids(lv(pp)).batches.filter((x) => x.materialId === mat);
          return Math.abs(bs.reduce((s, b) => {
            let v = 0;
            for (let i = 0; i < b.indices.length; i += 3) {
              const k = (j: number) => [b.positions[b.indices[i + j]! * 3]!, b.positions[b.indices[i + j]! * 3 + 1]!, b.positions[b.indices[i + j]! * 3 + 2]!] as const;
              const [a, c, d] = [k(0), k(1), k(2)];
              v += (a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0])) / 6;
            }
            return s + v;
          }, 0));
        };
        const rw = lv(p).walls.w1!;
        const l = rw.layers.find((x) => p.wallTypes.wt_alv14!.layers[x.layerIndex]!.materialId === 'mat_bloco14')!;
        const cf = camadaFurada(rw, l, l.bands)!;
        // O bloco é núcleo: não tem retorno; o 3D da camada é `volume sem vão - removido` até as cordas do tampo do kernel.
        const esperado = vol(sem, 'mat_bloco14') - cf.removido;
        expect(Math.abs(vol(p, 'mat_bloco14') - esperado)).toBeLessThanOrEqual(1e-6 * esperado + 1e-6);
      });

      it('retorno do acabamento no vão curvo: peça radial, volume = anel x profundidade x rho/R, vértices entre as faces', () => {
        const p = projeto([arcoComRetorno], sag);
        const rw = lv(p).walls.w1!;
        const arc = arcDe(rw);
        const f = rw.furosContorno![0]!;
        expect(f.retornos.length).toBeGreaterThan(0);
        let achou = 0;
        for (const l of rw.layers) {
          const cf = camadaFurada(rw, l, l.bands)!;
          const dos = f.retornos.filter((r) => r.layerIndex === l.layerIndex);
          expect(cf.retornos).toHaveLength(dos.length);
          cf.retornos.forEach((r, k) => {
            const d = dos[k]!;
            achou++;
            expect(r.volume).toBeGreaterThan(0);
            // O anel desenvolvido do contorno (vão que toca o piso: sem a soleira) tem área <= perímetro x espessura; o volume cresce
            // com rho/R: confere contra o teto com o raio externo da camada.
            const perimetro = areaPerimetroDoContorno(f.g.forma!).perimetro;
            const rhoMax = arc.radius + arc.k * Math.max(d.y0, d.y1);
            expect(r.volume).toBeLessThanOrEqual(perimetro * d.espessura * Math.abs(d.y1 - d.y0) * (rhoMax / arc.radius) * (1 + 1e-6));
            for (let i = 0; i < r.vertices.length; i += 3) {
              const [x, y] = [r.vertices[i]!, r.vertices[i + 1]!];
              // referencial local: centro em (0, -k R); ponto no mundo = a + u x + n y
              const rho = Math.hypot(x, y + arc.k * arc.radius);
              const rhoMin = arc.radius + arc.k * Math.min(d.y0, d.y1), rhoMx = arc.radius + arc.k * Math.max(d.y0, d.y1);
              expect(rho).toBeGreaterThan(Math.min(rhoMin, rhoMx) - 1e-6);
              expect(rho).toBeLessThan(Math.max(rhoMin, rhoMx) + 1e-6);
            }
          });
        }
        expect(achou).toBeGreaterThan(0);
      });
    });
  }

  it('vão retangular em parede reta e em parede curva segue pelo caminho de sempre: nada muda sem forma', () => {
    const p = projeto([retangular], 1);
    expect(lv(p).walls.w1!.furosContorno).toBeUndefined();
    const reta = projeto([janela], 0);
    expect(rotaDoVao(geom(reta, 'o_lua'), {})).toEqual({ via: 'contorno' });
    expect(lv(reta).walls.w1!.furosContorno).toHaveLength(1);
  });
});

describe.skipIf(!temExportacoes)('vistas de parede curva: corte oblíquo ao eixo do vão mantém o furo retangular (sem regressão)', () => {
  beforeAll(async () => {
    definirClienteFuroContorno(null);
    await instalarClienteFuroReal(bytes as Uint8Array);
  });
  afterAll(() => definirClienteFuroContorno(null));

  it('o corte vertical a x = 4,18 m atravessa o arco abatido e a parede não fica maciça no vão', async () => {
    const { computeSection } = await import('../packages/engine/src/index.ts');
    const area = (p: Project): number => {
      const r = computeSection(p, { a: { x: 4.18, y: -3 }, b: { x: 4.18, y: 4 }, depth: 3 });
      return r.cut.reduce((s, c) => s + multiArea(c.polygons), 0);
    };
    const cheia = area(projeto([], 1));
    const furada = area(projeto([arco], 1));
    expect(cheia - furada).toBeGreaterThan(0.5 * 2.0 * 0.14);
  });
});
