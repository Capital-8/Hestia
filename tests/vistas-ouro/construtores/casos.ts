import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { floorViewId, legacyRoofViewId as roofViewId, makeRoom, type Command, type ProjectStore } from '@hestia/model';
import { ambientesDaCasa2, ambientesDaCasaPremium, casa2ComAmbientes, etiquetaDeAmbiente, lojaDoModelo, plantaDeArea, rodar } from './base.ts';
import { pranchas } from './pranchas.ts';

/**
 * Os oito casos da seção 5 do plano (docs/vistas/PLANO-MESTRE.md). Cada função devolve a loja já montada; o script
 * `scripts/vistas-ouro-projetos.mts` serializa o projeto em `tests/vistas-ouro/projetos/NN-nome.json`.
 */

/** Anotações do nível 0 da casa de 10 x 7 m: cotas (uma associativa), textos, linhas e regiões de detalhe e etiquetas. */
function anotacoesDoNivel(levelId: string, ids: string, deslocamento = 0): Command[] {
  const y = deslocamento;
  return [
    { type: 'addDimension', levelId, dimension: { id: `dm_a_${ids}`, a: { x: 0, y }, b: { x: 10, y }, offset: -1.2, refs: levelId === 'lv_0' ? { a: { wallId: 'h_w', end: 'a' }, b: { wallId: 'h_e', end: 'b' } } : undefined } },
    { type: 'addDimension', levelId, dimension: { id: `dm_b_${ids}`, a: { x: 0, y: 1 + y }, b: { x: 0, y: 6 + y }, offset: -0.8, mode: 'vertical' } },
    { type: 'addText', levelId, text: { id: `tx_${ids}`, at: { x: 5, y: 3 + y }, text: `NOTA ${ids.toUpperCase()}`, height: 3, rotation: 0 } },
    { type: 'addText', levelId, text: { id: `tx2_${ids}`, at: { x: 8, y: 5.5 + y }, text: 'Texto girado\ncom duas linhas', height: 2.5, rotation: 30, frame: true, bold: true } },
    { type: 'addDetailLine', levelId, item: { id: `dl_${ids}`, a: { x: 1, y: 1 + y }, b: { x: 9, y: 1 + y }, style: 'dashed' } },
    { type: 'addDetailLine', levelId, item: { id: `dl2_${ids}`, a: { x: 2, y: 6 + y }, b: { x: 8, y: 6 + y }, style: 'dotted' } },
    { type: 'addDetailRegion', levelId, item: { id: `dr_${ids}`, boundary: [{ x: 4.4, y: 4 + y }, { x: 6.4, y: 4 + y }, { x: 6.4, y: 5 + y }, { x: 4.4, y: 5 + y }], color: '#c0504d', mask: true } },
    { type: 'addTag', levelId, item: { id: `tg_${ids}`, hostId: 'h_s', at: { x: 5, y: -0.6 + y }, property: 'type', leader: true } },
  ];
}

/** 1. Casa de vários níveis: paredes, portas, janelas, pisos, lajes, escada, telhado e cortes (modelo da casa premium). */
export function casaDeVariosNiveis(): ProjectStore {
  return lojaDoModelo('house-premium');
}

/** 2. Cotas, textos, linhas e regiões de detalhe e etiquetas em mais de um nível. */
export function anotacoes(): ProjectStore {
  const s = casa2ComAmbientes();
  rodar(s, [...anotacoesDoNivel('lv_0', 'n0'), ...anotacoesDoNivel('lv_1', 'n1', 0.5)]);
  return s;
}

/** Esquema de cores por categoria e etiquetas de ambiente comuns aos casos de planta de área. */
function esquemaEEtiquetas(planId: string, ids: string): Command[] {
  const rooms = ambientesDaCasa2().map((c) => (c.type === 'addRoom' ? c.room : null)).filter((r) => r !== null);
  return rooms.map((r, i) => ({ type: 'addRoomTag', planId, tag: etiquetaDeAmbiente(`rt_${ids}_${i}`, planId, r!.id, { x: r!.point.x, y: r!.point.y + 0.4 }) }) satisfies Command);
}

