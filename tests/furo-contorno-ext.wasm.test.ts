/**
 * Extensões do furo por contorno com o Rust REAL (docs/estudo-esquadrias/33): área de face pela `furo_quant_parede`, retorno sem
 * soleira no vão que toca o piso, retorno em canto recortado contra a parede vizinha, vão que sai do envelope da parede
 * (furo recortado + aviso) e parede com perfil de topo inclinado. Roda só em `npm run test:wasm`
 * (`KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm`); sem as exportações novas, a suíte é pulada.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intersection, multiArea, pointInMulti, type MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeFloor, makeWall, outline, profileHeightAt, type Opening, type OpeningShape, type Project, type ProfilePoint } from '@hestia/model';
import {
  areaPerimetroDoContorno, camadaFurada, clienteFuroContorno, definirClienteFuroContorno, frameOfWall, instalarClienteFuroReal, openingGeometry, openingShapeIssues, quantifyLevel, resolveLevel,
  type ClienteFuroContorno, type PedidoQuantParede,
} from '../packages/engine/src/index.ts';
import { buildLevelSolids, clearWallLayerCache } from '../packages/render/src/index.ts';
import { carregarFuroPrisma, carregarFuroQuant, furarPrismas, furoPrismaExtCarregado, furoRetornoExtCarregado, retornoDoContorno } from '../packages/geom/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
const temExportacoes = ((): boolean => {
  if (!bytes) return false;
  try {
    const n = WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(bytes))).map((e) => e.name);
    return ['furo_prisma_furar_ext', 'furo_retorno_vao_ext', 'furo_quant_parede'].every((x) => n.includes(x));
  } catch {
    return false;
  }
})();

const L = 6;
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

interface Opcoes {
  vaos: Vao[];
  height?: number;
  topProfile?: ProfilePoint[];
  vizinha?: boolean;
}

function projeto({ vaos, height = H, topProfile, vizinha = false }: Opcoes): Project {
  const base = createEmptyProject();
  for (const v of vaos) base.openingTypes[`ot_${v.id}`] = { ...base.openingTypes.ot_j120!, id: `ot_${v.id}`, width: v.w, height: v.h, sill: v.sill, leaves: 0, closure: v.closure ?? 'none', ...(v.forma ? { shape: v.forma } : {}) };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height, a: { x: 0, y: 0 }, b: { x: L, y: 0 }, ...(topProfile ? { topProfile } : {}) }) });
  if (vizinha) s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', height, a: { x: L, y: 0 }, b: { x: L, y: 4 } }) });
  for (const v of vaos) {
    const o: Opening = { id: `o_${v.id}`, kind: v.kind, typeId: `ot_${v.id}`, hostId: 'w1', offset: v.offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
    s.exec({ type: 'addOpening', opening: o });
  }
  return s.project;
}

const geom = (p: Project, id: string) => openingGeometry(p, p.elements[id] as Opening, frameOfWall(p, 'w1')!);
const espessuras = (p: Project): number[] => p.wallTypes.wt_alv14!.layers.map((l) => l.thickness);
const lv = (p: Project) => resolveLevel(p, 'lv_0');
const quant = (p: Project) => quantifyLevel(p, lv(p));

const janela: Vao = { id: 'forma', forma: MEIA_LUA, w: 1.2, h: 0.6, sill: 2.1, kind: 'window', offset: 4 };
const porta: Vao = { id: 'porta', w: 0.8, h: 2.1, sill: 0, kind: 'door', offset: 1 };
const portaArco: Vao = { id: 'arco', forma: ABATIDO, w: 1.4, h: 2.4, sill: 0, kind: 'door', offset: 4 };

let real: ClienteFuroContorno;

describe.skipIf(!temExportacoes)(`furo por contorno, extensões (doc 33; pulado sem KERNEL_WASM_PATH com as exportações; wasm: ${caminho})`, () => {
  beforeAll(async () => {
    definirClienteFuroContorno(null);
    const r = await instalarClienteFuroReal(bytes as Uint8Array);
    expect(r).toMatchObject({ instalado: true, prisma: true, retorno: true });
    real = clienteFuroContorno()!;
    await carregarFuroQuant(bytes as Uint8Array);
    await carregarFuroPrisma(bytes as Uint8Array);
  });
  afterAll(() => definirClienteFuroContorno(null));

  describe('0. cliente geom (ABI estendida)', () => {
    const planta = [[[[0, 0], [4, 0], [4, 0.2], [0, 0.2]]]] as const;
    const meiaLua = outline(MEIA_LUA);

    it('furarPrismas com topo inclinado: bruto = prisma aparado; removido > 0; vão recortado pelo envelope', () => {
      expect(furoPrismaExtCarregado()).toBe(true);
      expect(furoRetornoExtCarregado()).toBe(true);
      const r = furarPrismas([{ poligonos: planta, z0: 0, z1: 3, topo: { t0: 0, t1: 4, h0: 2, h1: 3 } }], [{ contorno: meiaLua, x: 2, soleira: 1 }], { recortar: true });
      expect(r.camadas[0]!.volumeSemFuro).toBeCloseTo(4 * 0.2 * 2.5, 9);
      expect(r.volumeRemovido).toBeGreaterThan(0);
      for (let i = 0; i < r.camadas[0]!.vertices.length; i += 3) expect(r.camadas[0]!.vertices[i + 2]!).toBeLessThanOrEqual(2 + r.camadas[0]!.vertices[i]! / 4 + 1e-9);
      // vão que passa do topo da camada: recusado sem `recortar`, aceito com
      const alto = [{ contorno: meiaLua, x: 2, soleira: 2.7 }];
      expect(() => furarPrismas([{ poligonos: planta, z0: 0, z1: 3 }], alto)).toThrow();
      expect(furarPrismas([{ poligonos: planta, z0: 0, z1: 3 }], alto, { recortar: true }).volumeRemovido).toBeGreaterThan(0);
    });

    it('topo inválido é erro de entrada (sem trap): o módulo continua servindo depois', () => {
      expect(() => furarPrismas([{ poligonos: planta, z0: 0, z1: 3, topo: { t0: 0, t1: 4, h0: 5, h1: 5 } }], [{ contorno: meiaLua, x: 2, soleira: 1 }])).toThrow(/z0\/z1|invalid/i);
      expect(() => furarPrismas([{ poligonos: planta, z0: 0, z1: 3, topo: { t0: 0, t1: 0, h0: 3, h1: 3 } }], [{ contorno: meiaLua, x: 2, soleira: 1 }])).not.toThrow();
      expect(furarPrismas([{ poligonos: planta, z0: 0, z1: 3 }], [{ contorno: meiaLua, x: 2, soleira: 1 }]).volumeRemovido).toBeGreaterThan(0);
    });

    it('retornoDoContorno: sem base e com recorte, contra os valores analíticos do retângulo', () => {
      const ret = [[0.45, 0], [0.45, 2.1], [-0.45, 2.1], [-0.45, 0]] as const;
      const base = { contorno: ret, x: 3, soleira: 0, espessura: 0.02, y0: -0.1, y1: 0.1 };
      const cheio = retornoDoContorno({ ...base, modo: 'contorno' });
      const livre = retornoDoContorno({ ...base, modo: 'contorno-sem-base' });
      expect(cheio.volume - livre.volume).toBeCloseTo(0.02 * (0.9 - 0.04) * 0.2, 9);
      const cortado = retornoDoContorno({ ...base, modo: 'contorno-sem-base', recorte: [[[[3 - 0.44, -5], [10, -5], [10, 5], [3 - 0.44, 5]]]] });
      expect(livre.volume - cortado.volume).toBeCloseTo(0.01 * 2.1 * 0.2, 9);
      // recorte inválido (gravata): erro de entrada, não trap
      expect(() => retornoDoContorno({ ...base, recorte: [[[[0, 0], [1, 1], [1, 0], [0, 1]]]] })).toThrow();
      expect(retornoDoContorno({ ...base, modo: 'contorno' }).volume).toBeCloseTo(cheio.volume, 12);
    });
  });

  describe('1. área de face líquida pela furo_quant_parede', () => {
    it('o cliente real oferece a medição e o topo inclinado', () => {
      expect(real.quantificarParede).toBeTypeOf('function');
      expect(real.topoInclinado).toBe(true);
    });

    it('área de face por camada = faixas inteiras - área REAL do contorno, sem somar o retorno do acabamento', () => {
      const p = projeto({ vaos: [porta, janela] });
      const g = geom(p, 'o_forma');
      const { area } = areaPerimetroDoContorno(g.forma!);
      const comForma = quant(p);
      const wt = p.wallTypes.wt_alv14!;
      const n: Record<string, number> = {};
      for (const l of wt.layers) n[l.materialId] = (n[l.materialId] ?? 0) + 1;
      const antes = quantifyLevel(projeto({ vaos: [porta] }), lv(projeto({ vaos: [porta] })));
      for (const [m, k] of Object.entries(n)) {
        const esperado = (antes.faceAreaByMaterial[m] ?? 0) - k * area;
        expect(comForma.faceAreaByMaterial[m], `material ${m}`).toBeCloseTo(esperado, 9);
      }
    });

    it('com retorno (closure both) a área de face é a MESMA e o volume cresce; a conta antiga (volume ÷ espessura) somava o retorno à face', () => {
      const a = projeto({ vaos: [porta, janela] });
      const b = projeto({ vaos: [porta, { ...janela, closure: 'both' }] });
      const qa = quantifyLevel(a, lv(a)), qb = quantifyLevel(b, lv(b));
      expect(qb.walls[0]!.volume).toBeGreaterThan(qa.walls[0]!.volume);
      for (const [m, v] of Object.entries(qa.faceAreaByMaterial)) expect(qb.faceAreaByMaterial[m]).toBeCloseTo(v, 9);
      // a camada de acabamento com retorno: volume ÷ espessura é MAIOR que a área de face (a diferença é o retorno ÷ espessura)
      const rw = lv(b).walls.w1!;
      const l = rw.layers.find((x) => rw.furosContorno![0]!.retornos.some((r) => r.layerIndex === x.layerIndex))!;
      const th = espessuras(b)[l.layerIndex]!;
      const vol = qb.layers.find((x) => x.layerIndex === l.layerIndex)!.volume;
      const areaDaCamada = qa.layers.find((x) => x.layerIndex === l.layerIndex)!.volume / th;
      expect(vol / th).toBeGreaterThan(areaDaCamada + 1e-6);
    });

    it('a medição vem da furo_quant_parede: o cliente recebe só os contornos, com a parede 6 x 3', () => {
      const pedidos: PedidoQuantParede[] = [];
      definirClienteFuroContorno({ ...real, quantificarParede: (ped) => (pedidos.push(ped), real.quantificarParede!(ped)) });
      try {
        const p = projeto({ vaos: [porta, janela] });
        quant(p);
        expect(pedidos.length).toBeGreaterThan(0);
        expect(pedidos[0]).toMatchObject({ wallId: 'w1', comprimento: L, altura: H });
        expect(pedidos[0]!.vaos.map((v) => v.openingId)).toEqual(['o_forma']);
        const r = real.quantificarParede!(pedidos[0]!)!;
        const { area } = areaPerimetroDoContorno(geom(p, 'o_forma').forma!);
        expect(r.areaFuroNaFace).toBeCloseTo(area, 9);
        expect(r.areaFaceLiquida).toBeCloseTo(L * H - area, 9);
      } finally {
        definirClienteFuroContorno(real);
      }
    });

    it('sem a medição (cliente sem quantificarParede) a área cai na malha das faixas e dá o MESMO número', () => {
      const p = projeto({ vaos: [porta, { ...janela, closure: 'both' }] });
      const com = quant(p).faceAreaByMaterial;
      definirClienteFuroContorno({ ...real, quantificarParede: () => null });
      try {
        const sem = quant(p).faceAreaByMaterial;
        for (const [m, v] of Object.entries(com)) expect(sem[m]).toBeCloseTo(v, 9);
      } finally {
        definirClienteFuroContorno(real);
      }
    });

    it('vão retangular: números idênticos (JSON) com e sem o cliente real', () => {
      const p = projeto({ vaos: [porta, { id: 'ret', w: 1.2, h: 1.2, sill: 1, kind: 'window', offset: 4, closure: 'both' }] });
      const com = JSON.stringify(quant(p));
      definirClienteFuroContorno(null);
      try {
        expect(JSON.stringify(quant(p))).toBe(com);
      } finally {
        definirClienteFuroContorno(real);
      }
    });
  });

  describe('2. retorno e a soleira (vão que toca o piso)', () => {
    it('porta em arco abatido com sill 0: ombreiras até o piso e arco, SEM soleira', () => {
      const p = projeto({ vaos: [{ ...portaArco, closure: 'both' }] });
      const rw = lv(p).walls.w1!;
      const f = rw.furosContorno![0]!;
      const g = f.g;
      const w = 1.4;
      for (const l of rw.layers) {
        const cf = camadaFurada(rw, l, l.bands)!;
        const dos = f.retornos.filter((r) => r.layerIndex === l.layerIndex);
        expect(cf.retornos.length).toBe(dos.length);
        cf.retornos.forEach((r, k) => {
          const t = dos[k]!.espessura;
          const n = r.vertices.length / 3;
          const pts = Array.from({ length: n }, (_, i) => [r.vertices[3 * i]! - g.offset, r.vertices[3 * i + 2]!] as const);
          expect(Math.min(...pts.map((q) => q[1]))).toBeCloseTo(0, 9); // as ombreiras chegam ao piso
          // nenhum vértice no miolo da base: entre as ombreiras só há retorno acima da base (arco)
          const miolo = pts.filter(([x, z]) => z < 1e-9 && Math.abs(x) < w / 2 - dos[k]!.recuo - t - 1e-6);
          expect(miolo).toEqual([]);
        });
      }
      // volume do retorno = (perímetro - base) x espessura x profundidade, para a camada sem recuo
      const { perimetro } = areaPerimetroDoContorno(g.forma!);
      const l0 = rw.layers.find((l) => f.retornos.some((r) => r.layerIndex === l.layerIndex && r.recuo === 0))!;
      const cf0 = camadaFurada(rw, l0, l0.bands)!;
      const r0 = f.retornos.find((r) => r.layerIndex === l0.layerIndex && r.recuo === 0)!;
      const esperadoMax = (perimetro - w) * r0.espessura * (r0.y1 - r0.y0);
      expect(cf0.retornos[0]!.volume).toBeLessThanOrEqual(esperadoMax * (1 + 1e-9));
      expect(cf0.retornos[0]!.volume).toBeGreaterThan(esperadoMax * 0.9);
    });

    it('janela com peitoril > 0 mantém o retorno do contorno inteiro (verga, arco e soleira)', () => {
      const p = projeto({ vaos: [{ ...janela, closure: 'both' }] });
      const rw = lv(p).walls.w1!;
      const f = rw.furosContorno![0]!;
      const l = rw.layers.find((x) => f.retornos.some((r) => r.layerIndex === x.layerIndex && r.recuo === 0))!;
      const r = f.retornos.find((x) => x.layerIndex === l.layerIndex && x.recuo === 0)!;
      const cf = camadaFurada(rw, l, l.bands)!;
      const { perimetro } = areaPerimetroDoContorno(f.g.forma!);
      const esperado = perimetro * r.espessura * (r.y1 - r.y0);
      expect(cf.retornos[0]!.volume).toBeGreaterThan(esperado * 0.9);
      const zs = Array.from({ length: cf.retornos[0]!.vertices.length / 3 }, (_, i) => cf.retornos[0]!.vertices[3 * i + 2]!);
      expect(Math.min(...zs)).toBeCloseTo(f.g.sill, 9); // a soleira da janela existe
    });
  });

  describe('3. retorno em canto (recorte contra a parede vizinha)', () => {
    const noCanto: Vao = { id: 'forma', forma: ABATIDO, w: 1.4, h: 2.4, sill: 0, kind: 'door', offset: 5.28, closure: 'both' };

    it('a parede vizinha cobre parte da pegada: o retorno é recortado e não invade a vizinha', () => {
      const p = projeto({ vaos: [noCanto], vizinha: true });
      const r = lv(p);
      const rw = r.walls.w1!;
      const f = rw.furosContorno![0]!;
      const cortados = f.retornos.filter((x) => x.recorte !== undefined);
      expect(cortados.length, 'algum retorno é cortado pela vizinha').toBeGreaterThan(0);
      // O pintado da vizinha (todas as camadas), em planta.
      const vizinha: MultiPolygon = r.walls.w2!.layers.flatMap((l) => l.fragment);
      let algum = 0;
      for (const l of rw.layers) {
        const dos = f.retornos.filter((x) => x.layerIndex === l.layerIndex);
        if (!dos.length) continue;
        const cf = camadaFurada(rw, l, l.bands)!;
        const sem = camadaFurada({ ...rw, furosContorno: [{ ...f, retornos: f.retornos.map((x) => ({ ...x, recorte: undefined })) }] }, l, l.bands)!;
        dos.forEach((ret, k) => {
          const comCorte = ret.recorte !== undefined;
          const v = cf.retornos[k]?.volume ?? 0;
          const v0 = sem.retornos[k]!.volume;
          if (comCorte) {
            algum++;
            expect(v, 'recortado é menor').toBeLessThan(v0 - 1e-9);
            // nenhum vértice do retorno cai DENTRO do pintado da vizinha (tolerância de 1 µm para a borda)
            const m = cf.retornos[k]!;
            for (let i = 0; i < m.vertices.length; i += 3) {
              const q = { x: rw.a.x + rw.u.x * m.vertices[i]! + rw.n.x * m.vertices[i + 1]!, y: rw.a.y + rw.u.y * m.vertices[i]! + rw.n.y * m.vertices[i + 1]! };
              const dentro = [1e-6, -1e-6].every((d) => pointInMulti({ x: q.x + d, y: q.y + d }, vizinha) && pointInMulti({ x: q.x - d, y: q.y - d }, vizinha));
              expect(dentro, `vértice ${q.x},${q.y} dentro da vizinha`).toBe(false);
            }
          } else {
            expect(v).toBeCloseTo(v0, 9);
          }
        });
      }
      expect(algum).toBeGreaterThan(0);
    });

    it('longe do canto (sem vizinha) nada é recortado: números iguais aos de antes', () => {
      const p = projeto({ vaos: [{ ...noCanto, offset: 3 }], vizinha: true });
      const f = lv(p).walls.w1!.furosContorno![0]!;
      expect(f.retornos.every((x) => x.recorte === undefined)).toBe(true);
    });

    it('o volume do retorno em canto = interseção da peça inteira com a região permitida (Rust, independente do engine)', () => {
      const p = projeto({ vaos: [noCanto], vizinha: true });
      const rw = lv(p).walls.w1!;
      const f = rw.furosContorno![0]!;
      const ret = f.retornos.find((x) => x.recorte !== undefined)!;
      const l = rw.layers.find((x) => x.layerIndex === ret.layerIndex)!;
      const cf = camadaFurada(rw, l, l.bands)!;
      const k = f.retornos.filter((x) => x.layerIndex === ret.layerIndex).indexOf(ret);
      // área em planta da região permitida x a altura do anel dá um limite superior; o volume recortado fica abaixo do inteiro
      const inteiro = camadaFurada({ ...rw, furosContorno: [{ ...f, retornos: f.retornos.map((x) => ({ ...x, recorte: undefined })) }] }, l, l.bands)!.retornos[k]!.volume;
      expect(cf.retornos[k]!.volume).toBeLessThan(inteiro);
      expect(cf.retornos[k]!.volume).toBeGreaterThan(0);
      const pegada = [ret.y1 - ret.y0];
      expect(pegada[0]).toBeGreaterThan(0);
    });
  });

  describe('4. vão que sai do envelope da parede', () => {
    // meia-lua 1,2 x 0,6 com peitoril 2,6: o topo (3,2) passa 0,2 m da parede de 3 m
    const alto: Vao = { id: 'forma', forma: MEIA_LUA, w: 1.2, h: 0.6, sill: 2.6, kind: 'window', offset: 4 };

    it('o furo remove só a parte que cabe (por camada, área do contorno recortado x espessura) e a camada NÃO recua', () => {
      const p = projeto({ vaos: [alto] });
      const rw = lv(p).walls.w1!;
      const g = rw.furosContorno![0]!.g;
      const c = outline(g.forma!).map(([x, z]) => ({ x: g.offset + x, y: g.sill + z }));
      const cortado = intersection([[c]], [[[{ x: -1, y: 0 }, { x: L + 1, y: 0 }, { x: L + 1, y: H }, { x: -1, y: H }]]]);
      const areaQueCabe = multiArea(cortado);
      const { area } = areaPerimetroDoContorno(g.forma!);
      expect(areaQueCabe).toBeLessThan(area - 1e-3);
      for (const l of rw.layers) {
        const cf = camadaFurada(rw, l, l.bands)!;
        expect(cf.malhas, `camada ${l.layerIndex}: furada pelo contorno, sem recuar`).not.toBeNull();
        expect(cf.removido).toBeCloseTo(areaQueCabe * espessuras(p)[l.layerIndex]!, 8);
      }
    });

    it('aviso `vao-fora-do-envelope` com o excesso, em 7 idiomas; vão que cabe não avisa', () => {
      const avisos = openingShapeIssues(projeto({ vaos: [alto] }), 'pt').filter((i) => i.code === 'vao-fora-do-envelope');
      expect(avisos).toHaveLength(1);
      expect(avisos[0]!.message).toContain('0.20');
      expect(openingShapeIssues(projeto({ vaos: [janela] }), 'pt').filter((i) => i.code === 'vao-fora-do-envelope')).toEqual([]);
      const en = openingShapeIssues(projeto({ vaos: [alto] }), 'en').find((i) => i.code === 'vao-fora-do-envelope')!;
      expect(en.message).toContain('beyond the envelope');
    });

    it('vão que passa da ponta da parede: furado pela parte que cabe e avisado', () => {
      // O comando `addOpening` prende o vão dentro da parede; um projeto importado ou editado fora dele pode passar da ponta.
      const naPonta: Vao = { ...porta, id: 'forma', forma: ABATIDO, w: 1.4, h: 2.4, offset: 5.0 };
      const p0 = projeto({ vaos: [naPonta] });
      const p: Project = { ...p0, elements: { ...p0.elements, o_forma: { ...(p0.elements.o_forma as Opening), offset: 5.5 } } };
      const rw = lv(p).walls.w1!;
      const g = rw.furosContorno![0]!.g;
      const l = rw.layers.find((x) => x.layerIndex === 2)!;
      const cf = camadaFurada(rw, l, l.bands)!;
      expect(cf.malhas).not.toBeNull();
      const c = outline(g.forma!).map(([x, z]) => ({ x: g.offset + x, y: g.sill + z }));
      const cabe = multiArea(intersection([[c]], [[[{ x: -1, y: -1 }, { x: L, y: -1 }, { x: L, y: H + 1 }, { x: -1, y: H + 1 }]]]));
      // a camada é esquadrejada no fim da parede (ponta livre, sem vizinha): removido = área que cabe x espessura
      expect(cf.removido).toBeCloseTo(cabe * espessuras(p)[2]!, 8);
      expect(openingShapeIssues(p, 'pt').some((i) => i.code === 'vao-fora-do-envelope')).toBe(true);
    });
  });

  describe('5. parede com perfil de topo inclinado', () => {
    const empena: ProfilePoint[] = [{ t: 0, h: 2.4 }, { t: 3, h: 3.6 }, { t: 6, h: 2.4 }];

    it('o vão com forma vai por contorno e fura o prisma com topo inclinado (removido = integral abaixo do topo)', () => {
      const v: Vao = { id: 'forma', forma: MEIA_LUA, w: 1.2, h: 0.6, sill: 1.6, kind: 'window', offset: 1.5 };
      const p = projeto({ vaos: [v], height: 3.6, topProfile: empena });
      const rw = lv(p).walls.w1!;
      expect(rw.furosContorno?.map((f) => f.g.openingId)).toEqual(['o_forma']);
      const g = rw.furosContorno![0]!.g;
      const c = outline(g.forma!).map(([x, z]) => [g.offset + x, g.sill + z] as const);
      // integral independente: sum_u chord(u) clipada pelo topo(u)
      const n = 40_000;
      const h = (c.reduce((m, q) => Math.max(m, q[0]), -Infinity) - c.reduce((m, q) => Math.min(m, q[0]), Infinity)) / n;
      const u0 = Math.min(...c.map((q) => q[0]));
      let area = 0;
      for (let i = 0; i < n; i++) {
        const u = u0 + (i + 0.5) * h;
        const zs: number[] = [];
        for (let a = 0; a < c.length; a++) {
          const [p0, p1] = [c[a]!, c[(a + 1) % c.length]!];
          if ((p0[0] <= u) !== (p1[0] <= u)) zs.push(p0[1] + ((u - p0[0]) * (p1[1] - p0[1])) / (p1[0] - p0[0]));
        }
        zs.sort((x, y) => x - y);
        const top = profileHeightAt(empena, u);
        for (let k = 0; k + 1 < zs.length; k += 2) area += Math.max(0, Math.min(zs[k + 1]!, top) - zs[k]!) * h;
      }
      for (const l of rw.layers) {
        const cf = camadaFurada(rw, l, l.bands)!;
        expect(cf.malhas, `camada ${l.layerIndex}: contorno, sem recuo retangular`).not.toBeNull();
        expect(cf.removido).toBeCloseTo(area * espessuras(p)[l.layerIndex]!, 5);
        expect(cf.bands.some((b) => b.slope)).toBe(true);
      }
    });

    it('volume líquido da parede = volume sem o vão - área do contorno recortada pelo topo x espessura', () => {
      const v: Vao = { id: 'forma', forma: ABATIDO, w: 1.4, h: 2.4, sill: 0, kind: 'door', offset: 1.5 };
      const p = projeto({ vaos: [v], height: 3.6, topProfile: empena });
      const q = quant(p).walls[0]!;
      const sem = quant(projeto({ vaos: [], height: 3.6, topProfile: empena })).walls[0]!;
      const { area } = areaPerimetroDoContorno(geom(p, 'o_forma').forma!);
      // o arco (topo a 2,4 m) fica abaixo do topo da empena (>= 2,4 + 1,2 u/3...): a diferença é o contorno inteiro
      expect(sem.volume - q.volume).toBeCloseTo(area * espessuras(p).reduce((a, b) => a + b, 0), 6);
    });

    it('3D: a malha do bloco na parede com empena fura o contorno real (volume = sem vão - área x 0,14)', () => {
      const vol = (p: Project): number => {
        clearWallLayerCache();
        const bs = buildLevelSolids(lv(p)).batches.filter((x) => x.materialId === 'mat_bloco14');
        let v = 0;
        for (const b of bs) {
          for (let i = 0; i < b.indices.length; i += 3) {
            const q = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
            const [p0, p1, p2] = [q(b.indices[i]!), q(b.indices[i + 1]!), q(b.indices[i + 2]!)];
            v += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
          }
        }
        return Math.abs(v);
      };
      const v: Vao = { id: 'forma', forma: ABATIDO, w: 1.4, h: 2.4, sill: 0, kind: 'door', offset: 1.5 };
      const p = projeto({ vaos: [v], height: 3.6, topProfile: empena });
      const { area } = areaPerimetroDoContorno(geom(p, 'o_forma').forma!);
      expect(vol(projeto({ vaos: [], height: 3.6, topProfile: empena })) - vol(p)).toBeCloseTo(area * 0.14, 6);
    });

    it('base em perfil (piso cobre só parte da parede, base a 0,05 m): o contorno é cortado pelo piso, sem recuar', () => {
      const base = createEmptyProject();
      base.openingTypes.ot_arco = { ...base.openingTypes.ot_p80!, id: 'ot_arco', width: 1.4, height: 2.4, sill: 0, leaves: 0, closure: 'none', shape: ABATIDO };
      const st = new ProjectStore(base);
      st.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: H, a: { x: 0, y: 0 }, b: { x: L, y: 0 }, attachBottomToFloor: true }) });
      st.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: -1, y: -1 }, { x: 3.5, y: -1 }, { x: 3.5, y: 1 }, { x: -1, y: 1 }], heightOffset: 0.05 }) });
      st.exec({ type: 'addOpening', opening: { id: 'o_arco', kind: 'door', typeId: 'ot_arco', hostId: 'w1', offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
      const p = st.project;
      const rw = lv(p).walls.w1!;
      expect(rw.profileBottom, 'a base da parede é perfilada').toBeDefined();
      expect(rw.furosContorno?.map((f) => f.g.openingId)).toEqual(['o_arco']);
      const g = rw.furosContorno![0]!.g;
      const c = outline(g.forma!).map(([x, z]) => ({ x: g.offset + x, y: g.sill + z }));
      const area = multiArea(intersection([[c]], [[[{ x: -1, y: 0.05 }, { x: L + 1, y: 0.05 }, { x: L + 1, y: H + 1 }, { x: -1, y: H + 1 }]]]));
      expect(area).toBeLessThan(areaPerimetroDoContorno(g.forma!).area - 1e-3);
      for (const l of rw.layers) {
        const cf = camadaFurada(rw, l, l.bands)!;
        expect(cf.malhas, `camada ${l.layerIndex}: contorno`).not.toBeNull();
        expect(cf.removido).toBeCloseTo(area * espessuras(p)[l.layerIndex]!, 8);
      }
    });

    it('sem o topo inclinado no cliente a camada recua para o furo retangular (a parede nunca fica sem vão)', () => {
      const v: Vao = { id: 'forma', forma: MEIA_LUA, w: 1.2, h: 0.6, sill: 1.6, kind: 'window', offset: 1.5 };
      const p = projeto({ vaos: [v], height: 3.6, topProfile: empena });
      definirClienteFuroContorno({ ...real, topoInclinado: false });
      try {
        const rw = lv(p).walls.w1!;
        const l = rw.layers[2]!;
        const cf = rw.furosContorno ? camadaFurada(rw, l, l.bands) : null;
        // sem a capacidade, o vão nem sai da rota retangular (ou, se saiu, a camada vem furada em retângulo)
        expect(cf === null || cf.malhas === null).toBe(true);
      } finally {
        definirClienteFuroContorno(real);
      }
    });
  });
});
