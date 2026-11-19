import {
  createEmptyProject,
  FAMILIA_ARMARIO,
  makeWall,
  type Component,
  type Project,
  type Wall,
  type WallType,
} from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { caixaLocalDoComponente, corposDoNivel, facesDasParedes } from './encaixeProjeto.ts';
import { resolverComponente } from './instancia.ts';
import type { PecaResolvida } from './pecas.ts';

const BASE = createEmptyProject('t');

const TIPO_02: WallType = {
  ...BASE.wallTypes[BASE.defaults.wallTypeId]!,
  id: 'wt_02',
  name: 'Parede 20',
  layers: [{ function: 'structure', materialId: 'mat_alvenaria', thickness: 0.2, wraps: false }],
};

function parede(id: string, a: { x: number; y: number }, b: { x: number; y: number }, order: number, extra: Partial<Wall> = {}): Wall {
  return { ...makeWall({ id, typeId: 'wt_02', levelId: 'lv_0', a, b }), order, ...extra };
}

function comParedes(paredes: Wall[]): Project {
  return {
    ...BASE,
    wallTypes: { ...BASE.wallTypes, [TIPO_02.id]: TIPO_02 },
    elements: Object.fromEntries(paredes.map((w) => [w.id, w])),
  };
}

const componente = (extra: Partial<Component> = {}): Component => ({
  id: 'c1',
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  order: 1,
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: '',
  ...extra,
});

function comFamilia(componentes: Component[], p: Project = BASE): Project {
  return {
    ...p,
    componentFamilies: { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) },
    elements: Object.fromEntries(componentes.map((c) => [c.id, c])),
  };
}

function envelope(pecas: readonly PecaResolvida[]): { min: [number, number, number]; max: [number, number, number] } | null {
  let encontrou = false;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const peca of pecas) {
    if (peca.vazio) continue;
    encontrou = true;
    for (let i = 0; i < 3; i++) {
      const inicio = peca.origem[i]!;
      const fim = inicio + peca.extensao[i]!;
      if (inicio < min[i]!) min[i] = inicio;
      if (fim > max[i]!) max[i] = fim;
    }
  }
  return encontrou ? { min, max } : null;
}

describe('facesDasParedes', () => {
  it('parede de (0,0) a (4,0) com espessura 0,2: face esquerda em y = 0,1 e direita invertida em y = −0,1', () => {
    const p = comParedes([parede('w1', { x: 0, y: 0 }, { x: 4, y: 0 }, 1)]);
    const faces = facesDasParedes(p, 'lv_0');
    expect(faces).toHaveLength(2);
    expect(faces[0]!.a.x).toBeCloseTo(0, 9);
    expect(faces[0]!.a.y).toBeCloseTo(0.1, 9);
    expect(faces[0]!.b.x).toBeCloseTo(4, 9);
    expect(faces[0]!.b.y).toBeCloseTo(0.1, 9);
    expect(faces[1]!.a.x).toBeCloseTo(4, 9);
    expect(faces[1]!.a.y).toBeCloseTo(-0.1, 9);
    expect(faces[1]!.b.x).toBeCloseTo(0, 9);
    expect(faces[1]!.b.y).toBeCloseTo(-0.1, 9);
  });

  it('parede curva não tem face', () => {
    const p = comParedes([parede('wc', { x: 0, y: 0 }, { x: 4, y: 0 }, 1, { sag: 0.5 })]);
    expect(facesDasParedes(p, 'lv_0')).toEqual([]);
  });

  it('duas paredes: por parede (ordem de criação), esquerda antes da direita', () => {
    const p = comParedes([
      parede('w2', { x: 0, y: 2 }, { x: 4, y: 2 }, 2),
      parede('w1', { x: 0, y: 0 }, { x: 4, y: 0 }, 1),
    ]);
    const faces = facesDasParedes(p, 'lv_0');
    expect(faces).toHaveLength(4);
    expect(faces[0]!.a.y).toBeCloseTo(0.1, 9);
    expect(faces[1]!.a.y).toBeCloseTo(-0.1, 9);
    expect(faces[2]!.a.y).toBeCloseTo(2.1, 9);
    expect(faces[3]!.a.y).toBeCloseTo(1.9, 9);
  });
});

describe('caixaLocalDoComponente', () => {
  it('armário A80: envolvente das peças não vazias no sistema local', () => {
    const p = comFamilia([componente()]);
    const c = componente();
    const caixa = caixaLocalDoComponente(p, c);
    const esperada = envelope(resolverComponente(p, c).pecas);
    expect(caixa).not.toBeNull();
    expect(esperada).not.toBeNull();
    for (let i = 0; i < 3; i++) {
      expect(caixa!.min[i]!).toBeCloseTo(esperada!.min[i]!, 9);
      expect(caixa!.max[i]!).toBeCloseTo(esperada!.max[i]!, 9);
    }
  });

  it('família ausente: null', () => {
    const p = createEmptyProject('sem família');
    expect(caixaLocalDoComponente(p, componente())).toBeNull();
  });
});

describe('corposDoNivel', () => {
  it('pose com z = elevação do nível + z do componente, na ordem de order', () => {
    const p0: Project = {
      ...BASE,
      levels: BASE.levels.map((l) => (l.id === 'lv_0' ? { ...l, elevation: 2.5 } : l)),
    };
    const p = comFamilia(
      [
        componente({ id: 'c1', order: 2, z: 0.1 }),
        componente({ id: 'c2', order: 1, typeId: 'A60', z: 0.3 }),
        componente({ id: 'c3', order: 3, levelId: 'lv_1' }),
      ],
      p0,
    );
    const corpos = corposDoNivel(p, 'lv_0');
    expect(corpos.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(corpos[0]!.pose.z).toBeCloseTo(2.8, 9);
    expect(corpos[1]!.pose.z).toBeCloseTo(2.6, 9);
    expect(corpos[0]!.pose).toMatchObject({ x: 0, y: 0, rotation: 0, mirrored: false });
  });

  it('exclui ids e deixa de fora componente de família ausente', () => {
    const p = comFamilia([
      componente({ id: 'c1', order: 1 }),
      componente({ id: 'c2', order: 2, typeId: 'A60' }),
      componente({ id: 'c3', order: 3, familyId: 'fam_ausente' }),
    ]);
    expect(corposDoNivel(p, 'lv_0').map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(corposDoNivel(p, 'lv_0', new Set(['c1'])).map((c) => c.id)).toEqual(['c2']);
    expect(corposDoNivel(p, 'lv_1')).toEqual([]);
  });
});
