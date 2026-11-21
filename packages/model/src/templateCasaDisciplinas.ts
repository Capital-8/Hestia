/* eslint-disable max-lines -- modelo de teste: uma linha por elemento das categorias gráficas nos dois pavimentos. */
import { emptyPlanAnnotations } from './areaPlan.ts';
import { makeBeam } from './beam.ts';
import { makeCeiling } from './ceiling.ts';
import { makeColumn } from './column.ts';
import type { Command } from './commands.ts';
import { FAMILIA_AR_SPLIT } from './familia/biblioteca/equipamentosOutros.ts';
import { FAMILIA_CAMA, FAMILIA_SOFA } from './familia/biblioteca/sofasCamas.ts';
import {
  FAMILIA_DIFUSOR_TETO,
  FAMILIA_INTERRUPTOR,
  FAMILIA_LAVATORIO,
  FAMILIA_LUMINARIA_TETO,
  FAMILIA_QUADRO_DISTRIBUICAO,
  FAMILIA_RALO,
  FAMILIA_TOMADA,
  FAMILIA_VASO_SANITARIO,
} from './familia/biblioteca/disciplinasExemplo.ts';
import { makeFloor } from './floor.ts';
import { makeFooting } from './footing.ts';
import { buildFurnitureAsset } from './furniture/asset.ts';
import { makeGuardaCorpo } from './guardaCorpo.ts';
import { t, type Lang } from './i18n.ts';
import { ladosPadrao, makeLot } from './lot.ts';
import { makeMass, secaoCirculo } from './mass.ts';
import { makePlanView, type Discipline } from './planView.ts';
import { disciplineLabel } from './planViewCommands.ts';
import { makeRamp } from './ramp.ts';
import { makeRoom } from './room.ts';
import { makeRoof } from './roof.ts';
import { emptyTitleBlock } from './sheet.ts';
import { makeSlab } from './slab.ts';
import { makeStair } from './stair.ts';
import { makeTerrain, makeTerrainRegion } from './terrain.ts';
import type { Component, Id, StairRun } from './types.ts';
import { makeWall } from './wall.ts';

/**
 * Teste de disciplinas completo (decisão 0060, adendos 1 e 2): dois pavimentos de 6 × 8 m, um térreo e um superior, com
 * elementos de todas as categorias gráficas que se criam por comando, de propósito misturados e próximos: paredes (uma
 * curva), portas e janelas, piso, laje, forro, telhado, escada, rampa, guarda-corpo, ambientes, pilares, vigas, sapatas,
 * terreno, lote, massa, CAD, genérico, móvel importado, móveis de arquitetura e os componentes de exemplo das disciplinas
 * hidrossanitária, elétrica e HVAC. As quatro plantas de disciplina existem em CADA pavimento, com o nome padrão
 * "<Nível> - <Disciplina>", para testar a troca de nível mantendo a disciplina.
 *
 * Anotações de teste (decisão 0060 §5): uma cota e um texto na planta de Estrutura do térreo, uma cota na de Elétrico do
 * térreo e uma cota na planta padrão do térreo. A prancha de teste recebe as plantas de Estrutura e Elétrico do térreo.
 * Nenhuma planta grava tons: valem os predefinidos da tabela §4.2. Convenções de parede em `docs/05 §3` (face externa à
 * esquerda de a→b).
 */

const TERREO = 'lv_0';
const PAV2 = 'lv_1';
const EXT = 'wt_ext19';
const DIV = 'wt_alv14';

const rect = (x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const parede = (id: Id, a: [number, number], b: [number, number], typeId: Id, levelId: Id): Command => ({
  type: 'addWall',
  wall: makeWall({ id, typeId, levelId, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } }),
});

