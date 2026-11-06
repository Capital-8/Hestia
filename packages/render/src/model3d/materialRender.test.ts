import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTemplate, createEmptyProject, makeWall, view3dOf, type Material, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import type { RenderSceneSnapshot } from '../offline/cena.ts';
import { ModelScene } from './scene3d.ts';
import { ListaDeTexturas, mapasDoMaterial, materialDaOrigem, renderMaterialDaMalha, renderMaterialDoModelo, tipoDoPreset } from './materialRender.ts';
import { tipoProceduralDoElemento } from './tipoMaterial.ts';

/** Material de modelo mínimo, para os testes de conversão. */
const material = (extra: Partial<Material> = {}): Material => ({
  id: 'mat_teste',
  name: 'Teste',
  color: '#a9794a',
  hatch: 'none',
  gloss: 0.1,
  opacity: 1,
  cost: 0,
  unit: 'm2',
  ...extra,
});

/** Exporta a cena do projeto com o estilo realista (o mesmo caminho do render offline). */
function exportar(p: Project): { snap: RenderSceneSnapshot; cena: ModelScene } {
  const comRealista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
  const cena = new ModelScene();
  cena.update(comRealista, comRealista.levels.map((l) => resolveLevel(comRealista, l.id)), { dark: false, edges: true, shadows: true });
  return { snap: cena.exportarCenaDeRender({ aspect: 16 / 9 }), cena };
}

/** Um projeto com uma parede de alvenaria 14 (padrão: tinta, reboco e bloco; reboco e bloco têm preset) no térreo. */
function paredes(n: number): Project {
  const p = createEmptyProject();
  for (let i = 0; i < n; i++) {
    const w = makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 * i }, b: { x: 4, y: 3 * i } });
    p.elements[w.id] = { ...w, order: i + 1 };
  }
  return p;
}

/** Triângulos por tipo procedural (o tipo de cada lote é o do material que ele usa). */
function trianglosPorTipo(snap: RenderSceneSnapshot): Map<number, number> {
  const out = new Map<number, number>();
  for (const b of snap.batches) {
    const tipo = snap.materials[b.material]?.tipo ?? 0;
    out.set(tipo, (out.get(tipo) ?? 0) + b.indexCount / 3);
  }
  return out;
}

describe('tipoDoPreset: preset de textura -> tipo procedural', () => {
  it.each([
    ['reboco', 1],
    ['madeira', 2],
    ['telha', 3],
    ['piso', 4],
    ['metal', 5],
    ['tijolo', 7],
    // Sem tipo procedural no motor ainda: liso até a textura de imagem (F3).
    ['pedra', 0],
    ['concreto', 0],
  ] as const)('preset %s vira tipo %i', (preset, tipo) => {
    expect(tipoDoPreset(material({ texture: { preset } }))).toBe(tipo);
  });

  it('sem preset e opaco: liso (0); preset "nenhum" também é liso', () => {
    expect(tipoDoPreset(material())).toBe(0);
    expect(tipoDoPreset(material({ texture: { preset: 'nenhum' } }))).toBe(0);
  });

  it('sem preset e com transmissão > 0 ou opacidade < 1: vidro (6), mesmo com preset "nenhum"', () => {
    expect(tipoDoPreset(material({ transmission: 0.85 }))).toBe(6);
    expect(tipoDoPreset(material({ opacity: 0.35 }))).toBe(6);
    expect(tipoDoPreset(material({ texture: { preset: 'nenhum' }, transmission: 0.5 }))).toBe(6);
  });

  it('o preset vence a transparência: um material com preset madeira e transmissão continua madeira (2)', () => {
    expect(tipoDoPreset(material({ texture: { preset: 'madeira' }, transmission: 0.5 }))).toBe(2);
  });
});

