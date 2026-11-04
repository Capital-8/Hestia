/**
 * Limiares da B2 (decisão 0050 §3): casos feitos para matar mutações que o estresse não pega. `pisos_lajes_com_paredes` do Rust x
 * `resolveFloors`/`resolveSlabs` do TS COM paredes (`referenciaB2`), nas camadas que o término consulta. Roda só em `npm run test:wasm`.
 *
 * - (#2) a margem de 5 mm por face do retângulo do vão de porta (`MARGEM_DA_PORTA`): parede perpendicular que entra no vão de uma porta e
 *   termina a menos de 5 mm (e a mais de 5 mm) da face da parede anfitriã, com camadas `face`, `nucleo` e `ate` dependendo das paredes.
 * - (#3) a borda de `wallTouchesZone` (`nominal_z0 <= z1 + Z_TOL`): parede com `nominal_z0` EXATAMENTE `z1 + 1e-3` (a mesma conta do TS),
 *   e 1 ulp acima e abaixo.
 * - (#10) a orientação invertida no `offset_clipper` (`==` -> `!=`) é EQUIVALENTE pelo `FixOrientations`; a prova está na decisão 0050
 *   (seção de mutações da B2), não neste arquivo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createEmptyProject, makeFloor, makeLevel, makeWall, ProjectStore, type Command, type Layer, type Project } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { argumentosB2, decodificarB2, montarCenaB1, referenciaB2 } from '../packages/engine/src/kernelB.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { compararB1 } from '../packages/engine/src/kernelComparaB.ts';
import { wallsOfLevel } from '../packages/engine/src/terminoBlock.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';

const K_B2_0049 = 0.08;
const Z_TOL = 1e-3;

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

afterAll(() => {});

/** Cena da B2 do projeto (mesmo montador de `kernel-b2.wasm.test.ts`). */
const cenaDe = (p: Project) => {
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
  return { cena, a1, b };
};

const camada = (function_: Layer['function'], thickness: number, termino?: Layer['termino']): Layer => ({ function: function_, materialId: 'mat_concreto', thickness, wraps: false, ...(termino === undefined ? {} : { termino }) });

/** Pisos com término `face`, `nucleo`, `ate`, `passa` e `{cm}`; as três primeiras consultam paredes (e o vão de porta). */
const CAMADAS = [
  camada('finish1', 0.01, 'face'),
  camada('substrate', 0.03, 'nucleo'),
  camada('substrate', 0.02, { ate: { prioridade: 3 } }),
  camada('structure', 0.12, 'passa'),
  camada('finish2', 0.01, { cm: 2 }),
];

/** Piso suspenso 0,2 m acima do nível: todas as camadas cruzam a faixa nominal das paredes (base 0). */
const ALTURA_DO_PISO = 0.2;

const CAMADAS_COM_PAREDES = [0, 1, 2];

/**
 * (#2) Parede H ao longo de x com uma porta de 80 cm centrada em x = 2 (vão de 1,6 a 2,4) e parede P perpendicular que entra no vão e
 * termina `d` metros depois da face da H. A face de P fica 20 mm dentro do vão (`batente` em x = 2,4). O retângulo da porta tem
 * `espessura / 2 + 0,005` em cada face: com `d < 5 mm` a margem cobre o fim de P; com `d > 5 mm` sobra uma tira de 5 mm.
 */
function casoPortaPerpendicular(d: number): Project {
  const base = createEmptyProject('limiar porta');
  const store = new ProjectStore({ ...base, levels: [makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 })] });
  const tipo = base.wallTypes['wt_ext19']!;
  const tp = tipo.layers.reduce((s, l) => s + l.thickness, 0);
  const batente = 2 + 0.4;
  const pen = 0.02;
  const xc = batente - pen + tp / 2;
  // Faixa vertical (rodapé) de 4 mm em cada face: a pegada da parede passa a ter 4 mm além da espessura nominal, e o retângulo do vão
  // (espessura + 5 mm por face) é quem decide se ela é recortada embaixo da porta. Sem os 5 mm, a faixa fica na zona e barra o piso.
  const strips = (['exterior', 'interior'] as const).map((side, k) => ({ id: `st_${k}`, name: `rodapé ${side}`, side, materialId: 'mat_madeira', thickness: 0.004, z0: 0, z1: 0.1 }));
  const cmds: Command[] = [
    { type: 'upsertWallType', wallType: { ...tipo, id: 'wt_limiar', name: 'Parede limiar', strips } },
    { type: 'upsertFloorType', floorType: { id: 'ft_limiar', name: 'Piso limiar', code: 'PL', description: '', layers: CAMADAS, cost: 0 } },
    { type: 'addWall', wall: makeWall({ id: 'wH', typeId: 'wt_limiar', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) },
    { type: 'addWall', wall: makeWall({ id: 'wP', typeId: 'wt_limiar', levelId: 'lv_0', a: { x: xc, y: -2 }, b: { x: xc, y: tp / 2 + d } }) },
    { type: 'addOpening', opening: { id: 'oP', kind: 'door', typeId: 'ot_p80', hostId: 'wH', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } },
    { type: 'addFloor', floor: makeFloor({ id: 'pL', typeId: 'ft_limiar', levelId: 'lv_0', heightOffset: ALTURA_DO_PISO, boundary: [{ x: 0.5, y: -0.8 }, { x: 3.5, y: -0.8 }, { x: 3.5, y: 2.5 }, { x: 0.5, y: 2.5 }] }) },
  ];
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

interface Resultado {
  ref: ReturnType<typeof referenciaB2>;
  rust: ReturnType<typeof decodificarB2>;
  divergencias: string[];
}

/** Compara `pisos_lajes_com_paredes` com a extração do TS e devolve as duas saídas. */
function compararProjeto(p: Project): Resultado {
  const { cena, b } = cenaDe(p);
  try {
    const ref = referenciaB2(p, 'lv_0', b);
    const rust = decodificarB2(cena.consultar('pisos_lajes_com_paredes', argumentosB2(p, 'lv_0', b)));
    const cmp = compararB1(ref, rust, { k0049: K_B2_0049 });
    return { ref, rust, divergencias: cmp.divergencias };
  } finally {
    cena.destruir();
  }
}

/** 1 ulp na direção pedida (IEEE-754), como `nextafter`; cobre o zero. */
function proximo(x: number, dir: 1 | -1): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return x;
  if (x === 0) return dir > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const buf = new ArrayBuffer(8);
  const f = new Float64Array(buf);
  const i = new BigInt64Array(buf);
  f[0] = x;
  i[0] = i[0]! + ((x > 0) === (dir > 0) ? 1n : -1n);
  return f[0]!;
}

