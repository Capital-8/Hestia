import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, isWall, type Layer, type Wall } from '@hestia/model';
import { importIfc } from '@hestia/io';
import { planDxf } from './dxfExport.ts';
import { projectIfc } from './ifcExport.ts';

/** F2.12 · IFC e DXF de parede inclinada. t=0,2; H=3. Volumes literais da tabela (METODOLOGIA 4.2). */
const NOW = new Date('2026-11-14T12:00:00Z');
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
const CHORD = 5 * Math.SQRT2; // arco R=5, φ=90°
const SAG = 5 * (1 - Math.SQRT1_2);

function projeto(w: Partial<Wall>): ProjectStore {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...w }) });
  return s;
}

/** Entidades STEP `#n=TIPO(args)` por número. */
function entidades(text: string): Map<number, { tipo: string; args: string }> {
  const m = new Map<number, { tipo: string; args: string }>();
  for (const l of text.split('\n')) {
    const r = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(l.trim());
    if (r) m.set(Number(r[1]), { tipo: r[2]!, args: r[3]! });
  }
  return m;
}
const refs = (s: string): number[] => (s.match(/#(\d+)/g) ?? []).map((x) => Number(x.slice(1)));
const nums = (s: string): number[] => (s.match(/-?\d+(?:\.\d+)?(?:E-?\d+)?/gi) ?? []).map(Number);

/** Volume dos sólidos do arquivo (projeto com uma só parede): extrusão (área × profundidade × cos da direção) ou Brep (divergência). */
function volumeDaParede(text: string): { volume: number; tipo: string } {
  const e = entidades(text);
  let total = 0;
  let tipo = '';
  for (const [, ent] of e) {
    if (ent.tipo === 'IFCEXTRUDEDAREASOLID') {
      tipo = 'extrusao';
      const [perfil, , dir] = refs(ent.args);
      const curva = e.get(refs(e.get(perfil!)!.args)[0]!)!;
      const pts = refs(curva.args).map((id) => nums(e.get(id)!.args));
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0]! * pts[i + 1]![1]! - pts[i + 1]![0]! * pts[i]![1]!;
      const d = nums(e.get(dir!)!.args);
      const depth = nums(ent.args.slice(ent.args.lastIndexOf(',') + 1))[0]!;
      total += (Math.abs(a) / 2) * depth * d[2]!;
    } else if (ent.tipo === 'IFCFACETEDBREP') {
      tipo = 'brep';
      const shell = e.get(refs(ent.args)[0]!)!;
      for (const f of refs(shell.args)) {
        for (const b of refs(e.get(f)!.args)) {
          const loop = e.get(refs(e.get(b)!.args)[0]!)!;
          const p = refs(loop.args).map((id) => nums(e.get(id)!.args));
          for (let i = 1; i < p.length - 1; i++) {
            const [a0, b0, c0] = [p[0]!, p[i]!, p[i + 1]!];
            total += (a0[0]! * (b0[1]! * c0[2]! - b0[2]! * c0[1]!) - a0[1]! * (b0[0]! * c0[2]! - b0[2]! * c0[0]!) + a0[2]! * (b0[0]! * c0[1]! - b0[1]! * c0[0]!)) / 6;
          }
        }
      }
    }
  }
  return { volume: total, tipo };
}

describe('F2.12 · exportação IFC de parede inclinada', () => {
  it('reta θ=15° e 30°: extrusão oblíqua com o volume da tabela (1e-3)', () => {
    const a = volumeDaParede(projectIfc(projeto({ tilt: 15 }).project, NOW));
    expect(a.tipo).toBe('extrusao');
    expect(Math.abs(a.volume - 2.4847)).toBeLessThan(1e-3);
    const b = volumeDaParede(projectIfc(projeto({ tilt: 30 }).project, NOW));
    expect(Math.abs(b.volume - 2.7713)).toBeLessThan(1e-3);
  });

  it('arco R=5 φ=90° θ=15° afastando: malha com volume 5,2708 (1e-3)', () => {
    const r = volumeDaParede(projectIfc(projeto({ b: { x: CHORD, y: 0 }, sag: SAG, tilt: 15 }).project, NOW));
    expect(r.tipo).toBe('brep');
    expect(Math.abs(r.volume - 5.2708)).toBeLessThan(1e-3);
  });

  it('vertical: saída idêntica com tilt ausente ou 0 e sem IFCFACETEDBREP', () => {
    const v = projectIfc(projeto({}).project, NOW);
    expect(projectIfc(projeto({ tilt: 0 }).project, NOW).replace(/HestiaJSON[^;]*/g, '')).toBe(v.replace(/HestiaJSON[^;]*/g, ''));
    expect(v).not.toContain('IFCFACETEDBREP');
    expect(Math.abs(volumeDaParede(v).volume - 2.4)).toBeLessThan(1e-9);
  });

  it('reimporta o mesmo número de paredes e o tilt de cada uma', () => {
    const s = projeto({ tilt: -20 });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 5 }, b: { x: 4, y: 5 } }) });
    const volta = importIfc(projectIfc(s.project, NOW)).project;
    const ws = Object.values(volta.elements).filter(isWall);
    expect(ws).toHaveLength(2);
    expect(ws.map((w) => w.tilt ?? 0).sort((x, y) => x - y)).toEqual([-20, 0]);
  });

  it('IFC de terceiros sem o pset Hestia: paredes verticais, sem erro', () => {
    const text = projectIfc(projeto({ tilt: 15 }).project, NOW).split('\n').filter((l) => !l.includes('Pset_Hestia') && !l.includes('HestiaJSON')).join('\n');
    let volta: ReturnType<typeof importIfc> | undefined;
    expect(() => { volta = importIfc(text); }).not.toThrow();
    for (const w of Object.values(volta!.project.elements).filter(isWall)) expect(w.tilt ?? 0).toBe(0);
  });
});

describe('F2.12 · DXF de planta com parede inclinada', () => {
  it('não lança; contorno no plano de corte difere do vertical; vertical idêntico', () => {
    const vert = planDxf(projeto({}).project, 'lv_0');
    const inc = planDxf(projeto({ tilt: 30 }).project, 'lv_0');
    expect(inc).toContain('\r\nPAREDE_CONTORNO\r\n');
    expect(inc).not.toBe(vert);
    expect(planDxf(projeto({ tilt: 0 }).project, 'lv_0')).toBe(vert);
    expect(() => planDxf(projeto({ b: { x: CHORD, y: 0 }, sag: SAG, tilt: 15 }).project, 'lv_0')).not.toThrow();
  });
});
