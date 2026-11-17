import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject } from '@hestia/model';
import type { FatiaMassaProjeto } from './massaServico.ts';
import { derivarContornosPisosDaMassa, simplificarAnel, TOLERANCIA_PISO_PADRAO, uniaoDeAneis } from './massaDerivaPisos.ts';

/** Área (em módulo) de um anel. */
function area(anel: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % anel.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

const circulo = (n: number, r: number, cx = 0, cy = 0): Vec2[] =>
  Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));

/** Retângulo de `comp` × `larg` com o eixo maior apontando a `ang`, centro em (cx, cy). */
function retangulo(cx: number, cy: number, ang: number, comp: number, larg: number): Vec2[] {
  const u = { x: Math.cos(ang), y: Math.sin(ang) };
  const v = { x: -u.y, y: u.x };
  const pt = (s: number, t: number): Vec2 => ({ x: cx + s * u.x + t * v.x, y: cy + s * u.y + t * v.y });
  return [pt(-comp / 2, -larg / 2), pt(comp / 2, -larg / 2), pt(comp / 2, larg / 2), pt(-comp / 2, larg / 2)];
}

const fatia = (massaId: string, copia: number, nivelId: string, pontos: Vec2[]): FatiaMassaProjeto => ({
  massaId,
  copia,
  nivelId,
  area: area(pontos),
  perimetro: 0,
  z: 0,
  pontos,
});

/** Fonte simulada do serviço: devolve TODAS as fatias, como `fatias(p)` do kernel (ou `null` para simular o kernel desligado). */
const fonteDe = (todas: FatiaMassaProjeto[], ligada = true) => ({
  fatias: (): FatiaMassaProjeto[] | null => (ligada ? todas : null),
});

const p = createEmptyProject();

describe('simplificação de contorno (Douglas-Peucker, tolerância de A.7)', () => {
  it('círculo de 64 pontos de raio 1 m com 5 mm: reduz vértices e preserva a área dentro de 0,5%', () => {
    const original = circulo(64, 1);
    const simples = simplificarAnel(original, TOLERANCIA_PISO_PADRAO);
    expect(simples.length).toBeLessThan(original.length);
    expect(Math.abs(area(simples) - area(original)) / area(original)).toBeLessThan(0.005);
  });

  it('círculo de 64 pontos de raio 5 m: a corda de um passo tem 6 mm, então 5 mm não tira vértice nenhum', () => {
    const original = circulo(64, 5);
    expect(simplificarAnel(original, TOLERANCIA_PISO_PADRAO)).toHaveLength(64);
  });

  it('pontos colineares de uma aresta somem e a área fica igual', () => {
    const quadro: Vec2[] = [];
    for (let i = 0; i < 16; i++) quadro.push({ x: i / 4, y: 0 });
    for (let i = 0; i < 16; i++) quadro.push({ x: 4, y: i / 4 });
    for (let i = 0; i < 16; i++) quadro.push({ x: 4 - i / 4, y: 4 });
    for (let i = 0; i < 16; i++) quadro.push({ x: 0, y: 4 - i / 4 });
    const simples = simplificarAnel(quadro, TOLERANCIA_PISO_PADRAO);
    expect(simples).toHaveLength(4);
    expect(area(simples)).toBeCloseTo(16, 9);
  });

  it('tolerância zero ou negativa devolve o anel sem mudar', () => {
    const original = circulo(32, 2);
    expect(simplificarAnel(original, 0)).toHaveLength(32);
    expect(simplificarAnel(original, -1)).toHaveLength(32);
  });
});

