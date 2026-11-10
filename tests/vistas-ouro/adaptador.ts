/**
 * ADAPTADOR DO OURO: o único arquivo do ouro que conhece a forma interna do projeto e a API de render, DXF, seleção e
 * quantitativos. Todo o resto (`projetos/*.json`, `serializar.ts`, `ouro.spec.ts`, o ouro gravado) fala só em
 * chaves lógicas de vista e em textos. Quando a API interna mudar (vistas como entidade), é este arquivo que se reescreve,
 * sem tocar nos JSON nem no ouro.
 *
 * Chaves lógicas (sobrevivem à mudança de esquema): `floor:<levelId>`, `roof:<levelId>`, `area:<areaPlanId>`, `sheet:<sheetId>`.
 *
 * Cada saída é gerada pela MESMA função de produção que o programa usa:
 *  - lista de desenho da planta: `planFrameUpdateOf(...).geometry()` + `resolverZoom` (packages/render/src/plan/planFrame.ts, zoomOps.ts);
 *  - DXF: `planDxf` e `areaPlanDxf` (apps/web/src/editor/dxfExport.ts, dxfAreaPlan.ts) e `sheetDxf` (dxfSheet.ts);
 *  - prancha: `buildSheetDrawList` (packages/render/src/sheet/build.ts);
 *  - seleção: `SelectTool` (packages/tools/src/selectTool.ts), com clique numa grade de pontos;
 *  - ocultos: `visibilityOf` (apps/web/src/editor/viewVisibility.ts) e `planViewOf(...).hidden` (packages/render/src/plan/view.ts);
 *  - avisos: `viewRangeWarnings` (packages/engine/src/viewWarnings.ts);
 *  - quantitativos: `quantifyLevel`, `build*Schedule`, `areaTableRows`, `areaLegendRows` (packages/engine/src).
 */
import {
  areaLegendRows,
  areaTableRows,
  buildCeilingSchedule,
  buildFloorSchedule,
  buildOpeningSchedule,
  buildRampSchedule,
  buildRoofSchedule,
  buildRoomSchedule,
  buildSlabSchedule,
  buildStairSchedule,
  buildWallSchedule,
  quantifyLevel,
  resolveLevel,
  viewRangeWarnings,
} from '@hestia/engine';
import { migrateProject, ProjectStore, viewRangeOf, type AreaPlan, type Project } from '@hestia/model';
import { buildSheetDrawList, contextoDaVista, levelFrameBox, LIGHT, planViewOf, resolverZoom } from '@hestia/render';
import { createTool } from '@hestia/tools';
import { planFrameUpdateOf } from '../../packages/render/src/plan/planFrame.ts';
import { makeEnv, P } from '../../packages/tools/src/testEnv.ts';
import { areaPlanDxf, planDxf } from '../../apps/web/src/editor/dxfExport.ts';
import { sheetDxf } from '../../apps/web/src/editor/dxfSheet.ts';
import { thinLinesOn } from '../../apps/web/src/editor/graphicsActions.ts';
import { visibilityOf } from '../../apps/web/src/editor/viewVisibility.ts';
import { texto } from './serializar.ts';

/** Saídas de uma vista (ou do projeto): nome da saída → texto. */
export type Saidas = Record<string, string>;

type Tipo = 'floor' | 'roof' | 'area' | 'sheet';

const LANG = 'pt';
const ZOOM = 100;
/** Metros por pixel do clique (tolerância de acerto): o mesmo `1 / zoom` da vista. */
const MPP = 1 / ZOOM;

/** Abre o JSON pela função de abertura/migração de produção (esquemas antigos sobem até o atual). */
export function abrirProjeto(json: unknown): Project {
  return migrateProject(structuredClone(json));
}

const areaPlans = (p: Project): AreaPlan[] => p.areaPlans ?? [];

/** Chaves lógicas das vistas do projeto, em ordem estável. */
export function chavesDasVistas(p: Project): string[] {
  const chaves = [
    ...p.levels.flatMap((l) => [`floor:${l.id}`, `roof:${l.id}`]),
    ...areaPlans(p).map((a) => `area:${a.id}`),
    ...(p.sheets ?? []).map((s) => `sheet:${s.id}`),
  ];
  return chaves.sort();
}

function partes(chave: string): { tipo: Tipo; id: string } {
  const i = chave.indexOf(':');
  return { tipo: chave.slice(0, i) as Tipo, id: chave.slice(i + 1) };
}

/** Saídas de uma vista, pela chave lógica. */
export function saidasDaVista(p: Project, chave: string): Saidas {
  const { tipo, id } = partes(chave);
  if (tipo === 'sheet') return saidasDaPrancha(p, id);
  if (tipo === 'area') {
    const plano = areaPlans(p).find((a) => a.id === id);
    if (!plano) throw new Error(`Vista inexistente: ${chave}`);
    return saidasDePlanta(p, 'area', plano.levelId, plano);
  }
  return saidasDePlanta(p, tipo, id);
}

