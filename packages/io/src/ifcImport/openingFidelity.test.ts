import { describe, expect, it } from 'vitest';
import type { Opening, Project, Wall } from '@hestia/model';
import { importIfc } from './index.ts';
import { IfcFile } from './ifc.ts';
import { ifcBoxes, ref, type TestBox } from './ifcTestKit.ts';
import { arcPoints, curvePoints } from './profiles.ts';
import { acousticRwOf } from './openingBim.ts';

/** Id de 22 caracteres para as entidades escritas à mão. */
const gid = (n: number): string => String(n).padStart(22, '0');
const lista = <T extends { kind: string }>(p: Project, kind: string): T[] => Object.values(p.elements).filter((e) => e.kind === kind) as unknown as T[];
const paredeCaixa: TestBox = { id: 1, type: 'IFCWALL', name: 'W', x: 0, y: -0.1, z: 0, dx: 6, dy: 0.2, dz: 3, tail: '$' };
const area = (pts: Array<{ x: number; y: number }>): number => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

/*
 * Contorno em "D": reta de (-0,5;0) a (0,5;0), reta até (0,5;1,5), arco pelos três pontos (0,5;1,5), (0,25;1,933),
 * (-0,5;1,5) e reta de volta. O arco tem topo em (0;2), que NÃO é ponto de controle: o leitor antigo só via os pontos.
 */
function contornoArco(n: number): string[] {
  return [
    `#${n}=IFCCARTESIANPOINTLIST2D(((-0.5,0.),(0.5,0.),(0.5,1.5),(0.25,1.9330127),(-0.5,1.5)));`,
    `#${n + 1}=IFCINDEXEDPOLYCURVE(#${n},(IFCLINEINDEX((1,2)),IFCLINEINDEX((2,3)),IFCARCINDEX((3,4,5)),IFCLINEINDEX((5,1))),$);`,
    `#${n + 2}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${n + 1});`,
  ];
}

/** Produto com o contorno em arco extrudado na horizontal, atravessando a parede (eixo Y). Id do produto: `n + 10`. */
function produtoArco(n: number, type: string, name: string, tail: string): string[] {
  return [
    ...contornoArco(n),
    `#${n + 3}=IFCCARTESIANPOINT((2.,0.2,0.));`,
    `#${n + 4}=IFCDIRECTION((0.,-1.,0.));`,
    `#${n + 5}=IFCDIRECTION((1.,0.,0.));`,
    `#${n + 6}=IFCAXIS2PLACEMENT3D(#${n + 3},#${n + 4},#${n + 5});`,
    `#${n + 7}=IFCEXTRUDEDAREASOLID(#${n + 2},#${n + 6},#9,0.4);`,
    `#${n + 8}=IFCSHAPEREPRESENTATION(#2,'Body','SweptSolid',(#${n + 7}));`,
    `#${n + 9}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n + 8}));`,
    `#${n + 10}=${type}('${gid(n + 10)}',$,'${name}',$,$,#7,#${n + 9},$${tail ? `,${tail}` : ''});`,
  ];
}

