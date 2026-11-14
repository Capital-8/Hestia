import { describe, expect, it } from 'vitest';
import { buildOpeningModel, frameOfWall, openingGeometry } from '@hestia/engine';
import { openingRect } from '@hestia/engine/src/openingCut.ts';
import { dimensionPoints, dimensionValue, isOpening, isWall, levelDimensions, openingsOfWall, type Opening, type Project, type Wall } from '@hestia/model';
import { importIfc } from '@hestia/io';
import { clickAt, makeEnv, tool, walls } from '@hestia/tools/src/testEnv.ts';
import { planDxf } from './dxfExport.ts';
import { projectIfc } from './ifcExport.ts';

/**
 * F1.7 · integração das paredes geradas por forma (círculo r=3 e elipse 4×2) com abertura, cota, IFC e DXF.
 * Valores de referência são literais (2π·3, perímetro de Ramanujan da elipse); o comprimento dos arcos sai de uma
 * fórmula de teste (corda e flecha), não do código sob teste.
 */

type Ctx = ReturnType<typeof makeEnv>;
const NOW = new Date('2026-11-14T12:00:00Z');
const CIRCULO_R = 3;
const PERIMETRO_CIRCULO = 18.8496; // 2π·3
const PERIMETRO_ELIPSE = 19.3769; // π[3(a+b) − √((3a+b)(a+3b))], a = 4, b = 2

/** Comprimento do arco de uma parede (corda c, flecha s): R = (c²/4 + s²)/(2s), θ = 2·atan2(c/2, R − s). */
function comprimentoArco(w: Wall): number {
  const c = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const s = Math.abs(w.sag);
  if (s === 0) return c;
  const R = (c * c) / 4 / (2 * s) + s / 2;
  return 2 * R * Math.atan2(c / 2, R - s);
}

/** Desenha a forma pela ferramenta Parede com os cliques dados; devolve o ambiente com as paredes criadas. */
function desenhaForma(shape: 'circle' | 'ellipse', cliques: [number, number][]): Ctx {
  const ctx = makeEnv();
  Object.assign(ctx.options, { wallShape: shape });
  const t = tool('wall', ctx.env);
  for (const [x, y] of cliques) clickAt(t, x, y);
  return ctx;
}

const circulo = () => desenhaForma('circle', [[0, 0], [CIRCULO_R, 0]]);
const elipse = () => desenhaForma('ellipse', [[0, 0], [4, 0], [0, 2]]);

/** Parede de maior comprimento de arco (hospeda o vão com folga para o batente). */
function maiorArco(ws: Wall[]): Wall {
  return ws.reduce((m, w) => (comprimentoArco(w) > comprimentoArco(m) ? w : m));
}

/** Insere uma abertura no projeto pelo comando `addOpening` e devolve o vão gravado. */
function insereAbertura(ctx: Ctx, o: Opening): Opening {
  ctx.store.exec({ type: 'addOpening', opening: o });
  return openingsOfWall(ctx.store.project, o.hostId).find((x) => x.id === o.id)!;
}

const vao = (id: string, hostId: string, typeId: string, kind: 'door' | 'window', offset: number): Opening => ({
  id,
  kind,
  typeId,
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
});

