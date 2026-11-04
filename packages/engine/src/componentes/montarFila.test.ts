import { applyCommand, createEmptyProject, FAMILIA_ARMARIO, type Command, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { retanguloNoMundo } from './encaixeColisao.ts';
import type { CaixaLocal, Pose } from './encaixeTipos.ts';
import { resolverComponente } from './instancia.ts';
import { larguraDoModulo, montarFila, type PedidoDeFila } from './montarFila.ts';

const TOL = 9;
const PROFUNDIDADE = 0.56;
const ALTURA = 0.72;

/** `applyCommand` altera o projeto no lugar; aqui trabalhamos em cópias. */
function aplicar(p: Project, c: Command): Project {
  const q = structuredClone(p);
  applyCommand(q, c);
  return q;
}

function projeto(): Project {
  return aplicar(createEmptyProject('fila'), { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
}

function pedido(extra: Partial<PedidoDeFila> = {}): PedidoDeFila {
  return {
    levelId: 'lv_0',
    face: { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
    inicio: 0,
    comprimento: 2,
    modulos: [
      { familyId: FAMILIA_ARMARIO.id, typeId: 'A60' },
      { familyId: FAMILIA_ARMARIO.id, typeId: 'A80' },
      { familyId: FAMILIA_ARMARIO.id, typeId: 'A60' },
    ],
    preencher: false,
    idBase: 'fila1',
    ...extra,
  };
}

function caixa(largura: number): CaixaLocal {
  return { min: [0, 0, 0], max: [largura, PROFUNDIDADE, ALTURA] };
}

function poseDe(c: Omit<Component, 'order'>): Pose {
  return { x: c.x, y: c.y, z: c.z, rotation: c.rotation, mirrored: c.mirrored };
}

function extremos(c: Omit<Component, 'order'>, largura: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const cantos = retanguloNoMundo(poseDe(c), caixa(largura));
  return {
    minX: Math.min(...cantos.map((q) => q.x)),
    maxX: Math.max(...cantos.map((q) => q.x)),
    minY: Math.min(...cantos.map((q) => q.y)),
    maxY: Math.max(...cantos.map((q) => q.y)),
  };
}

describe('larguraDoModulo', () => {
  it('devolve a largura do tipo e a faixa de L em metros', () => {
    const p = projeto();
    const a60 = larguraDoModulo(p, FAMILIA_ARMARIO.id, 'A60');
    expect(a60).not.toBeNull();
    expect(a60!.largura).toBeCloseTo(0.6, TOL);
    expect(a60!.min).toBeCloseTo(0.3, TOL);
    expect(a60!.max).toBeCloseTo(1.2, TOL);
    expect(larguraDoModulo(p, FAMILIA_ARMARIO.id, 'A80')!.largura).toBeCloseTo(0.8, TOL);
  });
  it('sem faixa em L, min e max valem a própria largura', () => {
    const familia = structuredClone(FAMILIA_ARMARIO);
    const largura = familia.parametros.find((q) => q.id === 'L')!;
    delete largura.min;
    delete largura.max;
    const p = aplicar(createEmptyProject('fila'), { type: 'upsertFamily', family: familia });
    const medidas = larguraDoModulo(p, FAMILIA_ARMARIO.id, 'A60');
    expect(medidas!.min).toBeCloseTo(0.6, TOL);
    expect(medidas!.max).toBeCloseTo(0.6, TOL);
  });
  it('família ausente do projeto devolve null', () => {
    expect(larguraDoModulo(projeto(), 'nao_existe', null)).toBeNull();
  });
});

describe('montarFila', () => {
  it('face horizontal: larguras do tipo, sem painel, fundo na face e frente para o lado livre', () => {
    const r = montarFila(projeto(), pedido());
    expect(r.avisos).toEqual([]);
    expect(r.componentes).toHaveLength(3);
    expect(r.larguras).toHaveLength(3);
    expect(r.larguras[0]).toBeCloseTo(0.6, TOL);
    expect(r.larguras[1]).toBeCloseTo(0.8, TOL);
    expect(r.larguras[2]).toBeCloseTo(0.6, TOL);
    expect(r.painel).toBeCloseTo(0, TOL);
    expect(r.sobra).toBeCloseTo(0, TOL);
    const trechos: Array<[number, number]> = [[0, 0.6], [0.6, 1.4], [1.4, 2.0]];
    r.componentes.forEach((c, i) => {
      const e = extremos(c, r.larguras[i]!);
      expect(e.minY).toBeCloseTo(0, TOL);
      expect(e.maxY).toBeCloseTo(PROFUNDIDADE, TOL);
      expect(e.minX).toBeCloseTo(trechos[i]![0], TOL);
      expect(e.maxX).toBeCloseTo(trechos[i]![1], TOL);
    });
    expect(r.grupo.id).toBe('fila1');
    expect(r.grupo.nome).toBe('Fila');
    expect(r.grupo.levelId).toBe('lv_0');
    expect(r.grupo.membros).toEqual(['fila1_1', 'fila1_2', 'fila1_3']);
    expect(r.grupo.linha?.a.x).toBeCloseTo(0, TOL);
    expect(r.grupo.linha?.a.y).toBeCloseTo(0, TOL);
    expect(r.grupo.linha?.b.x).toBeCloseTo(2, TOL);
    expect(r.grupo.linha?.b.y).toBeCloseTo(0, TOL);
    expect(r.grupo.regras).toEqual(['alinhar-frente']);
    expect(r.componentes.every((c) => c.mark === '' && c.z === 0)).toBe(true);
    expect(r.componentes.every((c) => c.values === undefined)).toBe(true);
  });

  it('inicio desloca a fila ao longo da face', () => {
    const r = montarFila(projeto(), pedido({ inicio: 0.5 }));
    expect(r.grupo.linha?.a.x).toBeCloseTo(0.5, TOL);
    expect(r.grupo.linha?.b.x).toBeCloseTo(2.5, TOL);
    const primeiro = extremos(r.componentes[0]!, r.larguras[0]!);
    expect(primeiro.minX).toBeCloseTo(0.5, TOL);
    const ultimo = extremos(r.componentes[2]!, r.larguras[2]!);
    expect(ultimo.maxX).toBeCloseTo(2.5, TOL);
  });

  it('preencher redistribui a diferença dentro da faixa de L e grava values.L', () => {
    const r = montarFila(projeto(), pedido({ comprimento: 2.2, preencher: true }));
    expect(r.avisos).toEqual([]);
    expect(r.painel).toBeCloseTo(0, TOL);
    expect(r.sobra).toBeCloseTo(0, TOL);
    const soma = r.larguras.reduce((total, largura) => total + largura, 0);
    expect(soma).toBeCloseTo(2.2, TOL);
    r.larguras.forEach((largura) => {
      expect(largura).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(largura).toBeLessThanOrEqual(1.2 + 1e-9);
    });
    r.componentes.forEach((c, i) => {
      expect(Number(c.values?.['L'])).toBeCloseTo(r.larguras[i]! * 1000, TOL);
    });
  });

  it('preencher sem faixa máxima suficiente deixa sobra e avisa', () => {
    const r = montarFila(projeto(), pedido({ comprimento: 5, preencher: true }));
    expect(r.avisos.length).toBeGreaterThan(0);
    expect(Math.max(r.painel, r.sobra)).toBeGreaterThan(0);
    r.larguras.forEach((largura) => expect(largura).toBeCloseTo(1.2, TOL));
  });

  it('sobra dentro da faixa de painel vira painel, sem aviso', () => {
    const r = montarFila(projeto(), pedido({ comprimento: 3.7, preencher: true }));
    expect(r.painel).toBeCloseTo(0.1, TOL);
    expect(r.sobra).toBeCloseTo(0, TOL);
    expect(r.avisos).toEqual([]);
  });

  it('família inexistente: avisa, ignora o módulo e mantém os demais', () => {
    const r = montarFila(projeto(), pedido({
      modulos: [
        { familyId: 'fam_inexistente', typeId: null },
        { familyId: FAMILIA_ARMARIO.id, typeId: 'A60' },
        { familyId: FAMILIA_ARMARIO.id, typeId: 'A80' },
      ],
    }));
    expect(r.avisos).toHaveLength(1);
    expect(r.componentes.map((c) => c.id)).toEqual(['fila1_1', 'fila1_2']);
    expect(r.grupo.membros).toEqual(['fila1_1', 'fila1_2']);
    expect(r.larguras[0]).toBeCloseTo(0.6, TOL);
    expect(r.larguras[1]).toBeCloseTo(0.8, TOL);
  });

  it('comprimento zero, sem módulos ou face degenerada devolvem resultado vazio com aviso', () => {
    const zero = montarFila(projeto(), pedido({ comprimento: 0 }));
    expect(zero.componentes).toEqual([]);
    expect(zero.larguras).toEqual([]);
    expect(zero.avisos.length).toBeGreaterThan(0);
    const semModulos = montarFila(projeto(), pedido({ modulos: [] }));
    expect(semModulos.componentes).toEqual([]);
    expect(semModulos.avisos.length).toBeGreaterThan(0);
    const degenerada = montarFila(projeto(), pedido({ face: { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } } }));
    expect(degenerada.componentes).toEqual([]);
    expect(degenerada.avisos.length).toBeGreaterThan(0);
  });

  it('face vertical: fundo em x = 0 e frente em x = −profundidade', () => {
    const r = montarFila(projeto(), pedido({ face: { a: { x: 0, y: 0 }, b: { x: 0, y: 4 } } }));
    const e = extremos(r.componentes[0]!, r.larguras[0]!);
    expect(e.maxX).toBeCloseTo(0, TOL);
    expect(e.minX).toBeCloseTo(-PROFUNDIDADE, TOL);
    expect(e.minY).toBeCloseTo(0, TOL);
    expect(e.maxY).toBeCloseTo(0.6, TOL);
  });

  it('é determinística: mesma entrada, mesma saída', () => {
    const p = projeto();
    const a = montarFila(p, pedido({ comprimento: 2.2, preencher: true }));
    const b = montarFila(p, pedido({ comprimento: 2.2, preencher: true }));
    expect(b).toEqual(a);
  });

  it('o resultado aplicado ao projeto fica válido e resolve sem erros', () => {
    let q = projeto();
    const r = montarFila(q, pedido({ comprimento: 2.2, preencher: true }));
    for (const componente of r.componentes) q = aplicar(q, { type: 'addComponent', component: componente });
    q = aplicar(q, { type: 'upsertComponentGroup', group: r.grupo });
    const grupo = q.componentGroups?.[r.grupo.id];
    expect(grupo).toBeDefined();
    expect(grupo!.membros).toEqual(r.grupo.membros);
    for (const id of grupo!.membros) {
      const e = q.elements[id];
      expect(e?.kind).toBe('component');
      if (e?.kind !== 'component') continue;
      expect(e.groupId).toBe(r.grupo.id);
      expect(resolverComponente(q, e).erros).toEqual([]);
    }
  });
});