const abertura = (id: Id, hostId: Id, typeId: Id, offset: number, kind: 'door' | 'window'): Command => ({
  type: 'addOpening',
  opening: { id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
});

const componente = (id: Id, familyId: Id, levelId: Id, x: number, y: number, z: number, rotation: number, mark: string): Command => {
  const component: Omit<Component, 'order'> = {
    id,
    kind: 'component',
    familyId,
    typeId: null,
    levelId,
    x,
    y,
    z,
    rotation,
    mirrored: false,
    mark,
  };
  return { type: 'addComponent', component };
};

const nivelNome = (levelId: Id, lang: Lang): string => (levelId === TERREO ? t(lang, 'md_doc_level_ground') : t(lang, 'md_doc_level_n', { n: 2 }));

/** Planta de disciplina do pavimento, com o nome padrão "<Nível> - <Disciplina>" e anotações vazias. */
const planta = (id: Id, levelId: Id, discipline: Discipline, lang: Lang): Command => ({
  type: 'addPlanView',
  plan: makePlanView({
    id,
    levelId,
    discipline,
    name: `${nivelNome(levelId, lang)} - ${disciplineLabel(lang, discipline)}`,
    annotations: emptyPlanAnnotations(),
  }),
});

const FAMILIAS = [
  FAMILIA_VASO_SANITARIO,
  FAMILIA_LAVATORIO,
  FAMILIA_RALO,
  FAMILIA_TOMADA,
  FAMILIA_INTERRUPTOR,
  FAMILIA_LUMINARIA_TETO,
  FAMILIA_QUADRO_DISTRIBUICAO,
  FAMILIA_DIFUSOR_TETO,
  FAMILIA_AR_SPLIT,
  FAMILIA_SOFA,
  FAMILIA_CAMA,
];

const PAREDES: Command[] = [
  // Térreo: perímetro no sentido horário (face externa à esquerda de a→b) e banheiro na faixa sul.
  parede('cd_w_s', [6, 0], [0, 0], EXT, TERREO),
  parede('cd_w_w', [0, 0], [0, 8], EXT, TERREO),
  parede('cd_w_n', [0, 8], [6, 8], EXT, TERREO),
  parede('cd_w_e', [6, 8], [6, 0], EXT, TERREO),
  parede('cd_w_banho', [0, 2.4], [6, 2.4], DIV, TERREO),
  // Parede curva de teste no jardim, longe do corpo da casa.
  { type: 'addWall', wall: makeWall({ id: 'cd_w_curva', typeId: EXT, levelId: TERREO, a: { x: 0, y: -2 }, b: { x: 4, y: -2 }, sag: -0.5 }) },
  // Pavimento superior: o mesmo perímetro e a mesma divisória do banheiro.
  parede('cd2_w_s', [6, 0], [0, 0], EXT, PAV2),
  parede('cd2_w_w', [0, 0], [0, 8], EXT, PAV2),
  parede('cd2_w_n', [0, 8], [6, 8], EXT, PAV2),
  parede('cd2_w_e', [6, 8], [6, 0], EXT, PAV2),
  parede('cd2_w_banho', [0, 2.4], [6, 2.4], DIV, PAV2),
];

const ABERTURAS: Command[] = [
  abertura('cd_o_porta', 'cd_w_s', 'ot_p90', 3.0, 'door'),
  abertura('cd_o_banho', 'cd_w_banho', 'ot_p80', 4.6, 'door'),
  abertura('cd_j_n', 'cd_w_n', 'ot_j120', 3.0, 'window'),
  abertura('cd_j_banho', 'cd_w_w', 'ot_j60', 1.2, 'window'),
  abertura('cd_j_leste', 'cd_w_e', 'ot_j120', 3.0, 'window'),
  abertura('cd2_o_porta', 'cd2_w_s', 'ot_p90', 3.0, 'door'),
  abertura('cd2_o_banho', 'cd2_w_banho', 'ot_p80', 4.6, 'door'),
  abertura('cd2_j_n', 'cd2_w_n', 'ot_j120', 3.0, 'window'),
  abertura('cd2_j_banho', 'cd2_w_w', 'ot_j60', 1.2, 'window'),
  abertura('cd2_j_leste', 'cd2_w_e', 'ot_j120', 3.0, 'window'),
];

/** Piso do térreo e piso de acabamento sobre a laje do pavimento superior (a face inferior toca a laje). */
const PISOS: Command[] = [
  { type: 'addFloor', floor: makeFloor({ id: 'cd_piso_terreo', typeId: 'ft_ceram', levelId: TERREO, boundary: rect(0, 0, 6, 8) }) },
  { type: 'addFloor', floor: makeFloor({ id: 'cd_piso_pav2', typeId: 'ft_acab', levelId: PAV2, boundary: rect(0, 0, 6, 8), heightOffset: 0.04 }) },
];

const LAJE_PAV2: Command = {
  type: 'addSlab',
  slab: makeSlab({ id: 'cd_laje_pav2', typeId: 'ls_mac15', levelId: PAV2, boundary: rect(-0.15, -0.15, 6.15, 8.15) }),
};

const FORROS: Command[] = [
  { type: 'addCeiling', ceiling: makeCeiling({ id: 'cd_forro_terreo', typeId: 'ct_gesso', levelId: TERREO, boundary: rect(0.2, 2.6, 3.8, 7.8) }) },
  { type: 'addCeiling', ceiling: makeCeiling({ id: 'cd_forro_pav2', typeId: 'ct_gesso', levelId: PAV2, boundary: rect(0.2, 2.6, 3.8, 7.8) }) },
];

/** Telhado de 4 águas sobre o pavimento superior, beiral a 5,80 m, balanço de 0,60 m. */
const TELHADO: Command = {
  type: 'addRoof',
  roof: makeRoof({
    id: 'cd_telhado',
    typeId: 'rt_ceramica',
    levelId: PAV2,
    boundary: rect(-0.6, -0.6, 6.6, 8.6),
    heightOffset: 2.8,
    shape: 'hip',
    slopePercent: 30,
    edgeSlopes: [30, 30, 30, 30],
    edgeOverhangs: [0.6, 0.6, 0.6, 0.6],
    eave: { fascia: true, fasciaHeight: 0.2, gutter: true, soffit: true },
  }),
};

/** Escada reta do térreo ao pavimento superior, 17 espelhos, 16 pisos de 0,285 m, largura 1,00 m. */
function escada(): Command {
  const xEsq = 4.4;
  const xDir = 5.4;
  const y0 = 2.6;
  const piso = 0.285;
  const espelhos = 17;
  const yAt = (i: number): number => y0 + i * piso;
  const run: StairRun = {
    id: 'cd_escada_lance',
    kind: 'run',
    boundaryLeft: [{ a: { x: xEsq, y: y0 }, b: { x: xEsq, y: yAt(espelhos - 1) }, sag: 0 }],
    boundaryRight: [{ a: { x: xDir, y: y0 }, b: { x: xDir, y: yAt(espelhos - 1) }, sag: 0 }],
    risers: Array.from({ length: espelhos }, (_, i) => ({ a: { x: xEsq, y: yAt(i) }, b: { x: xDir, y: yAt(i) }, sag: 0 })),
    path: [],
    generatedBy: 'straight',
  };
  return { type: 'addStair', stair: makeStair({ id: 'cd_escada', typeId: 'stt_monolitica', levelId: TERREO, components: [run], openingMode: 'headroom', openingMargin: 0, mark: 'ES-01' }) };
}

/** Rampa curta no pavimento superior (sem nível acima, usa `height`). */
function rampa(): Command {
  const run: StairRun = {
    id: 'cd_rampa_lance',
    kind: 'run',
    boundaryLeft: [{ a: { x: 0.4, y: 3.0 }, b: { x: 0.4, y: 6.0 }, sag: 0 }],
    boundaryRight: [{ a: { x: 1.4, y: 3.0 }, b: { x: 1.4, y: 6.0 }, sag: 0 }],
    risers: [
      { a: { x: 0.4, y: 3.0 }, b: { x: 1.4, y: 3.0 }, sag: 0 },
      { a: { x: 0.4, y: 6.0 }, b: { x: 1.4, y: 6.0 }, sag: 0 },
    ],
    path: [],
    generatedBy: 'straight',
  };
  return { type: 'addRamp', ramp: makeRamp({ id: 'cd_rampa', typeId: 'rmt_nbr9050', levelId: PAV2, height: 0.25, components: [run], mark: 'RP-01' }) };
}

const GUARDA_CORPO: Command = {
  type: 'addGuardaCorpo',
  guardaCorpo: makeGuardaCorpo({
    id: 'cd_guarda_corpo',
    levelId: PAV2,
    typeId: 'gct_balaustres',
    hospedeiro: {
      tipo: 'manual',
      uso: 'borda-laje',
      caminho: [
        { x: 4.4, y: 2.6, dz: 0 },
        { x: 4.4, y: 7.08, dz: 0 },
      ],
      fechado: false,
      ladoDeslocamento: 'esquerdo',
    },
    mark: 'GC-01',
  }),
};

const ESTRUTURA: Command[] = [
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_so', typeId: 'ct_conc_20x40', levelId: TERREO, at: { x: 0.2, y: 0.2 }, mark: 'PL-01' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_se', typeId: 'ct_conc_20x40', levelId: TERREO, at: { x: 5.8, y: 0.2 }, mark: 'PL-02' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_no', typeId: 'ct_conc_20x40', levelId: TERREO, at: { x: 0.2, y: 7.8 }, mark: 'PL-03' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_ne', typeId: 'ct_conc_20x40', levelId: TERREO, at: { x: 5.8, y: 7.8 }, mark: 'PL-04' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd2_col_so', typeId: 'ct_conc_20x40', levelId: PAV2, at: { x: 0.2, y: 0.2 }, mark: 'PL-05' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd2_col_se', typeId: 'ct_conc_20x40', levelId: PAV2, at: { x: 5.8, y: 0.2 }, mark: 'PL-06' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd2_col_no', typeId: 'ct_conc_20x40', levelId: PAV2, at: { x: 0.2, y: 7.8 }, mark: 'PL-07' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd2_col_ne', typeId: 'ct_conc_20x40', levelId: PAV2, at: { x: 5.8, y: 7.8 }, mark: 'PL-08' }) },
  { type: 'addBeam', beam: makeBeam({ id: 'cd_v_sul', typeId: 'bt_conc_15x40', levelId: TERREO, a: { x: 0.2, y: 0.2 }, b: { x: 5.8, y: 0.2 }, zOffset: 2.4, mark: 'VG-01' }) },
  { type: 'addBeam', beam: makeBeam({ id: 'cd_v_norte', typeId: 'bt_conc_15x40', levelId: TERREO, a: { x: 0.2, y: 7.8 }, b: { x: 5.8, y: 7.8 }, zOffset: 2.4, mark: 'VG-02' }) },
  { type: 'addBeam', beam: makeBeam({ id: 'cd2_v_sul', typeId: 'bt_conc_15x40', levelId: PAV2, a: { x: 0.2, y: 0.2 }, b: { x: 5.8, y: 0.2 }, zOffset: 2.4, mark: 'VG-03' }) },
  { type: 'addBeam', beam: makeBeam({ id: 'cd2_v_norte', typeId: 'bt_conc_15x40', levelId: PAV2, a: { x: 0.2, y: 7.8 }, b: { x: 5.8, y: 7.8 }, zOffset: 2.4, mark: 'VG-04' }) },
  { type: 'addFooting', footing: makeFooting({ id: 'cd_sap_so', typeId: 'ft_iso_100x100', levelId: TERREO, at: { x: 0.2, y: 0.2 }, columnId: 'cd_col_so', mark: 'SP-01' }) },
  { type: 'addFooting', footing: makeFooting({ id: 'cd_sap_se', typeId: 'ft_iso_100x100', levelId: TERREO, at: { x: 5.8, y: 0.2 }, columnId: 'cd_col_se', mark: 'SP-02' }) },
  { type: 'addFooting', footing: makeFooting({ id: 'cd_sap_no', typeId: 'ft_iso_100x100', levelId: TERREO, at: { x: 0.2, y: 7.8 }, columnId: 'cd_col_no', mark: 'SP-03' }) },
  { type: 'addFooting', footing: makeFooting({ id: 'cd_sap_ne', typeId: 'ft_iso_100x100', levelId: TERREO, at: { x: 5.8, y: 7.8 }, columnId: 'cd_col_ne', mark: 'SP-04' }) },
];

