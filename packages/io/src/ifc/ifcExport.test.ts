import { describe, expect, it } from 'vitest';
import {
  buildTemplate,
  isOpening,
  isWall,
  levelElevation,
  makeWall,
  openingHeight,
  openingRough,
  openingSill,
  openingType,
  wallBaseElevation,
  wallHeight,
  wallType,
  type Floor,
  type Opening,
  type Project,
  type Roof,
  type Stair,
  type Wall,
} from '@hestia/model';
import { doorOperation, exportIfc, windowOperation } from './ifcExport.ts';
import { ifcGuid } from './ifcGuid.ts';
import { num, stepString } from './ifcStep.ts';
import type { IfcGeometry, IfcOpeningGeo, IfcPolygon, IfcWallGeo } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';

/** Geometria "de modelo" para o teste: paredes como retângulos do eixo com a espessura do tipo; vãos no eixo. */
function geometryFromModel(p: Project): IfcGeometry {
  const walls: IfcWallGeo[] = [];
  const openings: IfcOpeningGeo[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e)) continue;
    const th = wallType(p, e).layers.reduce((s, l) => s + l.thickness, 0) || 0.1;
    const footprints: IfcPolygon[] = [[wallRect(e, th)]];
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
    });
  }
  return { walls, openings, floors: [], slabs: [], roofs: [], stairs: [] };
}

/** Retângulo em planta da parede (eixo a→b, espessura `th` para o lado esquerdo e o direito). */
function wallRect(w: Wall, th: number): Array<{ x: number; y: number }> {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (th / 2);
  const ny = (dx / len) * (th / 2);
  return [
    { x: w.a.x + nx, y: w.a.y + ny },
    { x: w.b.x + nx, y: w.b.y + ny },
    { x: w.b.x - nx, y: w.b.y - ny },
    { x: w.a.x - nx, y: w.a.y - ny },
  ];
}

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;

/** Linhas `#n=TIPO(...);` do texto, em ordem. */
const entityLines = (text: string, type: string): string[] =>
  [...text.matchAll(new RegExp(`^#\\d+=${type}\\(.*\\);$`, 'gm'))].map((m) => m[0]);

/** Mapa id STEP → corpo da entidade (`TIPO(...)`), para resolver referências nos testes. */
function entitiesById(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of text.matchAll(/^#(\d+)=(.*);$/gm)) out.set(Number(m[1]), m[2]!);
  return out;
}

/** Atributos de uma linha STEP, separados por vírgula no nível de fora (respeita texto e listas). */
function attrsOf(line: string): string[] {
  const body = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'));
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quoted) {
      current += ch;
      if (ch === "'") {
        if (body[i + 1] === "'") {
          current += "'";
          i++;
        } else quoted = false;
      }
      continue;
    }
    if (ch === "'") {
      quoted = true;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

/** Ids `#n` citados em um atributo (referência simples ou lista). */
const refsIn = (value: string): number[] => [...value.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));

/** Propriedades (`IFCPROPERTYSINGLEVALUE`) de um `IFCPROPERTYSET`, por nome. */
function propsOfPset(line: string, byId: Map<number, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of refsIn(attrsOf(line)[4] ?? '')) {
    const a = attrsOf(byId.get(id) ?? '');
    if (a.length >= 3) out.set(a[0]!.replace(/^'|'$/g, ''), a[2]!);
  }
  return out;
}

/** Todo `#n` referenciado tem de existir como entidade definida. */
function danglingRefs(text: string): number[] {
  const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
  return [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !defined.has(id));
}

describe('doorOperation: famílias novas', () => {
  it('vai-e-vem, embutir, dobrável, sanfonada e seccionada têm a operação da spec', () => {
    expect(doorOperation({ plan: 'dblact' }, false)).toBe('DOUBLE_SWING_LEFT');
    expect(doorOperation({ plan: 'dblact' }, true)).toBe('DOUBLE_SWING_RIGHT');
    expect(doorOperation({ plan: 'pocket' }, false)).toBe('SLIDING_TO_LEFT');
    expect(doorOperation({ plan: 'pocket' }, true)).toBe('SLIDING_TO_RIGHT');
    expect(doorOperation({ plan: 'bifold' }, false)).toBe('FOLDING_TO_LEFT');
    expect(doorOperation({ plan: 'bifold' }, true)).toBe('FOLDING_TO_RIGHT');
    expect(doorOperation({ plan: 'accordion' }, false)).toBe('FOLDING_TO_LEFT');
    expect(doorOperation({ plan: 'accordion' }, true)).toBe('FOLDING_TO_RIGHT');
    expect(doorOperation({ plan: 'garage' }, false)).toBe('ROLLINGUP');
    expect(doorOperation({ plan: 'garage' }, true)).toBe('ROLLINGUP');
  });
});

