/**
 * Furo por contorno de ponta a ponta com o Rust REAL (docs/estudo-esquadrias/27): nenhum cliente falso. O cliente real
 * (`instalarClienteFuroReal`) fura as camadas pós-junção em `furo_prisma_furar` e monta o retorno em `furo_retorno_vao`; o
 * resolve, o quantitativo, o 3D e o quadro de esquadrias passam por ele. Roda só em `npm run test:wasm`
 * (`KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm`); sem o binário com as exportações, a suíte é pulada.
 *
 * Parede `wt_alv14` de 6 m x 3 m, 5 camadas (2 mm, 20 mm, 140 mm, 20 mm, 2 mm; as 4 externas envolvem), uma porta retangular
 * (offset 1) e um vão com forma (meia-lua ou arco abatido, offset 4).
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, outline, type Opening, type OpeningShape, type Project } from '@hestia/model';
import {
  areaPerimetroDoContorno, buildOpeningSchedule, camadaFurada, clienteFuroContorno, definirClienteFuroContorno, diagnosticoFuroReal, frameOfWall, instalarClienteFuroReal, openingGeometry, quantifyLevel, resolveLevel,
  type ClienteFuroContorno,
} from '../packages/engine/src/index.ts';
import { buildLevelSolids, clearWallLayerCache } from '../packages/render/src/index.ts';
import { carregarFuroQuant, quantificarVao } from '../packages/geom/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
const temExportacoes = ((): boolean => {
  if (!bytes) return false;
  try {
    const n = WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(bytes))).map((e) => e.name);
    return ['furo_prisma_furar', 'furo_retorno_vao', 'furo_quant_vao', 'furo_quant_parede'].every((x) => n.includes(x));
  } catch {
    return false;
  }
})();

const L = 6;
const H = 3;
type Forma = 'meia-lua' | 'abatido' | 'sem';
const FORMAS: Record<Exclude<Forma, 'sem'>, { shape: OpeningShape; w: number; h: number; sill: number; kind: 'window' | 'door'; tipo: string }> = {
  'meia-lua': { shape: { kind: 'round', width: 1.2, height: 0.6 }, w: 1.2, h: 0.6, sill: 2.1, kind: 'window', tipo: 'ot_j120' },
  abatido: { shape: { kind: 'segmental', width: 1.4, height: 2.4, rise: 0.3 }, w: 1.4, h: 2.4, sill: 0, kind: 'door', tipo: 'ot_p80' },
};

/** `comForma = false`: o mesmo tipo de vão, mas retangular (sem `shape`), para a referência do furo de sempre. */
function projeto(forma: Forma, opcoes: { comForma?: boolean; closure?: 'none' | 'both' } = {}): Project {
  const { comForma = true, closure = 'none' } = opcoes;
  const base = createEmptyProject();
  if (forma !== 'sem') {
    const f = FORMAS[forma];
    base.openingTypes.ot_forma = { ...base.openingTypes[f.tipo]!, id: 'ot_forma', width: f.w, height: f.h, sill: f.sill, leaves: 0, closure, ...(comForma ? { shape: f.shape } : {}) };
  }
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: H, a: { x: 0, y: 0 }, b: { x: L, y: 0 } }) });
  const mk = (id: string, typeId: string, offset: number, kind: 'door' | 'window'): Opening => ({ id, kind, typeId, hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' });
  s.exec({ type: 'addOpening', opening: mk('o_porta', 'ot_p80', 1, 'door') });
  if (forma !== 'sem') s.exec({ type: 'addOpening', opening: mk('o_forma', 'ot_forma', 4, FORMAS[forma].kind) });
  return s.project;
}

const geom = (p: Project, id: string) => openingGeometry(p, p.elements[id] as Opening, frameOfWall(p, 'w1')!);
const espessuras = (p: Project): number[] => p.wallTypes.wt_alv14!.layers.map((l) => l.thickness);
const somaEsp = (p: Project): number => espessuras(p).reduce((a, b) => a + b, 0);

/** Volume de uma malha de triângulos pela divergência (positivo se as faces apontam para fora). */
function volumeMalha(b: { positions: number[]; indices: number[] }): number {
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const p = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
    const [p0, p1, p2] = [p(b.indices[i]!), p(b.indices[i + 1]!), p(b.indices[i + 2]!)];
    v += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
  }
  return v;
}

const blocoDoNivel = (p: Project): number => {
  clearWallLayerCache();
  const b = buildLevelSolids(resolveLevel(p, 'lv_0')).batches.filter((x) => x.materialId === 'mat_bloco14');
  return Math.abs(b.reduce((s, x) => s + volumeMalha(x), 0));
};

const quant = (p: Project) => quantifyLevel(p, resolveLevel(p, 'lv_0')).walls[0]!;

let real: ClienteFuroContorno;

