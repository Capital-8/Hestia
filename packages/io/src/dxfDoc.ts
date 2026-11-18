import type { DxfPoint } from './dxf.ts';
import { dxfEscapeText } from './dxfNotes.ts';

/**
 * Escritor DXF R2000 (AC1015) do Hestia.
 *
 * O R12 (AC1009) que o Hestia gravava não guarda a espessura de linha por camada (código 370 da tabela LAYER).
 * O R2000 guarda cor (62), tipo de linha (6) e espessura (370) por camada e abre do AutoCAD 2000 ao 2025.
 * Aqui fica só o documento mínimo e o gravador; quem monta o documento são os exportadores (dxf.ts, dxfSection.ts,
 * apps/web/src/editor/dxfExport.ts).
 */

/** Tipos de linha que o escritor grava na tabela LTYPE e referencia nas camadas. */
export type DxfLineType = 'CONTINUOUS' | 'DASHED';

/**
 * Unidade de comprimento do arquivo. O documento é SEMPRE montado em metros (a unidade interna do Hestia); o escritor
 * converte na saída, escalando coordenadas, alturas e padrões de linha e gravando o `$INSUNITS` correspondente.
 */
export type DxfUnit = 'mm' | 'cm' | 'm' | 'ft' | 'in';

/** Código do `$INSUNITS` e fator de metros para cada unidade de saída (mm = ×1000, ft = ÷0,3048, in = ÷0,0254). */
export const DXF_UNITS: Record<DxfUnit, { code: number; scale: number }> = {
  mm: { code: 4, scale: 1000 },
  cm: { code: 5, scale: 100 },
  m: { code: 6, scale: 1 },
  ft: { code: 2, scale: 1 / 0.3048 },
  in: { code: 1, scale: 1 / 0.0254 },
};

/** Camada do documento: nome, cor ACI, tipo de linha e espessura em centésimos de mm (370). */
export interface DxfDocLayer {
  name: string;
  /** Cor ACI (1 a 255). 7 é branco/preto, 256 seria ByLayer (não se usa na tabela). */
  color: number;
  linetype: DxfLineType;
  /** Espessura em centésimos de mm, num valor válido do DXF (`DXF_LINE_WEIGHTS`). Ausente = -3 (padrão). */
  lineWeight?: number;
}

/** Polilinha 2D: POLYLINE + VERTEX + SEQEND. `width` é a largura constante em unidades do desenho (metros). */
export interface DxfPolylineEntity {
  kind: 'polyline';
  layer: string;
  points: readonly DxfPoint[];
  /** Fechada (flag 70 = 1). Ausente ou false = aberta. */
  closed?: boolean;
  /** Tracejado no próprio traço (código 6 = DASHED), mesmo que a camada seja contínua. */
  dashed?: boolean;
  /** Cor ACI própria da entidade (código 62); ausente = ByLayer. */
  color?: number;
  /** Largura constante (códigos 40 e 41), em unidades do desenho. */
  width?: number;
  /**
   * Arco do segmento que sai de cada vértice até o próximo (código 42 do VERTEX, `bulge` = tan(θ/4); 0 = reta, positivo =
   * anti-horário). Ausente ou zero = reta, como antes. Mesmo tamanho de `points`, quando presente.
   */
  bulges?: readonly number[];
}

/** Linha (LINE) entre dois pontos. */
export interface DxfLineEntity {
  kind: 'line';
  layer: string;
  a: DxfPoint;
  b: DxfPoint;
  /** Cor ACI própria da entidade (código 62); ausente = ByLayer. */
  color?: number;
}

/** Texto (TEXT) de uma linha, já na altura da vista (metros). */
export interface DxfTextEntity {
  kind: 'text';
  layer: string;
  at: DxfPoint;
  /** Altura em metros de desenho (código 40). */
  height: number;
  /** Texto cru: o escritor escapa o que não for ASCII com `dxfEscapeText`. */
  text: string;
  /** Graus, anti-horário (código 50). */
  rotation: number;
  /** Centrado no ponto (72 = 1, 73 = 2, com o ponto de alinhamento em 11/21). */
  centered?: boolean;
  /** Cor ACI própria da entidade (código 62); ausente = ByLayer. */
  color?: number;
}

