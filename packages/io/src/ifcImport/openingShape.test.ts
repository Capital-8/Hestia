import { describe, expect, it } from 'vitest';
import { buildTemplate, isOpening, isWall, openingSill, openingType, outline, validateOpeningShape, wallBaseElevation, wallHeight, wallType, type Opening, type OpeningShape, type OpeningType, type Wall } from '@hestia/model';
import { areaPerimetroDoContorno, formaDoVao } from '@hestia/engine';
import { exportIfc } from '../ifc/ifcExport.ts';
import { ifcGuid } from '../ifc/ifcGuid.ts';
import type { IfcGeometry, IfcOpeningGeo, IfcPolygon, IfcWallGeo } from '../ifc/ifcTypes.ts';
import { importIfc } from './index.ts';
import { IfcFile } from './ifc.ts';
import { fitOpeningShape, FORMA_EXATA_TOL } from './openingShapeFit.ts';
import type { Pt2 } from './ifc.ts';
import { ifcBoxes, ref, type TestBox } from './ifcTestKit.ts';

const TS = '2026-01-01T00:00:00';
const comoPontos = (ring: ReadonlyArray<readonly [number, number]>): Pt2[] => ring.map(([x, y]) => ({ x, y }));

/** Parede e vãos no eixo, como o exportador recebe do app (vão com `forma` quando o tipo tem forma válida). */
function geometriaDo(p: ReturnType<typeof buildTemplate>): IfcGeometry {
  const walls: IfcWallGeo[] = [];
  const openings: IfcOpeningGeo[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e)) continue;
    const th = wallType(p, e).layers.reduce((s, l) => s + l.thickness, 0) || 0.1;
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * (th / 2);
    const ny = (dx / len) * (th / 2);
    const footprints: IfcPolygon[] = [[[{ x: e.a.x + nx, y: e.a.y + ny }, { x: e.b.x + nx, y: e.b.y + ny }, { x: e.b.x - nx, y: e.b.y - ny }, { x: e.a.x - nx, y: e.a.y - ny }]]];
    walls.push({ wallId: e.id, footprints, baseZ: wallBaseElevation(p, e), height: wallHeight(p, e) });
  }
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e)) continue;
    const host = p.elements[e.hostId] as Wall;
    const t = openingType(p, e);
    const du = { x: host.b.x - host.a.x, y: host.b.y - host.a.y };
    const len = Math.hypot(du.x, du.y);
    const u = { x: du.x / len, y: du.y / len };
    const th = wallType(p, host).layers.reduce((s, l) => s + l.thickness, 0) || 0.1;
    const sillZ = wallBaseElevation(p, host) + openingSill(t, e as Opening);
    const forma = formaDoVao(t, t.height).forma;
    openings.push({
      openingId: e.id,
      center: { x: host.a.x + u.x * e.offset, y: host.a.y + u.y * e.offset },
      u,
      width: t.width,
      height: t.height,
      roughWidth: t.width,
      roughHeight: t.height,
      roughBottomZ: sillZ,
      sillZ,
      thickness: th,
      ...(forma ? { forma } : {}),
    });
  }
  return { walls, openings, floors: [], slabs: [], roofs: [], stairs: [] };
}

/** Projeto com uma janela de forma `shape` (marca `A1`) numa parede de `house2`. */
function projetoComForma(shape: OpeningShape | null, sill = 0.9): ReturnType<typeof buildTemplate> {
  const base = buildTemplate('house2');
  const p = { ...base, openingTypes: { ...base.openingTypes }, elements: { ...base.elements } };
  const host = Object.values(p.elements).find(isWall)!;
  const tipo: OpeningType = {
    id: 't_forma',
    kind: 'window',
    name: 'Janela teste',
    // O vão vale as dimensões do tipo (a forma é só informativa em largura e altura): tipo e forma devem coincidir.
    width: shape?.width ?? 1,
    height: shape?.height ?? 1.8,
    sill,
    leaves: 1,
    plan: 'fixed',
    frameMaterialId: 'mat_aluminio',
    glassMaterialId: 'mat_vidro',
    closure: 'inherit',
    ...(shape ? { shape } : {}),
  };
  p.openingTypes['t_forma'] = tipo;
  const vao: Opening = { id: 'o_forma', kind: 'window', typeId: 't_forma', hostId: host.id, offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: 'A1' };
  p.elements['o_forma'] = vao;
  return p;
}