describe('exportIfc: catálogo completo no mostruário', () => {
  const p = buildTemplate('esquadrias');
  const geo = geometryFromModel(p);
  const text = exportIfc(p, geo, { timestamp: TS });
  const opens = Object.values(p.elements).filter(isOpening);
  const portas = opens.filter((o) => o.kind === 'door');
  const janelas = opens.filter((o) => o.kind === 'window');

  it('sai sem exceção, com referências íntegras e uma porta ou janela por vão', () => {
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(danglingRefs(text)).toEqual([]);
    expect(p.levels).toHaveLength(1);
    // Uma abertura por tipo do catálogo: 70 portas (12 antigas + 43 brasileiras + 15 composições) e 60 janelas (12 antigas + 39 + 9 composições).
    expect(portas.length).toBe(70);
    expect(janelas.length).toBe(60);
    expect(count(text, 'IFCDOOR')).toBe(portas.length);
    expect(count(text, 'IFCWINDOW')).toBe(janelas.length);
    expect(count(text, 'IFCOPENINGELEMENT')).toBe(opens.length);
    expect(count(text, 'IFCRELVOIDSELEMENT')).toBe(opens.length);
    expect(count(text, 'IFCRELFILLSELEMENT')).toBe(opens.length);
  });

  it('tem uma Operation por porta e um painel por janela, sem NOTDEFINED', () => {
    for (const o of portas) {
      const t = p.openingTypes[o.typeId]!;
      expect(doorOperation(t, o.flipHand), `${o.id} ${t.plan}`).not.toBe('NOTDEFINED');
    }
    for (const o of janelas) {
      const t = p.openingTypes[o.typeId]!;
      expect(windowOperation(t, o.flipHand), `${o.id} ${t.plan}`).not.toBe('NOTDEFINED');
    }
    expect(count(text, 'IFCWINDOWPANELPROPERTIES')).toBe(janelas.length + new Set(janelas.map((o) => o.typeId)).size);
    expect(text.includes("'NOTDEFINED'")).toBe(false);
  });

  it('cada tipo de porta/janela sai como IFCDOORTYPE/IFCWINDOWTYPE com operação e divisão', () => {
    const byId = entitiesById(text);
    const doorTypes = entityLines(text, 'IFCDOORTYPE');
    expect(doorTypes).toHaveLength(new Set(portas.map((o) => o.typeId)).size);
    for (const line of doorTypes) {
      const a = attrsOf(line);
      expect(a[9]).toBe('.DOOR.');
      expect(a[10], line).toMatch(/^\.[A-Z_]+\.$/);
      expect(a[10], line).not.toBe('.NOTDEFINED.');
      expect(a[0]!.replace(/^'|'$/g, '')).toMatch(/^[0-9A-Za-z_$]{22}$/);
    }
    const windowTypes = entityLines(text, 'IFCWINDOWTYPE');
    expect(windowTypes).toHaveLength(new Set(janelas.map((o) => o.typeId)).size);
    for (const line of windowTypes) {
      const a = attrsOf(line);
      expect(a[9]).toBe('.WINDOW.');
      expect(a[10], line).toMatch(/^\.[A-Z_]+\.$/);
      // O IFC4 não tem Operation no IFCWINDOWTYPE: a operação vai nas panel properties do tipo (HasPropertySets).
      const panel = attrsOf(byId.get(refsIn(a[5]!)[0]!)!);
      expect(panel[4], line).toMatch(/^\.[A-Z_]+\.$/);
      expect(panel[4], line).not.toBe('.NOTDEFINED.');
    }
    expect(count(text, 'IFCRELDEFINESBYTYPE')).toBe(new Set(portas.map((o) => o.typeId)).size + new Set(janelas.map((o) => o.typeId)).size);
  });
});