/** (#3) Piso de uma camada `face` cujo topo fica 1 mm abaixo do nível; a parede recebe `nominal_z0 = alvo`. */
function casoNominalZ0(alvo: number): Project {
  const base = createEmptyProject('nominal z0');
  const store = new ProjectStore({ ...base, levels: [makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 })] });
  const cmds: Command[] = [
    { type: 'upsertFloorType', floorType: { id: 'ft_z', name: 'Piso z', code: 'PZ', description: '', layers: [camada('finish1', 0.01, 'face')], cost: 0 } },
    { type: 'addWall', wall: makeWall({ id: 'wZ', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, baseOffset: alvo }) },
    { type: 'addFloor', floor: makeFloor({ id: 'pZ', typeId: 'ft_z', levelId: 'lv_0', heightOffset: -Z_TOL, boundary: [{ x: -1, y: -1.5 }, { x: 5, y: -1.5 }, { x: 5, y: 1.5 }, { x: -1, y: 1.5 }] }) },
  ];
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

describe.skipIf(!bytes)('limiares B2', () => {
  for (const caso of [
    { d: 0.004, rotulo: 'face a 4 mm do batente (menos de 5 mm)' },
    { d: 0.02, rotulo: 'face a 20 mm do batente (mais de 5 mm)' },
  ]) {
    it(`#2 margem do vão de porta: ${caso.rotulo}`, () => {
      if (!ger) return;
      const p = casoPortaPerpendicular(caso.d);
      const { ref, divergencias } = compararProjeto(p);
      expect(divergencias, `pen ${caso.d}: ${divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      const e = ref[0]!;
      const base = areaDaForma(e.poligono);
      for (const k of CAMADAS_COM_PAREDES) {
        const area = areaDaForma(e.camadas[k]!.poligono);
        expect(area, `camada ${k} recortada pelas paredes (área ${area} x base ${base})`).toBeLessThan(base - 1e-6);
      }
    }, 30_000);
  }

  it('#3 borda de wallTouchesZone: nominal_z0 = z1 + 1e-3 exato e 1 ulp acima/abaixo', () => {
    if (!ger) return;
    const z1 = 0 + -Z_TOL; // a mesma conta de resolveFloors para o topo da camada
    const alvo = z1 + Z_TOL; // a mesma conta de wallTouchesZone no TS
    const casos = [
      { alvo, rotulo: 'exato', toca: true },
      { alvo: proximo(alvo, 1), rotulo: '1 ulp acima', toca: false },
      { alvo: proximo(alvo, -1), rotulo: '1 ulp abaixo', toca: true },
    ];
    for (const c of casos) {
      const p = casoNominalZ0(c.alvo);
      const parede = wallsOfLevel(p, 'lv_0').find((w) => w.wallId === 'wZ')!;
      expect(parede.nominalZ0, `${c.rotulo}: nominalZ0 do TS`).toBe(c.alvo);
      const { ref, rust, divergencias } = compararProjeto(p);
      // o `z1` do TS é a MESMA conta (topo da camada = cota do nível + deslocamento), e o alvo é `z1 + Z_TOL` como em `wallTouchesZone`.
      expect(ref[0]!.camadas[0]!.z1, `${c.rotulo}: z1 da camada do TS`).toBe(z1);
      expect(divergencias, `${c.rotulo}: ${divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      const base = areaDaForma(ref[0]!.poligono);
      const areaTs = areaDaForma(ref[0]!.camadas[0]!.poligono);
      const areaRust = areaDaForma(rust[0]!.camadas[0]!.poligono);
      if (c.toca) {
        expect(areaTs, `${c.rotulo}: o TS recorta a camada face`).toBeLessThan(base - 1e-6);
        expect(areaRust, `${c.rotulo}: o Rust recorta a camada face`).toBeLessThan(base - 1e-6);
      } else {
        expect(areaTs, `${c.rotulo}: o TS não recorta`).toBeCloseTo(base, 9);
        expect(areaRust, `${c.rotulo}: o Rust não recorta`).toBeCloseTo(base, 9);
      }
    }
  }, 30_000);
});
