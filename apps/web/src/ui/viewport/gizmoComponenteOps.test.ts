import { describe, expect, it } from 'vitest';
import { corposDoNivel } from '@hestia/engine';
import { FAMILIA_ARMARIO, createEmptyProject, type Component, type Project } from '@hestia/model';
import type { AlvoComponente3D } from '@hestia/render';
import {
  alinharFrenteEProfundidade,
  alvoComponente3D,
  compensarPosicaoAoAlterarMedida,
  deslocamentoGizmoNoEixoM,
  eixoDoGizmo,
  snapProfundidadeNoVizinho,
} from './gizmoComponenteOps.ts';

function alvo(rotation = 0, mirrored = false, extra: Partial<AlvoComponente3D> = {}): AlvoComponente3D {
  return {
    id: 'c1',
    x: 0,
    y: 0,
    z: 0,
    rotation,
    mirrored,
    caixa: { min: [0, 0, 0], max: [0.8, 0.6, 0.9] },
    editavelL: true,
    editavelA: true,
    editavelP: true,
    Lmm: 800,
    Amm: 900,
    Pmm: 600,
    ...extra,
  };
}

function componente(id: string, extra: Partial<Component> = {}): Component {
  return {
    id,
    kind: 'component',
    familyId: FAMILIA_ARMARIO.id,
    typeId: 'A80',
    levelId: 'lv_0',
    order: 0,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: '',
    ...extra,
  };
}

function projetoCom(...componentes: Component[]): Project {
  const p = createEmptyProject('t');
  p.componentFamilies = { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) };
  for (const c of componentes) p.elements[c.id] = c;
  p.nextOrder = componentes.length + 1;
  return p;
}

function fundoNoMundo(x: number, y: number, rotation: number, pMm: number): { x: number; y: number } {
  const pM = pMm / 1000;
  return {
    x: x - pM * Math.sin(rotation),
    y: y + pM * Math.cos(rotation),
  };
}

function frenteNoMundo(x: number, y: number, rotation: number, minYLocal = 0): { x: number; y: number } {
  return {
    x: x - minYLocal * Math.sin(rotation),
    y: y + minYLocal * Math.cos(rotation),
  };
}

