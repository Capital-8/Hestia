/**
 * A4 (decisão 0047 §12): despacho de `resolveLevel` para o Rust e modo sombra, com o binário de verdade. Roda só em `npm run test:wasm`
 * (`KERNEL_WASM_PATH` aponta para um wasm recém-compilado; o commitado fica velho até o fim da A). A equivalência usa o comparador da A3d
 * (`compararA3d`: 1e-6 nos campos, 0048 e 0049), sem afrouxar nada.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ProjectStore, migrateProject, openingsOfWall, wallsOnLevel, type Id, type Project } from '@hestia/model';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LevelResolveCache } from '../packages/engine/src/resolveLevels.ts';
import { resolveLevel, resolveLevelTs, type PlanResolveOptions } from '../packages/engine/src/resolve.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { montarCenaA1, zDoNivel } from '../packages/engine/src/kernelA1.ts';
import { codificarA3d } from '../packages/engine/src/kernelA3d.ts';
import { compararA3d } from '../packages/engine/src/kernelComparaA3d.ts';
import type { ExcecaoNomeada } from '../packages/engine/src/kernelComparaA3c.ts';
import { instalarDespachoKernel, removerDespachoKernel, LIMITE_REGISTRO, type ConfigDespacho, type DespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { variantesDoNivel } from '../scripts/kernel-a3c-estresse.mts';
import { projetoDeEstresseA3d, projetoDeParedeComPerfil } from '../scripts/kernel-a3d-estresse.mts';

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

const DESPACHO: ConfigDespacho = { fatiaA: true, fatiaB: false, sombra: false };
const SOMBRA: ConfigDespacho = { fatiaA: true, fatiaB: false, sombra: true };

const instalar = (config: ConfigDespacho, intervencaoDeTeste?: Parameters<typeof instalarDespachoKernel>[0]['intervencaoDeTeste']): DespachoKernel =>
  instalarDespachoKernel({ gerenciador: () => ger, config: () => config, ...(intervencaoDeTeste ? { intervencaoDeTeste } : {}) });

/** Exceção nomeada da 0049 (a mesma dos testes da A3d): semente 1, pavimento 0, material 2. */
const excecaoSemente1 = (semente: number, nivel: number): ExcecaoNomeada[] =>
  semente === 1 && nivel === 0 ? [{ material: 2, grupo: 0, silhueta: true, motivo: 'defeito do TS: o unionClipper infla a região em 3,5e-3 m² e preenche um entalhe junto a uma parede curva (0049)' }] : [];

/** Compara o `ResolvedLevel` do despacho com o do TS pelo critério do harness; devolve as divergências. */
function divergenciasDe(p: Project, levelId: Id, opts: PlanResolveOptions, excecoes: ExcecaoNomeada[] = []): string[] {
  const rust = resolveLevel(p, levelId, new Map(), opts);
  const ts = resolveLevelTs(p, levelId, new Map(), opts);
  const a1 = montarCenaA1(p, opts.flatAttach === true);
  const curvas = new Set<number>();
  a1.secoes.paredes_quadro['id_num']!.forEach((id, i) => {
    if (a1.secoes.paredes_quadro['sag']![i] !== 0) curvas.add(id);
  });
  const doModelo = new Set<number>();
  for (const [id, num] of a1.idDe) if ((p.elements[id] as { topProfile?: unknown }).topProfile) doModelo.add(num);
  return compararA3d(codificarA3d(ts, a1), codificarA3d(rust, a1), curvas, doModelo, 20, excecoes).divergencias;
}

