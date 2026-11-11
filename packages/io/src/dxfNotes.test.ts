import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, angularDimensionData, makeWall, DEFAULT_AREA_GRAPHICS, floorViewId, roofViewId } from '@hestia/model';
import { DXF_LAYER_COTAS, DXF_LAYER_TEXTOS, dxfTextEntity, notesDxfOf, viewNotesDxfOf } from './dxfNotes.ts';
import { exportDxf, type DxfLevelGeometry } from './dxf.ts';

const LV0 = 'lv_0';
const GEO: DxfLevelGeometry = { clusters: [], openings: [] };

/** Registros (código, valor) de cada entidade do bloco ENTITIES, pela ordem do arquivo. */
function entities(text: string): Array<{ type: string; rec: Map<number, string> }> {
  const src = text.split(/\r?\n/);
  const out: Array<{ type: string; rec: Map<number, string> }> = [];
  for (let i = 0; i + 1 < src.length; i += 2) {
    const code = Number(src[i]!.trim());
    const value = src[i + 1]!.trim();
    if (code === 0) out.push({ type: value, rec: new Map() });
    else out.at(-1)?.rec.set(code, value);
  }
  return out;
}

function comAnotacoes(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  s.exec({ type: 'addText', levelId: LV0, text: { id: 't1', at: { x: 2, y: 2 }, text: 'Sala', height: 2.5, rotation: 90 } });
  return s;
}

describe('anotações no DXF da planta', () => {
  it('cota: 5 LINE na camada COTAS (linha, 2 chamadas, 2 marcas) e o valor em TEXT na mesma camada', () => {
    const notes = notesDxfOf(comAnotacoes().project, LV0, 100);
    expect(notes.lines).toHaveLength(5);
    const texts = notes.texts.filter((t) => t.layer === DXF_LAYER_COTAS);
    expect(texts.map((t) => t.text)).toEqual(['4,00 m']);
    // Altura em metros de desenho: 2,5 mm de papel na escala 1:100 = 0,25 m.
    expect(texts[0]!.height).toBeCloseTo(0.25, 9);
  });

  it('o valor da cota segue as unidades do projeto', () => {
    const s = comAnotacoes();
    s.exec({ type: 'setSettings', patch: { units: { length: { unit: 'cm', decimals: 1 } } } });
    const texts = notesDxfOf(s.project, LV0, 100).texts.filter((t) => t.layer === DXF_LAYER_COTAS);
    expect(texts.map((t) => t.text)).toEqual(['400,0 cm']);
  });

  it('texto livre vai para TEXTOS, com a altura e a rotação do próprio texto', () => {
    const notes = notesDxfOf(comAnotacoes().project, LV0, 100);
    expect(notes.texts.find((t) => t.layer === DXF_LAYER_TEXTOS)).toMatchObject({ text: 'Sala', rotation: 90, at: { x: 2, y: 2 } });
  });

  it('cota com texto fixo sai no DXF com esse texto no lugar do valor medido', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd9', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, text: 'Vão 3,60' } });
    const notes = notesDxfOf(s.project, LV0, 100);
    expect(notes.texts.filter((t) => t.layer === DXF_LAYER_COTAS).map((t) => t.text)).toEqual(['Vão 3,60']);
  });

  it('exportDxf escreve LINE em COTAS, TEXT em COTAS e TEXTOS e declara as duas camadas', () => {
    const dxf = exportDxf(comAnotacoes().project, LV0, { ...GEO, notes: notesDxfOf(comAnotacoes().project, LV0, 100) });
    const ents = entities(dxf);
    const lines = ents.filter((e) => e.type === 'LINE' && e.rec.get(8) === DXF_LAYER_COTAS);
    expect(lines).toHaveLength(5);
    const texts = ents.filter((e) => e.type === 'TEXT');
    expect(texts.map((e) => [e.rec.get(8), e.rec.get(1)])).toEqual([
      [DXF_LAYER_COTAS, '4,00 m'],
      [DXF_LAYER_TEXTOS, 'Sala'],
    ]);
    expect(dxf).toMatch(/\r\n2\r\nCOTAS\r\n/);
    expect(dxf).toMatch(/\r\n2\r\nTEXTOS\r\n/);
  });

  it('sem anotações o arquivo não ganha as camadas', () => {
    const dxf = exportDxf(createEmptyProject(), LV0, GEO);
    expect(dxf).not.toMatch(/COTAS|TEXTOS/);
  });

  it('entidade TEXT do R2000: centrada, com altura e rotação', () => {
    expect(dxfTextEntity({ at: { x: 1, y: 2 }, text: 'A', height: 0.25, rotation: 90, layer: DXF_LAYER_TEXTOS })).toEqual({
      kind: 'text',
      layer: DXF_LAYER_TEXTOS,
      at: { x: 1, y: 2 },
      height: 0.25,
      text: 'A',
      rotation: 90,
      centered: true,
    });
  });

  it('cota angular sai como arco segmentado, marcas e texto em COTAS', () => {
    const s = new ProjectStore(createEmptyProject());
    const angular = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, 2, 'minor', 'a', 'b');
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'ang', a: { x: 0, y: 0 }, b: { x: 0, y: 2 }, offset: 0, angular, precision: 1 } });
    const notes = notesDxfOf(s.project, LV0, 100);
    expect(notes.lines.length).toBeGreaterThanOrEqual(26);
    expect(notes.texts.filter((t) => t.layer === DXF_LAYER_COTAS).map((t) => t.text)[0]).toContain('90');
  });

  it('volta reflexa: arco longo segmentado no sentido certo e texto em graus', () => {
    const s = new ProjectStore(createEmptyProject());
    const deg = Math.PI / 180;
    const to = { x: Math.cos(72.7 * deg), y: Math.sin(72.7 * deg) };
    const angular = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, to, 2, 'reflex', 'a', 'b', 'major');
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'ang', a: { x: 0, y: 0 }, b: { x: angular.to.x * 2, y: angular.to.y * 2 }, offset: 0, angular, precision: 1 } });
    const notes = notesDxfOf(s.project, LV0, 100);
    // 34 segmentos de arco + 2 marcas.
    expect(notes.lines.length).toBeGreaterThanOrEqual(36);
    const at = notes.texts.filter((t) => t.layer === DXF_LAYER_COTAS)[0]!;
    expect(at.text).toContain('252,7');
    expect(at.rotation).toBeGreaterThan(-90);
    expect(at.rotation).toBeLessThanOrEqual(90);
    // O primeiro segmento do arco sai de 0° e segue no sentido do arco longo (anti-horário, por cima).
    const first = notes.lines[0]!;
    expect(first[0].y).toBeCloseTo(0, 9);
    expect(first[1].y).toBeGreaterThan(0);
  });

  it('DXF: extremos da cota angular ficam nos eixos de parede referenciados', () => {
    const s = new ProjectStore(createEmptyProject());
    const angle = 30 * Math.PI / 180;
    s.exec({ type: 'addWall', wall: makeWall({ id: 'wa', typeId: 'wt_alv14', levelId: LV0, a: { x: -4, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'wb', typeId: 'wt_alv14', levelId: LV0, a: { x: -4 * Math.cos(angle), y: -4 * Math.sin(angle) }, b: { x: 4 * Math.cos(angle), y: 4 * Math.sin(angle) } }) });
    const angular = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: Math.cos(angle), y: Math.sin(angle) }, 1.5, 'reflex', 'wa:eixo', 'wb:eixo', 'minor');
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'ang-ref', a: { x: 0, y: 0 }, b: { x: angular.to.x * angular.radius, y: angular.to.y * angular.radius }, offset: 0, angular } });
    const notes = notesDxfOf(s.project, LV0, 100);
    const start = notes.lines[0]![0];
    const end = notes.lines.at(-3)![1];
    expect(start.y).toBeCloseTo(0, 8);
    expect(end.x * Math.sin(angle) - end.y * Math.cos(angle)).toBeCloseTo(0, 8);
  });
});

