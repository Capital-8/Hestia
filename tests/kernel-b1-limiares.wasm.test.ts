/**
 * Limiares mínimos do passo B1 (decisão 0050 §3), escritos para matar três mutações que sobreviveram na rodada de mutação de
 * `crates/geom-wasm/src/b1.rs`: (A) a membrana por espessura (`<` virou `<=` em 1e-6 m); (B) o desempate de `ordem` entre pisos
 * e entre lajes (o `id` cresce virou decresce); (C) a caixa que toca a aresta (`>=` virou `>`) no filtro de `cortar_furos`.
 * A referência é sempre o motor TypeScript (`referenciaB1`/`referenciaB2`); Rust e TS têm de concordar campo a campo, polígono a polígono.
 * Roda em `npm run test:wasm` e com `KERNEL_WASM_PATH` apontando para um binário de teste. Projetos sintéticos pequenos.
 */
import { readFileSync } from 'node:fs';
import { boxOf, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeFloor, makeLevel, makeSlab, makeStair, makeWall, type Command, type FloorType, type Project, type SlabType, type WallType } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { argumentosB1, argumentosB2, decodificarB1, decodificarB2, montarCenaB1, referenciaB1, referenciaB2, type CenaB1, type ElementoB1 } from '../packages/engine/src/kernelB.ts';
import { holesFor, openingsOnLevel } from '../packages/engine/src/levelOpenings.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararB1 } from '../scripts/kernel-harness-b.mts';
import { lanceReto } from '../scripts/kernel-b1-estresse.mts';

let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  ger = await GerenciadorKernelV2.dosBytes(readFileSync(caminhoDoWasm()));
});

/** Retângulo de vértices em sentido anti-horário (como os de `kernel-b1-estresse.mts`). */
const retangulo = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Projeto com dois pavimentos (`lv_0` na cota 0 e `lv_1` na cota 2,8), como o de `kernel-b1-estresse.mts`. */
function projetoVazio(): ProjectStore {
  const store = new ProjectStore(createEmptyProject('Limiares B1'));
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav 1', elevation: 2.8 }) });
  return store;
}

/** Cena da B1 (sem paredes), com as seções de `montarCenaB1` e o mapa de materiais da fatia A, como em `kernel-b1.wasm.test.ts`. */
function rodarB1(p: Project, nivel: string): { ref: ElementoB1[]; rust: ElementoB1[]; b: CenaB1 } {
  const b = montarCenaB1(p, montarCenaA1(p).materialDe);
  const s = b.secoes;
  const n = b.nLinhas;
  const cena = CenaV2.criar(
    ger!,
    fonteDeSecoes(() => ({
      tipos_piso: { colunas: s.tipos_piso, n: n.tipos_piso },
      tipos_laje: { colunas: s.tipos_laje, n: n.tipos_laje },
      camadas_piso: { colunas: s.camadas_piso, n: n.camadas_piso },
      camadas_laje: { colunas: s.camadas_laje, n: n.camadas_laje },
      pisos: { colunas: s.pisos, n: n.pisos },
      lajes: { colunas: s.lajes, n: n.lajes },
      contornos_estaticos: { colunas: s.contornos_estaticos, n: n.contornos_estaticos },
      contornos_vinculados: { colunas: s.contornos_vinculados, n: n.contornos_vinculados },
      furos_nivel: { colunas: s.furos_nivel, n: n.furos_nivel },
    })),
  );
  try {
    const ref = referenciaB1(p, nivel, b);
    const rust = decodificarB1(cena.consultar('pisos_lajes_nivel', argumentosB1(p, nivel, b)));
    return { ref, rust, b };
  } finally {
    cena.destruir();
  }
}

