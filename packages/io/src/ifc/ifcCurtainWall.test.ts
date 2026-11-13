import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeLevel, makeWall, mullionTypesOf, type MullionType, type Project, type WallType } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import type { IfcCurtainGeo, IfcCurtainPrototypeGeo, IfcCurtainWallGeo, IfcGeometry } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const linhas = (text: string, type: string): string[] => text.split('\n').filter((l) => l.includes(`=${type}(`));

/** Malha sintética de uma caixa (8 vértices, 12 triângulos): o protótipo de qualquer papel nos testes. */
const caixa = (): IfcCurtainPrototypeGeo['mesh'] => ({
  positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
});

/**
 * Matriz 3 × 4 linha-maior: `largura` no eixo X, `profundidade` no Y, `altura` no Z, origem `(x, y, z)`. É a forma que o kernel devolve
 * (`cortina_malha`), com colunas ortogonais e escala.
 */
const matriz = (x: number, y: number, z: number, largura: number, profundidade: number, altura: number): number[] => [
  largura, 0, 0, x,
  0, profundidade, 0, y,
  0, 0, altura, z,
];

const PROTOS: IfcCurtainPrototypeGeo[] = [
  { proto: 0, papel: 0, typeId: 'mul_ret_50x100', shape: 'rect', materialId: 'mat_aluminio', mesh: caixa() },
  { proto: 1, papel: 1, typeId: 'pnl_vidro_10', materialId: 'mat_vidro', mesh: caixa() },
  { proto: 2, papel: 2, typeId: 'pnl_solido_alu_4', materialId: 'mat_aluminio', mesh: caixa() },
];

/** Uma cortina de 6 m (dois montantes verticais de 3 m em x = 0 e x = 6), dois painéis de vidro e um sólido. */
const CORTINA: IfcCurtainWallGeo = {
  wallId: 'ct1',
  footprint: [[{ x: 0, y: -0.05 }, { x: 6, y: -0.05 }, { x: 6, y: 0.05 }, { x: 0, y: 0.05 }]],
  instances: [
    { proto: 0, matrix: matriz(0, 0, 0, 0.05, 0.1, 3) },
    { proto: 0, matrix: matriz(6, 0, 0, 0.05, 0.1, 3) },
    { proto: 1, matrix: matriz(0.5, 0, 0.1, 1.4, 0.01, 2.8) },
    { proto: 1, matrix: matriz(2, 0, 0.1, 1.4, 0.01, 2.8) },
    { proto: 2, matrix: matriz(4.5, 0, 0.1, 1.4, 0.004, 2.8) },
  ],
  quantities: { length: 6, grossArea: 18, glassArea: 5.6, solidArea: 3.92, mullionLength: 6 },
};

/** Projeto com a parede cortina `ct1` (tipo `wt_ct`) no nível `lv_0`, e um nível `lv_1` a 3 m. */
function projeto(extra: { mullionTypes?: Record<string, MullionType>; nivel?: string } = {}): Project {
  const base = createEmptyProject('Teste');
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
    layers: [],
    strips: [],
    wrapInserts: 'none',
    wrapEnds: 'none',
  };
  const parede = { ...makeWall({ id: 'ct1', typeId: 'wt_ct', levelId: extra.nivel ?? 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }), order: 1 };
  return {
    ...base,
    wallTypes: { ...base.wallTypes, wt_ct: tipo },
    levels: [...base.levels, makeLevel({ id: 'lv_1', name: 'N1', elevation: 3 })],
    elements: { ...base.elements, ct1: parede as Project['elements'][string] },
    ...(extra.mullionTypes ? { mullionTypes: { ...mullionTypesOf(base), ...extra.mullionTypes } } : {}),
  };
}

const geoCom = (curtains: IfcCurtainGeo): IfcGeometry => ({ walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [], curtains });
const GEO = geoCom({ prototypes: PROTOS, walls: [CORTINA] });