export type DxfDocEntity = DxfPolylineEntity | DxfLineEntity | DxfTextEntity;

/** Documento DXF completo: camadas, entidades, a extensão do desenho e a unidade de saída. */
export interface DxfDoc {
  layers: readonly DxfDocLayer[];
  entities: readonly DxfDocEntity[];
  /** Canto inferior do desenho ($EXTMIN); ausente = calculado das entidades. */
  extMin?: DxfPoint;
  /** Canto superior do desenho ($EXTMAX); ausente = calculado das entidades. */
  extMax?: DxfPoint;
  /** Unidade de saída do arquivo; ausente = metros. As coordenadas do documento estão sempre em metros. */
  units?: DxfUnit;
}

/** Largura de linha padrão do DXF (código 370 = -3, "use a padrão do layer"). */
export const DXF2000_LINE_WEIGHT_DEFAULT = -3;

/** Traço tracejado do R12/R2000: 0,25 m de traço e 0,125 m de espaço (total 0,375), em unidades do desenho. */
const DASHED_PATTERN: readonly number[] = [0.25, -0.125];

/** Coordenadas e medidas com 6 casas (1 µm em metros); zero negativo vira zero. */
// units-ok: coordenada DXF (formato de máquina)
const fmt = (v: number): string => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6);

/** Tabelas de símbolos do R2000, na ordem em que o AutoCAD as espera. */
const SYMBOL_TABLES = ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD'] as const;

/** Nome de camada do DXF: no máximo 255 caracteres e sem os caracteres proibidos; vazio vira `0`. */
function safeLayerName(name: string): string {
  const clean = name.replace(/[<>/\\":;?*|=`,]/g, '_').trim();
  return clean === '' ? '0' : clean.slice(0, 255);
}

/** Camadas efetivas: `0` primeiro, sem repetição (o primeiro vence), mais as referidas por entidade sem cadastro. */
function layersOf(doc: DxfDoc): DxfDocLayer[] {
  const out: DxfDocLayer[] = [];
  const seen = new Set<string>();
  const add = (layer: DxfDocLayer): void => {
    const name = safeLayerName(layer.name);
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ ...layer, name });
  };
  add({ name: '0', color: 7, linetype: 'CONTINUOUS' });
  for (const layer of doc.layers) add(layer);
  for (const e of doc.entities) add({ name: e.layer, color: 7, linetype: 'CONTINUOUS' });
  return out;
}

/** Extensão do desenho: a dada ou, senão, a caixa das entidades (origem quando não há entidade). */
function extentsOf(doc: DxfDoc): { min: DxfPoint; max: DxfPoint } {
  if (doc.extMin && doc.extMax) return { min: doc.extMin, max: doc.extMax };
  const pts: DxfPoint[] = [];
  for (const e of doc.entities) {
    if (e.kind === 'polyline') pts.push(...e.points);
    else if (e.kind === 'line') pts.push(e.a, e.b);
    else pts.push(e.at);
  }
  const min = pts.reduce((m, p) => ({ x: Math.min(m.x, p.x), y: Math.min(m.y, p.y) }), { x: 0, y: 0 });
  const max = pts.reduce((m, p) => ({ x: Math.max(m.x, p.x), y: Math.max(m.y, p.y) }), { x: 0, y: 0 });
  return { min, max };
}

/**
 * Grava o documento como DXF R2000 (AC1015) completo: HEADER, CLASSES vazia, TABLES (VPORT, LTYPE, LAYER, STYLE,
 * VIEW, UCS, APPID, DIMSTYLE, BLOCK_RECORD), BLOCKS (`*Model_Space` e `*Paper_Space`), ENTITIES e OBJECTS
 * (dicionário raiz). Cada tabela e registro leva handle (5), dono (330) e marcadores de subclasse (100); os handles
 * são hexa maiúsculos crescentes e `$HANDSEED` aponta para o primeiro livre. LINHAS TERMINAM EM CRLF e o arquivo
 * fecha em `0\r\nEOF\r\n`.
 */
