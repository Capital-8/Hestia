import {
  compositionCells,
  compositionKind,
  isOpening,
  leafSizeOf,
  nominalCellOf,
  openingCompositionOf,
  openingSpanOf,
  openingFamilyName,
  openingFamilyOf,
  openingHandleHeight,
  openingHeight,
  openingHinges,
  openingLeafUndercut,
  openingLintel,
  openingOptionSupport,
  openingRough,
  openingSill,
  openingSillBeam,
  openingThreshold,
  openingType,
  formatQuantity,
  spanTypeOf,
  type CellNode,
  type CompositionNode,
  type Id,
  type Opening,
  type OpeningComposition,
  type OpeningLeaves,
  type OpeningLintel,
  type OpeningType,
  type Project,
  type ResolvedUnits,
  unitsOf,
} from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import { areaDoVaoDoTipo } from './furoContornoParede.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { collationFor, t, type EngineScheduleKey, type Lang } from './i18n.ts';
import { openingExtraCsvCell, openingExtraCsvHeader, openingOwnMeasureText, openingRowLabel, type OpeningExtraKey } from './openingScheduleExtras.ts';
import { OPENING_EXEC_KEYS, espelhada, execFieldsOf, openingExecCsvCell, openingExecCsvTotal, openingExecHeader, type OpeningExecFields } from './openingScheduleExec.ts';
import { buildOpeningPartsSchedule, type OpeningPartsRow } from './openingPartQuantities.ts';

/**
 * Uma linha da tabela de portas e janelas: um TIPO de abertura (Revit: Type) com a contagem das instâncias dele que têm
 * a MESMA medida efetiva (largura, altura e peitoril das instâncias). Instância com altura ou peitoril próprios vira
 * linha à parte, com o desvio em `variant` (Revit: linhas por tipo e medida). É aqui que aparece o código do tipo
 * (Revit: Type Mark). Valores em metros (SI).
 */
export interface OpeningScheduleRow {
  typeId: Id;
  kind: 'door' | 'window';
  /** Código do tipo (Revit: Type Mark), como "P-01"; vazio quando não informado. */
  code: string;
  typeName: string;
  /** Desvio do tipo nesta linha ("altura própria 1,84 m"); vazio quando as instâncias seguem o tipo. */
  variant: string;
  /** Nome da família (openingFamilyName), como "Porta de giro"; vazio quando a combinação (símbolo × folhas) não existe. */
  familyName: string;
  /** Vão (m): com `nominalRef` 'leaf' é a folha mais a folga; nos demais, o próprio `width`/`height` do tipo. */
  width: number;
  /** Altura efetiva das instâncias desta linha (m): a do tipo, ou a altura própria da instância (`heightOverride`). */
  height: number;
  /** Folha nominal (m): a "80 x 210" do comércio. Igual ao vão menos a folga quando o tipo é dado pelo vão. */
  leafWidth: number;
  leafHeight: number;
  /** Vão bruto (furo na parede): largura e altura do tipo mais a folga `roughOversize`. */
  roughWidth: number;
  roughHeight: number;
  /** Peitoril efetivo das instâncias desta linha (m): o do tipo, ou o peitoril próprio da instância. */
  sill: number;
  leaves: OpeningLeaves;
  /** Verga e contraverga do tipo (transpasse e altura); null quando o tipo não as tem. */
  lintel: OpeningLintel | null;
  sillBeam: OpeningLintel | null;
  /** Comprimento total das peças no projeto (m) = (largura + 2 × transpasse) × quantidade. */
  lintelLength: number;
  sillBeamLength: number;
  /** Quantidade de instâncias desta linha (mesmo tipo e mesma medida efetiva) no projeto. */
  count: number;
  /** Área do vão unitária (metros quadrados) = largura × altura. */
  unitArea: number;
  /** Área do vão total (metros quadrados) = unitArea × count. */
  totalArea: number;
  /** Material do batente (nome do material do tipo); vazio quando o material não existe no projeto. */
  frameMaterial: string;
  /** Sentido de abertura das instâncias do tipo, distintos e separados por "; "; vazio no vão livre (sem folha). */
  sense: string;
  /** Material da folha (nome do material do tipo, `leafMaterialId`); vazio quando o tipo não informa ou o material não existe. */
  leafMaterial: string;
  /** Ferragens que a família do tipo oferece (openingSupport), em texto curto; vazio quando nada se aplica (vão livre, janela).
   * Em composição de 2+ células, só as das células `leaf`. */
  hardware: string;
  /** Resumo da composição de 2+ células ("porta + 2 laterais + bandeira superior"); vazio com uma célula só. */
  composition: string;
  /** Colunas opcionais (só aparecem no diálogo quando ligadas): dados do tipo, sem efeito no cálculo. */
  fireRating: string;
  acousticRw: number | null;
  uValue: number | null;
  description: string;
  manufacturer: string;
  /** Custo unitário do tipo; null quando o tipo não tem custo. */
  unitCost: number | null;
  /** Custo total da linha = custo unitário × quantidade; null sem custo unitário. */
  totalCost: number | null;
  /** Fator solar: só janela (null nas portas e quando o tipo não informa). */
  solarFactor: number | null;
  /** Quadro executivo (só com `executivo: true`): contorno, sistema, vidro, ferragens por unidade e peças. */
  exec?: OpeningExecFields;
}