const ambientes = (lang: Lang): Command[] => [
  { type: 'addRoom', room: makeRoom({ id: 'cd_amb_banho', levelId: TERREO, name: t(lang, 'md_room_banho'), number: '01', point: { x: 2, y: 1.2 }, categoryId: 'rc_banho' }) },
  { type: 'addRoom', room: makeRoom({ id: 'cd_amb_sala', levelId: TERREO, name: t(lang, 'md_room_sala'), number: '02', point: { x: 2, y: 5.5 }, categoryId: 'rc_sala' }) },
  { type: 'addRoom', room: makeRoom({ id: 'cd2_amb_dorm', levelId: PAV2, name: t(lang, 'md_room_quarto'), number: '03', point: { x: 2, y: 5.5 }, categoryId: 'rc_quarto' }) },
  { type: 'addRoom', room: makeRoom({ id: 'cd2_amb_banho', levelId: PAV2, name: t(lang, 'md_room_banho'), number: '04', point: { x: 2, y: 1.2 }, categoryId: 'rc_banho' }) },
];

const COMPONENTES: Command[] = [
  // Térreo, hidrossanitário no banheiro.
  componente('cd_c_vaso', FAMILIA_VASO_SANITARIO.id, TERREO, 1.1, 0.85, 0, Math.PI, 'LS-01'),
  componente('cd_c_lavatorio', FAMILIA_LAVATORIO.id, TERREO, 0.55, 1.55, 0, Math.PI / 2, 'LS-02'),
  componente('cd_c_ralo', FAMILIA_RALO.id, TERREO, 2.5, 1.2, 0, 0, 'LS-03'),
  // Térreo, elétrico.
  componente('cd_c_tomada_o1', FAMILIA_TOMADA.id, TERREO, 0.18, 0.9, 0, -Math.PI / 2, 'T-01'),
  componente('cd_c_tomada_o2', FAMILIA_TOMADA.id, TERREO, 0.18, 5.6, 0, -Math.PI / 2, 'T-02'),
  componente('cd_c_tomada_l', FAMILIA_TOMADA.id, TERREO, 5.8, 5.0, 0, Math.PI / 2, 'T-03'),
  componente('cd_c_interruptor', FAMILIA_INTERRUPTOR.id, TERREO, 3.8, 2.55, 0, 0, 'IN-01'),
  componente('cd_c_luminaria_sala', FAMILIA_LUMINARIA_TETO.id, TERREO, 3.0, 6.0, 0, 0, 'L-01'),
  componente('cd_c_luminaria_banho', FAMILIA_LUMINARIA_TETO.id, TERREO, 3.0, 1.2, 0, 0, 'L-02'),
  componente('cd_c_quadro', FAMILIA_QUADRO_DISTRIBUICAO.id, TERREO, 0.15, 5.0, 0, -Math.PI / 2, 'QD-01'),
  // Térreo, HVAC.
  componente('cd_c_difusor', FAMILIA_DIFUSOR_TETO.id, TERREO, 2.5, 5.8, 0, 0, 'DIF-01'),
  componente('cd_c_split', FAMILIA_AR_SPLIT.id, TERREO, 2.5, 7.8, 1.8, 0, 'AC-01'),
  // Pavimento superior, hidrossanitário.
  componente('cd2_c_vaso', FAMILIA_VASO_SANITARIO.id, PAV2, 1.1, 0.85, 0, Math.PI, 'LS-04'),
  componente('cd2_c_lavatorio', FAMILIA_LAVATORIO.id, PAV2, 0.55, 1.55, 0, Math.PI / 2, 'LS-05'),
  componente('cd2_c_ralo', FAMILIA_RALO.id, PAV2, 2.5, 1.2, 0, 0, 'LS-06'),
  // Pavimento superior, elétrico.
  componente('cd2_c_tomada_o1', FAMILIA_TOMADA.id, PAV2, 0.18, 0.9, 0, -Math.PI / 2, 'T-04'),
  componente('cd2_c_tomada_o2', FAMILIA_TOMADA.id, PAV2, 0.18, 5.6, 0, -Math.PI / 2, 'T-05'),
  componente('cd2_c_tomada_l', FAMILIA_TOMADA.id, PAV2, 5.8, 5.0, 0, Math.PI / 2, 'T-06'),
  componente('cd2_c_interruptor', FAMILIA_INTERRUPTOR.id, PAV2, 3.8, 2.55, 0, 0, 'IN-02'),
  componente('cd2_c_luminaria_dorm', FAMILIA_LUMINARIA_TETO.id, PAV2, 3.0, 6.0, 0, 0, 'L-03'),
  componente('cd2_c_luminaria_banho', FAMILIA_LUMINARIA_TETO.id, PAV2, 3.0, 1.2, 0, 0, 'L-04'),
  componente('cd2_c_quadro', FAMILIA_QUADRO_DISTRIBUICAO.id, PAV2, 0.15, 5.0, 0, -Math.PI / 2, 'QD-02'),
  // Pavimento superior, HVAC.
  componente('cd2_c_difusor', FAMILIA_DIFUSOR_TETO.id, PAV2, 2.5, 5.8, 0, 0, 'DIF-02'),
  componente('cd2_c_split', FAMILIA_AR_SPLIT.id, PAV2, 2.5, 7.8, 1.8, 0, 'AC-02'),
  // Móveis/componentes de arquitetura.
  componente('cd_c_sofa', FAMILIA_SOFA.id, TERREO, 2.6, 4.2, 0, 0, 'MOV-01'),
  componente('cd2_c_cama', FAMILIA_CAMA.id, PAV2, 2.2, 5.6, 0, 0, 'MOV-02'),
];

