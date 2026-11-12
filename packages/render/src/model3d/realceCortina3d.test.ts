import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, type MalhaCortinaProjeto } from '@hestia/engine';
import { projetoComCortina } from '@hestia/engine/src/fixtureCortina.ts';
import { avulsosDaCortina, lotesDaCortina } from './cortina3d.ts';
import { RealceDaCortina, type DesenhoDeCortina, type GrupoDeRealceCortina } from './realceCortina3d.ts';
import { ModelScene } from './scene3d.ts';

// Kernel simulado: a cena monta a cortina com a malha que o teste entrega (sem o wasm).
const kernel = vi.hoisted(() => ({ malha: null as MalhaCortinaProjeto | null }));
vi.mock('@hestia/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@hestia/engine')>();
  return {
    ...real,
    servicoCortina: () => ({
      pronto: () => true,
      malha: () => kernel.malha,
      grade: () => null,
      aoMudarPronto: () => () => {},
      verificarPronto: () => {},
    }),
  };
});

const ESTILO = { color: 0x00aaff, fill: 0.35, edges: 1 };

/** Caixa unitária com 24 vértices (4 por face), como o Rust entrega. */
function caixa(): { vertices: Float32Array; indices: Uint32Array } {
  const faces: number[][][] = [
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  ];
  const v: number[] = [];
  const i: number[] = [];
  faces.forEach((f, k) => {
    for (const p of f) v.push(...p);
    i.push(4 * k, 4 * k + 1, 4 * k + 2, 4 * k, 4 * k + 2, 4 * k + 3);
  });
  return { vertices: Float32Array.from(v), indices: Uint32Array.from(i) };
}

/** Matriz 3 x 4 linha-maior: escala (sx, sy, sz) e translação (tx, ty, tz). */
const m12 = (sx: number, sy: number, sz: number, tx: number, ty: number, tz: number): number[] => [sx, 0, 0, tx, 0, sy, 0, ty, 0, 0, sz, tz];

/** Duas cortinas (`a` e `b`): `a` tem dois montantes e um vidro; `b` (em y = 10) tem um montante. */
function malhaDeDuasCortinas(): MalhaCortinaProjeto {
  const c = caixa();
  return {
    protos: new Map([
      [1, { proto: 1, papel: 0, tipoId: null, ...c }],
      [2, { proto: 2, papel: 1, tipoId: null, ...c }],
    ]),
    instancias: [
      { wallId: 'a', proto: 1, papel: 0, materialId: 'mat_aluminio', transparente: false, matrizes: Float32Array.from([...m12(0.05, 0.1, 3, 0, 0, 0), ...m12(0.05, 0.1, 3, 2, 0, 0)]), n: 2 },
      { wallId: 'a', proto: 2, papel: 1, materialId: 'mat_vidro', transparente: true, matrizes: Float32Array.from(m12(1, 0.01, 3, 0.5, 0, 0)), n: 1 },
      { wallId: 'b', proto: 1, papel: 0, materialId: 'mat_aluminio', transparente: false, matrizes: Float32Array.from(m12(0.05, 0.1, 3, 0, 10, 0)), n: 1 },
    ],
    grupos: [],
  };
}

/** Desenhos da cena para a malha: um `InstancedMesh` por lote e um `Mesh` por peça avulsa (como `montarGrupoCortina`). */
function desenhosDa(m: MalhaCortinaProjeto): DesenhoDeCortina[] {
  const out: DesenhoDeCortina[] = [];
  for (const lote of lotesDaCortina(m)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(lote.vertices, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(lote.normais, 3));
    geo.setIndex(new THREE.BufferAttribute(lote.indices, 1));
    const malha = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), lote.n);
    malha.instanceMatrix.array.set(lote.matrizes);
    out.push({ malha, lote });
  }
  for (const avulso of avulsosDaCortina(m)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(avulso.vertices, 3));
    geo.setIndex(new THREE.BufferAttribute(avulso.indices, 1));
    out.push({ malha: new THREE.Mesh(geo, new THREE.MeshBasicMaterial()), avulso });
  }
  return out;
}

function grupoDe(m: MalhaCortinaProjeto): GrupoDeRealceCortina {
  return { desenhos: desenhosDa(m), anguloRad: (28 * Math.PI) / 180 };
}

