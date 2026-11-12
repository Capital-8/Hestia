import { describe, expect, it } from 'vitest';
import { floorViewId, applySheetCommand, createEmptyProject, emptyTitleBlock, makeWall, type Project, type Sheet, type SheetViewport, type Wall } from '@hestia/model';
import { sheetDxf } from './dxfSheet.ts';

/**
 * Projeto com uma parede de 4 m no eixo x do nível lv_0, e uma prancha A3 deitada com uma vista de planta a 1:100.
 * A prancha entra pelos comandos do model (addSheet), como a tela faz.
 */
function projectWithSheet(vp?: Partial<SheetViewport>): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 } as Wall;
  p.nextOrder = 2;
  const viewport: SheetViewport = {
    id: 'v1',
    view: { kind: 'plan', viewId: floorViewId('lv_0') },
    at: { x: 20, y: 20 },
    size: { w: 200, h: 150 },
    scale: 100,
    ...vp,
  };
  const sheet: Sheet = {
    id: 'sh1',
    number: 'A-101',
    name: 'Planta',
    size: 'A3',
    orientation: 'landscape',
    margin: 10,
    titleBlock: { ...emptyTitleBlock(), project: 'Casa', client: 'Cliente', author: 'Autor', date: '2026-10-30', revision: 'R0' },
    viewports: [viewport],
  };
  applySheetCommand(p, { type: 'addSheet', sheet });
  return p;
}

/** Valor do cabeçalho: o par código/valor depois do nome do `$VAR` (o escritor grava um par por linha). */
function headerValue(dxf: string, variable: string): string | null {
  const lines = dxf.split('\r\n');
  const at = lines.findIndex((line) => line === variable);
  return at < 0 ? null : (lines[at + 2] ?? null);
}

/** Vértices (código 10/20) das POLYLINE do arquivo, em unidades de saída. */
function verticesOf(dxf: string): Array<{ x: number; y: number }> {
  const lines = dxf.split('\r\n');
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== 'VERTEX' || lines[i - 1] !== '0') continue;
    let x: number | null = null;
    let y: number | null = null;
    // O registro VERTEX vai até o próximo código 0 (VERTEX, SEQEND…), varrendo pares código/valor.
    for (let j = i + 1; j + 1 < lines.length && lines[j] !== '0'; j += 2) {
      if (lines[j] === '10') x = Number(lines[j + 1]);
      else if (lines[j] === '20') y = Number(lines[j + 1]);
    }
    if (x !== null && y !== null) out.push({ x, y });
  }
  return out;
}

describe('DXF da prancha (como plotada)', () => {
  it('é um R2000 com cabeçalho, POLYLINE, TEXT, moldura e extensão da folha', () => {
    const dxf = sheetDxf(projectWithSheet(), 'sh1', { units: 'm' });
    expect(dxf.startsWith('0\r\nSECTION\r\n2\r\nHEADER')).toBe(true);
    expect(headerValue(dxf, '$ACADVER')).toBe('AC1015');
    expect(dxf).toContain('\r\nPOLYLINE\r\n');
    expect(dxf).toContain('\r\nTEXT\r\n');
    // Extensão = folha inteira (A3: 420 × 297 mm), em metros.
    expect(dxf).toContain('$EXTMAX\r\n10\r\n0.420000\r\n20\r\n0.297000');
    // Moldura: a caixa interna da A3 (margem de 10 mm) aparece nos vértices.
    const verts = verticesOf(dxf);
    const has = (x: number, y: number) => verts.some((q) => Math.abs(q.x - x) < 1e-3 && Math.abs(q.y - y) < 1e-3);
    expect(has(0.01, 0.01)).toBe(true);
    expect(has(0.41, 0.287)).toBe(true);
    expect(dxf.endsWith('0\r\nEOF\r\n')).toBe(true);
  });

  it('unidade: metros por padrão (INSUNITS 6) e mm com coordenadas ×1000 (INSUNITS 4)', () => {
    const emMetros = sheetDxf(projectWithSheet(), 'sh1', { units: 'm' });
    expect(headerValue(emMetros, '$INSUNITS')).toBe('6');

    const emMm = sheetDxf(projectWithSheet(), 'sh1', { units: 'mm' });
    expect(headerValue(emMm, '$INSUNITS')).toBe('4');
    expect(emMm).toContain('$EXTMAX\r\n10\r\n420.000000\r\n20\r\n297.000000');
    // A moldura de 10 mm de papel vira 10 na saída em mm e 0,01 em metros.
    expect(verticesOf(emMm).some((q) => Math.abs(q.x - 10) < 1e-3 && Math.abs(q.y - 10) < 1e-3)).toBe(true);
  });

  it('recorta a vista à caixa: a parede é cortada nas bordas do quadro', () => {
    // Vista de 20 × 20 mm centrada na parede (que mede 40 mm a 1:100): o traço atravessa os dois lados do quadro.
    const p = projectWithSheet({ at: { x: 110, y: 85 }, size: { w: 20, h: 20 } });
    const dxf = sheetDxf(p, 'sh1', { units: 'mm' });
    const naJanela = verticesOf(dxf).filter((q) => q.x > 100 && q.x < 140 && q.y > 80 && q.y < 110);
    expect(naJanela.length).toBeGreaterThan(0);
    for (const q of naJanela) {
      expect(q.x).toBeGreaterThanOrEqual(110 - 1e-3);
      expect(q.x).toBeLessThanOrEqual(130 + 1e-3);
    }
    // O recorte gera vértices exatamente nas bordas da vista.
    expect(naJanela.some((q) => Math.abs(q.x - 110) < 1e-3)).toBe(true);
    expect(naJanela.some((q) => Math.abs(q.x - 130) < 1e-3)).toBe(true);
  });

  it('prancha inexistente lança em pt-BR', () => {
    expect(() => sheetDxf(projectWithSheet(), 'nada', { units: 'm' })).toThrow('Prancha inexistente: nada');
  });
});
