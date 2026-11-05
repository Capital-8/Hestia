import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { codigosPorVertice, criarMaterialDoRealce, geometriaDoRealce, LARGURA_DA_MASCARA, MascaraDoRealce, SEM_ELEMENTO, TabelaDeCodigos, VIES_DE_PROFUNDIDADE } from './realceGpu3d.ts';
import { BITS_PROFUNDIDADE } from './precisao3d.ts';
import { RealcesDaCena } from './realceDaCena3d.ts';

function malhaDeDois(): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0, 9, 9, 9], 3));
  geo.setIndex([0, 1, 2, 3, 4, 5]);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.userData.ranges = [{ id: 'a', start: 0, count: 3 }, { id: 'b', start: 3, count: 3 }];
  return mesh;
}

describe('máscara do realce (GPU)', () => {
  it('tabela: código estável por id, na ordem de registro', () => {
    const t = new TabelaDeCodigos();
    expect([t.codigo('x'), t.codigo('y'), t.codigo('x')]).toEqual([0, 1, 0]);
    expect(t.tamanho).toBe(2);
    expect(t.codigoDe('z')).toBeUndefined();
  });

  it('código por vértice: vértices das faixas levam o código do id; o resto, SEM_ELEMENTO', () => {
    const c = codigosPorVertice([0, 1, 2, 3, 4, 5], 7, [{ id: 'a', start: 0, count: 3 }, { id: 'b', start: 3, count: 3 }], (id) => (id === 'a' ? 0 : 1));
    expect([...c]).toEqual([0, 0, 0, 1, 1, 1, SEM_ELEMENTO]);
  });

  it('definir troca o conjunto inteiro, apagando só o que estava marcado', () => {
    const m = new MascaraDoRealce();
    m.definir([1, 5, 9]);
    expect([m.estaMarcado(1), m.estaMarcado(5), m.estaMarcado(2)]).toEqual([true, true, false]);
    m.definir([2]);
    expect([m.estaMarcado(1), m.estaMarcado(5), m.estaMarcado(2)]).toEqual([false, false, true]);
    expect(m.quantidade).toBe(1);
    m.definir([-1, 10_000_000]);
    expect(m.quantidade).toBe(0);
  });

  it('garantir cresce em linhas inteiras e preserva as marcas', () => {
    const m = new MascaraDoRealce();
    const antes = m.dados.length;
    expect(m.garantir(antes)).toBe(false);
    m.definir([3]);
    expect(m.garantir(antes + 1)).toBe(true);
    expect(m.dados.length % LARGURA_DA_MASCARA).toBe(0);
    expect(m.dados.length).toBeGreaterThan(antes);
    expect(m.estaMarcado(3)).toBe(true);
  });

  it('marcar todos os ~2000 elementos é só escrever bytes (sem objetos por elemento)', () => {
    const m = new MascaraDoRealce();
    m.garantir(5000);
    const codigos = Array.from({ length: 2000 }, (_, i) => i);
    const t0 = performance.now();
    for (let k = 0; k < 100; k++) m.definir(codigos);
    expect((performance.now() - t0) / 100).toBeLessThan(5);
    expect(m.quantidade).toBe(2000);
  });
});

describe('sobreposição de GPU', () => {
  it('a geometria reusa position e index da malha e acrescenta aElem; fica em cache por versão', () => {
    const mesh = malhaDeDois();
    const tabela = new TabelaDeCodigos();
    const g = geometriaDoRealce(mesh, tabela)!;
    expect(g.getAttribute('position')).toBe(mesh.geometry.getAttribute('position'));
    expect(g.index).toBe(mesh.geometry.index);
    expect([...g.getAttribute('aElem').array]).toEqual([0, 0, 0, 1, 1, 1, SEM_ELEMENTO]);
    expect(geometriaDoRealce(mesh, tabela)).toBe(g);
    mesh.geometry.userData.versao = 2;
    expect(geometriaDoRealce(mesh, tabela)).not.toBe(g);
  });

  it('RealcesDaCena: seleção grande não monta arestas; a máscara marca só os ids pedidos e a camada leva uma sobreposição por malha', () => {
    const raiz = new THREE.Group();
    raiz.add(malhaDeDois());
    const r = new RealcesDaCena(raiz);
    raiz.add(r.camada);
    r.definir('sel', ['a'], { color: 0xff0000, fill: 0.35, edges: 1 });
    // Poucos elementos: sobreposição de GPU + arestas.
    expect(r.sobreposicoesNoAr('sel')).toHaveLength(1);
    expect(r.camada.children.length).toBe(2);
    const muitos = Array.from({ length: 100 }, (_, i) => `x${i}`).concat(['a', 'b']);
    r.definir('sel', muitos, { color: 0xff0000, fill: 0.35, edges: 1 });
    expect(r.sobreposicoesNoAr('sel')).toHaveLength(1);
    expect(r.camada.children.length).toBe(1);
    r.definir('sel', [], { color: 0xff0000, fill: 0.35, edges: 1 });
    expect(r.camada.children.length).toBe(0);
  });
});

describe('viés de profundidade da sobreposição (seleção sem z-fighting)', () => {
  it('o vertex shader adianta a profundidade da sobreposição no espaço de clip, proporcional a w', () => {
    const vs = criarMaterialDoRealce().vertexShader;
    expect(vs).toContain(`gl_Position.z -= gl_Position.w * ${VIES_DE_PROFUNDIDADE.toExponential()};`);
    // O viés vem DEPOIS do cálculo da posição final (senão seria sobrescrito) e fora do ramo que descarta o vértice.
    expect(vs.indexOf('gl_Position = projectionMatrix')).toBeLessThan(vs.indexOf('gl_Position.z -='));
  });

  it('vale ~5 passos de um buffer de 24 bits: acima do ruído de 1-2 passos entre shaders, abaixo do que faria camada de baixo vazar', () => {
    // NDC vai de −1 a 1 (2 unidades) e o buffer guarda [0,1]: um passo de profundidade vale 2/(2^bits − 1) em NDC.
    const passos = VIES_DE_PROFUNDIDADE / (2 / (2 ** BITS_PROFUNDIDADE - 1));
    expect(passos).toBeGreaterThanOrEqual(3);
    expect(passos).toBeLessThanOrEqual(8);
  });

  it('o viés não depende de a posição ser perto ou longe: o termo é sempre w · constante (mesmo sinal em qualquer vértice)', () => {
    expect(VIES_DE_PROFUNDIDADE).toBeGreaterThan(0);
  });
});
