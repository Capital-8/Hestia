import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assinaturasDoProjeto, resolveLevel } from '@hestia/engine';
import { buildFurnitureAsset, createEmptyProject, type Furniture, type FurnitureAsset, type FurnitureImportInput, type Project } from '@hestia/model';
import { AVISO_TRIANGULOS_MOVEIS, furnitureViewBudget } from './furnitureBudget.ts';
import { filaDeVersoesLeves, metasLeves } from './furnitureLod.ts';
import { assinaturaDeMoveis, buildFurnitureGhostBatches, buildFurnitureLevel, moveisIdDaInstancia, planFurniture, type ContextoMoveis } from './furnitureSolids.ts';
import { ModelScene } from './scene3d.ts';
import { caixaDaSelecao } from './selecao3d.ts';

/** Esfera com `n` x `n` quadrados (2 n^2 triângulos), normais radiais, um grupo por hemisfério (dois materiais). */
function esfera(n: number, r = 0.5): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array; groups: Array<{ start: number; count: number; materialIndex: number }> } {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI;
    for (let j = 0; j <= n; j++) {
      const ph = (j / n) * 2 * Math.PI;
      const x = Math.sin(th) * Math.cos(ph);
      const y = Math.sin(th) * Math.sin(ph);
      const z = Math.cos(th);
      pos.push(x * r, y * r, z * r);
      nor.push(x, y, z);
      uv.push(j / n, i / n);
    }
  }
  const idx: number[] = [];
  const metade: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      const b = a + n + 1;
      (i < n / 2 ? idx : metade).push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const indices = Uint32Array.from([...idx, ...metade]);
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), uvs: Float32Array.from(uv), indices, groups: [{ start: 0, count: idx.length, materialIndex: 0 }, { start: idx.length, count: metade.length, materialIndex: 1 }] };
}

const M = (tx: number, sx = 1): number[] => [sx, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1];

/** Bloco com duas definições (esfera 40x40 = 3200 tri e esfera 20x20 = 800 tri) e três peças (uma espelhada). */
function entrada(): FurnitureImportInput {
  const a = esfera(40);
  const b = esfera(20);
  return {
    name: 'Sofa',
    // estes testes verificam a matematica de transformacao com o bloco na origem do arquivo; o recentramento tem teste proprio no modelo
    recenter: false,
    sourceFileName: 'sofa.skp',
    sourceFormat: 'skp',
    defs: [{ id: 'dA', name: 'A', ...a }, { id: 'dB', name: 'B', ...b }],
    materials: [{ name: 'Tecido', color: [0.8, 0.2, 0.2], opacity: 1, category: 'fabric' }, { name: 'Madeira', color: [0.4, 0.3, 0.1], opacity: 1, category: 'wood' }],
    instances: [{ defId: 'dA', transform: M(0) }, { defId: 'dB', transform: M(1.5) }, { defId: 'dB', transform: M(-1.5, -1) }],
    textures: [],
  };
}

function projetoCom(asset: FurnitureAsset, n: number, extra: (i: number) => Partial<Furniture> = () => ({})): Project {
  const p = createEmptyProject();
  p.furniture = { assets: { [asset.id]: asset } };
  for (let i = 0; i < n; i++) {
    const id = `mv_${i}`;
    p.elements[id] = { id, kind: 'furniture', assetId: asset.id, levelId: p.levels[0]!.id, x: i * 3, y: 0, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'Sofa', order: i + 1, ...extra(i) } as Furniture;
  }
  return p;
}

const ctx = (): ContextoMoveis => ({
  material: (asset, mi) => new THREE.MeshBasicMaterial({ color: asset.materials[mi]?.color ?? '#ffffff' }),
  pick: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
});

const meshes = (g: THREE.Object3D): THREE.InstancedMesh[] => {
  const out: THREE.InstancedMesh[] = [];
  g.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) out.push(o as THREE.InstancedMesh);
  });
  return out;
};