// ---------------------------------------------------------------------------------------------------------------------
// Plantas (piso, cobertura e área)
// ---------------------------------------------------------------------------------------------------------------------

function saidasDePlanta(p: Project, tipo: 'floor' | 'roof' | 'area', levelId: string, plano?: AreaPlan): Saidas {
  const out: Saidas = {
    lista: protegido(() => listaDeDesenho(p, tipo, levelId, plano)),
    selecao: protegido(() => selecao(p, levelId, plano)),
    ocultos: protegido(() => ocultos(p, tipo, levelId, plano)),
  };
  if (tipo === 'floor') out.dxf = protegido(() => planDxf(p, levelId, true, undefined, LANG));
  if (tipo === 'area') out.dxf = protegido(() => areaPlanDxf(p, plano!.id, undefined, LANG));
  if (tipo !== 'roof') out.avisos = protegido(() => texto(viewRangeWarnings(p, levelId, viewRangeOf(p, levelId), contextoDaVista(p, levelId), LANG), 2));
  if (tipo === 'area') out.quantitativos = protegido(() => texto({ tabela: areaTableRows(p, plano!, LANG), legenda: areaLegendRows(p, plano!, LANG) }, 3));
  return out;
}

/** Uma falha de produção vira o texto do ouro (a falha também é comportamento a não mudar). */
function protegido(f: () => string): string {
  try {
    return f();
  } catch (e) {
    return `ERRO: ${(e as Error).message.split('\n')[0]}\n`;
  }
}

/** Estado de interface mínimo que `visibilityOf` lê (`view`, tipo de planta, nível, planta de área, corte, temporários). */
function estadoDeInterface(tipo: 'floor' | 'roof' | 'area', levelId: string, plano?: AreaPlan): Parameters<typeof visibilityOf>[1] {
  return { view: 'plan', planKind: tipo, levelId, areaPlanId: plano?.id ?? null, sectionId: null, viewTemp: {} } as unknown as Parameters<typeof visibilityOf>[1];
}

/** Enquadramento fixo (mesmo para todas as vistas do projeto): caixa de todos os níveis, zoom 100 px/m. */
function viewportDoProjeto(p: Project): { cx: number; cy: number; zoom: number; width: number; height: number } {
  const caixas = p.levels.map((l) => levelFrameBox(p, l.id)).filter((b) => b !== null);
  const b = caixas.length
    ? { minX: Math.min(...caixas.map((c) => c!.minX)), minY: Math.min(...caixas.map((c) => c!.minY)), maxX: Math.max(...caixas.map((c) => c!.maxX)), maxY: Math.max(...caixas.map((c) => c!.maxY)) }
    : { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, zoom: ZOOM, width: Math.max(400, (b.maxX - b.minX) * ZOOM + 200), height: Math.max(300, (b.maxY - b.minY) * ZOOM + 200) };
}

/** Lista de desenho como a tela monta: geometria do quadro (`planFrameUpdateOf`) resolvida para o zoom. */
function listaDeDesenho(p: Project, tipo: 'floor' | 'roof' | 'area', levelId: string, plano?: AreaPlan): string {
  const vis = visibilityOf(p, estadoDeInterface(tipo, levelId, plano));
  const v = viewportDoProjeto(p);
  const quadro = planFrameUpdateOf({
    project: p,
    version: 0,
    levelId,
    v,
    theme: LIGHT,
    dark: false,
    gpu: false,
    showGrid: false,
    underlayLevel: null,
    showUnderlay: true,
    showRoofProjection: true,
    thinLines: thinLinesOn(p, { levelId }),
    selection: [],
    hover: null,
    aviso: null,
    preview: [],
    inference: null,
    hidden: vis.hidden,
    revealed: vis.revealed,
    resolve: (id) => resolveLevel(p, id),
    roofPlanMode: tipo === 'roof',
    areaPlan: plano,
    lang: LANG,
  });
  const ops = resolverZoom(quadro.geometry(), v.zoom);
  return texto({ fills: ops.fills, strokes: ops.strokes, labels: ops.labels }, 2);
}

/** Ids que a vista esconde: pelo usuário (Hide in View, categorias) e pelo alcance/categoria da vista (captura). */
function ocultos(p: Project, tipo: 'floor' | 'roof' | 'area', levelId: string, plano?: AreaPlan): string {
  const vis = visibilityOf(p, estadoDeInterface(tipo, levelId, plano));
  const alcance = tipo === 'roof' ? new Set<string>() : planViewOf(p, levelId).hidden;
  return texto({ usuario: [...vis.hidden].sort(), alcanceECategoria: [...alcance].sort() }, 1);
}

// ---------------------------------------------------------------------------------------------------------------------
// Seleção: clique em grade de pontos
// ---------------------------------------------------------------------------------------------------------------------

