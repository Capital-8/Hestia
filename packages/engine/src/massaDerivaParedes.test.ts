import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject, makeLevel, makeMass, ProjectStore, secaoCirculo, type Project } from '@hestia/model';
import type { FatiaMassaProjeto } from './massaServico.ts';
import {
  cadeiaDeParedes,
  derivarContornosParedesDaMassa,
  emSentidoHorario,
  fundirSegmentosCurtos,
  semColineares,
  SEGMENTO_MINIMO_PADRAO,
  TOLERANCIA_PAREDE_PADRAO,
} from './massaDerivaParedes.ts';

/** Área com sinal (positiva = anti-horário). */
function areaComSinal(anel: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % anel.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

const circulo = (n: number, r: number): Vec2[] => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) }));

const retangulo = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Distância do ponto ao segmento a–b. */
function distSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const q = dx * dx + dy * dy;
  const t = q === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / q));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const fatia = (massaId: string, copia: number, nivelId: string, pontos: Vec2[]): FatiaMassaProjeto => ({ massaId, copia, nivelId, area: 0, perimetro: 0, z: 0, pontos });

/** Fonte simulada: devolve todas as fatias, como `fatias(p)` do kernel (ou `null` para simular o kernel desligado). */
const fonteDe = (todas: FatiaMassaProjeto[], ligada = true) => ({ fatias: (): FatiaMassaProjeto[] | null => (ligada ? todas : null) });

/** Projeto com a massa `m1` (de 0 a 9 m) no térreo e os níveis `lv_a` (3 m) e `lv_b` (6 m). Devolve também o id do térreo. */
function projeto(): { p: Project; terreo: string } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_a', name: 'A', elevation: 3 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_b', name: 'B', elevation: 6 }) });
  const terreo = s.project.levels.find((l) => l.elevation === 0)!.id;
  s.exec({ type: 'addMass', mass: makeMass({ id: 'm1', levelId: terreo, name: 'Torre', secoes: [secaoCirculo(0, 5), secaoCirculo(9, 5)] }) });
  return { p: s.project, terreo };
}

