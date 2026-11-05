import { describe, expect, it } from 'vitest';
import { createEmptyProject, type SectionView } from '@hestia/model';
import { DXF_LAYER_CORTES, DXF_LAYER_ELEVACOES } from './dxf.ts';
import { sectionMarksDxfOf } from './dxfSectionMarks.ts';

const view = (patch: Partial<SectionView> = {}): SectionView => ({
  id: 'v1',
  name: 'Corte A',
  kind: 'section',
  a: { x: 0, y: 0 },
  b: { x: 4, y: 0 },
  depth: 5,
  ...patch,
});

describe('marcas de corte/elevação no DXF', () => {
  it('sai em CORTES com hastes, setas e rótulo na altura de papel', () => {
    const p = createEmptyProject();
    p.views = [view({ label: 'A' })];
    const marks = sectionMarksDxfOf(p, 100);
    expect(marks.lines.length).toBeGreaterThan(4);
    expect(marks.lines.every((l) => l.layer === DXF_LAYER_CORTES)).toBe(true);
    expect(marks.texts).toHaveLength(4);
    expect(marks.texts.map((t) => t.text)).toEqual(['-', 'A', '-', 'A']);
    expect(marks.texts[1]!.height).toBeCloseTo(0.25);
  });

  it('elevação usa ELEVACOES e o texto configurado; marca oculta não sai', () => {
    const p = createEmptyProject();
    p.views = [view({ kind: 'elevation', label: 'Norte', mark: { textMm: 4 } })];
    const marks = sectionMarksDxfOf(p, 50);
    expect(marks.lines.every((l) => l.layer === DXF_LAYER_ELEVACOES)).toBe(true);
    expect(marks.texts[0]!.height).toBeCloseTo(0.2);
    p.views[0]!.mark = { visible: false };
    expect(sectionMarksDxfOf(p, 50)).toEqual({ lines: [], texts: [] });
  });
});
