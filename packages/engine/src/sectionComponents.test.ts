import { describe, expect, it } from 'vitest';
import { boxOf, multiArea, multiPoints } from '@hestia/geom';
import { applyCommand, createEmptyProject, FAMILIA_ARMARIO, familiaDaBiblioteca, type Component, type Project } from '@hestia/model';
import { computeSection } from './section.ts';
import { sectionOfComponents } from './sectionComponents.ts';

function projetoComFamilias(): Project {
  const p = createEmptyProject('t');
  applyCommand(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  applyCommand(p, { type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca('fam_aereo')!) });
  return p;
}

function addComp(p: Project, c: Component): void {
  p.elements[c.id] = c;
}

describe('sectionOfComponents e computeSection com componentes', () => {
  it('corte transversal atravessando armário gera regiões cortadas por material e projeção beyond das laterais', () => {
    const p = projetoComFamilias();
    addComp(p, {
      id: 'arm1',
      kind: 'component',
      familyId: FAMILIA_ARMARIO.id,
      typeId: 'A80',
      levelId: p.levels[0]!.id,
      order: 1,
      x: 1,
      y: 1,
      z: 0,
      rotation: 0,
      mirrored: false,
      mark: 'A1',
    });

    // Corte em x = 1.2 (no meio da folha esquerda da porta) olhando na direção +y: d = (0, 1), n = (-1, 0).
    // Além (n) fica para x < 1.2 (onde está a lateral esquerda em x = 1.0..1.018).
    const r = computeSection(p, { a: { x: 1.2, y: 0 }, b: { x: 1.2, y: 3 }, depth: 2 });

    expect(r.cut.length).toBeGreaterThanOrEqual(5);
    expect(r.cut.every((reg) => reg.sources.some((s) => s.componentId === 'arm1'))).toBe(true);
    expect(r.cut.map((reg) => reg.materialId).sort()).toEqual([
      'comp_corpo',
      'comp_fundo',
      'comp_porta',
      'comp_rodape',
      'comp_tampo',
    ]);
    expect(r.beyond.some((b) => b.componentId === 'arm1')).toBe(true);
    expect(r.zMin).toBeCloseTo(0, 6);
    expect(r.zMax).toBeCloseTo(0.72, 6);
    expect(multiArea(r.silhouette)).toBeGreaterThan(0.35);
  });

  it('elevação mostra balcão e aéreo acima em beyond com oclusão das peças traseiras pelas portas', () => {
    const p = projetoComFamilias();
    const lv = p.levels[0]!.id;
    addComp(p, {
      id: 'balcao',
      kind: 'component',
      familyId: FAMILIA_ARMARIO.id,
      typeId: 'A80',
      levelId: lv,
      order: 1,
      x: 1,
      y: 2,
      z: 0,
      rotation: 0,
      mirrored: false,
      mark: 'B1',
    });
    addComp(p, {
      id: 'aereo',
      kind: 'component',
      familyId: 'fam_aereo',
      typeId: 'A80',
      levelId: lv,
      order: 2,
      x: 1,
      y: 2.24,
      z: 0,
      rotation: 0,
      mirrored: false,
      mark: 'AE1',
    });

    // Linha na frente (y = 0) olhando para +y: d = (1, 0), n = (0, 1).
    const r = computeSection(p, { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 5 });

    expect(r.cut).toHaveLength(0);
    expect(r.beyond.some((b) => b.componentId === 'balcao')).toBe(true);
    expect(r.beyond.some((b) => b.componentId === 'aereo')).toBe(true);
    expect(r.zMin).toBeCloseTo(0, 6);
    // Aéreo A80: zFixacao = 1,40 m + A = 0,70 m = 2,10 m.
    expect(r.zMax).toBeCloseTo(2.1, 6);

    // O fundo do balcão (y = 2.539) está atrás das portas (y = 1.982): só a fresta central de 4 mm fica exposta,
    // mantendo a área visível do fundo quase nula em comparação à área real (~0,44 m²).
    const areaFundoVisivel = r.beyond
      .filter((b) => b.componentId === 'balcao' && b.materialId === 'comp_fundo')
      .reduce((acc, b) => acc + multiArea(b.polygons), 0);
    expect(areaFundoVisivel).toBeLessThan(0.01);
  });

  it('respeita rotação, mirrored e levelElevation + c.z', () => {
    const p = projetoComFamilias();
    p.levels.push({ id: 'lv_1', name: 'Pavimento 1', elevation: 3.0, viewRange: p.levels[0]!.viewRange });
    addComp(p, {
      id: 'rot',
      kind: 'component',
      familyId: FAMILIA_ARMARIO.id,
      typeId: 'A80',
      levelId: 'lv_1',
      order: 1,
      x: 2,
      y: 1,
      z: 0.2,
      rotation: Math.PI / 2,
      mirrored: true,
      mark: 'R1',
    });

    // Com mirrored=true, X local [0, 0.8] vira [-0.8, 0]; girado +90° vira Y mundo [1 - 0.8, 1] = [0.2, 1.0],
    // e Y local [-0.02, 0.56] girado +90° vira X mundo [2 - 0.56, 2 + 0.02] = [1.44, 2.02].
    const r = computeSection(p, { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 }, ['lv_1']);
    const caixa = boxOf(multiPoints(r.silhouette));
    expect(caixa.minX).toBeCloseTo(1.44, 5);
    expect(caixa.maxX).toBeCloseTo(2.02, 5);
    expect(caixa.minY).toBeCloseTo(3.2, 5);
    expect(caixa.maxY).toBeCloseTo(3.92, 5);
  });

  it('ignora peças vazias (vazio: true) e componentes atrás da linha de corte', () => {
    const p = projetoComFamilias();
    const fam = structuredClone(FAMILIA_ARMARIO);
    fam.pecas.push({
      id: 'vazio_cuba',
      nome: 'Recorte cuba',
      papel: 'bloco',
      vazio: true,
      eixo: 'z',
      origem: ['100', '100', 'A - 100'],
      tamanho: ['300', '300'],
      espessura: '100',
    });
    applyCommand(p, { type: 'upsertFamily', family: fam });

    addComp(p, {
      id: 'c1',
      kind: 'component',
      familyId: fam.id,
      typeId: 'A80',
      levelId: p.levels[0]!.id,
      order: 1,
      x: 1,
      y: 1,
      z: 0,
      rotation: 0,
      mirrored: false,
      mark: 'C1',
    });

    // Linha em y = 3 olhando para +y (armário em y = 1..1.56 está atrás do observador).
    const atras = sectionOfComponents(p, p.levels[0]!.id, { a: { x: 0, y: 3 }, b: { x: 4, y: 3 }, depth: 3 });
    expect(atras.cut).toHaveLength(0);
    expect(atras.beyond).toHaveLength(0);

    // Garantir que o bloco vazio não gera corte extra além dos 5 materiais sólidos (corte em x = 1.2 atravessa a porta).
    const corte = computeSection(p, { a: { x: 1.2, y: 0 }, b: { x: 1.2, y: 3 }, depth: 2 });
    expect(corte.cut).toHaveLength(5);
  });
});