/** 3. Planta de área SEM anotações próprias (herda as do nível), com esquema de cores, etiquetas, legenda e quadro. */
export function areaQueHerda(): ProjectStore {
  const s = casa2ComAmbientes();
  rodar(s, anotacoesDoNivel('lv_0', 'n0'));
  rodar(s, [
    { type: 'upsertColorScheme', scheme: { id: 'cs_cat', name: 'Por categoria', by: 'category' } },
    {
      type: 'addAreaPlan',
      plan: plantaDeArea({
        id: 'ap_herda',
        levelId: 'lv_0',
        schemeId: 'cs_cat',
        graphics: { ...plantaDeArea({ id: 'x', levelId: 'lv_0' }).graphics, fill: 'scheme', outline: 'dashed', showFloors: true },
        legend: { at: { x: 11, y: 6 }, title: 'Legenda', groupBy: 'category', showCount: true, showArea: true, showPercent: true },
        table: { at: { x: 11, y: 2 }, title: 'Quadro de áreas', columns: ['number', 'name', 'category', 'area', 'percent'], groupBy: 'category', totals: 'both' },
      }),
    },
    ...esquemaEEtiquetas('ap_herda', 'h'),
  ]);
  return s;
}

/** 4. Planta de área COM anotações próprias e outra com conjunto próprio vazio (`annotations: {}`). */
export function areaComAnotacoesProprias(): ProjectStore {
  const s = casa2ComAmbientes();
  rodar(s, anotacoesDoNivel('lv_0', 'n0'));
  rodar(s, [
    { type: 'upsertColorScheme', scheme: { id: 'cs_cat', name: 'Por categoria', by: 'category' } },
    { type: 'addAreaPlan', plan: plantaDeArea({ id: 'ap_propria', levelId: 'lv_0', schemeId: 'cs_cat', annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] } }) },
    { type: 'addAreaPlan', plan: plantaDeArea({ id: 'ap_vazia', levelId: 'lv_0' }) },
    // `addAreaPlan` normaliza as listas; o `{}` de arquivos antigos só se obtém por `updateAreaPlan`.
    { type: 'updateAreaPlan', id: 'ap_vazia', patch: { annotations: {} as never } },
    ...esquemaEEtiquetas('ap_propria', 'p'),
    ...anotacoesDoNivel('lv_0', 'ap', 0).map((c): Command => ({ ...c, planId: 'ap_propria' }) as Command),
  ]);
  return s;
}

/** 5. `hidden` (categoria e elemento), ocultos da cobertura e planta de área que oculta o id de uma anotação herdada do nível. */
export function ocultos(): ProjectStore {
  const s = casaDeVariosNiveis();
  rodar(s, [...ambientesDaCasaPremium(), ...anotacoesPremium()]);
  rodar(s, [
    { type: 'addAreaPlan', plan: plantaDeArea({ id: 'ap_oculta', levelId: 'lv_0' }) },
    { type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId('lv_0') }, hidden: { categories: ['window'], elements: ['T-I-04', 'T2', 'dm_prem_a'] } },
    { type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId('lv_1') }, hidden: { categories: ['room', 'annotation'] } },
    { type: 'setViewHidden', target: { kind: 'plan', viewId: roofViewId('lv_2') }, hidden: { elements: roofIds(s) } },
    { type: 'setViewHidden', target: { kind: 'plan', viewId: roofViewId('lv_0') }, hidden: { categories: ['stair'] } },
    // A planta de área herda as anotações do nível: ocultar o id da cota herdada precisa continuar valendo.
    { type: 'setViewHidden', target: { kind: 'plan', viewId: 'ap_oculta' }, hidden: { elements: ['dm_prem_a', 'r_jantar'], categories: ['floor'] } },
  ]);
  return s;
}

const roofIds = (s: ProjectStore): string[] => Object.values(s.project.elements).filter((e) => e.kind === 'roof').map((e) => e.id);