describe('renderMaterialDoModelo: propriedades do material de modelo no render', () => {
  it('cor em linear (como o three.js converte o #rrggbb) e opacidade', () => {
    const r = renderMaterialDoModelo(material({ opacity: 0.5 }));
    const cor = new THREE.Color('#a9794a');
    expect(r.baseColor[0]).toBeCloseTo(cor.r, 6);
    expect(r.baseColor[1]).toBeCloseTo(cor.g, 6);
    expect(r.baseColor[2]).toBeCloseTo(cor.b, 6);
    expect(r.opacity).toBe(0.5);
  });

  it('rugosidade personalizada (0.2) passa sem mudar; sem o campo, vale 1 - gloss', () => {
    expect(renderMaterialDoModelo(material({ roughness: 0.2 })).roughness).toBe(0.2);
    expect(renderMaterialDoModelo(material({ gloss: 0.1 })).roughness).toBeCloseTo(0.9, 6);
  });

  it('metalicidade, transmissão e IOR com os padrões de materialPbr.ts quando o campo falta', () => {
    const padrao = renderMaterialDoModelo(material());
    expect([padrao.metallic, padrao.transmission, padrao.ior]).toEqual([0, 0, 1.5]);
    const vidro = renderMaterialDoModelo(material({ transmission: 0.85, ior: 1.52, metallic: 0 }));
    expect([vidro.transmission, vidro.ior]).toEqual([0.85, 1.52]);
    expect(renderMaterialDoModelo(material({ metallic: 1 })).metallic).toBe(1);
  });

  it('emissão = cor linear * intensidade; sem emissão, zero', () => {
    const cor = new THREE.Color('#ff8000');
    const e = renderMaterialDoModelo(material({ emissive: { color: '#ff8000', intensity: 2 } })).emissive;
    expect(e[0]).toBeCloseTo(2 * cor.r, 6);
    expect(e[1]).toBeCloseTo(2 * cor.g, 6);
    expect(e[2]).toBeCloseTo(2 * cor.b, 6);
    expect(renderMaterialDoModelo(material()).emissive).toEqual([0, 0, 0]);
  });

  it('escala = metros por repetição do mapeamento; sem mapeamento, 1.0', () => {
    expect(renderMaterialDoModelo(material({ mapping: { scale: 2.5 } })).escala).toBe(2.5);
    expect(renderMaterialDoModelo(material()).escala).toBe(1);
  });
});

describe('fonte do material: camada primeiro, categoria só como fallback', () => {
  it('malha com material de modelo usa o material (o tipo do preset), não a categoria', () => {
    // Uma parede (categoria "wall", que daria reboco) com material de camada liso: o render mostra o material.
    const r = renderMaterialDoModelo(material({ texture: { preset: 'madeira' } }));
    expect(r.tipo).toBe(2);
    expect(tipoProceduralDoElemento('wall').tipo).toBe(1);
  });

  it('sem material de modelo, o fallback sai da categoria e das cores do material three.js', () => {
    const mat = new THREE.MeshStandardMaterial({ color: '#112233', roughness: 0.3 });
    const r = renderMaterialDaMalha(mat, 'wall');
    expect(r.tipo).toBe(1);
    expect(r.escala).toBe(1);
    expect(r.roughness).toBeCloseTo(0.3, 6);
    expect(r.ior).toBe(1.5);
  });

  it('materialDaOrigem: userData.material vence; senão o materialId do projeto; sem nenhum, indefinido', () => {
    const p = createEmptyProject();
    const extra = material({ id: 'mat_beirai_extra' });
    expect(materialDaOrigem({ material: extra, materialId: 'mat_madeira' }, p)).toBe(extra);
    expect(materialDaOrigem({ materialId: 'mat_madeira' }, p)).toBe(p.materials.mat_madeira);
    expect(materialDaOrigem({ kind: 'wall' }, p)).toBeUndefined();
    expect(materialDaOrigem({ materialId: 'mat_inexistente' }, p)).toBeUndefined();
  });

  it('elemento sem camada (malha sem material de modelo) cai na categoria: parede = reboco (1), escala 1.0', () => {
    const p = paredes(1);
    const { snap, cena } = exportar(p);
    try {
      // Malha sem `materialId`/`material` (fora dos lotes de camada), com categoria de parede.
      const sem = new THREE.Mesh(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]),
        new THREE.MeshStandardMaterial({ color: '#ffffff' }),
      );
      sem.userData = { kind: 'wall', ranges: [] };
      (cena as unknown as { model: THREE.Group }).model.add(sem);
      const depois = cena.exportarCenaDeRender({ aspect: 16 / 9 });
      expect(depois.materials.some((m) => m.tipo === 1 && m.escala === 1)).toBe(true);
      // A parede padrão já traz reboco pela camada (escala 2,0, ver DEFAULT_MATERIALS). O que antes não existia é reboco de
      // escala 1,0: é esse que o fallback por categoria acrescenta.
      expect(snap.materials.some((m) => m.tipo === 1 && m.escala === 1)).toBe(false);
    } finally {
      cena.dispose();
    }
  });
});

