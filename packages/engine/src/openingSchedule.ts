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
  openingHinges,
  openingLeafUndercut,
  openingLintel,
  openingOptionSupport,
  openingRough,
  openingSillBeam,
  openingThreshold,
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
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { collationFor, t, type EngineScheduleKey, type Lang } from './i18n.ts';

/**
 * Uma linha da tabela de portas e janelas: um TIPO de abertura (Revit: Type) com a contagem das instâncias dele no
 * projeto. É aqui que aparece o código do tipo (Revit: Type Mark). Valores em metros (SI).
 */
export interface OpeningScheduleRow {
  typeId: Id;
  kind: 'door' | 'window';
  /** Código do tipo (Revit: Type Mark), como "P-01"; vazio quando não informado. */
  code: string;
  typeName: string;
  /** Nome da família (openingFamilyName), como "Porta de giro"; vazio quando a combinação (símbolo × folhas) não existe. */
  familyName: string;
  /** Vão (m): com `nominalRef` 'leaf' é a folha mais a folga; nos demais, o próprio `width`/`height` do tipo. */
  width: number;
  height: number;
  /** Folha nominal (m): a "80 x 210" do comércio. Igual ao vão menos a folga quando o tipo é dado pelo vão. */
  leafWidth: number;
  leafHeight: number;
  /** Vão bruto (furo na parede): largura e altura do tipo mais a folga `roughOversize`. */
  roughWidth: number;
  roughHeight: number;
  sill: number;
  leaves: OpeningLeaves;
  /** Verga e contraverga do tipo (transpasse e altura); null quando o tipo não as tem. */
  lintel: OpeningLintel | null;
  sillBeam: OpeningLintel | null;
  /** Comprimento total das peças no projeto (m) = (largura + 2 × transpasse) × quantidade. */
  lintelLength: number;
  sillBeamLength: number;
  /** Quantidade de instâncias deste tipo no projeto. */
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

/** Ordenação estável: portas antes de janelas; dentro da categoria, pelo código, depois pelo nome e pelo id do tipo. */
function compareRows(a: OpeningScheduleRow, b: OpeningScheduleRow, lang: Lang): number {
  if (a.kind !== b.kind) return kindOrder(a.kind) - kindOrder(b.kind);
  const collation = collationFor(lang);
  const byCode = a.code.localeCompare(b.code, collation, { numeric: true });
  if (byCode !== 0) return byCode;
  const byName = a.typeName.localeCompare(b.typeName, collation, { numeric: true });
  if (byName !== 0) return byName;
  return a.typeId.localeCompare(b.typeId, collation);
}

/**
 * Tabela de portas e janelas do projeto: uma linha por TIPO usado (portas e janelas juntos, ordenados), com a
 * quantidade de instâncias. Tipo de abertura inexistente não conta (a instância aponta para um tipo ausente).
 */
export function buildOpeningSchedule(p: Project, lang: Lang = 'pt'): OpeningSchedule {
  const u = unitsOf(p, lang);
  const counts = new Map<Id, number>();
  const senses = new Map<Id, Set<string>>();
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e)) continue;
    if (!p.openingTypes[e.typeId]) continue;
    counts.set(e.typeId, (counts.get(e.typeId) ?? 0) + 1);
    const set = senses.get(e.typeId) ?? new Set<string>();
    set.add(senseText(e, lang));
    senses.set(e.typeId, set);
  }
  const rows: OpeningScheduleRow[] = [];
  for (const [typeId, count] of counts) {
    const raw = p.openingTypes[typeId];
    if (!raw) continue;
    const t = { ...spanTypeOf(raw), ...openingSpanOf(raw) }; // vão: a composição manda quando há 2+ células
    const leaf = leafSizeOf(raw);
    const unitArea = t.width * t.height;
    const rough = openingRough(t);
    const lintel = openingLintel(t);
    const sillBeam = openingSillBeam(t);
    const comp = openingCompositionOf(raw);
    const cells = compositionCells(comp);
    const multi = cells.length >= 2;
    rows.push({
      typeId,
      kind: t.kind,
      code: t.code ?? '',
      typeName: t.name,
      familyName: openingFamilyName(t) ?? '',
      width: t.width,
      height: t.height,
      leafWidth: leaf.width,
      leafHeight: leaf.height,
      roughWidth: rough.width,
      roughHeight: rough.height,
      sill: t.sill,
      leaves: t.leaves,
      lintel,
      sillBeam,
      lintelLength: lintel ? (t.width + 2 * lintel.over) * count : 0,
      sillBeamLength: sillBeam ? (t.width + 2 * sillBeam.over) * count : 0,
      count,
      unitArea,
      totalArea: unitArea * count,
      frameMaterial: p.materials[t.frameMaterialId]?.name ?? '',
      sense: t.leaves === 0 ? '' : [...(senses.get(typeId) ?? [])].join('; '),
      leafMaterial: (t.leafMaterialId && p.materials[t.leafMaterialId]?.name) || '',
      hardware: multi ? compositionHardware(t, cells, u, lang) : hardwareText(t, u, lang),
      composition: multi ? compositionSummary(comp, lang) : '',
    });
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
    }),
    { count: 0, doorCount: 0, windowCount: 0, totalArea: 0 },
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
 * outras tabelas). Uma linha por tipo, seguida de uma linha de total (quantidade de instâncias e área total).
 */
export function openingScheduleToCsv(rows: OpeningScheduleRow[], totals: OpeningScheduleTotals, units: ResolvedUnits, lang: Lang = 'pt'): string {
  const n = (q: 'length' | 'area', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const withComposition = rows.some((r) => r.composition !== '');
  const body = rows.map((r) => [
    csvText(r.code),
    csvText(r.typeName),
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
  ]);
  const total = [t(lang, 'egs_csv_total'), '', '', '', '', '', '', '', '', '', '', '', String(totals.count), '', n('area', totals.totalArea, 2), '', '', '', '', '', '', ...(withComposition ? [''] : [])];
  const header = csvHeader(units, lang);
  if (withComposition) header.push(t(lang, 'egs_csv_col_composicao'));
  return csvDocument([header, ...body, total]);
}