describe('móveis na vista 3D: geometria compartilhada', () => {
  const asset = buildFurnitureAsset(entrada(), 'fa_sofa');

  it('o número de BufferGeometry e de chamadas não depende do número de instâncias', () => {
    const um = buildFurnitureLevel(projetoCom(asset, 1), 'lv_0', ctx(), { sincrono: true, qualidadePadrao: 'completo' })!;
    const muitas = buildFurnitureLevel(projetoCom(asset, 40), 'lv_0', ctx(), { sincrono: true, qualidadePadrao: 'completo' })!;
    expect(muitas.stats.geometrias).toBe(um.stats.geometrias);
    expect(muitas.stats.chamadas).toBe(um.stats.chamadas);
    expect(muitas.stats.instancias).toBe(40);
    // 3 peças por móvel: dA (2 materiais) + dB normal (2) + dB espelhada (2) = 6 malhas instanciadas.
    expect(meshes(muitas.grupo)).toHaveLength(6);
    const dB = meshes(muitas.grupo).filter((m) => m.userData.furnitureDefId === 'dB' && !m.userData.espelhada);
    expect(dB.every((m) => m.count === 40)).toBe(true);
    // As geometrias das instâncias compartilham os mesmos arrays de vértices (não há cópia por instância).
    const pos = muitas.grupo.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh).map((m) => m.geometry.getAttribute('position').array);
    expect(new Set(pos).size).toBe(2);
    expect(muitas.stats.triangulos).toBe(40 * (3200 + 800 + 800));
  });

  it('espelho: peça e instância espelhadas vão para InstancedMesh próprio com a ordem dos vértices invertida', () => {
    const p = projetoCom(asset, 2, (i) => ({ mirrored: i === 1 }));
    const r = buildFurnitureLevel(p, 'lv_0', ctx(), { sincrono: true, qualidadePadrao: 'completo' })!;
    const por = (def: string, esp: boolean) => meshes(r.grupo).filter((m) => m.userData.furnitureDefId === def && m.userData.espelhada === esp);
    // dA: móvel normal (1) sem espelho, móvel espelhado (1) com espelho.
    expect(por('dA', false).map((m) => m.count)).toEqual([1, 1]);
    expect(por('dA', true).map((m) => m.count)).toEqual([1, 1]);
    // dB: a peça 3 já é espelhada no bloco; o móvel espelhado desfaz o espelho dela e espelha a peça 2.
    expect(por('dB', true).map((m) => m.count)).toEqual([2, 2]);
    expect(por('dB', false).map((m) => m.count)).toEqual([2, 2]);
    const normal = por('dA', false)[0]!.geometry.index!.array as Uint32Array;
    const espelhada = por('dA', true)[0]!.geometry.index!.array as Uint32Array;
    expect(espelhada).toHaveLength(normal.length);
    expect([espelhada[0], espelhada[1], espelhada[2]]).toEqual([normal[0], normal[2], normal[1]]);
    // O índice espelhado é guardado: a segunda montagem reaproveita o mesmo buffer.
    const r2 = buildFurnitureLevel(p, 'lv_0', ctx(), { sincrono: true, qualidadePadrao: 'completo' })!;
    expect(meshes(r2.grupo).find((m) => m.userData.furnitureDefId === 'dA' && m.userData.espelhada)!.geometry.index).toBe(por('dA', true)[0]!.geometry.index);
  });

  it('seleção: instanceId vira o id do móvel e a malha de picking leva a faixa de cada instância', () => {
    const p = projetoCom(asset, 5);
    const r = buildFurnitureLevel(p, 'lv_0', ctx(), { sincrono: true, qualidadePadrao: 'completo' })!;
    const m = meshes(r.grupo).find((x) => x.userData.furnitureDefId === 'dA')!;
    expect(m.count).toBe(5);
    const ids = [...Array(5).keys()].map((i) => moveisIdDaInstancia(m, i));
    expect(new Set(ids)).toEqual(new Set(['mv_0', 'mv_1', 'mv_2', 'mv_3', 'mv_4']));
    // Raycast na InstancedMesh: o instanceId do acerto identifica o móvel.
    const alvo = ids.indexOf('mv_3');
    const rc = new THREE.Raycaster(new THREE.Vector3(9, -5, 0.2), new THREE.Vector3(0, 1, 0));
    const hit = rc.intersectObject(m, false)[0]!;
    expect(hit.instanceId).toBe(alvo);
    expect(moveisIdDaInstancia(m, hit.instanceId!)).toBe('mv_3');
    // Picking por faixas (padrão do repositório).
    const pick = r.grupo.children.find((o) => o.userData.moveisPick) as THREE.Mesh;
    const ranges = pick.userData.ranges as Array<{ id: string; start: number; count: number }>;
    expect(ranges).toHaveLength(5);
    expect(ranges.every((x) => x.count === 36)).toBe(true);
    expect(new Set(ranges.map((x) => x.id)).size).toBe(5);
    // A caixa da seleção é a caixa do móvel no mundo (x de 9 a 9 + largura do bloco).
    const holder = new THREE.Group();
    holder.add(r.grupo);
    const caixa = caixaDaSelecao(holder, ['mv_3'])!;
    expect(caixa.min.x).toBeCloseTo(9 - 2, 1);
    expect(caixa.max.x).toBeCloseTo(9 + 2, 1);
    expect(caixaDaSelecao(holder, ['nao_existe'])).toBeNull();
  });

  it('o picking das caixas dá a normal para fora também com espelho', () => {
    const p = projetoCom(asset, 1, () => ({ mirrored: true }));
    const r = buildFurnitureLevel(p, 'lv_0', ctx(), { sincrono: true })!;
    const pick = r.grupo.children.find((o) => o.userData.moveisPick) as THREE.Mesh;
    pick.material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    const alto = new THREE.Raycaster(new THREE.Vector3(0.1, 0.2, 5), new THREE.Vector3(0, 0, -1));
    expect(alto.intersectObject(pick, false)).toHaveLength(1);
  });

  it('móvel de outro nível, oculto ou de asset ausente não entra', () => {
    const p = projetoCom(asset, 3, (i) => (i === 1 ? { levelId: 'lv_9' } : {}));
    expect(planFurniture(p, 'lv_0', { ocultos: new Set(['mv_2']) }).caixas.map((c) => c.id)).toEqual(['mv_0']);
    expect(buildFurnitureLevel(createEmptyProject(), 'lv_0', ctx())).toBeNull();
  });

  it('elevação do nível e z do móvel entram na matriz', () => {
    const p = projetoCom(asset, 1, () => ({ z: 0.1 }));
    p.levels[0]!.elevation = 3;
    const plano = planFurniture(p, 'lv_0', { sincrono: true });
    const g = plano.grupos.find((x) => x.def.id === 'dA')!;
    expect(g.matrizes[14]).toBeCloseTo(3.1, 6);
  });
});