describe('fusão de segmentos curtos (mínimo de 0,40 m)', () => {
  it('vértice que faria segmento menor que o mínimo some e o resto fica igual', () => {
    const anel = [
      { x: 0, y: 0 },
      { x: 0.2, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const out = fundirSegmentosCurtos(anel, 0.4);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
  });

  it('o fechamento também respeita o mínimo: o último vértice perto do primeiro é retirado', () => {
    const out = fundirSegmentosCurtos(retangulo(0, 0, 4, 3).concat([{ x: 0.1, y: 0.1 }]), 0.4);
    for (let i = 0; i < out.length; i++) expect(dist2(out[i]!, out[(i + 1) % out.length]!)).toBeGreaterThanOrEqual(0.4);
    expect(out).toHaveLength(4);
  });

  it('nenhum segmento menor que o mínimo em toda cadeia devolvida', () => {
    const cadeia = cadeiaDeParedes(circulo(64, 5), TOLERANCIA_PAREDE_PADRAO, SEGMENTO_MINIMO_PADRAO);
    for (let i = 0; i < cadeia.length; i++) expect(dist2(cadeia[i]!, cadeia[(i + 1) % cadeia.length]!)).toBeGreaterThanOrEqual(0.4);
  });

  it('menos de 3 vértices sobrando devolve vazio (não há parede)', () => {
    expect(fundirSegmentosCurtos([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0, y: 0.1 }], 0.4)).toEqual([]);
  });
});

/** Distância entre dois pontos. */
function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('cadeia de paredes a partir de um contorno (M1 e M2 do aceite)', () => {
  it('M1 caixa: um retângulo vira 4 vértices em sentido horário, cadeia fechada', () => {
    const cadeia = cadeiaDeParedes(retangulo(0, 0, 10, 6), TOLERANCIA_PAREDE_PADRAO, SEGMENTO_MINIMO_PADRAO);
    expect(cadeia).toHaveLength(4);
    expect(areaComSinal(cadeia)).toBeLessThan(0);
    expect(Math.abs(areaComSinal(cadeia))).toBeCloseTo(60, 9);
  });

  it('M2 cilindro r = 5 (64 pontos): cadeia fechada, todos os segmentos ≥ 0,40 m e nenhum vértice original mais longe que a tolerância', () => {
    const original = circulo(64, 5);
    const cadeia = cadeiaDeParedes(original, TOLERANCIA_PAREDE_PADRAO, SEGMENTO_MINIMO_PADRAO);
    expect(cadeia.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < cadeia.length; i++) {
      expect(dist2(cadeia[i]!, cadeia[(i + 1) % cadeia.length]!)).toBeGreaterThanOrEqual(0.4);
    }
    // Cada vértice do contorno original fica a no máximo a tolerância de alguma parede simplificada (Douglas-Peucker).
    for (const q of original) {
      const d = Math.min(...cadeia.map((a, i) => distSeg(q, a, cadeia[(i + 1) % cadeia.length]!)));
      expect(d).toBeLessThanOrEqual(TOLERANCIA_PAREDE_PADRAO + 1e-9);
    }
  });

  it('emSentidoHorario inverte um contorno anti-horário e mantém um horário', () => {
    const horario = emSentidoHorario(retangulo(0, 0, 2, 1));
    expect(areaComSinal(horario)).toBeLessThan(0);
    expect(areaComSinal(emSentidoHorario([...horario].reverse()))).toBeLessThan(0);
  });
});

describe('derivação de paredes por nível (fonte simulada)', () => {
  it('um nível com retângulo: 4 vértices, altura até o próximo nível dentro da massa', () => {
    const { p, terreo } = projeto();
    const r = derivarContornosParedesDaMassa(p, 'm1', [terreo], {}, fonteDe([fatia('m1', 0, terreo, retangulo(-5, -3, 5, 3))]));
    expect(r).not.toBeNull();
    expect(r!.semFatia).toEqual([]);
    expect(r!.semAltura).toEqual([]);
    expect(r!.porNivel).toHaveLength(1);
    const nivel = r!.porNivel[0]!;
    expect(nivel.nivelId).toBe(terreo);
    // O projeto vazio já traz um nível em 3 m: o próximo nível dentro da massa é o primeiro de cota 3 m na ordem do projeto.
    expect(nivel.topoNivelId).toBe(p.levels.find((l) => l.elevation === 3)!.id);
    expect(nivel.altura).toBeCloseTo(3, 12);
    expect(nivel.cadeias).toHaveLength(1);
    expect(nivel.cadeias[0]).toHaveLength(4);
  });

  it('sem nível acima dentro da massa: a altura vai até o topo da massa e topoNivelId é null', () => {
    const { p } = projeto();
    const r = derivarContornosParedesDaMassa(p, 'm1', ['lv_b'], {}, fonteDe([fatia('m1', 0, 'lv_b', retangulo(-5, -3, 5, 3))]));
    // Topo da massa: 9 m. Nível de 6 m: não há nível acima no projeto, então sobram 3 m.
    expect(r!.porNivel[0]!.topoNivelId).toBeNull();
    expect(r!.porNivel[0]!.altura).toBeCloseTo(3, 12);
  });

  it('nível na cota do topo da massa não gera paredes e vai para semAltura', () => {
    const { p, terreo } = projeto();
    const s = new ProjectStore(p);
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_9', name: 'Topo', elevation: 9 }) });
    const r = derivarContornosParedesDaMassa(s.project, 'm1', ['lv_9', terreo], {}, fonteDe([fatia('m1', 0, 'lv_9', retangulo(-1, -1, 1, 1))]));
    expect(r!.semAltura).toEqual(['lv_9']);
    expect(r!.porNivel.map((n) => n.nivelId)).toEqual([]);
  });

  it('nível sem fatia é ignorado e vem em semFatia; fatias de outra massa não entram', () => {
    const { p, terreo } = projeto();
    const r = derivarContornosParedesDaMassa(p, 'm1', [terreo, 'lv_a'], {}, fonteDe([fatia('outra', 0, terreo, retangulo(0, 0, 2, 2))]));
    expect(r!.porNivel).toEqual([]);
    expect(r!.semFatia).toEqual([terreo, 'lv_a']);
  });

  it('componentes separados (cópias que não se tocam) dão uma cadeia fechada por componente', () => {
    const { p, terreo } = projeto();
    const todas = [fatia('m1', 0, terreo, retangulo(0, 0, 2, 2)), fatia('m1', 1, terreo, retangulo(10, 0, 12, 2))];
    const r = derivarContornosParedesDaMassa(p, 'm1', [terreo], {}, fonteDe(todas));
    expect(r!.porNivel[0]!.cadeias).toHaveLength(2);
    for (const c of r!.porNivel[0]!.cadeias) expect(c).toHaveLength(4);
  });

  it('sem kernel (fonte devolve null) devolve null sem lançar', () => {
    const { p, terreo } = projeto();
    expect(derivarContornosParedesDaMassa(p, 'm1', [terreo], {}, fonteDe([], false))).toBeNull();
  });

  it('massa inexistente devolve tudo como sem fatia, sem lançar', () => {
    const { p, terreo } = projeto();
    const r = derivarContornosParedesDaMassa(p, 'nao_existe', [terreo], {}, fonteDe([]));
    expect(r).toEqual({ porNivel: [], semFatia: [terreo], semAltura: [] });
  });

  it('tolerância e segmento mínimo podem ser trocados pelas opções', () => {
    const { p, terreo } = projeto();
    const r = derivarContornosParedesDaMassa(p, 'm1', [terreo], { segmentoMinimo: 3 }, fonteDe([fatia('m1', 0, terreo, retangulo(0, 0, 4, 2))]));
    // Todos os lados (4 e 2 m) ficam abaixo de 3 m nos dois lados menores: sobra o que for ≥ 3 m, e a cadeia não fecha.
    expect(r!.porNivel[0]!.cadeias).toEqual([]);
  });

  it('vértice no meio de um lado reto não divide a parede em duas (anel que começa no meio do lado)', () => {
    // Quadrado de 8 m com um vértice extra no meio de cada lado e o anel começando no meio de um lado, como a fatia do kernel.
    const anel: Vec2[] = [
      { x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 8, y: 8 }, { x: 4, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }, { x: 0, y: 0 },
    ];
    const cadeia = cadeiaDeParedes(anel, TOLERANCIA_PAREDE_PADRAO, SEGMENTO_MINIMO_PADRAO);
    expect(cadeia).toHaveLength(4);
    expect(Math.abs(areaComSinal(cadeia))).toBeCloseTo(64, 9);
  });

  it('semColineares: tira só o vértice entre os vizinhos, mantém a quina e o anel de 3 vértices', () => {
    const quadrado: Vec2[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }];
    expect(semColineares(quadrado)).toHaveLength(4);
    const triangulo: Vec2[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
    expect(semColineares(triangulo)).toEqual(triangulo);
    // Um vértice a 1 cm da reta (acima de eps = 0,1 mm) é quina de verdade e fica.
    const quase: Vec2[] = [{ x: 0, y: 0 }, { x: 4, y: 0.01 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }];
    expect(semColineares(quase)).toHaveLength(5);
  });
});