describe.skipIf(!bytes)('A4: despacho de resolveLevel para o Rust', () => {
  const pula = (): boolean => ger === null;

  it('fixtures do repositório (casa de 2 quartos) e sintéticos de 10 e 20 pavimentos: equivalente ao TS', () => {
    if (pula()) return;
    const d = instalar(DESPACHO);
    const casa = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    let niveis = 0;
    for (const [p, opcoes] of [[casa, [{}, { cutZ: 0.05 }]], [syntheticProject(10), [{}]], [syntheticProject(20), [{}]]] as const) {
      for (const l of p.levels) {
        for (const op of opcoes) {
          expect(divergenciasDe(p, l.id, op), `${p.name} ${l.id} ${JSON.stringify(op)}`).toEqual([]);
          niveis++;
        }
      }
    }
    const diag = d.diagnostico();
    expect(diag.entreguesPeloRust, 'níveis entregues pelo Rust (nenhum caiu no TS)').toBe(niveis);
    expect(diag.voltasLeves + diag.voltasGraves).toBe(0);
  }, 120_000);

  // término "face" nas camadas de piso e laje: com ele flatAttach muda o que as paredes anexadas enxergam (attachTargets)
  const projetoDasOpcoes = (): Project => {
    const store = new ProjectStore(projetoDeEstresseA3d(5, { paredes: 16, pavimentos: 2, base: 1 }));
    for (const t of Object.values(store.project.floorTypes)) store.exec({ type: 'upsertFloorType', floorType: { ...t, layers: t.layers.map((l) => ({ ...l, termino: 'face' as const })) } });
    for (const t of Object.values(store.project.slabTypes)) store.exec({ type: 'upsertSlabType', slabType: { ...t, layers: t.layers.map((l) => ({ ...l, termino: 'face' as const })) } });
    return store.project;
  };
  const NIVEIS_DAS_OPCOES = projetoDasOpcoes().levels.length;

  // Um pavimento por teste (cada `it` bem abaixo de 30 s); o diagnóstico é do próprio teste (uma instalação por teste).
  for (let nivel = 0; nivel < NIVEIS_DAS_OPCOES; nivel++) {
    it(`opções de planta (cutZ, outlineWalls, planOpenings) e flatAttach chegam à consulta, pavimento ${nivel}`, () => {
      if (pula()) return;
      const p = projetoDasOpcoes();
      const l = p.levels[nivel]!;
      const z = [...zDoNivel(p, l.id).values()];
      const zBase = Math.min(...z.map((x) => x.z0));
      const zTopo = Math.max(...z.map((x) => x.z0 + x.height));
      // Variantes calculadas antes de instalar o despacho: a geração delas não deve contar como entrega do Rust.
      const variantes = [...variantesDoNivel(p, l.id, 5, zBase, zTopo)];
      const d = instalar(DESPACHO);
      let n = 0;
      for (const v of variantes) {
        expect(divergenciasDe(p, l.id, v.opcoes, excecaoSemente1(5, nivel)), `${l.id} ${v.nome}`).toEqual([]);
        n++;
      }
      // flatAttach muda a cota das paredes anexadas: o Rust recebe paredes_z e perfis_z da variante "plana" (outra cena)
      expect(divergenciasDe(p, l.id, { flatAttach: true }, excecaoSemente1(5, nivel)), `${l.id} flatAttach`).toEqual([]);
      n++;
      const diag = d.diagnostico();
      expect(diag.entreguesPeloRust).toBe(n);
      expect(diag.voltasLeves + diag.voltasGraves).toBe(0);
    }, 120_000);
  }

  it('flatAttach muda a cota em algum pavimento (o teste exercita a variante)', () => {
    if (pula()) return;
    const p = projetoDasOpcoes();
    let flatDiferente = 0;
    for (const l of p.levels) {
      const normal = resolveLevelTs(p, l.id, new Map());
      const plano = resolveLevelTs(p, l.id, new Map(), { flatAttach: true });
      if (JSON.stringify(normal) !== JSON.stringify(plano)) flatDiferente++;
    }
    expect(flatDiferente, 'níveis em que flatAttach muda a cota (o teste exercita a variante)').toBeGreaterThan(0);
  });

  it('o cache de níveis do TS (LevelResolveCache) segue valendo com o resultado do Rust', () => {
    if (pula()) return;
    const d = instalar(DESPACHO);
    const p = projetoDeEstresseA3d(3, { paredes: 10, pavimentos: 2 });
    const cache = new LevelResolveCache();
    const l0 = p.levels[0]!.id;
    const a = cache.get(p, l0);
    expect(cache.get(p, l0)).toBe(a);
    expect(cache.recalculated).toBe(1);
    expect(d.diagnostico().entreguesPeloRust).toBe(1);
    // o mesmo projeto e as mesmas opções reaproveitam o resultado já obtido do Rust (memo por projeto)
    expect(resolveLevel(p, l0, new Map())).toBe(resolveLevel(p, l0, new Map()));
    expect(d.diagnostico().entreguesPeloRust).toBe(1);
  }, 60_000);

  it('edição do projeto invalida: mover parede e mexer em abertura mudam o resultado, que segue igual ao do TS', () => {
    if (pula()) return;
    const d = instalar(DESPACHO);
    const store = new ProjectStore(projetoDeEstresseA3d(7, { paredes: 14, pavimentos: 1 }));
    const p0 = store.project;
    const l = p0.levels[0]!.id;
    const comprimento = (w: { a: { x: number; y: number }; b: { x: number; y: number } }): number => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const comAbertura = wallsOnLevel(p0, l).filter((w) => openingsOfWall(p0, w.id).length > 0).sort((a, b) => comprimento(b) - comprimento(a))[0]!;
    expect(comAbertura, 'parede com abertura').toBeTruthy();
    const antes = resolveLevel(p0, l, new Map());
    expect(divergenciasDe(p0, l, {}, excecaoSemente1(7, 0))).toEqual([]);

    // 1) mover o fim de uma parede
    store.exec({ type: 'updateElements', ids: [comAbertura.id], patch: { b: { x: comAbertura.b.x + 0.37, y: comAbertura.b.y + 0.11 } } });
    const p1 = store.project;
    expect(p1).not.toBe(p0);
    const depoisParede = resolveLevel(p1, l, new Map());
    expect(depoisParede).not.toBe(antes);
    expect(JSON.stringify(depoisParede.walls[comAbertura.id]!.b)).not.toBe(JSON.stringify(antes.walls[comAbertura.id]!.b));
    expect(divergenciasDe(p1, l, {}, excecaoSemente1(7, 0))).toEqual([]);

    // 2) mexer na abertura (deslocamento): o furo da planta muda
    const o = openingsOfWall(p1, comAbertura.id)[0]!;
    const novoOffset = comprimento(store.project.elements[comAbertura.id] as typeof comAbertura) / 2;
    expect(novoOffset).not.toBeCloseTo(o.offset, 2);
    store.exec({ type: 'updateElements', ids: [o.id], patch: { offset: novoOffset } });
    const p2 = store.project;
    expect(openingsOfWall(p2, comAbertura.id).find((x) => x.id === o.id)!.offset).not.toBe(o.offset);
    const depoisAbertura = resolveLevel(p2, l, new Map());
    const cortes = (r: typeof antes): string => JSON.stringify(Object.values(r.walls).map((w) => w.layers.map((c) => c.cut)));
    expect(cortes(depoisAbertura)).not.toBe(cortes(depoisParede));
    expect(divergenciasDe(p2, l, {}, excecaoSemente1(7, 0))).toEqual([]);

    // o projeto antigo continua respondendo o que respondia (memo por projeto)
    expect(resolveLevel(p0, l, new Map())).toBe(antes);
    expect(d.diagnostico().voltasLeves + d.diagnostico().voltasGraves).toBe(0);
  }, 120_000);

  // Uma semente por teste (cada `it` bem abaixo de 30 s); o diagnóstico é do próprio teste.
  for (const semente of [1, 2, 3, 4, 6, 8]) {
    it(`propriedade nos sintéticos de estresse, semente ${semente} (2 pavimentos): equivalente ao TS`, () => {
      if (pula()) return;
      const d = instalar(DESPACHO);
      const p = projetoDeEstresseA3d(semente, { paredes: 16, pavimentos: 2 });
      p.levels.forEach((l, nivel) => {
        expect(divergenciasDe(p, l.id, {}, excecaoSemente1(semente, nivel)), `semente ${semente} pavimento ${nivel}`).toEqual([]);
      });
      expect(d.diagnostico().entreguesPeloRust).toBe(p.levels.length);
      expect(d.diagnostico().voltasLeves + d.diagnostico().voltasGraves).toBe(0);
    }, 60_000);
  }

  it('parede isolada com topProfile e base anexada ao piso', () => {
    if (pula()) return;
    instalar(DESPACHO);
    const p = projetoDeParedeComPerfil([{ t: 0, h: 1 }, { t: 6, h: 2.5 }], true);
    expect(divergenciasDe(p, p.levels[0]!.id, {})).toEqual([]);
  }, 60_000);
});

