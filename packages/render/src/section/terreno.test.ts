import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeSection, projetoTerreno, servicoTerreno, type LinhaCorteTN, type SectionResult } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Id, type Project } from '@hestia/model';
import { elevationFrameBox } from '../plan/molduraDoNivel.ts';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { sectionStyleOf } from './style.ts';
import { COR_PADRAO_TERRENO, TRACO_PERFIL_EXISTENTE, linhasDoTerrenoNoCorte, pickTerrenoNoCorte, terrenosNaCaixaDoCorte, terrenosVisiveisNoCorte } from './terreno.ts';

/**
 * Terreno no corte e na elevação (ficha V3) com linhas simuladas do kernel (a verificação com o Rust real, T2, T3 e T5, está em
 * tests/kernel-terreno-corte-vista.wasm.test.ts). Aqui: contagem e estilo das operações, ordem (atrás do edifício), seleção, realce, categoria,
 * ocultação, reserva sem kernel e elevação de um projeto só com terreno.
 */

const v = (x: number, y: number) => ({ x, y });
const pt = (s: number, z: number) => ({ s, z });

/** T5 em corte (y = 10, +x): solo cortado (perfil com a plataforma em z = 8, fechado em z = 5), perfil existente (z = 10) e uma silhueta. */
const T5: LinhaCorteTN[] = [
  { terrenoId: 'tn_t5', papel: 'cortado', fechada: true, pontos: [pt(0, 10), pt(5, 10), pt(5, 8), pt(15, 8), pt(15, 10), pt(20, 10), pt(20, 5), pt(0, 5)] },
  { terrenoId: 'tn_t5', papel: 'perfilExistente', fechada: false, pontos: [pt(0, 10), pt(20, 10)] },
  { terrenoId: 'tn_t5', papel: 'silhueta', fechada: false, pontos: [pt(0, 10), pt(20, 10)] },
];
/** T2 em corte: rampa de 10,25 a 12,25, sem perfil existente. */
const T2: LinhaCorteTN[] = [{ terrenoId: 'tn_t2', papel: 'cortado', fechada: true, pontos: [pt(0, 10.25), pt(20, 12.25), pt(20, 7.25), pt(0, 7.25)] }];
/** T3 em elevação: só a silhueta da pirâmide. */
const T3: LinhaCorteTN[] = [{ terrenoId: 'tn_t3', papel: 'silhueta', fechada: false, pontos: [pt(0, 0), pt(10, 5), pt(20, 0)] }];

const secao = (depth = 12): SectionResult =>
  ({ length: 20, zMin: 0, zMax: 12, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [], plano: { a: v(0, 10), b: v(20, 10), depth } }) as unknown as SectionResult;

