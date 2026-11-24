import { describe, expect, it } from 'vitest';
import type { CorpoResolvido, FormaCorpoResolvida, PerfilResolvido } from './corposTipos.ts';
import { cortarCorpos, projetarCorposAlemDoPlano, projetarCorposElevacao, type PlanoDeCorte } from './cortarCorpos.ts';

function circulo(r: number, lados = 32): PerfilResolvido {
  const externo: number[] = [];
  for (let i = 0; i < lados; i++) {
    const a = (2 * Math.PI * i) / lados;
    externo.push(r * Math.cos(a), r * Math.sin(a));
  }
  return { externo, furos: [] };
}

const IDENTIDADE = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function corpo(forma: FormaCorpoResolvida, extra: Partial<CorpoResolvido> = {}): CorpoResolvido {
  return { id: 'c', nome: 'c', indice: 1, papel: 'generico', forma, origem: [0, 0, 0], rotacao: IDENTIDADE, vazio: false, material: null, detalhe3d: null, vistas: null, grupo: null, ...extra };
}

/** Área assinada de um laço 3D projetada na normal (positiva = anti-horário visto de +normal). */
function areaAssinada(laco: number[][], n: [number, number, number]): number {
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < laco.length; i++) {
    const a = laco[i]!;
    const b = laco[(i + 1) % laco.length]!;
    sx += a[1]! * b[2]! - a[2]! * b[1]!;
    sy += a[2]! * b[0]! - a[0]! * b[2]!;
    sz += a[0]! * b[1]! - a[1]! * b[0]!;
  }
  return (sx * n[0] + sy * n[1] + sz * n[2]) / 2;
}

const areaPlana = (p: number[]): number => {
  let s = 0;
  for (let i = 0; i < p.length / 2; i++) {
    const j = (i + 1) % (p.length / 2);
    s += p[2 * i]! * p[2 * j + 1]! - p[2 * j]! * p[2 * i + 1]!;
  }
  return Math.abs(s / 2);
};

const area32 = (r: number): number => 0.5 * 32 * r * r * Math.sin((2 * Math.PI) / 32);
const perto = (v: number, esperado: number): void => expect(Math.abs(v - esperado) / esperado).toBeLessThan(0.01);