/** Opções do quadro. `executivo` separa as espelhadas em linha própria e liga as colunas executivas (ausente = quadro padrão). */
export interface OpeningScheduleOptions {
  executivo?: boolean;
}

export interface OpeningScheduleTotals {
  /** Instâncias no total (portas + janelas). */
  count: number;
  /** Instâncias de porta. */
  doorCount: number;
  /** Instâncias de janela. */
  windowCount: number;
  /** Área de vão total (metros quadrados). */
  totalArea: number;
  /** Custo total (soma dos custos totais das linhas que têm custo). */
  totalCost: number;
}

export interface OpeningSchedule {
  rows: OpeningScheduleRow[];
  totals: OpeningScheduleTotals;
}

/** Filtro da tabela: só portas, só janelas, ou tudo. */
export interface OpeningScheduleFilter {
  kind?: 'door' | 'window';
}

/**
 * Sentido de uma instância: dobradiça (flipHand) e lado para onde a folha gira em relação ao eixo a→b da parede
 * (flipFacing; `true` gira para a direita de a→b, como em templateCasaAltoPadrao.ts).
 */
const senseText = (o: Opening, lang: Lang): string =>
  t(lang, 'egs_opening_sense', {
    hinge: t(lang, o.flipHand ? 'egs_opening_hinge_reverse' : 'egs_opening_hinge_standard'),
    side: t(lang, o.flipFacing ? 'egs_opening_side_right' : 'egs_opening_side_left'),
  });

/**
 * Ferragens do tipo, só as que a família oferece (openingSupport): maçaneta com a altura, dobradiças, folga inferior e
 * soleira. Ex.: "maçaneta a 1,00 m; 3 dobradiças; folga inferior 7 mm".
 */
function hardwareText(ot: OpeningType, u: ResolvedUnits, lang: Lang): string {
  const sup = openingOptionSupport(openingFamilyOf(ot)?.id);
  const parts: string[] = [];
  if (sup.handle) parts.push(t(lang, 'egs_opening_handle_at', { height: formatQuantity(u, 'length', openingHandleHeight(ot), { decimals: 2 }) }));
  const hinges = openingHinges(ot);
  if (sup.hinges && hinges > 0) parts.push(t(lang, hinges === 1 ? 'egs_opening_hinges_one' : 'egs_opening_hinges_many', { n: hinges }));
  if (sup.leafUndercut) parts.push(t(lang, 'egs_opening_undercut', { value: formatQuantity(u, 'smallLength', openingLeafUndercut(ot), { decimals: 1 }) }));
  const sill = sup.threshold ? openingThreshold(ot) : null;
  if (sill) parts.push(t(lang, 'egs_opening_threshold', { value: formatQuantity(u, 'smallLength', sill.thickness, { decimals: 1 }) }));
  return parts.join('; ');
}

