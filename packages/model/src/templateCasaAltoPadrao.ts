import type { Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { DEFAULT_FLOOR_TYPES, makeFloor } from './floor.ts';
import type { MaterialPbrPatch } from './materialPbr.ts';
import { makeLevel } from './level.ts';
import { makeRoof } from './roof.ts';
import { makeSlab } from './slab.ts';
import { makeStair } from './stair.ts';
import type { Id, Opening, OpeningType, PlanSymbol, SectionRole, SectionView, StairRun } from './types.ts';
import { makeWall } from './wall.ts';

/**
 * Casa de alto padrão, 2 pavimentos (docs/projetos/casa-alto-padrao/B-projeto-planta.md, v2, com as alterações do
 * coordenador: suíte NE = SUÍTE MASTER, suíte SE = SUÍTE 3, sem sacada sul e faces externas de 11,99 × 14,24 m).
 *
 * Convenções (docs/05 §3): a face externa de cada parede fica à esquerda de a→b; o `offset` da abertura é a distância do
 * centro do vão ao início (a) da parede; `flipFacing = true` gira a folha para a direita de a→b.
 *
 * Níveis: lv_0 (Térreo, 0,00) e lv_1 (Pavimento 2, 3,00), criados por `createEmptyProject`, e lv_2 (Cobertura, 5,80),
 * criado aqui: o telhado fica no lv_2 (beiral na cota do nível) para a planta de cobertura cortá-lo.
 * A laje do lv_1 tem contorno pela face externa, para o ponto médio das paredes externas do
 * térreo cair dentro dela e o topo anexar à sua face inferior.
 */

/** Tipos de abertura que não existem no padrão (B, seção 7). `ot_pj240` saiu com a sacada sul. */
const OPENING_TYPES: OpeningType[] = [
  tipoAbertura('ot_pv120', 'door', 'Porta 120 x 210 pivotante', 1.2, 2.1, 0, 1, 'pivot'),
  tipoAbertura('ot_portao450', 'door', 'Portão de garagem 4,50 x 2,20', 4.5, 2.2, 0, 2, 'sliding'),
  tipoAbertura('ot_vao140', 'door', 'Vão livre 1,40 x 2,40', 1.4, 2.4, 0, 0, 'swing'),
  tipoAbertura('ot_vao180', 'door', 'Vão livre 1,80 x 2,40', 1.8, 2.4, 0, 0, 'swing'),
  tipoAbertura('ot_vao240', 'door', 'Vão livre 2,40 x 2,40', 2.4, 2.4, 0, 0, 'swing'),
  tipoAbertura('ot_j240x220', 'window', 'Janelão 2,40 x 2,20', 2.4, 2.2, 0, 2, 'sliding'),
  tipoAbertura('ot_j240x160', 'window', 'Janela 2,40 x 1,60', 2.4, 1.6, 1.1, 2, 'sliding'),
  tipoAbertura('ot_j240x140', 'window', 'Janela 2,40 x 1,40', 2.4, 1.4, 1.1, 2, 'sliding'),
  tipoAbertura('ot_j60x100', 'window', 'Janela 0,60 x 1,00', 0.6, 1.0, 1.5, 1, 'casement'),
];

function tipoAbertura(
  id: Id,
  kind: 'door' | 'window',
  name: string,
  width: number,
  height: number,
  sill: number,
  leaves: 0 | 1 | 2,
  plan: PlanSymbol,
  frame = kind === 'window' ? 'mat_aluminio' : 'mat_madeira',
): OpeningType {
  return { id, kind, name, width, height, sill, leaves, plan, frameMaterialId: frame, glassMaterialId: 'mat_vidro', closure: 'inherit' };
}

const EXT = 'wt_ext19';
const PA14 = 'wt_alv14';
const PA09 = 'wt_alv9';

/**
 * Materiais físicos do render (T3). Só o preset da textura entra aqui; os caminhos das texturas da pasta pbr ficam para a
 * etapa F3 (leitura de textura de imagem). O PBR vai para o MESMO material que a camada já usa no padrão (mesmo id, cor e
 * hachura), para a planta sair idêntica: o motor une num só preenchimento as camadas que compartilham o `materialId`.
 * Material novo só quando o original é compartilhado por superfícies com função diferente: o piso cerâmico (`ft_ceram`)
 * usa `mat-piso-ceramico`, com a cor e a hachura de `mat_ceramica`, porque `mat_ceramica` passa a ser o reboco externo.
 * Vidro mantém cor e hachura. O PBR não altera a planta (testado); a textura só entra no 3D.
 */
const pbr = (id: Id, patch: MaterialPbrPatch): Command => ({ type: 'updateMaterialPbr', id, patch });

/** Piso cerâmico do `ft_ceram`: cor, hachura e custo de `mat_ceramica` (padrão), com o PBR de piso. */
const PISO_CERAMICO = 'mat-piso-ceramico';

const MATERIAIS_PBR: Command[] = [
  {
    type: 'upsertMaterial',
    material: { id: PISO_CERAMICO, name: 'Revestimento cerâmico (piso)', color: '#e9e4da', hatch: 'none', gloss: 0.6, opacity: 1, cost: 85, unit: 'm2' },
  },
  // Vidro: a opacidade é campo do material (não do PBR), então o registro inteiro é regravado. Cor azul-acinzentada clara mantida.
  { type: 'upsertMaterial', material: { id: 'mat_vidro', name: 'Vidro', color: '#a9d6e5', hatch: 'none', gloss: 0.9, opacity: 0.3, cost: 220, unit: 'm2' } },
  // Rebocos: acabamento externo (mat_ceramica), substrato externo (mat_argamassa) e paredes internas (mat_reboco).
  pbr('mat_ceramica', { roughness: 0.85, metallic: 0, texture: { preset: 'reboco' }, mapping: { scale: 2 } }),
  pbr('mat_argamassa', { roughness: 0.85, metallic: 0, texture: { preset: 'reboco' }, mapping: { scale: 2 } }),
  pbr('mat_reboco', { roughness: 0.9, metallic: 0, texture: { preset: 'reboco' }, mapping: { scale: 2 } }),
  pbr('mat_vidro', { transmission: 0.85, roughness: 0.05, ior: 1.52 }),
  // Esquadrias metálicas (caixilhos de alumínio).
  pbr('mat_aluminio', { metallic: 1, roughness: 0.35, texture: { preset: 'metal' } }),
  // Madeira: portas, vãos e o portão da garagem (`frameMaterialId`). Também é a madeira do madeiramento do telhado.
  pbr('mat_madeira', { roughness: 0.6, texture: { preset: 'madeira' }, mapping: { scale: 1 } }),
  // Telha cerâmica do telhado.
  pbr('mat_telha_ceramica', { roughness: 0.7, texture: { preset: 'telha' }, mapping: { scale: 1 } }),
  // Piso cerâmico interno (acabamento de ft_ceram, `mat-piso-ceramico`). Não há piso externo no padrão.
  pbr(PISO_CERAMICO, { roughness: 0.4, texture: { preset: 'piso' }, mapping: { scale: 0.6 } }),
  // Concreto das lajes e da base da garagem. A escada monolítica usa o mesmo material (sem material próprio).
  pbr('mat_concreto', { roughness: 0.85, texture: { preset: 'concreto' }, mapping: { scale: 2 } }),
];

/** `ft_ceram` com o acabamento trocado para o piso cerâmico próprio (`PISO_CERAMICO`); as demais camadas ficam iguais. */
const TIPO_PISO: Command = (() => {
  const padrao = DEFAULT_FLOOR_TYPES.find((t) => t.id === 'ft_ceram');
  if (!padrao) throw new Error('Tipo de piso ft_ceram não existe no padrão');
  const layers = padrao.layers.map((camada) => (camada.materialId === 'mat_ceramica' ? { ...camada, materialId: PISO_CERAMICO } : camada));
  return { type: 'upsertFloorType', floorType: { ...padrao, layers } };
})();

/**
 * Parede reta de a até b. Com `noTopo` false (térreo), o topo vai ao **topo da laje** do lv_1 (3,00 + 0,10) e não é
 * anexado: a parede não depende do piso para ter cota (decisão do dono, 2026-10-23). Com a laje terminando na face do
 * núcleo, o acabamento externo da parede sobe na frente do corte dela.
 */
function parede(id: Id, a: [number, number], b: [number, number], typeId: Id, levelId: Id, noTopo = false, altura?: number): Command {
  const topo = noTopo ? {} : { topLevelId: 'lv_1', topOffset: -0.17 };
  const h = altura === undefined ? {} : { height: altura };
  return {
    type: 'addWall',
    wall: makeWall({ id, typeId, levelId, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, ...topo, ...h }),
  };
}

/** Níveis do projeto: térreo (0,00) e pavimento 2 (3,00). */
const TERREO = 'lv_0';
const PAV2 = 'lv_1';
/** Nível da cobertura (beiral a 5,80 m): a planta dele corta o telhado, como a planta de cobertura do Revit. */
const COBERTURA = 'lv_2';

const PAREDES: Command[] = [
  // Externas do térreo (contorno no sentido horário, face externa à esquerda de a→b).
  parede('T-EXT-O', [0, 0], [0, 14], EXT, TERREO),
  parede('T-EXT-S', [11.75, 0], [0, 0], EXT, TERREO),
  parede('T-EXT-L', [11.75, 14], [11.75, 0], EXT, TERREO),
  // Face norte aberta de x 5,5 a 11,75 (varanda gourmet, sem guarda-corpo no app).
  parede('T-EXT-N', [0, 14], [5.5, 14], EXT, TERREO),
  // Divisórias do térreo.
  parede('T-I-01', [5.5, 0], [5.5, 14], PA14, TERREO),
  parede('T-I-02', [0, 5.5], [5.5, 5.5], PA14, TERREO),
  parede('T-I-03', [0, 9.5], [5.5, 9.5], PA09, TERREO),
  parede('T-I-04', [0, 11.5], [5.5, 11.5], PA14, TERREO),
  // Fecha a passagem sob o lance da escada (pé-direito abaixo de 2,10 m) pelo lado do hall. Topo fixo em 2,83 m.
  // DEC-3 (C-montagem §5): afastada 0,154 m para leste, de x = 6,7 para x = 6,854, para a largura livre entre faces
  // ficar em 1,20 m, igual à largura do lance (face de T-I-01 em 5,5 + 0,092 = 5,592; face desta em 6,854 − 0,062 = 6,792).
  parede('T-I-05', [6.854, 2.0], [6.854, 5.9], PA09, TERREO, true, 2.83),
  // DEC-4 (C-montagem §5): afastada 0,07 m para o norte (de y = 6,56 para 6,63). A face sul (6,568) fica 8 mm acima do último
  // espelho do lance (y = 6,56), que agora está em x 5,592 a 6,792.
  parede('T-I-06', [5.5, 6.63], [8.9, 6.63], PA09, TERREO),
  parede('T-I-07', [8.9, 0], [8.9, 10.4], PA09, TERREO),
  parede('T-I-08', [8.9, 2.0], [10.8, 2.0], PA09, TERREO),
  parede('T-I-09', [10.8, 0], [10.8, 2.0], PA09, TERREO),
  parede('T-I-10', [5.5, 10.4], [8.9, 10.4], PA09, TERREO),
  parede('T-I-11', [8.9, 10.4], [11.75, 10.4], PA09, TERREO),

  // Pavimento 2 (lv_1), topo no beiral (2,80 m acima do piso). Suítes: SUÍTE MASTER no canto nordeste (quarto com banheiro
  // e closet 3, a oeste); SUÍTE 3 no sudeste (quarto com banheiro e closet da suíte 3, a oeste); SUÍTE 2 no noroeste.
  parede('S-EXT-O', [0, 0], [0, 14], EXT, PAV2, true),
  parede('S-EXT-S', [11.75, 0], [0, 0], EXT, PAV2, true),
  parede('S-EXT-L', [11.75, 14], [11.75, 0], EXT, PAV2, true),
  parede('S-EXT-N', [0, 14], [11.75, 14], EXT, PAV2, true),
  parede('S-I-01', [0, 6.56], [5.5, 6.56], PA09, PAV2, true),
  parede('S-I-02', [5.5, 0], [5.5, 6.56], PA14, PAV2, true),
  // S-I-03, S-I-04, S-I-05 e S-I-07 acompanham o lance (DEC-4): x 6,854, a mesma face de T-I-05 (1,20 m livres com o lance).
  parede('S-I-03', [5.5, 3.2], [6.854, 3.2], PA14, PAV2, true),
  parede('S-I-04', [6.854, 3.2], [8.9, 3.2], PA14, PAV2, true),
  parede('S-I-05', [6.854, 3.2], [6.854, 6.56], PA09, PAV2, true),
  // Parede entre o banheiro e o closet da SUÍTE 3 (oeste) e o quarto da SUÍTE 3 (leste).
  parede('S-I-06', [8.9, 0], [8.9, 6.56], PA14, PAV2, true),
  parede('S-I-07', [6.854, 6.56], [11.75, 6.56], PA09, PAV2, true),
  parede('S-I-08', [0, 7.76], [11.75, 7.76], PA09, PAV2, true),
  parede('S-I-09', [5.5, 7.76], [5.5, 14], PA09, PAV2, true),
  // Entre closet 3 e banheiro 3 (oeste) e a SUÍTE MASTER (leste).
  parede('S-I-10', [8.0, 7.76], [8.0, 14], PA09, PAV2, true),
  parede('S-I-11', [0, 11.5], [5.5, 11.5], PA14, PAV2, true),
  parede('S-I-12', [2.8, 11.5], [2.8, 14], PA14, PAV2, true),
  // Separa closet 3 (sul) e banheiro 3 (norte). Não consta na tabela do B, mas as áreas do B supõem esta parede.
  parede('S-I-13', [5.5, 10], [8.0, 10], PA09, PAV2, true),
];

/** Abertura: id, parede hospedeira, tipo, offset, marca, `flipFacing` (padrão false) e peitoril (padrão do tipo). */
type Abertura = [id: Id, parede: Id, tipo: Id, offset: number, marca: string, flipFacing?: boolean, peitoril?: number];

/** Portas e janelas do térreo (B, seção 3.1). Vão livre (leaves 0) é porta sem folha, com marca V-. */
const ABERTURAS_TERREO: Abertura[] = [
  ['T1', 'T-EXT-S', 'ot_pv120', 3.85, 'P-01', true],
  ['T2', 'T-EXT-S', 'ot_portao450', 9.0, 'P-06'],
  ['T3', 'T-EXT-S', 'ot_j60x100', 1.85, 'J-01'],
  ['T4', 'T-EXT-L', 'ot_j150', 7.0, 'J-02'],
  ['T5', 'T-EXT-L', 'ot_j240x220', 10.0, 'J-03'],
  ['T6', 'T-I-07', 'ot_p70', 1.0, 'P-02', true],
  ['T7', 'T-I-02', 'ot_p80', 2.0, 'P-03'],
  ['T8', 'T-I-01', 'ot_vao140', 8.0, 'V-01'],
  ['T9', 'T-I-03', 'ot_p80', 2.5, 'P-04'],
  ['T10', 'T-I-04', 'ot_p80', 2.5, 'P-05'],
  ['T11', 'T-I-06', 'ot_vao180', 2.3, 'V-02'],
  ['T12', 'T-I-07', 'ot_vao180', 3.1, 'V-03'],
  ['T13', 'T-I-07', 'ot_vao240', 8.4, 'V-04'],
  ['T14', 'T-I-10', 'ot_vao240', 1.7, 'V-05'],
  ['T15', 'T-I-11', 'ot_vao240', 1.4, 'V-06'],
  ['T16', 'T-EXT-O', 'ot_j240x160', 7.5, 'J-04'],
  ['T17', 'T-EXT-O', 'ot_j120', 12.75, 'J-05'],
  ['T18', 'T-EXT-N', 'ot_j120', 2.75, 'J-06'],
];

/** Portas e janelas do pavimento 2 (B, seção 3.2). S8 com offset 3,99: o B dá 4,24, mas o vão 11,40–12,10 é 3,99. */
const ABERTURAS_PAV2: Abertura[] = [
  ['S1', 'S-I-01', 'ot_p80', 2.0, 'P-07', true],
  ['S2', 'S-I-07', 'ot_p90', 3.346, 'P-08', true], // corredor → quarto da SUÍTE 3 (sul). Centro em x 10,20, como no B (offset 3,50 a partir de x 6,70, DEC-4)
  ['S3', 'S-I-06', 'ot_p80', 1.6, 'P-09'],
  ['S4', 'S-I-06', 'ot_p80', 4.8, 'P-10'],
  ['S5', 'S-I-08', 'ot_p80', 1.5, 'P-11'],
  ['S6', 'S-I-08', 'ot_p80', 9.6, 'P-12'], // corredor → SUÍTE MASTER (norte)
  ['S7', 'S-I-10', 'ot_p80', 1.04, 'P-13'],
  ['S8', 'S-I-10', 'ot_p70', 3.99, 'P-14'],
  ['S9', 'S-I-11', 'ot_p70', 1.4, 'P-15'],
  ['S10', 'S-I-11', 'ot_p80', 4.0, 'P-16'],
  ['J1', 'S-EXT-O', 'ot_j240x140', 1.8, 'J-07'],
  ['J2', 'S-EXT-O', 'ot_j240x140', 4.5, 'J-08'],
  ['J3', 'S-EXT-O', 'ot_j240x160', 9.6, 'J-09'],
  ['J4', 'S-EXT-S', 'ot_j120', 4.55, 'J-10', false, 1.5],
  // Substitui a porta-janela da sacada sul (removida). Janela normal, peitoril 1,10.
  ['J5', 'S-EXT-S', 'ot_j240x140', 1.45, 'J-11'],
  ['J6', 'S-EXT-L', 'ot_j240x140', 11.0, 'J-12'],
  ['J7', 'S-EXT-N', 'ot_j120', 1.0, 'J-13', false, 1.5],
  ['J8', 'S-EXT-N', 'ot_j240x140', 9.8, 'J-14'],
  ['J9', 'S-EXT-L', 'ot_j240x140', 4.0, 'J-15'],
  ['J10', 'S-EXT-N', 'ot_j120', 6.6, 'J-16', false, 1.5],
];

function aberturas(lista: Abertura[]): Command[] {
  return lista.map(([id, hostId, typeId, offset, mark, flipFacing = false, sill]) => {
    const kind: 'door' | 'window' = typeId.startsWith('ot_j') ? 'window' : 'door';
    const opening: Opening = {
      id,
      kind,
      typeId,
      hostId,
      offset,
      flipHand: false,
      flipFacing,
      sillOverride: sill ?? null,
      mark,
    };
    return { type: 'addOpening', opening };
  });
}

/** Piso do térreo: cerâmica no interior (sem a garagem) e laje de 12 cm na garagem. */
const PISOS: Command[] = [
  {
    type: 'addFloor',
    floor: makeFloor({
      id: 'F-T-01',
      typeId: 'ft_ceram',
      levelId: TERREO,
      boundary: [
        { x: 5.5, y: 0 },
        { x: 11.75, y: 0 },
        { x: 11.75, y: 14 },
        { x: 0, y: 14 },
        { x: 0, y: 5.5 },
        { x: 5.5, y: 5.5 },
      ],
      heightOffset: 0,
    }),
  },
  {
    type: 'addFloor',
    floor: makeFloor({
      id: 'F-T-02',
      typeId: 'ft_laje12',
      levelId: TERREO,
      boundary: [
        { x: 0, y: 0 },
        { x: 5.5, y: 0 },
        { x: 5.5, y: 5.5 },
        { x: 0, y: 5.5 },
      ],
      heightOffset: 0,
    }),
  },
];

/** Laje do pavimento 2 (15 cm + regularização = 0,17 m), pela face externa das paredes. A escada recorta o furo sozinha. */
const LAJE_PAV2: Command = {
  type: 'addSlab',
  slab: makeSlab({
    id: 'L-P2-01',
    typeId: 'ls_mac15',
    levelId: PAV2,
    boundary: [
      { x: -0.121, y: -0.121 },
      { x: 11.871, y: -0.121 },
      { x: 11.871, y: 14.121 },
      { x: -0.121, y: 14.121 },
    ],
    heightOffset: 0,
  }),
};

/** Telhado de 4 águas, 30 %, beiral a 5,80 m, balanço de 0,60 m a partir da face externa. */
const TELHADO: Command = {
  type: 'addRoof',
  roof: makeRoof({
    id: 'R-01',
    typeId: 'rt_ceramica',
    levelId: COBERTURA,
    boundary: [
      { x: -0.721, y: -0.721 },
      { x: 12.471, y: -0.721 },
      { x: 12.471, y: 14.721 },
      { x: -0.721, y: 14.721 },
    ],
    heightOffset: 0,
    shape: 'hip',
    slopePercent: 30,
    edgeSlopes: [30, 30, 30, 30],
    edgeOverhangs: [0.6, 0.6, 0.6, 0.6],
    eave: { fascia: true, fasciaHeight: 0.2, gutter: true, soffit: true },
  }),
};

/**
 * Escada reta, 17 espelhos (3,00 / 17 = 0,176 m) e 16 pisos de 0,285 m, largura 1,20 m. Eixo do 1º espelho em
 * (6,192; 2,00), subindo para o norte; é o mesmo croqui que `generateStraightRun` produz com esses valores (testado).
 * DEC-4 (C-montagem §5): o lance está entre as faces de T-I-01 (5,592) e T-I-05 (6,792), 0,092 m à direita do que era.
 */
function escada(): Command {
  const largura = 1.2;
  const piso = 0.285;
  const espelhos = 17;
  const xEsq = 5.592;
  const xDir = 6.792;
  const y0 = 2.0;
  const yAt = (i: number): number => y0 + i * piso;
  const run: StairRun = {
    id: 'ES-01-lance',
    kind: 'run',
    boundaryLeft: [{ a: { x: xEsq, y: y0 }, b: { x: xEsq, y: yAt(espelhos - 1) }, sag: 0 }],
    boundaryRight: [{ a: { x: xDir, y: y0 }, b: { x: xDir, y: yAt(espelhos - 1) }, sag: 0 }],
    risers: Array.from({ length: espelhos }, (_, i) => ({ a: { x: xEsq, y: yAt(i) }, b: { x: xEsq + largura, y: yAt(i) }, sag: 0 })),
    path: [],
    generatedBy: 'straight',
  };
  return {
    type: 'addStair',
    // Folga 0 no furo (B pedia 0,05): com 0,05 o vazio invade 4 cm do banheiro da SUÍTE 3. Ver C-montagem.md, 3.2.
    stair: makeStair({ id: 'ES-01', typeId: 'stt_monolitica', levelId: TERREO, components: [run], openingMode: 'headroom', openingMargin: 0, mark: 'ES-01' }),
  };
}

/** Elevações e cortes (B, seção 4.4). As elevações seguem o cálculo de `elevationSpecs` do app (mesmo nome: "Gerar elevações" atualiza no lugar). */
const CAIXA = { minX: -0.121, minY: -0.121, maxX: 11.871, maxY: 14.121 };
const AFASTAMENTO = 3;

function elevacoes(): SectionView[] {
  const corners: Vec2[] = [
    { x: CAIXA.minX, y: CAIXA.minY },
    { x: CAIXA.maxX, y: CAIXA.minY },
    { x: CAIXA.maxX, y: CAIXA.maxY },
    { x: CAIXA.minX, y: CAIXA.maxY },
  ];
  const cx = (CAIXA.minX + CAIXA.maxX) / 2;
  const cy = (CAIXA.minY + CAIXA.maxY) / 2;
  const w = CAIXA.maxX - CAIXA.minX;
  const h = CAIXA.maxY - CAIXA.minY;
  // Observador olha para `look`; a linha a→b tem a normal à esquerda apontando para `look`.
  const LOOKS: Array<{ nome: string; id: Id; role: SectionRole; look: Vec2 }> = [
    { nome: 'Norte', id: 'V-norte', role: 'north', look: { x: 0, y: -1 } },
    { nome: 'Sul', id: 'V-sul', role: 'south', look: { x: 0, y: 1 } },
    { nome: 'Leste', id: 'V-leste', role: 'east', look: { x: -1, y: 0 } },
    { nome: 'Oeste', id: 'V-oeste', role: 'west', look: { x: 1, y: 0 } },
  ];
  return LOOKS.map(({ nome, id, role, look: u }): SectionView => {
    const d: Vec2 = { x: u.y, y: -u.x };
    const back = Math.min(...corners.map((c) => c.x * u.x + c.y * u.y));
    const shift = back - AFASTAMENTO - (cx * u.x + cy * u.y);
    const p: Vec2 = { x: cx + u.x * shift, y: cy + u.y * shift };
    const along = Math.abs(d.x) * w + Math.abs(d.y) * h + 2 * AFASTAMENTO;
    const depth = Math.abs(u.x) * w + Math.abs(u.y) * h + 2 * AFASTAMENTO;
    return {
      id,
      name: nome,
      kind: 'elevation',
      role,
      a: { x: p.x - (d.x * along) / 2, y: p.y - (d.y * along) / 2 },
      b: { x: p.x + (d.x * along) / 2, y: p.y + (d.y * along) / 2 },
      depth,
    };
  });
}

const CORTES: SectionView[] = [
  // AA pela escada, no eixo do lance (x 6,192, DEC-4): olha para o oeste (normal à esquerda de a→b, que sobe para o norte).
  { id: 'V-AA', name: 'Corte AA', kind: 'section', a: { x: 6.192, y: -1 }, b: { x: 6.192, y: 15 }, depth: 17 },
  // BB: olha para o norte.
  { id: 'V-BB', name: 'Corte BB', kind: 'section', a: { x: -1, y: 8.5 }, b: { x: 13, y: 8.5 }, depth: 17 },
];

/** Monta a casa de alto padrão (2 pavimentos) como uma lista de comandos, no mesmo estilo de `house2`. */
export function casaAltoPadrao(cmds: Command[]): void {
  for (const c of MATERIAIS_PBR) cmds.push(c);
  for (const t of OPENING_TYPES) cmds.push({ type: 'upsertOpeningType', openingType: t });
  cmds.push(TIPO_PISO);
  for (const c of PAREDES) cmds.push(c);
  for (const c of aberturas(ABERTURAS_TERREO)) cmds.push(c);
  for (const c of aberturas(ABERTURAS_PAV2)) cmds.push(c);
  for (const c of PISOS) cmds.push(c);
  cmds.push(LAJE_PAV2);
  cmds.push({ type: 'upsertLevel', level: makeLevel({ id: COBERTURA, name: 'Cobertura', elevation: 5.8 }) });
  cmds.push(TELHADO);
  cmds.push(escada());
  for (const v of [...CORTES, ...elevacoes()]) cmds.push({ type: 'addView', view: v });
}