describe('móveis: versão leve e completa', () => {
  const asset = buildFurnitureAsset(entrada(), 'fa_lod');

  it('meta por bloco: soma desenhada perto da meta, completo intacto', () => {
    const metas = metasLeves(asset, 1000);
    // uso: dA 1x (3200 tri), dB 2x (800 tri): desenhado 4800; razão 1000/4800.
    expect(metas.get('dA')).toBe(Math.floor(3200 * (1000 / 4800)));
    expect(metas.get('dB')).toBe(Math.floor(800 * (1000 / 4800)));
    const p = projetoCom(asset, 3);
    const completo = buildFurnitureLevel(p, 'lv_0', ctx(), { sincrono: true, qualidadePadrao: 'completo' })!;
    const leve = buildFurnitureLevel(p, 'lv_0', ctx(), { sincrono: true, qualidadePadrao: 'leve', metaLeve: 1000 })!;
    expect(completo.stats.triangulos).toBe(3 * 4800);
    expect(leve.stats.triangulos).toBeLessThan(3 * 1000 * 1.35);
    expect(leve.stats.triangulos).toBeGreaterThan(3 * 1000 * 0.3);
    expect(leve.stats.triangulos).toBeLessThan(completo.stats.triangulos / 3);
  });

  it('definições pequenas (até o piso) não são simplificadas e a meta das grandes desconta o que elas ocupam', () => {
    const g = esfera(40);
    const m = esfera(7); // 98 triângulos: chapas finas e peças pequenas somem se agrupadas em grade
    const input = entrada();
    input.defs = [
      { id: 'grande', name: 'g', ...g },
      { id: 'pequena', name: 'p', ...m },
    ];
    input.instances = [{ defId: 'grande', transform: M(0) }, { defId: 'pequena', transform: M(2) }];
    const a = buildFurnitureAsset({ ...input, recenter: false }, 'fa_piso');
    const metas = metasLeves(a, 1000);
    expect(metas.get('pequena')).toBe(98);
    expect(metas.get('grande')! + 98).toBeLessThanOrEqual(1000);
    expect(metas.get('grande')!).toBeGreaterThan(800);
  });

  it('por instância: quality completo vence o padrão leve; bloco que cabe na meta fica completo', () => {
    const p = projetoCom(asset, 2, (i) => (i === 0 ? { quality: 'completo' } : {}));
    const r = buildFurnitureLevel(p, 'lv_0', ctx(), { sincrono: true, metaLeve: 1000 })!;
    expect(r.plano.grupos.filter((g) => g.qualidade === 'completo').every((g) => g.ids.every((id) => id === 'mv_0'))).toBe(true);
    expect(r.plano.grupos.some((g) => g.qualidade === 'leve' && g.ids.includes('mv_1'))).toBe(true);
    const cabe = buildFurnitureLevel(projetoCom(asset, 1), 'lv_0', ctx(), { sincrono: true, metaLeve: 100_000 })!;
    expect(cabe.stats.triangulos).toBe(4800);
  });

  it('assíncrono: caixa enquanto a versão leve não existe, depois a malha leve; a assinatura muda', async () => {
    const fresco = buildFurnitureAsset(entrada(), 'fa_async');
    const p = projetoCom(fresco, 2);
    const antes = buildFurnitureLevel(p, 'lv_0', ctx(), { metaLeve: 1200 })!;
    expect(antes.plano.grupos.every((g) => g.qualidade === 'caixa')).toBe(true);
    expect(antes.stats.triangulos).toBe(2 * 3 * 12);
    expect(antes.plano.pendentes).toHaveLength(1);
    const sigAntes = assinaturaDeMoveis(p, 'lv_0', { metaLeve: 1200 });
    await filaDeVersoesLeves.esvaziar();
    const depois = buildFurnitureLevel(p, 'lv_0', ctx(), { metaLeve: 1200 })!;
    expect(depois.plano.grupos.every((g) => g.qualidade === 'leve')).toBe(true);
    expect(depois.stats.triangulos).toBeGreaterThan(2 * 600);
    expect(depois.plano.pendentes).toHaveLength(0);
    expect(assinaturaDeMoveis(p, 'lv_0', { metaLeve: 1200 })).not.toBe(sigAntes);
    expect(assinaturaDeMoveis(createEmptyProject(), 'lv_0')).toBe('');
  });
});

