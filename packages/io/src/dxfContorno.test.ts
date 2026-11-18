import { describe, expect, it } from 'vitest';
import { writeDxf2000, type DxfDoc } from './dxfDoc.ts';
import { sectionDxfDocOf, type DxfSectionGeometry } from './dxfSection.ts';

const layer = { name: 'L', color: 7, linetype: 'CONTINUOUS' as const, lineWeight: 25 };

/** Polilinha fechada de um quadrado, com `bulges` opcionais. */
function doc(bulges?: number[]): DxfDoc {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  return { layers: [layer], entities: [{ kind: 'polyline', layer: 'L', points, closed: true, ...(bulges === undefined ? {} : { bulges }) }] };
}

describe('polilinha do DXF com arcos (bulge)', () => {
  it('bulge não nulo sai no VERTEX (código 42) só nos vértices com arco', () => {
    const com = writeDxf2000(doc([0, 1, 0, 0]));
    const sem = writeDxf2000(doc());
    // Só um código 42 a mais (o do vértice com arco); o resto do arquivo é igual.
    expect(com.split('\r\n42\r\n').length - sem.split('\r\n42\r\n').length).toBe(1);
    // No VERTEX do vértice com arco: o 42 entre a cota Z (30) e a flag (70).
    expect(com).toContain('\r\n30\r\n0.000000\r\n42\r\n1.000000\r\n70\r\n0\r\n');
  });

  it('bulge ausente ou todo zero: o arquivo é o de antes, byte a byte', () => {
    expect(writeDxf2000(doc([0, 0, 0, 0]))).toBe(writeDxf2000(doc()));
  });

  it('o corte com vão de arcos sai como polilinha fechada com bulge, na camada do vão', () => {
    const geo: DxfSectionGeometry = {
      cut: [],
      beyond: [],
      openings: [
        {
          category: 'window',
          cut: false,
          polygons: [[[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]]],
          arcos: [{ pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], bulges: [0, 1, 0] }],
        },
      ],
    };
    const d = sectionDxfDocOf(geo);
    const poly = d.entities.find((e) => e.kind === 'polyline');
    expect(poly && poly.kind === 'polyline' ? poly.bulges : undefined).toEqual([0, 1, 0]);
    expect(poly && poly.kind === 'polyline' ? poly.closed : undefined).toBe(true);
    expect(writeDxf2000(d)).toContain('\r\n42\r\n1.000000\r\n');
  });
});
