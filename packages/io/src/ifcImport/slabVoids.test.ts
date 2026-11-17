import { describe, expect, it } from 'vitest';
import type { Floor } from '@hestia/model';
import { importIfc } from './index.ts';

/** Laje 4×4 m, 0,2 m de espessura, com um `IfcOpeningElement` 1×1 m (vão de escada) que NÃO recorta a geometria da laje. */
const ifc = (comVao: boolean): string => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('v.ifc','2026-01-01T00:00:00',(''),(''),'t','t','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCPROJECT('p0000000000000000000A1',$,'P',$,$,$,$,$,#2);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCAXIS2PLACEMENT3D(#10,$,$);
#12=IFCLOCALPLACEMENT($,#11);
#13=IFCDIRECTION((0.,0.,1.));
#20=IFCRECTANGLEPROFILEDEF(.AREA.,$,#21,4.,4.);
#21=IFCAXIS2PLACEMENT2D(#22,$);
#22=IFCCARTESIANPOINT((2.,2.));
#23=IFCEXTRUDEDAREASOLID(#20,#11,#13,0.2);
#24=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#23));
#25=IFCPRODUCTDEFINITIONSHAPE($,$,(#24));
#26=IFCSLAB('s0000000000000000000A1',$,'Laje',$,$,#12,#25,$,.FLOOR.);
#30=IFCRECTANGLEPROFILEDEF(.AREA.,$,#31,1.,1.);
#31=IFCAXIS2PLACEMENT2D(#32,$);
#32=IFCCARTESIANPOINT((2.,2.));
#33=IFCEXTRUDEDAREASOLID(#30,#11,#13,0.2);
#34=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#33));
#35=IFCPRODUCTDEFINITIONSHAPE($,$,(#34));
#36=IFCOPENINGELEMENT('o0000000000000000000A1',$,'Vao',$,$,#12,#35,$,.OPENING.);
${comVao ? "#37=IFCRELVOIDSELEMENT('r0000000000000000000A1',$,$,$,#26,#36);" : ''}
ENDSEC;
END-ISO-10303-21;
`;

const lajes = (texto: string): Floor[] => Object.values(importIfc(texto).project.elements).filter((e): e is Floor => e.kind === 'floor');

describe('vãos de laje/piso', () => {
  it('um IfcOpeningElement sem preenchimento vira furo da laje', () => {
    const [laje] = lajes(ifc(true));
    expect(laje?.holes).toHaveLength(1);
    const xs = laje!.holes[0]!.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(1.5, 6);
    expect(Math.max(...xs)).toBeCloseTo(2.5, 6);
  });

  it('sem a relação de vão não há furo', () => {
    expect(lajes(ifc(false))[0]?.holes).toHaveLength(0);
  });
});