describe('orçamento da vista', () => {
  const asset = buildFurnitureAsset(entrada(), 'fa_orc');
  it('conta triângulos, instâncias, definições e chamadas sem montar malha', () => {
    const p = projetoCom(asset, 10);
    const completo = furnitureViewBudget(p, { qualidadePadrao: 'completo' });
    expect(completo).toMatchObject({ instancias: 10, assets: 1, definicoes: 2, triangulos: 10 * 4800, triangulosCompletos: 10 * 4800, excede: false });
    // 2 definições; dA 2 materiais, dB 2 materiais x (normal + espelhada) = 2 + 4 chamadas.
    expect(completo.chamadas).toBe(6);
    const leve = furnitureViewBudget(p, { metaLeve: 1000 });
    expect(leve.triangulos).toBeLessThanOrEqual(10 * 1000);
    expect(leve.triangulosCompletos).toBe(10 * 4800);
    expect(leve.chamadas).toBe(6);
  });
  it('avisa acima do limite, respeita nível, ocultos e a qualidade de cada instância', () => {
    const grande = projetoCom(asset, 500);
    expect(furnitureViewBudget(grande, { qualidadePadrao: 'completo' }).excede).toBe(true);
    expect(furnitureViewBudget(grande, { qualidadePadrao: 'completo', limite: 5_000_000 }).excede).toBe(false);
    expect(AVISO_TRIANGULOS_MOVEIS).toBe(2_000_000);
    const p = projetoCom(asset, 4, (i) => (i < 2 ? { quality: 'completo' } : {}));
    expect(furnitureViewBudget(p, { metaLeve: 1000, ocultos: new Set(['mv_0']) }).instancias).toBe(3);
    expect(furnitureViewBudget(p, { metaLeve: 1000, nivel: 'lv_9' }).instancias).toBe(0);
    const mista = furnitureViewBudget(p, { metaLeve: 1000 });
    expect(mista.triangulos).toBeGreaterThan(2 * 4800);
    expect(mista.triangulos).toBeLessThan(2 * 4800 + 2 * 1000 + 1);
    expect(furnitureViewBudget(createEmptyProject()).instancias).toBe(0);
  });
});

