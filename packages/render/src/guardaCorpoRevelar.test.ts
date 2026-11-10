import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Vec2 } from '@hestia/geom';
import { resolveLevel, servicoGuardaCorpo, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import { buildTemplate, makeGuardaCorpo, type HospedeiroManual, type Project } from '@hestia/model';
import { buildPlanGeometry, buildPlanScreenOverlay, type PlanInput } from './plan/build.ts';
import { LIGHT } from './plan/types.ts';
import type { PlanOps } from './plan/types.ts';
import type { Viewport } from './viewport.ts';
import { buildSectionDrawList, type SectionInput } from './section/build.ts';
import { ModelScene, type Scene3DOptions } from './model3d/scene3d.ts';

/**
 * Guarda-corpo oculto (Hide in View) nas três vistas: sai com o modo Reveal desligado e volta com o contorno azul do Reveal ligado.
 * As linhas do kernel Rust são substituídas por linhas sintéticas (`servicoGuardaCorpo`), no mesmo formato que a planta, o corte e a 3D leem.
 */

afterEach(() => vi.restoreAllMocks());

const AZUL = '#2563eb';
const AZUL_3D = 0x2563eb;
const VIEW: Viewport = { cx: 3, cy: 2, zoom: 100, width: 800, height: 600 };
const v = (x: number, y: number): Vec2 => ({ x, y });

const manual: HospedeiroManual = { tipo: 'manual', uso: 'varanda', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 4, y: 0, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' };

/** Casa-modelo com um guarda-corpo manual no primeiro pavimento. */
function comGuarda(): { p: Project; gid: string; levelId: string } {
  const p = structuredClone(buildTemplate('house2'));
  const levelId = p.levels[0]!.id;
  const gid = 'gc_rev';
  p.elements[gid] = { ...makeGuardaCorpo({ id: gid, levelId, typeId: Object.keys(p.tiposGuardaCorpo)[0]!, hospedeiro: manual }), order: 999 };
  return { p, gid, levelId };
}

/** Peça fechada 0,2 m × 1 m (estilo cortado) e eixo aberto, do guarda-corpo `gid`. */
const linhasDo = (gid: string): LinhaVistaGC[] => [
  { guardaId: gid, papel: 0, estilo: 0, pontos: [v(0, 0), v(4, 0), v(4, 0.2), v(0, 0.2)] },
  { guardaId: gid, papel: 255, estilo: 1, pontos: [v(0, 0.1), v(4, 0.1)] },
];

/** Uma peça (tetraedro) do guarda-corpo `gid` para a 3D: o material é o primeiro do projeto. */
const malhaDo = (p: Project, gid: string) => [
  {
    guardaId: gid,
    partes: [
      {
        papel: 'poste' as const,
        materialId: Object.keys(p.materials)[0]!,
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
        indices: [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2],
        pecas: 1,
      },
    ],
  },
];

function mockKernel(p: Project, gid: string): void {
  const srv = servicoGuardaCorpo();
  vi.spyOn(srv, 'planta').mockImplementation(() => linhasDo(gid));
  vi.spyOn(srv, 'corte').mockImplementation(() => ({ linhas: linhasDo(gid), poligonos: [] }));
  vi.spyOn(srv, 'malhas').mockImplementation(() => malhaDo(p, gid));
  vi.spyOn(srv, 'pronto').mockImplementation(() => true);
}

const azulPlano = (ops: PlanOps): number => ops.strokes.filter((s) => s.color === AZUL && s.widthPx === 2).length;

/** Trechos da planta que vêm do guarda-corpo: as linhas dele aparecem como traço de 4 pontos ou 2 pontos (eixo). */
const traçosDo = (ops: PlanOps): number => ops.strokes.filter((s) => s.pts.some((q) => q.y === 0.2 || q.y === 0.1)).length;

describe('guarda-corpo oculto na planta', () => {
  it('oculto não é desenhado; revelado volta com o contorno azul do Reveal', () => {
    const { p, gid, levelId } = comGuarda();
    mockKernel(p, gid);
    const entrada = (over: Partial<PlanInput>): PlanInput => ({
      project: p,
      levelId,
      resolved: resolveLevel(p, levelId, new Map()),
      below: null,
      viewport: VIEW,
      theme: LIGHT,
      dark: false,
      selection: [],
      hover: null,
      preview: [],
      inference: null,
      showGrid: false,
      ...over,
    });

    const visivel = buildPlanGeometry(entrada({}));
    expect(traçosDo(visivel)).toBeGreaterThan(0);
    expect(azulPlano(buildPlanScreenOverlay(entrada({})))).toBe(0);

    const oculto = buildPlanGeometry(entrada({ hidden: new Set([gid]) }));
    expect(traçosDo(oculto)).toBe(0);
    expect(azulPlano(buildPlanScreenOverlay(entrada({ hidden: new Set([gid]) })))).toBe(0);

    const revelado = buildPlanGeometry(entrada({ hidden: new Set(), revealed: new Set([gid]) }));
    expect(traçosDo(revelado)).toBe(traçosDo(visivel));
    expect(azulPlano(buildPlanScreenOverlay(entrada({ hidden: new Set(), revealed: new Set([gid]) })))).toBeGreaterThan(0);
  });
});

describe('guarda-corpo oculto no corte e na elevação', () => {
  const sec = (patch: Partial<SectionResult> = {}): SectionResult => ({
    length: 10,
    zMin: 0,
    zMax: 3,
    cut: [],
    silhouette: [],
    beyond: [],
    openings: [],
    membranes: [],
    levels: [],
    plano: { a: v(0, 0), b: v(10, 0), depth: 5 },
    ...patch,
  });

  it('oculto some do corte; revelado sai com o contorno azul do Reveal', () => {
    const { p, gid } = comGuarda();
    mockKernel(p, gid);
    const entrada = (over: Partial<SectionInput>): SectionInput => ({
      project: p,
      section: sec(),
      viewport: { cx: 5, cy: 1.5, zoom: 60, width: 800, height: 600 },
      theme: LIGHT,
      dark: false,
      showGrid: false,
      ...over,
    });

    const visivel = buildSectionDrawList(entrada({}));
    const oculto = buildSectionDrawList(entrada({ hidden: new Set([gid]) }));
    const revelado = buildSectionDrawList(entrada({ hidden: new Set(), revealed: new Set([gid]) }));
    const azuisDe = (d: { strokes: { color: string; widthPx: number }[] }): number => d.strokes.filter((s) => s.color === AZUL && s.widthPx === 2).length;

    expect(oculto.strokes.length).toBeLessThan(visivel.strokes.length);
    expect(oculto.fills.length).toBeLessThan(visivel.fills.length);
    expect(azuisDe(oculto)).toBe(0);
    expect(azuisDe(visivel)).toBe(0);
    expect(revelado.strokes.length).toBe(visivel.strokes.length + linhasDo(gid).length);
    expect(azuisDe(revelado)).toBe(linhasDo(gid).length);
  });
});

describe('guarda-corpo oculto na 3D', () => {
  const niveis = (p: Project) => p.levels.map((l) => resolveLevel(p, l.id));
  const BASE: Scene3DOptions = { edges: false, shadows: false, dark: false };
  const azuis = (ms: ModelScene): THREE.LineSegments[] => {
    const out: THREE.LineSegments[] = [];
    ms.scene.traverse((o) => {
      if (o instanceof THREE.LineSegments && (o.material as THREE.LineBasicMaterial).color?.getHex() === AZUL_3D) out.push(o);
    });
    return out;
  };
  const cena = (p: Project, opt: Partial<Scene3DOptions>): ModelScene => {
    const ms = new ModelScene({ instanciar: false });
    ms.update(p, niveis(p), { ...BASE, ...opt });
    return ms;
  };

  it('oculto não tem malha nem seleção; revelado tem a malha e as arestas azuis', () => {
    const { p, gid } = comGuarda();
    mockKernel(p, gid);
    const oculto = cena(p, { hidden: new Set([gid]), revealed: new Set() });
    expect(oculto.selectionBounds([gid])).toBeNull();
    expect(azuis(oculto)).toHaveLength(0);

    const visivel = cena(p, {});
    expect(visivel.selectionBounds([gid])).not.toBeNull();
    expect(azuis(visivel)).toHaveLength(0);

    const revelado = cena(p, { hidden: new Set(), revealed: new Set([gid]) });
    expect(revelado.selectionBounds([gid])).not.toBeNull();
    const linhas = azuis(revelado);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});
