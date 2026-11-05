/**
 * B5 (decisão 0050): despacho de `resolveFloors`, `resolveSlabs` e da junção (`junction_nivel`) para o Rust, com o binário de verdade. Roda só em
 * `npm run test:wasm` (`KERNEL_WASM_PATH` aponta para um wasm recém-compilado). A equivalência do despacho usa `compararB1` (1e-6 nos campos, 0048 e 0049 com
 * K = 0,08), sem afrouxar nada: o resultado do despacho (já convertido para os tipos do TS) e o do TS passam pela MESMA codificação. Com a fatia B ligada, a
 * junção é despachada, e a saída crua do Rust é comparada com a referência do TS (`referenciaB3`, sobre `junctionLevelTs`) pelo comparador oficial `compararB3`
 * (1e-6 nos campos, 0049 com K = 0,08). A sombra da junção segue em `kernelDespachoB.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ProjectStore, makeFloor, makeSlab, migrateProject, type Command, type Id, type Project } from '@hestia/model';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { enclosedRooms, roomAt } from '../packages/engine/src/enclosed.ts';
import { resolveFloors, resolveFloorsTs, type ResolvedFloor } from '../packages/engine/src/floors.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { junctionLevel, junctionLevelTs } from '../packages/engine/src/junctionLevel.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaB1, referenciaDeResultados } from '../packages/engine/src/kernelB.ts';
import { referenciaB3, type JuncaoB3 } from '../packages/engine/src/kernelB3.ts';
import { converterJuncao } from '../packages/engine/src/kernelDespachoB.ts';
import { compararB1 } from '../packages/engine/src/kernelComparaB.ts';
import { compararB3 } from '../packages/engine/src/kernelComparaB3.ts';
import { instalarDespachoKernel, removerDespachoKernel, K_0049_FATIA_B, type ConfigDespacho, type DespachoKernel, type OpcoesDespacho } from '../packages/engine/src/kernelDespacho.ts';
import { resolveSlabs, resolveSlabsTs, type ResolvedSlab } from '../packages/engine/src/slabs.ts';
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
const SOMBRA: ConfigDespacho = { fatiaA: false, fatiaB: true, sombra: true };

const instalar = (config: ConfigDespacho, extra: Partial<OpcoesDespacho> = {}): DespachoKernel => instalarDespachoKernel({ gerenciador: () => ger, config: () => config, ...extra });

/** O que o TypeScript produz para um nível, calculado ANTES de instalar o despacho (e, por isso, sem nenhum resultado do Rust no caminho). */
interface ReferenciaDoNivel {
  levelId: Id;
  pisos: ResolvedFloor[];
  lajes: ResolvedSlab[];
}

const referenciasDe = (p: Project, niveis?: readonly Id[]): ReferenciaDoNivel[] =>
  p.levels.filter((l) => !niveis || niveis.includes(l.id)).map((l) => ({ levelId: l.id, pisos: resolveFloorsTs(p, l.id), lajes: resolveSlabsTs(p, l.id) }));

/** Compara o que o despacho entrega (pisos e lajes) com o TS; devolve as divergências. A junção (B3) é comparada no teste dela (`compararB3`). */
function divergenciasDe(p: Project, refs: ReferenciaDoNivel[]): string[] {
  const b = montarCenaB1(p);
  const out: string[] = [];
  for (const r of refs) {
    const pisos = resolveFloors(p, r.levelId);
    const lajes = resolveSlabs(p, r.levelId);
    const pl = compararB1(referenciaDeResultados(r.pisos, r.lajes, b), referenciaDeResultados(pisos, lajes, b), { k0049: K_0049_FATIA_B });
    out.push(...pl.divergencias.map((d) => `${r.levelId} pisos e lajes: ${d}`));
  }
  return out;
}

/** Instala o despacho, compara e confere que o Rust entregou tudo (nenhuma volta ao TS). */
function equivalente(p: Project, niveis?: readonly Id[]): void {
  const refs = referenciasDe(p, niveis);
  const d = instalar(DESPACHO);
  expect(divergenciasDe(p, refs), p.name).toEqual([]);
  const diag = d.diagnostico();
  expect(diag.entreguesB, 'consultas entregues pelo Rust (pisos e lajes, por nível)').toBe(refs.length);
  expect(diag.voltasLeves + diag.voltasGraves, `voltas ao TS: ${diag.ultimoErro}`).toBe(0);
  removerDespachoKernel();
}

