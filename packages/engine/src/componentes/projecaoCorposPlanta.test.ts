import { describe, expect, it } from 'vitest';
import { matrizDoComponente } from '@hestia/model';
import type { CorpoResolvido, FormaCorpoResolvida, PerfilResolvido } from './corposTipos.ts';
import { projetarCorposPlanta } from './projecaoCorposPlanta.ts';

/** Círculo anti-horário de `lados` lados e raio `r` (m), como o resolvedor de perfis entrega. */
function circulo(r: number, lados = 32): PerfilResolvido {
  const externo: number[] = [];
  for (let i = 0; i < lados; i++) {
    const a = (2 * Math.PI * i) / lados;
    externo.push(r * Math.cos(a), r * Math.sin(a));
  }
  return { externo, furos: [] };
}

const IDENTIDADE = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Gira +90° em torno de Y: o eixo Z do corpo passa a apontar para +X da família. */
const Z_PARA_X = [0, 0, 1, 0, 1, 0, -1, 0, 0];

function corpo(forma: FormaCorpoResolvida, extra: Partial<CorpoResolvido> = {}): CorpoResolvido {
  return {
    id: 'c',
    nome: 'c',
    indice: 1,
    papel: 'generico' as CorpoResolvido['papel'],
    forma,
    origem: [0, 0, 0],
    rotacao: IDENTIDADE,
    vazio: false,
    material: null,
    detalhe3d: null,
    vistas: null,
    grupo: null,
    ...extra,
  };
}

/** Área (shoelace, positiva) de um polígono em pares x,y planos. */
function area(p: number[]): number {
  let s = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!;
  }
  return Math.abs(s / 2);
}

function caixa(p: number[]): [number, number, number, number] {
  const xs = p.filter((_, i) => i % 2 === 0);
  const ys = p.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

describe('projetarCorposPlanta (B3)', () => {
  it('tubo reto Ø50 × 1 m deitado em X dá um retângulo 1 × 0,05', () => {
    const tubo = corpo({ tipo: 'extrusao', perfil: circulo(0.025), comprimento: 1 }, { rotacao: Z_PARA_X });
    const r = projetarCorposPlanta([tubo], 'medium');
    expect(r).toHaveLength(1);
    const [x0, y0, x1, y1] = caixa(r[0]!);
    expect(x1 - x0).toBeCloseTo(1, 3);
    expect(y1 - y0).toBeCloseTo(0.05, 3);
    expect(area(r[0]!)).toBeCloseTo(0.05, 3);
  });

  it('cotovelo em L: área da silhueta perto de 2 × (0,5 × 0,05), sem o canto duplicado', () => {
    const pontos = [0, 0, 0, 0.5, 0, 0, 0.5, 0.5, 0];
    const cotovelo = corpo({ tipo: 'varredura', perfil: circulo(0.025), caminho: { pontos, vertices: [0, 3, 6] } });
    const r = projetarCorposPlanta([cotovelo], 'fine');
    expect(r).toHaveLength(1);
    expect(area(r[0]!)).toBeGreaterThan(0.05 * 0.95);
    expect(area(r[0]!)).toBeLessThan(0.05 * 1.05);
  });

  it('cilindro em pé vira polígono de 32 lados com a área esperada', () => {
    const r0 = 0.1;
    const cil = corpo({ tipo: 'extrusao', perfil: circulo(r0), comprimento: 0.3 });
    const r = projetarCorposPlanta([cil], 'medium');
    expect(r).toHaveLength(1);
    expect(r[0]!.length / 2).toBe(32);
    expect(area(r[0]!)).toBeCloseTo(0.5 * 32 * r0 * r0 * Math.sin((2 * Math.PI) / 32), 6);
  });

  it('corpo só com vistas corte não aparece; vazio e grosso também não', () => {
    const forma: FormaCorpoResolvida = { tipo: 'extrusao', perfil: circulo(0.05), comprimento: 0.2 };
    expect(projetarCorposPlanta([corpo(forma, { vistas: ['corte'] })], 'fine')).toEqual([]);
    expect(projetarCorposPlanta([corpo(forma, { vazio: true })], 'fine')).toEqual([]);
    expect(projetarCorposPlanta([corpo(forma)], 'coarse')).toEqual([]);
    expect(projetarCorposPlanta([corpo(forma, { vistas: ['planta', 'corte'] })], 'fine')).toHaveLength(1);
  });

  it('detalhe3d fino só aparece no nível fino', () => {
    const forma: FormaCorpoResolvida = { tipo: 'extrusao', perfil: circulo(0.05), comprimento: 0.2 };
    const c = corpo(forma, { detalhe3d: ['fino'] });
    expect(projetarCorposPlanta([c], 'medium')).toEqual([]);
    expect(projetarCorposPlanta([c], 'fine')).toHaveLength(1);
  });

  it('tubo em pé inclinado 90° em Y, com a matriz da instância, dá o retângulo 1 × 0,05 no mundo (B3b)', () => {
    const tuboEmPe = corpo({ tipo: 'extrusao', perfil: circulo(0.025), comprimento: 1 });
    const m = matrizDoComponente({ x: 0, y: 0, z: 0, rotation: 0, mirrored: false, inclinacao: [Math.PI / 2, 0] });
    const r = projetarCorposPlanta([tuboEmPe], 'medium', m);
    expect(r).toHaveLength(1);
    const [x0, y0, x1, y1] = caixa(r[0]!);
    expect(x0).toBeCloseTo(0, 3);
    expect(x1 - x0).toBeCloseTo(1, 3);
    expect(y1 - y0).toBeCloseTo(0.05, 3);
    expect(area(r[0]!)).toBeCloseTo(0.05, 3);
  });

  it('sem matriz o tubo em pé segue no sistema da família: caixa 0,05 × 0,05', () => {
    const tuboEmPe = corpo({ tipo: 'extrusao', perfil: circulo(0.025), comprimento: 1 });
    const [x0, y0, x1, y1] = caixa(projetarCorposPlanta([tuboEmPe], 'medium')[0]!);
    expect(x1 - x0).toBeCloseTo(0.05, 3);
    expect(y1 - y0).toBeCloseTo(0.05, 3);
  });
});