/** Cena da B2 (com as paredes do projeto, `pisos_lajes_com_paredes`), como em `kernel-b2.wasm.test.ts`. */
function rodarB2(p: Project, nivel: string): { ref: ElementoB1[]; rust: ElementoB1[] } {
  const a1 = montarCenaA1(p, true);
  const a3 = montarCenaA3(p, a1);
  const b = montarCenaB1(p, a1.materialDe);
  const s = a1.secoes;
  const n = a1.nLinhas;
  const sb = b.secoes;
  const nb = b.nLinhas;
  const cena = CenaV2.criar(
    ger!,
    fonteDeSecoes(() => ({
      paredes: { colunas: s.paredes, n: n.paredes },
      tipos_parede: { colunas: s.tipos_parede, n: n.tipos_parede },
      camadas: { colunas: s.camadas, n: n.camadas },
      faixas: { colunas: s.faixas, n: n.faixas },
      paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro },
      paredes_z: { colunas: s.paredes_z, n: n.paredes_z },
      tipos_abertura: { colunas: a3.secoes.tipos_abertura, n: a3.nLinhas.tipos_abertura },
      aberturas: { colunas: a3.secoes.aberturas, n: a3.nLinhas.aberturas },
      tipos_piso: { colunas: sb.tipos_piso, n: nb.tipos_piso },
      tipos_laje: { colunas: sb.tipos_laje, n: nb.tipos_laje },
      camadas_piso: { colunas: sb.camadas_piso, n: nb.camadas_piso },
      camadas_laje: { colunas: sb.camadas_laje, n: nb.camadas_laje },
      pisos: { colunas: sb.pisos, n: nb.pisos },
      lajes: { colunas: sb.lajes, n: nb.lajes },
      contornos_estaticos: { colunas: sb.contornos_estaticos, n: nb.contornos_estaticos },
      contornos_vinculados: { colunas: sb.contornos_vinculados, n: nb.contornos_vinculados },
      furos_nivel: { colunas: sb.furos_nivel, n: nb.furos_nivel },
      niveis: { colunas: sb.niveis, n: nb.niveis },
    })),
  );
  try {
    const ref = referenciaB2(p, nivel, b);
    const rust = decodificarB2(cena.consultar('pisos_lajes_com_paredes', argumentosB2(p, nivel, b)));
    return { ref, rust };
  } finally {
    cena.destruir();
  }
}

/** Piso ou laje com as camadas dadas (estrutura de 10 cm e uma camada de acabamento com a espessura pedida). */
const tipoPiso = (id: string, espessura: number): FloorType => ({
  id,
  name: id,
  code: id,
  description: '',
  layers: [
    { function: 'structure', materialId: 'mat_concreto', thickness: 0.1, wraps: false },
    { function: 'finish1', materialId: 'mat_reboco', thickness: espessura, wraps: false },
  ],
  cost: 0,
});
const tipoLaje = (id: string, espessura: number): SlabType => ({ ...tipoPiso(id, espessura), id, name: id, code: id });

/** Quantos elementos do Rust divergem do TS (e as mensagens), com a regra geral de 1e-6. */
const divergencias = (ref: ElementoB1[], rust: ElementoB1[], contencao = false): string[] => compararB1(ref, rust, { contencao, maxDivergencias: 50 }).divergencias;