const escolhidos = (p: Project): Id[] => p.levels.map((l) => l.id).filter((_, i, a) => i === 0 || i === a.length - 1 || i % 4 === 1);

/** Um piso e uma laje vinculados a cada ambiente de cada pavimento da casa de 2 quartos (como no teste da B3). */
function casaComVinculados(): Project {
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
      cmds.push({ type: 'addFloor', floor: makeFloor({ id: `fx_f_${n}`, typeId: n % 2 ? 'ft_unico' : 'ft_ceram', levelId: l.id, boundary: sala[0]!, outlineSource: { mode: 'walls-finish', seed, linked: true } }) });
      cmds.push({ type: 'addSlab', slab: makeSlab({ id: `fx_s_${n}`, typeId: n % 2 ? 'ls_unica' : 'ls_mac15', levelId: l.id, boundary: sala[0]!, outlineSource: { mode: 'walls-core', seed, linked: true } }) });
      n++;
    }
  }
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

describe.skipIf(!bytes)('B5: despacho de pisos, lajes e junção para o Rust (a junção é comparada com o TS pelo comparador oficial)', () => {
  const pula = (): boolean => ger === null;

  it('fixture do repositório (casa de 2 quartos, com piso e laje vinculados a cada ambiente): equivalente ao TS', () => {
    if (pula()) return;
    const casa = casaComVinculados();
    expect(Object.values(casa.elements).filter((e) => e.kind === 'floor' || e.kind === 'slab').length).toBeGreaterThan(6);
    equivalente(casa);
  }, 120_000);

  it('sintético de 10 pavimentos (primeiro, intermediários e último): equivalente ao TS', () => {
    if (pula()) return;
    const p = syntheticProject(10);
    equivalente(p, escolhidos(p));
  }, 120_000);

  it('sintético de 20 pavimentos (primeiro, intermediários e último): equivalente ao TS', () => {
    if (pula()) return;
    const p = syntheticProject(20);
    equivalente(p, escolhidos(p));
  }, 120_000);

  // Uma semente por teste (cada `it` bem abaixo de 30 s); o diagnóstico é do próprio teste (uma instalação por teste).
  for (const semente of [1, 2, 3, 4, 5, 6]) {
    it(`estresse da B (escadas, términos, lajes inclinadas, vinculados, anexos entre pavimentos), semente ${semente}: equivalente ao TS`, () => {
      if (pula()) return;
      const p = projetoDeEstresseB1(semente, { paredesB2: true, anexos: true });
      // Cada teste fica abaixo de 30 s: primeiro, intermediário e último pavimentos da amostra (a cena cobre o projeto inteiro).
      equivalente(p, escolhidos(p));
    }, 90_000);
  }

  it('a junção (B3) é despachada com a fatia B ligada: junction_nivel é consultado uma vez e o resultado é o de converterJuncao', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(2, { paredesB2: true, anexos: true, pavimentos: 2, semParedes: false });
    const l = p.levels[0]!.id;
    const captura: { consultas: number; juncao?: JuncaoB3 } = { consultas: 0 };
    const d = instalar(DESPACHO, {
      intervencaoDeTesteB: {
        juncao: (j) => {
          captura.consultas++;
          captura.juncao = j;
          return j;
        },
      },
    });
    const obtida = junctionLevel(p, l);
    const diag = d.diagnostico();
    expect(captura.consultas, 'consultas a junction_nivel (uma por nível)').toBe(1);
    expect(diag.entreguesB, 'consultas entregues pelo Rust (a junção, por nível)').toBe(1);
    expect(diag.voltasLeves + diag.voltasGraves, `voltas ao TS: ${diag.ultimoErro}`).toBe(0);
    // O mesmo que a conversão da saída do Rust (cena de A1 e B1 montadas como o despacho as monta).
    const a1 = montarCenaA1(p, true);
    const b = montarCenaB1(p, a1.materialDe);
    expect(obtida).toEqual(converterJuncao(l, captura.juncao!, { b, a1 }));
    // A saída crua do Rust contra a referência do TS (junctionLevelTs, via referenciaB3), pelo comparador oficial da junção (B3).
    const cmp = compararB3(referenciaB3(p, l, b, a1), captura.juncao!, { k0049: K_0049_FATIA_B });
    expect(cmp.divergencias, `junção ${l} (Rust x TS): ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
  }, 60_000);

  it('o memo por projeto e nível entrega o mesmo objeto; as opções de planta (layers: false) seguem no TS', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(3, { paredesB2: true, anexos: true, pavimentos: 2, semParedes: false });
    const l = p.levels[0]!.id;
    const semOpcoes = resolveFloorsTs(p, l, { layers: false });
    const d = instalar(DESPACHO);
    const a = resolveFloors(p, l);
    expect(resolveFloors(p, l)).toBe(a);
    expect(resolveSlabs(p, l)).toBe(resolveSlabs(p, l));
    expect(d.diagnostico().entreguesB).toBe(1);
    expect(resolveFloors(p, l, { layers: false })).toEqual(semOpcoes);
    expect(d.diagnostico().entreguesB).toBe(1);
  }, 60_000);

  it('edição do projeto invalida: mover uma parede e mexer em um piso mudam o resultado, que segue igual ao do TS', () => {
    if (pula()) return;
    const store = new ProjectStore(projetoDeEstresseB1(2, { paredesB2: true, anexos: true, pavimentos: 2, semParedes: false }));
    const p0 = store.project;
    const l = p0.levels[0]!.id;
    const refs0 = referenciasDe(p0, [l]);
    const d = instalar(DESPACHO);
    const antes = resolveFloors(p0, l);
    expect(divergenciasDe(p0, refs0)).toEqual([]);

    // 1) mover o fim de uma parede do nível: o término por camada e a junção mudam
    const parede = Object.values(p0.elements).find((e) => e.kind === 'wall' && e.levelId === l)!;
    store.exec({ type: 'updateElements', ids: [parede.id], patch: { b: { x: (parede as { b: { x: number } }).b.x + 0.4, y: (parede as { b: { y: number } }).b.y + 0.15 } } });
    const p1 = store.project;
    expect(p1).not.toBe(p0);
    const refs1 = referenciasDe(p1, [l]);
    d.encerrar();
    expect(divergenciasDe(p1, refs1)).toEqual([]);

    // 2) deslocar um piso estático do nível: as camadas do piso mudam de cota
    const piso = Object.values(p1.elements).find((e) => e.kind === 'floor' && e.levelId === l)!;
    store.exec({ type: 'updateElements', ids: [piso.id], patch: { heightOffset: ((piso as { heightOffset?: number }).heightOffset ?? 0) + 0.07 } });
    const p2 = store.project;
    const refs2 = referenciasDe(p2, [l]);
    d.encerrar();
    expect(divergenciasDe(p2, refs2)).toEqual([]);
    expect(JSON.stringify(resolveFloors(p2, l).map((f) => [f.floorId, f.topZ]))).not.toBe(JSON.stringify(antes.map((f) => [f.floorId, f.topZ])));

    // o projeto antigo continua respondendo o que respondia (memo por projeto)
    expect(resolveFloors(p0, l)).toBe(antes);
    expect(d.diagnostico().voltasLeves + d.diagnostico().voltasGraves).toBe(0);
  }, 120_000);
});

describe.skipIf(!bytes)('B5: modo sombra da fatia B', () => {
  const pula = (): boolean => ger === null;

  it('sem divergência: compara pisos, lajes e junção, não registra nada e devolve exatamente o resultado do TS', () => {
    if (pula()) return;
    const p = casaComVinculados();
    const refs = referenciasDe(p);
    const juncoes = new Map(p.levels.map((l) => [l.id, junctionLevelTs(p, l.id)] as const));
    const d = instalar(SOMBRA);
    for (const r of refs) {
      expect(resolveFloors(p, r.levelId)).toEqual(r.pisos);
      expect(resolveSlabs(p, r.levelId)).toEqual(r.lajes);
    }
    for (const [id, j] of juncoes) expect(junctionLevel(p, id)).toBe(j);
    const diag = d.diagnostico();
    expect(diag.comparacoes).toBe(refs.length * 2 + juncoes.size);
    expect(diag.divergencias, diag.ultimaDivergencia?.mensagem).toBe(0);
    expect(diag.registro).toEqual([]);
    expect(diag.entreguesB).toBe(0); // em sombra nada é entregue pelo Rust
    // a mesma chamada não compara de novo
    resolveFloors(p, refs[0]!.levelId);
    expect(d.diagnostico().comparacoes).toBe(refs.length * 2 + juncoes.size);
  }, 120_000);

  it('divergência artificial em um piso: registra nível, elemento e campo, e devolve o TS', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(4, { paredesB2: true, anexos: true, pavimentos: 2, semParedes: false });
    const l = p.levels[0]!.id;
    const ts = resolveFloorsTs(p, l);
    expect(ts.length).toBeGreaterThan(0);
    const d = instalar(SOMBRA, { intervencaoDeTesteB: { pisosELajes: (el) => el.map((e, i) => (i === 0 ? { ...e, topoZ: e.topoZ + 0.01 } : e)) } });
    expect(resolveFloors(p, l)).toEqual(ts);
    const diag = d.diagnostico();
    expect(diag.comparacoes).toBe(1);
    expect(diag.divergencias).toBe(1);
    expect(diag.registro).toHaveLength(1);
    expect(diag.ultimaDivergencia).toMatchObject({ fatia: 'B', nivel: l, elemento: ts[0]!.floorId, campo: 'topo' });
    expect(diag.ultimaDivergencia!.mensagem).toContain('topo');
    expect(diag.entreguesB).toBe(0);
  }, 90_000);

  it('divergência artificial em uma laje: registra o elemento da laje; o buffer circular guarda no máximo 20', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(4, { paredesB2: true, anexos: true, pavimentos: 3, semParedes: false });
    const tsPorNivel = new Map(p.levels.map((lv) => [lv.id, resolveSlabsTs(p, lv.id)] as const));
    const d = instalar(SOMBRA, { intervencaoDeTesteB: { pisosELajes: (el) => el.map((e) => (e.laje ? { ...e, baseZ: e.baseZ - 0.02 } : e)) } });
    let primeiro: Id | null = null;
    for (const lv of p.levels) {
      expect(resolveSlabs(p, lv.id)).toEqual(tsPorNivel.get(lv.id));
      primeiro ??= tsPorNivel.get(lv.id)![0]?.slabId ?? null;
    }
    const diag = d.diagnostico();
    expect(diag.divergencias).toBeGreaterThanOrEqual(1);
    expect(diag.ultimaDivergencia).toMatchObject({ fatia: 'B', campo: 'base' });
    expect(diag.ultimaDivergencia!.elemento).not.toBeNull();
    expect(diag.registro.length).toBeLessThanOrEqual(20);
  }, 90_000);

  it('divergência artificial na junção: registra a parede e o campo, e devolve o TS', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(2, { paredesB2: true, anexos: true, pavimentos: 2, semParedes: false });
    const l = p.levels[0]!.id;
    const ts = junctionLevelTs(p, l);
    const d = instalar(SOMBRA, { intervencaoDeTesteB: { juncao: (j) => ({ ...j, paredes: j.paredes.map((w, i) => (i === 0 ? { ...w, corte: !w.corte } : w)) }) } });
    expect(junctionLevel(p, l)).toBe(ts);
    const diag = d.diagnostico();
    expect(diag.divergencias).toBe(1);
    // O comparador da junção (T1) não compara a flag `corte` isolada: vale o resultado final da camada de parede por altura. Inverter `corte` muda a
    // região final (as partes da junção passam a valer ou deixam de valer) e é por isso que a divergência é registrada com este campo.
    expect(diag.ultimaDivergencia).toMatchObject({ fatia: 'B', nivel: l, campo: 'região final da camada' });
    expect(diag.ultimaDivergencia!.parede).not.toBeNull();
  }, 90_000);

  it('a sombra sem a fatia B ligada não faz nada', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(1, { pavimentos: 1, semParedes: false });
    const d = instalar({ fatiaA: false, fatiaB: false, sombra: true });
    expect(resolveFloors(p, p.levels[0]!.id)).toEqual(resolveFloorsTs(p, p.levels[0]!.id));
    expect(d.diagnostico().comparacoes).toBe(0);
  }, 60_000);
});