/** Ferragens de uma composição: só as das células `leaf`, cada uma como um tipo de uma folha, sem repetir (sem soleira: é do quadro). */
function compositionHardware(ot: OpeningType, cells: CellNode[], u: ResolvedUnits, lang: Lang): string {
  const texts = cells.flatMap((x) => (x.content.kind === 'leaf' ? [x.content] : []));
  const parts = texts.map((l) => hardwareText({ ...ot, ...l.options, plan: l.plan, leaves: l.leaves, threshold: undefined }, u, lang));
  return [...new Set(parts.filter((x) => x !== ''))].join(' / ');
}

/** Nome do módulo numa composição de janela ("fixa + abrir"). */
const MODULE_KEY: Record<CellNode['content']['kind'], EngineScheduleKey> = {
  leaf: 'egs_opening_cell_leaf',
  glass: 'egs_opening_cell_fixed',
  panel: 'egs_opening_cell_panel',
  louver: 'egs_opening_cell_louver',
};

/** Lado de uma peça fora da célula principal: lateral (divisão em colunas), superior ou inferior (em linhas). */
type Side = 'side' | 'above' | 'below';
const SIDE_ORDER: Record<Side, number> = { side: 0, above: 1, below: 2 };
/** Chave do nome do grupo de peças por lado e tipo de célula: [singular, plural]; conjunto = divisão aninhada. */
const PART_KEYS: Record<Side, Record<string, [EngineScheduleKey, EngineScheduleKey]>> = {
  side: {
    leaf: ['egs_opening_part_side_leaf_one', 'egs_opening_part_side_leaf_many'],
    glass: ['egs_opening_part_side_glass_one', 'egs_opening_part_side_glass_many'],
    panel: ['egs_opening_part_side_panel_one', 'egs_opening_part_side_panel_many'],
    louver: ['egs_opening_part_side_louver_one', 'egs_opening_part_side_louver_many'],
    other: ['egs_opening_part_side_other_one', 'egs_opening_part_side_other_many'],
  },
  above: {
    leaf: ['egs_opening_part_above_leaf_one', 'egs_opening_part_above_leaf_many'],
    glass: ['egs_opening_part_above_glass_one', 'egs_opening_part_above_glass_many'],
    panel: ['egs_opening_part_above_panel_one', 'egs_opening_part_above_panel_many'],
    louver: ['egs_opening_part_above_louver_one', 'egs_opening_part_above_louver_many'],
    other: ['egs_opening_part_above_other_one', 'egs_opening_part_above_other_many'],
  },
  below: {
    leaf: ['egs_opening_part_below_leaf_one', 'egs_opening_part_below_leaf_many'],
    glass: ['egs_opening_part_below_glass_one', 'egs_opening_part_below_glass_many'],
    panel: ['egs_opening_part_below_panel_one', 'egs_opening_part_below_panel_many'],
    louver: ['egs_opening_part_below_louver_one', 'egs_opening_part_below_louver_many'],
    other: ['egs_opening_part_below_other_one', 'egs_opening_part_below_other_many'],
  },
};

const containsCell = (n: CompositionNode, id: string): boolean => (n.kind === 'cell' ? n.id === id : n.children.some((ch) => containsCell(ch.node, id)));

/** Peças ao redor da célula `mainId`, de cada divisão do caminho até ela (colunas: laterais; linhas: acima ou abaixo). */
function outerParts(n: CompositionNode, mainId: string, out: Array<[Side, string]>): void {
  if (n.kind === 'cell') return;
  const idx = n.children.findIndex((ch) => containsCell(ch.node, mainId));
  if (idx < 0) return;
  n.children.forEach((ch, j) => {
    if (j === idx) return;
    const kind = ch.node.kind === 'cell' ? ch.node.content.kind : 'other';
    out.push([n.axis === 'cols' ? 'side' : j > idx ? 'above' : 'below', kind]);
  });
  outerParts(n.children[idx]!.node, mainId, out);
}

/**
 * Resumo legível de uma composição de 2+ células: porta com a folha como principal ("porta + 2 laterais + bandeira
 * superior"); janela, módulo a módulo ("janela 2 módulos (fixa + abrir)"). Vazio com uma célula só.
 */
