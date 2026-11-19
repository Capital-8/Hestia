import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { view3dOf, type CategoryOverride, type Id, type Project, type VisualStyle } from '@hestia/model';
import { ModelScene } from './scene3d.ts';
import { clearWallLayerCache, wallLayerCacheStats } from './solids.ts';
import { firstSurfaceDistance, pickElement, pickModelPoint } from './pick3d.ts';
import { caixaPorCategoria, comprimentoDescoberto, cruzamentos, sorteio, verticesSemPar, volumePorCategoria } from './metricasInstanciada3d.ts';
import { chamadasDeDesenho, contarObjetos, montar, predio, segmentos, triangulos } from './fixturesInstanciada3d.ts';
import { contarFaixas } from './faixas3d.ts';

/**
 * Cena com caixas instanciadas (paredes retas e esquadrias) contra a cena de geometria (`instanciar: false`): mesma silhueta,
 * mesmo picking, menos chamadas de desenho. A de geometria é a referência e o caminho de reserva.
 */

const TOL = 1e-4;

/** Câmera em perspectiva olhando o prédio de `n` pavimentos de um canto. */
function camera(n: number): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(35, 1.5, 0.1, 500);
  c.up.set(0, 0, 1);
  c.position.set(16, -18, n * 3 * 0.7 + 4);
  c.lookAt(2, 1.5, (n * 3) / 2);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
}

const CASOS: Array<[number, boolean]> = [
  [10, false],
  [10, true],
  [20, false],
  [20, true],
];

describe('silhueta: a cena com caixas é a mesma da geometria', () => {
  for (const [n, aberturas] of CASOS) {
    it(`${n} pavimentos ${aberturas ? 'com' : 'sem'} aberturas: caixa, volume e vértices por categoria`, { timeout: 180000 }, () => {
      const p = predio(n, { aberturas });
      const ref = triangulos(montar(p, false));
      const nova = triangulos(montar(p, true));
      const bRef = caixaPorCategoria(ref);
      const bNova = caixaPorCategoria(nova);
      expect([...bNova.keys()].sort()).toEqual([...bRef.keys()].sort());
      for (const [k, b] of bRef) b.forEach((x, i) => expect(Math.abs(x - bNova.get(k)![i]!)).toBeLessThan(TOL));
      const vRef = volumePorCategoria(ref);
      const vNova = volumePorCategoria(nova);
      for (const [k, v] of vRef) expect(Math.abs(v - vNova.get(k)!) / v).toBeLessThan(1e-5);
      // Todo vértice da geometria existe na cena com caixas (a cena nova só acrescenta vértices das juntas internas das peças).
      expect(verticesSemPar(ref, nova, TOL)).toHaveLength(0);
      if (!aberturas) {
        // Sem aberturas as paredes inteiras são caixas, e a cena é exatamente a mesma, vértice a vértice.
        expect(verticesSemPar(nova, ref, TOL)).toHaveLength(0);
        expect(nova.length).toBe(ref.length);
      }
    });
  }

  it('paridade de ocupação: pontos sorteados dentro e fora dos sólidos dão o mesmo nas duas cenas (com parede girada e curva)', { timeout: 120000 }, () => {
    const p = predio(2, { aberturas: true, girada: true, curva: true });
    const ref = triangulos(montar(p, false));
    const nova = triangulos(montar(p, true));
    const r = sorteio(11);
    let dentro = 0;
    for (let i = 0; i < 2500; i++) {
      const pt: [number, number, number] = [-0.5 + r() * 10, -0.5 + r() * 7, r() * 6];
      const a = cruzamentos(ref, pt) % 2;
      expect(cruzamentos(nova, pt) % 2).toBe(a);
      dentro += a;
    }
    expect(dentro).toBeGreaterThan(20);
  });

  it('arestas: toda aresta da geometria está na cena com caixas, e as extras são só as juntas de 2 mm da tinta do batente', { timeout: 120000 }, () => {
    for (const [n, aberturas] of [[10, false], [10, true], [20, true]] as Array<[number, boolean]>) {
      const p = predio(n, { aberturas });
      const sRef = segmentos(montar(p, false));
      const sNova = segmentos(montar(p, true));
      const total = sRef.reduce((s, x) => s + Math.hypot(x[3]! - x[0]!, x[4]! - x[1]!, x[5]! - x[2]!), 0);
      expect(comprimentoDescoberto(sRef, sNova, TOL)).toBeLessThan(1e-6);
      expect(comprimentoDescoberto(sNova, sRef, TOL) / total).toBeLessThan(0.01);
    }
  });

  it('arestas do batente em L: sem linhas (estilo realista) nenhuma via as desenha; em linha oculta as duas desenham as mesmas', { timeout: 120000 }, () => {
    const p = predio(2, { aberturas: true });
    const comprimento = (ss: number[][]): number => ss.reduce((t, x) => t + Math.hypot(x[3]! - x[0]!, x[4]! - x[1]!, x[5]! - x[2]!), 0);
    // Realista: degraus do perfil em L (x = 0,65 m, y = 0,048 m na porta) não aparecem em nenhuma das duas vias.
    const nRealista = segmentos(montar(p, true));
    const degraus = nRealista.filter((s) => [0, 3].every((o) => Math.abs(s[o + 1]! - 0.048) < 1e-4 && s[o]! > 0.61 && s[o]! < 1.39));
    expect(degraus).toHaveLength(0);
    // Linha oculta: as arestas do batente em L existem e conferem nas duas vias.
    const sRef = segmentos(montar(p, false, 'hiddenLine'));
    const sNova = segmentos(montar(p, true, 'hiddenLine'));
    expect(comprimentoDescoberto(sRef, sNova, TOL)).toBeLessThan(1e-6);
    expect(comprimentoDescoberto(sNova, sRef, TOL) / comprimento(sRef)).toBeLessThan(0.01);
    expect(sNova.some((s) => [0, 3].every((o) => Math.abs(s[o + 1]! - 0.048) < 1e-4 && s[o]! > 0.61 && s[o]! < 1.39))).toBe(true);
  });

  it('parede girada e parede curva: a silhueta também confere (curva pelo caminho de geometria)', () => {
    const p = predio(3, { aberturas: true, girada: true, curva: true });
    const ref = triangulos(montar(p, false));
    const nova = triangulos(montar(p, true));
    const vRef = volumePorCategoria(ref);
    const vNova = volumePorCategoria(nova);
    for (const [k, v] of vRef) expect(Math.abs(v - vNova.get(k)!) / v).toBeLessThan(1e-5);
    expect(verticesSemPar(ref, nova, TOL)).toHaveLength(0);
  });
});