/** Terreno, região, lote, massa, CAD e genérico: categorias site, lot, mass e generic. */
const SITIO: Command[] = [
  {
    type: 'addTerrain',
    terrain: makeTerrain({
      id: 'cd_terreno',
      levelId: TERREO,
      name: 'Terreno de teste',
      pontos: [0, 0, 0, 6, 0, 0, 6, 8, 0, 0, 8, 0],
      borda: [-5, -4, 11, -4, 11, 12, -5, 12],
    }),
  },
  {
    type: 'addTerrainRegion',
    regiao: makeTerrainRegion({
      id: 'cd_regiao',
      levelId: TERREO,
      terrenoId: 'cd_terreno',
      name: 'Jardim',
      papel: 'plataforma',
      contorno: [
        { x: 7, y: 1 },
        { x: 9, y: 1 },
        { x: 9, y: 3 },
        { x: 7, y: 3 },
      ],
    }),
  },
  {
    type: 'addLot',
    lot: makeLot({
      id: 'cd_lote',
      levelId: TERREO,
      name: 'Lote de teste',
      contorno: [
        { x: -2, y: -3 },
        { x: 10, y: -3 },
        { x: 10, y: 10 },
        { x: -2, y: 10 },
      ],
      lados: ladosPadrao(4),
    }),
  },
  {
    type: 'addMass',
    mass: makeMass({ id: 'cd_massa', levelId: TERREO, name: 'Massa de teste', origem: { x: 7.5, y: 3 }, secoes: [secaoCirculo(0, 0.8), secaoCirculo(2.5, 0.5)] }),
  },
  {
    type: 'addCadDrawing',
    cad: {
      id: 'cd_cad',
      kind: 'cad',
      levelId: TERREO,
      name: 'Cad de teste',
      source: 'dxf',
      unit: 'm',
      visible: true,
      layers: [{ name: 'LOTE' }],
      paths: [
        {
          layer: 'LOTE',
          pts: [
            { x: -2, y: -3 },
            { x: 10, y: -3 },
            { x: 10, y: 10 },
            { x: -2, y: 10 },
            { x: -2, y: -3 },
          ],
          closed: true,
        },
      ],
      texts: [{ layer: 'LOTE', at: { x: 0, y: 9 }, text: 'LOTE', height: 0.3, rotation: 0 }],
    },
  },
  {
    type: 'addGeneric',
    generic: {
      id: 'cd_generico',
      kind: 'generic',
      levelId: TERREO,
      name: 'Objeto importado de teste',
      sourceClass: 'IFCBUILDINGELEMENTPROXY',
      mesh: {
        positions: [8, 8, 0, 9, 8, 0, 8, 9, 0],
        indices: [0, 1, 2],
      },
      outline: [
        { x: 8, y: 8 },
        { x: 9, y: 8 },
        { x: 8, y: 9 },
      ],
    },
  },
];

