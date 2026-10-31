import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import type { Guide, Inference } from '@hestia/tools';
import { LIGHT, type PlanTheme } from '../plan/types.ts';
import { sectionLiveOps, type SectionLiveOps } from './live.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Projeto vazio com uma parede marcada, para o tooltip de captura mostrar o nome do elemento. */
function projectWithWall(mark = 'P1'): Project {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3, mark }) });
  return store.project;
}

const VAZIO: SectionLiveOps = { fills: [], strokes: [], labels: [] };

/** Operações da camada viva para uma inferência, no tema claro. */
function opsOf(inference: Inference, project: Project = projectWithWall(), theme: PlanTheme = LIGHT): SectionLiveOps {
  return sectionLiveOps({ inference, project, theme });
}

describe('camada viva do corte/elevação (sectionLiveOps)', () => {
  it('extremidade: marcador ancorado no ponto e tooltip "Extremidade"', () => {
    const point = v(2.5, 1.25);
    const ops = opsOf({ point, kind: 'endpoint', guides: [] });
    expect(ops.fills).toEqual([]);
    expect(ops.strokes.length).toBeGreaterThan(0);
    // O marcador é em pixels de tela: a âncora fica em (t,z) e os vértices saem em `deslocamentoPx`.
    for (const s of ops.strokes) {
      expect(s.pts.every((p) => p.x === point.x && p.y === point.y)).toBe(true);
      expect(s.deslocamentoPx).toHaveLength(s.pts.length);
    }
    expect(ops.labels).toEqual([{ at: point, text: 'Extremidade', dx: 12, dy: -12, tone: 'accent' }]);
  });

  it('ponto médio e interseção desenham marcadores diferentes', () => {
    const point = v(1, 2);
    const mid = opsOf({ point, kind: 'midpoint', guides: [] });
    const cross = opsOf({ point, kind: 'intersection', guides: [] });
    expect(mid.strokes).not.toEqual(cross.strokes);
    // Triângulo fechado (ponto médio) × duas diagonais abertas (interseção).
    expect(mid.strokes).toHaveLength(1);
    expect(mid.strokes[0]!.closed).toBe(true);
    expect(mid.strokes[0]!.pts).toHaveLength(3);
    expect(cross.strokes).toHaveLength(2);
    expect(cross.strokes.every((s) => !s.closed && s.pts.length === 2)).toBe(true);
    expect(mid.labels[0]!.text).toBe('Ponto médio');
    expect(cross.labels[0]!.text).toBe('Interseção');
  });

  it('guia de alinhamento vira traço tracejado inteiro, de from a to, e o tooltip não duplica', () => {
    const point = v(3, 0.75);
    // Extensão para fora do trecho de face: a guia vai da âncora ao ponto, de ponta a ponta.
    const guide: Guide = { from: v(-1, 0.75), to: point, kind: 'alignment' };
    const ops = opsOf({ point, kind: 'alignment', guides: [guide] });
    const dashed = ops.strokes.find((s) => s.dash !== undefined);
    expect(dashed).toBeDefined();
    expect(dashed!.pts).toEqual([guide.from, guide.to]);
    expect(dashed!.closed).toBe(false);
    expect(dashed!.dash).toEqual([6, 4]);
    expect(dashed!.color).toBe(LIGHT.guide);
    expect(ops.labels.map((l) => l.text)).toEqual(['Alinhamento']);
    // O marcador de alinhamento continua depois da guia.
    expect(ops.strokes.filter((s) => s.dash === undefined)).toHaveLength(2);
  });

  it('sem inferência ou com captura "none" não desenha nada', () => {
    expect(sectionLiveOps({ inference: null, project: projectWithWall(), theme: LIGHT })).toEqual(VAZIO);
    const none: Inference = { point: v(0, 0), kind: 'none', guides: [{ from: v(1, 1), to: v(2, 2), kind: 'ortho' }] };
    expect(opsOf(none)).toEqual(VAZIO);
  });

  it('não muta a inferência nem as guias recebidas', () => {
    const guide: Guide = { from: v(0, 0), to: v(1, 0), kind: 'alignment' };
    const inference: Inference = { point: v(1, 0), kind: 'alignment', guides: [guide], hostId: 'w1' };
    const before = JSON.parse(JSON.stringify(inference)) as Inference;
    Object.freeze(guide.from);
    Object.freeze(guide.to);
    Object.freeze(guide);
    Object.freeze(inference.guides);
    Object.freeze(inference.point);
    Object.freeze(inference);
    expect(() => sectionLiveOps({ inference, project: projectWithWall(), theme: LIGHT })).not.toThrow();
    expect(inference).toEqual(before);
  });

  it('mantém as coordenadas (t,z) sem conversão', () => {
    // t negativo e cota alta: o par entra e sai exatamente como veio, sem trocar eixos nem virar pixel.
    const point = v(-2.75, 12.5);
    const ops = opsOf({ point, kind: 'endpoint', guides: [] });
    expect(ops.strokes[0]!.pts).toEqual([point, point, point, point]);
    expect(ops.strokes[0]!.deslocamentoPx).toHaveLength(4);
    expect(ops.labels[0]!.at).toEqual(point);
  });

  it('grade desenha marcador fino, mas não gera tooltip', () => {
    const ops = opsOf({ point: v(0.5, 1.5), kind: 'grid', guides: [] });
    expect(ops.strokes).toHaveLength(2);
    expect(ops.strokes.every((s) => s.dash === undefined && s.widthPx === 1.2)).toBe(true);
    expect(ops.labels).toEqual([]);
  });

  it('hostId de parede entra no tooltip existente, sem rótulo extra', () => {
    const ops = opsOf({ point: v(2, 1), kind: 'endpoint', guides: [], hostId: 'w1' });
    expect(ops.labels).toHaveLength(1);
    expect(ops.labels[0]!.text).toBe('Extremidade · parede P1');
  });
});