/** Ida e volta: exporta, reimporta e devolve o tipo da janela `A1` e o relatório de avisos. */
function ida(shape: OpeningShape | null, sill?: number): { tipo: OpeningType; avisos: string[] } {
  const p = projetoComForma(shape, sill);
  const text = exportIfc(p, geometriaDo(p), { timestamp: TS });
  const { project, report } = importIfc(text);
  const janela = Object.values(project.elements).find((e) => isOpening(e) && e.mark === 'A1');
  if (!janela || !isOpening(janela)) throw new Error('janela A1 não voltou no import');
  return { tipo: project.openingTypes[janela.typeId]!, avisos: report.warnings };
}

describe('reconhecimento da forma (fitOpeningShape)', () => {
  const formas: OpeningShape[] = [
    { kind: 'round', width: 1, height: 2 },
    { kind: 'segmental', width: 1.2, height: 1.6, rise: 0.3 },
    { kind: 'pointed', width: 1, height: 1.8, rise: 0.8 },
    { kind: 'circle', width: 1.2, height: 1.2 },
  ];
  for (const forma of formas) {
    it(`reconhece ${forma.kind} a partir do próprio contorno do modelo, sem perda`, () => {
      const fit = fitOpeningShape(comoPontos(outline(forma)));
      expect(fit).not.toBeNull();
      expect(fit!.exact).toBe(true);
      expect(fit!.shape.kind).toBe(forma.kind);
      expect(fit!.dev).toBeLessThanOrEqual(FORMA_EXATA_TOL);
      if ('rise' in forma) expect((fit!.shape as { rise: number }).rise).toBeCloseTo(forma.rise, 2);
    });
  }

  it('retângulo com pontos extras na reta é retângulo (sem forma)', () => {
    const fit = fitOpeningShape(comoPontos([[0, 0], [0.5, 0], [1, 0], [1, 2], [0, 2]]));
    expect(fit!.shape.kind).toBe('rect');
    expect(fit!.exact).toBe(true);
  });

  it('polígono livre próximo de um arco vira a forma mais próxima, não exata', () => {
    // Arco pleno em 8 pontos (corda grossa, desvio acima de 4 mm): aproximado, não exato.
    const ring: Pt2[] = [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1.5 }, { x: 0.354, y: 1.854 }, { x: 0, y: 2 }, { x: -0.354, y: 1.854 }, { x: -0.5, y: 1.5 }];
    const fit = fitOpeningShape(ring);
    expect(fit).not.toBeNull();
    expect(fit!.exact).toBe(false);
    expect(fit!.shape.kind).not.toBe('rect');
    expect(fit!.dev).toBeGreaterThan(FORMA_EXATA_TOL);
    expect(fit!.dev).toBeLessThanOrEqual(0.05);
  });

  it('contorno que não se parece com nenhuma forma e não é polígono simples fica sem ajuste', () => {
    // Pentagrama de um traço só (cinco vértices, lados que se cruzam): nenhuma forma do modelo e não é polígono válido.
    const ring: Pt2[] = [0, 2, 4, 1, 3].map((k) => {
      const a = (k * 2 * Math.PI) / 5 + Math.PI / 2;
      return { x: Math.cos(a) * 0.5, y: 1 + Math.sin(a) * 0.5 };
    });
    expect(fitOpeningShape(ring)).toBeNull();
  });

  it('estrela de cinco pontas (polígono simples côncavo) vira polygon exato, anti-horário e na caixa', () => {
    const ring: Pt2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.5 : 0.1;
      const a = (i * Math.PI) / 5 + Math.PI / 2;
      ring.push({ x: Math.cos(a) * r, y: 1 + Math.sin(a) * r });
    }
    const fit = fitOpeningShape(ring);
    expect(fit!.shape.kind).toBe('polygon');
    expect(fit!.exact).toBe(true);
    expect(fit!.dev).toBe(0);
    expect(validateOpeningShape(fit!.shape)).toEqual([]);
    // mesmo vendo o contorno em sentido horário
    expect(fitOpeningShape([...ring].reverse())!.shape.kind).toBe('polygon');
  });

  const novas: OpeningShape[] = [
    { kind: 'gable', width: 1.2, height: 1.5, rise: 0.5 },
    { kind: 'gable', width: 1, height: 1.2, rise: 1.2 },
    { kind: 'trapezoid', width: 1.2, height: 1, topWidth: 0.6 },
    { kind: 'trapezoid', width: 1.2, height: 1, topWidth: 1.2, baseWidth: 0.7 },
    { kind: 'horseshoe', width: 1, height: 2, neck: 0.8 },
  ];
  for (const forma of novas) {
    it(`reconhece ${forma.kind} exato a partir do próprio contorno, sem perda`, () => {
      const fit = fitOpeningShape(comoPontos(outline(forma)));
      expect(fit!.exact).toBe(true);
      expect(fit!.shape.kind).toBe(forma.kind);
      expect(fit!.dev).toBeLessThanOrEqual(FORMA_EXATA_TOL);
      const s = fit!.shape as unknown as Record<string, number>;
      for (const k of ['rise', 'topWidth', 'baseWidth', 'neck']) if (k in forma) expect(s[k]).toBeCloseTo((forma as unknown as Record<string, number>)[k]!, 3);
    });
  }

  it('polígono livre (casinha assimétrica) vira polygon exato, sem aviso de aproximação', () => {
    const ring: Pt2[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.2, y: 1.7 }, { x: 0, y: 1.2 }];
    const fit = fitOpeningShape(ring);
    expect(fit!.shape.kind).toBe('polygon');
    expect(fit!.exact).toBe(true);
    const pts = (fit!.shape as Extract<OpeningShape, { kind: 'polygon' }>).points;
    expect(pts).toHaveLength(5);
    expect(pts[3]!.u).toBeCloseTo(0.2, 9);
  });
});