describe('picking: o mesmo elemento, a mesma categoria e o mesmo ponto', () => {
  for (const [n, aberturas] of CASOS) {
    it(`${n} pavimentos ${aberturas ? 'com' : 'sem'} aberturas: grade de 40 × 40 raios`, { timeout: 180000 }, () => {
      const p = predio(n, { aberturas });
      const ref = montar(p, false);
      const nova = montar(p, true);
      const cam = camera(n);
      let acertos = 0;
      const ids = new Set<string>();
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const ndc = { x: -0.9 + (1.8 * i) / 39, y: -0.9 + (1.8 * j) / 39 };
          const a = pickElement(ref.scene, cam, ndc);
          const b = pickElement(nova.scene, cam, ndc);
          expect(b === null).toBe(a === null);
          if (!a || !b) continue;
          acertos++;
          ids.add(b.id);
          expect(b.id).toBe(a.id);
          expect(b.kind).toBe(a.kind);
          expect(Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y, a.point.z - b.point.z)).toBeLessThan(TOL);
          const pa = pickModelPoint(ref.scene, cam, ndc)!;
          const pb = pickModelPoint(nova.scene, cam, ndc)!;
          expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeLessThan(TOL);
        }
      }
      expect(acertos).toBeGreaterThan(100);
      // Com aberturas, portas e janelas são achadas pelo id da abertura, como antes.
      if (aberturas) expect([...ids].some((id) => id.startsWith('d_') || id.startsWith('j_'))).toBe(true);
    });
  }

  it('no wireframe (sem faces) o picking continua pelas malhas de picking', () => {
    const p = predio(4, { aberturas: true });
    const ref = montar(p, false, 'wireframe');
    const nova = montar(p, true, 'wireframe');
    const cam = camera(4);
    let acertos = 0;
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        const ndc = { x: -0.9 + (1.8 * i) / 19, y: -0.9 + (1.8 * j) / 19 };
        const a = pickElement(ref.scene, cam, ndc);
        const b = pickElement(nova.scene, cam, ndc);
        expect(b?.id).toBe(a?.id);
        if (a) acertos++;
      }
    }
    expect(acertos).toBeGreaterThan(20);
    expect(contarObjetos(nova).instanciadas).toBe(0);
  });

  it('a malha instanciada não entra no raio do zoom nem no ponto do cursor (a caixa unitária não é geometria do mundo)', () => {
    const p = predio(1);
    const nova = montar(p, true);
    expect(contarObjetos(nova).instanciadas).toBeGreaterThan(0);
    nova.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) expect(o.userData.semPick).toBe(true);
    });
    // Raio de fora para dentro sobre a face sul da parede (y = −0,092): a caixa unitária estaria em y = −0,5, antes da parede.
    const d = firstSurfaceDistance(nova.scene, new THREE.Vector3(2, -10, 1), new THREE.Vector3(0, 1, 0));
    expect(d).toBeCloseTo(10 - 0.092, 4);
    const ref = montar(p, false);
    expect(firstSurfaceDistance(ref.scene, new THREE.Vector3(2, -10, 1), new THREE.Vector3(0, 1, 0))).toBeCloseTo(d!, 6);
  });

  it('realce e caixa da seleção vêm das malhas de picking: iguais às da geometria', () => {
    const p = predio(3, { aberturas: true });
    const ref = montar(p, false);
    const nova = montar(p, true);
    for (const ids of [['w_1_0'], ['d_1'], ['j_2', 'w_0_2']] as Id[][]) {
      const a = ref.selectionBounds(ids)!;
      const b = nova.selectionBounds(ids)!;
      expect(a.min.distanceTo(b.min)).toBeLessThan(TOL);
      expect(a.max.distanceTo(b.max)).toBeLessThan(TOL);
    }
    nova.highlight(['d_1'], 'w_0_0');
    nova.scene.updateMatrixWorld(true);
    const sobrepostos: THREE.Object3D[] = [];
    nova.scene.traverse((o) => {
      // Realce de preenchimento: renderOrder 10 (ORDEM_REALCE_PREENCHIMENTO), depois de opacos, vidro, massa e linhas; antes era 5.
      if (o instanceof THREE.Mesh && o.renderOrder === 10) sobrepostos.push(o);
    });
    expect(sobrepostos.length).toBeGreaterThanOrEqual(2);
    // O realce reusa os buffers do modelo: o `position` é a mesma instância da geometria de origem, não uma cópia.
    const origens = new Set<THREE.BufferAttribute>();
    nova.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.ranges) origens.add(m.geometry.getAttribute('position') as THREE.BufferAttribute);
    });
    for (const m of sobrepostos) {
      const mesh = m as THREE.Mesh;
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(origens.has(mesh.geometry.getAttribute('position') as THREE.BufferAttribute)).toBe(true);
    }
  });
});