/** Ângulo (rad) entre dois vetores a partir do centro do arco: converte a posição de volta para comprimento de arco. */
function anguloEntre(c: { x: number; y: number }, p: { x: number; y: number }, q: { x: number; y: number }): number {
  const u = { x: p.x - c.x, y: p.y - c.y };
  const v = { x: q.x - c.x, y: q.y - c.y };
  const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** Confere vão válido (corte não lança, malha existe) e que a posição ao longo da parede curva foi preservada. */
function confereVao(p: Project, o: Opening, offsetPedido: number): void {
  const gravado = p.elements[o.id];
  expect(isOpening(gravado!)).toBe(true);
  expect((gravado as Opening).offset).toBeCloseTo(offsetPedido, 9);

  const f = frameOfWall(p, o.hostId)!;
  expect(f.arc).not.toBeNull();
  const g = openingGeometry(p, gravado as Opening, f);
  expect(g.offset).toBeCloseTo(offsetPedido, 9);
  expect(() => openingRect(g)).not.toThrow();
  const corte = openingRect(g);
  expect(corte.length).toBeGreaterThan(0);
  expect(corte[0]![0]!.length).toBeGreaterThanOrEqual(4);

  const m = buildOpeningModel(p, gravado as Opening, g, f);
  expect(m.parts.length + m.openings.length).toBeGreaterThan(0);

  // Posição: o ângulo do centro do vão em torno do centro do arco vezes o raio é o comprimento até o vão.
  const ang = anguloEntre(f.arc!.center, f.a, g.center);
  expect(ang * f.arc!.radius).toBeCloseTo(offsetPedido, 6);
}

describe('F1.7 · abertura em parede de forma (porta e janela)', () => {
  it('círculo r=3: porta e janela na mesma parede em arco abrem vão válido na posição pedida', () => {
    const ctx = circulo();
    const host = walls(ctx.store)[0]!;
    insereAbertura(ctx, vao('porta_c', host.id, 'ot_p80', 'door', 2));
    insereAbertura(ctx, vao('janela_c', host.id, 'ot_j120', 'window', 5));
    confereVao(ctx.store.project, vao('porta_c', host.id, 'ot_p80', 'door', 2), 2);
    confereVao(ctx.store.project, vao('janela_c', host.id, 'ot_j120', 'window', 5), 5);
  });

  it('elipse 4×2: porta na parede mais longa do arco abre vão válido na posição pedida', () => {
    const ctx = elipse();
    const host = maiorArco(walls(ctx.store));
    const meio = comprimentoArco(host) / 2;
    insereAbertura(ctx, vao('porta_e', host.id, 'ot_p80', 'door', meio));
    confereVao(ctx.store.project, vao('porta_e', host.id, 'ot_p80', 'door', meio), meio);
  });
});

describe('F1.7 · cota associativa a parede em arco', () => {
  it('círculo r=3: cota entre as pontas (±3, 0) grava referência à parede e vale 6 m', () => {
    const ctx = circulo();
    const arcos = walls(ctx.store).map((w) => w.id);
    const t = tool('dimension', ctx.env);
    clickAt(t, CIRCULO_R, 0);
    clickAt(t, -CIRCULO_R, 0);
    clickAt(t, 0, 1);
    const d = levelDimensions(ctx.store.project, 'lv_0')[0]!;
    const ref = d.refs?.a as { elementId: string; feature: string } | undefined;
    expect(ref).toBeDefined();
    expect(arcos).toContain(ref!.elementId);
    expect(ref!.feature).toMatch(/^wall-axis-/);
    expect(dimensionValue(ctx.store.project, d)).toBeCloseTo(6, 9);
  });

  it('círculo r=3: mover as paredes do arco leva a cota junto (translação de 1 m em x)', () => {
    const ctx = circulo();
    const ids = walls(ctx.store).map((w) => w.id);
    const t = tool('dimension', ctx.env);
    clickAt(t, CIRCULO_R, 0);
    clickAt(t, -CIRCULO_R, 0);
    clickAt(t, 0, 1);
    ctx.store.exec({ type: 'transform', ids, transform: { kind: 'translate', d: { x: 1, y: 0 } } });
    const d = levelDimensions(ctx.store.project, 'lv_0')[0]!;
    // Valor é invariante à translação; o que prova a associação são as pontas: (3,0)→(4,0) e (−3,0)→(−2,0).
    const pts = dimensionPoints(ctx.store.project, d);
    expect(pts.a.x).toBeCloseTo(4, 9);
    expect(pts.a.y).toBeCloseTo(0, 9);
    expect(pts.b.x).toBeCloseTo(-2, 9);
    expect(pts.b.y).toBeCloseTo(0, 9);
    expect(dimensionValue(ctx.store.project, d)).toBeCloseTo(6, 9);
  });
});

describe('F1.7 · exportação IFC e DXF do projeto com paredes de forma', () => {
  /** Projeto com o círculo e a elipse no mesmo nível, uma porta e uma janela num arco do círculo. */
  function projetoMisto(): Ctx {
    const ctx = circulo();
    const c = walls(ctx.store)[0]!;
    insereAbertura(ctx, vao('porta_c', c.id, 'ot_p80', 'door', 2));
    insereAbertura(ctx, vao('janela_c', c.id, 'ot_j120', 'window', 5));
    Object.assign(ctx.options, { wallShape: 'ellipse' });
    const t = tool('wall', ctx.env);
    clickAt(t, 12, 0);
    clickAt(t, 16, 0);
    clickAt(t, 12, 2);
    return ctx;
  }

  const count = (text: string, tipo: string): number => (text.match(new RegExp(`=${tipo}\\(`, 'g')) ?? []).length;

  it('IFC: uma IfcWall por parede, vãos como IfcDoor/IfcWindow e reimportação com o mesmo número de paredes', () => {
    const ctx = projetoMisto();
    const p = ctx.store.project;
    const paredes = Object.values(p.elements).filter(isWall).length;
    const vaos = Object.values(p.elements).filter(isOpening).length;
    expect(paredes).toBe(2 + 16);

    const text = projectIfc(p, NOW);
    expect(count(text, 'IFCWALL')).toBe(paredes);
    expect(count(text, 'IFCDOOR') + count(text, 'IFCWINDOW')).toBe(vaos);

    const volta = importIfc(text).project;
    expect(Object.values(volta.elements).filter(isWall)).toHaveLength(paredes);
  });

  it('DXF: exporta o nível sem lançar e com as entidades das paredes (camadas de material e contorno)', () => {
    const ctx = projetoMisto();
    const p = ctx.store.project;
    let texto = '';
    expect(() => {
      texto = planDxf(p, 'lv_0');
    }).not.toThrow();
    expect(texto).toContain('\r\nPAREDE_CONTORNO\r\n');
    const polilinhas = texto.match(/\r\n0\r\nPOLYLINE\r\n/g) ?? [];
    expect(polilinhas.length).toBeGreaterThan(0);
    expect(texto.endsWith('\r\n0\r\nEOF\r\n')).toBe(true);
  });
});

describe('F1.7 · quantitativo de comprimento das paredes de forma', () => {
  it('círculo r=3: soma dos arcos ≈ 18,8496 m (±1e-3)', () => {
    const total = walls(circulo().store).reduce((s, w) => s + comprimentoArco(w), 0);
    expect(Math.abs(total - PERIMETRO_CIRCULO)).toBeLessThanOrEqual(1e-3);
  });

  it('elipse 4×2: soma dos arcos ≈ 19,3769 m (±0,02)', () => {
    const total = walls(elipse().store).reduce((s, w) => s + comprimentoArco(w), 0);
    expect(Math.abs(total - PERIMETRO_ELIPSE)).toBeLessThanOrEqual(0.02);
  });
});
