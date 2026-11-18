/**
 * Leitor de COLLADA (.dae) com parser XML minimo proprio (sem DOM).
 *
 * - `<unit meter>` define a escala (aplicada em posicoes e translacoes); `<up_axis>` (Y_UP, Z_UP, X_UP) e convertido para Z.
 * - Geometrias (`<mesh>` com triangles, polylist e polygons) viram uma definicao cada. Cada `instance_geometry` (ou o
 *   geometry base de um `instance_controller` com `skin`) numa cena vira uma instancia com a matriz mundial.
 * - Transformacoes em ordem: matrix (por linhas no arquivo), translate, rotate, scale. `instance_node` e seguido.
 * - Material: cor difusa (color) ou textura difusa (sampler -> surface -> image) PNG/JPEG vizinha.
 * - Os bindings de material (instance_material) vem da primeira instancia que usa a geometria (limitacao: instancias
 *   com materiais diferentes para a mesma geometria usam o da primeira; aviso emitido).
 * - Morph e skin: a geometria base e usada (pose de repouso), com aviso.
 */
import {
  AXIS_IDENTITY,
  AXIS_X_UP_TO_Z,
  AXIS_Y_UP_TO_Z,
  baseName,
  buildModel,
  changeAxisMat,
  checkAbort,
  decodeText,
  defaultMaterial,
  emptyContext,
  extForMime,
  guessCategory,
  ImportError,
  lookupFile,
  MeshBuilder,
  mat4AxisAngle,
  mat4FromRows3,
  mat4Identity,
  mat4Mul,
  progress,
  type ReaderContext,
  rot3,
  roughnessFromShininess,
  safeFileName,
  scaleTranslation,
  sniffImage,
} from './fmtCommon.ts';
import type { ImportedInstance, ImportedMaterial, ImportedMeshDef, ImportedModel, ImportedTexture, ImportFn, ImportOptions, Mat4 } from './types.ts';

/* ---------- XML minimo ---------- */

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? '';
  });
}

/** Analisa XML o suficiente para COLLADA: elementos, atributos, texto. Lanca ImportError se malformado ou truncado. */
export function parseXml(src: string): XNode {
  const root: XNode = { name: '#doc', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const attrRe = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) {
      top.text += m[1];
    } else if (m[2] !== undefined) {
      const name = m[2];
      if (stack.length <= 1 || top.name !== name) throw new ImportError(`XML inválido: fechamento </${name}> sem abertura correspondente.`);
      stack.pop();
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      const attrText = m[4] ?? '';
      let a: RegExpExecArray | null;
      attrRe.lastIndex = 0;
      while ((a = attrRe.exec(attrText)) !== null) attrs[a[1]!] = unescapeXml(a[2] ?? a[3] ?? '');
      const node: XNode = { name: m[3], attrs, children: [], text: '' };
      top.children.push(node);
      if (m[5] !== '/') stack.push(node);
    } else if (m[6] !== undefined) {
      top.text += unescapeXml(m[6]);
    }
  }
  if (stack.length !== 1) throw new ImportError('XML truncado: faltam elementos de fechamento (arquivo incompleto?).');
  return root;
}

const childrenNamed = (n: XNode, name: string): XNode[] => n.children.filter((c) => c.name === name);
const firstNamed = (n: XNode, name: string): XNode | undefined => n.children.find((c) => c.name === name);

function findAll(n: XNode, name: string): XNode[] {
  const out: XNode[] = [];
  const walk = (x: XNode) => {
    if (x.name === name) out.push(x);
    for (const c of x.children) walk(c);
  };
  walk(n);
  return out;
}