describe('exportIfc: parede cortina pelo kernel', () => {
  const text = exportIfc(projeto(), GEO, { timestamp: TS });

  it('sai uma IFCCURTAINWALL contida no pavimento, sem IFCWALL no lugar dela', () => {
    expect(count(text, 'IFCCURTAINWALL')).toBe(1);
    expect(count(text, 'IFCWALL')).toBe(0);
    const linha = linhas(text, 'IFCCURTAINWALL')[0]!;
    expect(linha).toContain("'Cortina teste'");
    expect(count(text, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(1);
  });

  it('agrega montantes e painéis à parede por IFCRELAGGREGATES (um agregado com as 5 peças)', () => {
    expect(count(text, 'IFCMEMBER')).toBe(2);
    expect(count(text, 'IFCPLATE')).toBe(3);
    const cortina = linhas(text, 'IFCCURTAINWALL')[0]!.match(/^#(\d+)=/)![1];
    const agregado = linhas(text, 'IFCRELAGGREGATES').find((l) => l.includes(`,#${cortina},(`));
    expect(agregado).toBeDefined();
    expect(agregado!.split(',(')[1]!.split(',')).toHaveLength(5);
  });

  it('usa o PredefinedType certo: MULLION no montante, CURTAIN_PANEL no vidro e SHEET no sólido', () => {
    expect(linhas(text, 'IFCMEMBER').every((l) => l.endsWith(".MULLION.);"))).toBe(true);
    const plates = linhas(text, 'IFCPLATE');
    expect(plates.filter((l) => l.endsWith(".CURTAIN_PANEL.);"))).toHaveLength(2);
    expect(plates.filter((l) => l.endsWith(".SHEET.);"))).toHaveLength(1);
  });

  it('cada protótipo vira UMA IFCREPRESENTATIONMAP; cada peça um IFCMAPPEDITEM que aponta para ela', () => {
    expect(count(text, 'IFCREPRESENTATIONMAP')).toBe(3);
    expect(count(text, 'IFCMAPPEDITEM')).toBe(5);
    const mapped = linhas(text, 'IFCMAPPEDITEM');
    // Dois montantes apontam para o mesmo mapa (o do protótipo 0).
    const mapas = mapped.map((l) => l.match(/IFCMAPPEDITEM\((#\d+),/)![1]);
    expect(new Set(mapas).size).toBe(3);
    expect(mapas[0]).toBe(mapas[1]);
  });

  it('o operador leva o protótipo à matriz: escalas são os comprimentos das colunas, origem na cota do pavimento', () => {
    const op = linhas(text, 'IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM')[0]!;
    // Escala X = largura (0,05), Y = profundidade (0,10), Z = altura (3,0).
    expect(op).toMatch(/,0\.050000,#\d+,0\.100000,3\.000000\);$/);
    // Origem do primeiro montante: (0, 0, 0) no nível 0.
    const origem = linhas(text, 'IFCCARTESIANPOINT').find((l) => l.includes('(0.000000,0.000000,0.000000)'));
    expect(origem).toBeDefined();
  });

  it('a cota da origem desconta a elevação do pavimento', () => {
    const t = projeto({ nivel: 'lv_1' });
    const geo = geoCom({
      prototypes: PROTOS,
      walls: [{ ...CORTINA, instances: [{ proto: 0, matrix: matriz(1.5, 0, 3.2, 0.05, 0.1, 3) }] }],
    });
    const out = exportIfc(t, geo, { timestamp: TS });
    expect(out).toContain('(1.500000,0.000000,0.200000)');
    expect(out).not.toContain('(1.500000,0.000000,3.200000)');
  });

  it('Pset_CurtainWallCommon, Pset_MemberCommon, Pset_PlateCommon e o Qto_CurtainWallBaseQuantities', () => {
    // Um conjunto por peça e um da parede: 1 de parede, 2 de montante e 3 de painel (o projeto tem o seu próprio conjunto).
    expect(linhas(text, 'IFCPROPERTYSET').filter((l) => l.includes("'Pset_CurtainWallCommon'"))).toHaveLength(1);
    expect(linhas(text, 'IFCPROPERTYSET').filter((l) => l.includes("'Pset_MemberCommon'"))).toHaveLength(2);
    expect(linhas(text, 'IFCPROPERTYSET').filter((l) => l.includes("'Pset_PlateCommon'"))).toHaveLength(3);
    expect(text).toContain("'Qto_CurtainWallBaseQuantities'");
    expect(text).toMatch(/IFCQUANTITYAREA\('GlassArea',\$,\$,5\.600000,\$\)/);
    expect(text).toMatch(/IFCQUANTITYAREA\('SolidArea',\$,\$,3\.920000,\$\)/);
    expect(text).toMatch(/IFCQUANTITYLENGTH\('MullionLength',\$,\$,6\.000000,\$\)/);
    expect(text).toMatch(/IFCQUANTITYAREA\('GrossArea',\$,\$,18\.000000,\$\)/);
  });

  it('tipos: IFCCURTAINWALLTYPE, IFCMEMBERTYPE e IFCPLATETYPE, ligados por IFCRELDEFINESBYTYPE', () => {
    expect(count(text, 'IFCCURTAINWALLTYPE')).toBe(1);
    expect(count(text, 'IFCMEMBERTYPE')).toBe(1);
    expect(count(text, 'IFCPLATETYPE')).toBe(2);
    const tipos = linhas(text, 'IFCRELDEFINESBYTYPE');
    expect(tipos).toHaveLength(4);
    expect(linhas(text, 'IFCPLATETYPE').some((l) => l.endsWith(".CURTAIN_PANEL.);"))).toBe(true);
    expect(linhas(text, 'IFCPLATETYPE').some((l) => l.endsWith(".SHEET.);"))).toBe(true);
  });

  it('é determinístico: a mesma entrada dá o mesmo texto', () => {
    expect(exportIfc(projeto(), GEO, { timestamp: TS })).toBe(text);
  });
});

describe('exportIfc: montante em canto e instâncias descartadas', () => {
  it('montante com forma corner sai USERDEFINED com ObjectType CORNER', () => {
    const canto: MullionType = { id: 'mul_canto', name: 'Canto', profile: { shape: 'corner', width: 0.05, depth: 0.05, thickness: 0.003 }, materialId: 'mat_aluminio' };
    const protos = [{ ...PROTOS[0]!, typeId: 'mul_canto', shape: 'corner' }, PROTOS[1]!, PROTOS[2]!];
    const out = exportIfc(projeto({ mullionTypes: { mul_canto: canto } }), geoCom({ prototypes: protos, walls: [CORTINA] }), { timestamp: TS });
    const membro = linhas(out, 'IFCMEMBER')[0]!;
    expect(membro).toContain("'CORNER'");
    expect(membro.endsWith(".USERDEFINED.);")).toBe(true);
  });

  it('instância de protótipo ausente ou com matriz degenerada não sai', () => {
    const walls: IfcCurtainWallGeo[] = [
      { ...CORTINA, instances: [{ proto: 99, matrix: matriz(0, 0, 0, 0.05, 0.1, 3) }, { proto: 0, matrix: matriz(0, 0, 0, 0, 0.1, 3) }, { proto: 0, matrix: matriz(6, 0, 0, 0.05, 0.1, 3) }] },
    ];
    const out = exportIfc(projeto(), geoCom({ prototypes: PROTOS, walls }), { timestamp: TS });
    expect(count(out, 'IFCMEMBER')).toBe(1);
    expect(count(out, 'IFCMAPPEDITEM')).toBe(1);
  });

  it('cortina sem instâncias ainda sai como IFCCURTAINWALL, sem agregado', () => {
    const walls: IfcCurtainWallGeo[] = [{ ...CORTINA, instances: [] }];
    const out = exportIfc(projeto(), geoCom({ prototypes: PROTOS, walls }), { timestamp: TS });
    expect(count(out, 'IFCCURTAINWALL')).toBe(1);
    const cortina = linhas(out, 'IFCCURTAINWALL')[0]!.match(/^#(\d+)=/)![1];
    expect(linhas(out, 'IFCRELAGGREGATES').filter((l) => l.includes(`,#${cortina},(`))).toHaveLength(0);
  });
});

describe('exportIfc: cortina sem geometria do kernel', () => {
  /** Sem kernel a cortina entra como parede genérica: um `IfcWallGeo` com o contorno e a cota, como as paredes comuns. */
  const genericaCortina = {
    wallId: 'ct1',
    footprints: [CORTINA.footprint],
    baseZ: 0,
    height: 3,
  };

  it('sai como IFCWALL, sem IFCCURTAINWALL, e registra o aviso no idioma da exportação', () => {
    const avisos: string[] = [];
    const geo: IfcGeometry = { walls: [genericaCortina], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };
    const out = exportIfc(projeto(), geo, { timestamp: TS, avisos });
    expect(count(out, 'IFCWALL')).toBe(1);
    expect(count(out, 'IFCCURTAINWALL')).toBe(0);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Cortina teste');
  });

  it('em inglês, o aviso sai em inglês', () => {
    const avisos: string[] = [];
    const geo: IfcGeometry = { walls: [genericaCortina], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };
    exportIfc(projeto(), geo, { timestamp: TS, lang: 'en', avisos });
    expect(avisos[0]).toContain('has no kernel geometry');
  });

  it('sem coletor de avisos, a exportação não quebra', () => {
    const geo: IfcGeometry = { walls: [genericaCortina], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };
    expect(() => exportIfc(projeto(), geo, { timestamp: TS })).not.toThrow();
  });

  it('sem nenhuma cortina no projeto, nada de cortina e nenhum aviso', () => {
    const avisos: string[] = [];
    const out = exportIfc(createEmptyProject('Vazio'), { walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [] }, { timestamp: TS, avisos });
    expect(out).not.toContain('IFCCURTAINWALL');
    expect(avisos).toEqual([]);
  });
});
