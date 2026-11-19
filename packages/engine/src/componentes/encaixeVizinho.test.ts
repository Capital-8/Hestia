import { describe, expect, it } from 'vitest';
import type { CaixaLocal, Corpo, Pose } from './encaixeTipos.ts';
import { encaixarNoVizinho, guiasDeAlinhamento } from './encaixeVizinho.ts';

const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 0.72] };

const pose = (x: number, y: number, rotation = 0, z = 0, mirrored = false): Pose => ({ x, y, rotation, z, mirrored });
const corpo = (id: string, p: Pose, caixa: CaixaLocal = CAIXA): Corpo => ({ id, pose: p, caixa });

describe('encaixarNoVizinho', () => {
  it('encosta a lateral esquerda do móvel à direita do vizinho e alinha a frente', () => {
    const r = encaixarNoVizinho(pose(0.63, 0.02, 0.05), CAIXA, [corpo('A', pose(0, 0))]);
    expect(r).not.toBeNull();
    expect(r!.pose.rotation).toBeCloseTo(0, 9);
    expect(r!.pose.x).toBeCloseTo(0.6, 9);
    expect(r!.pose.y).toBeCloseTo(0, 9);
    expect(r!.lado).toBe('esquerda');
    expect(r!.folga).toBeCloseTo(0, 9);
    expect(r!.vizinho).toBe('A');
  });

  it('encosta a lateral direita do móvel à esquerda do vizinho', () => {
    const r = encaixarNoVizinho(pose(-0.63, 0.02, -0.05), CAIXA, [corpo('A', pose(0, 0))]);
    expect(r).not.toBeNull();
    expect(r!.pose.rotation).toBeCloseTo(0, 9);
    expect(r!.pose.x).toBeCloseTo(-0.6, 9);
    expect(r!.pose.y).toBeCloseTo(0, 9);
    expect(r!.lado).toBe('direita');
    expect(r!.vizinho).toBe('A');
  });

  it('respeita a folga pedida', () => {
    const r = encaixarNoVizinho(pose(0.63, 0.02, 0.05), CAIXA, [corpo('A', pose(0, 0))], { folga: 0.002 });
    expect(r).not.toBeNull();
    expect(r!.pose.x).toBeCloseTo(0.602, 9);
    expect(r!.pose.y).toBeCloseTo(0, 9);
    expect(r!.folga).toBeCloseTo(0.002, 9);
  });

  it('recusa lateral fora de distanciaMax e aceita dentro dele', () => {
    expect(encaixarNoVizinho(pose(0.8, 0.02), CAIXA, [corpo('A', pose(0, 0))])).toBeNull();
    const r = encaixarNoVizinho(pose(0.8, 0.02), CAIXA, [corpo('A', pose(0, 0))], { distanciaMax: 0.25 });
    expect(r).not.toBeNull();
    expect(r!.pose.x).toBeCloseTo(0.6, 9);
    expect(r!.lado).toBe('esquerda');
  });

  it('alinhou o móvel a um vizinho girado de π/2', () => {
    const r = encaixarNoVizinho(pose(0, 0.63, Math.PI / 2 + 0.05), CAIXA, [corpo('A', pose(0, 0, Math.PI / 2))]);
    expect(r).not.toBeNull();
    expect(r!.pose.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(r!.pose.x).toBeCloseTo(0, 9);
    expect(r!.pose.y).toBeCloseTo(0.6, 9);
    expect(r!.lado).toBe('esquerda');
  });

  it('recusa rotação a 30° de um múltiplo de 90°', () => {
    expect(encaixarNoVizinho(pose(0.63, 0.02, Math.PI / 6), CAIXA, [corpo('A', pose(0, 0))])).toBeNull();
  });

  it('ignora vizinho sem mesma base nem sobreposição em altura', () => {
    expect(encaixarNoVizinho(pose(0.63, 0.02), CAIXA, [corpo('A', pose(0, 0, 0, 1.5))])).toBeNull();
  });

  it('considera vizinho que se sobrepõe em altura', () => {
    const r = encaixarNoVizinho(pose(0.63, 0.02), CAIXA, [corpo('A', pose(0, 0, 0, 0.5))]);
    expect(r).not.toBeNull();
    expect(r!.pose.x).toBeCloseTo(0.6, 9);
    expect(r!.pose.z).toBeCloseTo(0, 9);
  });

  it('escolhe o vizinho de menor distância', () => {
    const r = encaixarNoVizinho(pose(0.63, 0.02), CAIXA, [corpo('z', pose(0, 0)), corpo('a', pose(1.31, 0))]);
    expect(r).not.toBeNull();
    expect(r!.vizinho).toBe('z');
    expect(r!.pose.x).toBeCloseTo(0.6, 9);
  });

  it('no empate de distância escolhe o menor id', () => {
    const r = encaixarNoVizinho(pose(0.63, 0.02), CAIXA, [corpo('z', pose(0, 0)), corpo('a', pose(1.26, 0))]);
    expect(r).not.toBeNull();
    expect(r!.vizinho).toBe('a');
    expect(r!.pose.x).toBeCloseTo(0.66, 9);
    expect(r!.lado).toBe('direita');
  });

  it('mantém o espelho do móvel e usa a lateral física correspondente', () => {
    const r = encaixarNoVizinho(pose(1.23, 0.02, 0, 0, true), CAIXA, [corpo('A', pose(0, 0))]);
    expect(r).not.toBeNull();
    expect(r!.pose.mirrored).toBe(true);
    expect(r!.pose.x).toBeCloseTo(1.2, 9);
    expect(r!.pose.y).toBeCloseTo(0, 9);
    expect(r!.lado).toBe('esquerda');
  });

  it('sem vizinhos devolve null', () => {
    expect(encaixarNoVizinho(pose(0.63, 0.02), CAIXA, [])).toBeNull();
  });
});

describe('guiasDeAlinhamento', () => {
  it('gera uma guia de frente que cobre os dois móveis', () => {
    const guias = guiasDeAlinhamento(pose(0.7, 0.005), CAIXA, [corpo('A', pose(0, 0))]);
    const daFrente = guias.filter((g) => g.tipo === 'frente');
    expect(daFrente).toHaveLength(1);
    const guia = daFrente[0]!;
    expect(guia.com).toBe('A');
    expect(Math.min(guia.a.x, guia.b.x)).toBeCloseTo(0, 9);
    expect(Math.max(guia.a.x, guia.b.x)).toBeCloseTo(1.3, 9);
    expect(guia.a.y).toBeCloseTo(0.005, 9);
    expect(guia.b.y).toBeCloseTo(0.005, 9);
  });

  it('não gera guia quando a frente passa da tolerância padrão', () => {
    expect(guiasDeAlinhamento(pose(0.7, 0.02), CAIXA, [corpo('A', pose(0, 0))])).toEqual([]);
  });

  it('não compara móveis com rotação não paralela', () => {
    expect(guiasDeAlinhamento(pose(0.7, 0, Math.PI / 6), CAIXA, [corpo('A', pose(0, 0))])).toEqual([]);
  });

  it('devolve as guias em ordem determinística por id e por tipo', () => {
    const guias = guiasDeAlinhamento(pose(0, 0), CAIXA, [corpo('b', pose(2, 0)), corpo('a', pose(1, 0))]);
    expect(guias.map((g) => `${g.com}:${g.tipo}`)).toEqual([
      'a:frente', 'a:fundo', 'a:centro-y',
      'b:frente', 'b:fundo', 'b:centro-y',
    ]);
  });

  it('sem outros móveis não devolve guias', () => {
    expect(guiasDeAlinhamento(pose(0, 0), CAIXA, [])).toEqual([]);
  });
});
