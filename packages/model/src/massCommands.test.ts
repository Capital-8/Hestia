import { describe, expect, it } from 'vitest';
import type { Transform } from '@hestia/geom';
import { createEmptyProject } from './defaults.ts';
import { applyElementLevel, elementLevelId } from './elementLevel.ts';
import { GRAPHICS_CATEGORIES, DEFAULT_CATEGORY_STYLES, defaultOverrides } from './graphics.ts';
import { ProjectStore } from './history.ts';
import { isMass, makeMass, normalizarPerfil, secaoCirculo, transformMass } from './mass.ts';
import type { ArranjoMassa, Mass, PerfilMassa, SecaoMassa } from './massTypes.ts';
import { areaComSinal } from './validateMass.ts';

const secao = (z: number, perfil: PerfilMassa, extra: Partial<SecaoMassa> = {}): SecaoMassa => ({ z, perfil, rotacao: 0, escala: 1, dx: 0, dy: 0, ...extra });
const caixa: PerfilMassa = { forma: 'livre', pontos: [{ x: -5, y: -3 }, { x: 5, y: -3 }, { x: 5, y: 3 }, { x: -5, y: 3 }] };
const gota: PerfilMassa = { forma: 'livre', pontos: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0.5 }, { x: -1, y: -0.5 }, { x: 0, y: -1 }] };

function cena(extra: Partial<Mass> = {}): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addMass', mass: makeMass({ id: 'm1', levelId: 'lv_0', secoes: [secao(0, caixa), secao(9, caixa)], origem: { x: 2, y: 1 }, ...extra }) });
  return s;
}
const m = (s: ProjectStore, id = 'm1'): Mass => s.project.elements[id] as Mass;

describe('addMass', () => {
  it('cria a massa com ordem, desfaz e refaz', () => {
    const s = cena();
    expect(isMass(s.project.elements['m1'])).toBe(true);
    expect(m(s).order).toBeGreaterThanOrEqual(0);
    expect(m(s).secoes).toHaveLength(2);
    s.undo();
    expect(s.project.elements['m1']).toBeUndefined();
    s.redo();
    expect(m(s).name).toBe('Massa');
  });

  it('recusa massa inválida e nível inexistente sem mudar o projeto', () => {
    const s = cena();
    const antes = JSON.stringify(s.project);
    expect(() => s.exec({ type: 'addMass', mass: makeMass({ id: 'x', levelId: 'lv_0', secoes: [secao(0, caixa)] }) })).toThrow(/seções/);
    expect(() => s.exec({ type: 'addMass', mass: makeMass({ id: 'x', levelId: 'nao_existe', secoes: [secao(0, caixa), secao(1, caixa)] }) })).toThrow(/Nível inexistente/);
    expect(JSON.stringify(s.project)).toBe(antes);
  });

  it('normaliza perfil livre horário para anti-horário', () => {
    const horario: PerfilMassa = { forma: 'livre', pontos: [...caixa.pontos].reverse() };
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addMass', mass: makeMass({ id: 'h', levelId: 'lv_0', secoes: [secao(0, horario), secao(5, horario)] }) });
    const p = m(s, 'h').secoes[0]!.perfil;
    expect(p.forma === 'livre' && areaComSinal(p.pontos)).toBeGreaterThan(0);
  });

  it('não guarda referência à lista de seções do comando', () => {
    const secoes = [secao(0, caixa), secao(9, caixa)];
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addMass', mass: makeMass({ id: 'r', levelId: 'lv_0', secoes }) });
    expect(m(s, 'r').secoes).not.toBe(secoes);
  });
});

describe('updateMass', () => {
  it('aplica patch parcial, desfaz e refaz', () => {
    const s = cena();
    s.exec({ type: 'updateMass', id: 'm1', patch: { name: 'Torre', interpolacao: 'suave', resolucao: 32, baseOffset: 1.5 } });
    expect(m(s)).toMatchObject({ name: 'Torre', interpolacao: 'suave', resolucao: 32, baseOffset: 1.5, id: 'm1', kind: 'mass' });
    s.undo();
    expect(m(s)).toMatchObject({ name: 'Massa', interpolacao: 'linear', resolucao: 64, baseOffset: 0 });
    s.redo();
    expect(m(s).name).toBe('Torre');
  });

  it('recusa patch inválido e id que não é massa', () => {
    const s = cena();
    expect(() => s.exec({ type: 'updateMass', id: 'm1', patch: { resolucao: 4 } })).toThrow(/resolução/);
    expect(() => s.exec({ type: 'updateMass', id: 'nada', patch: { name: 'x' } })).toThrow(/Massa inexistente/);
    expect(() => s.exec({ type: 'updateMass', id: 'm1', patch: { levelId: 'xx' } })).toThrow(/Nível inexistente/);
    expect(m(s).resolucao).toBe(64);
  });
});