describe.skipIf(!bytes)('A4: modo sombra', () => {
  const pula = (): boolean => ger === null;

  it('sem divergência: devolve o Rust, compara com o TS (só referência) e registra zero', () => {
    if (pula()) return;
    const d = instalar(SOMBRA);
    const p = projetoDeEstresseA3d(2, { paredes: 12, pavimentos: 2 });
    for (const l of p.levels) {
      const cache = new Map();
      expect(resolveLevel(p, l.id, cache).levelId).toBe(l.id);
    }
    const diag = d.diagnostico();
    expect(diag.comparacoes).toBe(2);
    expect(diag.divergencias).toBe(0);
    expect(diag.ultimaDivergencia).toBeNull();
    expect(diag.entreguesPeloRust).toBe(2); // o resultado exibido é o do Rust, nunca o do TS
  }, 120_000);

  it('divergência artificial: contador, registro (nível, parede e campo); o retorno é o do Rust (com a divergência), nunca o do TS', () => {
    if (pula()) return;
    const d = instalar(SOMBRA, (r) => ({ ...r, paredes: r.paredes.map((w, i) => (i === 0 ? { ...w, length: w.length + 1 } : w)) }));
    const p = projetoDeEstresseA3d(9, { paredes: 12, pavimentos: 2 });
    const l = p.levels[1]!.id;
    const cache = new Map();
    const retorno = resolveLevel(p, l, cache);
    const ts = resolveLevelTs(p, l, cache);
    const primeira = Object.values(retorno.walls).find((w) => w)!;
    expect(retorno.clusters[0]!.wallIds[0]).toBe(primeira.wallId);
    const id = retorno.clusters[0]!.wallIds[0]!;
    expect(retorno.walls[id]!.length).toBeCloseTo(ts.walls[id]!.length + 1, 6); // a divergência injetada no Rust aparece no retorno
    const diag = d.diagnostico();
    expect(diag.comparacoes).toBe(1);
    expect(diag.divergencias).toBe(1);
    expect(diag.ultimaDivergencia).toMatchObject({ nivel: l, parede: retorno.clusters[0]!.wallIds[0], campo: 'length' });
    expect(diag.ultimaDivergencia!.mensagem).toContain('(Rust)');
    // a mesma chamada repetida não compara de novo (o projeto não mudou)
    resolveLevel(p, l, new Map());
    expect(d.diagnostico().comparacoes).toBe(1);
  }, 120_000);

  it('o registro é circular e limitado; o contador segue contando', () => {
    if (pula()) return;
    const d = instalar(SOMBRA, (r) => ({ ...r, paredes: r.paredes.map((w, i) => (i === 0 ? { ...w, baseZ: w.baseZ + 1 } : w)) }));
    const base = projetoDeParedeComPerfil(null, false);
    const l = base.levels[0]!.id;
    const total = LIMITE_REGISTRO + 7;
    for (let i = 0; i < total; i++) resolveLevel({ ...base }, l, new Map()); // objeto novo a cada vez: outro projeto
    const diag = d.diagnostico();
    expect(diag.divergencias).toBe(total);
    expect(diag.registro.length).toBe(LIMITE_REGISTRO);
    expect(diag.ultimaDivergencia!.campo).toBe('baseZ');
  }, 120_000);

  it('sombra desligada não custa nada: nem cena no Rust, nem comparação', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    const d = instalar({ fatiaA: false, fatiaB: false, sombra: true }); // a sombra só vale com a fatia A
    const p = projetoDeEstresseA3d(4, { paredes: 12, pavimentos: 1 });
    resolveLevel(p, p.levels[0]!.id, new Map());
    const diag = d.diagnostico();
    expect(diag.comparacoes + diag.entreguesPeloRust + diag.voltasLeves + diag.voltasGraves).toBe(0);
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
    // fatia A ligada sem sombra: entrega o Rust e não compara
    const d2 = instalar(DESPACHO);
    resolveLevel(p, p.levels[0]!.id, new Map());
    expect(d2.diagnostico().comparacoes).toBe(0);
    expect(d2.diagnostico().entreguesPeloRust).toBe(1);
  }, 60_000);
});
