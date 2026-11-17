import { describe, expect, it } from 'vitest';
import { buildTemplate, isOpening, isWall, type Project, TEMPLATES } from '@hestia/model';
import { ifcGeometryOf, projectIfc } from './ifcExport.ts';

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;

/** Todo `#n` referenciado tem de existir como entidade definida no arquivo. */
function danglingRefs(text: string): number[] {
  const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
  return [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !defined.has(id));
}

const NOW = new Date('2026-10-22T12:00:00Z');

describe('exportação IFC do projeto (web)', () => {
  it('a casa de teste (house2) sai com as paredes, vãos e pavimentos do modelo', () => {
    const p = buildTemplate('house2');
    const text = projectIfc(p, NOW);
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    expect(danglingRefs(text)).toEqual([]);
    const walls = Object.values(p.elements).filter(isWall).length;
    const openings = Object.values(p.elements).filter(isOpening).length;
    expect(walls).toBeGreaterThan(0);
    expect(count(text, 'IFCWALL')).toBe(walls);
    expect(count(text, 'IFCDOOR') + count(text, 'IFCWINDOW')).toBe(openings);
    expect(count(text, 'IFCBUILDINGSTOREY')).toBe(p.levels.length);
  });

  // 120 s: o prédio de 10 pavimentos (template `predio10`) é o maior modelo de partida e a suíte completa roda em paralelo.
  it('todos os modelos de partida exportam sem exceção e com referências íntegras', () => {
    for (const t of TEMPLATES) {
      const p: Project = buildTemplate(t.id);
      const text = projectIfc(p, NOW);
      expect(danglingRefs(text), t.id).toEqual([]);
      expect(count(text, 'IFCPROJECT'), t.id).toBe(1);
    }
  }, 120000);

  it('é determinístico com a mesma data e a geometria traz paredes e vãos', () => {
    const p = buildTemplate('house2');
    expect(projectIfc(p, NOW)).toBe(projectIfc(p, NOW));
    const g = ifcGeometryOf(p);
    expect(g.walls.length).toBeGreaterThan(0);
    expect(g.openings.length).toBeGreaterThan(0);
  });

  it('a casa premium (escadas e telhados) sai com um IFCSTAIR por escada e um IFCROOF por telhado', () => {
    const p = buildTemplate('house-premium');
    const text = projectIfc(p, NOW);
    const elements = Object.values(p.elements);
    const stairs = elements.filter((e) => e.kind === 'stair').length;
    const roofs = elements.filter((e) => e.kind === 'roof').length;
    expect(stairs + roofs).toBeGreaterThan(0);
    expect(count(text, 'IFCSTAIR')).toBe(stairs);
    expect(count(text, 'IFCROOF')).toBe(roofs);
    expect(count(text, 'IFCSTAIRFLIGHT')).toBeGreaterThan(0);
  });

  it('as esquadrias da casa premium saem em peças, com o vidro no material translúcido', () => {
    const p = buildTemplate('house-premium');
    const g = ifcGeometryOf(p);
    const janela = g.openings.find((o) => p.elements[o.openingId]?.kind === 'window');
    expect(janela?.parts?.length ?? 0).toBeGreaterThan(3);
    expect(janela!.parts!.some((part) => part.materialId === 'mat_vidro')).toBe(true);
    expect(janela!.parts!.every((part) => part.role !== 'pocket')).toBe(true);
    // Cada peça tem o seu IFCSTYLEDITEM; sem isso o web-ifc pinta a janela inteira de branco.
    const text = projectIfc(p, NOW);
    expect(count(text, 'IFCSTYLEDITEM')).toBeGreaterThan(count(text, 'IFCSURFACESTYLE'));
  });

  it('o vão bruto com folga de altura cresce só para cima: a base do furo é o peitoril (como no motor)', () => {
    const p0 = buildTemplate('house2');
    const base = ifcGeometryOf(p0).openings.find((o) => p0.elements[o.openingId]?.kind === 'window')!;
    const typeId = (p0.elements[base.openingId] as { typeId: string }).typeId;
    const p = { ...p0, openingTypes: { ...p0.openingTypes, [typeId]: { ...p0.openingTypes[typeId]!, roughOversize: { w: 0.04, h: 0.06 } } } };
    const o = ifcGeometryOf(p).openings.find((x) => x.openingId === base.openingId)!;
    expect(o.roughHeight - o.height).toBeCloseTo(0.06, 6);
    expect(o.roughBottomZ).toBeCloseTo(o.sillZ, 6);
  });
});