const falso = (linhas: LinhaCorteTN[]) => vi.spyOn(servicoTerreno(), 'corte').mockReturnValue(linhas);
const entrada = (p: Project, s: SectionResult, extra: Partial<SectionInput> = {}): SectionInput => ({
  project: p, section: s, viewport: { cx: 10, cy: 8, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false, ...extra,
});
const tracejados = (r: { strokes: Array<{ dash?: [number, number] }> }) => r.strokes.filter((s) => s.dash?.[0] === TRACO_PERFIL_EXISTENTE[0] && s.dash?.[1] === TRACO_PERFIL_EXISTENTE[1]);
const comOverride = (p: Project, patch: object): Project => {
  const st = new ProjectStore(p);
  st.exec({ type: 'setSectionGraphics', patch } as never);
  return st.project;
};

afterEach(() => vi.restoreAllMocks());

describe('terreno no corte: operações de desenho', () => {
  it('T5: solo cortado com preenchimento e contorno de corte, perfil existente tracejado e silhueta em linha fina', () => {
    falso(T5);
    const p = projetoTerreno('T5');
    const r = buildSectionDrawList(entrada(p, secao()));
    const { cut, proj } = sectionStyleOf(p, 60).paint.site;
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0]!.polygons[0]![0]).toHaveLength(8);
    expect(r.fills[0]!.hatch).toBeUndefined();
    const fechados = r.strokes.filter((s) => s.closed && s.widthPx === cut.widthPx && s.pts.length === 8);
    expect(fechados).toHaveLength(1);
    const t = tracejados(r) as typeof r.strokes;
    expect(t).toHaveLength(1);
    expect(t[0]!.closed).toBe(false);
    expect(t[0]!.widthPx).toBe(proj.widthPx);
    const silhuetas = r.strokes.filter((s) => !s.closed && !s.dash && s.pts.length === 2 && s.widthPx === proj.widthPx && s.pts[0]!.y === 10);
    expect(silhuetas).toHaveLength(1);
  });

  it('T2: só o solo cortado (um preenchimento, um contorno), nenhum tracejado', () => {
    falso(T2);
    const r = buildSectionDrawList(entrada(projetoTerreno('T2'), secao()));
    expect(r.fills).toHaveLength(1);
    expect(r.strokes.filter((s) => s.closed && s.pts.length === 4)).toHaveLength(1);
    expect(tracejados(r)).toHaveLength(0);
  });

  it('T3 em elevação: só silhueta (linha aberta fina); nenhum preenchimento, nenhum tracejado', () => {
    falso(T3);
    const p = projetoTerreno('T3');
    const r = buildSectionDrawList(entrada(p, secao(40)));
    expect(r.fills).toHaveLength(0);
    expect(tracejados(r)).toHaveLength(0);
    const sil = r.strokes.filter((s) => !s.closed && s.pts.length === 3 && s.widthPx === sectionStyleOf(p, 60).paint.site.proj.widthPx);
    expect(sil).toHaveLength(1);
  });

  it('o peso do contorno cortado é o de corte da categoria site (maior que o de projeção)', () => {
    falso(T2);
    const p = projetoTerreno('T2');
    const g = comOverride(p, { scale: 50 });
    const { cut, proj } = sectionStyleOf(g, 60).paint.site;
    expect(cut.widthPx).toBeGreaterThan(proj.widthPx);
    const r = buildSectionDrawList(entrada(g, secao()));
    expect(r.strokes.some((s) => s.closed && s.pts.length === 4 && s.widthPx === cut.widthPx)).toBe(true);
  });

  it('cor sólida sem material (padrão do solo); com material, a cor e a hachura dele', () => {
    falso(T2);
    const p = projetoTerreno('T2');
    const sem = buildSectionDrawList(entrada(p, secao()));
    expect(sem.fills[0]!.hatch).toBeUndefined();
    expect(sem.fills[0]!.color).not.toBe(COR_PADRAO_TERRENO);
    const st = new ProjectStore(p);
    st.exec({ type: 'updateTerrain', id: 'tn_t2', patch: { materialId: 'mat_concreto' } });
    const com = buildSectionDrawList(entrada(st.project, secao()));
    expect(com.fills[0]!.hatch?.kind).toBe('cross');
  });

  it('é desenhado ANTES do edifício: o preenchimento e o contorno do terreno vêm primeiro nas listas', () => {
    falso(T2);
    const st = new ProjectStore(projetoTerreno('T2'));
    st.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
    const s = computeSection(st.project, { a: v(2, -1), b: v(2, 1), depth: 3 });
    const r = buildSectionDrawList(entrada(st.project, s));
    expect(r.fills.length).toBeGreaterThan(1);
    expect(r.fills[0]!.polygons[0]![0]).toHaveLength(4);
    const iTerreno = r.strokes.findIndex((x) => x.pts.length === 4 && x.pts.some((q) => q.y === 12.25));
    const iParede = r.strokes.findIndex((x) => x.closed && x.widthPx === 2.2);
    expect(iTerreno).toBeGreaterThanOrEqual(0);
    expect(iTerreno).toBeLessThan(iParede);
  });

  it('modo arame (sem preenchimento) mantém só os contornos', () => {
    falso(T2);
    const g = comOverride(projetoTerreno('T2'), { style: 'wireframe' });
    const r = buildSectionDrawList(entrada(g, secao()));
    expect(r.fills).toHaveLength(0);
    expect(r.strokes.some((s) => s.closed && s.pts.length === 4)).toBe(true);
  });
});