/** Vec2 soltos no JSON de `fontes` e pontos médios de pares `a`/`b`: as sondas de seleção sobre o conteúdo da vista. */
function sondasDe(fontes: unknown[]): Array<{ x: number; y: number }> {
  const achados = new Map<string, { x: number; y: number }>();
  const ehPonto = (o: unknown): o is { x: number; y: number } => !!o && typeof o === 'object' && typeof (o as { x?: unknown }).x === 'number' && typeof (o as { y?: unknown }).y === 'number';
  const guardar = (q: { x: number; y: number }): void => {
    const x = Math.round(q.x * 1000) / 1000;
    const y = Math.round(q.y * 1000) / 1000;
    achados.set(`${x},${y}`, { x, y });
  };
  const anda = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    if (ehPonto(o)) return guardar(o);
    const r = o as Record<string, unknown>;
    if (ehPonto(r.a) && ehPonto(r.b)) guardar({ x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 });
    for (const k of Object.keys(r).sort()) anda(r[k]);
  };
  fontes.forEach(anda);
  return [...achados.values()];
}

/** Pontos de teste: grade regular sobre a caixa do nível (passo ≥ 0,25 m, no máximo ~1500 pontos) e as sondas do conteúdo. */
function pontosDeTeste(p: Project, levelId: string, plano?: AreaPlan): Array<{ x: number; y: number }> {
  const caixa = levelFrameBox(p, levelId) ?? { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const pad = 1;
  const larg = caixa.maxX - caixa.minX + 2 * pad;
  const alt = caixa.maxY - caixa.minY + 2 * pad;
  const passo = Math.max(0.25, Math.ceil(Math.sqrt((larg * alt) / 1500) * 20) / 20);
  const pontos = new Map<string, { x: number; y: number }>();
  for (let x = Math.floor((caixa.minX - pad) / passo) * passo; x <= caixa.maxX + pad; x += passo) {
    for (let y = Math.floor((caixa.minY - pad) / passo) * passo; y <= caixa.maxY + pad; y += passo) {
      const q = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
      pontos.set(`${q.x},${q.y}`, q);
    }
  }
  const doNivel = Object.values(p.elements).filter((e) => (e as { levelId?: string }).levelId === levelId);
  for (const q of sondasDe([doNivel, p.levels.find((l) => l.id === levelId), plano])) pontos.set(`${q.x},${q.y}`, q);
  return [...pontos.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

/** Ids que a ferramenta Selecionar acerta em cada ponto (clique com a vista da planta, sem modificadores). */
function selecao(p: Project, levelId: string, plano?: AreaPlan): string {
  const ctx = makeEnv(new ProjectStore(p));
  const env = {
    ...ctx.env,
    project: () => p,
    levelId: () => levelId,
    areaPlanId: () => plano?.id ?? null,
    metersPerPixel: () => MPP,
    viewScale: () => plano?.scale ?? 100,
    hiddenInView: () => planViewOf(p, levelId).hidden,
  };
  const ferramenta = createTool('select', env);
  ferramenta.start();
  const acertos: Record<string, string[]> = {};
  const pontos = pontosDeTeste(p, levelId, plano);
  for (const q of pontos) {
    env.setSelection([]);
    const ptr = P(q.x, q.y);
    ferramenta.move(ptr);
    ferramenta.down?.(ptr);
    ferramenta.up?.(ptr);
    const ids = [...env.selection()].sort();
    if (ids.length) acertos[`${q.x},${q.y}`] = ids;
    ferramenta.cancel();
  }
  const porId: Record<string, number> = {};
  for (const ids of Object.values(acertos)) for (const id of ids) porId[id] = (porId[id] ?? 0) + 1;
  return texto({ pontos: pontos.length, acertosPorId: porId, acertos }, 2);
}

// ---------------------------------------------------------------------------------------------------------------------
// Pranchas e projeto
// ---------------------------------------------------------------------------------------------------------------------

function saidasDaPrancha(p: Project, sheetId: string): Saidas {
  return {
    prancha: protegido(() => {
      const lista = buildSheetDrawList(p, sheetId, LANG);
      if (!lista) throw new Error(`Prancha inexistente: ${sheetId}`);
      return texto(lista, 4);
    }),
    dxf: protegido(() => sheetDxf(p, sheetId, { units: 'mm', lang: LANG })),
  };
}

/** Quantitativos do projeto: por nível (paredes e camadas) e as tabelas do projeto. */
export function saidasDoProjeto(p: Project): Saidas {
  return {
    quantitativos: protegido(() =>
      texto(
        {
          niveis: Object.fromEntries(p.levels.map((l) => [l.id, quantifyLevel(p, resolveLevel(p, l.id))])),
          paredes: buildWallSchedule(p, LANG),
          aberturas: buildOpeningSchedule(p, LANG),
          ambientes: buildRoomSchedule(p),
          pisos: buildFloorSchedule(p),
          lajes: buildSlabSchedule(p),
          telhados: buildRoofSchedule(p, LANG),
          escadas: buildStairSchedule(p),
          rampas: buildRampSchedule(p),
          forros: buildCeilingSchedule(p),
        },
        3,
      ),
    ),
  };
}