const numbers = (text: string): number[] => text.trim().split(/\s+/).filter((t) => t.length).map(Number);
const idOf = (ref: string | undefined): string => (ref ?? '').replace(/^#/, '');

/* ---------- leitor ---------- */

interface Source {
  values: number[];
  stride: number;
}

interface EffectInfo {
  color: [number, number, number];
  opacity: number;
  roughness?: number;
  imageId?: string;
}

type Input = { sem: string; src: string; offset: number; set: string };

const SHADERS = ['phong', 'blinn', 'lambert', 'constant'];

function readEffect(eff: XNode): EffectInfo {
  const info: EffectInfo = { color: [0.8, 0.8, 0.8], opacity: 1 };
  const surfaces = new Map<string, string>(); // sid da surface -> id da imagem
  const samplers = new Map<string, string>(); // sid do sampler -> sid da surface
  for (const np of findAll(eff, 'newparam')) {
    const sid = np.attrs.sid ?? '';
    const surf = firstNamed(np, 'surface');
    if (surf) surfaces.set(sid, idOf(firstNamed(surf, 'init_from')?.text.trim()));
    const samp = firstNamed(np, 'sampler2D');
    if (samp) samplers.set(sid, firstNamed(samp, 'source')?.text.trim() ?? '');
  }
  const profile = firstNamed(eff, 'profile_COMMON') ?? eff;
  const technique = firstNamed(profile, 'technique') ?? profile;
  const shade = technique.children.find((c) => SHADERS.includes(c.name));
  if (!shade) return info;
  const diffuse = firstNamed(shade, 'diffuse');
  const col = diffuse ? firstNamed(diffuse, 'color') : undefined;
  const tex = diffuse ? firstNamed(diffuse, 'texture') : undefined;
  if (col) {
    const v = numbers(col.text);
    info.color = [v[0] ?? 0.8, v[1] ?? 0.8, v[2] ?? 0.8];
  } else if (tex) {
    const surfSid = samplers.get(tex.attrs.texture ?? '') ?? tex.attrs.texture ?? '';
    const img = surfaces.get(surfSid);
    if (img) info.imageId = img;
  }
  const tr = firstNamed(shade, 'transparency');
  const tv = tr ? numbers(firstNamed(tr, 'float')?.text ?? '') : [];
  if (tv.length && Number.isFinite(tv[0])) info.opacity = Math.min(1, Math.max(0, tv[0]!));
  const sh = firstNamed(shade, 'shininess');
  const shv = sh ? numbers(firstNamed(sh, 'float')?.text ?? '') : [];
  if (shv.length && Number.isFinite(shv[0])) info.roughness = roughnessFromShininess(shv[0]!);
  return info;
}

/** Le um COLLADA com contexto de arquivos vizinhos (texturas). */
export async function readDae(file: { name: string; bytes: Uint8Array }, opts: ImportOptions | undefined, ctx: ReaderContext): Promise<ImportedModel> {
  const startedAt = Date.now();
  checkAbort(opts);
  progress(opts, 0.05, 'Lendo COLLADA');
  const doc = parseXml(decodeText(file.bytes));
  const collada = findAll(doc, 'COLLADA')[0];
  if (!collada) throw new ImportError('Arquivo não é COLLADA (falta o elemento COLLADA).');
  const warnings: string[] = [];

  const asset = firstNamed(collada, 'asset');
  const unit = asset ? firstNamed(asset, 'unit') : undefined;
  const u = unit?.attrs.meter !== undefined ? Number(unit.attrs.meter) : 1;
  if (!Number.isFinite(u) || u <= 0) throw new ImportError('Unidade <unit meter> inválida no COLLADA.');
  if (!unit) warnings.push('COLLADA sem <unit>: unidade presumida em metros.');
  else if (u !== 1) warnings.push(`Unidade do COLLADA: 1 unidade = ${u} m (convertida para metros).`);
  const upText = (asset ? firstNamed(asset, 'up_axis')?.text ?? 'Y_UP' : 'Y_UP').trim().toUpperCase();
  const R = upText === 'Z_UP' ? AXIS_IDENTITY : upText === 'X_UP' ? AXIS_X_UP_TO_Z : AXIS_Y_UP_TO_Z;

  const libImages = new Map<string, string>();
  for (const img of findAll(collada, 'image')) {
    const init = firstNamed(img, 'init_from')?.text.trim();
    if (img.attrs.id && init) libImages.set(img.attrs.id, init);
  }
  const effects = new Map<string, EffectInfo>();
  for (const eff of findAll(collada, 'effect')) if (eff.attrs.id) effects.set(eff.attrs.id, readEffect(eff));
  const materialDefs = new Map<string, { name: string; effect: string }>();
  for (const mat of findAll(collada, 'material')) {
    const ie = firstNamed(mat, 'instance_effect');
    materialDefs.set(mat.attrs.id ?? '', { name: mat.attrs.name || mat.attrs.id || 'Material', effect: idOf(ie?.attrs.url) });
  }

  const materials: ImportedMaterial[] = [];
  const textures: ImportedTexture[] = [];
  const textureByImage = new Map<string, number>();
  const matIndexById = new Map<string, number>();
  const imageToTexture = (imgId: string): number | undefined => {
    const hit = textureByImage.get(imgId);
    if (hit !== undefined) return hit;
    const path = libImages.get(imgId);
    if (!path) return undefined;
    const clean = path.replace(/^file:\/*/i, '');
    const bytes = lookupFile(ctx, clean);
    if (!bytes) {
      warnings.push(`Textura "${baseName(clean)}" não encontrada ao lado do COLLADA; material sem imagem.`);
      return undefined;
    }
    const mime = sniffImage(bytes);
    if (!mime) {
      warnings.push(`Textura "${baseName(clean)}" em formato não suportado (só PNG e JPEG); ignorada.`);
      return undefined;
    }
    const base = safeFileName(baseName(clean));
    const fileName = /\.(png|jpe?g)$/i.test(base) ? base : `${base}.${extForMime(mime)}`;
    textures.push({ fileName, mime, bytes: bytes.slice() });
    textureByImage.set(imgId, textures.length - 1);
    return textures.length - 1;
  };
  const materialIndex = (matId: string): number => {
    const hit = matIndexById.get(matId);
    if (hit !== undefined) return hit;
    const def = materialDefs.get(matId);
    const name = def?.name ?? (matId || 'Sem material');
    const eff = def ? effects.get(def.effect) : undefined;
    const m: ImportedMaterial = { name, color: eff?.color ?? [0.8, 0.8, 0.8], opacity: eff?.opacity ?? 1, category: guessCategory(name) };
    if (eff?.roughness !== undefined) m.roughness = eff.roughness;
    if (eff?.imageId) {
      const t = imageToTexture(eff.imageId);
      if (t !== undefined) m.textureIndex = t;
    }
    materials.push(m);
    matIndexById.set(matId, materials.length - 1);
    return materials.length - 1;
  };

  // Geometrias: cada <mesh> vira uma definicao. Materiais vem dos bindings da instancia atual.
  const sceneBinds: { current: Map<string, string> } = { current: new Map() };
  const defaultMat = (() => {
    materials.push(defaultMaterial());
    return materials.length - 1;
  })();
  const materialFor = (symbol: string): number => {
    const target = sceneBinds.current.get(symbol);
    return target !== undefined ? materialIndex(target) : defaultMat;
  };

  const buildGeometry = (geomId: string, geom: XNode): ImportedMeshDef | undefined => {
    const mesh = firstNamed(geom, 'mesh');
    if (!mesh) return undefined;
    const sources = new Map<string, Source>();
    for (const src of childrenNamed(mesh, 'source')) {
      const fa = firstNamed(src, 'float_array');
      const acc = firstNamed(firstNamed(src, 'technique_common') ?? src, 'accessor');
      const stride = Number(acc?.attrs.stride ?? 3) || 3;
      const values = numbers(fa?.text ?? '');
      const count = Number(acc?.attrs.count ?? values.length / stride);
      if (values.length < count * stride) throw new ImportError(`Fonte "${src.attrs.id}" do COLLADA truncada (faltam valores).`);
      if (src.attrs.id) sources.set(src.attrs.id, { values, stride });
    }
    const vertexInputs: Array<{ sem: string; src: string }> = [];
    const verticesEl = firstNamed(mesh, 'vertices');
    if (verticesEl) for (const inp of childrenNamed(verticesEl, 'input')) vertexInputs.push({ sem: inp.attrs.semantic ?? '', src: idOf(inp.attrs.source) });

    const fetchRow = (srcId: string, idx: number): number[] | undefined => {
      const s = sources.get(srcId);
      if (!s) return undefined;
      const o = idx * s.stride;
      if (o + s.stride > s.values.length) throw new ImportError('Índice fora da fonte no COLLADA (arquivo corrompido?).');
      return s.values.slice(o, o + s.stride);
    };
    const mb = new MeshBuilder();
    const cache = new Map<string, number>();
    const vertexAt = (inputs: Input[], flat: number[], base: number): number => {
      const idxs = inputs.map((i) => flat[base + i.offset] ?? 0);
      const key = inputs.map((i, k) => `${i.sem}${i.set}:${idxs[k]}`).join('|');
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      let p: number[] | undefined;
      let n: number[] | undefined;
      let t: number[] | undefined;
      const take = (sem: string, srcId: string, idx: number) => {
        if (sem === 'POSITION') p = p ?? fetchRow(srcId, idx);
        else if (sem === 'NORMAL') n = n ?? fetchRow(srcId, idx);
        else if (sem === 'TEXCOORD') t = t ?? fetchRow(srcId, idx);
      };
      inputs.forEach((inp, k) => {
        const idx = idxs[k] ?? 0;
        if (inp.sem === 'VERTEX') for (const vi of vertexInputs) take(vi.sem, vi.src, idx);
        else take(inp.sem, inp.src, idx);
      });
      const pos = p ?? [0, 0, 0];
      const q = rot3(R, pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0);
      const nn = n ? rot3(R, n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) : undefined;
      const v = mb.vertex(null, [q[0] * u, q[1] * u, q[2] * u], nn, t ? [t[0] ?? 0, t[1] ?? 0] : undefined);
      cache.set(key, v);
      return v;
    };

    for (const prim of [...childrenNamed(mesh, 'triangles'), ...childrenNamed(mesh, 'polylist'), ...childrenNamed(mesh, 'polygons')]) {
      const inputs: Input[] = childrenNamed(prim, 'input').map((i) => ({
        sem: i.attrs.semantic ?? '',
        src: idOf(i.attrs.source),
        offset: Number(i.attrs.offset ?? 0),
        set: i.attrs.set ?? '',
      }));
      const stride = Math.max(1, ...inputs.map((i) => i.offset + 1));
      const matIdx = materialFor(prim.attrs.material ?? '');
      // cada poligono vira um array plano de indices (stride valores por vertice)
      const polys: number[][] = [];
      if (prim.name === 'polylist') {
        const vcount = numbers(firstNamed(prim, 'vcount')?.text ?? '');
        const p = numbers(firstNamed(prim, 'p')?.text ?? '');
        let at = 0;
        for (const n of vcount) {
          polys.push(p.slice(at, at + n * stride));
          at += n * stride;
        }
      } else if (prim.name === 'polygons') {
        for (const pe of childrenNamed(prim, 'p')) polys.push(numbers(pe.text));
      } else {
        const p = numbers(firstNamed(prim, 'p')?.text ?? '');
        const per = 3 * stride;
        for (let at = 0; at + per <= p.length; at += per) polys.push(p.slice(at, at + per));
      }
      for (const flat of polys) {
        const count = Math.floor(flat.length / stride);
        const verts: number[] = [];
        for (let k = 0; k < count; k += 1) verts.push(vertexAt(inputs, flat, k * stride));
        for (let k = 1; k + 1 < verts.length; k += 1) mb.triangle(matIdx, verts[0]!, verts[k]!, verts[k + 1]!);
      }
    }
    return mb.build(`g${geomId}`, geom.attrs.name || geomId);
  };

  const geometries = new Map<string, XNode>();
  for (const g of findAll(collada, 'geometry')) if (g.attrs.id) geometries.set(g.attrs.id, g);
  const controllers = new Map<string, XNode>();
  for (const c of findAll(collada, 'controller')) if (c.attrs.id) controllers.set(c.attrs.id, c);
  const libNodes = new Map<string, XNode>();
  for (const n of findAll(collada, 'node')) if (n.attrs.id) libNodes.set(n.attrs.id, n);

  // Cena visual (a referenciada por instance_visual_scene, ou a primeira).
  const visualScenes = findAll(collada, 'visual_scene');
  const sceneRef = findAll(collada, 'instance_visual_scene')[0];
  const vscene = visualScenes.find((v) => v.attrs.id === idOf(sceneRef?.attrs.url)) ?? visualScenes[0];
  if (!vscene) throw new ImportError('COLLADA sem cena visual (library_visual_scenes).');

  const defs: ImportedMeshDef[] = [];
  const defIdByGeom = new Map<string, string>();
  const instances: ImportedInstance[] = [];

  const localOf = (n: XNode): Mat4 => {
    let m = mat4Identity();
    for (const c of n.children) {
      let t: Mat4 | undefined;
      const v = numbers(c.text);
      if (c.name === 'matrix' && v.length === 16) {
        // COLLADA grava a matriz por linhas: [r0c0 r0c1 r0c2 r0c3 r1c0 ...]
        t = mat4FromRows3([v[0]!, v[1]!, v[2]!, v[4]!, v[5]!, v[6]!, v[8]!, v[9]!, v[10]!]);
        t[12] = v[3] ?? 0;
        t[13] = v[7] ?? 0;
        t[14] = v[11] ?? 0;
      } else if (c.name === 'translate' && v.length >= 3) {
        t = mat4Identity();
        t[12] = v[0]!;
        t[13] = v[1]!;
        t[14] = v[2]!;
      } else if (c.name === 'rotate' && v.length >= 4) {
        t = mat4AxisAngle(v[0]!, v[1]!, v[2]!, v[3]!);
      } else if (c.name === 'scale' && v.length >= 3) {
        t = mat4Identity();
        t[0] = v[0]!;
        t[5] = v[1]!;
        t[10] = v[2]!;
      } else if (c.name === 'lookat' || c.name === 'skew') {
        warnings.push(`Transformação <${c.name}> ignorada no COLLADA.`);
      }
      if (t) m = mat4Mul(m, t);
    }
    return m;
  };

  const addInstance = (gid: string, binds: Map<string, string>, name: string | undefined, world: Mat4): void => {
    let defId = defIdByGeom.get(gid);
    if (!defId) {
      const geom = geometries.get(gid);
      if (!geom) {
        warnings.push(`Geometria "${gid}" não encontrada no COLLADA; ignorada.`);
        return;
      }
      sceneBinds.current = binds;
      const def = buildGeometry(gid, geom);
      if (!def) return;
      defs.push(def);
      defId = def.id;
      defIdByGeom.set(gid, defId);
    }
    instances.push({ defId, name, transform: scaleTranslation(changeAxisMat(world, R), u) });
  };

  const bindsOf = (inst: XNode): Map<string, string> => {
    const binds = new Map<string, string>();
    for (const im of findAll(inst, 'instance_material')) if (im.attrs.symbol) binds.set(im.attrs.symbol, idOf(im.attrs.target));
    return binds;
  };

  const visit = (node: XNode, parent: Mat4, depth: number): void => {
    if (depth > 256) throw new ImportError('Hierarquia de nós do COLLADA profunda demais.');
    const world = mat4Mul(parent, localOf(node));
    const name = node.attrs.name || node.attrs.id;
    for (const ig of childrenNamed(node, 'instance_geometry')) addInstance(idOf(ig.attrs.url), bindsOf(ig), name, world);
    for (const ic of childrenNamed(node, 'instance_controller')) {
      const ctrl = controllers.get(idOf(ic.attrs.url));
      const skin = ctrl ? firstNamed(ctrl, 'skin') : undefined;
      if (!skin) {
        warnings.push('Controlador sem geometria base (morph ou desconhecido) ignorado.');
        continue;
      }
      warnings.push('Esqueleto (skin) ignorado: a geometria sai na pose de repouso.');
      addInstance(idOf(skin.attrs.source), bindsOf(ic), name, world);
    }
    for (const inn of childrenNamed(node, 'instance_node')) {
      const ref = libNodes.get(idOf(inn.attrs.url));
      if (ref) visit(ref, world, depth + 1);
    }
    for (const child of childrenNamed(node, 'node')) visit(child, world, depth + 1);
  };
  for (const n of childrenNamed(vscene, 'node')) visit(n, mat4Identity(), 0);
  if (defs.length === 0) throw new ImportError('Nenhuma malha encontrada na cena do COLLADA.');
  progress(opts, 0.9, 'Montando modelo');

  // Remove materiais nao usados e reindexa.
  const used = new Set<number>();
  for (const d of defs) for (const g of d.groups) used.add(g.materialIndex);
  const remap = new Map<number, number>();
  const outMats: ImportedMaterial[] = [];
  for (let i = 0; i < materials.length; i += 1) {
    if (!used.has(i)) continue;
    remap.set(i, outMats.length);
    outMats.push(materials[i]!);
  }
  for (const d of defs) for (const g of d.groups) g.materialIndex = remap.get(g.materialIndex) ?? 0;
  if (outMats.length === 0) outMats.push(defaultMaterial());

  const name = baseName(file.name).replace(/\.dae$/i, '');
  return buildModel({
    name,
    sourceFileName: file.name,
    sourceFormat: 'dae',
    defs,
    instances,
    materials: outMats,
    textures,
    warnings,
    startedAt,
    sourceBytes: file.bytes.length,
    scale: opts?.scale,
  });
}

/** `ImportFn` do COLLADA sem arquivos vizinhos. */
export const importDae: ImportFn = (file, opts) => readDae(file, opts, emptyContext());