describe('terreno no corte: visibilidade', () => {
  it('categoria site desligada: some do corte e da elevação', () => {
    falso(T5);
    const g = comOverride(projetoTerreno('T5'), { overrides: { site: { visible: false } } });
    const r = buildSectionDrawList(entrada(g, secao()));
    expect(r.fills).toHaveLength(0);
    expect(tracejados(r)).toHaveLength(0);
    expect(r.strokes.filter((s) => s.pts.length === 8)).toHaveLength(0);
    expect(buildSectionDrawList(entrada(g, secao(40))).strokes.filter((s) => s.pts.length === 2 && s.pts[0]!.y === 10)).toHaveLength(0);
  });

  it('terreno oculto na vista: nada; revelado: contorno azul por cima, sem sumir', () => {
    falso(T5);
    const p = projetoTerreno('T5');
    expect(buildSectionDrawList(entrada(p, secao(), { hidden: new Set(['tn_t5']) })).fills).toHaveLength(0);
    const rev = buildSectionDrawList(entrada(p, secao(), { revealed: new Set(['tn_t5']) }));
    expect(rev.fills).toHaveLength(1);
    expect(rev.strokes.filter((s) => s.color === '#2563eb')).toHaveLength(3);
  });

  it('sem kernel: nada é desenhado e nada lança (o desenho é o de um projeto sem terreno)', () => {
    const p = projetoTerreno('T5');
    const com = buildSectionDrawList(entrada(p, secao()));
    const sem = buildSectionDrawList(entrada(createEmptyProject(), secao()));
    expect(com.fills).toHaveLength(0);
    expect(com.strokes).toHaveLength(sem.strokes.length);
    expect(linhasDoTerrenoNoCorte(p, secao(), undefined)).toEqual([]);
  });

  it('projeto sem terreno: o kernel nem é consultado; seção sem plano: nada', () => {
    const corte = falso(T5);
    buildSectionDrawList(entrada(createEmptyProject(), secao()));
    expect(corte).not.toHaveBeenCalled();
    const semPlano = { ...secao(), plano: undefined } as unknown as SectionResult;
    expect(linhasDoTerrenoNoCorte(projetoTerreno('T5'), semPlano, undefined)).toEqual([]);
  });

  it('o lote e a região como elemento não são desenhados: só as linhas do terreno', () => {
    falso(T5);
    const r = buildSectionDrawList(entrada(projetoTerreno('T5'), secao()));
    // T5 tem a região rg_t5: 1 preenchimento e 3 linhas, nada do contorno da região (4 pontos).
    expect(r.fills).toHaveLength(1);
    expect(r.strokes.filter((s) => s.pts.length === 4)).toHaveLength(0);
  });
});