describe('integração com a cena e o fantasma', () => {
  const asset = buildFurnitureAsset(entrada(), 'fa_cena');

  it('ModelScene desenha os móveis do nível como InstancedMesh e libera ao descartar', () => {
    const p = projetoCom(asset, 6);
    const cena = new ModelScene({ moveis: { sincrono: true, qualidadePadrao: 'completo' } });
    cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false });
    const todas: THREE.InstancedMesh[] = [];
    cena.scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData.moveis) todas.push(o as THREE.InstancedMesh);
    });
    expect(todas).toHaveLength(6);
    expect(todas.reduce((a, m) => a + m.count, 0)).toBe(36);
    // Mudar a qualidade padrão e atualizar refaz o nível (a assinatura entra na chave).
    cena.moveis.opcoes = { sincrono: true, qualidadePadrao: 'leve', metaLeve: 1000 };
    cena.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false });
    let tri = 0;
    cena.scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh && o.userData.moveis) tri += m.count * ((m.geometry.index?.count ?? 0) / 3);
    });
    expect(tri).toBeLessThan(6 * 2000);
    cena.dispose();
  });

  it('fantasma: caixa de 12 triângulos por móvel, com a faixa dele', () => {
    const lotes = buildFurnitureGhostBatches(projetoCom(asset, 3), 'lv_0');
    expect(lotes).toHaveLength(1);
    expect(lotes[0]!.indices).toHaveLength(3 * 36);
    expect(lotes[0]!.ids.map((r) => r.id)).toEqual(['mv_0', 'mv_1', 'mv_2']);
    expect(buildFurnitureGhostBatches(createEmptyProject(), 'lv_0')).toEqual([]);
  });
});

describe('chave do cache de malhas', () => {
  it('a assinatura do projeto não relê os arrays do asset; cor do material e instância mudam a chave', () => {
    const asset = buildFurnitureAsset(entrada(), 'fa_chave');
    const p = projetoCom(asset, 2);
    const base = assinaturasDoProjeto(p);
    const lido = JSON.stringify;
    let leituras = 0;
    JSON.stringify = ((...a: Parameters<typeof JSON.stringify>) => {
      const t = lido(...a);
      if (t.length > 100_000) leituras++;
      return t;
    }) as typeof JSON.stringify;
    try {
      assinaturasDoProjeto(p);
    } finally {
      JSON.stringify = lido;
    }
    expect(leituras).toBe(0);
    const outraCor = projetoCom({ ...asset, materials: asset.materials.map((m, i) => (i === 0 ? { ...m, color: '#00ff00' } : m)) }, 2);
    expect(assinaturasDoProjeto(outraCor).global).not.toBe(base.global);
    const movido = projetoCom(asset, 2, (i) => (i === 1 ? { x: 99 } : {}));
    expect(assinaturasDoProjeto(movido).nivel.get('lv_0')).not.toBe(base.nivel.get('lv_0'));
    expect(assinaturasDoProjeto(movido).global).toBe(base.global);
  });
});