describe('desempenho: menos chamadas de desenho e menos malhas', () => {
  for (const [n, aberturas] of CASOS) {
    it(`${n} pavimentos ${aberturas ? 'com' : 'sem'} aberturas`, { timeout: 120000 }, () => {
      const p = predio(n, { aberturas });
      const ref = montar(p, false);
      const nova = montar(p, true);
      const a = chamadasDeDesenho(ref);
      const b = chamadasDeDesenho(nova);
      expect(b.total).toBeLessThan(a.total);
      expect(b.malhas).toBeLessThan(a.malhas);
      // Sem aberturas, as paredes (1 malha por material e pavimento) somem e viram instâncias; com aberturas, as esquadrias também.
      expect(b.total / a.total).toBeLessThan(aberturas ? 0.5 : 0.7);
      expect(contarObjetos(nova).instanciadas).toBeGreaterThan(0);
    });
  }

  it('as malhas instanciadas crescem por faixa (culling), não por pavimento', () => {
    const porFaixa = (n: number): number => {
      const ms = montar(predio(n, { aberturas: true }), true);
      return contarObjetos(ms).instanciadas / contarFaixas(n);
    };
    // O lote de cada faixa é o mesmo: 5, 20 e 40 pavimentos dão o mesmo número de malhas por faixa.
    expect(porFaixa(20)).toBe(porFaixa(5));
    expect(porFaixa(40)).toBe(porFaixa(5));
    expect(porFaixa(20)).toBeLessThan(12);
  });

  it('pisos e lajes viram um lote global por categoria/material em cada faixa', () => {
    const porKind = (n: number): Map<string, number> => {
      const ms = montar(predio(n, { aberturas: true }), true);
      const out = new Map<string, number>();
      ms.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.kind === undefined) return;
        let visivel = true;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) visivel &&= p.visible;
        if (!visivel) return;
        const k = String(o.userData.kind);
        out.set(k, (out.get(k) ?? 0) + 1);
      });
      return out;
    };
    const a = porKind(6);
    const b = porKind(20);
    // Um lote de piso e um de laje por faixa (não um por nível).
    expect(a.get('floor')).toBe(contarFaixas(6));
    expect(a.get('slab')).toBe(contarFaixas(6));
    expect(b.get('floor')).toBe(contarFaixas(20));
    expect(b.get('slab')).toBe(contarFaixas(20));
    // O número de malhas de face por faixa não cresce com os pavimentos (caixas viram instâncias; sólidos são lotes).
    const faces = (m: Map<string, number>): number => [...m.values()].reduce((s, x) => s + x, 0);
    expect(faces(b) / contarFaixas(20)).toBe(faces(a) / contarFaixas(6));
  });

  it('as paredes retas não passam pela extrusão: sem aberturas, nenhum sólido de parede entra no cache de camadas', () => {
    clearWallLayerCache();
    montar(predio(10, { aberturas: false }), true);
    expect(wallLayerCacheStats().misses).toBe(0);
    clearWallLayerCache();
    montar(predio(10, { aberturas: false }), false);
    expect(wallLayerCacheStats().misses).toBeGreaterThan(0);
  });
});

