import { describe, expect, it } from 'vitest';
import {
  buildTemplate,
  isOpening,
  isWall,
  openingSill,
  openingType,
  wallBaseElevation,
  wallHeight,
  wallType,
  type Opening,
  type Project,
  type Wall,
} from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import { stepString } from './ifcStep.ts';
import type { IfcGeometry, IfcOpeningGeo, IfcPolygon, IfcWallGeo } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';

/** Geometria "de modelo" (paredes como retângulos do eixo, vãos no eixo), como em `ifcExport.test.ts`. */
function geometryFromModel(p: Project): IfcGeometry {
  const walls: IfcWallGeo[] = [];
  const openings: IfcOpeningGeo[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e)) continue;
    const th = wallType(p, e).layers.reduce((s, l) => s + l.thickness, 0) || 0.1;
    walls.push({ wallId: e.id, footprints: [[wallRect(e, th)]], baseZ: wallBaseElevation(p, e), height: wallHeight(p, e) });
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

/** Retângulo em planta da parede (eixo a→b, espessura `th` para os dois lados). */
function wallRect(w: Wall, th: number): IfcPolygon[number] {
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

/** Mapa id STEP → corpo da entidade (`TIPO(...)`). */
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

/** Todo `#n` referenciado tem de existir como entidade definida. */
function danglingRefs(text: string): number[] {
  const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
  // textos entre aspas (ex.: o JSON dos materiais, com cores `#222426`) não são referências
  const semTextos = text.replace(/'(?:[^']|'')*'/g, "''");
  return [...semTextos.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !defined.has(id));
}