describe('exportIfc: altura efetiva da instância', () => {
  it('IfcWindow e IfcOpeningElement usam o override, não a altura do tipo', () => {
    const base = buildTemplate('house2');
    const window = Object.values(base.elements).find((e): e is Opening => isOpening(e) && e.kind === 'window')!;
    const type = openingType(base, window);
    const override = type.height + 0.25;
    const p: Project = {
      ...base,
      elements: { ...base.elements, [window.id]: { ...window, heightOverride: override } },
    };
    const text = exportIfc(p, geometryFromModel(p), { timestamp: TS });
    const byId = entitiesById(text);

    const windowLine = entityLines(text, 'IFCWINDOW').find((l) => attrsOf(l)[0]!.replace(/^'|'$/g, '') === ifcGuid(`window:${window.id}`))!;
    expect(Number(attrsOf(windowLine)[8])).toBeCloseTo(override, 6);
    expect(Number(attrsOf(windowLine)[9])).toBeCloseTo(type.width, 6);

    const voidLine = entityLines(text, 'IFCOPENINGELEMENT').find((l) => attrsOf(l)[0]!.replace(/^'|'$/g, '') === ifcGuid(`void:${window.id}`))!;
    const productShapeId = refsIn(attrsOf(voidLine)[6]!)[0]!;
    const repId = refsIn(attrsOf(byId.get(productShapeId)!)[2]!)[0]!;
    const itemId = refsIn(attrsOf(byId.get(repId)!)[3]!)[0]!;
    const solid = attrsOf(byId.get(itemId)!);
    const roughHeight = openingRough({ ...type, height: openingHeight(type, p.elements[window.id] as Opening) }).height;
    expect(Number(solid[solid.length - 1])).toBeCloseTo(roughHeight, 6);
  });
});

