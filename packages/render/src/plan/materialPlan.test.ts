import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, type Material, type Project } from '@hestia/model';
import { corPadraoCorte, corPadraoSuperficie } from './materialPlan.ts';
import { floorFills } from './floors.ts';
import { slabFills } from './slabs.ts';
import { mix } from './color.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const mat = (extra: Partial<Material> = {}): Material => ({ id: 'm', name: 'M', color: '#336699', hatch: 'diagonal', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2', ...extra }) as Material;
const base = { dark: false, detail: 'medium' as const };

describe('corPadraoCorte / corPadraoSuperficie', () => {
  it('sem blocos: igual ao cálculo antigo (cor do material, mistura 0.45 com preto)', () => {
    for (const f of [corPadraoCorte, corPadraoSuperficie]) {
      const r = f(mat(), base);
      expect(r.fundo).toBe('#336699');
      expect(r.padrao).toEqual({ kind: 'diagonal', color: mix('#336699', '#000000', 0.45) });
    }
    expect(corPadraoCorte(mat(), { ...base, dark: true }).padrao?.color).toBe(mix('#336699', '#ffffff', 0.45));
  });
  it('a substituição de cor da vista vira a base da mistura padrão', () => {
    expect(corPadraoCorte(mat(), { ...base, paint: { color: '#ff0000' } }).padrao?.color).toBe(mix('#ff0000', '#000000', 0.45));
  });
  it('sem material: fundo de reserva e sem padrão', () => {
    expect(corPadraoCorte(undefined, base)).toEqual({ fundo: '#999999', padrao: undefined });
  });
  it('corte e superfície leem blocos diferentes', () => {
    const m = mat({ graficos: { corte: { planoDeFundo: { cor: '#111111' }, primeiroPlano: { padrao: 'cross', cor: '#222222' } }, superficie: { primeiroPlano: { padrao: 'dots' } } } });
    expect(corPadraoCorte(m, base)).toEqual({ fundo: '#111111', padrao: { kind: 'cross', color: '#222222' } });
    expect(corPadraoSuperficie(m, base)).toEqual({ fundo: '#336699', padrao: { kind: 'dots', color: mix('#336699', '#000000', 0.45) } });
  });
  it('cor custom do primeiro plano ganha da mistura; sem ela, vale a mistura', () => {
    const m = mat({ graficos: { corte: { primeiroPlano: { cor: '#abcdef' } } } });
    expect(corPadraoCorte(m, base).padrao).toEqual({ kind: 'diagonal', color: '#abcdef' });
  });
  it('o padrão do tipo do elemento vence o do material', () => {
    const m = mat({ graficos: { superficie: { primeiroPlano: { padrao: 'dots' } } } });
    expect(corPadraoSuperficie(m, { ...base, hachuraTipo: 'gesso' }).padrao?.kind).toBe('gesso');
  });
  it("hachura 'none' (do material, dos gráficos ou do tipo) e nível grosseiro removem o padrão", () => {
    expect(corPadraoCorte(mat({ hatch: 'none' }), base).padrao).toBeUndefined();
    expect(corPadraoCorte(mat({ graficos: { corte: { primeiroPlano: { padrao: 'none' } } } }), base).padrao).toBeUndefined();
    expect(corPadraoSuperficie(mat(), { ...base, hachuraTipo: 'none' }).padrao).toBeUndefined();
    expect(corPadraoCorte(mat(), { ...base, detail: 'coarse' }).padrao).toBeUndefined();
  });
});

const VIEW: Viewport = { cx: 5, cy: 4, zoom: 100, width: 800, height: 600 };
const RECT = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];

type Graficos = NonNullable<Material['graficos']>;

/** Projeto com um piso ou uma laje; o material da camada principal do tipo recebe `graficos` (editado antes de congelar o projeto). */
function projeto(tipo: 'piso' | 'laje', graficos?: Graficos): Project {
  const p0 = createEmptyProject();
  const layers = tipo === 'piso' ? p0.floorTypes.ft_unico!.layers : p0.slabTypes[Object.keys(p0.slabTypes)[0]!]!.layers;
  const camada = (tipo === 'piso' ? layers.find((l) => !(l as { membrane?: boolean }).membrane) : layers.find((l) => l.function === 'structure') ?? layers[0])!;
  if (graficos) p0.materials[camada.materialId] = { ...p0.materials[camada.materialId]!, graficos };
  const s = new ProjectStore(p0);
  if (tipo === 'piso') s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_unico', levelId: 'lv_0', boundary: RECT }) });
  else s.exec({ type: 'addSlab', slab: makeSlab({ id: 'l', typeId: Object.keys(p0.slabTypes)[0]!, levelId: 'lv_0', boundary: RECT }) });
  return s.project;
}

describe('planta fim a fim com graficos', () => {
  it('piso usa graficos.superficie (fundo e padrão); graficos.corte não interfere', () => {
    const antes = floorFills(projeto('piso'), 'lv_0', LIGHT, false, 'medium', VIEW).fills[0]!;
    const p = projeto('piso', { superficie: { planoDeFundo: { cor: '#102030' }, primeiroPlano: { padrao: 'cross', cor: '#405060' } }, corte: { planoDeFundo: { cor: '#ff00ff' } } });
    const dep = floorFills(p, 'lv_0', LIGHT, false, 'medium', VIEW).fills[0]!;
    expect(dep.color).not.toBe(antes.color);
    expect(dep.color).toBe(mix('#102030', '#ffffff', 0.74));
    expect(dep.hatch).toMatchObject({ kind: 'cross', color: '#405060' });
  });
  it('laje cortada usa graficos.corte', () => {
    const p = projeto('laje', { corte: { planoDeFundo: { cor: '#102030' }, primeiroPlano: { padrao: 'dots', cor: '#405060' } } });
    const f = slabFills(p, 'lv_0', LIGHT, false, 'medium', VIEW).fills[0]!;
    expect(f.color).toBe(mix('#102030', '#ffffff', 0.6));
    expect(f.hatch).toMatchObject({ kind: 'dots', color: '#405060' });
  });
});
