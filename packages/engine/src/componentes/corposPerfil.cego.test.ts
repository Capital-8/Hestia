import { describe, expect, it } from 'vitest';
import { resolverPerfil } from './corposPerfil.ts';

/*
 * TESTE CEGO dos perfis (ADR 0061, ficha A3-cego). Escrito SÓ a partir de CONTRATO.md §2.2 e de corposTipos.ts,
 * sem ler a implementação. Premissas (o que o contrato não fixa aparece em `AMBIGUIDADE:`):
 * - entrada: objeto com `tipo` (nomes da tabela §2.2) e medidas em mm (texto da família); `avaliar` = Number;
 * - saída: resultado com `ok`; quando válido, o perfil resolvido fica em `valor` (nome NÃO dito pelo contrato: suposição);
 * - resolvido em metros; `externo` e `furos` são listas planas [u0, v0, u1, v1, ...].
 */

const avaliar = (e: unknown): number => Number(e);

/** Pares (u, v) de uma lista plana. */
function pares(plano: number[]): Array<[number, number]> {
  const saida: Array<[number, number]> = [];
  for (let i = 0; i + 1 < plano.length; i += 2) {
    saida.push([plano[i] ?? Number.NaN, plano[i + 1] ?? Number.NaN]);
  }
  return saida;
}

/** Área com sinal pelo método dos cadarços (shoelace): positiva = anti-horário. */
function areaComSinal(plano: number[]): number {
  const p = pares(plano);
  let soma = 0;
  for (let i = 0; i < p.length; i += 1) {
    const [u1, v1] = p[i] ?? [0, 0];
    const [u2, v2] = p[(i + 1) % p.length] ?? [0, 0];
    soma += u1 * v2 - u2 * v1;
  }
  return soma / 2;
}

/** Resolve e exige sucesso; devolve o perfil resolvido. */
function valorDe(r: ReturnType<typeof resolverPerfil>) {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('o perfil deveria ser válido');
  return r.valor;
}

describe('círculo', () => {
  it('área exata do polígono regular inscrito, N = 5', () => {
    const r = valorDe(resolverPerfil({ tipo: 'circulo', diametro: 100, segmentos: 5 }, avaliar));
    const raio = 0.05;
    const exata = (5 / 2) * raio * raio * Math.sin((2 * Math.PI) / 5);
    expect(areaComSinal(r.externo)).toBeCloseTo(exata, 12);
  });

  it('área exata do polígono regular inscrito, N = 6', () => {
    const r = valorDe(resolverPerfil({ tipo: 'circulo', diametro: 100, segmentos: 6 }, avaliar));
    const raio = 0.05;
    const exata = (6 / 2) * raio * raio * Math.sin((2 * Math.PI) / 6);
    expect(areaComSinal(r.externo)).toBeCloseTo(exata, 12);
  });

  it('com segmentos = 12 tem 12 pontos (N lados, N vértices)', () => {
    const r = valorDe(resolverPerfil({ tipo: 'circulo', diametro: 100, segmentos: 12 }, avaliar));
    expect(pares(r.externo)).toHaveLength(12);
  });

  it('sem segmentos informado usa o padrão de 32', () => {
    const r = valorDe(resolverPerfil({ tipo: 'circulo', diametro: 100 }, avaliar));
    expect(pares(r.externo)).toHaveLength(32);
  });

  it('começa no ângulo 0, ponto (r, 0), e segue anti-horário', () => {
    const r = valorDe(resolverPerfil({ tipo: 'circulo', diametro: 100, segmentos: 8 }, avaliar));
    expect(r.externo[0]).toBeCloseTo(0.05, 12);
    expect(r.externo[1]).toBeCloseTo(0, 12);
    // Segundo ponto, a 45 graus: v > 0 indica sentido anti-horário.
    expect(r.externo[3]).toBeGreaterThan(0);
    expect(areaComSinal(r.externo)).toBeGreaterThan(0);
  });

  it('é simétrico: todo ponto (u, v) tem o espelho (u, -v)', () => {
    const r = valorDe(resolverPerfil({ tipo: 'circulo', diametro: 100, segmentos: 5 }, avaliar));
    const p = pares(r.externo);
    const simetrico = p.every(([u, v]) => p.some(([u2, v2]) => Math.abs(u2 - u) < 1e-12 && Math.abs(v2 + v) < 1e-12));
    expect(simetrico).toBe(true);
  });

  it.skip('AMBIGUIDADE: o contrato não diz se o anel fecha repetindo o primeiro ponto (N+1) ou não (N)', () => {
    // Não testado: só fixamos "N lados = N vértices" acima.
  });
});