export function compositionSummary(c: OpeningComposition, lang: Lang = 'pt'): string {
  const cells = compositionCells(c);
  if (cells.length < 2) return '';
  const nominal = nominalCellOf(c);
  const leaf = nominal?.content.kind === 'leaf' ? nominal : cells.find((x) => x.content.kind === 'leaf');
  if (compositionKind(c) === 'window' || !leaf) {
    return t(lang, 'egs_opening_window_modules', {
      n: cells.length,
      modules: cells.map((x) => t(lang, MODULE_KEY[x.content.kind])).join(' + '),
    });
  }
  const parts: Array<[Side, string]> = [];
  outerParts(c.layout, leaf.id, parts);
  parts.sort((a, b) => SIDE_ORDER[a[0]] - SIDE_ORDER[b[0]]);
  const groups = new Map<string, number>();
  for (const [side, kind] of parts) groups.set(`${side}|${kind}`, (groups.get(`${side}|${kind}`) ?? 0) + 1);
  const texts = [...groups].map(([key, n]) => {
    const [side, kind] = key.split('|') as [Side, string];
    const [one, many] = PART_KEYS[side][kind] ?? PART_KEYS[side].other!;
    return n === 1 ? t(lang, one) : t(lang, 'egs_opening_part_group', { n, part: t(lang, many) });
  });
  return [t(lang, 'egs_opening_part_door'), ...texts].join(' + ');
}

/** Ordem das categorias na tabela: portas antes de janelas. */
const kindOrder = (k: 'door' | 'window'): number => (k === 'door' ? 0 : 1);

/**
 * Ordenação estável: portas antes de janelas; dentro da categoria, pelo código, depois pelo nome e pelo id do tipo; as
 * linhas de um mesmo tipo seguem a medida efetiva (altura, depois peitoril).
 */
function compareRows(a: OpeningScheduleRow, b: OpeningScheduleRow, lang: Lang): number {
  if (a.kind !== b.kind) return kindOrder(a.kind) - kindOrder(b.kind);
  const collation = collationFor(lang);
  const byCode = a.code.localeCompare(b.code, collation, { numeric: true });
  if (byCode !== 0) return byCode;
  const byName = a.typeName.localeCompare(b.typeName, collation, { numeric: true });
  if (byName !== 0) return byName;
  const byType = a.typeId.localeCompare(b.typeId, collation);
  if (byType !== 0) return byType;
  return a.height - b.height || a.sill - b.sill || Number(a.exec?.mirrored ?? false) - Number(b.exec?.mirrored ?? false);
}

/** Instâncias de um mesmo tipo com a mesma medida efetiva (altura e peitoril): viram uma linha do quadro. */
interface MeasureGroup {
  typeId: Id;
  height: number;
  sill: number;
  count: number;
  senses: Set<string>;
  /** Espelhada: só separa a linha no modo executivo. */
  mirrored: boolean;
}