describe('setMassSecoes', () => {
  it('troca a pilha inteira com desfazer e refazer', () => {
    const s = cena();
    s.exec({ type: 'setMassSecoes', id: 'm1', secoes: [secaoCirculo(0, 3), secaoCirculo(4, 5), secaoCirculo(8, 2)] });
    expect(m(s).secoes).toHaveLength(3);
    s.undo();
    expect(m(s).secoes).toHaveLength(2);
    s.redo();
    expect(m(s).secoes).toHaveLength(3);
  });

  it('recusa pilha inválida e normaliza o sentido', () => {
    const s = cena();
    expect(() => s.exec({ type: 'setMassSecoes', id: 'm1', secoes: [secaoCirculo(1, 3), secaoCirculo(4, 5)] })).toThrow(/altura 0/);
    expect(m(s).secoes).toHaveLength(2);
    s.exec({ type: 'setMassSecoes', id: 'm1', secoes: [secao(0, { forma: 'livre', pontos: [...caixa.pontos].reverse() }), secao(3, caixa)] });
    const p = m(s).secoes[0]!.perfil;
    expect(p.forma === 'livre' && areaComSinal(p.pontos)).toBeGreaterThan(0);
  });
});

describe('setMassArranjo', () => {
  const arr: ArranjoMassa = { n: 12, cx: 0, cy: 0, anguloTotal: 2 * Math.PI };

  it('liga e desliga o arranjo com desfazer e refazer', () => {
    const s = cena();
    s.exec({ type: 'setMassArranjo', id: 'm1', arranjo: arr });
    expect(m(s).arranjo).toEqual(arr);
    s.exec({ type: 'setMassArranjo', id: 'm1', arranjo: null });
    expect(m(s).arranjo).toBeUndefined();
    expect('arranjo' in m(s)).toBe(false);
    s.undo();
    expect(m(s).arranjo).toEqual(arr);
    s.undo();
    expect(m(s).arranjo).toBeUndefined();
    s.redo();
    expect(m(s).arranjo).toEqual(arr);
  });

  it('recusa arranjo inválido', () => {
    const s = cena();
    expect(() => s.exec({ type: 'setMassArranjo', id: 'm1', arranjo: { ...arr, n: 1 } })).toThrow(/arranjo/);
    expect(m(s).arranjo).toBeUndefined();
  });
});

describe('apagar massa pelo comando genérico', () => {
  it('deleteElements remove e o desfazer devolve', () => {
    const s = cena();
    s.exec({ type: 'deleteElements', ids: ['m1'] });
    expect(s.project.elements['m1']).toBeUndefined();
    s.undo();
    expect(isMass(s.project.elements['m1'])).toBe(true);
  });
});

