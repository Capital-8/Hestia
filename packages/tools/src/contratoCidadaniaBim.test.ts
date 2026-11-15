/**
 * TESTE-GUARDA das Regras 7–12 de cidadania BIM (`docs/contratos/familias-e-ferramentas.md`):
 * garante seleção/visibilidade multi-vista (Planta, Corte/Elevação, 3D), cotas temporárias e associativas,
 * Alinhar finito/sem auto-referência, galeria compartilhada de desenho, paridade completa no navegador de famílias
 * e fidelidade geométrica de perfis metálicos (I/T) em 3D, corte/elevação, planta e IFC.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..', '..');
const ler = (rel: string): string => readFileSync(join(raiz, rel), 'utf8');

describe('Contrato de cidadania BIM (Regras 7–12)', () => {
  it('Regra 7: seleção, visibilidade, pick em corte, copiar/colar e "Visíveis na vista" cobrem estruturais em Planta, Corte e 3D', () => {
    const filtros = ler('packages/tools/src/selectionFilters.ts');
    expect(filtros).toContain('isCeiling');
    expect(filtros).toContain('isColumn');
    expect(filtros).toContain('isBeam');
    expect(filtros).toContain('isFooting');
    expect(filtros).toContain('levelId: Id | null');

    const vis = ler('apps/web/src/editor/viewVisibility.ts');
    expect(vis).toMatch(/case 'column':/);
    expect(vis).toMatch(/case 'beam':/);
    expect(vis).toMatch(/case 'footing':/);

    const pick = ler('packages/render/src/section/pick.ts');
    expect(pick).toContain("'columnId'");
    expect(pick).toContain("'beamId'");
    expect(pick).toContain("'footingId'");

    const transfer = ler('apps/web/src/editor/transfer.ts');
    expect(transfer).toContain("'columns'");
    expect(transfer).toContain("'beams'");
    expect(transfer).toContain("'footings'");
    expect(transfer).toContain("view === '3d' ? null : levelId");

    const ctxMenu = ler('apps/web/src/editor/contextMenu.ts');
    expect(ctxMenu).toContain("'column'");
    expect(ctxMenu).toContain("'beam'");
    expect(ctxMenu).toContain("'footing'");
    expect(ctxMenu).not.toMatch(/ctx\.view === '3d' \? \[\]/);
  });

  it('Regra 8: elementos estruturais registram TempDim editáveis e anel associativo em dimensionRefs', () => {
    const registry = ler('packages/tools/src/dims/registry.ts');
    expect(registry).toContain('columnDimProvider');
    expect(registry).toContain('beamDimProvider');
    expect(registry).toContain('footingDimProvider');

    const driven = ler('packages/tools/src/dims/driven.ts');
    expect(driven).toContain('isColumn');
    expect(driven).toContain('isBeam');
    expect(driven).toContain('isFooting');

    const refs = ler('packages/model/src/dimensionRefs.ts');
    expect(refs).toContain('columnPolygon');
    expect(refs).toContain('beamPolygon');
    expect(refs).toContain('footingPolygon');
  });

  it('Regra 9: Alinhar usa segmento finito, bloqueia auto-referência e suporta pontas de viga + vínculo sapata-pilar', () => {
    const structAlign = ler('packages/tools/src/structuralAlignFeatures.ts');
    expect(structAlign).toContain('segmentDistance');
    expect(structAlign).not.toContain('pointToLineDistance');
    expect(structAlign).toContain('extremidadeViga');

    const alignSolve = ler('packages/tools/src/alignSolve.ts');
    expect(alignSolve).toContain("kind: 'pontaViga'");

    const alignTool = ler('packages/tools/src/alignTool.ts');
    expect(alignTool).toContain('t.ownerId === this.ref!.ownerId');

    const cmds = ler('packages/model/src/commands.ts');
    expect(cmds).toContain('syncLinkedFootingsOnTransform');
    expect(cmds).toContain('syncLinkedFootingsOnColumnPatch');
    expect(cmds).toContain('unlinkFootingsOfDeletedColumns');
  });

  it('Regra 10 e 11: galeria de desenho .pm-galbox compartilhada e paridade completa de TypeRow em Families.tsx', () => {
    const gallery = ler('apps/web/src/ui/ribbon/DrawGalleryPanel.tsx');
    expect(gallery).toContain('pm-galbox');
    expect(gallery).toContain("wallShape");
    expect(gallery).toContain("beamShape");

    const ribbon = ler('apps/web/src/ui/Ribbon.tsx');
    expect(ribbon).toContain('DrawGalleryPanel');

    const families = ler('apps/web/src/ui/browser/Families.tsx');
    expect(families).not.toContain('StructuralTypeRow');
    expect(families).toContain('kind="column"');
    expect(families).toContain('kind="beam"');
    expect(families).toContain('kind="footing"');
  });

  it('Regra 12: perfil metálico I/T real em modelo, 3D, corte/elevação, planta e IFC', () => {
    const beamModel = ler('packages/model/src/beam.ts');
    expect(beamModel).toContain('export function beamProfileRingSZ');
    expect(beamModel).toContain('export function beamProfileParts');
    expect(beamModel).toContain('export function beamSectionArea');

    const solids = ler('packages/render/src/model3d/structuralSolids.ts');
    expect(solids).toContain('beamProfileRingSZ');
    expect(solids).toContain('extrudeBeamProfile');

    const sec = ler('packages/engine/src/sectionStructural.ts');
    expect(sec).toContain('beamProfileParts');
    expect(sec).toContain('unionClipper');
    expect(sec).toContain('columnProfileStrips');

    const plan = ler('packages/render/src/plan/structural.ts');
    expect(plan).toContain('beamProfileDims');

    const ifc = ler('packages/io/src/ifc/ifcStructural.ts');
    expect(ifc).toContain('extrudeHorizontalProfile');
  });
});