/** Linha do quadro de um grupo (tipo × medida efetiva): os campos do tipo mais a contagem e as áreas do grupo. */
function rowOf(p: Project, g: MeasureGroup, u: ResolvedUnits, lang: Lang, ctxExec: { parts: OpeningPartsRow | null } | null): OpeningScheduleRow {
  const raw = p.openingTypes[g.typeId]!;
  const ot = { ...spanTypeOf(raw), ...openingSpanOf(raw) }; // vão: a composição manda quando há 2+ células
  const leaf = leafSizeOf(raw);
  const rough = openingRough({ ...ot, height: g.height });
  const lintel = openingLintel(ot);
  const sillBeam = openingSillBeam(ot);
  const unitArea = areaDoVaoDoTipo(ot, g.height);
  const comp = openingCompositionOf(raw);
  const cells = compositionCells(comp);
  const multi = cells.length >= 2;
  const unitCost = raw.cost ?? null;
  const variant = openingOwnMeasureText(u, lang, { height: g.height, sill: g.sill }, { height: ot.height, sill: ot.sill });
  const composition = multi ? compositionSummary(comp, lang) : '';
  const hardware = multi ? compositionHardware(ot, cells, u, lang) : hardwareText(ot, u, lang);
  return {
    typeId: g.typeId,
    kind: ot.kind,
    code: ot.code ?? '',
    typeName: ot.name,
    variant,
    familyName: openingFamilyName(ot) ?? '',
    width: ot.width,
    height: g.height,
    leafWidth: leaf.width,
    // A folha segue o vão: a altura própria da instância desloca a folha pela mesma diferença (a folga não muda).
    leafHeight: Math.max(0, leaf.height + (g.height - ot.height)),
    roughWidth: rough.width,
    roughHeight: rough.height,
    sill: g.sill,
    leaves: ot.leaves,
    lintel,
    sillBeam,
    lintelLength: lintel ? (ot.width + 2 * lintel.over) * g.count : 0,
    sillBeamLength: sillBeam ? (ot.width + 2 * sillBeam.over) * g.count : 0,
    count: g.count,
    unitArea,
    totalArea: unitArea * g.count,
    frameMaterial: p.materials[ot.frameMaterialId]?.name ?? '',
    sense: ot.leaves === 0 ? '' : [...g.senses].join('; '),
    leafMaterial: (ot.leafMaterialId && p.materials[ot.leafMaterialId]?.name) || '',
    hardware,
    composition,
    fireRating: raw.fireRating ?? '',
    acousticRw: raw.acousticRw ?? null,
    uValue: raw.uValue ?? null,
    description: raw.description ?? '',
    manufacturer: raw.manufacturer ?? '',
    unitCost,
    totalCost: unitCost === null ? null : unitCost * g.count,
    solarFactor: ot.kind === 'window' ? (raw.solarFactor ?? null) : null,
    ...(ctxExec
      ? { exec: execFieldsOf({ raw, ot, height: g.height, count: g.count, mirrored: g.mirrored, variant, composition, description: raw.description ?? '', parts: ctxExec.parts, lang, units: u }) }
      : {}),
  };
}

/**
 * Tabela de portas e janelas do projeto: uma linha por TIPO e medida efetiva (portas e janelas juntos, ordenados), com a
 * quantidade de instâncias. A medida efetiva é a da instância: altura (`heightOverride`) e peitoril (`sillOverride`)
 * próprios viram linha à parte. Tipo de abertura inexistente não conta (a instância aponta para um tipo ausente).
 */
export function buildOpeningSchedule(p: Project, lang: Lang = 'pt', opts: OpeningScheduleOptions = {}): OpeningSchedule {
  const u = unitsOf(p, lang);
  const executivo = opts.executivo === true;
  const groups = new Map<string, MeasureGroup>();
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e)) continue;
    if (!p.openingTypes[e.typeId]) continue;
    const span = openingType(p, e);
    const height = openingHeight(span, e);
    const sill = openingSill(span, e);
    const mirrored = executivo && espelhada(e);
    const key = `${e.typeId}|${height}|${sill}${mirrored ? '|espelhada' : ''}`;
    const g = groups.get(key) ?? { typeId: e.typeId, height, sill, count: 0, senses: new Set<string>(), mirrored };
    g.count += 1;
    g.senses.add(senseText(e, lang));
    groups.set(key, g);
  }
  // Quadro de peças: uma medida por tipo, na medida efetiva (a peça não depende do sentido, então vale para as espelhadas).
  const pecas = executivo ? new Map(buildOpeningPartsSchedule(p).map((r) => [`${r.typeId}|${r.height}|${r.sill}`, r])) : null;
  const rows = [...groups.values()].map((g) => rowOf(p, g, u, lang, pecas ? { parts: pecas.get(`${g.typeId}|${g.height}|${g.sill}`) ?? null } : null));
  if (executivo) {
    const porTipo = new Map<Id, number>();
    for (const r of rows) porTipo.set(r.typeId, (porTipo.get(r.typeId) ?? 0) + r.count);
    for (const r of rows) if (r.exec) r.exec.typeCount = porTipo.get(r.typeId) ?? r.count;
  }
  rows.sort((a, b) => compareRows(a, b, lang));
  return { rows, totals: sumOpeningRows(rows) };
}

/** Linhas que passam pelo filtro de categoria (sem filtro, portas e janelas). */
export const filterOpeningRows = (rows: OpeningScheduleRow[], f: OpeningScheduleFilter): OpeningScheduleRow[] =>
  rows.filter((r) => f.kind === undefined || r.kind === f.kind);