describe('terreno no corte: seleção e realce', () => {
  const p = projetoTerreno('T5');
  const paint = sectionStyleOf(p, 60).paint.site;

  it('clique no solo cortado, perto do perfil e fora', () => {
    falso(T5);
    const s = secao();
    expect(pickTerrenoNoCorte(p, s, undefined, paint, v(10, 6), 0.05)).toBe('tn_t5');
    expect(pickTerrenoNoCorte(p, s, undefined, paint, v(10, 10.04), 0.05)).toBe('tn_t5');
    expect(pickTerrenoNoCorte(p, s, undefined, paint, v(10, 12), 0.05)).toBeNull();
    expect(pickTerrenoNoCorte(p, s, new Set<Id>(['tn_t5']), paint, v(10, 6), 0.05)).toBeNull();
    expect(pickTerrenoNoCorte(p, s, undefined, { ...paint, visible: false }, v(10, 6), 0.05)).toBeNull();
  });

  it('caixa: janela exige todas as linhas dentro; cruzamento basta tocar; a silhueta sozinha (elevação) também entra', () => {
    falso(T5);
    const s = secao();
    expect(terrenosNaCaixaDoCorte(p, s, undefined, paint, v(-1, 4), v(21, 11))).toEqual(['tn_t5']);
    expect(terrenosNaCaixaDoCorte(p, s, undefined, paint, v(5, 7), v(8, 9))).toEqual([]);
    expect(terrenosNaCaixaDoCorte(p, s, undefined, paint, v(8, 9), v(5, 7))).toEqual(['tn_t5']);
    expect(terrenosVisiveisNoCorte(p, s, undefined, paint)).toEqual(['tn_t5']);
    falso(T3);
    expect(terrenosNaCaixaDoCorte(p, s, undefined, paint, v(-1, -1), v(21, 6))).toEqual(['tn_t3']);
    expect(terrenosNaCaixaDoCorte(p, s, undefined, paint, v(9, 4), v(11, 6))).toEqual([]);
    expect(terrenosNaCaixaDoCorte(p, s, undefined, paint, v(11, 6), v(9, 4))).toEqual(['tn_t3']);
  });

  it('selecionado: contorno de 2 px na cor de seleção e preenchimento 0,25 no solo; cursor: contorno fraco; sem realce nenhum, nada', () => {
    falso(T5);
    const sem = buildSectionDrawList(entrada(p, secao(), { highlight: { selection: [], hover: null } }));
    expect(sem.strokes.filter((s) => s.color === LIGHT.select)).toHaveLength(0);
    const sel = buildSectionDrawList(entrada(p, secao(), { highlight: { selection: ['tn_t5'], hover: null } }));
    expect(sel.fills.filter((f) => f.color === LIGHT.select && f.alpha === 0.25)).toHaveLength(1);
    const lin = sel.strokes.filter((s) => s.color === LIGHT.select && s.widthPx === 2);
    expect(lin).toHaveLength(3);
    expect(lin.filter((s) => s.closed)).toHaveLength(1);
    const hov = buildSectionDrawList(entrada(p, secao(), { highlight: { selection: [], hover: 'tn_t5' } }));
    expect(hov.strokes.filter((s) => s.color === LIGHT.select && s.widthPx === 1.5 && s.alpha === 0.55)).toHaveLength(3);
    expect(hov.fills.filter((f) => f.color === LIGHT.select)).toHaveLength(0);
    const outro = buildSectionDrawList(entrada(p, secao(), { highlight: { selection: ['outro'], hover: null } }));
    expect(outro.strokes.filter((s) => s.color === LIGHT.select)).toHaveLength(0);
  });
});

describe('elevação de edifício num projeto só com terreno', () => {
  it('a extensão do modelo traz a caixa do terreno (T3) e a elevação é desenhada com a silhueta', () => {
    const p = projetoTerreno('T3');
    const b = elevationFrameBox(p, 'lv_0');
    expect(b).not.toBeNull();
    expect(b!.minX).toBeLessThanOrEqual(0);
    expect(b!.maxX).toBeGreaterThanOrEqual(20);
    expect(b!.maxY).toBeGreaterThanOrEqual(20);
    falso(T3);
    const linha = { a: v(b!.minX, b!.minY), b: v(b!.maxX, b!.minY), depth: b!.maxY - b!.minY };
    const s = computeSection(p, linha);
    expect(s.length).toBeGreaterThan(20);
    const r = buildSectionDrawList(entrada(p, s));
    expect(r.strokes.some((x) => !x.closed && x.pts.length === 3)).toBe(true);
  });
});