describe.skipIf(!temExportacoes)(`furo por contorno real, ponta a ponta (pulado sem KERNEL_WASM_PATH com as exportações; wasm: ${caminho})`, () => {
  beforeAll(async () => {
    definirClienteFuroContorno(null);
    const r = await instalarClienteFuroReal(bytes as Uint8Array);
    expect(r).toMatchObject({ instalado: true, prisma: true, retorno: true });
    real = clienteFuroContorno()!;
    expect(real.furarPrisma).toBeTypeOf('function');
    expect(real.retornoDoVao).toBeTypeOf('function');
    await carregarFuroQuant(bytes as Uint8Array);
  });
  afterAll(() => {
    definirClienteFuroContorno(null);
    clearWallLayerCache();
  });

  const sem = (f: () => void): void => {
    definirClienteFuroContorno(null);
    try {
      f();
    } finally {
      definirClienteFuroContorno(real);
    }
  };

  for (const forma of ['meia-lua', 'abatido'] as const) {
    describe(`parede de 5 camadas com ${forma}`, () => {
      it('o vão sai da rota retangular e o Rust fura cada camada sem recuar nem falhar', () => {
        const p = projeto(forma);
        const antes = diagnosticoFuroReal();
        const rw = resolveLevel(p, 'lv_0').walls.w1!;
        expect(rw.furosContorno?.map((f) => f.g.openingId)).toEqual(['o_forma']);
        for (const l of rw.layers) {
          const cf = camadaFurada(rw, l, l.bands)!;
          expect(cf.malhas, `camada ${l.layerIndex} furada pelo cliente`).not.toBeNull();
          const th = espessuras(p)[l.layerIndex]!;
          const { area } = areaPerimetroDoContorno(geom(p, 'o_forma').forma!);
          // volume removido = área do contorno x espessura da camada (1e-9 m3)
          expect(cf.removido).toBeCloseTo(area * th, 9);
        }
        const dep = diagnosticoFuroReal();
        expect(dep.chamadasPrisma).toBeGreaterThan(antes.chamadasPrisma);
        expect(dep.falhas).toBe(antes.falhas);
      });

      it('quantitativo: volume removido = área do contorno x espessura total; o resto da parede não muda', () => {
        const p = projeto(forma);
        const g = geom(p, 'o_forma');
        const { area } = areaPerimetroDoContorno(g.forma!);
        const q = quant(p);
        const semVao = quant(projeto('sem'));
        expect(semVao.volume - q.volume).toBeCloseTo(area * somaEsp(p), 9);
        // contra o vão retangular bruto: mais parede, a diferença é a do contorno x espessura
        const retangular = quant(projeto(forma, { comForma: false }));
        expect(q.volume - retangular.volume).toBeCloseTo((g.roughWidth * g.roughHeight - area) * somaEsp(p), 9);
        expect(area).toBeLessThan(g.roughWidth * g.roughHeight);
        // área de vão do quantitativo: a real do contorno no lugar de largura x altura
        expect(q.openingsArea - retangular.openingsArea).toBeCloseTo(area - FORMAS[forma].w * FORMAS[forma].h, 6);
      });

      it('3D: a malha do cliente fura o contorno real, não o retângulo (a parede nunca fica sem vão)', () => {
        const p = projeto(forma);
        const g = geom(p, 'o_forma');
        const { area } = areaPerimetroDoContorno(g.forma!);
        const th = espessuras(p)[2]!;
        const gp = geom(p, 'o_porta');
        const cheio = L * H * th;
        const esperado = cheio - gp.roughWidth * gp.roughHeight * th - area * th;
        expect(blocoDoNivel(p)).toBeCloseTo(esperado, 6);
        // o furo não é o retângulo: a diferença para a rota retangular é exatamente (W x H - área) x espessura
        const retangular = blocoDoNivel(projeto(forma, { comForma: false }));
        expect(blocoDoNivel(p) - retangular).toBeCloseTo((g.roughWidth * g.roughHeight - area) * th, 6);
        // a malha do 3D e o quantitativo concordam no volume do bloco
        const w1 = resolveLevel(p, 'lv_0').walls.w1!;
        const bloco = w1.layers.find((l) => l.layerIndex === 2)!;
        expect(camadaFurada(w1, bloco, bloco.bands)!.volume).toBeCloseTo(esperado, 6);
      });

      it('quadro de esquadrias: área real do contorno, a mesma do Rust', () => {
        const p = projeto(forma);
        const g = geom(p, 'o_forma');
        const { area, perimetro } = areaPerimetroDoContorno(g.forma!);
        const rust = quantificarVao(outline(g.forma!));
        expect(rust.area).toBeCloseTo(area, 9);
        expect(rust.perimetro).toBeCloseTo(perimetro, 9);
        const linha = buildOpeningSchedule(p).rows.find((r) => r.typeId === 'ot_forma')!;
        expect(linha.unitArea).toBeCloseTo(area, 9);
        expect(linha.unitArea).toBeLessThan(FORMAS[forma].w * FORMAS[forma].h);
        sem(() => expect(buildOpeningSchedule(p).rows.find((r) => r.typeId === 'ot_forma')!.unitArea).toBeCloseTo(FORMAS[forma].w * FORMAS[forma].h, 9));
      });

      it('retorno do acabamento segue o contorno (verga, arco e soleira), com recuo por camada, e entra no quantitativo', () => {
        const p = projeto(forma, { closure: 'both' });
        const p0 = projeto(forma, { closure: 'none' });
        const r = resolveLevel(p, 'lv_0');
        const rw = r.walls.w1!;
        const rets = rw.furosContorno![0]!.retornos;
        expect(rets.length).toBeGreaterThan(1);
        const { perimetro } = areaPerimetroDoContorno(rw.furosContorno![0]!.g.forma!);
        let soma = 0;
        for (const l of rw.layers) {
          const cf = camadaFurada(rw, l, l.bands)!;
          const doLado = rets.filter((x) => x.layerIndex === l.layerIndex);
          expect(cf.retornos.length).toBe(doLado.length);
          doLado.forEach((ret, k) => {
            // faixa que segue o contorno: volume <= perímetro x espessura x profundidade (o recuo só encolhe o perímetro) e perto disso
            const maximo = perimetro * ret.espessura * (ret.y1 - ret.y0);
            const v = cf.retornos[k]!.volume;
            expect(v).toBeLessThanOrEqual(maximo * (1 + 1e-9));
            expect(v).toBeGreaterThan(maximo * (ret.recuo > 0 ? 0.7 : 0.9));
          });
          soma += cf.retornos.reduce((s, x) => s + x.volume, 0);
          // malha do retorno: índices válidos, y dentro da faixa pedida, volume da malha = volume do cliente
          cf.retornos.forEach((x, k) => {
            const ret = doLado[k]!;
            expect(x.indices.length % 3).toBe(0);
            const n = x.vertices.length / 3;
            expect(Array.from(x.indices).every((i) => i < n)).toBe(true);
            const ys = Array.from({ length: n }, (_, i) => x.vertices[3 * i + 1]!);
            expect(Math.min(...ys)).toBeCloseTo(ret.y0, 9);
            expect(Math.max(...ys)).toBeCloseTo(ret.y1, 9);
            expect(Math.abs(volumeMalha({ positions: Array.from(x.vertices), indices: Array.from(x.indices) }))).toBeCloseTo(x.volume, 9);
          });
        }
        expect(soma).toBeGreaterThan(0);
        expect(quant(p).volume - quant(p0).volume).toBeCloseTo(soma, 9);
      });

      it('rede de segurança: cliente que não responde recua para o furo retangular, com a parede sempre furada', () => {
        const p = projeto(forma);
        const retangular = quant(projeto(forma, { comForma: false }));
        const mudo: ClienteFuroContorno = { furarParede: () => null, furarPrisma: () => null, retornoDoVao: () => null };
        definirClienteFuroContorno(mudo);
        try {
          const q = quant(p);
          expect(q.volume).toBeCloseTo(retangular.volume, 9);
          expect(blocoDoNivel(p)).toBeCloseTo(blocoDoNivel(projeto(forma, { comForma: false })), 6);
        } finally {
          definirClienteFuroContorno(real);
        }
      });
    });
  }

  it('vão retangular: os MESMOS números de antes (com e sem o cliente real)', () => {
    for (const forma of ['meia-lua', 'abatido', 'sem'] as const) {
      const p = projeto(forma, { comForma: false });
      const com = JSON.stringify([resolveLevel(p, 'lv_0'), quantifyLevel(p, resolveLevel(p, 'lv_0')), buildOpeningSchedule(p)]);
      let sem_ = '';
      sem(() => {
        sem_ = JSON.stringify([resolveLevel(p, 'lv_0'), quantifyLevel(p, resolveLevel(p, 'lv_0')), buildOpeningSchedule(p)]);
      });
      expect(com).toBe(sem_);
      clearWallLayerCache();
      const a = JSON.stringify(buildLevelSolids(resolveLevel(p, 'lv_0')));
      let b = '';
      sem(() => {
        clearWallLayerCache();
        b = JSON.stringify(buildLevelSolids(resolveLevel(p, 'lv_0')));
      });
      expect(a).toBe(b);
    }
  });

  it('quantificarParede (Rust) confere com o furo por prisma: volume líquido e área de face', async () => {
    const { quantificarParede } = await import('../packages/geom/src/index.ts');
    const p = projeto('meia-lua');
    const g = geom(p, 'o_forma');
    const contorno = outline(g.forma!);
    const q = quantificarParede([{ contorno, x: g.offset, soleira: g.sill }], espessuras(p), L, H);
    const { area } = areaPerimetroDoContorno(g.forma!);
    expect(q.volumeRemovido).toBeCloseTo(area * somaEsp(p), 9);
    q.camadas.forEach((c) => {
      expect(c.areaFuroNaFace).toBeCloseTo(area, 9);
      expect(c.volumeLiquido).toBeCloseTo((L * H - area) * c.espessura, 9);
    });
  });
});
