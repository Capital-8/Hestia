import * as THREE from 'three';
import {
  ACABAMENTOS_MOVEIS,
  applyCommand as aplicar,
  createEmptyProject,
  FAMILIA_ARMARIO,
  view3dOf,
  type Command,
  type Component,
  type Project,
} from '@hestia/model';
import { malhaDoComponente, resolverComponente, volumeDaMalha } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { buildComponentSolids, MATERIAIS_DE_COMPONENTE } from './componentSolids.ts';
import { Materiais3D } from './materiais3d.ts';
import { PreviaComponente3D } from './previaComponente3d.ts';
import { descartarTexturasMobiliario, obterTexturasAcabamento } from './texturasMobiliario.ts';

const ap = (p: Project, c: Command): Project => { const q = structuredClone(p); aplicar(q, c); return q; };
const base = (): Project => ap(createEmptyProject('t'), { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
const comp = (p: Project, id: string, extra: Partial<Component> = {}): Component => ({
  id, kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: id, ...extra,
});
const com = (p: Project, ...cs: Component[]): Project => { const q = structuredClone(p); for (const c of cs) q.elements[c.id] = c; return q; };

/** Volume (m3) de um lote pela soma dos tetraedros assinados. */
function volumeDoLote(b: { positions: number[]; indices: number[] }): number {
  return volumeDaMalha({ positions: b.positions, normals: [], indices: b.indices, pecaDoTriangulo: [] });
}

describe('materiais de componente', () => {
  it('inclui as 5 chaves base e todo o catálogo ACABAMENTOS_MOVEIS com cores hex válidas', () => {
    const esperados = ['comp_corpo', 'comp_fundo', 'comp_porta', 'comp_rodape', 'comp_tampo', ...ACABAMENTOS_MOVEIS.map((a) => a.id)].sort();
    expect(Object.keys(MATERIAIS_DE_COMPONENTE).sort()).toEqual(esperados);
    for (const [id, m] of Object.entries(MATERIAIS_DE_COMPONENTE)) {
      expect(m.id).toBe(id);
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(MATERIAIS_DE_COMPONENTE.comp_vidro_fume?.opacity).toBeCloseTo(0.42, 5);
  });
});

describe('buildComponentSolids', () => {
  it('sem componentes: lista vazia; outro nível: vazia', () => {
    const p = base();
    expect(buildComponentSolids(p, p.levels[0]!.id)).toEqual([]);
    const q = com(p, comp(p, 'c1', { levelId: 'outro' as never }));
    expect(buildComponentSolids(q, p.levels[0]!.id)).toEqual([]);
  });
  it('um componente: lotes por material, categoria da arquitetura, ordenados, com a faixa do elemento e o volume das peças', () => {
    const p0 = base();
    const c = comp(p0, 'c1');
    const p = com(p0, c);
    const lotes = buildComponentSolids(p, p.levels[0]!.id);
    expect(lotes.map((l) => l.materialId)).toEqual(['comp_corpo', 'comp_fundo', 'comp_porta', 'comp_rodape', 'comp_tampo']);
    for (const l of lotes) {
      expect(l.category).toBe('component');
      expect(l.positions.length).toBe(l.normals.length);
      expect(l.ids.length).toBeGreaterThan(0);
      for (const r of l.ids) { expect(r.id).toBe('c1'); expect(r.count % 3).toBe(0); expect(r.start + r.count).toBeLessThanOrEqual(l.indices.length); }
      expect(l.indices.every((i) => i >= 0 && i < l.positions.length / 3)).toBe(true);
    }
    const total = lotes.reduce((s, l) => s + volumeDoLote(l), 0);
    const m = malhaDoComponente(p, c, resolverComponente(p, c));
    expect(total).toBeCloseTo(volumeDaMalha(m.solidas), 9);
  });
  it('dois componentes no mesmo lote ficam em faixas separadas, uma por id; posições no mundo', () => {
    const p0 = base();
    const p = com(p0, comp(p0, 'a', { x: 0 }), comp(p0, 'b', { x: 5, rotation: Math.PI / 2, mirrored: true }));
    const corpo = buildComponentSolids(p, p.levels[0]!.id).find((l) => l.materialId === 'comp_corpo')!;
    expect(new Set(corpo.ids.map((r) => r.id))).toEqual(new Set(['a', 'b']));
    const xs = corpo.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeLessThan(1);
    expect(Math.max(...xs)).toBeGreaterThan(4.5);
  });
  it('família ausente ou sem peças não gera nada e não lança; vazias não aparecem', () => {
    const p0 = createEmptyProject('t');
    const q = com(p0, comp(p0, 'c1'));
    expect(buildComponentSolids(q, q.levels[0]!.id)).toEqual([]);
    const f = structuredClone(FAMILIA_ARMARIO);
    f.pecas.push({ id: 'cuba', nome: 'Cuba', papel: 'bloco', vazio: true, eixo: 'z', origem: ['100', '100', 'A - 100'], tamanho: ['200', '200'], espessura: '100' });
    const p = com(ap(p0, { type: 'upsertFamily', family: f }), comp(p0, 'c1'));
    const lotes = buildComponentSolids(p, p.levels[0]!.id);
    expect(lotes.some((l) => l.materialId === 'comp_corpo')).toBe(true);
    expect(lotes.flatMap((l) => l.ids).length).toBe(lotes.length);
  });
  it('é determinística', () => {
    const p0 = base();
    const p = com(p0, comp(p0, 'c1'));
    expect(buildComponentSolids(p, p.levels[0]!.id)).toEqual(buildComponentSolids(p, p.levels[0]!.id));
  });
  it('aplica acabamentos personalizados da instância (acabCorpo, acabPorta, acabTampo)', () => {
    const p0 = base();
    const c = comp(p0, 'c1', { values: { acabCorpo: 'comp_nogueira', acabPorta: 'comp_sage', acabTampo: 'comp_calacatta' } });
    const p = com(p0, c);
    const ids = buildComponentSolids(p, p.levels[0]!.id).map((l) => l.materialId);
    expect(ids).toEqual(['comp_calacatta', 'comp_fundo', 'comp_nogueira', 'comp_rodape', 'comp_sage']);
  });
});

describe('texturasMobiliario e Materiais3D', () => {
  it('gera texturas DataTexture determinísticas em cache para todos os acabamentos e descarta corretamente', () => {
    descartarTexturasMobiliario();
    expect(obterTexturasAcabamento('desconhecido')).toBeNull();

    const carvalho1 = obterTexturasAcabamento('comp_carvalho')!;
    const carvalho2 = obterTexturasAcabamento('comp_carvalho')!;
    expect(carvalho1).toBe(carvalho2);
    expect(carvalho1.map).toBeInstanceOf(THREE.DataTexture);
    expect(carvalho1.bumpMap).toBeInstanceOf(THREE.DataTexture);
    expect(carvalho1.map!.wrapS).toBe(THREE.RepeatWrapping);
    expect(carvalho1.map!.wrapT).toBe(THREE.RepeatWrapping);
    expect(carvalho1.map!.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(carvalho1.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(carvalho1.bumpMap!.colorSpace).toBe(THREE.NoColorSpace);

    const alu = obterTexturasAcabamento('comp_aluminio')!;
    expect(alu.metalness).toBeCloseTo(0.72, 5);
    expect(alu.roughness).toBeCloseTo(0.28, 5);

    const vidro = obterTexturasAcabamento('comp_vidro_fume')!;
    expect(vidro.opacity).toBeCloseTo(0.42, 5);

    descartarTexturasMobiliario();
    const carvalho3 = obterTexturasAcabamento('comp_carvalho')!;
    expect(carvalho3).not.toBe(carvalho1);
    expect(Array.from(carvalho3.map!.image.data as Uint8Array)).toEqual(Array.from(carvalho1.map!.image.data as Uint8Array));
    descartarTexturasMobiliario();
  });

  it('Materiais3D.face aplica map no modo shaded e PBR (map + bumpMap + roughness + metalness) no realistic', () => {
    const mats = new Materiais3D();
    const baseView = view3dOf({});
    mats.marco = { view: { ...baseView, style: 'shaded' }, dark: false };
    const shaded = mats.face(MATERIAIS_DE_COMPONENTE.comp_freijo, 'generic') as THREE.MeshLambertMaterial;
    expect(shaded).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(shaded.map).toBeInstanceOf(THREE.DataTexture);
    expect(shaded.color.getHex()).toBe(0xffffff);

    mats.marco = { view: { ...baseView, style: 'realistic' }, dark: false };
    const realistic = mats.face(MATERIAIS_DE_COMPONENTE.comp_cobre, 'generic') as THREE.MeshStandardMaterial;
    expect(realistic).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(realistic.map).toBeInstanceOf(THREE.DataTexture);
    expect(realistic.bumpMap).toBeInstanceOf(THREE.DataTexture);
    expect(realistic.bumpScale).toBeCloseTo(0.002, 5);
    expect(realistic.metalness).toBeCloseTo(0.72, 5);
    expect(realistic.roughness).toBeCloseTo(0.28, 5);
    expect(realistic.color.getHex()).toBe(0xffffff);

    const vidro = mats.face(MATERIAIS_DE_COMPONENTE.comp_vidro_fume, 'generic') as THREE.MeshStandardMaterial;
    expect(vidro.transparent).toBe(true);
    expect(vidro.opacity).toBeCloseTo(0.42, 5);

    const baseOv = baseView.overrides;
    mats.marco = { view: { ...baseView, style: 'realistic', overrides: { ...baseOv, generic: { ...baseOv.generic, halftone: true, transparency: 0.5 } } }, dark: false };
    const halftone = mats.face(MATERIAIS_DE_COMPONENTE.comp_freijo, 'generic') as THREE.MeshStandardMaterial;
    expect(halftone.map).toBeNull();
    expect(halftone.transparent).toBe(true);
    expect(halftone.opacity).toBeCloseTo(0.5, 5);

    mats.marco = { view: { ...baseView, style: 'hiddenLine' }, dark: false };
    const hidden = mats.face(MATERIAIS_DE_COMPONENTE.comp_freijo, 'generic') as THREE.MeshBasicMaterial;
    expect(hidden).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(hidden.map).toBeNull();

    mats.dispose();
    descartarTexturasMobiliario();
  });

  it('PreviaComponente3D usa texturas e opacidade dos acabamentos', () => {
    const p0 = base();
    const c = comp(p0, 'prev', { values: { acabCorpo: 'comp_carvalho', acabPorta: 'comp_vidro_fume', acabTampo: 'comp_calacatta' } });
    const previa = new PreviaComponente3D();
    previa.atualizar(p0, c);
    const meshes = previa.grupo.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh);
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) {
      const mat = m.material as THREE.MeshLambertMaterial;
      expect(mat.map).toBeInstanceOf(THREE.DataTexture);
    }
    const vidroMesh = meshes.find((m) => (m.material as THREE.MeshLambertMaterial).opacity < 0.5);
    expect(vidroMesh).toBeDefined();
    previa.destruir();
    descartarTexturasMobiliario();
  });
});
