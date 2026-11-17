import { describe, expect, it } from 'vitest';
import { bodyOf, rectangleAxis } from './geometry.ts';
import { IfcFile } from './ifc.ts';

describe('eixo de parede a partir do contorno', () => {
  it('usa o lado maior como comprimento, mesmo quando o contorno começa pela ponta curta', () => {
    // Fachada 20 × 0,20 m; o anel começa pela aresta curta (0,0)→(0,0,2), que antes virava "comprimento".
    const loop = [
      { x: 0, y: 0 },
      { x: 0, y: 0.2 },
      { x: 20, y: 0.2 },
      { x: 20, y: 0 },
    ];
    const rect = rectangleAxis(loop);
    expect(rect).not.toBeNull();
    expect(rect!.length).toBeCloseTo(20, 6);
    expect(rect!.thickness).toBeCloseTo(0.2, 6);
    expect(Math.hypot(rect!.a.x - rect!.b.x, rect!.a.y - rect!.b.y)).toBeCloseTo(20, 6);
    expect(rect!.a.y).toBeCloseTo(0.1, 6);
    expect(rect!.b.y).toBeCloseTo(0.1, 6);
  });

  it('recusa forma em L e aceita retângulo com pequeno chanfro', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(rectangleAxis(L)).toBeNull();
    const chamfrado = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 0.3 },
      { x: 0.1, y: 0.3 },
      { x: 0, y: 0.2 },
    ];
    expect(rectangleAxis(chamfrado)?.length).toBeCloseTo(3, 6);
  });
});

