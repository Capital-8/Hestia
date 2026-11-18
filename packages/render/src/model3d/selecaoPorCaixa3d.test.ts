import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Id } from '@hestia/model';
import type { ElementRange } from './solids.ts';
import { caixasPorElemento, idsNaCaixaDaTela, indicesNaCaixaDaTela, type RetanguloNdc } from './selecaoPorCaixa3d.ts';

/** Câmera em perspectiva olhando para a origem de z = 10 (a frente é z < 10). */
function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  c.position.set(0, 0, 10);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
}

/** Malha de um cubo de 1 m com as faixas dadas (o cubo tem 36 índices; uma faixa cobre o elemento inteiro). */
function cubo(x: number, y: number, z: number, id: Id, extra: Partial<THREE.Mesh> & { userData?: Record<string, unknown> } = {}): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const ranges: ElementRange[] = [{ id, start: 0, count: geo.index!.count }];
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  mesh.userData = { kind: 'wall', ranges, ...(extra.userData ?? {}) };
  if (extra.visible !== undefined) mesh.visible = extra.visible;
  return mesh;
}

const TUDO: RetanguloNdc = { x0: -1, y0: -1, x1: 1, y1: 1 };
/** Retângulo que só toca a borda direita do cubo central (≈ ±0,11 em NDC): cruza, mas não contém. */
const BORDA_DIREITA: RetanguloNdc = { x0: 0.05, y0: -0.5, x1: 0.5, y1: 0.5 };

function cena(...filhos: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...filhos);
  return g;
}

describe('idsNaCaixaDaTela', () => {
  it('janela: o elemento inteiro dentro do retângulo entra', () => {
    const s = cena(cubo(0, 0, 0, 'central' as Id));
    expect(idsNaCaixaDaTela(s, camera(), TUDO, 'janela')).toEqual(['central']);
  });

  it('cruzamento: o elemento que toca o retângulo entra, mesmo sem estar inteiro dentro', () => {
    const s = cena(cubo(0, 0, 0, 'central' as Id));
    expect(idsNaCaixaDaTela(s, camera(), BORDA_DIREITA, 'cruzamento')).toEqual(['central']);
  });

  it('janela: o elemento que só toca o retângulo fica de fora', () => {
    const s = cena(cubo(0, 0, 0, 'central' as Id));
    expect(idsNaCaixaDaTela(s, camera(), BORDA_DIREITA, 'janela')).toEqual([]);
  });

  it('elemento fora do retângulo não entra em nenhum modo', () => {
    const s = cena(cubo(0, 0, 0, 'central' as Id));
    const canto: RetanguloNdc = { x0: 0.8, y0: 0.8, x1: 1, y1: 1 };
    expect(idsNaCaixaDaTela(s, camera(), canto, 'cruzamento')).toEqual([]);
    expect(idsNaCaixaDaTela(s, camera(), canto, 'janela')).toEqual([]);
  });

  it('elemento totalmente atrás da câmera é ignorado, mesmo com o retângulo inteiro', () => {
    const s = cena(cubo(0, 0, 20, 'atras' as Id));
    expect(idsNaCaixaDaTela(s, camera(), TUDO, 'cruzamento')).toEqual([]);
    expect(idsNaCaixaDaTela(s, camera(), TUDO, 'janela')).toEqual([]);
  });

  it('elemento que cruza o plano da câmera entra no cruzamento e fica de fora da janela', () => {
    const s = cena(cubo(0, 0, 10.2, 'perto' as Id));
    expect(idsNaCaixaDaTela(s, camera(), TUDO, 'cruzamento')).toEqual(['perto']);
    expect(idsNaCaixaDaTela(s, camera(), TUDO, 'janela')).toEqual([]);
  });

  it('elemento com a visibilidade desligada (malha ou ancestral) não entra', () => {
    const malhaInvisivel = cubo(0, 0, 0, 'oculta' as Id, { visible: false });
    const grupoInvisivel = new THREE.Group();
    grupoInvisivel.visible = false;
    grupoInvisivel.add(cubo(0, 0, 0, 'emGrupoOculto' as Id));
    const s = cena(malhaInvisivel, grupoInvisivel);
    expect(idsNaCaixaDaTela(s, camera(), TUDO, 'cruzamento')).toEqual([]);
  });

  it('malha de picking das caixas (invisível de propósito) entra quando o grupo do nível está visível', () => {
    const picking = cubo(0, 0, 0, 'caixa' as Id, { visible: false, userData: { caixasPick: true } });
    const grupoDoNivel = new THREE.Group();
    grupoDoNivel.add(picking);
    expect(idsNaCaixaDaTela(cena(grupoDoNivel), camera(), TUDO, 'janela')).toEqual(['caixa']);

    const grupoOculto = new THREE.Group();
    grupoOculto.visible = false;
    grupoOculto.add(cubo(0, 0, 0, 'caixa2' as Id, { visible: false, userData: { caixasPick: true } }));
    expect(idsNaCaixaDaTela(cena(grupoOculto), camera(), TUDO, 'janela')).toEqual([]);
  });

  it('malhas sem userData.ranges são ignoradas', () => {
    const semFaixas = cubo(0, 0, 0, 'x' as Id);
    semFaixas.userData = { kind: 'floor' };
    expect(idsNaCaixaDaTela(cena(semFaixas), camera(), TUDO, 'cruzamento')).toEqual([]);
  });

  it('o elemento com faixas em duas malhas usa a caixa da união das duas', () => {
    // Parte do elemento no centro (dentro do retângulo) e parte bem à direita, fora da tela: a união não cabe na janela.
    const s = cena(cubo(0, 0, 0, 'partido' as Id), cubo(60, 0, 0, 'partido' as Id));
    expect(idsNaCaixaDaTela(s, camera(), { x0: -0.5, y0: -0.5, x1: 0.5, y1: 0.5 }, 'janela')).toEqual([]);
    expect(idsNaCaixaDaTela(s, camera(), TUDO, 'cruzamento')).toEqual(['partido']);
  });

  it('um elemento aparece uma vez mesmo com várias faixas', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const n = geo.index!.count / 2;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.userData = {
      kind: 'wall',
      ranges: [
        { id: 'a' as Id, start: 0, count: n },
        { id: 'a' as Id, start: n, count: n },
        { id: 'b' as Id, start: 0, count: 0 },
      ],
    };
    expect(idsNaCaixaDaTela(cena(mesh), camera(), TUDO, 'janela')).toEqual(['a']);
  });

  it('não altera a cena nem a câmera', () => {
    const malha = cubo(0, 0, 0, 'central' as Id);
    const s = cena(malha);
    const c = camera();
    const antes = c.matrixWorldInverse.clone();
    idsNaCaixaDaTela(s, c, TUDO, 'janela');
    expect(c.matrixWorldInverse.elements).toEqual(antes.elements);
    expect(malha.position.toArray()).toEqual([0, 0, 0]);
  });
});