/** Cotas e texto do térreo da casa premium (ids fixos). */
function anotacoesPremium(): Command[] {
  return [
    { type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dm_prem_a', a: { x: 0, y: -0.5 }, b: { x: 11.75, y: -0.5 }, offset: -1 } },
    { type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dm_prem_b', a: { x: 12.5, y: 0 }, b: { x: 12.5, y: 14 }, offset: 0.8 } },
    { type: 'addText', levelId: 'lv_0', text: { id: 'tx_prem', at: { x: 8, y: 12 }, text: 'VARANDA GOURMET', height: 3, rotation: 0 } },
    { type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl_prem', a: { x: 0, y: 5.5 }, b: { x: 11.75, y: 5.5 }, style: 'dashed' } },
  ];
}

/** 6. Intervalo de vista e gráficos fora do padrão (escala, detalhe, estilo, estrutura parcial, substituição por categoria). */
export function faixaEGraficos(): ProjectStore {
  const s = casaDeVariosNiveis();
  rodar(s, [
    { type: 'setLevelViewRange', levelId: 'lv_0', patch: { top: 1.9, cut: 0.9, bottom: -0.2, depth: -0.6 } },
    {
      type: 'setLevelGraphics',
      levelId: 'lv_0',
      patch: {
        scale: 50,
        detail: 'fine',
        style: 'hiddenLine',
        partialStructure: 'noFinishes',
        thinLines: false,
        overrides: { wall: { halftone: true, cutWeight: 8 }, window: { color: '#d33a2c', projectionWeight: 6 }, floor: { transparency: 0.4 }, room: { visible: true, halftone: true } },
      },
    },
    { type: 'setLevelViewRange', levelId: 'lv_1', patch: { direction: 'up', cut: 1.1, top: 2.8, bottom: 0, depth: 0 } },
    { type: 'setLevelGraphics', levelId: 'lv_1', patch: { scale: 200, detail: 'coarse', style: 'wireframe', overrides: { door: { visible: false }, roof: { transparency: 0.6 } } } },
    { type: 'setLevelViewRange', levelId: 'lv_2', patch: { top: 0.5, cut: 0.2, bottom: -1.5, depth: -2 } },
    { type: 'setLevelGraphics', levelId: 'lv_2', patch: { scale: 100, detail: 'byScale', partialStructure: 'coreOnly' } },
  ]);
  return s;
}

/** 7. Pranchas com planta de piso, planta de área, quadro de áreas, corte e 3D. */
export function comPranchas(): ProjectStore {
  const s = casaDeVariosNiveis();
  rodar(s, [...ambientesDaCasaPremium(), ...anotacoesPremium()]);
  rodar(s, [
    { type: 'upsertColorScheme', scheme: { id: 'cs_cat', name: 'Por categoria', by: 'category' } },
    {
      type: 'addAreaPlan',
      plan: plantaDeArea({
        id: 'ap_prancha',
        levelId: 'lv_0',
        schemeId: 'cs_cat',
        graphics: { ...plantaDeArea({ id: 'x', levelId: 'lv_0' }).graphics, fill: 'scheme' },
        table: { at: { x: 13, y: 8 }, title: 'Quadro', columns: ['number', 'name', 'area'], groupBy: 'none', totals: 'general' },
      }),
    },
    ...ambientesDaCasaPremium().map((c, i): Command => (c.type === 'addRoom' ? { type: 'addRoomTag', planId: 'ap_prancha', tag: etiquetaDeAmbiente(`rt_pr_${i}`, 'ap_prancha', c.room.id, { x: c.room.point.x, y: c.room.point.y }) } : c)),
    ...pranchas(s.project),
  ]);
  return s;
}

/** 8. Arquivo salvo em versão antiga do esquema: o mais antigo que os testes já usam (casa real, esquema 6). */
export function legadoV6(): unknown {
  const arquivo = fileURLToPath(new URL('../../../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url));
  return JSON.parse(readFileSync(arquivo, 'utf8')) as unknown;
}

export { makeRoom };