describe('exportação com o template de casa de alto padrão', () => {
  it('tem materiais de render com tipo 1 (reboco), 2 (madeira), 3 (telha) e 6 (vidro, com transmissão > 0)', () => {
    const { snap, cena } = exportar(buildTemplate('house-premium'));
    try {
      const porTipo = trianglosPorTipo(snap);
      for (const tipo of [1, 2, 3, 6]) expect(porTipo.get(tipo) ?? 0).toBeGreaterThan(0);
      const vidros = snap.materials.filter((m) => m.tipo === 6);
      expect(vidros.length).toBeGreaterThan(0);
      expect(vidros.every((m) => m.transmission > 0)).toBe(true);
    } finally {
      cena.dispose();
    }
  });

  it('paredes externas (mat_ceramica e mat_argamassa, rebocos) saem com tipo 1 e escala 4,0 m', () => {
    const { snap, cena } = exportar(buildTemplate('house-premium'));
    try {
      // Escala do reboco: 4 m (antes 2 m; ver defaults.ts).
      expect(snap.materials.some((m) => m.tipo === 1 && m.escala === 4)).toBe(true);
    } finally {
      cena.dispose();
    }
  });

  it('o portão da garagem (esquadria de porta, madeira mat_madeira) sai com tipo 2 e a cor da madeira', () => {
    const p = buildTemplate('house-premium');
    const portao = Object.values(p.elements).find((e) => 'hostId' in e && e.typeId === 'ot_portao450');
    expect(portao).toBeDefined();
    expect(p.openingTypes.ot_portao450?.frameMaterialId).toBe('mat_madeira');
    const { snap, cena } = exportar(p);
    try {
      const madeira = new THREE.Color(p.materials.mat_madeira!.color);
      const achou = snap.materials.some(
        (m) => m.tipo === 2 && Math.abs(m.baseColor[0] - madeira.r) < 1e-6 && Math.abs(m.baseColor[2] - madeira.b) < 1e-6,
      );
      expect(achou).toBe(true);
    } finally {
      cena.dispose();
    }
  });

  it('um material de camada com rugosidade personalizada (0.2) aparece com 0.2 no render', () => {
    const p = paredes(1);
    p.materials.mat_reboco = { ...p.materials.mat_reboco!, roughness: 0.2 };
    const { snap, cena } = exportar(p);
    try {
      expect(snap.materials.some((m) => m.roughness === 0.2)).toBe(true);
    } finally {
      cena.dispose();
    }
  });
});

describe('cache de materiais de render', () => {
  it('dois triângulos com o mesmo material não geram duas entradas: duas paredes iguais têm os mesmos materiais de uma', () => {
    const { snap: uma, cena: c1 } = exportar(paredes(1));
    const { snap: duas, cena: c2 } = exportar(paredes(2));
    try {
      expect(duas.materials.length).toBe(uma.materials.length);
    } finally {
      c1.dispose();
      c2.dispose();
    }
  });

  it('nenhuma entrada de material se repete (a chave é o conteúdo do material de render)', () => {
    const { snap, cena } = exportar(buildTemplate('house-premium'));
    try {
      const chaves = snap.materials.map((m) => JSON.stringify(m));
      expect(new Set(chaves).size).toBe(chaves.length);
    } finally {
      cena.dispose();
    }
  });
});