/** Estilo de superfície do material de nome `name`: cor RGB, atributos do rendering e do `IFCSURFACESTYLE`. */
function styleOfMaterial(text: string, name: string): { colour: string[]; rendering: string[]; style: string[] } | null {
  const byId = entitiesById(text);
  const material = entityLines(text, 'IFCMATERIAL').find((l) => attrsOf(l)[0] === stepString(name));
  if (!material) return null;
  const materialId = Number(/^#(\d+)/.exec(material)![1]);
  const definition = entityLines(text, 'IFCMATERIALDEFINITIONREPRESENTATION').find((l) => attrsOf(l)[3] === `#${materialId}`);
  if (!definition) return null;
  const representation = byId.get(refsIn(attrsOf(definition)[2]!)[0]!);
  const item = byId.get(refsIn(attrsOf(representation!)[3]!)[0]!);
  const style = byId.get(refsIn(attrsOf(item!)[1]!)[0]!);
  const rendering = byId.get(refsIn(attrsOf(style!)[2]!)[0]!);
  const colour = byId.get(refsIn(attrsOf(rendering!)[0]!)[0]!);
  return { colour: attrsOf(colour!), rendering: attrsOf(rendering!), style: attrsOf(style!) };
}

describe('addStyles: estilos de superfície dos materiais', () => {
  const p = buildTemplate('house2');
  const geo = geometryFromModel(p);
  const text = exportIfc(p, geo, { timestamp: TS });

  it('emite IFCSURFACESTYLE e IFCSTYLEDITEM por material, mais um IFCSTYLEDITEM por corpo de esquadria', () => {
    expect(count(text, 'IFCSURFACESTYLE')).toBeGreaterThan(0);
    expect(count(text, 'IFCSTYLEDREPRESENTATION')).toBe(count(text, 'IFCSURFACESTYLE'));
    expect(count(text, 'IFCSURFACESTYLERENDERING')).toBe(count(text, 'IFCSURFACESTYLE'));
    expect(count(text, 'IFCMATERIALDEFINITIONREPRESENTATION')).toBe(count(text, 'IFCSURFACESTYLE'));
    expect(count(text, 'IFCCOLOURRGB')).toBe(count(text, 'IFCSURFACESTYLE') * 2);
    // Um IFCSTYLEDITEM com Item=$ por material (definição do material) e um com Item=#n por corpo de esquadria.
    const itemStyles = entityLines(text, 'IFCSTYLEDITEM').filter((l) => attrsOf(l)[0] !== '$');
    expect(itemStyles).toHaveLength(geo.openings.length);
    expect(count(text, 'IFCSTYLEDITEM')).toBe(count(text, 'IFCSURFACESTYLE') + itemStyles.length);
    for (const line of itemStyles) {
      const item = entitiesById(text).get(refsIn(attrsOf(line)[0]!)[0]!);
      expect(item, line).toMatch(/^IFCEXTRUDEDAREASOLID\(/);
    }
  });

  it('o vidro (mat_vidro) sai translúcido com a cor do projeto', () => {
    const vidro = styleOfMaterial(text, 'Vidro');
    expect(vidro).not.toBeNull();
    // opacity 0.35 no modelo → Transparency 1 − 0.35 = 0.65.
    expect(Number(vidro!.rendering[1])).toBeCloseTo(0.65, 6);
    expect(Number(vidro!.rendering[1])).toBeGreaterThan(0);
    // #a9d6e5: cor de superfície e cor difusa apontam para a mesma entidade.
    expect(vidro!.colour.slice(1)).toEqual(['0.662745', '0.839216', '0.898039']);
    expect(vidro!.rendering[2]).toBe(vidro!.rendering[0]);
    expect(vidro!.style[0]).toBe(stepString('Vidro'));
    expect(vidro!.style[1]).toBe('.BOTH.');
  });

  it('o concreto (mat_concreto, opacity 1) sai opaco', () => {
    const concreto = styleOfMaterial(text, 'Concreto');
    expect(concreto).not.toBeNull();
    expect(Number(concreto!.rendering[1])).toBe(0);
    expect(concreto!.colour.slice(1)).toEqual(['0.560784', '0.572549', '0.588235']);
  });

  it('a cor da parede externa (bloco cerâmico 19) chega ao IFCCOLOURRGB', () => {
    const bloco = styleOfMaterial(text, 'Bloco cerâmico 19');
    expect(bloco).not.toBeNull();
    // #b45f38 → 0.705882, 0.372549, 0.219608.
    expect(bloco!.colour.slice(1)).toEqual(['0.705882', '0.372549', '0.219608']);
    expect(text).toContain('IFCCOLOURRGB($,0.705882,0.372549,0.219608)');
    // Todas as camadas do tipo externo têm estilo (a cor de cada material do projeto está no arquivo).
    for (const layer of p.wallTypes.wt_ext19!.layers) {
      expect(styleOfMaterial(text, p.materials[layer.materialId]!.name), layer.materialId).not.toBeNull();
    }
  });

  it('o brilho (gloss) vira SpecularColour e SpecularHighlight crescentes', () => {
    const vidro = styleOfMaterial(text, 'Vidro')!; // gloss 0.9
    const concreto = styleOfMaterial(text, 'Concreto')!; // gloss 0.1
    const exponent = (attrs: string[]): number => Number(/IFCSPECULAREXPONENT\(([\d.]+)\)/.exec(attrs[7]!)![1]);
    expect(exponent(vidro.rendering)).toBeCloseTo(116, 6);
    expect(exponent(concreto.rendering)).toBeCloseTo(20, 6);
    expect(exponent(vidro.rendering)).toBeGreaterThan(exponent(concreto.rendering));
    const specular = (attrs: string[]): number => Number(attrsOf(entitiesById(text).get(refsIn(attrs[6]!)[0]!)!)[1]);
    expect(specular(vidro.rendering)).toBeCloseTo(0.45, 6);
    expect(specular(concreto.rendering)).toBeCloseTo(0.05, 6);
  });

  it('é determinístico: a mesma entrada dá o mesmo texto', () => {
    expect(exportIfc(p, geo, { timestamp: TS })).toBe(text);
  });

  it('as referências são íntegras e o vínculo com o material é o canônico', () => {
    expect(danglingRefs(text)).toEqual([]);
    const byId = entitiesById(text);
    const contextId = Number(/^#(\d+)=IFCGEOMETRICREPRESENTATIONCONTEXT\(/m.exec(text)![1]);
    const styledMaterials: number[] = [];
    for (const line of entityLines(text, 'IFCMATERIALDEFINITIONREPRESENTATION')) {
      const a = attrsOf(line);
      // IfcProductRepresentation: Name, Description, Representations, RepresentedMaterial.
      expect(a).toHaveLength(4);
      expect(byId.get(Number(a[3]!.slice(1))), line).toMatch(/^IFCMATERIAL\(/);
      styledMaterials.push(Number(a[3]!.slice(1)));
      const reps = refsIn(a[2]!);
      expect(reps).toHaveLength(1);
      const rep = attrsOf(byId.get(reps[0]!)!);
      expect(rep[0]).toBe(`#${contextId}`);
      expect(rep[1]).toBe(stepString('Style'));
      expect(rep[2]).toBe(stepString('Style'));
      const items = refsIn(rep[3]!);
      expect(items).toHaveLength(1);
      const item = attrsOf(byId.get(items[0]!)!);
      // IfcMaterial não é IfcRepresentationItem: o Item fica `$` e o estilo vem na lista.
      expect(item[0]).toBe('$');
      const styles = refsIn(item[1]!);
      expect(styles).toHaveLength(1);
      expect(byId.get(styles[0]!), line).toMatch(/^IFCSURFACESTYLE\(/);
    }
    // Nenhum material recebe dois estilos e só materiais do projeto entram.
    expect(new Set(styledMaterials).size).toBe(styledMaterials.length);
    const names = new Set(Object.values(p.materials).map((m) => stepString(m.name)));
    for (const line of entityLines(text, 'IFCSURFACESTYLE')) expect(names.has(attrsOf(line)[0]!), line).toBe(true);
  });

  it('as esquadrias entram com batente e vidro mesmo sem IFCMATERIALLAYER próprio', () => {
    const frames = new Set(Object.values(p.openingTypes).map((t) => t.frameMaterialId));
    // A linha de esquadrias pode ter tipos com batente de vidro (porta de vidro); o que importa é que todo material
    // citado como batente e o vidro tenham estilo no arquivo.
    for (const id of frames) expect(styleOfMaterial(text, p.materials[id]!.name), id).not.toBeNull();
    expect(styleOfMaterial(text, p.materials.mat_vidro!.name)).not.toBeNull();
  });
});