export function writeDxf2000(doc: DxfDoc): string {
  // O documento é montado em metros; a saída converte para a unidade pedida (ausente = metros).
  const { code: insUnits, scale } = DXF_UNITS[doc.units ?? 'm'];
  /** Comprimento em metros gravado na unidade de saída. */
  const len = (v: number): string => fmt(v * scale);
  const layers = layersOf(doc);
  const { min, max } = extentsOf(doc);
  const dashed = layers.some((l) => l.linetype === 'DASHED') || doc.entities.some((e) => e.kind === 'polyline' && e.dashed === true);
  const out: string[] = [];
  let last = 0x0f; // último handle usado; o primeiro registro sai em 10
  const h = (): string => {
    last += 1;
    return last.toString(16).toUpperCase();
  };
  const rec = (code: number, value: string | number): void => {
    out.push(String(code), String(value));
  };
  // Estilo de plotagem: o R2000 exige o 390 (PlotStyleName) em cada camada; o alvo é o "Normal" do dicionário
  // ACAD_PLOTSTYLENAME, um ACDBPLACEHOLDER. Os handles saem aqui para caber na tabela LAYER lá na frente.
  const plotStyle = h();
  const plotStyleDict = h();
  const rootDict = h();

  /** Abre uma tabela de símbolos e devolve o handle dela (dono dos registros). */
  const table = (name: string, count: number): string => {
    const handle = h();
    rec(0, 'TABLE');
    rec(2, name);
    rec(5, handle);
    rec(330, '0');
    rec(100, 'AcDbSymbolTable');
    rec(70, count);
    return handle;
  };
  const tableEnd = (): void => rec(0, 'ENDTAB');
  const blockRecord = (handle: string, owner: string, name: string): void => {
    rec(0, 'BLOCK_RECORD');
    rec(5, handle);
    rec(330, owner);
    rec(100, 'AcDbSymbolTableRecord');
    rec(100, 'AcDbBlockTableRecord');
    rec(2, name);
  };

  // --- TABLES ---------------------------------------------------------------------------------------------------
  rec(0, 'SECTION');
  rec(2, 'TABLES');

  // VPORT: só o *Active, com a vista padrão em mm de papel (1000 x 1000, como o ezdxf grava).
  const vport = table('VPORT', 1);
  rec(0, 'VPORT');
  rec(5, h());
  rec(330, vport);
  rec(100, 'AcDbSymbolTableRecord');
  rec(100, 'AcDbViewportTableRecord');
  rec(2, '*Active');
  rec(70, 0);
  for (const [code, value] of [[10, 0], [20, 0], [11, 1], [21, 1], [12, 0], [22, 0], [13, 0], [23, 0], [14, 0.5], [24, 0.5], [15, 0.5], [25, 0.5], [16, 0], [26, 0], [36, 1], [17, 0], [27, 0], [37, 0], [40, 1000], [41, 1.34], [42, 50], [43, 0], [44, 0], [50, 0], [51, 0]] as const) rec(code, fmt(value));
  for (const [code, value] of [[71, 0], [72, 1000], [73, 1], [74, 3], [75, 0], [76, 0], [77, 0], [78, 0]] as const) rec(code, value);
  rec(281, 0);
  rec(65, 0);
  rec(146, fmt(0));
  tableEnd();

  // LTYPE: ByBlock/ByLayer/CONTINUOUS e, quando usada, DASHED.
  const ltype = table('LTYPE', dashed ? 4 : 3);
  const ltypeRecord = (name: string, description: string, pattern: readonly number[]): void => {
    rec(0, 'LTYPE');
    rec(5, h());
    rec(330, ltype);
    rec(100, 'AcDbSymbolTableRecord');
    rec(100, 'AcDbLinetypeTableRecord');
    rec(2, name);
    rec(70, 0);
    rec(3, description);
    rec(72, 65);
    rec(73, pattern.length);
    rec(40, len(pattern.reduce((sum, v) => sum + Math.abs(v), 0)));
    for (const v of pattern) {
      rec(49, len(v));
      // R2000+: cada elemento do padrão leva o tipo de elemento (74 = 0, sem forma nem texto).
      rec(74, 0);
    }
  };
  ltypeRecord('ByBlock', '', []);
  ltypeRecord('ByLayer', '', []);
  ltypeRecord('CONTINUOUS', 'Solid line', []);
  if (dashed) ltypeRecord('DASHED', 'Dashed __ __ __', DASHED_PATTERN);
  tableEnd();

  // LAYER: `0` e as camadas do documento, cada uma com cor (62), tipo de linha (6) e espessura (370).
  const layerTable = table('LAYER', layers.length);
  for (const layer of layers) {
    rec(0, 'LAYER');
    rec(5, h());
    rec(330, layerTable);
    rec(100, 'AcDbSymbolTableRecord');
    rec(100, 'AcDbLayerTableRecord');
    rec(2, layer.name);
    rec(70, 0);
    rec(62, layer.color);
    rec(6, layer.linetype);
    rec(290, 1);
    rec(370, layer.lineWeight ?? DXF2000_LINE_WEIGHT_DEFAULT);
    rec(390, plotStyle);
  }
  tableEnd();

  // STYLE: o Standard que o TEXT sem estilo usa.
  const style = table('STYLE', 1);
  rec(0, 'STYLE');
  rec(5, h());
  rec(330, style);
  rec(100, 'AcDbSymbolTableRecord');
  rec(100, 'AcDbTextStyleTableRecord');
  rec(2, 'Standard');
  rec(70, 0);
  rec(40, fmt(0));
  rec(41, fmt(1));
  rec(50, fmt(0));
  rec(71, 0);
  rec(42, fmt(0.2));
  rec(3, 'txt');
  rec(4, '');
  tableEnd();

  for (const name of ['VIEW', 'UCS'] as const) {
    table(name, 0);
    tableEnd();
  }

  const appid = table('APPID', 1);
  rec(0, 'APPID');
  rec(5, h());
  rec(330, appid);
  rec(100, 'AcDbSymbolTableRecord');
  rec(100, 'AcDbRegAppTableRecord');
  rec(2, 'ACAD');
  rec(70, 0);
  tableEnd();

  // DIMSTYLE: a tabela e o registro levam o marcador extra AcDbDimStyleTable; o handle do registro é o 105.
  rec(0, 'TABLE');
  rec(2, 'DIMSTYLE');
  const dimstyle = h();
  rec(5, dimstyle);
  rec(330, '0');
  rec(100, 'AcDbSymbolTable');
  rec(70, 1);
  rec(100, 'AcDbDimStyleTable');
  rec(0, 'DIMSTYLE');
  rec(105, h());
  rec(330, dimstyle);
  rec(100, 'AcDbSymbolTableRecord');
  rec(100, 'AcDbDimStyleTableRecord');
  rec(2, 'Standard');
  rec(70, 0);
  for (const [code, value] of [[40, 1], [41, 2.5], [42, 0.625], [43, 3.75], [44, 1.25], [140, 2.5], [141, 2.5], [143, 0.03937007874], [144, 1], [146, 1], [147, 0.625], [77, 1], [78, 8], [79, 3], [271, 2], [272, 2], [273, 2], [274, 3], [277, 2], [278, 44], [284, 8], [289, 3], [371, -2], [372, -2]] as const) rec(code, fmt(value));
  for (const [code, value] of [[45, 0], [46, 0], [47, 0], [48, 0], [142, 0], [145, 0], [148, 0], [71, 0], [72, 0], [73, 0], [74, 0], [75, 0], [76, 0], [170, 0], [171, 3], [172, 1], [173, 0], [174, 0], [175, 0], [176, 0], [177, 0], [178, 0], [179, 2], [275, 0], [276, 0], [279, 0], [280, 0], [281, 0], [282, 0], [283, 0], [285, 0], [286, 0], [288, 0]] as const) rec(code, value);
  tableEnd();

  // BLOCK_RECORD: os dois espaços de modelo/papel, donos do conteúdo das seções BLOCKS e ENTITIES.
  const blockRecords = table('BLOCK_RECORD', 2);
  const modelSpace = h();
  blockRecord(modelSpace, blockRecords, '*Model_Space');
  const paperSpace = h();
  blockRecord(paperSpace, blockRecords, '*Paper_Space');
  tableEnd();

  rec(0, 'ENDSEC');

  // --- BLOCKS ---------------------------------------------------------------------------------------------------
  rec(0, 'SECTION');
  rec(2, 'BLOCKS');
  for (const [name, owner] of [['*Model_Space', modelSpace], ['*Paper_Space', paperSpace]] as const) {
    rec(0, 'BLOCK');
    rec(5, h());
    rec(330, owner);
    rec(100, 'AcDbEntity');
    rec(8, '0');
    rec(100, 'AcDbBlockBegin');
    rec(2, name);
    rec(70, 0);
    rec(10, len(0));
    rec(20, len(0));
    rec(30, len(0));
    rec(3, name);
    rec(1, '');
    rec(0, 'ENDBLK');
    rec(5, h());
    rec(330, owner);
    rec(100, 'AcDbEntity');
    rec(8, '0');
    rec(100, 'AcDbBlockEnd');
  }
  rec(0, 'ENDSEC');

  // --- ENTITIES -------------------------------------------------------------------------------------------------
  rec(0, 'SECTION');
  rec(2, 'ENTITIES');
  for (const e of doc.entities) {
    const layer = safeLayerName(e.layer);
    const common = (handle: string, type: string): void => {
      rec(0, type);
      rec(5, handle);
      rec(330, modelSpace);
      rec(100, 'AcDbEntity');
      rec(8, layer);
    };
    if (e.kind === 'polyline') {
      const handle = h();
      common(handle, 'POLYLINE');
      if (e.color !== undefined) rec(62, e.color);
      if (e.dashed === true) rec(6, 'DASHED');
      rec(100, 'AcDb2dPolyline');
      rec(66, 1);
      rec(10, len(0));
      rec(20, len(0));
      rec(30, len(0));
      rec(70, e.closed === true ? 1 : 0);
      if (e.width !== undefined) {
        rec(40, len(e.width));
        rec(41, len(e.width));
      }
      for (let i = 0; i < e.points.length; i++) {
        const p = e.points[i]!;
        rec(0, 'VERTEX');
        rec(5, h());
        rec(330, modelSpace);
        rec(100, 'AcDbEntity');
        rec(8, layer);
        // A VERTEX herda cor e tipo de linha do dono: sem isso o AUDIT corrige cada uma ("!= owner's").
        if (e.color !== undefined) rec(62, e.color);
        if (e.dashed === true) rec(6, 'DASHED');
        rec(100, 'AcDbVertex');
        rec(100, 'AcDb2dVertex');
        rec(10, len(p.x));
        rec(20, len(p.y));
        rec(30, len(0));
        const bulge = e.bulges?.[i] ?? 0;
        if (bulge !== 0) rec(42, fmt(bulge));
        rec(70, 0);
      }
      rec(0, 'SEQEND');
      rec(5, h());
      rec(330, handle);
      rec(100, 'AcDbEntity');
      rec(8, layer);
    } else if (e.kind === 'line') {
      common(h(), 'LINE');
      if (e.color !== undefined) rec(62, e.color);
      rec(100, 'AcDbLine');
      rec(10, len(e.a.x));
      rec(20, len(e.a.y));
      rec(30, len(0));
      rec(11, len(e.b.x));
      rec(21, len(e.b.y));
      rec(31, len(0));
    } else {
      common(h(), 'TEXT');
      if (e.color !== undefined) rec(62, e.color);
      rec(100, 'AcDbText');
      rec(10, len(e.at.x));
      rec(20, len(e.at.y));
      rec(30, len(0));
      rec(40, len(e.height));
      rec(1, dxfEscapeText(e.text));
      rec(50, fmt(e.rotation));
      rec(7, 'Standard');
      if (e.centered === true) {
        rec(72, 1);
        rec(11, len(e.at.x));
        rec(21, len(e.at.y));
        rec(31, len(0));
      }
      // O segundo marcador AcDbText fecha o bloco do texto; sem ele o AutoCAD recusa ("Class separator ... expected").
      rec(100, 'AcDbText');
      if (e.centered === true) rec(73, 2);
    }
  }
  rec(0, 'ENDSEC');

  // --- OBJECTS --------------------------------------------------------------------------------------------------
  // Dicionário raiz com o estilo de plotagem "Normal", que o 390 de cada camada aponta.
  rec(0, 'SECTION');
  rec(2, 'OBJECTS');
  rec(0, 'DICTIONARY');
  rec(5, rootDict);
  rec(330, '0');
  rec(100, 'AcDbDictionary');
  rec(281, 1);
  rec(3, 'ACAD_PLOTSTYLENAME');
  rec(350, plotStyleDict);
  rec(0, 'ACDBDICTIONARYWDFLT');
  rec(5, plotStyleDict);
  rec(330, rootDict);
  rec(100, 'AcDbDictionary');
  rec(281, 1);
  rec(3, 'Normal');
  rec(350, plotStyle);
  rec(100, 'AcDbDictionaryWithDefault');
  rec(340, plotStyle);
  rec(0, 'ACDBPLACEHOLDER');
  rec(5, plotStyle);
  rec(330, plotStyleDict);
  rec(0, 'ENDSEC');

  // --- HEADER (por último no código, primeiro no arquivo: $HANDSEED precisa de todos os handles) ---------------
  const head: string[] = [];
  const hrec = (code: number, value: string | number): void => {
    head.push(String(code), String(value));
  };
  hrec(0, 'SECTION');
  hrec(2, 'HEADER');
  hrec(9, '$ACADVER');
  hrec(1, 'AC1015');
  hrec(9, '$ACADMAINTVER');
  hrec(70, 6);
  hrec(9, '$HANDSEED');
  hrec(5, (last + 1).toString(16).toUpperCase());
  hrec(9, '$DWGCODEPAGE');
  hrec(3, 'ANSI_1252');
  hrec(9, '$INSBASE');
  hrec(10, len(0));
  hrec(20, len(0));
  hrec(30, len(0));
  hrec(9, '$EXTMIN');
  hrec(10, len(min.x));
  hrec(20, len(min.y));
  hrec(30, len(0));
  hrec(9, '$EXTMAX');
  hrec(10, len(max.x));
  hrec(20, len(max.y));
  hrec(30, len(0));
  hrec(9, '$LIMMIN');
  hrec(10, len(0));
  hrec(20, len(0));
  hrec(9, '$LIMMAX');
  hrec(10, len(420));
  hrec(20, len(297));
  hrec(9, '$LTSCALE');
  hrec(40, fmt(1));
  hrec(9, '$TEXTSTYLE');
  hrec(7, 'Standard');
  hrec(9, '$CLAYER');
  hrec(8, '0');
  hrec(9, '$CELTYPE');
  hrec(6, 'ByLayer');
  hrec(9, '$INSUNITS');
  hrec(70, insUnits);
  hrec(9, '$MEASUREMENT');
  hrec(70, 1);
  hrec(9, '$LWDISPLAY');
  hrec(290, 1);
  hrec(0, 'ENDSEC');

  // CLASSES: o ACDBDICTIONARYWDFLT do estilo de plotagem precisa estar declarado para o AutoCAD ler o objeto.
  const classes = [
    '0', 'SECTION', '2', 'CLASSES',
    '0', 'CLASS', '1', 'ACDBDICTIONARYWDFLT', '2', 'AcDbDictionaryWithDefault', '3', 'ObjectDBX Classes', '90', '0', '280', '0', '281', '0',
    '0', 'ENDSEC',
  ];
  return [...head, ...classes, ...out, '0', 'EOF', ''].join('\r\n');
}

/** Tabelas de símbolos na ordem em que `writeDxf2000` as grava (útil a testes e verificadores). */
export const DXF2000_TABLE_ORDER: readonly string[] = SYMBOL_TABLES;