describe('ida e volta export -> import de vãos com forma', () => {
  it('retângulo: sai e volta sem forma, com as mesmas medidas e sem aviso de forma', () => {
    const { tipo, avisos } = ida(null);
    expect(tipo.shape).toBeUndefined();
    expect(tipo.width).toBeCloseTo(1, 2);
    expect(tipo.height).toBeCloseTo(1.8, 2);
    expect(avisos.some((m) => m.includes('forma') || m.includes('retangular'))).toBe(false);
  });

  const cinco: Array<[string, OpeningShape]> = [
    ['arco pleno (meia-lua)', { kind: 'round', width: 1, height: 1.8 }],
    ['arco abatido', { kind: 'segmental', width: 1, height: 1.8, rise: 0.3 }],
    ['ogival', { kind: 'pointed', width: 1, height: 1.8, rise: 0.8 }],
    ['círculo (elipse)', { kind: 'circle', width: 1.2, height: 1.2 }],
    ['elipse', { kind: 'circle', width: 1, height: 1.6 }],
    ['empena', { kind: 'gable', width: 1.2, height: 1.6, rise: 0.5 }],
    ['trapézio', { kind: 'trapezoid', width: 1.2, height: 1.2, topWidth: 0.7 }],
    ['ferradura', { kind: 'horseshoe', width: 1, height: 1.8, neck: 0.8 }],
    ['polígono', { kind: 'polygon', width: 1, height: 1.6, points: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0.5, v: 1.6 }, { u: 0, v: 1 }] }],
  ];
  for (const [nome, forma] of cinco) {
    it(`${nome}: a forma volta no tipo, sem aviso de forma livre`, () => {
      const { tipo, avisos } = ida(forma);
      expect(tipo.shape?.kind).toBe(forma.kind);
      expect(tipo.width).toBeCloseTo(forma.width, 2);
      expect(tipo.height).toBeCloseTo(forma.height, 2);
      if ('rise' in forma) expect((tipo.shape as { rise: number }).rise).toBeCloseTo(forma.rise, 2);
      if (forma.kind === 'polygon') expect((tipo.shape as typeof forma).points).toHaveLength(forma.points.length);
      expect(avisos.some((m) => m.includes('forma livre') || m.includes('não é retangular'))).toBe(false);
      // O vazio fica no peitoril: o import lê o peitoril do tipo a partir do perfil.
      expect(tipo.sill).toBeCloseTo(0.9, 2);
    });
  }
});

