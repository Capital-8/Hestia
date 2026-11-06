/**
 * Quantidades no Rust (esquema v12, consultas `quant_paredes`, `quant_pisos`, `quant_lajes` e `quant_forros`): com a fatia B ligada, `quantifyLevel`,
 * `quantifyFloors`, `quantifySlabs` e `quantifyCeilings` NÃO usam geometria do TypeScript; o motor TypeScript (`quantify*Ts`) é só a referência
 * deste teste. Roda só em `npm run test:wasm` (`KERNEL_WASM_PATH` aponta para um wasm recém-compilado).
 *
 * Critério (camada a camada): diferença absoluta de até 1e-6 (m³ e m²) MAIS o efeito de grade da camada, derivado da geometria dela (ver `efeitoDeGrade`),
 * nunca uma tolerância fixa maior. Onde o TypeScript aproximava (integração por triangulação em topo não afim), o Rust exato é a verdade; qualquer diferença
 * acima do critério é medida e relatada, e o teste falha.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dist, intersection, multiArea, type MultiPolygon } from '@hestia/geom';
import { ProjectStore, makeCeiling, migrateProject, type Command, type Id, type Project } from '@hestia/model';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { enclosedRooms, roomAt } from '../packages/engine/src/enclosed.ts';
import { quantifyCeilings, quantifyCeilingsTs } from '../packages/engine/src/ceilingQuantities.ts';
import { quantifyFloors, quantifyFloorsTs } from '../packages/engine/src/floorQuantities.ts';
import { resolveFloors } from '../packages/engine/src/floors.ts';
import { bandPiece, cutVolume, floorCutters, floorLayerPiece, slabCoversFloor, slabCutters, slabLayerPiece, wallCutters, type CutterSolid, type JunctionKind, type SolidPiece } from '../packages/engine/src/junctionNet.ts';
import { resolveSlabs } from '../packages/engine/src/slabs.ts';
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
const instalar = (config: ConfigDespacho = DESPACHO): DespachoKernel => instalarDespachoKernel({ gerenciador: () => ger, config: () => config });

/**
 * Efeito de grade de uma camada (m³ por metro de grade): o que as aproximações das duas pontas podem mover o volume, derivado da geometria dela.
 *
 * Cada vértice de uma região pode sair do lugar exato por até meia célula da grade em cada eixo. O Rust (decisão do dono: a grade vale para as
 * quantidades) arredonda a 1 µm; o TypeScript arredonda cada entrada de `polygon-clipping` a 1e-7 m, em cada passo da cadeia (0,1 µm, de modo que
 * uns poucos passos cabem em uma célula de 1 µm). O deslocamento de uma aresta é então menor que uma célula, `GRADE` = 1 µm (a mesma regra da ADR
 * 0049: `perímetro × 1e-6`), e a área de uma região muda no máximo `perímetro × GRADE`. Um volume é uma soma de regiões vezes a cota delas; por
 * isso o limite de uma camada é a soma, sobre as regiões que entram na conta, de `perímetro × cota máxima × GRADE`:
 *  - o volume bruto (a camada, faixa a faixa): perímetro de cada região × altura dela;
 *  - o volume cortado: para cada peça cortadora que de fato se sobrepõe, o perímetro da interseção × a maior sobreposição de cota nos vértices.
 * O líquido é `max(0, bruto - cortado)`, 1-Lipschitz, então herda a soma dos dois. Áreas de face derivadas de volume dividem pela espessura.
 */
const GRADE = 1e-6;
const BASE = 1e-6;

const perimetroDe = (m: MultiPolygon): number => m.reduce((s, poly) => s + poly.reduce((t, r) => t + r.reduce((u, q, i) => u + dist(q, r[(i + 1) % r.length]!), 0), 0), 0);

