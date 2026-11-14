/** IFC mínimo escrito à mão para os testes de importação: produtos com extrusão retangular (caixas) e relações extras. */

export interface TestBox {
  /** Número do produto (único, >= 1); `ref(id)` dá o `#n` da entidade nas relações extras. */
  id: number;
  type: string;
  name: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  /** Rotação em planta, graus. */
  angle?: number;
  /** Atributos depois da `Tag` (atributo 7), crus: `PredefinedType`, alturas... Padrão: nenhum. */
  tail?: string;
}

/** Id da entidade do produto no arquivo gerado (`#<n>`). */
export const ref = (id: number): string => `#${1000 + id * 20 + 10}`;

export function ifcBoxes(boxes: TestBox[], extra: string[] = [], schema = 'IFC4'): string {
  const lines: string[] = [
    "#1=IFCPROJECT('0000000000000000000001',$,'P',$,$,$,$,(#2),#3);",
    "#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#4,$);",
    '#3=IFCUNITASSIGNMENT((#5));',
    '#4=IFCAXIS2PLACEMENT3D(#6,$,$);',
    '#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',
    '#6=IFCCARTESIANPOINT((0.,0.,0.));',
    '#7=IFCLOCALPLACEMENT($,#4);',
    '#9=IFCDIRECTION((0.,0.,1.));',
  ];
  for (const b of boxes) {
    const a = ((b.angle ?? 0) * Math.PI) / 180;
    const n = 1000 + b.id * 20;
    const el = n + 10;
    lines.push(
      `#${n}=IFCCARTESIANPOINT((${b.x},${b.y},${b.z}));`,
      `#${n + 1}=IFCDIRECTION((${Math.cos(a)},${Math.sin(a)},0.));`,
      `#${n + 2}=IFCAXIS2PLACEMENT3D(#${n},$,#${n + 1});`,
      `#${n + 3}=IFCLOCALPLACEMENT($,#${n + 2});`,
      `#${n + 4}=IFCCARTESIANPOINT((${b.dx / 2},${b.dy / 2}));`,
      `#${n + 5}=IFCAXIS2PLACEMENT2D(#${n + 4},$);`,
      `#${n + 6}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#${n + 5},${b.dx},${b.dy});`,
      `#${n + 7}=IFCEXTRUDEDAREASOLID(#${n + 6},#4,#9,${b.dz});`,
      `#${n + 8}=IFCSHAPEREPRESENTATION(#2,'Body','SweptSolid',(#${n + 7}));`,
      `#${n + 9}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n + 8}));`,
      `#${el}=${b.type}('${String(el).padStart(22, '0')}',$,'${b.name}',$,$,#${n + 3},#${n + 9},$${b.tail ? `,${b.tail}` : ''});`,
    );
  }
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('t','2026-01-01T00:00:00',(''),(''),'','','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n${[...lines, ...extra].join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

/** Produto com malha triangulada (`IFCTRIANGULATEDFACESET`, índices 1-based); devolve as linhas para `extra`. */
export function meshProduct(id: number, type: string, name: string, verts: number[][], faces: number[][], tail?: string): string[] {
  const n = 1000 + id * 20;
  const el = n + 10;
  return [
    `#${n}=IFCCARTESIANPOINTLIST3D((${verts.map((v) => `(${v.join(',')})`).join(',')}));`,
    `#${n + 1}=IFCTRIANGULATEDFACESET(#${n},$,.T.,(${faces.map((f) => `(${f.join(',')})`).join(',')}),$);`,
    `#${n + 2}=IFCSHAPEREPRESENTATION(#2,'Body','Tessellation',(#${n + 1}));`,
    `#${n + 3}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n + 2}));`,
    `#${el}=${type}('${String(el).padStart(22, '0')}',$,'${name}',$,$,#7,#${n + 3},$${tail ? `,${tail}` : ''});`,
  ];
}