describe('união das cópias (M5: a pétala em arranjo)', () => {
  it('cópias que se sobrepõem viram UM componente com área menor que a soma', () => {
    const a = retangulo(0, 0, 0, 4, 2);
    const b = retangulo(1, 0, 0, 4, 2);
    const u = uniaoDeAneis([a, b]);
    expect(u).toHaveLength(1);
    const soma = area(a) + area(b);
    const areaUniao = area(u[0]![0]!);
    expect(areaUniao).toBeLessThan(soma);
    expect(areaUniao).toBeGreaterThan(area(a));
  });

  it('12 cópias que se tocam formando anel fechado dão UM componente com furo central', () => {
    const copias = Array.from({ length: 12 }, (_, i) => {
      const ang = (i * Math.PI) / 6;
      return retangulo(4 * Math.cos(ang), 4 * Math.sin(ang), ang, 3, 3);
    });
    const u = uniaoDeAneis(copias);
    expect(u).toHaveLength(1);
    expect(u[0]).toHaveLength(2);
  });

  it('cópias que não se tocam dão um componente por cópia (um piso por componente)', () => {
    const copias = Array.from({ length: 12 }, (_, i) => {
      const ang = (i * Math.PI) / 6;
      return retangulo(6 * Math.cos(ang), 6 * Math.sin(ang), ang, 1, 1);
    });
    expect(uniaoDeAneis(copias)).toHaveLength(12);
  });
});

describe('derivação por nível (fonte simulada)', () => {
  it('une as 12 cópias da massa no nível, ignora as fatias de outra massa e simplifica', () => {
    const pts = circulo(64, 1, 0, 0);
    const copias = Array.from({ length: 12 }, (_, i) => {
      const ang = (i * Math.PI) / 6;
      return fatia('m5p', i, 'lv_a', pts.map((q) => ({ x: q.x + 6 * Math.cos(ang), y: q.y + 6 * Math.sin(ang) })));
    });
    const outra = fatia('m5', 0, 'lv_a', circulo(16, 1));
    const r = derivarContornosPisosDaMassa(p, 'm5p', ['lv_a'], TOLERANCIA_PISO_PADRAO, fonteDe([...copias, outra]));
    expect(r).not.toBeNull();
    expect(r!.semFatia).toEqual([]);
    expect(r!.porNivel).toHaveLength(1);
    expect(r!.porNivel[0]!.poligonos).toHaveLength(12);
    for (const poli of r!.porNivel[0]!.poligonos) expect(poli[0]!.length).toBeLessThan(64);
  });

  it('nível sem fatia da massa é ignorado e vem listado em semFatia', () => {
    const r = derivarContornosPisosDaMassa(p, 'm1', ['lv_a', 'lv_fora'], TOLERANCIA_PISO_PADRAO, fonteDe([fatia('m1', 0, 'lv_a', retangulo(0, 0, 0, 2, 2))]));
    expect(r!.porNivel.map((n) => n.nivelId)).toEqual(['lv_a']);
    expect(r!.semFatia).toEqual(['lv_fora']);
  });

  it('cada nível pega só as fatias que caem nele (o kernel devolve todos os níveis de uma vez)', () => {
    const todas = [
      fatia('m1', 0, 'lv_a', retangulo(0, 0, 0, 2, 2)),
      fatia('m1', 0, 'lv_b', retangulo(0, 0, 0, 3, 3)),
      fatia('m1', 1, 'lv_b', retangulo(9, 0, 0, 3, 3)),
    ];
    const r = derivarContornosPisosDaMassa(p, 'm1', ['lv_b'], TOLERANCIA_PISO_PADRAO, fonteDe(todas));
    expect(r!.porNivel.map((n) => n.nivelId)).toEqual(['lv_b']);
    expect(r!.porNivel[0]!.poligonos).toHaveLength(2);
  });

  it('sem kernel (fonte devolve null) devolve null sem lançar', () => {
    expect(derivarContornosPisosDaMassa(p, 'm1', ['lv_a'], TOLERANCIA_PISO_PADRAO, fonteDe([], false))).toBeNull();
  });

  it('fatia degenerada (menos de 3 pontos) não vira contorno', () => {
    const r = derivarContornosPisosDaMassa(p, 'm1', ['lv_a'], TOLERANCIA_PISO_PADRAO, fonteDe([fatia('m1', 0, 'lv_a', [{ x: 0, y: 0 }, { x: 1, y: 0 }])]));
    expect(r!.porNivel[0]!.poligonos).toEqual([]);
  });
});