/** Somatórios de um conjunto de linhas (o da tabela inteira ou só o filtrado). */
export function sumOpeningRows(rows: OpeningScheduleRow[]): OpeningScheduleTotals {
  return rows.reduce<OpeningScheduleTotals>(
    (t, r) => ({
      count: t.count + r.count,
      doorCount: t.doorCount + (r.kind === 'door' ? r.count : 0),
      windowCount: t.windowCount + (r.kind === 'window' ? r.count : 0),
      totalArea: t.totalArea + r.totalArea,
      totalCost: t.totalCost + (r.totalCost ?? 0),
    }),
    { count: 0, doorCount: 0, windowCount: 0, totalArea: 0, totalCost: 0 },
  );
}

const csvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_codigo'),
  t(lang, 'egs_csv_col_tipo'),
  t(lang, 'egs_csv_col_familia'),
  t(lang, 'egs_csv_col_categoria'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_largura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_altura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_largura_bruta'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_altura_bruta'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_peitoril'), 'length'),
  t(lang, 'egs_csv_col_folhas'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_verga'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_contraverga'), 'length'),
  t(lang, 'egs_csv_col_quantidade'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area_unitaria'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area_total'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_folha_largura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_folha_altura'), 'length'),
  t(lang, 'egs_csv_col_material_do_batente'),
  t(lang, 'egs_csv_col_sentido'),
  t(lang, 'egs_csv_col_material_da_folha'),
  t(lang, 'egs_csv_col_ferragens'),
];

/**
 * CSV com separador ';', decimal do idioma (ou o do projeto), cabeçalho no idioma ativo e BOM UTF-8 (o mesmo formato das
 * outras tabelas). Uma linha por tipo, seguida de uma linha de total (quantidade de instâncias e área total). `extra` são as
 * colunas opcionais ligadas, na ordem em que saem depois da composição; sem elas, o CSV é o de sempre.
 */
export function openingScheduleToCsv(rows: OpeningScheduleRow[], totals: OpeningScheduleTotals, units: ResolvedUnits, lang: Lang = 'pt', extra: readonly OpeningExtraKey[] = [], executivo = false): string {
  const n = (q: 'length' | 'area' | 'currency', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const withComposition = rows.some((r) => r.composition !== '');
  const body = rows.map((r) => [
    csvText(r.code),
    csvText(openingRowLabel(r)),
    csvText(r.familyName),
    t(lang, r.kind === 'door' ? 'egs_opening_cat_door' : 'egs_opening_cat_window'),
    n('length', r.width, 2),
    n('length', r.height, 2),
    n('length', r.roughWidth, 2),
    n('length', r.roughHeight, 2),
    n('length', r.sill, 2),
    String(r.leaves),
    n('length', r.lintelLength, 2),
    n('length', r.sillBeamLength, 2),
    String(r.count),
    n('area', r.unitArea, 2),
    n('area', r.totalArea, 2),
    n('length', r.leafWidth, 2),
    n('length', r.leafHeight, 2),
    csvText(r.frameMaterial),
    csvText(r.sense),
    csvText(r.leafMaterial),
    csvText(r.hardware),
    ...(withComposition ? [csvText(r.composition)] : []),
    ...extra.map((k) => openingExtraCsvCell(r, k, units, lang)),
    ...(executivo ? OPENING_EXEC_KEYS.map((k) => openingExecCsvCell(r, k, units, lang)) : []),
  ]);
  const total = [t(lang, 'egs_csv_total'), '', '', '', '', '', '', '', '', '', '', '', String(totals.count), '', n('area', totals.totalArea, 2), '', '', '', '', '', '', ...(withComposition ? [''] : []), ...extra.map((k) => (k === 'totalCost' ? n('currency', totals.totalCost, 2) : '')), ...(executivo ? OPENING_EXEC_KEYS.map((k) => openingExecCsvTotal(rows, k, units, lang)) : [])];
  const header = csvHeader(units, lang);
  if (withComposition) header.push(t(lang, 'egs_csv_col_composicao'));
  header.push(...extra.map((k) => openingExtraCsvHeader(k, units, lang)));
  if (executivo) header.push(...OPENING_EXEC_KEYS.map((k) => openingExecHeader(k, units, lang)));
  return csvDocument([header, ...body, total]);
}