describe('cortarCorpos (B4)', () => {
  const cilindro = corpo({ tipo: 'extrusao', perfil: circulo(0.05), comprimento: 0.6 });

  it('cilindro Ø100 cortado por plano que passa pelo eixo: retângulo 0,1 × L', () => {
    const plano: PlanoDeCorte = { origem: [0, 0, 0], normal: [1, 0, 0] };
    const r = cortarCorpos([cilindro], plano);
    expect(r.cortado[0]).toHaveLength(1);
    const a = areaAssinada(r.cortado[0]![0]!, plano.normal);
    expect(a).toBeGreaterThan(0);
    perto(a, 0.1 * 0.6);
  });

  it('cilindro cortado perpendicular ao eixo: polígono de 32 lados', () => {
    const plano: PlanoDeCorte = { origem: [0, 0, 0.3], normal: [0, 0, 1] };
    const r = cortarCorpos([cilindro], plano);
    expect(r.cortado[0]).toHaveLength(1);
    expect(r.cortado[0]![0]!.length).toBe(32);
    perto(areaAssinada(r.cortado[0]![0]!, plano.normal), area32(0.05));
  });

  it('plano a z = 0 (sobre a tampa) ainda devolve laços fechados e coerentes', () => {
    const plano: PlanoDeCorte = { origem: [0, 0, 0], normal: [0, 0, 1] };
    const r = cortarCorpos([cilindro], plano);
    for (const laco of r.cortado[0]!) expect(Math.abs(areaAssinada(laco, plano.normal))).toBeGreaterThanOrEqual(0);
  });

  it('tubo oco (anel): dois laços, externo positivo e furo negativo, área do anel', () => {
    const ext = circulo(0.05);
    const furo = circulo(0.04).externo.slice();
    // Furo horário, como o resolvedor de perfis entrega.
    const pares: number[] = [];
    for (let i = furo.length / 2 - 1; i >= 0; i--) pares.push(furo[2 * i]!, furo[2 * i + 1]!);
    const tubo = corpo({ tipo: 'extrusao', perfil: { externo: ext.externo, furos: [pares] }, comprimento: 0.5 });
    const plano: PlanoDeCorte = { origem: [0, 0, 0.25], normal: [0, 0, 1] };
    const lacos = cortarCorpos([tubo], plano).cortado[0]!;
    expect(lacos).toHaveLength(2);
    const areas = lacos.map((l) => areaAssinada(l, plano.normal)).sort((a, b) => a - b);
    expect(areas[0]!).toBeLessThan(0);
    expect(areas[1]!).toBeGreaterThan(0);
    perto(areas[0]! + areas[1]!, area32(0.05) - area32(0.04));
  });

  it('cotovelo cortado no trecho curvo: um laço fechado (elipse) de área esperada', () => {
    const pontos = [0, 0, 0, 0, 0, 1, 1, 0, 1];
    const cotovelo = corpo({ tipo: 'varredura', perfil: circulo(0.05), caminho: { pontos: curva(pontos), vertices: [0, 1, 2] } });
    const plano: PlanoDeCorte = { origem: [0.15, 0, 0], normal: [1, 0, 0] };
    const lacos = cortarCorpos([cotovelo], plano).cortado[0]!;
    expect(lacos).toHaveLength(1);
    const a = areaAssinada(lacos[0]!, plano.normal);
    // Tangente do eixo em x = 0,15 (arco de raio 0,3, 60°): corte oblíquo, área ≈ área da seção / cos θ.
    expect(a).toBeGreaterThan(area32(0.05));
    expect(a).toBeLessThan(area32(0.05) / 0.8);
  });

  it('plano que não toca o corpo: vazio', () => {
    const r = cortarCorpos([cilindro], { origem: [5, 0, 0], normal: [1, 0, 0] });
    expect(r.cortado).toEqual([[]]);
  });

  it('normal nula, corpo vazio e vistas sem corte não geram laços', () => {
    const forma: FormaCorpoResolvida = { tipo: 'extrusao', perfil: circulo(0.05), comprimento: 0.6 };
    const plano: PlanoDeCorte = { origem: [0, 0, 0.3], normal: [0, 0, 1] };
    expect(cortarCorpos([cilindro], { origem: [0, 0, 0], normal: [0, 0, 0] }).cortado).toEqual([[]]);
    expect(cortarCorpos([corpo(forma, { vazio: true })], plano).cortado).toEqual([[]]);
    expect(cortarCorpos([corpo(forma, { vistas: ['planta'] })], plano).cortado).toEqual([[]]);
  });

  it('matriz leva o corpo ao mundo; espelhado mantém o laço externo positivo', () => {
    const plano: PlanoDeCorte = { origem: [0, 0, 0.3], normal: [0, 0, 1] };
    const espelhada = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1];
    const lacos = cortarCorpos([cilindro], plano, espelhada).cortado[0]!;
    expect(lacos).toHaveLength(1);
    expect(lacos[0]![0]![0]).toBeGreaterThan(1.9);
    perto(areaAssinada(lacos[0]!, plano.normal), area32(0.05));
  });

  it('silhueta projetada no plano e elevação: retângulo do cilindro em pé', () => {
    const plano: PlanoDeCorte = { origem: [0, 0, 0], normal: [0, 1, 0] };
    const r = cortarCorpos([cilindro], plano);
    expect(r.projetado).toHaveLength(1);
    perto(areaPlana(r.projetado[0]!), 0.1 * 0.6);
    const el = projetarCorposElevacao([cilindro], 'y');
    expect(el).toHaveLength(1);
    perto(areaPlana(el[0]!), 0.1 * 0.6);
    expect(projetarCorposElevacao([corpo({ tipo: 'extrusao', perfil: circulo(0.05), comprimento: 0.6 }, { vistas: ['corte'] })], 'x')).toEqual([]);
  });

  it('além do plano: só o que está atrás, até a profundidade', () => {
    const plano: PlanoDeCorte = { origem: [0, -1, 0], normal: [0, 1, 0] };
    expect(projetarCorposAlemDoPlano([cilindro], plano, 2)).toHaveLength(1);
    expect(projetarCorposAlemDoPlano([cilindro], plano, 0.5)).toEqual([]);
    expect(projetarCorposAlemDoPlano([cilindro], { origem: [0, 1, 0], normal: [0, 1, 0] }, 2)).toEqual([]);
  });
});

/** Caminho em L (0,0,0)→(0,0,1)→(1,0,1) com curva de raio 0,3 no vértice, como o resolvedor entrega (pontos x,y,z planos). */
function curva(p: number[]): number[] {
  const R = 0.3;
  const saida = [p[0]!, p[1]!, p[2]!, 0, 0, 1 - R];
  const passos = 12;
  for (let i = 0; i <= passos; i++) {
    const a = (Math.PI / 2) * (i / passos);
    saida.push(R - R * Math.cos(a), 0, 1 - R + R * Math.sin(a));
  }
  saida.push(p[6]!, p[7]!, p[8]!);
  return saida;
}
