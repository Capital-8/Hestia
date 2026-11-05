import type { Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { makeFloor } from './floor.ts';
import { makeSlab } from './slab.ts';
import { makeStair } from './stair.ts';
import { makeWall } from './wall.ts';
import { t, type Lang } from './i18n.ts';
import type { FloorType, Id, Level, SectionView, SlabType } from './types.ts';

/**
 * Prédio residencial de 10 pavimentos — exemplo de estabilidade (plantas, cortes e 3D).
 *
 * Planta 20 × 13 m, núcleo de circulação central com **só escada** (dois lances, 6 × 4 m), quatro unidades por andar:
 * norte e sul com o programa completo (sala/cozinha, dois dormitórios — um suíte — e dois banheiros) e oeste e leste
 * como unidades compactas (sala/cozinha, dormitório e banheiro). Piso a piso 2,80 m: 10 pavimentos, 28,00 m até o topo.
 *
 * Critérios de projeto (NBR 9050 no essencial): circulação de 1,20 m dentro das unidades, portas de 0,80 nos ambientes
 * e 0,90 na entrada, banheiro com 1,50 m de giro, cada ambiente com janela própria e ventilação cruzada (as unidades
 * norte/sul abrem nas duas faces pelo núcleo de escada ventilado; oeste/leste abrem em duas fachadas opostas).
 *
 * Junção (decisões 0025 e 0027): lajes e pisos com a **estrutura** em `limiteExterno: 'nucleo'` (para na face externa do
 * núcleo da parede) e as camadas de **acabamento** em `termino: 'nucleo'` (param na face interna do núcleo). Paredes sem
 * anexo de base e de topo: o topo vai ao topo da laje pelo nível de topo + `topOffset`.
 */

const H = 2.8;
const W = 20;
const D = 13;
const N = 10;
/** Metade da espessura da parede externa `wt_ext19` (0,242 m): face externa do acabamento. */
const EXT = 0.121;
/** Núcleo de escada: 6 × 4 m no centro da planta. */
const CORE = { x0: 7, x1: 13, y0: 4.5, y1: 8.5 } as const;
/** Circulação das unidades: 1,20 m. */
const CIRC = 1.2;

const lv = (i: number): Id => `lv_${i}`;
const elev = (i: number): number => i * H;

const niveis = (lang: Lang): Level[] =>
  Array.from({ length: N }, (_, i) => ({
    id: lv(i),
    name: i === 0 ? t(lang, 'md_doc_level_ground') : t(lang, 'md_doc_level_n', { n: i + 1 }),
    elevation: elev(i),
    viewRange: { top: 2.3, cut: 1.2, bottom: 0, depth: 0, direction: 'down' },
  }));

const lajeType = (lang: Lang): SlabType => ({
  id: 'pd_laje',
  name: t(lang, 'md_tpl_pd_slab'),
  code: 'PD-LJ',
  description: t(lang, 'md_tpl_pd_slab_desc'),
  cost: 240,
  layers: [
    { function: 'substrate', materialId: 'mat_argamassa', thickness: 0.02, wraps: false, termino: 'nucleo' },
    { function: 'structure', materialId: 'mat_concreto', thickness: 0.15, wraps: false, limiteExterno: 'nucleo' },
    { function: 'substrate', materialId: 'mat_tinta', thickness: 0.02, wraps: false, termino: 'nucleo' },
  ],
});

const pisoType = (lang: Lang): FloorType => ({
  id: 'pd_piso',
  name: t(lang, 'md_tpl_pd_floor'),
  code: 'PD-PS',
  description: t(lang, 'md_tpl_pd_floor_desc'),
  cost: 160,
  layers: [
    { function: 'finish1', materialId: 'mat_ceramica', thickness: 0.01, wraps: false, termino: 'nucleo' },
    { function: 'substrate', materialId: 'mat_argamassa', thickness: 0.04, wraps: false, termino: 'nucleo' },
    { function: 'structure', materialId: 'mat_concreto', thickness: 0.10, wraps: false, limiteExterno: 'nucleo' },
  ],
});

type Topo = Partial<{ topLevelId: Id | null; topOffset: number }>;

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const junta = { kind: 'butt' as const, flip: false };
const parede = (cmds: Command[], id: Id, levelId: Id, typeId: Id, a: Vec2, b: Vec2, topo: Topo): void => {
  cmds.push({ type: 'addWall', wall: makeWall({ id, typeId, levelId, a, b, joinStart: junta, joinEnd: junta, ...topo }) });
};
/** Divisória de 9 cm (alvenaria interna). */
const divisoria = (cmds: Command[], id: Id, levelId: Id, a: Vec2, b: Vec2, topo: Topo): void =>
  parede(cmds, id, levelId, 'wt_alv9', a, b, topo);

const vao = (hostId: Id, typeId: Id, offset: number, kind: 'door' | 'window', id: Id): Command => ({
  type: 'addOpening',
  opening: { id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
});

/** Perímetro no sentido horário: a face externa fica à esquerda de a→b (docs/05 §3). */
function perimetro(cmds: Command[], levelId: Id, typeId: Id, box: { x0: number; x1: number; y0: number; y1: number }, pre: string, topo: Topo): void {
  const lados: Array<[string, Vec2, Vec2]> = [
    ['s', { x: box.x1, y: box.y0 }, { x: box.x0, y: box.y0 }],
    ['l', { x: box.x1, y: box.y1 }, { x: box.x1, y: box.y0 }],
    ['n', { x: box.x0, y: box.y1 }, { x: box.x1, y: box.y1 }],
    ['o', { x: box.x0, y: box.y0 }, { x: box.x0, y: box.y1 }],
  ];
  for (const [nome, a, b] of lados) parede(cmds, `${pre}-${nome}`, levelId, typeId, a, b, topo);
}

/**
 * Unidade norte/sul com o programa completo. `dir` = +1 (norte, cresce em y) ou −1 (sul); `base` é a cota da parede do
 * núcleo. Faixa da circulação: `base` até `base + dir·1,20`; ambientes na faixa da fachada, com 3,30 m de profundidade.
 */
function unidadeNS(cmds: Command[], i: number, nivel: Id, topo: Topo, base: number, dir: 1 | -1, pre: string): void {
  const corr = base + dir * CIRC;
  const face = base + dir * 4.5;
  const yMin = Math.min(corr, face);
  const yMax = Math.max(corr, face);
  const xDorm2 = 3.6;
  const xBanho = 5.2;
  const xBanhoSuite = 13.6;
  const xSuite = 15.2;
  // divisórias entre os ambientes da faixa da fachada
  for (const [id, x] of [['D1', xDorm2], ['D2', xBanho], ['D3', xBanhoSuite], ['D4', xSuite]] as const) {
    divisoria(cmds, `PD${i}-${pre}-${id}`, nivel, { x, y: yMin }, { x, y: yMax }, topo);
  }
  // parede da circulação: dois trechos, deixando a sala aberta no meio
  divisoria(cmds, `PD${i}-${pre}-C1`, nivel, { x: 0, y: corr }, { x: xBanho, y: corr }, topo);
  divisoria(cmds, `PD${i}-${pre}-C2`, nivel, { x: xBanhoSuite, y: corr }, { x: W, y: corr }, topo);
  // portas: dormitório 2, banho social, banho da suíte e suíte
  cmds.push(vao(`PD${i}-${pre}-C1`, 'ot_p80', 1.8, 'door', `PD${i}-${pre}-pD2`));
  cmds.push(vao(`PD${i}-${pre}-C1`, 'ot_p80', 4.4, 'door', `PD${i}-${pre}-pBS`));
  cmds.push(vao(`PD${i}-${pre}-C2`, 'ot_p80', 1.0, 'door', `PD${i}-${pre}-pBSU`));
  cmds.push(vao(`PD${i}-${pre}-C2`, 'ot_p80', 4.0, 'door', `PD${i}-${pre}-pSU`));
  // entrada da unidade pelo núcleo (porta de 0,90, acessível)
  cmds.push(vao(`PD${i}-NUC-${dir > 0 ? 'n' : 's'}`, 'ot_p90', 3.0, 'door', `PD${i}-${pre}-pEnt`));
  // janelas na fachada: dormitório 2, banho, sala/cozinha (duas) e suíte
  const host = `PD${i}-EXT-${dir > 0 ? 'n' : 's'}`;
  const ox = (x: number): number => (dir > 0 ? x : W - x);
  cmds.push(vao(host, 'ot_j120', ox(1.8), 'window', `PD${i}-${pre}-jD2`));
  cmds.push(vao(host, 'ot_j60', ox(4.4), 'window', `PD${i}-${pre}-jBS`));
  cmds.push(vao(host, 'ot_j240', ox(7.6), 'window', `PD${i}-${pre}-jSA`));
  cmds.push(vao(host, 'ot_j120', ox(11.6), 'window', `PD${i}-${pre}-jCO`));
  cmds.push(vao(host, 'ot_j150', ox(17.6), 'window', `PD${i}-${pre}-jSU`));
}

/** Unidade compacta (oeste/leste): sala/cozinha, dormitório e banheiro, com 4 m de profundidade. */
function unidadeCompacta(cmds: Command[], i: number, nivel: Id, topo: Topo, pre: string, x0: number, x1: number): void {
  const yc = (CORE.y0 + CORE.y1) / 2;
  const yCorr = CORE.y0 + CIRC;
  // circulação 1,20 m junto ao núcleo; dormitório e banheiro na faixa da fachada
  divisoria(cmds, `PD${i}-${pre}-C1`, nivel, { x: x0, y: yCorr }, { x: x1, y: yCorr }, topo);
  divisoria(cmds, `PD${i}-${pre}-D1`, nivel, { x: (x0 + x1) / 2, y: yCorr }, { x: (x0 + x1) / 2, y: CORE.y1 }, topo);
  cmds.push(vao(`PD${i}-${pre}-C1`, 'ot_p80', 1.6, 'door', `PD${i}-${pre}-pD`));
  cmds.push(vao(`PD${i}-${pre}-C1`, 'ot_p80', 5.0, 'door', `PD${i}-${pre}-pB`));
  cmds.push(vao(`PD${i}-NUC-${pre === 'O' ? 'o' : 'l'}`, 'ot_p90', yc - CORE.y0, 'door', `PD${i}-${pre}-pEnt`));
  const lado = pre === 'O' ? 'o' : 'l';
  const len = CORE.y1 - CORE.y0;
  cmds.push(vao(`PD${i}-EXT-${lado}`, 'ot_j120', len * 0.3, 'window', `PD${i}-${pre}-jD`));
  cmds.push(vao(`PD${i}-EXT-${lado}`, 'ot_j120', len * 0.75, 'window', `PD${i}-${pre}-jS`));
}

const cortes = (lang: Lang): SectionView[] => [
  { id: 'PD-AA', name: t(lang, 'md_tpl_pd_section_aa'), kind: 'section', a: { x: 10, y: -2 }, b: { x: 10, y: D + 2 }, depth: D + 4 },
  { id: 'PD-BB', name: t(lang, 'md_tpl_pd_section_bb'), kind: 'section', a: { x: -2, y: 6.5 }, b: { x: W + 2, y: 6.5 }, depth: W + 4 },
];

/** Escada de dois lances dentro do núcleo: um lance reto de 2,40 m de largura útil por 2,80 m de altura. */
function escada(cmds: Command[], nivel: Id, topo: Topo): void {
  cmds.push({
    type: 'addStair',
    stair: makeStair({
      id: `PD-ESC-${nivel}`,
      typeId: 'stt_monolitica',
      levelId: nivel,
      components: [
        {
          id: `PD-ESC-${nivel}-lance`,
          kind: 'run',
          boundaryLeft: [{ a: { x: CORE.x0 + 0.4, y: CORE.y0 + 0.6 }, b: { x: CORE.x0 + 0.4, y: CORE.y0 + 3.4 }, sag: 0 }],
          boundaryRight: [{ a: { x: CORE.x0 + 2.8, y: CORE.y0 + 0.6 }, b: { x: CORE.x0 + 2.8, y: CORE.y0 + 3.4 }, sag: 0 }],
          risers: Array.from({ length: 17 }, (_, k) => {
            const y = CORE.y0 + 0.6 + (2.8 * k) / 16;
            return { a: { x: CORE.x0 + 0.4, y }, b: { x: CORE.x0 + 2.8, y }, sag: 0 };
          }),
          path: [],
          generatedBy: 'straight',
        },
      ],
      ...topo,
    }),
  });
}

/** Monta o prédio de 10 pavimentos como uma lista de comandos, no mesmo estilo de `house2` e `casaAltoPadrao`. */
export function predio10(cmds: Command[], lang: Lang = 'pt'): void {
  for (const l of niveis(lang)) cmds.push({ type: 'upsertLevel', level: l });
  cmds.push({ type: 'upsertSlabType', slabType: lajeType(lang) });
  cmds.push({ type: 'upsertFloorType', floorType: pisoType(lang) });

  for (let i = 0; i < N; i++) {
    const nivel = lv(i);
    const acima = i + 1 < N ? lv(i + 1) : null;
    const topo: Topo = acima ? { topLevelId: acima, topOffset: 0 } : {};
    perimetro(cmds, nivel, 'wt_ext19', { x0: 0, y0: 0, x1: W, y1: D }, `PD${i}-EXT`, topo);
    perimetro(cmds, nivel, 'wt_conc15', { ...CORE }, `PD${i}-NUC`, topo);

    // pisos das quatro unidades
    cmds.push({ type: 'addFloor', floor: makeFloor({ id: `PD${i}-N`, typeId: 'pd_piso', levelId: nivel, boundary: rect(0, CORE.y1, W, D) }) });
    cmds.push({ type: 'addFloor', floor: makeFloor({ id: `PD${i}-S`, typeId: 'pd_piso', levelId: nivel, boundary: rect(0, 0, W, CORE.y0) }) });
    cmds.push({ type: 'addFloor', floor: makeFloor({ id: `PD${i}-O`, typeId: 'pd_piso', levelId: nivel, boundary: rect(0, CORE.y0, CORE.x0, CORE.y1) }) });
    cmds.push({ type: 'addFloor', floor: makeFloor({ id: `PD${i}-L`, typeId: 'pd_piso', levelId: nivel, boundary: rect(CORE.x1, CORE.y0, W, CORE.y1) }) });

    unidadeNS(cmds, i, nivel, topo, CORE.y1, 1, 'N');
    unidadeNS(cmds, i, nivel, topo, CORE.y0, -1, 'S');
    unidadeCompacta(cmds, i, nivel, topo, 'O', 0, CORE.x0);
    unidadeCompacta(cmds, i, nivel, topo, 'L', CORE.x1, W);

    escada(cmds, nivel, topo);

    // laje do pavimento (contorno na face externa; as camadas param no núcleo) e a de cobertura no último
    if (i > 0) cmds.push({ type: 'addSlab', slab: makeSlab({ id: `PD${i}-LAJE`, typeId: 'pd_laje', levelId: nivel, boundary: rect(-EXT, -EXT, W + EXT, D + EXT) }) });
  }
  cmds.push({ type: 'addSlab', slab: makeSlab({ id: 'PD-COB', typeId: 'pd_laje', levelId: lv(N - 1), heightOffset: H, boundary: rect(-EXT, -EXT, W + EXT, D + EXT) }) });

  for (const v of cortes(lang)) cmds.push({ type: 'addView', view: v });
}