/** Soma, sobre as peças cortadoras que se sobrepõem à peça, de `perímetro da interseção × maior sobreposição de cota`. */
function efeitoDoCorte(piece: SolidPiece, kind: JunctionKind, cutters: readonly CutterSolid[], skip?: ReadonlySet<CutterSolid>): number {
  let e = 0;
  for (const c of cutters) {
    if (skip?.has(c)) continue;
    for (const cp of c.pieces) {
      if (cutVolume(piece, kind, [{ kind: c.kind, pieces: [cp] }]) === 0) continue;
      const comum = intersection(piece.poly, cp.poly);
      let h = 0;
      for (const poly of comum) for (const r of poly) for (const q of r) {
        const [a0, a1] = piece.span(q);
        const [b0, b1] = cp.span(q);
        h = Math.max(h, Math.min(a1, b1) - Math.max(a0, b0));
      }
      e += perimetroDe(comum) * h;
    }
  }
  return e;
}


type Nivel = { p: Project; levelId: Id };
const SLAB_FATOR = (percentual: number): number => 1 / Math.cos(Math.atan(Math.abs(percentual) / 100));

/** Efeito de grade de uma camada de parede (bruto, ou bruto + corte), com a geometria do TypeScript. */
function efeitoParede({ p, levelId }: Nivel, wallId: Id, layerIndex: number, comCorte: boolean): number {
  const rw = resolveLevelTs(p, levelId).walls[wallId]!;
  const l = rw.layers.find((x) => x.layerIndex === layerIndex)!;
  const cutters = comCorte ? [...floorCutters(p, levelId), ...slabCutters(p, levelId)] : [];
  let e = 0;
  for (const b of l.bands) {
    e += perimetroDe(b.poly) * (b.z1 - b.z0);
    if (comCorte) e += efeitoDoCorte(bandPiece(rw, b, { priority: l.priority, core: l.core }), 'wall', cutters);
  }
  return e;
}

function efeitoPiso({ p, levelId }: Nivel, floorId: Id, layerIndex: number, comCorte: boolean): number {
  const rf = resolveFloors(p, levelId).find((f) => f.floorId === floorId)!;
  const l = rf.layers.find((x) => x.layerIndex === layerIndex)!;
  let e = perimetroDe(l.polygon) * (l.z1 - l.z0);
  if (comCorte) {
    const lajes = slabCutters(p, levelId);
    const cortadores = [...lajes, ...floorCutters(p, levelId), ...wallCutters(p, levelId)];
    e += efeitoDoCorte(floorLayerPiece(rf, l), 'floor', cortadores, new Set(lajes.filter((c) => slabCoversFloor(c, rf))));
  }
  return e;
}

function efeitoLaje({ p, levelId }: Nivel, slabId: Id, layerIndex: number, comCorte: boolean): number {
  const rs = resolveSlabs(p, levelId).find((x) => x.slabId === slabId)!;
  const l = rs.layers.find((x) => x.layerIndex === layerIndex)!;
  let e = perimetroDe(l.polygon) * (l.z1 - l.z0);
  if (comCorte) e += efeitoDoCorte(slabLayerPiece(rs, l), 'slab', [...floorCutters(p, levelId), ...slabCutters(p, levelId), ...wallCutters(p, levelId)]);
  return e;
}

/** A maior diferença absoluta já medida em cada grandeza (relatada no fim), e a maior fração do limite derivado que uma diferença usou. */
const maiores: Record<string, number> = {};
const usoDoLimite: Record<string, number> = {};
const violacoes: string[] = [];
/** Comparações cuja diferença passou de BASE: o limite derivado é calculado depois, com o despacho removido (a geometria do limite é a do TypeScript). */
const pendentes: Array<{ rotulo: string; d: number; onde: string; limite: () => number }> = [];
function perto(rotulo: string, rust: number, ts: number, onde: string, limite?: () => number): void {
  const d = Math.abs(rust - ts);
  maiores[rotulo] = Math.max(maiores[rotulo] ?? 0, d);
  if (d <= BASE) return;
  if (!limite) violacoes.push(`${rotulo} em ${onde}: Rust ${rust} x TS ${ts} (diferença ${d}, sem efeito de grade)`);
  else pendentes.push({ rotulo, d, onde, limite });
}
/** Julga as comparações pendentes: diferença <= BASE + GRADE x efeito da camada. */
function julgarPendentes(): void {
  for (const q of pendentes.splice(0)) {
    const limite = BASE + GRADE * q.limite();
    usoDoLimite[q.rotulo] = Math.max(usoDoLimite[q.rotulo] ?? 0, (q.d - BASE) / (limite - BASE || 1));
    if (!(q.d <= limite)) violacoes.push(`${q.rotulo} em ${q.onde}: diferença ${q.d} acima do limite derivado ${limite}`);
  }
}

