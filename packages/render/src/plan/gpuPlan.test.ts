import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { resolveLevel } from '@hestia/engine';
import { buildTemplate } from '@hestia/model';
import { PlanScene } from './gpuPlan.ts';
import { PlanFrame, planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { rasterizarCena } from './rasterSoftware.ts';
import { LIGHT, type PlanDrawList } from './types.ts';

const VIEW = { cx: 0, cy: 0, zoom: 10, width: 400, height: 300 };
const quad = (x0: number, y0: number, x1: number, y1: number) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];

/** Malhas de todas as camadas da cena, na ordem das camadas (ordem da lista de desenho). */
function meshesOf(scene: PlanScene): THREE.Mesh[] {
  return (scene.scene.children as THREE.Group[]).flatMap((g) => g.children as THREE.Mesh[]);
}

describe('PlanScene: poucas malhas por quadro (draw calls)', () => {
  it('um pavimento do prédio de 10 (zoom 60): a grade é 5 malhas e o quadro inteiro fica abaixo de 110', () => {
    const p = buildTemplate('predio10');
    const scene = new PlanScene();
    const frame = new PlanFrame(scene);
    const estado: PlanViewState = {
      project: p,
      version: 1,
      levelId: 'lv_5',
      v: { cx: 10, cy: 6.5, zoom: 60, width: 1200, height: 800 },
      theme: LIGHT,
      dark: false,
      gpu: true,
      showGrid: true,
      showUnderlay: true,
      showRoofProjection: true,
      thinLines: false,
      selection: [],
      hover: null,
      preview: [],
      inference: null,
      resolve: (id) => resolveLevel(p, id, new Map()),
    };
    frame.update(planFrameUpdateOf(estado));
    const camadas = scene.scene.children as THREE.Group[];
    expect(camadas[5]!.children.length).toBeLessThanOrEqual(5);
    const total = camadas.reduce((n, g) => n + g.children.length, 0);
    expect(total).toBeLessThan(110);
    scene.dispose();
  }, 60_000);
});


describe('PlanScene: atualização incremental igual à recriação completa', () => {
  it('uma sequência de mudanças (geometria, seleção, zoom, nível, grade) dá a mesma imagem que uma cena nova em cada passo', () => {
    const p = buildTemplate('predio10');
    const paredeLv5 = Object.values(p.elements).find((e) => e.kind === 'wall' && 'levelId' in e && e.levelId === 'lv_5')!.id;
    const base: PlanViewState = {
      project: p,
      version: 1,
      levelId: 'lv_5',
      v: { cx: 10, cy: 6.5, zoom: 60, width: 1200, height: 800 },
      theme: LIGHT,
      dark: false,
      gpu: true,
      showGrid: true,
      showUnderlay: true,
      showRoofProjection: true,
      thinLines: false,
      selection: [],
      hover: null,
      preview: [],
      inference: null,
      resolve: (id) => resolveLevel(p, id, new Map()),
    };
    const passos: PlanViewState[] = [
      base,
      { ...base, hover: paredeLv5 },
      { ...base, hover: paredeLv5, selection: [paredeLv5] },
      { ...base, selection: [paredeLv5], v: { ...base.v, zoom: 80 } },
      { ...base, selection: [paredeLv5], v: { ...base.v, zoom: 80 }, levelId: 'lv_4', resolve: (id) => resolveLevel(p, id, new Map()) },
      { ...base, selection: [paredeLv5], v: { ...base.v, zoom: 80 }, levelId: 'lv_4', showGrid: false },
      { ...base, levelId: 'lv_5', version: 2, v: { ...base.v, zoom: 40 } },
    ];
    const incremental = new PlanScene();
    const quadro = new PlanFrame(incremental);
    for (const [i, estado] of passos.entries()) {
      quadro.update(planFrameUpdateOf(estado));
      const completa = new PlanScene();
      new PlanFrame(completa).update(planFrameUpdateOf(estado));
      // A imagem é a mesma: a atualização incremental reaproveita malhas e buffers (a grade pode ter mais linhas fora da
      // vista, cobertas pela folga; a imagem visível não muda).
      const W = 300;
      const H = 200;
      expect(rasterizarCena(incremental, estado.v, W, H), `passo ${i}`).toEqual(rasterizarCena(completa, estado.v, W, H));
      completa.dispose();
    }
    incremental.dispose();
  }, 60_000);
});

describe('PlanScene: ordem de desenho segue a lista (como o CPU)', () => {
  it('a parede (preenchimento sólido posterior) fica depois da hachura da laje, e todo material é transparente', () => {
    // Laje com hachura no retângulo grande, parede (sólida, posterior na lista) cobrindo parte dele.
    const dl: PlanDrawList = {
      background: '#ffffff',
      fills: [
        { polygons: [quad(0, 0, 8, 6)], color: '#cccccc', alpha: 1, hatch: { kind: 'cross', color: '#444444' } },
        { polygons: [quad(0, 0, 2, 6)], color: '#222222', alpha: 1 },
      ],
      strokes: [],
      labels: [],
    };
    const scene = new PlanScene();
    scene.setDrawList(dl, VIEW);
    const meshes = meshesOf(scene);
    // Preenchimento, hachura e parede: três malhas em ordem crescente de `renderOrder` (a grade ocupa a primeira faixa).
    const ordens = meshes.map((m) => m.renderOrder);
    expect(ordens[0]).toBeLessThan(ordens[1]!);
    expect(ordens[1]).toBeLessThan(ordens[2]!);
    // Transparente é o que põe todas as malhas no mesmo grupo de ordenação: a parede cobre a hachura por `renderOrder`.
    expect(meshes.every((m) => (m.material as THREE.MeshBasicMaterial).transparent)).toBe(true);
    scene.dispose();
  });

  it('traços vêm depois de todos os preenchimentos, com a mesma ordem da lista', () => {
    const dl: PlanDrawList = {
      background: '#ffffff',
      fills: [{ polygons: [quad(0, 0, 4, 4)], color: '#eeeeee', alpha: 0.5 }],
      strokes: [{ pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }], closed: false, widthPx: 2, color: '#000000', alpha: 1 }],
      labels: [],
    };
    const scene = new PlanScene();
    scene.setDrawList(dl, VIEW);
    const meshes = meshesOf(scene);
    expect(meshes.length).toBe(2);
    expect(meshes[0]!.renderOrder).toBeLessThan(meshes[1]!.renderOrder);
    scene.dispose();
  });
});