describe('B1 limiares: mutações sobreviventes do b1.rs (Rust x TS)', () => {
  // (A) b1.rs:389 `l.espessura < ESPESSURA_DE_MEMBRANA` (1e-6). O TS usa `thickness < 1e-6` (packages/model/src/membrane.ts).
  // Só a espessura exatamente 1e-6 distingue `<` de `<=`; as duas vizinhas (uma de cada lado) conferem que o corte é o mesmo.
  it('(A) membrana: camada de espessura exatamente 1e-6 m (e 1e-6 ± 1e-12) tem o mesmo flag membrana no Rust e no TS', () => {
    const exato = 1e-6;
    const casos: Array<[string, number]> = [
      ['menos', exato - 1e-12],
      ['exato', exato],
      ['mais', exato + 1e-12],
    ];
    const store = projetoVazio();
    const cmds: Command[] = [];
    for (const [rotulo, esp] of casos) {
      cmds.push({ type: 'upsertFloorType', floorType: tipoPiso(`ft_lim_${rotulo}`, esp) });
      cmds.push({ type: 'upsertSlabType', slabType: tipoLaje(`ls_lim_${rotulo}`, esp) });
    }
    casos.forEach(([rotulo], i) => {
      cmds.push({ type: 'addFloor', floor: makeFloor({ id: `pm_${rotulo}`, typeId: `ft_lim_${rotulo}`, levelId: 'lv_0', boundary: retangulo(i * 5, 0, i * 5 + 4, 4) }) });
      cmds.push({ type: 'addSlab', slab: makeSlab({ id: `lm_${rotulo}`, typeId: `ls_lim_${rotulo}`, levelId: 'lv_0', boundary: retangulo(i * 5, 6, i * 5 + 4, 10) }) });
    });
    store.exec({ type: 'batch', commands: cmds });
    const { ref, rust, b } = rodarB1(store.project, 'lv_0');

    // O TS é a referência: a camada exata NÃO é membrana (`<` estrito), e a de 1e-6 - eps é.
    const flagTs = (id: string, laje: boolean): boolean[] => {
      const alvo = ref.find((e) => e.laje === laje && e.id === (laje ? b.lajeDe : b.pisoDe).get(id));
      expect(alvo, `${id} no TS`).toBeDefined();
      return alvo!.camadas.map((c) => c.membrana);
    };
    expect(flagTs('pm_exato', false)[1]).toBe(false);
    expect(flagTs('pm_menos', false)[1]).toBe(true);
    expect(flagTs('pm_mais', false)[1]).toBe(false);
    expect(flagTs('lm_exato', true)[1]).toBe(false);

    expect(divergencias(ref, rust), 'Rust x TS (flag membrana e demais campos)').toEqual([]);
  });

  // (B) b1.rs:437 `.then(a.0.cmp(&c.0))` (empate de `ordem` pelo id interno, crescente). O TS ordena por `order` com sort estável, então o
  // empate sai na ordem de inserção, que é a do id interno (`montarCenaB1` numera na ordem de `Object.values`). Os ids de texto escolhidos
  // têm ordem alfabética invertida em relação à inserção, para que um desempate por nome também seja pego.
  it('(B) ordem: pisos e lajes com o mesmo `ordem` saem na ordem do TS (ids fora da ordem de inserção)', () => {
    const store = projetoVazio();
    const quadro = (x0: number, y0: number) => retangulo(x0, y0, x0 + 2, y0 + 2);
    store.exec({
      type: 'batch',
      commands: [
        { type: 'addFloor', floor: makeFloor({ id: 'pz_piso', typeId: 'ft_unico', levelId: 'lv_0', boundary: quadro(0, 0) }) },
        { type: 'addFloor', floor: makeFloor({ id: 'pa_piso', typeId: 'ft_unico', levelId: 'lv_0', boundary: quadro(3, 0) }) },
        { type: 'addFloor', floor: makeFloor({ id: 'pm_piso', typeId: 'ft_unico', levelId: 'lv_0', boundary: quadro(6, 0) }) },
        { type: 'addFloor', floor: makeFloor({ id: 'pq_piso', typeId: 'ft_unico', levelId: 'lv_0', boundary: quadro(9, 0) }) },
        { type: 'addSlab', slab: makeSlab({ id: 'lz_laje', typeId: 'ls_unica', levelId: 'lv_0', boundary: quadro(0, 4) }) },
        { type: 'addSlab', slab: makeSlab({ id: 'la_laje', typeId: 'ls_unica', levelId: 'lv_0', boundary: quadro(3, 4) }) },
        { type: 'addSlab', slab: makeSlab({ id: 'lm_laje', typeId: 'ls_unica', levelId: 'lv_0', boundary: quadro(6, 4) }) },
      ],
    });
    // três pisos com `ordem` 1 (inseridos pz, pa, pm) e um com 0 (pq, inserido por último: vai para o início); lajes com `ordem` 2 (lz, la) e 3 (lm)
    const comOrdem = (ordens: Record<string, number>): Project => {
      const p = store.project;
      return { ...p, elements: Object.fromEntries(Object.entries(p.elements).map(([k, e]) => [k, k in ordens ? { ...e, order: ordens[k]! } : e])) };
    };
    const p = comOrdem({ pz_piso: 1, pa_piso: 1, pm_piso: 1, pq_piso: 0, lz_laje: 2, la_laje: 2, lm_laje: 3 });
    const { ref, rust, b } = rodarB1(p, 'lv_0');

    // o TS: pisos por ordem (pq, pz, pa, pm) e lajes (lz, la, lm); o empate pela ordem de inserção
    const ordemTs = ref.map((e) => (e.laje ? 'laje ' : 'piso ') + [...(e.laje ? b.lajeDe : b.pisoDe)].find(([, n]) => n === e.id)![0]);
    expect(ordemTs).toEqual(['piso pq_piso', 'piso pz_piso', 'piso pa_piso', 'piso pm_piso', 'laje lz_laje', 'laje la_laje', 'laje lm_laje']);
    expect(rust.map((e) => e.id), 'ids na ordem de saída do Rust').toEqual(ref.map((e) => e.id));
    expect(divergencias(ref, rust), 'Rust x TS (ordem, ids e demais campos)').toEqual([]);
  });

  // (C) b1.rs:143 `a[2] >= b[0]` em `caixas_se_tocam`, usada por `cortar_furos` (b1.rs:169). Com a caixa dos furos encostando exatamente na
  // caixa do contorno, a versão original faz o recorte (e o TS também: `boxesOverlap` com fronteira inclusiva, em
  // packages/engine/src/stairOpenings.ts `cutStairOpenings`); a mutante pula o recorte e devolve o contorno cru. Um furo MANUAL que passa
  // do contorno externo faz essa diferença aparecer (o recorte o descarta; o contorno cru, não). A 1 µm de distância os dois pulam.
  const projetoDeFuro = (folga: number): Project => {
    const store = projetoVazio();
    store.exec({
      type: 'addStair',
      stair: makeStair({ id: 'esc_lim', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [lanceReto(6, 2, 16, 0.28)], openingMode: 'full', openingMargin: 0, openingRect: true }),
    });
    // a caixa do furo de escada em `lv_1` (modo 'full', envelope retangular): a borda esquerda é a caixa mínima x do furo
    const furo = holesFor(openingsOnLevel(store.project, 'lv_1'), 0);
    expect(furo.length, 'a escada tem furo em lv_1').toBeGreaterThan(0);
    const xFuro = boxOf(furo.flat(2)).minX;
    // o furo manual vai de x = 3 até a borda do furo de escada menos `folga` (passa de x = 4, o contorno externo)
    store.exec({
      type: 'addFloor',
      floor: makeFloor({ id: 'pf_piso', typeId: 'ft_unico', levelId: 'lv_1', boundary: retangulo(0, 0, 4, 4), holes: [retangulo(3, 1.8, xFuro - folga, 2.2)] }),
    });
    return store.project;
  };

  it('(C) furo de escada que toca exatamente a caixa do piso (furo manual passa do contorno): Rust = TS', () => {
    const p = projetoDeFuro(0);
    const { ref, rust } = rodarB1(p, 'lv_1');
    expect(ref.length).toBe(1);
    expect(divergencias(ref, rust), 'Rust x TS, caixas se tocando na aresta').toEqual([]);
  });

  it('(C) a 1 µm de distância (sem toque): Rust = TS', () => {
    const p = projetoDeFuro(1e-6);
    const { ref, rust } = rodarB1(p, 'lv_1');
    expect(ref.length).toBe(1);
    expect(divergencias(ref, rust), 'Rust x TS, caixas separadas por 1 µm').toEqual([]);
  });

  // (C, controle de parede) o filtro de caixas que a B2 usa para as paredes (`regionMinusWalls` com `terminoBlock`) também fica igual ao TS
  // quando uma parede encosta na aresta do piso e outra, a 1 µm, passa perto. Não cobre b1.rs:143 (o `Escopo` das paredes é o b2.rs).
  const projetoDeParede = (folga: number): Project => {
    const store = projetoVazio();
    store.exec({
      type: 'batch',
      commands: [
        {
          type: 'upsertWallType',
          wallType: {
            id: 'wt_lim_25',
            name: 'Limiar 25',
            code: 'L25',
            description: '',
            layers: [{ function: 'structure', materialId: 'mat_concreto', thickness: 0.25, wraps: false }],
            wrapInserts: 'both',
            wrapEnds: 'none',
            strips: [],
            cost: 0,
            thermalU: null,
            acousticRw: null,
            fireRating: null,
            manufacturer: '',
          } as WallType,
        },
        { type: 'upsertFloorType', floorType: tipoPiso('ft_lim_face', 0.02) },
        // parede centrada em x = 4,125: a caixa (espessura 0,25 m) vai de x = 4 (toca a aresta) a 4,25; a outra, a 1 µm mais à direita
        { type: 'addWall', wall: makeWall({ id: 'pl_toca', typeId: 'wt_lim_25', levelId: 'lv_1', a: { x: 4.125, y: -1 }, b: { x: 4.125, y: 5 } }) },
        { type: 'addWall', wall: makeWall({ id: 'pl_perto', typeId: 'wt_lim_25', levelId: 'lv_1', a: { x: 4.125 + folga, y: -1 }, b: { x: 4.125 + folga, y: 5 } }) },
        // parede que corta o piso ao meio, para o término 'face' ter o que recortar
        { type: 'addWall', wall: makeWall({ id: 'pl_corta', typeId: 'wt_lim_25', levelId: 'lv_1', a: { x: 2, y: -1 }, b: { x: 2, y: 5 } }) },
        { type: 'addFloor', floor: makeFloor({ id: 'pp_piso', typeId: 'ft_lim_face', levelId: 'lv_1', boundary: retangulo(0, 0, 4, 4) }) },
      ],
    });
    return store.project;
  };

  it('(C, controle) parede que toca a aresta do piso (e outra a 1 µm): camadas com término de parede iguais ao TS', () => {
    const { ref, rust } = rodarB2(projetoDeParede(1e-6), 'lv_1');
    expect(ref.length).toBe(1);
    expect(divergencias(ref, rust), 'Rust x TS, parede encostada e parede a 1 µm').toEqual([]);
  });
});