describe('exportIfc', () => {
  const p = buildTemplate('house2');
  const geo = geometryFromModel(p);
  const text = exportIfc(p, geo, { timestamp: TS });
  const walls = Object.values(p.elements).filter(isWall).length;
  const openings = Object.values(p.elements).filter(isOpening).length;

  it('começa com ISO-10303-21 e termina com END-ISO-10303-21', () => {
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('todo #n referenciado existe no arquivo', () => {
    expect(danglingRefs(text)).toEqual([]);
  });

  it('conta paredes, vãos (vão bruto + porta/janela) e pavimentos como o projeto', () => {
    expect(count(text, 'IFCWALL')).toBe(walls);
    expect(count(text, 'IFCDOOR') + count(text, 'IFCWINDOW')).toBe(openings);
    expect(count(text, 'IFCOPENINGELEMENT')).toBe(openings);
    expect(count(text, 'IFCRELVOIDSELEMENT')).toBe(openings);
    expect(count(text, 'IFCRELFILLSELEMENT')).toBe(openings);
    expect(count(text, 'IFCBUILDINGSTOREY')).toBe(p.levels.length);
    expect(count(text, 'IFCSITE')).toBe(1);
    expect(count(text, 'IFCBUILDING')).toBe(1);
    expect(count(text, 'IFCPROJECT')).toBe(1);
  });

  it('cada parede com camadas positivas tem um IFCMATERIALLAYERSETUSAGE', () => {
    const withLayers = Object.values(p.elements).filter((e) => isWall(e) && wallType(p, e).layers.some((l) => l.thickness > 0)).length;
    expect(count(text, 'IFCMATERIALLAYERSETUSAGE')).toBe(withLayers);
  });

  it('as peças da esquadria viram sólidos com IFCSTYLEDITEM próprio (vidro translúcido)', () => {
    const projeto = buildTemplate('house2');
    const geo2 = geometryFromModel(projeto);
    const janela = geo2.openings.find((o) => projeto.elements[o.openingId]?.kind === 'window');
    expect(janela).toBeDefined();
    janela!.parts = [
      { t0: -0.4, t1: 0.4, s0: -0.03, s1: 0.03, z0: 0, z1: 1, materialId: 'mat_aluminio', role: 'jamb' },
      { t0: -0.35, t1: 0.35, s0: -0.006, s1: 0.006, z0: 0.05, z1: 0.95, materialId: 'mat_vidro', role: 'glass' },
    ];
    const saida = exportIfc(projeto, geo2, { timestamp: TS });
    const byId = entitiesById(saida);
    const linhaJanela = entityLines(saida, 'IFCWINDOW').find((l) => attrsOf(l)[0] === stepString(ifcGuid(`window:${janela!.openingId}`)));
    expect(linhaJanela).toBeDefined();
    // IfcWindow.Representation → IfcProductDefinitionShape.Representations → IfcShapeRepresentation.Items.
    const pds = byId.get(refsIn(attrsOf(linhaJanela!)[6]!)[0]!)!;
    const rep = byId.get(refsIn(attrsOf(pds)[2]!)[0]!)!;
    const itens = refsIn(attrsOf(rep)[3]!);
    expect(itens).toHaveLength(2);
    const estilos = itens.map((item) => {
      const styled = entityLines(saida, 'IFCSTYLEDITEM').find((l) => attrsOf(l)[0] === `#${item}`);
      expect(styled, `item #${item} sem IFCSTYLEDITEM`).toBeDefined();
      return refsIn(attrsOf(styled!)[1]!)[0]!;
    });
    expect(estilos[0]).not.toBe(estilos[1]);
    const estiloVidro = byId.get(estilos[1]!)!;
    expect(estiloVidro).toContain(stepString('Vidro'));
    const rendering = byId.get(refsIn(attrsOf(estiloVidro)[2]!)[0]!)!;
    // opacity 0.35 no modelo → Transparency 1 − 0.35 = 0.65 no IFC.
    expect(Number(attrsOf(rendering)[1])).toBeCloseTo(0.65, 6);
  });

  it('as camadas saem na ordem externa→interna, com material, espessura e nome, um conjunto por tipo', () => {
    const byId = entitiesById(text);
    const usedTypes = new Map<string, ReturnType<typeof wallType>>();
    for (const e of Object.values(p.elements)) {
      if (!isWall(e)) continue;
      const t = wallType(p, e);
      if (t.layers.some((l) => l.thickness > 0)) usedTypes.set(t.id, t);
    }
    const sequenceOf = (line: string): string =>
      refsIn(attrsOf(line)[0]!)
        .map((id) => {
          const layer = attrsOf(byId.get(id)!);
          const material = attrsOf(byId.get(Number(layer[0]!.slice(1)))!)[0]!;
          return `${material}|${layer[1]!}`;
        })
        .join(';');
    const expected = [...usedTypes.values()].map((t) =>
      t.layers
        .filter((l) => l.thickness > 0)
        .map((l) => `${stepString(p.materials[l.materialId]!.name)}|${num(l.thickness)}`)
        .join(';'),
    );
    const sets = entityLines(text, 'IFCMATERIALLAYERSET');
    expect(sets).toHaveLength(usedTypes.size);
    expect(sets.map(sequenceOf).sort()).toEqual(expected.sort());
  });

  it('Pset_WallCommon traz IsExternal booleano, LoadBearing e Reference em cada parede', () => {
    const byId = entitiesById(text);
    const psets = entityLines(text, 'IFCPROPERTYSET').filter((l) => attrsOf(l)[2] === "'Pset_WallCommon'");
    expect(psets).toHaveLength(walls);
    const externals: string[] = [];
    for (const line of psets) {
      const props = propsOfPset(line, byId);
      expect(props.get('IsExternal'), line).toMatch(/^IFCBOOLEAN\(\.(T|F)\.\)$/);
      expect(props.get('LoadBearing'), line).toBe('IFCBOOLEAN(.F.)');
      expect(props.get('Reference'), line).toMatch(/^IFCLABEL\('.*'\)$/);
      externals.push(props.get('IsExternal')!);
    }
    // A casa de teste tem o perímetro externo e quatro divisórias: a fachada é a que dá para fora.
    expect(externals.filter((v) => v === 'IFCBOOLEAN(.T.)')).toHaveLength(4);
  });

  it('FireRating, ThermalTransmittance e AcousticRating do tipo de parede saem quando informados', () => {
    const t = p.wallTypes.wt_ext19!;
    const q: Project = { ...p, wallTypes: { ...p.wallTypes, wt_ext19: { ...t, fireRating: 30, thermalU: 0.45, acousticRw: 42 } } };
    const out = exportIfc(q, geo, { timestamp: TS });
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('30 min'),$)");
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,IFCREAL(0.450000),$)");
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('AcousticRating',$,IFCLABEL('42 dB'),$)");
  });

  it('portas e janelas têm OverallHeight/OverallWidth do tipo e Pset comum com IsExternal', () => {
    const byId = entitiesById(text);
    const opens = Object.values(p.elements).filter(isOpening);
    const byGid = new Map(opens.map((o) => [ifcGuid(`${o.kind}:${o.id}`), o]));
    for (const type of ['IFCDOOR', 'IFCWINDOW'] as const) {
      for (const line of entityLines(text, type)) {
        const a = attrsOf(line);
        const o = byGid.get(a[0]!.replace(/^'|'$/g, ''));
        expect(o, line).toBeDefined();
        const t = openingType(p, o!);
        expect(Number(a[8]), line).toBeCloseTo(t.height, 6);
        expect(Number(a[9]), line).toBeCloseTo(t.width, 6);
      }
    }
    const doors = entityLines(text, 'IFCDOOR').length;
    const windows = entityLines(text, 'IFCWINDOW').length;
    const doorCommon = entityLines(text, 'IFCPROPERTYSET').filter((l) => attrsOf(l)[2] === "'Pset_DoorCommon'");
    const windowCommon = entityLines(text, 'IFCPROPERTYSET').filter((l) => attrsOf(l)[2] === "'Pset_WindowCommon'");
    expect(doorCommon).toHaveLength(doors);
    expect(windowCommon).toHaveLength(windows);
    for (const line of [...doorCommon, ...windowCommon]) {
      const props = propsOfPset(line, byId);
      expect(props.get('IsExternal'), line).toMatch(/^IFCBOOLEAN\(\.(T|F)\.\)$/);
      expect(props.get('Reference'), line).toMatch(/^IFCLABEL\('.*'\)$/);
    }
    for (const line of windowCommon) expect(propsOfPset(line, byId).get('GlazingAreaFraction'), line).toMatch(/^IFCREAL\(/);
  });

  it('Pset da abertura traz FireRating/uValue do tipo e Reference = mark do vão', () => {
    const t = p.openingTypes.ot_p90!;
    const opening = Object.values(p.elements).find((e): e is Opening => isOpening(e) && e.typeId === 'ot_p90')!;
    const q: Project = {
      ...p,
      openingTypes: { ...p.openingTypes, ot_p90: { ...t, fireRating: 'EI 30', uValue: 2.1, acousticRw: 32 } },
      elements: { ...p.elements, [opening.id]: { ...opening, mark: 'D-99' } },
    };
    const out = exportIfc(q, geo, { timestamp: TS });
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI 30'),$)");
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('ThermalTransmittance',$,IFCREAL(2.100000),$)");
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('AcousticRating',$,IFCLABEL('32 dB'),$)");
    expect(out).toContain("IFCPROPERTYSINGLEVALUE('Reference',$,IFCLABEL('D-99'),$)");
  });

  it('GlobalIds das entidades com raiz são de 22 caracteres e únicos', () => {
    const ids = [...text.matchAll(/=(IFCPROJECT|IFCSITE|IFCBUILDING|IFCBUILDINGSTOREY|IFCWALL|IFCSLAB|IFCDOOR|IFCWINDOW|IFCOPENINGELEMENT|IFCREL\w+)\('([^']*)'/g)].map((m) => m[2]!);
    expect(ids.length).toBeGreaterThan(walls);
    expect(ids.every((g) => /^[0-9A-Za-z_$]{22}$/.test(g))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(ifcGuid('project'));
  });

  it('é determinístico: a mesma entrada dá o mesmo texto', () => {
    expect(exportIfc(p, geo, { timestamp: TS })).toBe(text);
  });

  it('nomes com acento saem em \\X2\\ e a unidade é metro', () => {
    expect(text).toContain('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
    const accented = exportIfc({ ...p, name: 'Casa Térrea' }, geo, { timestamp: TS });
    expect(accented).toContain("'Casa T\\X2\\00E9\\X0\\rrea'");
  });

  it('a casa de teste tem paredes e vãos (o teste de contagem não é vazio)', () => {
    expect(walls).toBeGreaterThan(0);
    expect(openings).toBeGreaterThan(0);
  });

  it('pisos, lajes, telhado e escada (sintéticos) saem com a classificação do IFC', () => {
    const lv = p.levels[0]!;
    const elev = levelElevation(p, lv.id);
    const rect = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const floor = { id: 'fl1', kind: 'floor', typeId: '', levelId: lv.id, boundary: [], holes: [], heightOffset: 0, mark: '', comments: '', order: 999 } as Floor;
    const roof = { id: 'rf1', kind: 'roof', typeId: '', levelId: lv.id, shape: 'shed' } as unknown as Roof;
    const stair = { id: 'st1', kind: 'stair', typeId: '', levelId: lv.id } as unknown as Stair;
    const q: Project = { ...p, elements: { ...p.elements, fl1: floor, rf1: roof, st1: stair } };
    const tread = (x: number) => ({ polygon: [[{ x, y: 0 }, { x: x + 0.3, y: 0 }, { x: x + 0.3, y: 1 }, { x, y: 1 }]], top: { a: 0, b: 0, c: elev + 0.2 }, bottom: { a: 0, b: 0, c: elev - 0.1 } });
    const g: IfcGeometry = {
      ...geo,
      floors: [{ floorId: 'fl1', prisms: [{ polygon: [rect], top: { a: 0, b: 0, c: elev }, bottom: { a: 0, b: 0, c: elev - 0.2 } }] }],
      roofs: [{ roofId: 'rf1', planes: [{ polygon: [rect], top: { a: 0, b: 0.2, c: elev + 3 }, bottom: { a: 0, b: 0.2, c: elev + 2.8 } }] }],
      stairs: [{ stairId: 'st1', levelId: lv.id, spiral: false, riserHeight: 0.18, flights: [{ componentIndex: 1, pieces: [tread(0), tread(0.3)], treads: 2, risers: 3 }], landings: [{ polygon: [rect], top: { a: 0, b: 0, c: elev + 0.2 }, bottom: { a: 0, b: 0, c: elev - 0.1 } }] }],
    };
    const out = exportIfc(q, g, { timestamp: TS });
    expect(danglingRefs(out)).toEqual([]);
    expect(out).toContain(',.ROOF.)');
    expect(out).toContain(',.LANDING.)');
    expect(count(out, 'IFCSLAB')).toBe(count(text, 'IFCSLAB') + 3);
    expect(count(out, 'IFCROOF')).toBe(1);
    expect(count(out, 'IFCSTAIR')).toBe(1);
    expect(count(out, 'IFCSTAIRFLIGHT')).toBe(1);
    expect(out).toContain("'Brep'");
    expect(out).toContain('.SHED_ROOF.');
  });
});

describe('exportIfc: perfil superior da parede', () => {
  it('vira IFCARBITRARYCLOSEDPROFILEDEF extrudado na espessura, com o degrau do perfil', () => {
    const base = buildTemplate('blank');
    const wall: Wall = {
      ...makeWall({ id: 'wp', typeId: 'wt_alv9', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }),
      order: 1,
      topProfile: [
        { t: 0, h: 3 },
        { t: 2, h: 3 },
        { t: 2, h: 2 },
        { t: 4, h: 2 },
      ],
    };
    const p: Project = { ...base, elements: { wp: wall } };
    const footprint: IfcPolygon = [[
      { x: 0, y: -0.062 },
      { x: 4, y: -0.062 },
      { x: 4, y: 0.062 },
      { x: 0, y: 0.062 },
    ]];
    const geo: IfcGeometry = {
      walls: [{ wallId: 'wp', footprints: [footprint], baseZ: 0, height: 3 }],
      openings: [],
      floors: [],
      slabs: [],
      roofs: [],
      stairs: [],
    };
    const out = exportIfc(p, geo, { timestamp: TS });
    expect(danglingRefs(out)).toEqual([]);
    // O perfil longitudinal usa um placement com eixo Z na normal da parede (as extrusões comuns deixam Axis = `$`).
    const tilted = entityLines(out, 'IFCAXIS2PLACEMENT3D').filter((l) => attrsOf(l)[1] !== '$');
    expect(tilted).toHaveLength(1);
    for (const point of ['(0.000000,3.000000)', '(2.000000,3.000000)', '(2.000000,2.000000)', '(4.000000,2.000000)']) {
      expect(out).toContain(`IFCCARTESIANPOINT(${point})`);
    }
    expect(entityLines(out, 'IFCEXTRUDEDAREASOLID').map((l) => Number(attrsOf(l)[3]))).toContain(0.124);

    const flat = exportIfc({ ...p, elements: { wp: { ...wall, topProfile: null } } }, geo, { timestamp: TS });
    expect(entityLines(flat, 'IFCAXIS2PLACEMENT3D').every((l) => attrsOf(l)[1] === '$')).toBe(true);
  });
});
