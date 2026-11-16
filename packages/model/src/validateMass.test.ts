import { describe, expect, it } from 'vitest';
import { makeMass, secaoCirculo } from './mass.ts';
import { MASSA_LIMITES, type Mass, type PerfilMassa, type SecaoMassa } from './massTypes.ts';
import { anelSimples, areaComSinal, massIssue } from './validateMass.ts';

const secao = (z: number, perfil: PerfilMassa, extra: Partial<SecaoMassa> = {}): SecaoMassa => ({ z, perfil, rotacao: 0, escala: 1, dx: 0, dy: 0, ...extra });
const caixa: PerfilMassa = { forma: 'livre', pontos: [{ x: -5, y: -3 }, { x: 5, y: -3 }, { x: 5, y: 3 }, { x: -5, y: 3 }] };
const base = (over: Partial<Mass> = {}): Mass => ({ ...makeMass({ id: 'm', levelId: 'lv_0', secoes: [secao(0, caixa), secao(9, caixa)] }), order: 0, ...over });
const issue = (over: Partial<Mass>): string | null => massIssue(base(over));

describe('massIssue (A.3 item 5): uma regra por caso', () => {
  it('massa válida não tem problema', () => {
    expect(massIssue(base())).toBeNull();
    expect(massIssue(base({ arranjo: { n: 12, cx: 0, cy: 0, anguloTotal: 2 * Math.PI } }))).toBeNull();
  });

  it('número de seções: 1 e 65 são recusadas, 2 e 64 passam', () => {
    expect(issue({ secoes: [secao(0, caixa)] })).toMatch(/seções/);
    const muitas = (n: number): SecaoMassa[] => Array.from({ length: n }, (_, i) => secaoCirculo(i * 0.5, 2));
    expect(issue({ secoes: muitas(65) })).toMatch(/seções/);
    expect(issue({ secoes: muitas(64) })).toBeNull();
    expect(issue({ secoes: muitas(2) })).toBeNull();
  });

  it('a primeira seção tem de estar em z = 0', () => {
    expect(issue({ secoes: [secao(0.5, caixa), secao(9, caixa)] })).toMatch(/altura 0/);
  });

  it('z estritamente crescente com passo mínimo de 0,01 m', () => {
    expect(issue({ secoes: [secao(0, caixa), secao(0, caixa)] })).toMatch(/0\.01|0,01/);
    expect(issue({ secoes: [secao(0, caixa), secao(5, caixa), secao(4, caixa)] })).toMatch(/Seção 3/);
    expect(issue({ secoes: [secao(0, caixa), secao(0.009, caixa)] })).not.toBeNull();
    expect(issue({ secoes: [secao(0, caixa), secao(0.01, caixa)] })).toBeNull();
  });

  it('dimensões do perfil maiores que zero (círculo, elipse, polígono)', () => {
    expect(issue({ secoes: [secaoCirculo(0, 0), secaoCirculo(3, 2)] })).toMatch(/dimensões/);
    expect(issue({ secoes: [secaoCirculo(0, -1), secaoCirculo(3, 2)] })).toMatch(/dimensões/);
    expect(issue({ secoes: [secao(0, { forma: 'elipse', rx: 3, ry: 0 }), secaoCirculo(3, 2)] })).toMatch(/dimensões/);
    expect(issue({ secoes: [secao(0, { forma: 'poligono', lados: 4, raio: 0 }), secaoCirculo(3, 2)] })).toMatch(/dimensões/);
    expect(issue({ secoes: [secaoCirculo(0, Number.NaN), secaoCirculo(3, 2)] })).toMatch(/dimensões/);
  });

  it('polígono regular de 3 a 64 lados inteiros', () => {
    expect(issue({ secoes: [secao(0, { forma: 'poligono', lados: 2, raio: 3 }), secaoCirculo(3, 2)] })).toMatch(/lados/);
    expect(issue({ secoes: [secao(0, { forma: 'poligono', lados: 65, raio: 3 }), secaoCirculo(3, 2)] })).toMatch(/lados/);
    expect(issue({ secoes: [secao(0, { forma: 'poligono', lados: 4.5, raio: 3 }), secaoCirculo(3, 2)] })).toMatch(/lados/);
    expect(issue({ secoes: [secao(0, { forma: 'poligono', lados: 64, raio: 3 }), secaoCirculo(3, 2)] })).toBeNull();
  });

  it('perfil livre: 3 a 256 pontos', () => {
    const dois: PerfilMassa = { forma: 'livre', pontos: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    expect(issue({ secoes: [secao(0, dois), secaoCirculo(3, 2)] })).toMatch(/pontos/);
    const n = MASSA_LIMITES.pontosLivre + 1;
    const grande: PerfilMassa = { forma: 'livre', pontos: Array.from({ length: n }, (_, i) => ({ x: Math.cos((2 * Math.PI * i) / n), y: Math.sin((2 * Math.PI * i) / n) })) };
    expect(issue({ secoes: [secao(0, grande), secaoCirculo(3, 2)] })).toMatch(/pontos/);
    const ok: PerfilMassa = { forma: 'livre', pontos: grande.pontos.slice(0, MASSA_LIMITES.pontosLivre) };
    expect(issue({ secoes: [secao(0, ok), secaoCirculo(3, 2)] })).toBeNull();
  });

  it('perfil livre simples: laço em 8 e ponto repetido são recusados', () => {
    const gravata: PerfilMassa = { forma: 'livre', pontos: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }] };
    expect(issue({ secoes: [secao(0, gravata), secaoCirculo(3, 2)] })).toMatch(/simples/);
    const repetido: PerfilMassa = { forma: 'livre', pontos: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }] };
    expect(issue({ secoes: [secao(0, repetido), secaoCirculo(3, 2)] })).toMatch(/simples/);
    expect(anelSimples([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBe(false);
  });

  it('perfil livre anti-horário: o horário é recusado por massIssue', () => {
    const horario: PerfilMassa = { forma: 'livre', pontos: [...caixa.pontos].reverse() };
    expect(areaComSinal(horario.pontos)).toBeLessThan(0);
    expect(issue({ secoes: [secao(0, horario), secao(9, caixa)] })).toMatch(/anti-hor/);
  });

  it('escala maior que zero', () => {
    expect(issue({ secoes: [secao(0, caixa, { escala: 0 }), secao(9, caixa)] })).toMatch(/escala/);
    expect(issue({ secoes: [secao(0, caixa), secao(9, caixa, { escala: -2 })] })).toMatch(/escala/);
  });

  it('resolução inteira de 16 a 128', () => {
    expect(issue({ resolucao: 15 })).toMatch(/resolução/);
    expect(issue({ resolucao: 129 })).toMatch(/resolução/);
    expect(issue({ resolucao: 32.5 })).toMatch(/resolução/);
    expect(issue({ resolucao: 16 })).toBeNull();
    expect(issue({ resolucao: 128 })).toBeNull();
  });

  it('arranjo: número de cópias de 2 a 64', () => {
    expect(issue({ arranjo: { n: 1, cx: 0, cy: 0, anguloTotal: 1 } })).toMatch(/arranjo/);
    expect(issue({ arranjo: { n: 65, cx: 0, cy: 0, anguloTotal: 1 } })).toMatch(/arranjo/);
    expect(issue({ arranjo: { n: 64, cx: 0, cy: 0, anguloTotal: 1 } })).toBeNull();
    expect(issue({ arranjo: { n: 3, cx: Number.NaN, cy: 0, anguloTotal: 1 } })).toMatch(/arranjo/);
  });

  it('diferença de rotação entre vizinhas de no máximo π', () => {
    expect(issue({ secoes: [secao(0, caixa), secao(9, caixa, { rotacao: Math.PI + 0.01 })] })).toMatch(/180/);
    expect(issue({ secoes: [secao(0, caixa, { rotacao: 1 }), secao(9, caixa, { rotacao: 1 - Math.PI - 0.01 })] })).toMatch(/180/);
    expect(issue({ secoes: [secao(0, caixa), secao(9, caixa, { rotacao: Math.PI })] })).toBeNull();
  });

  it('interpolação desconhecida e origem inválida são recusadas', () => {
    expect(issue({ interpolacao: 'cubica' as unknown as Mass['interpolacao'] })).toMatch(/interpolação/);
    expect(issue({ origem: { x: Number.POSITIVE_INFINITY, y: 0 } })).not.toBeNull();
  });

  it('mensagens saem no idioma pedido', () => {
    expect(massIssue(base({ resolucao: 1 }), 'en')).toMatch(/resolution/);
  });
});