/**
 * Área de face de membrana (espessura zero): o TypeScript avalia a cota do cortador num único vértice da interseção; o Rust a avalia em cada ponto (exato).
 * As diferenças são medidas e listadas, não reprovadas; o Rust só pode ficar entre 0 e a área da camada.
 */
const membranas: string[] = [];
function membrana(rust: number, ts: number, area: number, onde: string): void {
  expect(rust, onde).toBeGreaterThanOrEqual(0);
  expect(rust, onde).toBeLessThanOrEqual(area + 1e-9);
  if (Math.abs(rust - ts) > BASE) membranas.push(`${onde}: Rust ${rust} x TS ${ts} (diferença ${Math.abs(rust - ts)})`);
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
    const nivel: Nivel = { p, levelId: r.levelId };
    const paredes = quantifyLevel(p, resolveLevelTs(p, r.levelId));
    expect(paredes.layers.length, `camadas de parede em ${onde}`).toBe(r.paredes.layers.length);
    r.paredes.layers.forEach((l, i) => {
      const o = paredes.layers[i]!;
      expect([o.wallId, o.layerIndex], onde).toEqual([l.wallId, l.layerIndex]);
      perto('parede: volume bruto', o.grossVolume, l.grossVolume, `${onde} ${l.wallId}/${l.layerIndex}`, () => efeitoParede(nivel, l.wallId, l.layerIndex, false));
      perto('parede: volume líquido', o.volume, l.volume, `${onde} ${l.wallId}/${l.layerIndex}`, () => efeitoParede(nivel, l.wallId, l.layerIndex, true));
    });
    r.paredes.walls.forEach((w, i) => {
      const o = paredes.walls[i]!;
      perto('parede: altura média', o.height, w.height, `${onde} ${w.wallId}`);
      perto('parede: área de face líquida', o.netFaceArea, w.netFaceArea, `${onde} ${w.wallId}`);
    });
    for (const m of Object.keys(r.paredes.volumeByMaterial)) {
      // o volume do material soma as camadas dele: o limite é a soma dos limites delas
      const soma = () => r.paredes.layers.filter((l) => l.materialId === m).reduce((t, l) => t + efeitoParede(nivel, l.wallId, l.layerIndex, true), 0);
      perto('parede: volume por material', paredes.volumeByMaterial[m] ?? 0, r.paredes.volumeByMaterial[m]!, `${onde} ${m}`, soma);
    }

    const pisos = quantifyFloors(p, r.levelId);
    expect(pisos.layers.length, `camadas de piso em ${onde}`).toBe(r.pisos.layers.length);
    r.pisos.layers.forEach((l, i) => {
      const o = pisos.layers[i]!;
      perto('piso: volume bruto', o.grossVolume, l.grossVolume, `${onde} ${l.floorId}/${l.layerIndex}`, () => efeitoPiso(nivel, l.floorId, l.layerIndex, false));
      perto('piso: volume líquido', o.volume, l.volume, `${onde} ${l.floorId}/${l.layerIndex}`, () => efeitoPiso(nivel, l.floorId, l.layerIndex, true));
      if (l.membrane) membrana(o.area, l.area, multiArea(resolveFloors(p, r.levelId).find((f) => f.floorId === l.floorId)!.layers.find((x) => x.layerIndex === l.layerIndex)!.polygon), `${onde} piso ${l.floorId}/${l.layerIndex} (membrana)`);
      else perto('piso: área de face', o.area, l.area, `${onde} ${l.floorId}/${l.layerIndex}`, l.thickness > 0 ? () => efeitoPiso(nivel, l.floorId, l.layerIndex, true) / l.thickness : undefined);
    });

    const lajes = quantifySlabs(p, r.levelId);
    expect(lajes.layers.length, `camadas de laje em ${onde}`).toBe(r.lajes.layers.length);
    r.lajes.layers.forEach((l, i) => {
      const o = lajes.layers[i]!;
      perto('laje: volume líquido', o.volume, l.volume, `${onde} ${l.slabId}/${l.layerIndex}`, () => efeitoLaje(nivel, l.slabId, l.layerIndex, true));
      if (l.membrane) membrana(o.faceArea, l.faceArea, l.planArea * 2, `${onde} laje ${l.slabId}/${l.layerIndex} (membrana)`);
      else perto('laje: área de face', o.faceArea, l.faceArea, `${onde} ${l.slabId}/${l.layerIndex}`, l.thickness > 0 ? () => (efeitoLaje(nivel, l.slabId, l.layerIndex, true) * SLAB_FATOR(resolveSlabs(p, r.levelId).find((x) => x.slabId === l.slabId)?.slope?.percent ?? 0)) / l.thickness : undefined);
    });

    const forros = quantifyCeilings(p, r.levelId);
    expect(forros.layers.length, `camadas de forro em ${onde}`).toBe(r.forros.layers.length);
    r.forros.layers.forEach((l, i) => {
      const o = forros.layers[i]!;
      perto('forro: volume', o.volume, l.volume, `${onde} ${l.ceilingId}/${l.layerIndex}`);
      perto('forro: área', o.area, l.area, `${onde} ${l.ceilingId}/${l.layerIndex}`);
    });
  }
  const diag = d.diagnostico();
  removerDespachoKernel(); // o limite derivado usa a geometria do TypeScript, sem o despacho
  julgarPendentes();
  expect(violacoes.splice(0).slice(0, 8), 'diferenças acima de 1e-6 mais o efeito de grade da camada').toEqual([]);
  expect(diag.voltasLeves + diag.voltasGraves, `voltas ao TS: ${diag.ultimoErro}`).toBe(0);
  expect(diag.entreguesB, 'consultas entregues pelo Rust').toBeGreaterThan(0);
}

