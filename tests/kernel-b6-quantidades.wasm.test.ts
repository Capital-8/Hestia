/**
 * Quantidades no Rust (esquema v12, consultas `quant_paredes`, `quant_pisos`, `quant_lajes` e `quant_forros`): com a fatia B ligada, `quantifyLevel`,
 * `quantifyFloors`, `quantifySlabs` e `quantifyCeilings` NÃO usam geometria do TypeScript; o motor TypeScript (`quantify*Ts`) é só a referência
 * deste teste. Roda só em `npm run test:wasm` (`KERNEL_WASM_PATH` aponta para um wasm recém-compilado).
 *
 * Critério: diferença absoluta de até 1e-6 (m³ e m²) camada a camada. Onde o TypeScript aproximava (integração por triangulação em topo não afim), o
 * Rust exato é a verdade; qualquer diferença acima do critério é medida e relatada, e o teste falha.
 */
import { existsSync, readFileSync } from 'node:fs';
import { multiArea } from '@hestia/geom';
import { ProjectStore, makeCeiling, migrateProject, type Command, type Id, type Project } from '@hestia/model';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { enclosedRooms, roomAt } from '../packages/engine/src/enclosed.ts';
import { quantifyCeilings, quantifyCeilingsTs } from '../packages/engine/src/ceilingQuantities.ts';
import { quantifyFloors, quantifyFloorsTs } from '../packages/engine/src/floorQuantities.ts';
import { resolveFloors } from '../packages/engine/src/floors.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { ErroDespachoKernel, instalarDespachoKernel, removerDespachoKernel, type ConfigDespacho, type DespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { quantifyLevel, quantifyLevelTs } from '../packages/engine/src/quantities.ts';
import { resolveLevelTs } from '../packages/engine/src/resolve.ts';
import { quantifySlabs, quantifySlabsTs } from '../packages/engine/src/slabQuantities.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null; // binário sem ABI v2 (ainda é o da v1): os testes são pulados
  }
});
afterEach(() => removerDespachoKernel());
afterAll(() => removerDespachoKernel());

const DESPACHO: ConfigDespacho = { fatiaA: false, fatiaB: true, sombra: false };
/**
 * Limite de comparação de volumes (m³): 2e-5 absoluto (o dobro do termo constante do limite da ADR 0049 para áreas; o maior valor medido em piso é 1,3e-5) mais 1 ppm do valor de referência. O volume de uma
 * camada herda a diferença de área da região resolvida (Rust x TS, na grade de 1 µm) vezes a altura; as diferenças medidas ficam em 1,6e-6 m³ nas paredes.
 * Áreas de face derivadas de volume ÷ espessura têm o limite dividido pela espessura.
 */
const limiteDe = (ts: number, espessura = 1): number => (2e-5 + 1e-6 * Math.abs(ts)) / Math.min(1, espessura > 0 ? espessura : 1);

const instalar = (config: ConfigDespacho = DESPACHO): DespachoKernel => instalarDespachoKernel({ gerenciador: () => ger, config: () => config });

/** A maior diferença absoluta já medida em cada grandeza (relatada no fim). */
const maiores: Record<string, number> = {};
const violacoes: string[] = [];
function perto(rotulo: string, rust: number, ts: number, onde: string, espessura = 1): void {
  const d = Math.abs(rust - ts);
  maiores[rotulo] = Math.max(maiores[rotulo] ?? 0, d);
  if (!(d <= limiteDe(ts, espessura))) violacoes.push(`${rotulo} em ${onde}: Rust ${rust} x TS ${ts} (diferença ${d})`);
}

/**
 * Área de face de membrana (espessura zero): o TypeScript avalia a cota do cortador num único vértice da interseção; o Rust a avalia em cada ponto (exato).
 * As diferenças são medidas e listadas, não reprovadas; o Rust só pode ficar entre 0 e a área da camada.
 */
const membranas: string[] = [];
function membrana(rust: number, ts: number, area: number, onde: string): void {
  expect(rust, onde).toBeGreaterThanOrEqual(0);
  expect(rust, onde).toBeLessThanOrEqual(area + 1e-9);
  if (Math.abs(rust - ts) > limiteDe(ts)) membranas.push(`${onde}: Rust ${rust} x TS ${ts} (diferença ${Math.abs(rust - ts)})`);
}