describe('transform da massa', () => {
  const comArranjo = (): ProjectStore => cena({
    secoes: [secao(0, gota, { rotacao: 0.2, dx: 1, dy: 0 }), secao(6, gota, { rotacao: 0.9, dx: 2, dy: 1, escala: 0.8 })],
    arranjo: { n: 6, cx: 10, cy: 0, anguloTotal: Math.PI },
  });
  const tr = (s: ProjectStore, transform: Transform, copy?: { idMap: Record<string, string> }): void => s.exec({ type: 'transform', ids: ['m1'], transform, ...(copy ? { copy } : {}) });

  it('mover: origem e centro do arranjo andam; seções ficam como estão', () => {
    const s = comArranjo();
    const antes = structuredClone(m(s));
    tr(s, { kind: 'translate', d: { x: 3, y: -4 } });
    expect(m(s).origem).toEqual({ x: 5, y: -3 });
    expect(m(s).arranjo).toMatchObject({ cx: 13, cy: -4, n: 6, anguloTotal: Math.PI });
    expect(m(s).secoes).toEqual(antes.secoes);
    s.undo();
    expect(m(s)).toEqual(antes);
    s.redo();
    expect(m(s).origem).toEqual({ x: 5, y: -3 });
  });

  it('girar 90°: soma o ângulo a todas as rotações e gira origem, dx/dy e centro do arranjo', () => {
    const s = comArranjo();
    tr(s, { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 });
    const r = m(s);
    expect(r.origem.x).toBeCloseTo(-1, 12);
    expect(r.origem.y).toBeCloseTo(2, 12);
    expect(r.secoes[0]!.rotacao).toBeCloseTo(0.2 + Math.PI / 2, 12);
    expect(r.secoes[1]!.rotacao).toBeCloseTo(0.9 + Math.PI / 2, 12);
    expect(r.secoes[0]!.dx).toBeCloseTo(0, 12);
    expect(r.secoes[0]!.dy).toBeCloseTo(1, 12);
    expect(r.secoes[1]!.dx).toBeCloseTo(-1, 12);
    expect(r.secoes[1]!.dy).toBeCloseTo(2, 12);
    expect(r.arranjo!.cx).toBeCloseTo(0, 12);
    expect(r.arranjo!.cy).toBeCloseTo(10, 12);
    expect(r.arranjo!.anguloTotal).toBe(Math.PI);
    expect(r.secoes[1]!.escala).toBe(0.8);
    s.undo();
    expect(m(s).origem).toEqual({ x: 2, y: 1 });
  });

  it('espelhar em torno do eixo x: inverte rotações, pontos, dy e o sentido do arranjo, mantendo o anel anti-horário', () => {
    const s = comArranjo();
    tr(s, { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    const r = m(s);
    expect(r.origem).toEqual({ x: 2, y: -1 });
    expect(r.secoes[0]!.rotacao).toBeCloseTo(-0.2, 12);
    expect(r.secoes[1]!.rotacao).toBeCloseTo(-0.9, 12);
    expect(r.secoes[1]!.dy).toBeCloseTo(-1, 12);
    expect(r.arranjo!.anguloTotal).toBe(-Math.PI);
    expect(r.arranjo!.cy).toBeCloseTo(0, 12);
    const p = r.secoes[0]!.perfil;
    expect(p.forma).toBe('livre');
    if (p.forma === 'livre') {
      expect(areaComSinal(p.pontos)).toBeGreaterThan(0);
      expect(p.pontos).toHaveLength(gota.forma === 'livre' ? gota.pontos.length : 0);
      expect(p.pontos).toContainEqual({ x: 0, y: -1 });
    }
    s.undo();
    expect(m(s).secoes[0]!.rotacao).toBe(0.2);
  });

  it('espelhar duas vezes pelo mesmo eixo devolve a massa original', () => {
    const s = comArranjo();
    const antes = structuredClone(m(s));
    const eixo: Transform = { kind: 'mirror', a: { x: 1, y: 1 }, b: { x: 4, y: 3 } };
    tr(s, eixo);
    tr(s, eixo);
    const r = m(s);
    expect(r.origem.x).toBeCloseTo(antes.origem.x, 9);
    expect(r.origem.y).toBeCloseTo(antes.origem.y, 9);
    expect(r.secoes[1]!.rotacao).toBeCloseTo(antes.secoes[1]!.rotacao, 9);
    expect(r.secoes[1]!.dx).toBeCloseTo(antes.secoes[1]!.dx, 9);
    expect(r.arranjo!.anguloTotal).toBeCloseTo(antes.arranjo!.anguloTotal, 12);
  });

  it('cópia cria nova massa com o id mapeado e preserva a original', () => {
    const s = comArranjo();
    tr(s, { kind: 'translate', d: { x: 10, y: 0 } }, { idMap: { m1: 'm2' } });
    expect(m(s, 'm2').origem).toEqual({ x: 12, y: 1 });
    expect(m(s, 'm2').id).toBe('m2');
    expect(m(s).origem).toEqual({ x: 2, y: 1 });
    s.undo();
    expect(s.project.elements['m2']).toBeUndefined();
  });

  it('transformMass não altera a massa de entrada', () => {
    const base = m(comArranjo());
    const antes = structuredClone(base);
    transformMass(base, { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } });
    transformMass(base, { kind: 'rotate', about: { x: 1, y: 1 }, angle: 1 });
    expect(base).toEqual(antes);
  });
});

describe('normalizarPerfil', () => {
  it('não mexe em perfis que não são livres nem em livres anti-horários', () => {
    const c: PerfilMassa = { forma: 'circulo', raio: 2 };
    expect(normalizarPerfil(c)).toBe(c);
    expect(normalizarPerfil(caixa)).toBe(caixa);
  });
});

describe('categoria gráfica e nível da massa', () => {
  it("'mass' é categoria gráfica com estilo e substituição padrão", () => {
    expect(GRAPHICS_CATEGORIES).toContain('mass');
    expect(DEFAULT_CATEGORY_STYLES.mass).toBeDefined();
    expect(defaultOverrides().mass.visible).toBe(true);
  });

  it('a massa tem nível próprio; trocar de nível preservando a cota ajusta baseOffset', () => {
    const s = cena();
    s.exec({ type: 'upsertLevel', level: { ...s.project.levels[0]!, id: 'lv_x', name: 'Nível X', elevation: 3 } });
    expect(elementLevelId(m(s))).toBe('lv_0');
    const p = structuredClone(s.project);
    applyElementLevel(p, { ids: ['m1'], levelId: 'lv_x', keep: 'elevation' });
    expect((p.elements['m1'] as Mass).levelId).toBe('lv_x');
    expect((p.elements['m1'] as Mass).baseOffset).toBeCloseTo(-3, 12);
  });
});