describe('gizmoComponenteOps (eixos e deslize linear)', () => {
  it('calcula eixo local correto para dim_L, mover_x, mover_y e dim_A', () => {
    const rot90 = Math.PI / 2;
    const eL = eixoDoGizmo(alvo(rot90), 'dim_L');
    expect(eL.x).toBeCloseTo(0, 6);
    expect(eL.y).toBeCloseTo(1, 6);

    const eMx = eixoDoGizmo(alvo(rot90), 'mover_x');
    expect(eMx.x).toBeCloseTo(0, 6);
    expect(eMx.y).toBeCloseTo(-1, 6);

    const eMy = eixoDoGizmo(alvo(0), 'mover_y');
    expect(eMy.x).toBeCloseTo(0, 6);
    expect(eMy.y).toBeCloseTo(-1, 6);

    expect(eixoDoGizmo(alvo(0), 'dim_A')).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('quantiza deslocamento no eixo no passo de 10 mm ou 1 mm', () => {
    const eixo = { x: 1, y: 0, z: 0 };
    expect(deslocamentoGizmoNoEixoM(eixo, { x: 0, y: 0, z: 0 }, { x: 0.124, y: 0.5, z: 0 }, 10)).toBeCloseTo(0.12, 6);
    expect(deslocamentoGizmoNoEixoM(eixo, { x: 0, y: 0, z: 0 }, { x: 0.124, y: 0.5, z: 0 }, 1)).toBeCloseTo(0.124, 6);
  });
});

describe('dim_P: compensação de posição, snap no vizinho e alinhamento múltiplo', () => {
  it('puxar dim_P mantém o fundo fixo na parede e avança a frente na direção da seta em qualquer rotação', () => {
    for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 6]) {
      const a = alvo(rot, rot === Math.PI / 2, { x: 2.5, y: 1.8, Pmm: 600 });
      const fundoAntes = fundoNoMundo(a.x, a.y, a.rotation, 600);
      const frenteAntes = frenteNoMundo(a.x, a.y, a.rotation);

      const pos = compensarPosicaoAoAlterarMedida(a, 'dim_P', 600, 750);
      const fundoDepois = fundoNoMundo(pos.x, pos.y, a.rotation, 750);
      const frenteDepois = frenteNoMundo(pos.x, pos.y, a.rotation);

      expect(fundoDepois.x).toBeCloseTo(fundoAntes.x, 6);
      expect(fundoDepois.y).toBeCloseTo(fundoAntes.y, 6);

      const dir = eixoDoGizmo(a, 'dim_P');
      expect(frenteDepois.x - frenteAntes.x).toBeCloseTo(dir.x * 0.15, 6);
      expect(frenteDepois.y - frenteAntes.y).toBeCloseTo(dir.y * 0.15, 6);
    }
  });

  it('dim_L e dim_A não deslocam a origem do componente', () => {
    const a = alvo(Math.PI / 3, false, { x: 1.2, y: 3.4 });
    expect(compensarPosicaoAoAlterarMedida(a, 'dim_L', 800, 1000)).toEqual({ x: 1.2, y: 3.4 });
    expect(compensarPosicaoAoAlterarMedida(a, 'dim_A', 900, 1100)).toEqual({ x: 1.2, y: 3.4 });
  });

  it('faz snap de dim_P na linha frontal de vizinho paralelo dentro de 8 cm', () => {
    // c1 (P=500, fundo em y=0.6 -> y=0.1) ao lado de c2 (P=600, fundo em y=0.6 -> y=0)
    const p = projetoCom(
      componente('c1', { x: 0, y: 0.1, values: { P: 500 } }),
      componente('c2', { x: 1.0, y: 0, values: { P: 600 } }),
      componente('c3', { x: 2.0, y: -0.2, rotation: Math.PI / 2, values: { P: 600 } }),
    );
    const a1 = alvoComponente3D(p, 'c1')!;
    const vizinhos = corposDoNivel(p, 'lv_0', new Set(['c1']));

    // Dentro de 8 cm (560 mm está a 4 cm da frente do vizinho -> 600 mm)
    expect(snapProfundidadeNoVizinho(a1, 500, 560, vizinhos)).toBe(600);
    // Exatos 8 cm (520 mm -> 600 mm)
    expect(snapProfundidadeNoVizinho(a1, 500, 520, vizinhos)).toBe(600);
    // Fora de 8 cm (510 mm está a 9 cm)
    expect(snapProfundidadeNoVizinho(a1, 500, 510, vizinhos)).toBe(510);
  });

  it('alinha múltiplos componentes selecionados à frente do primeiro mantendo os fundos na parede', () => {
    // Todos com fundo na parede y = 0.7; c1 tem P=700 (y=0), c2 tem P=500 (y=0.2), c3 tem P=600 (y=0.1)
    const p = projetoCom(
      componente('c1', { x: 0, y: 0, values: { P: 700 }, order: 1 }),
      componente('c2', { x: 1.0, y: 0.2, values: { P: 500 }, order: 2 }),
      componente('c3', { x: 2.0, y: 0.1, values: { P: 600 }, order: 3 }),
    );

    const patches = alinharFrenteEProfundidade(p, ['c1', 'c2', 'c3']);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({ id: 'c2', patch: { x: 1.0, y: 0, values: { P: 700 } } });
    expect(patches[1]).toEqual({ id: 'c3', patch: { x: 2.0, y: 0, values: { P: 700 } } });

    // Fundos continuam em y = 0.7
    expect(fundoNoMundo(patches[0]!.patch.x, patches[0]!.patch.y, 0, 700).y).toBeCloseTo(0.7, 6);
    expect(fundoNoMundo(patches[1]!.patch.x, patches[1]!.patch.y, 0, 700).y).toBeCloseTo(0.7, 6);
  });

  it('alinha um único componente selecionado ao vizinho paralelo mais próximo', () => {
    const p = projetoCom(
      componente('c1', { x: 0, y: 0.1, values: { P: 500 }, order: 1 }),
      componente('viz_perto', { x: 0.9, y: 0, values: { P: 600 }, order: 2 }),
      componente('viz_longe', { x: 5.0, y: -0.1, values: { P: 700 }, order: 3 }),
    );

    const patches = alinharFrenteEProfundidade(p, ['c1']);
    expect(patches).toEqual([
      { id: 'c1', patch: { x: 0, y: 0, values: { P: 600 } } },
    ]);
  });
});