describe('IfcIndexedPolyCurve com IfcArcIndex', () => {
  it('amostra o arco (topo em (0;2)) com erro de até 1 mm, e não só pelos pontos de controle', () => {
    const f = new IfcFile(ifcBoxes([], contornoArco(9100)));
    const pts = curvePoints(f, f.entity(9101))!;
    // Área exata: retângulo 1,0 x 1,5 mais meio disco de raio 0,5 = 1,5 + π·0,25/2.
    expect(area(pts)).toBeCloseTo(1.5 + (Math.PI * 0.25) / 2, 2);
    // Cada ponto do arco fica a no máximo 1 mm do círculo (centro (0;1,5), raio 0,5).
    for (const p of pts) if (p.y > 1.5 + 1e-6) expect(Math.abs(Math.hypot(p.x, p.y - 1.5) - 0.5)).toBeLessThanOrEqual(0.001);
    // O topo do arco entra na amostragem (antes ele era 1,933).
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(2, 2);
  });

  it('sem Segments, a polilinha segue a ordem dos pontos (comportamento anterior)', () => {
    const f = new IfcFile(ifcBoxes([], [`#9100=IFCCARTESIANPOINTLIST2D(((0.,0.),(1.,0.),(1.,1.)));`, `#9101=IFCINDEXEDPOLYCURVE(#9100,$,$);`]));
    expect(curvePoints(f, f.entity(9101))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('arco de três pontos colineares vira reta; arco normal passa pelo lado de b', () => {
    expect(arcPoints({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    // Semicírculo superior de raio 1 via (0;1): a amostra passa perto de (0;1), não de (0;-1).
    const pts = arcPoints({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
    expect(pts.some((p) => Math.abs(p.y - 1) < 0.002 && Math.abs(p.x) < 0.002)).toBe(true);
    expect(pts.every((p) => p.y >= -1e-9)).toBe(true);
  });
});

describe('vão com perfil não retangular', () => {
  it('reproduz o IFC de arco: a janela sai com a altura do topo (2,00 m), não com o pico dos pontos (1,93 m)', () => {
    const src = ifcBoxes(
      [paredeCaixa],
      [
        ...produtoArco(9100, 'IFCOPENINGELEMENT', 'V', ''),
        ...produtoArco(9200, 'IFCWINDOW', 'J1', '2.,1.,$,$'),
        `#9301=IFCRELVOIDSELEMENT('${gid(9301)}',$,$,$,${ref(1)},#9110);`,
        `#9302=IFCRELFILLSELEMENT('${gid(9302)}',$,$,$,#9110,#9210);`,
      ],
    );
    const { project, report } = importIfc(src);
    const janelas = lista<Opening>(project, 'window');
    expect(janelas).toHaveLength(1);
    const tipo = project.openingTypes[janelas[0]!.typeId]!;
    expect(tipo.width).toBeCloseTo(1, 2);
    expect(tipo.height).toBeCloseTo(2, 2);
    expect(janelas[0]!.hostId).toBe(lista<Wall>(project, 'wall')[0]!.id);
    expect(report.warnings.some((m) => m.startsWith('Janela "J1": o vão não é retangular') && m.includes('caixa envolvente'))).toBe(true);
  });

  it('janela retangular não gera o aviso de forma', () => {
    const janela: TestBox = { id: 2, type: 'IFCWINDOW', name: 'J2', x: 2, y: -0.1, z: 0.9, dx: 1, dy: 0.2, dz: 1.2, tail: '1.2,1.,$,$' };
    const { project, report } = importIfc(ifcBoxes([paredeCaixa, janela]));
    expect(lista(project, 'window')).toHaveLength(1);
    expect(report.warnings.some((m) => m.includes('não é retangular'))).toBe(false);
  });
});

describe('desempenho do tipo a partir dos psets', () => {
  const psets = [
    "#9401=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI 30'),$);",
    "#9402=IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,IFCTHERMALTRANSMITTANCEMEASURE(1.4),$);",
    "#9403=IFCPROPERTYSINGLEVALUE('AcousticRating',$,IFCLABEL('Rw 32 dB'),$);",
    "#9404=IFCPROPERTYSINGLEVALUE('SolarHeatGainTransmittance',$,IFCPOSITIVERATIOMEASURE(0.45),$);",
    `#9405=IFCPROPERTYSET('${gid(9405)}',$,'Pset_WindowCommon',$,(#9401,#9402,#9403));`,
    `#9406=IFCPROPERTYSET('${gid(9406)}',$,'Pset_DoorWindowGlazingType',$,(#9404));`,
  ];
  const janela: TestBox = { id: 2, type: 'IFCWINDOW', name: 'J3', x: 2, y: -0.1, z: 0.9, dx: 1, dy: 0.2, dz: 1.2, tail: '1.2,1.,$,$' };

  it('lê FireRating, U, Rw e fator solar da ocorrência (Pset_WindowCommon e Pset_DoorWindowGlazingType)', () => {
    const extra = [
      ...psets,
      `#9407=IFCRELDEFINESBYPROPERTIES('${gid(9407)}',$,$,$,(${ref(2)}),#9405);`,
      `#9408=IFCRELDEFINESBYPROPERTIES('${gid(9408)}',$,$,$,(${ref(2)}),#9406);`,
    ];
    const { project } = importIfc(ifcBoxes([paredeCaixa, janela], extra));
    const tipo = project.openingTypes[lista<Opening>(project, 'window')[0]!.typeId]!;
    expect(tipo.fireRating).toBe('EI 30');
    expect(tipo.uValue).toBeCloseTo(1.4, 6);
    expect(tipo.acousticRw).toBe(32);
    expect(tipo.solarFactor).toBeCloseTo(0.45, 6);
  });

  it('lê os mesmos campos dos psets ligados ao tipo (HasPropertySets), via IfcRelDefinesByType', () => {
    const extra = [
      ...psets,
      `#9420=IFCWINDOWTYPE('${gid(9420)}',$,'Janela tipo',$,$,(#9405,#9406),$,$,.WINDOW.,.SINGLE_PANEL.,$);`,
      `#9421=IFCRELDEFINESBYTYPE('${gid(9421)}',$,$,$,(${ref(2)}),#9420);`,
    ];
    const { project } = importIfc(ifcBoxes([paredeCaixa, janela], extra));
    const tipo = project.openingTypes[lista<Opening>(project, 'window')[0]!.typeId]!;
    expect(tipo.name.startsWith('Janela tipo')).toBe(true);
    expect(tipo.fireRating).toBe('EI 30');
    expect(tipo.uValue).toBeCloseTo(1.4, 6);
    expect(tipo.acousticRw).toBe(32);
    expect(tipo.solarFactor).toBeCloseTo(0.45, 6);
  });

  it('Rw em texto: aceita "30 dB", "Rw 32" e "Rw(C;Ctr) 32 (-1;-3)"; sem número não entra', () => {
    expect(acousticRwOf('30 dB')).toBe(30);
    expect(acousticRwOf('Rw 32')).toBe(32);
    expect(acousticRwOf('Rw(C;Ctr) 32 (-1;-3) dB')).toBe(32);
    expect(acousticRwOf(27)).toBe(27);
    expect(acousticRwOf('EI 30')).toBeNull();
    expect(acousticRwOf('')).toBeNull();
    expect(acousticRwOf(undefined)).toBeNull();
  });
});

describe('operação da janela pelos IfcWindowPanelProperties', () => {
  const painel = (n: number, op: string): string[] => [
    `#${n}=IFCWINDOWPANELPROPERTIES('${gid(n)}',$,'Painel',$,.${op}.,.NOTDEFINED.,$,$);`,
    `#${n + 1}=IFCRELDEFINESBYPROPERTIES('${gid(n + 1)}',$,$,$,(${ref(2)}),#${n});`,
  ];
  const janela: TestBox = { id: 2, type: 'IFCWINDOW', name: 'J4', x: 2, y: -0.1, z: 0.9, dx: 1, dy: 0.2, dz: 1.2, tail: '1.2,1.,$,$' };

  it('um painel de dobradiça à direita dá flipHand; a janela continua com uma folha', () => {
    const { project } = importIfc(ifcBoxes([paredeCaixa, janela], painel(9501, 'SIDEHUNGRIGHTHAND')));
    const [op] = lista<Opening>(project, 'window');
    expect(op!.flipHand).toBe(true);
    expect(project.openingTypes[op!.typeId]!.leaves).toBe(1);
  });

  it('dois painéis que abrem viram duas folhas; painel fixo não conta como folha', () => {
    const dois = [...painel(9501, 'SIDEHUNGLEFTHAND'), ...painel(9503, 'SIDEHUNGRIGHTHAND')];
    const { project } = importIfc(ifcBoxes([paredeCaixa, janela], dois));
    const [op] = lista<Opening>(project, 'window');
    expect(project.openingTypes[op!.typeId]!.leaves).toBe(2);
    expect(project.openingTypes[op!.typeId]!.plan).toBe('double');
    expect(op!.flipHand).toBe(false);

    const comFixo = [...painel(9501, 'FIXEDCASEMENT'), ...painel(9503, 'SIDEHUNGRIGHTHAND')];
    const r = importIfc(ifcBoxes([paredeCaixa, janela], comFixo));
    const [op2] = lista<Opening>(r.project, 'window');
    expect(r.project.openingTypes[op2!.typeId]!.leaves).toBe(1);
    expect(op2!.flipHand).toBe(true);
  });

  it('sem painel informado, mantém o padrão (sem flipHand, uma folha)', () => {
    const { project } = importIfc(ifcBoxes([paredeCaixa, janela]));
    const [op] = lista<Opening>(project, 'window');
    expect(op!.flipHand).toBe(false);
    expect(project.openingTypes[op!.typeId]!.leaves).toBe(1);
  });
});