/** Quantos pontos (de 3 em 3 floats) a linha tem. */
const pontos = (l: THREE.LineSegments | null): number => (l ? l.geometry.getAttribute('position').count : 0);

describe('realce da cortina: instâncias e arestas, nunca a caixa', () => {
  it('preenchimento: uma sobreposição de instância por lote que tem a cortina, sem caixa nem malha nova por peça', () => {
    const r = new RealceDaCortina();
    const grupo = grupoDe(malhaDeDuasCortinas());
    r.trocarGrupos([grupo]);
    r.definir('sel', ['a'], ESTILO);
    const sobre = r.sobreposicoesNoAr('sel');
    // Lote dos montantes (tem `a` e `b`) e lote do vidro (só `a`): duas sobreposições, ambas de instância.
    expect(sobre).toHaveLength(2);
    expect(sobre.every((o) => o instanceof THREE.InstancedMesh)).toBe(true);
    // A sobreposição usa a matriz de instância da malha de origem (o mesmo buffer, nada copiado).
    const origens = grupo.desenhos.map((d) => d.malha.instanceMatrix);
    expect(sobre.map((o) => (o as THREE.InstancedMesh).instanceMatrix).every((m) => origens.includes(m))).toBe(true);
    // Nenhum objeto de caixa (BoxHelper/Box3Helper) entra na camada.
    r.camada.traverse((o) => expect(o.type).not.toMatch(/Box/));
  });

  it('arestas: as da cortina selecionada, levadas pela matriz de cada instância (36 segmentos para `a`), sem as de `b`', () => {
    const r = new RealceDaCortina();
    r.trocarGrupos([grupoDe(malhaDeDuasCortinas())]);
    r.definir('sel', ['a'], ESTILO);
    const linhas = r.arestasNoAr('sel');
    // 12 arestas por caixa e 3 instâncias de `a` (2 montantes e 1 vidro): 36 segmentos = 72 pontos.
    expect(pontos(linhas)).toBe(72);
    const pos = linhas!.geometry.getAttribute('position').array as Float32Array;
    // Todos os pontos ficam no bloco de `a` (x de 0 a 2,05; y de 0 a 0,1; e o vidro em y de 0 a 0,01).
    for (let i = 0; i < pos.length; i += 3) {
      expect(pos[i]).toBeGreaterThanOrEqual(-1e-6);
      expect(pos[i]).toBeLessThanOrEqual(2.05 + 1e-6);
      expect(pos[i + 1]).toBeLessThanOrEqual(0.1 + 1e-6);
    }
    // O canto (1, 1, 1) do protótipo na instância de x = 2 vai a (2,05; 0,1; 3).
    const achou = Array.from({ length: pos.length / 3 }, (_, k) => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]]).some(
      ([x, y, z]) => Math.abs(x! - 2.05) < 1e-5 && Math.abs(y! - 0.1) < 1e-5 && Math.abs(z! - 3) < 1e-5,
    );
    expect(achou).toBe(true);
  });

  it('o cursor (hov) é independente da seleção e só realça a própria cortina', () => {
    const r = new RealceDaCortina();
    r.trocarGrupos([grupoDe(malhaDeDuasCortinas())]);
    r.definir('sel', ['a'], ESTILO);
    r.definir('hov', ['b'], { color: 0x00aaff, fill: 0.15, edges: 0.6 });
    // `b` tem um montante: 12 segmentos = 24 pontos, em y = 10.
    expect(pontos(r.arestasNoAr('hov'))).toBe(24);
    expect(r.sobreposicoesNoAr('hov')).toHaveLength(1);
    const pos = r.arestasNoAr('hov')!.geometry.getAttribute('position').array as Float32Array;
    for (let i = 1; i < pos.length; i += 3) expect(pos[i]).toBeGreaterThan(9.9);
    expect(pontos(r.arestasNoAr('sel'))).toBe(72);
  });

  it('peça avulsa da cortina entra no realce como malha própria, com as arestas dela', () => {
    const m = malhaDeDuasCortinas();
    m.grupos = [{ wallId: 'a', papel: 0, materialId: 'mat_aluminio', transparente: false, vertices: caixa().vertices.map((v, k) => (k % 3 === 0 ? v + 5 : v)), indices: caixa().indices }];
    const r = new RealceDaCortina();
    r.trocarGrupos([grupoDe(m)]);
    r.definir('sel', ['a'], ESTILO);
    const sobre = r.sobreposicoesNoAr('sel');
    expect(sobre.some((o) => o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh))).toBe(true);
    // 72 pontos das instâncias + 24 da peça avulsa (12 arestas).
    expect(pontos(r.arestasNoAr('sel'))).toBe(96);
  });

  it('tirar a seleção esvazia a camada; trocar os grupos (modelo refeito) também', () => {
    const r = new RealceDaCortina();
    const grupo = grupoDe(malhaDeDuasCortinas());
    r.trocarGrupos([grupo]);
    r.definir('sel', ['a'], ESTILO);
    r.definir('sel', [], ESTILO);
    expect(r.sobreposicoesNoAr('sel')).toHaveLength(0);
    expect(r.arestasNoAr('sel')).toBeNull();
    expect(r.camada.children).toHaveLength(0);
    r.definir('sel', ['a'], ESTILO);
    r.trocarGrupos([grupoDe(malhaDeDuasCortinas())]);
    expect(r.camada.children).toHaveLength(0);
    expect(r.sobreposicoesNoAr('sel')).toHaveLength(0);
  });

  it('mudar a seleção reaproveita as sobreposições já montadas (sem alocar por clique)', () => {
    const r = new RealceDaCortina();
    r.trocarGrupos([grupoDe(malhaDeDuasCortinas())]);
    r.definir('sel', ['a'], ESTILO);
    const antes = r.sobreposicoesNoAr('sel');
    r.definir('sel', ['a', 'b'], ESTILO);
    const depois = r.sobreposicoesNoAr('sel');
    // O lote dos montantes já tem `a` e `b`; o do vidro só `a`: as mesmas duas sobreposições.
    expect(depois).toHaveLength(2);
    for (const o of antes) expect(depois).toContain(o);
  });

  it('cor e opacidade das arestas seguem o estilo', () => {
    const r = new RealceDaCortina();
    r.trocarGrupos([grupoDe(malhaDeDuasCortinas())]);
    r.definir('sel', ['a'], { color: 0xff0000, fill: 0.35, edges: 0.5 });
    const mat = r.arestasNoAr('sel')!.material as THREE.LineBasicMaterial;
    expect(mat.color.getHex()).toBe(0xff0000);
    expect(mat.opacity).toBe(0.5);
  });
});