describe('exportação de vão com forma', () => {
  const p = projetoComForma({ kind: 'round', width: 1, height: 1.8 });
  const text = exportIfc(p, geometriaDo(p), { timestamp: TS });
  const f = new IfcFile(text);

  it('Qto_WindowBaseQuantities: Width, Height, Perimeter e Area do contorno (areaPerimetroDoContorno)', () => {
    const forma = formaDoVao(p.openingTypes['t_forma']!, 1.8).forma!;
    const { area, perimetro } = areaPerimetroDoContorno(forma);
    const conjunto = f.byType('IFCELEMENTQUANTITY').find((e) => f.text(e, 0) === ifcGuid('qto:window:o_forma'));
    expect(conjunto).toBeDefined();
    expect(f.text(conjunto!, 2)).toBe('Qto_WindowBaseQuantities');
    const valores = new Map<string, number>();
    for (const q of f.list(conjunto!, 5)) valores.set(f.text(q, 0), Number(f.num(q, 3)));
    expect(valores.get('Width')).toBeCloseTo(forma.width, 6);
    expect(valores.get('Height')).toBeCloseTo(forma.height, 6);
    expect(valores.get('Area')).toBeCloseTo(area, 6);
    expect(valores.get('Perimeter')).toBeCloseTo(perimetro, 6);
    // Área de semicírculo: menor que o retângulo envolvente (proporção π/8 da caixa de 1 × 1,8).
    expect(area).toBeLessThan(forma.width * forma.height);
  });

  it('o tipo de janela traz o lining e o tipo de porta traz lining e painéis (ligados ao tipo)', () => {
    const lining = [...f.byType('IFCWINDOWLININGPROPERTIES'), ...f.byType('IFCDOORLININGPROPERTIES')];
    expect(lining.length).toBeGreaterThan(0);
    expect(f.byType('IFCDOORPANELPROPERTIES').length).toBeGreaterThan(0);
  });
});

describe('import de perfil sem forma próxima: aviso de caixa envolvente', () => {
  const paredeCaixa: TestBox = { id: 1, type: 'IFCWALL', name: 'W', x: 0, y: -0.1, z: 0, dx: 6, dy: 0.2, dz: 3, tail: '$' };
  const gid = (n: number): string => String(n).padStart(22, '0');
  /** Produto com perfil em pentagrama de um traço (lados que se cruzam: não é forma do modelo nem polígono válido). Id do produto: `n + 19`. */
  function produtoEstrela(n: number, type: string, name: string, tail: string): string[] {
    const linhas: string[] = [];
    const pontos: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.5;
      const a = ([0, 2, 4, 1, 3][i]! * 2 * Math.PI) / 5 + Math.PI / 2;
      linhas.push(`#${n + i}=IFCCARTESIANPOINT((${(Math.cos(a) * r).toFixed(6)},${(1 + Math.sin(a) * r).toFixed(6)}));`);
      pontos.push(`#${n + i}`); // id cru: `ref` do kit mapeia ids de caixas, não de linhas avulsas
    }
    pontos.push(`#${n}`);
    return [
      ...linhas,
      `#${n + 10}=IFCPOLYLINE((${pontos.join(',')}));`,
      `#${n + 11}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${n + 10});`,
      `#${n + 12}=IFCCARTESIANPOINT((2.,0.2,0.));`,
      `#${n + 13}=IFCDIRECTION((0.,-1.,0.));`,
      `#${n + 14}=IFCDIRECTION((1.,0.,0.));`,
      `#${n + 15}=IFCAXIS2PLACEMENT3D(#${n + 12},#${n + 13},#${n + 14});`,
      `#${n + 16}=IFCEXTRUDEDAREASOLID(#${n + 11},#${n + 15},#9,0.4);`,
      `#${n + 17}=IFCSHAPEREPRESENTATION(#2,'Body','SweptSolid',(#${n + 16}));`,
      `#${n + 18}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n + 17}));`,
      `#${n + 19}=${type}('${gid(n + 19)}',$,'${name}',$,$,#7,#${n + 18},$${tail ? `,${tail}` : ''});`,
    ];
  }

  it('estrela não vira forma: o vão segue como caixa envolvente, com o aviso de sempre', () => {
    const src = ifcBoxes([paredeCaixa], [
      ...produtoEstrela(9600, 'IFCOPENINGELEMENT', 'V', ''),
      ...produtoEstrela(9700, 'IFCWINDOW', 'J1', '1.,1.,$,$'),
      `#9801=IFCRELVOIDSELEMENT('${gid(9801)}',$,$,$,${ref(1)},#9619);`,
      `#9802=IFCRELFILLSELEMENT('${gid(9802)}',$,$,$,#9619,#9719);`,
    ]);
    const { project, report } = importIfc(src);
    const janelas = Object.values(project.elements).filter((e): e is Opening => isOpening(e) && e.kind === 'window');
    expect(janelas).toHaveLength(1);
    expect(project.openingTypes[janelas[0]!.typeId]?.shape).toBeUndefined();
    expect(report.warnings.some((m) => m.startsWith('Janela "J1": o vão não é retangular') && m.includes('caixa envolvente'))).toBe(true);
  });
});