describe('mapasDoMaterial: texturas do preset como índices da lista única', () => {
  it('material sem preset (e preset "nenhum") não usa textura: {}', () => {
    const lista = new ListaDeTexturas();
    expect(mapasDoMaterial(material(), lista)).toEqual({});
    expect(mapasDoMaterial(material({ texture: { preset: 'nenhum' } }), lista)).toEqual({});
    expect(lista.texturas).toEqual([]);
  });

  it('preset tijolo: albedo, normal e rugosidade (sem metálico), com os arquivos da biblioteca', () => {
    const lista = new ListaDeTexturas();
    const mapas = mapasDoMaterial(material({ texture: { preset: 'tijolo' } }), lista);
    expect(Object.keys(mapas).sort()).toEqual(['albedo', 'normal', 'roughness']);
    expect(mapas).toEqual({ albedo: 0, normal: 1, roughness: 2 });
    expect(lista.texturas.map((t) => t.caminho)).toEqual([
      'tijolo_vermelho_albedo.jpg',
      'tijolo_vermelho_normal.jpg',
      'tijolo_vermelho_roughness.jpg',
    ]);
  });

  it('preset metal inclui o metálico', () => {
    const lista = new ListaDeTexturas();
    const mapas = mapasDoMaterial(material({ texture: { preset: 'metal' } }), lista);
    expect(Object.keys(mapas).sort()).toEqual(['albedo', 'metallic', 'normal', 'roughness']);
    expect(lista.texturas.map((t) => t.caminho)).toContain('metal_chapa_metalness.jpg');
  });

  it('dois materiais com o mesmo preset compartilham os mesmos índices (sem duplicar o arquivo)', () => {
    const lista = new ListaDeTexturas();
    const a = mapasDoMaterial(material({ id: 'a', texture: { preset: 'reboco' } }), lista);
    const b = mapasDoMaterial(material({ id: 'b', texture: { preset: 'reboco' } }), lista);
    expect(b).toEqual(a);
    expect(lista.texturas).toHaveLength(3);
    expect(new Set(lista.texturas.map((t) => t.caminho)).size).toBe(lista.texturas.length);
  });

  it('a entrada da lista nasce pendente: sem pixels, com o caminho', () => {
    const lista = new ListaDeTexturas();
    mapasDoMaterial(material({ texture: { preset: 'madeira' } }), lista);
    expect(lista.texturas[0]).toEqual({ caminho: 'madeira_tabua_albedo.jpg', largura: 0, altura: 0, mips: [] });
  });
});

describe('exportação: mapas de textura por material de camada', () => {
  it('o template de alto padrão: reboco, madeira, telha, piso, concreto e metal têm mapas; o vidro não tem', () => {
    const { snap, cena } = exportar(buildTemplate('house-premium'));
    try {
      const texturas = snap.texturas ?? [];
      const caminhos = texturas.map((t) => t.caminho);
      // Cada arquivo aparece uma vez na lista.
      expect(new Set(caminhos).size).toBe(caminhos.length);
      // Pelo menos um material de cada preset do template aponta para o albedo do arquivo certo.
      const albedoDe = (base: string) => snap.materials.some((m) => m.mapas?.albedo !== undefined && caminhos[m.mapas.albedo] === `${base}_albedo.jpg`);
      for (const base of ['reboco_estuque', 'madeira_tabua', 'telha_argila', 'piso_ceramico', 'concreto_parede']) {
        expect(albedoDe(base), base).toBe(true);
      }
      // Reboco: albedo, normal e rugosidade; todo material com preset tem os três.
      const comMapas = snap.materials.filter((m) => m.mapas !== undefined);
      expect(comMapas.length).toBeGreaterThan(0);
      expect(comMapas.every((m) => m.mapas!.albedo !== undefined && m.mapas!.normal !== undefined && m.mapas!.roughness !== undefined)).toBe(true);
      // Vidro e chão neutro: sem textura.
      const vidros = snap.materials.filter((m) => m.tipo === 6);
      expect(vidros.length).toBeGreaterThan(0);
      expect(vidros.every((m) => m.mapas === undefined)).toBe(true);
      expect(snap.materials[snap.materials.length - 1]!.mapas).toBeUndefined();
    } finally {
      cena.dispose();
    }
  });

  it('paredes padrão têm preset (reboco e tijolo): o snapshot traz texturas, com mapas só nos materiais com preset', () => {
    const { snap, cena } = exportar(paredes(2));
    try {
      // Antes, as paredes padrão não tinham preset e o snapshot não tinha texturas nem mapas. Agora o catálogo dá reboco
      // (escala 2,0) e tijolo (escala 0,5) ao bloco: a lista única tem albedo, normal e rugosidade de cada um (6 arquivos).
      expect(snap.texturas?.map((t) => t.caminho).sort()).toEqual([
        'reboco_estuque_albedo.jpg',
        'reboco_estuque_normal.jpg',
        'reboco_estuque_roughness.jpg',
        'tijolo_vermelho_albedo.jpg',
        'tijolo_vermelho_normal.jpg',
        'tijolo_vermelho_roughness.jpg',
      ]);
      // Tinta e chão não têm preset: sem `mapas`. Reboco e bloco têm.
      expect(snap.materials.filter((m) => 'mapas' in m).length).toBe(2);
      expect(snap.materials.filter((m) => !('mapas' in m)).every((m) => m.tipo === 0)).toBe(true);
    } finally {
      cena.dispose();
    }
  });
});