describe('caixa vetorizada (arrays tipados)', () => {
  it('caixasPorElemento: união dos vértices de todas as faixas do id; id sem vértices fica vazio', () => {
    const pos = [0, 0, 0, 1, 2, 3, -1, 5, 0, 7, 7, 7];
    const r = caixasPorElemento([{ id: 'a', start: 0, count: 3 }, { id: 'b', start: 3, count: 0 }, { id: 'a', start: 3, count: 0 }], [0, 1, 2, 3], pos);
    expect(r.ids).toEqual(['a', 'b']);
    expect([...r.caixas.slice(0, 6)]).toEqual([-1, 0, 0, 1, 5, 3]);
    expect(r.caixas[6]).toBe(Infinity);
  });

  it('indicesNaCaixaDaTela: janela x cruzamento com projeção ortográfica identidade', () => {
    const pv = new THREE.Matrix4().elements;
    const mundo = [-0.5, -0.5, 0, 0.5, 0.5, 0, 1.5, 1.5, 0, 2, 2, 0, 3, 3, 0, 4, 4, 0];
    const r = { x0: -1, y0: -1, x1: 1, y1: 1 };
    expect(indicesNaCaixaDaTela(mundo, 3, pv, r, 'janela')).toEqual([0]);
    expect(indicesNaCaixaDaTela(mundo, 3, pv, r, 'cruzamento')).toEqual([0]);
    expect(indicesNaCaixaDaTela(mundo, 3, pv, { x0: -1, y0: -1, x1: 1.7, y1: 1.7 }, 'cruzamento')).toEqual([0, 1]);
    expect(indicesNaCaixaDaTela(mundo, 3, pv, { x0: -1, y0: -1, x1: 1.7, y1: 1.7 }, 'janela')).toEqual([0]);
  });

  it('projetar 2000 caixas leva poucos ms', () => {
    const n = 2000;
    const mundo = new Float64Array(6 * n);
    for (let i = 0; i < n; i++) mundo.set([i % 50, Math.floor(i / 50), 0, (i % 50) + 1, Math.floor(i / 50) + 1, 2], 6 * i);
    const pv = new THREE.Matrix4().makeScale(0.01, 0.01, 0.01).elements;
    const t0 = performance.now();
    const dentro = indicesNaCaixaDaTela(mundo, n, pv, { x0: -1, y0: -1, x1: 1, y1: 1 }, 'janela');
    expect(performance.now() - t0).toBeLessThan(50);
    expect(dentro).toHaveLength(n);
  });
});
