import { describe, expect, it } from 'vitest';
import { createEmptyProject, isCurtainType, makeLevel, makeWall, mullionTypesOf, type Project, type Wall, type WallType } from '@hestia/model';
import { exportIfc } from '../ifc/ifcExport.ts';
import type { IfcCurtainPrototypeGeo, IfcGeometry } from '../ifc/ifcTypes.ts';
import { importIfc } from './index.ts';

const paredes = (p: Project): Wall[] => Object.values(p.elements).filter((e): e is Wall => e.kind === 'wall');

interface Box {
  type: 'IFCMEMBER' | 'IFCPLATE';
  name: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

/** IFC2X3 mínimo: uma IFCCURTAINWALL sem geometria agregando caixas (extrusão retangular), o conjunto girado em `angle` graus. */
function ifcCortina(boxes: Box[], angle = 0): string {
  const a = (angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const lines: string[] = [
    "#1=IFCPROJECT('0000000000000000000001',$,'P',$,$,$,$,(#2),#3);",
    "#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#4,$);",
    '#3=IFCUNITASSIGNMENT((#5));',
    '#4=IFCAXIS2PLACEMENT3D(#6,$,$);',
    '#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',
    '#6=IFCCARTESIANPOINT((0.,0.,0.));',
    '#7=IFCLOCALPLACEMENT($,#4);',
    "#8=IFCCURTAINWALL('00000000000000000000CW',$,'Fachada',$,$,#7,$,'CW1');",
    '#9=IFCDIRECTION((0.,0.,1.));',
  ];
  const ids: number[] = [];
  let n = 100;
  for (const [i, b] of boxes.entries()) {
    const [pt, dir, ax, pl, p2, a2, prof, ext, rep, pds, el] = Array.from({ length: 11 }, () => n++);
    ids.push(el!);
    const px = b.x * c - b.y * s;
    const py = b.x * s + b.y * c;
    lines.push(
      `#${pt}=IFCCARTESIANPOINT((${px},${py},${b.z}));`,
      `#${dir}=IFCDIRECTION((${c},${s},0.));`,
      `#${ax}=IFCAXIS2PLACEMENT3D(#${pt},$,#${dir});`,
      `#${pl}=IFCLOCALPLACEMENT($,#${ax});`,
      `#${p2}=IFCCARTESIANPOINT((${b.dx / 2},${b.dy / 2}));`,
      `#${a2}=IFCAXIS2PLACEMENT2D(#${p2},$);`,
      `#${prof}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${a2},${b.dx},${b.dy});`,
      `#${ext}=IFCEXTRUDEDAREASOLID(#${prof},#4,#9,${b.dz});`,
      `#${rep}=IFCSHAPEREPRESENTATION(#2,'Body','SweptSolid',(#${ext}));`,
      `#${pds}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${rep}));`,
      `#${el}=${b.type}('${String(i).padStart(22, '0')}',$,'${b.name}',$,$,#${pl},#${pds},$);`,
    );
  }
  if (ids.length) lines.push(`#10=IFCRELAGGREGATES('000000000000000000REL1',$,$,$,#8,(${ids.map((i) => `#${i}`).join(',')}));`);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('t','2026-01-01T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('IFC2X3'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

const montante = (x: number): Box => ({ type: 'IFCMEMBER', name: 'M', x, y: 0, z: 0, dx: 0.05, dy: 0.1, dz: 3 });
const vidro = (x: number, w: number): Box => ({ type: 'IFCPLATE', name: 'System Panel:Glazed', x, y: 0.045, z: 0.1, dx: w, dy: 0.01, dz: 2.8 });

describe('addCurtainWalls: IFCCURTAINWALL de arquivo de terceiros', () => {
  it('2 montantes + 1 painel viram uma única parede cortina nativa, sem genéricos', () => {
    const { project, report } = importIfc(ifcCortina([montante(0), montante(5.95), vidro(0.05, 5.9)]));
    const lista = paredes(project);
    expect(lista).toHaveLength(1);
    const w = lista[0]!;
    const tipo = project.wallTypes[w.typeId]!;
    expect(isCurtainType(tipo)).toBe(true);
    expect(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)).toBeCloseTo(6, 3);
    expect(w.height).toBeCloseTo(3, 3);
    expect(tipo.curtain!.depth).toBeCloseTo(0.1, 3);
    expect(tipo.curtain!.u).toEqual({ mode: 'fixedNumber', count: 1 });
    expect(tipo.curtain!.mullions.borderStart).not.toBeNull();
    expect(tipo.curtain!.mullions.borderEnd).not.toBeNull();
    expect(mullionTypesOf(project)[tipo.curtain!.mullions.borderStart!]!.profile.width).toBeCloseTo(0.05, 3);
    expect(project.curtainPanelTypes![tipo.curtain!.defaultPanelTypeId]!.kind).toBe('glass');
    expect(report.generic).toEqual({});
    expect(report.imported.paredes).toBe(1);
  });

  it('grade regular de montantes vira fixedNumber; irregular vira manual', () => {
    const reg = importIfc(ifcCortina([montante(0), montante(1.975), montante(3.975), montante(5.95)]));
    const regW = paredes(reg.project)[0]!;
    expect(reg.project.wallTypes[regW.typeId]!.curtain!.u).toEqual({ mode: 'fixedNumber', count: 3 });
    const irr = importIfc(ifcCortina([montante(0), montante(1), montante(4), montante(5.95)]));
    const u = irr.project.wallTypes[paredes(irr.project)[0]!.typeId]!.curtain!.u;
    expect(u.mode).toBe('manual');
    expect(u.positions![0]).toBeCloseTo(1.025, 2);
    expect(u.positions![1]).toBeCloseTo(4.025, 2);
  });

  it('conjunto girado 30 graus: a linha de base segue o eixo maior, não o X', () => {
    const { project } = importIfc(ifcCortina([montante(0), montante(5.95), vidro(0.05, 5.9)], 30));
    const w = paredes(project)[0]!;
    expect(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)).toBeCloseTo(6, 2);
    const ang = (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI;
    expect(Math.abs((((ang % 180) + 180) % 180) - 30)).toBeLessThan(0.5);
  });

  it('cortina sem peças com geometria não converte e registra aviso', () => {
    const { project, report } = importIfc(ifcCortina([]));
    expect(paredes(project)).toHaveLength(0);
    expect(report.warnings.some((m) => m.includes('Fachada'))).toBe(true);
  });
});

describe('round-trip: parede cortina do Hestia exportada e reimportada', () => {
  const caixa = (): IfcCurtainPrototypeGeo['mesh'] => ({
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
    indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
  });
  const matriz = (x: number, y: number, z: number, l: number, p: number, h: number): number[] => [l, 0, 0, x, 0, p, 0, y, 0, 0, h, z];

  it('volta como parede cortina nativa (mesmo id e tipo), com os tipos de montante e painel, sem genéricos', () => {
    const base = createEmptyProject('RT');
    const tipo: WallType = {
      ...base.wallTypes.wt_alv14!,
      id: 'wt_ct',
      name: 'Cortina teste',
      family: 'curtain',
      curtain: {
        depth: 0.1,
        u: { mode: 'fixedNumber', count: 4 },
        v: { mode: 'fixedNumber', count: 2 },
        mullions: { interiorVertical: 'mul_ret_50x100', interiorHorizontal: null, borderStart: 'mul_ret_50x100', borderEnd: 'mul_ret_50x100', borderBottom: null, borderTop: null, corner: null, joinPriority: 'vertical' },
        defaultPanelTypeId: 'pnl_vidro_10',
      },
      layers: [{ function: 'structure', materialId: 'mat_aluminio', thickness: 0.1, wraps: false }],
      strips: [],
      wrapInserts: 'none',
      wrapEnds: 'none',
    };
    const p: Project = {
      ...base,
      wallTypes: { ...base.wallTypes, wt_ct: tipo },
      mullionTypes: { ...mullionTypesOf(base), mul_custom: { id: 'mul_custom', name: 'Custom', profile: { shape: 'rect', width: 0.07, depth: 0.12 }, materialId: 'mat_aluminio' } },
      levels: [...base.levels, makeLevel({ id: 'lv_1', name: 'N1', elevation: 3 })],
      elements: { ...base.elements, ct1: { ...makeWall({ id: 'ct1', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }), order: 1 } as Project['elements'][string] },
    };
    const geo: IfcGeometry = {
      walls: [],
      openings: [],
      floors: [],
      slabs: [],
      roofs: [],
      stairs: [],
      curtains: {
        prototypes: [
          { proto: 0, papel: 0, typeId: 'mul_ret_50x100', shape: 'rect', materialId: 'mat_aluminio', mesh: caixa() },
          { proto: 1, papel: 1, typeId: 'pnl_vidro_10', materialId: 'mat_vidro', mesh: caixa() },
        ],
        walls: [
          {
            wallId: 'ct1',
            footprint: [[{ x: 0, y: -0.05 }, { x: 6, y: -0.05 }, { x: 6, y: 0.05 }, { x: 0, y: 0.05 }]],
            instances: [
              { proto: 0, matrix: matriz(0, 0, 0, 0.05, 0.1, 3) },
              { proto: 0, matrix: matriz(6, 0, 0, 0.05, 0.1, 3) },
              { proto: 1, matrix: matriz(0.5, 0, 0.1, 1.4, 0.01, 2.8) },
            ],
            quantities: { length: 6, grossArea: 18, glassArea: 4, solidArea: 0, mullionLength: 6 },
          },
        ],
      },
    };
    const texto = exportIfc(p, geo, { timestamp: '2026-01-01T00:00:00' });
    expect(texto).toContain('IFCCURTAINWALL(');
    const { project, report } = importIfc(texto);
    const w = project.elements.ct1 as Wall;
    expect(w.kind).toBe('wall');
    expect(w.typeId).toBe('wt_ct');
    expect(isCurtainType(project.wallTypes.wt_ct)).toBe(true);
    expect(project.wallTypes.wt_ct!.curtain!.u).toEqual({ mode: 'fixedNumber', count: 4 });
    expect(paredes(project)).toHaveLength(1);
    expect(report.generic).toEqual({});
    expect(mullionTypesOf(project).mul_custom?.profile.width).toBe(0.07);
  });
});