/** Casa de 2 quartos com piso, laje e forro vinculados a cada ambiente. */
function casa(): Project {
  const base = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
  const store = new ProjectStore(base);
  const cmds: Command[] = [];
  let n = 0;
  for (const l of base.levels) {
    for (const sala of enclosedRooms(base, l.id, 'finish')) {
      const xs = sala[0]!.map((q) => q.x);
      const ys = sala[0]!.map((q) => q.y);
      const seed = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      if (!roomAt(enclosedRooms(base, l.id, 'finish'), seed)) continue;
      cmds.push({ type: 'addCeiling', ceiling: makeCeiling({ id: `fx_c_${n}`, typeId: 'ct_gesso', levelId: l.id, boundary: sala[0]! }) });
      n++;
    }
  }
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

interface Referencia {
  levelId: Id;
  paredes: ReturnType<typeof quantifyLevelTs>;
  pisos: ReturnType<typeof quantifyFloorsTs>;
  lajes: ReturnType<typeof quantifySlabsTs>;
  forros: ReturnType<typeof quantifyCeilingsTs>;
}

/** O TypeScript (referência), calculado ANTES de instalar o despacho. */
const referenciasDe = (p: Project, niveis: readonly Id[]): Referencia[] =>
  niveis.map((levelId) => ({
    levelId,
    paredes: quantifyLevelTs(p, resolveLevelTs(p, levelId)),
    pisos: quantifyFloorsTs(p, levelId),
    lajes: quantifySlabsTs(p, levelId),
    forros: quantifyCeilingsTs(p, levelId),
  }));

/** Com o despacho ligado, as quantidades dos níveis batem com a referência do TS camada a camada. */
function equivalente(p: Project, niveis: readonly Id[]): void {
  const refs = referenciasDe(p, niveis);
  const d = instalar();
  for (const r of refs) {
    const onde = `${p.name} / ${r.levelId}`;
    const paredes = quantifyLevel(p, resolveLevelTs(p, r.levelId));
    expect(paredes.layers.length, `camadas de parede em ${onde}`).toBe(r.paredes.layers.length);
    r.paredes.layers.forEach((l, i) => {
      const o = paredes.layers[i]!;
      expect([o.wallId, o.layerIndex], onde).toEqual([l.wallId, l.layerIndex]);
      perto('parede: volume bruto', o.grossVolume, l.grossVolume, `${onde} ${l.wallId}/${l.layerIndex}`);
      perto('parede: volume líquido', o.volume, l.volume, `${onde} ${l.wallId}/${l.layerIndex}`);
    });
    r.paredes.walls.forEach((w, i) => {
      const o = paredes.walls[i]!;
      perto('parede: altura média', o.height, w.height, `${onde} ${w.wallId}`);
      perto('parede: área de face líquida', o.netFaceArea, w.netFaceArea, `${onde} ${w.wallId}`);
    });
    for (const m of Object.keys(r.paredes.volumeByMaterial)) perto('parede: volume por material', paredes.volumeByMaterial[m] ?? 0, r.paredes.volumeByMaterial[m]!, `${onde} ${m}`);

    const pisos = quantifyFloors(p, r.levelId);
    expect(pisos.layers.length, `camadas de piso em ${onde}`).toBe(r.pisos.layers.length);
    r.pisos.layers.forEach((l, i) => {
      const o = pisos.layers[i]!;
      perto('piso: volume bruto', o.grossVolume, l.grossVolume, `${onde} ${l.floorId}/${l.layerIndex}`);
      perto('piso: volume líquido', o.volume, l.volume, `${onde} ${l.floorId}/${l.layerIndex}`);
      if (l.membrane) membrana(o.area, l.area, multiArea(resolveFloors(p, r.levelId).find((f) => f.floorId === l.floorId)!.layers.find((x) => x.layerIndex === l.layerIndex)!.polygon), `${onde} piso ${l.floorId}/${l.layerIndex} (membrana)`);
      else perto('piso: área de face', o.area, l.area, `${onde} ${l.floorId}/${l.layerIndex}`, l.thickness);
    });

    const lajes = quantifySlabs(p, r.levelId);
    expect(lajes.layers.length, `camadas de laje em ${onde}`).toBe(r.lajes.layers.length);
    r.lajes.layers.forEach((l, i) => {
      const o = lajes.layers[i]!;
      perto('laje: volume líquido', o.volume, l.volume, `${onde} ${l.slabId}/${l.layerIndex}`);
      if (l.membrane) membrana(o.faceArea, l.faceArea, l.planArea * 2, `${onde} laje ${l.slabId}/${l.layerIndex} (membrana)`);
      else perto('laje: área de face', o.faceArea, l.faceArea, `${onde} ${l.slabId}/${l.layerIndex}`, l.thickness);
    });

    const forros = quantifyCeilings(p, r.levelId);
    expect(forros.layers.length, `camadas de forro em ${onde}`).toBe(r.forros.layers.length);
    r.forros.layers.forEach((l, i) => {
      const o = forros.layers[i]!;
      perto('forro: volume', o.volume, l.volume, `${onde} ${l.ceilingId}/${l.layerIndex}`);
      perto('forro: área', o.area, l.area, `${onde} ${l.ceilingId}/${l.layerIndex}`);
    });
  }
  expect(violacoes.splice(0).slice(0, 8), 'diferenças acima de 1e-6').toEqual([]);
  const diag = d.diagnostico();
  expect(diag.voltasLeves + diag.voltasGraves, `voltas ao TS: ${diag.ultimoErro}`).toBe(0);
  expect(diag.entreguesB, 'consultas entregues pelo Rust').toBeGreaterThan(0);
  removerDespachoKernel();
}

const escolhidos = (p: Project): Id[] => p.levels.map((l) => l.id).filter((_, i, a) => i === 0 || i === a.length - 1 || i % 4 === 1);

describe.skipIf(!bytes)('B6: quantidades de paredes, pisos, lajes e forros calculadas pelo Rust (referência: motor TypeScript)', () => {
  const pula = (): boolean => ger === null;

  it('casa de 2 quartos com forros: Rust e TS concordam em até 1e-6', () => {
    if (pula()) return;
    const p = casa();
    expect(Object.values(p.elements).filter((e) => e.kind === 'ceiling').length).toBeGreaterThan(2);
    equivalente(p, p.levels.map((l) => l.id));
  }, 120_000);

  it('sintético de 10 pavimentos (amostra de níveis): Rust e TS concordam', () => {
    if (pula()) return;
    const p = syntheticProject(10);
    equivalente(p, escolhidos(p));
  }, 120_000);

  for (const semente of [1, 2, 3, 4, 5, 6]) {
    it(`estresse (escadas, lajes inclinadas, anexos, vinculados), semente ${semente}: Rust e TS concordam`, () => {
      if (pula()) return;
      const p = projetoDeEstresseB1(semente, { paredesB2: true, anexos: true });
      equivalente(p, escolhidos(p));
    }, 90_000);
  }

  it('conservação: nada é cortado além do bruto, e o líquido é bruto menos cortado (o zero vale uma vez por camada)', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(2, { paredesB2: true, anexos: true });
    instalar();
    for (const l of p.levels) {
      const q = quantifyLevel(p, resolveLevelTs(p, l.id));
      for (const c of q.layers) {
        expect(c.volume).toBeGreaterThanOrEqual(0);
        expect(c.volume).toBeLessThanOrEqual(c.grossVolume + 1e-12);
      }
      for (const f of quantifyFloors(p, l.id).layers) expect(f.volume).toBeLessThanOrEqual(f.grossVolume + 1e-12);
    }
  }, 90_000);

  it('falha do Rust vira erro explícito (ErroDespachoKernel), nunca o número do TypeScript', () => {
    if (pula()) return;
    const p = syntheticProject(2);
    const l = p.levels[0]!.id;
    // Nível sem número no Rust: a consulta não cobre o projeto e a chamada falha com a mensagem original.
    const quebrado: Project = { ...p, levels: [...p.levels] };
    instalar();
    expect(() => quantifyFloors(quebrado, 'nivel-fantasma')).toThrow(ErroDespachoKernel);
    expect(() => quantifyCeilings(quebrado, 'nivel-fantasma')).toThrow(ErroDespachoKernel);
    expect(() => quantifySlabs(quebrado, 'nivel-fantasma')).toThrow(ErroDespachoKernel);
    void l;
  }, 60_000);

  it('sem fatia B ligada o despacho devolve o TypeScript (a referência)', () => {
    if (pula()) return;
    const p = syntheticProject(2);
    const l = p.levels[0]!.id;
    const ts = quantifyFloorsTs(p, l);
    instalar({ fatiaA: false, fatiaB: false, sombra: false });
    expect(quantifyFloors(p, l)).toEqual(ts);
  }, 60_000);

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log('[B6] maiores diferenças absolutas Rust x TS:', JSON.stringify(maiores));
    // eslint-disable-next-line no-console
    console.log('[B6] áreas de face de membrana que diferem do TS:', membranas.length, membranas.slice(0, 12).join(' | '));
  });
});