describe('estilos, categorias e ciclo de vida da cena com caixas', () => {
  const instanciadas = (ms: ModelScene): THREE.InstancedMesh[] => {
    const out: THREE.InstancedMesh[] = [];
    ms.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) out.push(o);
    });
    return out;
  };
  const comVista = (p: Project, v: Partial<ReturnType<typeof view3dOf>>): Project => ({ ...p, view3d: { ...view3dOf(p), ...v } });
  const montarVista = (p: Project, v: Partial<ReturnType<typeof view3dOf>>): ModelScene => {
    const pv = comVista(p, v);
    const ms = new ModelScene();
    ms.update(pv, pv.levels.map((l) => resolveLevel(pv, l.id)), { edges: true, shadows: true, dark: false });
    return ms;
  };
  const p = predio(2, { aberturas: true });

  it('o material segue o estilo: padrão, luz simples, sem luz e papel com polygonOffset', () => {
    const classes: Array<[VisualStyle, unknown]> = [['realistic', THREE.MeshStandardMaterial], ['shaded', THREE.MeshLambertMaterial], ['consistentColors', THREE.MeshBasicMaterial], ['hiddenLine', THREE.MeshBasicMaterial]];
    for (const [style, Classe] of classes) {
      const ms = montarVista(p, { style });
      const malhas = instanciadas(ms);
      expect(malhas.length).toBeGreaterThan(0);
      for (const m of malhas) expect(m.material).toBeInstanceOf(Classe as typeof THREE.Material);
      if (style === 'hiddenLine') for (const m of malhas) expect((m.material as THREE.MeshBasicMaterial).polygonOffset).toBe(true);
    }
  });

  it('wireframe: nenhuma malha instanciada, só as arestas (e o picking)', () => {
    const ms = montarVista(p, { style: 'wireframe' });
    expect(instanciadas(ms)).toHaveLength(0);
    expect(segmentos(ms).length).toBeGreaterThan(0);
  });

  it('sombras: as caixas projetam e recebem só no realista com sombras ligadas', () => {
    for (const m of instanciadas(montarVista(p, { style: 'realistic', shadows: true }))) expect([m.castShadow, m.receiveShadow]).toEqual([true, true]);
    for (const m of instanciadas(montarVista(p, { style: 'realistic', shadows: false }))) expect([m.castShadow, m.receiveShadow]).toEqual([false, false]);
    for (const m of instanciadas(montarVista(p, { style: 'shaded', shadows: true }))) expect(m.castShadow).toBe(false);
  });

  it('categoria oculta não gera caixas nem malhas de picking; a transparência vai para o material', () => {
    const base = view3dOf(p);
    const ov = (cat: 'door' | 'wall', o: Partial<CategoryOverride>): ReturnType<typeof view3dOf>['overrides'] => ({ ...base.overrides, [cat]: { ...base.overrides[cat], ...o } });
    const semPorta = montarVista(p, { overrides: ov('door', { visible: false }) });
    expect(instanciadas(semPorta).some((m) => m.userData.kind === 'door')).toBe(false);
    expect(instanciadas(semPorta).some((m) => m.userData.kind === 'window')).toBe(true);
    expect(pickKinds(semPorta)).not.toContain('door');
    const semParede = montarVista(p, { overrides: ov('wall', { visible: false }) });
    expect(instanciadas(semParede).some((m) => m.userData.kind === 'wall')).toBe(false);
    expect(pickKinds(semParede)).not.toContain('wall');
    const translucida = montarVista(p, { overrides: ov('wall', { transparency: 0.5 }) });
    for (const m of instanciadas(translucida).filter((x) => x.userData.kind === 'wall')) {
      expect((m.material as THREE.Material).transparent).toBe(true);
      expect((m.material as THREE.Material).opacity).toBeCloseTo(0.5, 9);
    }
  });

  it('abrir vãos: as folhas articuladas viram caixas giradas e o picking as acha pelo id da abertura', () => {
    const fechada = montarVista(p, { openOpenings: false });
    const aberta = montarVista(p, { openOpenings: true });
    const ref = new ModelScene({ instanciar: false });
    const pv = comVista(p, { openOpenings: true });
    ref.update(pv, pv.levels.map((l) => resolveLevel(pv, l.id)), { edges: true, shadows: false, dark: false });
    const a = caixaPorCategoria(triangulos(aberta));
    const f = caixaPorCategoria(triangulos(fechada));
    expect(a.get('door')).not.toEqual(f.get('door'));
    const r = caixaPorCategoria(triangulos(ref));
    for (const k of ['door', 'window']) a.get(k)!.forEach((x, i) => expect(Math.abs(x - r.get(k)![i]!)).toBeLessThan(TOL));
    const vA = volumePorCategoria(triangulos(aberta));
    const vR = volumePorCategoria(triangulos(ref));
    expect(Math.abs(vA.get('door')! - vR.get('door')!)).toBeLessThan(1e-5);
  });

  it('a atualização reaproveita as malhas instanciadas (sem alocar por quadro); dispose as libera', () => {
    const ms = montarVista(p, {});
    const antes = instanciadas(ms);
    const espia = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: true, shadows: false, dark: false });
    // Reuso: nada é descartado e os objetos são os mesmos.
    expect(espia).not.toHaveBeenCalled();
    expect(instanciadas(ms).every((m) => antes.includes(m))).toBe(true);
    const n = instanciadas(ms).length;
    ms.dispose();
    expect(espia).toHaveBeenCalledTimes(n);
    espia.mockRestore();
  });

  it('o nível reaproveitado do cache mantém as caixas: a cena de uma atualização repetida é a mesma', () => {
    const ms = new ModelScene();
    const niveis = p.levels.map((l) => resolveLevel(p, l.id));
    ms.update(p, niveis, { edges: true, shadows: false, dark: false });
    const a = triangulos(ms).length;
    ms.update(p, niveis, { edges: true, shadows: false, dark: false });
    expect(triangulos(ms).length).toBe(a);
    expect(a).toBeGreaterThan(0);
  });

  /** Categorias das malhas de picking (invisíveis) da cena. */
  function pickKinds(ms: ModelScene): string[] {
    const out: string[] = [];
    ms.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.visible && o.userData.ranges) out.push(String(o.userData.kind));
    });
    return out;
  }
});