describe('áreas exatas', () => {
  it('retângulo centrado: área = largura × altura', () => {
    const r = valorDe(resolverPerfil({ tipo: 'retangulo', largura: 100, altura: 50 }, avaliar));
    expect(areaComSinal(r.externo)).toBeCloseTo(0.005, 12);
  });

  it('L: área = abaA·esp + (abaB − esp)·esp', () => {
    // abaA = 100 (vertical), abaB = 60 (horizontal), esp = 10 -> 1000 + 500 = 1500 mm².
    const r = valorDe(resolverPerfil({ tipo: 'perfilL', abaA: 100, abaB: 60, esp: 10 }, avaliar));
    expect(Math.abs(areaComSinal(r.externo))).toBeCloseTo(0.0015, 12);
  });

  it('T: área = largura·mesaEsp + (altura − mesaEsp)·almaEsp', () => {
    // 100·10 + (200 − 10)·8 = 1000 + 1520 = 2520 mm².
    const r = valorDe(resolverPerfil({ tipo: 'perfilT', largura: 100, altura: 200, mesaEsp: 10, almaEsp: 8 }, avaliar));
    expect(Math.abs(areaComSinal(r.externo))).toBeCloseTo(0.00252, 12);
  });

  it.skip('AMBIGUIDADE: U — o contrato não nomeia os parâmetros de espessura da alma (tw) e da aba (tf) do perfilU', () => {
    // Área esperada: h·tw + 2·(b−tw)·tf. Falta o nome dos campos de entrada.
  });

  it.skip('AMBIGUIDADE: anel — o contrato não diz se o círculo interno usa o mesmo `segmentos` do externo', () => {
    // Área esperada: área(externo) − área(interno), com os dois N iguais.
  });

  it.skip('AMBIGUIDADE: L — o contrato não diz onde fica o bbox (centralizado ou não); só o canto (−, −)', () => {
    // Não testado: posição do bbox do L.
  });
});

describe('orientação', () => {
  it('externo é anti-horário para retângulo', () => {
    const r = valorDe(resolverPerfil({ tipo: 'retangulo', largura: 100, altura: 50 }, avaliar));
    expect(areaComSinal(r.externo)).toBeGreaterThan(0);
  });

  it('poligono em sentido horário é invertido: externo sai anti-horário', () => {
    // Quadrado de 100 mm dado em sentido horário.
    const horario = { tipo: 'poligono', pontos: [0, 0, 0, 100, 100, 100, 100, 0] };
    const r = valorDe(resolverPerfil(horario, avaliar));
    expect(areaComSinal(r.externo)).toBeGreaterThan(0);
    expect(Math.abs(areaComSinal(r.externo))).toBeCloseTo(0.01, 12);
  });

  it('furo do anel é horário', () => {
    const r = valorDe(resolverPerfil({ tipo: 'anel', diametroExterno: 100, diametroInterno: 60, segmentos: 16 }, avaliar));
    expect(r.furos).toHaveLength(1);
    expect(areaComSinal(r.furos[0] ?? [])).toBeLessThan(0);
  });

  it('furo do retângulo oco é horário', () => {
    const r = valorDe(resolverPerfil({ tipo: 'retanguloOco', largura: 100, altura: 50, espessura: 10 }, avaliar));
    expect(r.furos).toHaveLength(1);
    expect(areaComSinal(r.furos[0] ?? [])).toBeLessThan(0);
  });

  it('retângulo oco: área = l·a − (l − 2e)·(a − 2e)', () => {
    // 100·50 − 80·30 = 2600 mm² (área do externo menos o furo).
    const r = valorDe(resolverPerfil({ tipo: 'retanguloOco', largura: 100, altura: 50, espessura: 10 }, avaliar));
    const area = areaComSinal(r.externo) + areaComSinal(r.furos[0] ?? []);
    expect(area).toBeCloseTo(0.0026, 12);
  });
});

describe('perfil inválido devolve ok: false', () => {
  it('medida zero (diâmetro 0)', () => {
    expect(resolverPerfil({ tipo: 'circulo', diametro: 0, segmentos: 8 }, avaliar).ok).toBe(false);
  });

  it('anel com diâmetro interno não menor que o externo', () => {
    expect(resolverPerfil({ tipo: 'anel', diametroExterno: 100, diametroInterno: 120 }, avaliar).ok).toBe(false);
  });

  it('retângulo oco com 2·espessura não menor que o menor lado', () => {
    // 2·30 = 60 > 50 (menor lado).
    expect(resolverPerfil({ tipo: 'retanguloOco', largura: 100, altura: 50, espessura: 30 }, avaliar).ok).toBe(false);
  });

  it('poligono com menos de 3 pontos', () => {
    expect(resolverPerfil({ tipo: 'poligono', pontos: [0, 0, 100, 0] }, avaliar).ok).toBe(false);
  });

  it('poligono com auto-interseção (laço de gravata)', () => {
    expect(resolverPerfil({ tipo: 'poligono', pontos: [0, 0, 100, 100, 100, 0, 0, 100] }, avaliar).ok).toBe(false);
  });

  it('T com 2·mesaEsp não menor que a altura', () => {
    expect(resolverPerfil({ tipo: 'perfilT', largura: 100, altura: 150, mesaEsp: 100, almaEsp: 8 }, avaliar).ok).toBe(false);
  });

  it('I com almaEsp não menor que a largura', () => {
    expect(resolverPerfil({ tipo: 'perfilI', largura: 100, altura: 200, mesaEsp: 10, almaEsp: 100 }, avaliar).ok).toBe(false);
  });

  it.skip('AMBIGUIDADE: segmentos fora de [8, 128] — o contrato não diz se limita (clamp) ou se devolve erro', () => {
    // Não testado: escolha entre ajustar e recusar.
  });

  it.skip('AMBIGUIDADE: retângulo com raio > 0 — o contrato não diz quantos pontos os arcos geram', () => {
    // Não testado: a contagem exata dos pontos dos cantos arredondados.
  });

  it.skip('AMBIGUIDADE: perfil de revolução com u < 0 — não se sabe se resolverPerfil faz essa validação', () => {
    // Não testado: a regra é de forma de revolução, não necessariamente de perfil.
  });
});