const escolhidos = (p: Project): Id[] => p.levels.map((l) => l.id).filter((_, i, a) => i === 0 || i === a.length - 1 || i % 4 === 1);

describe.skipIf(!bytes)('B6: quantidades de paredes, pisos, lajes e forros calculadas pelo Rust (referência: motor TypeScript)', () => {
  const pula = (): boolean => ger === null;

  it('casa de 2 quartos com forros: Rust e TS concordam (1e-6 mais o efeito de grade)', () => {
    if (pula()) return;
    const p = casa();
    expect(Object.values(p.elements).filter((e) => e.kind === 'ceiling').length).toBeGreaterThan(2);
    equivalente(p, p.levels.map((l) => l.id));
  }, 300_000);

  it('sintético de 10 pavimentos (amostra de níveis): Rust e TS concordam', () => {
    if (pula()) return;
    const p = syntheticProject(10);
    equivalente(p, escolhidos(p));
  }, 300_000);

  for (const semente of [1, 2, 3, 4, 5, 6]) {
    it(`estresse (escadas, lajes inclinadas, anexos, vinculados), semente ${semente}: Rust e TS concordam`, () => {
      if (pula()) return;
      const p = projetoDeEstresseB1(semente, { paredesB2: true, anexos: true });
      equivalente(p, escolhidos(p));
    }, 300_000);
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
  }, 300_000);

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
    console.log('[B6] maior fração do limite derivado usada (1 = no limite):', JSON.stringify(usoDoLimite));
    // eslint-disable-next-line no-console
    console.log('[B6] áreas de face de membrana que diferem do TS:', membranas.length, membranas.slice(0, 12).join(' | '));
  });
});
