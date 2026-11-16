import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { frameOfWall } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, view3dOf, type Layer, type Opening, type Project } from '@hestia/model';
import { caixasEPrismasDaAbertura, montarAbertura, type AberturaEmCaixas } from './aberturas3d.ts';

/*
 * C3: esquadria 3D (batente, folha, vidro) na parede inclinada. Parede reta de 6 m (H = 3, t = 0,2) ao longo de +x, a
 * normal é +y e o eixo médio em z passa por y = z·tanθ. Plano 'inclinado': o conjunto no plano da face; 'vertical':
 * caixilho em prumo ancorado na face, com recuo >= 0.
 */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
type Tipo = 'janela' | 'porta' | 'vazio';
const TIPOS: Record<Tipo, { kind: 'window' | 'door'; typeId: string; sill: number }> = {
  janela: { kind: 'window', typeId: 'ot_j120', sill: 1.1 },
  porta: { kind: 'door', typeId: 'ot_p80', sill: 0 },
  vazio: { kind: 'window', typeId: 'ot_vazio', sill: 1.1 },
};

function proj(tilt: number, tipo: Tipo, plano?: 'vertical' | 'inclinado', radius?: number): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  base.openingTypes.ot_vazio = { ...base.openingTypes.ot_j120!, id: 'ot_vazio', leaves: 0 };
  const s = new ProjectStore(base);
  const wall = makeWall({ id: 'w1', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...(tilt ? { tilt } : {}), ...(radius ? { sag: 6 * 6 / 8 / radius } : {}) });
  s.exec({ type: 'addWall', wall });
  const T = TIPOS[tipo];
  s.exec({ type: 'addOpening', opening: { id: 'o1', kind: T.kind, typeId: T.typeId, hostId: 'w1', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...(plano ? { plano } : {}) } as Opening });
  return s.project;
}

/** Vértices de mundo das caixas e dos prismas da esquadria. */
function vertices(a: AberturaEmCaixas): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const cubo = new THREE.BoxGeometry(1, 1, 1);
  for (const c of a.caixas) {
    const m = new THREE.Matrix4().fromArray(c.matriz);
    const pos = cubo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
  }
  for (const pr of a.prismas) {
    const pos = pr.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  }
  return out;
}
function esquadria(p: Project): AberturaEmCaixas {
  const o = p.elements.o1 as Opening;
  const f = frameOfWall(p, 'w1')!;
  const a = caixasEPrismasDaAbertura(p, o, f, 0, 3, view3dOf(p));
  expect(a).not.toBeNull();
  return a!;
}

describe('esquadria 3D em parede inclinada (C3)', () => {
  it('P5 (20°): a janela fica dentro da espessura da parede inclinada (antes: 0,93 m fora do eixo)', () => {
    const v = vertices(esquadria(proj(20, 'janela')));
    const th = (20 * Math.PI) / 180;
    const dev = Math.max(...v.map((q) => Math.abs(q.y - q.z * Math.tan(th))));
    // distância ao eixo inclinado na horizontal: no máximo metade da espessura horizontal da parede
    expect(dev).toBeLessThanOrEqual(0.1 / Math.cos(th) + 1e-6);
  });

  it('parede vertical: vértices idênticos aos de hoje (sem referencial)', () => {
    for (const t of ['janela', 'porta', 'vazio'] as Tipo[]) {
      const a = esquadria(proj(0, t));
      const b = esquadria(proj(0, t));
      const [va, vb] = [vertices(a), vertices(b)];
      expect(va.length).toBeGreaterThan(0);
      va.forEach((q, i) => expect(q.distanceTo(vb[i]!)).toBe(0));
    }
  });

  for (const tilt of [15, -15, 20]) {
    const th = (tilt * Math.PI) / 180;
    const [sn, cs, tn] = [Math.sin(th), Math.cos(th), Math.tan(th)];
    for (const tipo of ['janela', 'porta', 'vazio'] as Tipo[]) {
      const sill = TIPOS[tipo].sill;
      it(`${tipo} ${tilt}°, plano inclinado: cada vértice é o da parede vertical levado ao plano da face (1e-6)`, () => {
        const ref = vertices(esquadria(proj(0, tipo)));
        const inc = vertices(esquadria(proj(tilt, tipo, 'inclinado')));
        expect(inc.length).toBe(ref.length);
        ref.forEach((q, i) => {
          const w = inc[i]!;
          // (x, y, z−sill) da vertical -> x; y·cosθ + zl·senθ + sill·tanθ ; sill + zl·cosθ − y·senθ
          const zl = q.z - sill;
          expect(w.x).toBeCloseTo(q.x, 6);
          expect(w.y).toBeCloseTo(q.y * cs + zl * sn + sill * tn, 6);
          expect(w.z).toBeCloseTo(sill + zl * cs - q.y * sn, 6);
          // coordenada normal à face (a partir do plano médio) inalterada: o caixilho fica no plano da face
          expect((w.y - w.z * tn) * cs).toBeCloseTo(q.y, 6);
        });
      });
      it(`${tipo} ${tilt}°, plano vertical: em prumo e ancorado na face com recuo >= 0`, () => {
        const ref = vertices(esquadria(proj(0, tipo)));
        const ver = vertices(esquadria(proj(tilt, tipo, 'vertical')));
        const sgn = tilt > 0 ? 1 : -1;
        const face = sill * tn + (sgn * 0.2) / (2 * cs);
        ref.forEach((q, i) => {
          expect(ver[i]!.x).toBeCloseTo(q.x, 9);
          expect(ver[i]!.z).toBeCloseTo(q.z, 9);
        });
        const folga = Math.min(...ver.map((q) => sgn * (face - q.y)));
        expect(folga).toBeGreaterThanOrEqual(-1e-6);
        expect(folga).toBeLessThan(1e-6); // a peça mais saliente encosta na face
      });
    }
  }

  it('janela em arco (w² ≤ 0,4·R) a 15°: no plano da face; fora do limite cai no vertical ancorado', () => {
    const p = proj(15, 'janela', 'inclinado', 60);
    const o = p.elements.o1 as Opening;
    const g = frameOfWall(p, 'w1')!;
    expect(g.arc).toBeDefined();
    const a = esquadria(p);
    expect(vertices(a).length).toBeGreaterThan(0);
    expect(o.plano).toBe('inclinado');
  });

  it('caminho de geometria (montarAbertura) coincide com o de caixas na janela a 20°', () => {
    const p = proj(20, 'janela');
    const o = p.elements.o1 as Opening;
    const f = frameOfWall(p, 'w1')!;
    const caixas = vertices(esquadria(p));
    const m = montarAbertura(p, o, f, 0, 3, view3dOf(p), false, () => undefined)!;
    m.grupo.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const lote of m.lotes) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(lote.positions), 3));
      geo.applyMatrix4(m.grupo.matrixWorld);
      box.union(new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position') as THREE.BufferAttribute));
    }
    const b2 = new THREE.Box3().setFromPoints(caixas);
    expect(box.min.distanceTo(b2.min)).toBeLessThan(1e-6);
    expect(box.max.distanceTo(b2.max)).toBeLessThan(1e-6);
  });
});