/** Um IFCPLATE cuja representação `Body` é um modelo de superfície; `modelo` traz a entidade do modelo e seu conjunto. */
function ifcDeSuperficie(modelo: string): string {
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('teste.ifc','2026-10-28',(''),(''),'','','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    "#1 = IFCPLATE('g1',$,'Cortina',$,$,$,#2,$,$);",
    '#2 = IFCPRODUCTDEFINITIONSHAPE($,$,(#3));',
    "#3 = IFCSHAPEREPRESENTATION($,'Body','SurfaceModel',(#4));",
    modelo,
    '#101 = IFCCARTESIANPOINT((0.,0.,0.));',
    '#102 = IFCCARTESIANPOINT((2.,0.,0.));',
    '#103 = IFCCARTESIANPOINT((2.,2.,0.));',
    '#104 = IFCCARTESIANPOINT((0.,2.,0.));',
    '#105 = IFCCARTESIANPOINT((0.,0.,2.));',
    '#110 = IFCFACE((#111));',
    '#111 = IFCFACEOUTERBOUND(#112,.T.);',
    '#112 = IFCPOLYLOOP((#101,#102,#103,#104));',
    '#120 = IFCFACE((#121));',
    '#121 = IFCFACEOUTERBOUND(#122,.T.);',
    '#122 = IFCPOLYLOOP((#101,#103,#105));',
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');
}

describe('faces de modelo de superfície', () => {
  it('lê as faces de um IFCFACEBASEDSURFACEMODEL (lista de IFCCONNECTEDFACESET)', () => {
    const f = new IfcFile(ifcDeSuperficie('#4 = IFCFACEBASEDSURFACEMODEL((#5));\n#5 = IFCCONNECTEDFACESET((#110,#120));'));
    const body = bodyOf(f, f.entity(1)!);
    // Quadrado (2 triângulos) + triângulo = 3 triângulos, 9 números cada.
    expect(body.tris.length).toBe(27);
    expect(body.tris).toContain(2);
  });

  it('lê as faces de um IFCSHELLBASEDSURFACEMODEL (lista de IFCSHELL)', () => {
    const f = new IfcFile(ifcDeSuperficie('#4 = IFCSHELLBASEDSURFACEMODEL((#5));\n#5 = IFCCLOSEDSHELL((#110,#120));'));
    const body = bodyOf(f, f.entity(1)!);
    expect(body.tris.length).toBe(27);
  });
});

describe('mapa de representação compartilhado (cache por mapa)', () => {
  const ifc = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('teste.ifc','2026-10-28',(''),(''),'','','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    '#50 = IFCCARTESIANPOINT((0.,0.,0.));',
    '#51 = IFCAXIS2PLACEMENT3D(#50,$,$);',
    // Conteúdo do mapa: laje 2 × 1 × 3 (extrusão) + quadrado 2 × 2 solto.
    '#60 = IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,1.);',
    '#61 = IFCEXTRUDEDAREASOLID(#60,#51,#62,3.);',
    '#62 = IFCDIRECTION((0.,0.,1.));',
    '#101 = IFCCARTESIANPOINT((0.,0.,0.));',
    '#102 = IFCCARTESIANPOINT((2.,0.,0.));',
    '#103 = IFCCARTESIANPOINT((2.,2.,0.));',
    '#104 = IFCCARTESIANPOINT((0.,2.,0.));',
    '#110 = IFCFACE((#111));',
    '#111 = IFCFACEOUTERBOUND(#112,.T.);',
    '#112 = IFCPOLYLOOP((#101,#102,#103,#104));',
    '#120 = IFCFACEBASEDSURFACEMODEL((#121));',
    '#121 = IFCCONNECTEDFACESET((#110));',
    '#130 = IFCSHAPEREPRESENTATION($,\'Body\',\'Mixed\',(#61,#120));',
    '#131 = IFCREPRESENTATIONMAP(#51,#130);',
    // Uso A: operador 3D com escala 2, eixo X do operador = +Y, eixo Y = -X, origem (10,20,5).
    '#140 = IFCDIRECTION((0.,1.,0.));',
    '#141 = IFCDIRECTION((-1.,0.,0.));',
    '#142 = IFCCARTESIANPOINT((10.,20.,5.));',
    '#143 = IFCCARTESIANTRANSFORMATIONOPERATOR3D(#140,#141,#142,2.,$);',
    '#144 = IFCMAPPEDITEM(#131,#143);',
    // Uso B: operador identidade, produto deslocado.
    '#145 = IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#50,1.,$);',
    '#146 = IFCMAPPEDITEM(#131,#145);',
    "#150 = IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#144));",
    "#151 = IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#146));",
    '#152 = IFCPRODUCTDEFINITIONSHAPE($,$,(#150));',
    '#153 = IFCPRODUCTDEFINITIONSHAPE($,$,(#151));',
    '#154 = IFCCARTESIANPOINT((100.,0.,0.));',
    '#155 = IFCAXIS2PLACEMENT3D(#154,$,$);',
    '#156 = IFCLOCALPLACEMENT($,#155);',
    "#1 = IFCPLATE('g1',$,'A',$,$,$,#152,$,$);",
    "#2 = IFCPLATE('g2',$,'B',$,$,#156,#153,$,$);",
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');

  it('transforma o mesmo mapa por matrizes diferentes (inclusive escala) sem reler o conteúdo', () => {
    const f = new IfcFile(ifc);
    const a = bodyOf(f, f.entity(1)!);
    const b = bodyOf(f, f.entity(2)!);
    for (const body of [a, b]) {
      expect(body.prisms.length).toBe(1);
      expect(body.unsupported).toEqual([]);
      // extrusão: 4 laterais × 2 + 4 das tampas = 12 triângulos; quadrado solto: 2.
      expect(body.tris.length).toBe(14 * 9);
    }
    // A: x' = 10 - 2y, y' = 20 + 2x, z = 5 + 2z (escala 2): retângulo ±1 × ±0,5 vira ±1 em x e ±2 em y.
    const pa = a.prisms[0]!;
    const xs = pa.loops[0]!.map((p) => p.x).sort((m, n) => m - n);
    const ys = pa.loops[0]!.map((p) => p.y).sort((m, n) => m - n);
    expect(xs[0]).toBeCloseTo(9, 9);
    expect(xs[3]).toBeCloseTo(11, 9);
    expect(ys[0]).toBeCloseTo(18, 9);
    expect(ys[3]).toBeCloseTo(22, 9);
    expect(pa.z0).toBeCloseTo(5, 9);
    expect(pa.z1).toBeCloseTo(11, 9);
    // Ponto (2,0,0) do quadrado solto → (10, 24, 5).
    const solto = a.tris.slice(12 * 9);
    expect(solto.slice(3, 6).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([10, 24, 5]);
    // B: só a translação do produto (100, 0, 0).
    const pb = b.prisms[0]!;
    const bx = pb.loops[0]!.map((p) => p.x).sort((m, n) => m - n);
    expect(bx[0]).toBeCloseTo(99, 9);
    expect(bx[3]).toBeCloseTo(101, 9);
    expect(pb.z0).toBeCloseTo(0, 9);
    expect(pb.z1).toBeCloseTo(3, 9);
    expect(b.tris.slice(12 * 9 + 3, 12 * 9 + 6)).toEqual([102, 0, 0]);
    // Uma segunda leitura (do cache) devolve o mesmo.
    expect(bodyOf(f, f.entity(1)!)).toEqual(a);
  });
});