describe('cena 3D: a seleção de uma cortina não desenha a caixa de picking', () => {
  it('o realce é das instâncias; a caixa de picking existe só para o raio, e nenhum objeto de caixa entra no realce', () => {
    // A cortina do projeto de teste é `ct1`: a malha simulada põe as instâncias de `a` nela.
    const m = malhaDeDuasCortinas();
    kernel.malha = { ...m, instancias: m.instancias.map((i) => ({ ...i, wallId: i.wallId === 'a' ? 'ct1' : i.wallId })) };
    const p = projetoComCortina();
    const ms = new ModelScene();
    ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false });

    // A caixa de picking da cortina (malha só de raio): é a única com `semRealce`.
    const caixas: THREE.Object3D[] = [];
    ms.scene.traverse((o) => {
      if (o.userData.semRealce === true) caixas.push(o);
    });
    expect(caixas.length).toBeGreaterThan(0);
    const posicaoDaCaixa = (caixas[0] as THREE.Mesh).geometry.getAttribute('position');

    ms.highlight(['ct1'], null);
    const comRealce: THREE.Object3D[] = [];
    const comPosicaoDaCaixa: THREE.Object3D[] = [];
    let semBoxHelper = true;
    ms.scene.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g?.getAttribute('aElem')) comRealce.push(o);
      if (g?.getAttribute('position') === posicaoDaCaixa) comPosicaoDaCaixa.push(o);
      if (/Box/.test(o.type)) semBoxHelper = false;
    });
    // Realce: as instâncias da cortina (preenchimento), sem nenhum objeto que use a geometria da caixa de picking.
    expect(comRealce.length).toBeGreaterThan(0);
    expect(comPosicaoDaCaixa).toEqual(caixas);
    expect(semBoxHelper).toBe(true);

    // Sem seleção, o realce some por completo.
    ms.highlight([], null);
    let restos = 0;
    ms.scene.traverse((o) => {
      if ((o as THREE.Mesh).geometry?.getAttribute('aElem')) restos += 1;
    });
    expect(restos).toBe(0);
  });
});