/** Móvel importado mínimo (um tapete raso) para cobrir o kind `furniture`. */
function movelImportado(): Command[] {
  const asset = buildFurnitureAsset(
    {
      name: 'Tapete de teste',
      sourceFileName: 'tapete-teste.glb',
      sourceFormat: 'glb',
      defs: [
        {
          id: 'cd_tapete_malha',
          name: 'Tapete',
          positions: new Float32Array([-0.75, -0.5, 0, 0.75, -0.5, 0, 0.75, 0.5, 0, -0.75, 0.5, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
          indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
          groups: [{ start: 0, count: 6, materialIndex: 0 }],
        },
      ],
      materials: [{ name: 'Tecido', color: [0.7, 0.6, 0.5], opacity: 1, category: 'fabric' }],
      textures: [],
    },
    'fa_tapete_teste',
  );
  return [
    { type: 'addFurnitureAsset', asset },
    {
      type: 'addFurniture',
      furniture: {
        id: 'cd_furn_tapete',
        kind: 'furniture',
        assetId: asset.id,
        levelId: TERREO,
        x: 3.2,
        y: 4.0,
        z: 0,
        rotation: 0,
        scale: 1,
        mirrored: false,
        name: 'Tapete de teste',
      },
    },
  ];
}

const DISCIPLINAS: Array<{ id: Id; levelId: Id; discipline: Discipline }> = [
  { id: 'pv_casa_estrutura', levelId: TERREO, discipline: 'estrutura' },
  { id: 'pv_casa_hidrossanitario', levelId: TERREO, discipline: 'hidrossanitario' },
  { id: 'pv_casa_eletrico', levelId: TERREO, discipline: 'eletrico' },
  { id: 'pv_casa_hvac', levelId: TERREO, discipline: 'hvac' },
  { id: 'pv_casa2_estrutura', levelId: PAV2, discipline: 'estrutura' },
  { id: 'pv_casa2_hidrossanitario', levelId: PAV2, discipline: 'hidrossanitario' },
  { id: 'pv_casa2_eletrico', levelId: PAV2, discipline: 'eletrico' },
  { id: 'pv_casa2_hvac', levelId: PAV2, discipline: 'hvac' },
];

/** Anotações de teste: cada uma na planta certa, para ver o isolamento entre plantas. */
const anotacoes = (lang: Lang): Command[] => [
  {
    type: 'addDimension',
    levelId: TERREO,
    planId: 'pv_casa_estrutura',
    dimension: { id: 'cd_dim_estrutura', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: -0.8, mode: 'horizontal' },
  },
  {
    type: 'addText',
    levelId: TERREO,
    planId: 'pv_casa_estrutura',
    text: { id: 'cd_txt_estrutura', at: { x: 0.5, y: 7.4 }, text: `${t(lang, 'md_disc_estrutura')} - ${nivelNome(TERREO, lang)}`, height: 3, rotation: 0 },
  },
  {
    type: 'addDimension',
    levelId: TERREO,
    planId: 'pv_casa_eletrico',
    dimension: { id: 'cd_dim_eletrico', a: { x: 0, y: 8 }, b: { x: 6, y: 8 }, offset: 0.8, mode: 'horizontal' },
  },
  {
    type: 'addDimension',
    levelId: TERREO,
    dimension: { id: 'cd_dim_padrao', a: { x: 0, y: 0 }, b: { x: 0, y: 8 }, offset: -0.8, mode: 'vertical' },
  },
];

/** Prancha de teste com as plantas de Estrutura e Elétrico do térreo. */
const PRANCHA: Command = {
  type: 'addSheet',
  sheet: {
    id: 'cd_prancha',
    number: 'A-201',
    name: 'Plantas de teste',
    size: 'A3',
    orientation: 'landscape',
    margin: 10,
    titleBlock: emptyTitleBlock(),
    viewports: [
      { id: 'cd_vp_estrutura', view: { kind: 'plan', levelId: TERREO, planId: 'pv_casa_estrutura' }, at: { x: 20, y: 20 }, size: { w: 120, h: 120 }, scale: 50 },
      { id: 'cd_vp_eletrico', view: { kind: 'plan', levelId: TERREO, planId: 'pv_casa_eletrico' }, at: { x: 160, y: 20 }, size: { w: 120, h: 120 }, scale: 50 },
    ],
  },
};

/** Monta o teste de disciplinas completo como uma lista de comandos, no mesmo estilo dos outros modelos. */
export function casaDisciplinas(cmds: Command[], lang: Lang = 'pt'): void {
  for (const familia of FAMILIAS) cmds.push({ type: 'upsertFamily', family: familia });
  for (const c of PAREDES) cmds.push(c);
  for (const c of ABERTURAS) cmds.push(c);
  for (const c of PISOS) cmds.push(c);
  cmds.push(LAJE_PAV2);
  for (const c of FORROS) cmds.push(c);
  cmds.push(TELHADO);
  cmds.push(escada());
  cmds.push(rampa());
  cmds.push(GUARDA_CORPO);
  for (const c of ESTRUTURA) cmds.push(c);
  for (const c of ambientes(lang)) cmds.push(c);
  for (const c of SITIO) cmds.push(c);
  for (const c of movelImportado()) cmds.push(c);
  for (const c of COMPONENTES) cmds.push(c);
  for (const { id, levelId, discipline } of DISCIPLINAS) cmds.push(planta(id, levelId, discipline, lang));
  for (const c of anotacoes(lang)) cmds.push(c);
  cmds.push(PRANCHA);
}