describe('anotações do DXF por vista (viewNotesDxfOf)', () => {
  const AP = 'ap_dxf';
  const plano = () => ({
    id: AP, name: 'Área', levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [],
  });
  const comDetalheETag = (s: ProjectStore): void => {
    s.exec({ type: 'addWall', wall: makeWall({ id: 'wx', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addDetailLine', levelId: LV0, item: { id: 'dl', a: { x: 0, y: 1 }, b: { x: 2, y: 1 }, style: 'dashed' } });
    s.exec({ type: 'addDetailRegion', levelId: LV0, item: { id: 'dr', boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] } });
    s.exec({ type: 'addTag', levelId: LV0, item: { id: 'tg', hostId: 'wx', at: { x: 2, y: 2 }, property: 'type' } });
  };

  it('piso: notesDxfOf(nível) é a mesma coisa que a vista; cobertura tem anotações próprias (vazias num nível novo)', () => {
    const s = comAnotacoes();
    comDetalheETag(s);
    const nivel = notesDxfOf(s.project, LV0, 100);
    expect(nivel.otherLines!.some((l) => l.layer === 'DETALHE')).toBe(true);
    expect(nivel.texts.some((t) => t.layer === 'ETIQUETAS')).toBe(true);
    expect(nivel.regions).toHaveLength(1);
    expect(viewNotesDxfOf(s.project, floorViewId(LV0), 100)).toEqual(nivel);
    // A cobertura deixou de repetir as anotações do piso (D3 da etapa 2a-1): cada vista tem as suas.
    expect(viewNotesDxfOf(s.project, roofViewId(LV0), 100)).toEqual({ lines: [], texts: [], otherLines: [], regions: [] });
  });

  it('planta de área nasce com cópia das anotações do nível (a herança acabou); o que se acrescenta nela não vai para o nível', () => {
    const s = comAnotacoes();
    s.exec({ type: 'addAreaPlan', plan: plano() });
    expect(viewNotesDxfOf(s.project, AP, 100)).toEqual(notesDxfOf(s.project, LV0, 100));
    s.exec({ type: 'addText', levelId: LV0, planId: AP, text: { id: 'tp', at: { x: 1, y: 1 }, text: 'Própria', height: 2.5, rotation: 0 } });
    const notes = viewNotesDxfOf(s.project, AP, 100);
    // A cota e o texto copiados continuam na vista, mais o que foi acrescentado só nela.
    expect(notes.texts.map((t) => t.text)).toEqual(['4,00 m', 'Sala', 'Própria']);
    expect(notes.lines).toHaveLength(5);
    expect(notesDxfOf(s.project, LV0, 100).texts.map((t) => t.text)).not.toContain('Própria');
  });

  it('vista ou nível inexistente: sem anotações', () => {
    const p = comAnotacoes().project;
    expect(viewNotesDxfOf(p, 'nao', 100)).toEqual({ lines: [], texts: [], otherLines: [], regions: [] });
    expect(notesDxfOf(p, 'lv_nao', 100)).toEqual({ lines: [], texts: [], otherLines: [], regions: [] });
  });
});
