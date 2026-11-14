import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_CORTE_MASSA, servicoMassa, type LinhaCorteMassaProjeto, type SectionResult } from '@hestia/engine';
import { massaM1, massaM3, RAIO_M3 } from '@hestia/engine/src/fixtureMassa.ts';
import { createEmptyProject, makeLevel, ProjectStore, type Id, type Project } from '@hestia/model';
import { elevationFrameBox } from '../plan/molduraDoNivel.ts';
import { LIGHT, type FillOp, type StrokeOp } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { massaCorteOps, massasNaCaixaDoCorte, pickMassaNoCorte } from './massa.ts';
import { pickMassaNoCorte as pickPeloPick } from './pick.ts';
import { sectionStyleOf } from './style.ts';

/**
 * Massa no corte e na elevação (ficha V3): as linhas vêm do kernel (consulta 143), aqui simuladas no formato `LinhaCorteMassaProjeto` em
 * `(s, z)`. M1 (caixa) e M3 (torre torcida) de `fixtureMassa.ts`, como no resto da frente.
 */

afterEach(() => vi.restoreAllMocks());

/** Anel fechado (o kernel repete o primeiro ponto no fim). */
const anel = (s0: number, z0: number, s1: number, z1: number): Array<{ s: number; z: number }> => [
  { s: s0, z: z0 },
  { s: s1, z: z0 },
  { s: s1, z: z1 },
  { s: s0, z: z1 },
  { s: s0, z: z0 },
];

/** M1 cortada (s 0 a 10), com a projeção atrás dela (z 9 a 11); M3 cortada (s 12 a 14) com uma feição no meio. */
const LINHAS: LinhaCorteMassaProjeto[] = [
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(0, 0, 10, 9) },
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.projetado, pontos: anel(1, 9, 9, 11) },
  { massaId: 'm3', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(12, 0, 14, 9) },
  { massaId: 'm3', copia: 0, estilo: ESTILO_CORTE_MASSA.feicao, pontos: [{ s: 13, z: 0 }, { s: 13, z: 9 }] },
];

const ptsDe = (l: LinhaCorteMassaProjeto): Array<{ x: number; y: number }> => l.pontos.map((q) => ({ x: q.s, y: q.z }));
const mesmoAnel = (a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean => a.length === b.length && a.every((q, i) => q.x === b[i]!.x && q.y === b[i]!.y);

/** Projeto só com as massas M1 e M3, no nível de cota 0. */
function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  s.exec({ type: 'addMass', mass: massaM1() });
  s.exec({ type: 'addMass', mass: massaM3() });
  return s.project;
}

/** Seção ao longo de x de (0, 0) a (10, 0); a profundidade é a do plano (pequena no corte, grande na elevação). */
const secao = (depth = 3): SectionResult =>
  ({ length: 10, zMin: 0, zMax: 12, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [], plano: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth } }) as unknown as SectionResult;

const entrada = (p: Project, s: SectionResult, extra: Partial<SectionInput> = {}): SectionInput => ({
  project: p, section: s, viewport: { cx: 5, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false, ...extra,
});

/** Traços e preenchimentos de massa de um desenho (os que casam com as linhas simuladas). */
const tracosDaMassa = (strokes: Array<{ pts: Array<{ x: number; y: number }> }>) => strokes.filter((x) => LINHAS.some((l) => mesmoAnel(ptsDe(l), x.pts)));

function desenhar(p: Project, s: SectionResult, opts: { hidden?: ReadonlySet<Id>; selection?: Id[]; hover?: Id | null; visible?: boolean } = {}) {
  const paint = { ...sectionStyleOf(p, 60).paint.mass, visible: opts.visible ?? true };
  const fills: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  massaCorteOps(p, s, LIGHT, false, opts.hidden, paint, fills, strokes, { selection: opts.selection ?? [], hover: opts.hover ?? null });
  return { fills, strokes, paint };
}

describe('massa no corte: desenho pelos estilos do kernel', () => {
  const p = projeto();
  const s = secao();

  it('corte: cortado com contorno pesado e preenchimento claro; projetado fino; feição aberta e mais fraca', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { fills, strokes, paint } = desenhar(p, s);
    expect(fills).toHaveLength(2);
    expect(fills.every((f) => f.alpha === 1 && f.polygons.length === 1)).toBe(true);
    const tr = tracosDaMassa(strokes);
    expect(tr).toHaveLength(4);
    const cortadoM1 = strokes.find((x) => mesmoAnel(x.pts, ptsDe(LINHAS[0]!)))!;
    expect(cortadoM1).toMatchObject({ closed: true, color: LIGHT.ink, widthPx: paint.cut.widthPx });
    const projetadoM1 = strokes.find((x) => mesmoAnel(x.pts, ptsDe(LINHAS[1]!)))!;
    expect(projetadoM1).toMatchObject({ closed: true, widthPx: paint.proj.widthPx });
    expect(projetadoM1.color).not.toBe(LIGHT.ink);
    const feicao = strokes.find((x) => mesmoAnel(x.pts, ptsDe(LINHAS[3]!)))!;
    expect(feicao).toMatchObject({ closed: false, widthPx: paint.proj.widthPx });
    expect(feicao.color).not.toBe(projetadoM1.color);
  });

  it('elevação (plano de profundidade grande): mesma contagem e o plano vai ao kernel com essa profundidade', () => {
    const corte = vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { fills, strokes } = desenhar(p, secao(30));
    expect(corte).toHaveBeenCalledWith(p, null, 0, 0, 10, 0, 30);
    expect(fills).toHaveLength(2);
    expect(tracosDaMassa(strokes)).toHaveLength(4);
  });

  it('buildSectionDrawList liga a massa: as linhas dela entram no desenho do corte', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const r = buildSectionDrawList(entrada(p, s));
    expect(tracosDaMassa(r.strokes)).toHaveLength(4);
    expect(r.fills.filter((f) => f.polygons.some((poly) => poly.some((ring) => mesmoAnel(ring, ptsDe(LINHAS[0]!)))))).toHaveLength(1);
  });
});

describe('massa no corte: seleção, cursor, ocultação e categoria', () => {
  const p = projeto();
  const s = secao();

  it('selecionada: contorno de 2 px na cor de seleção e preenchimento 0,25 nas peças dela; a outra massa não', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { fills, strokes } = desenhar(p, s, { selection: ['m1'] });
    const sel = strokes.filter((x) => x.color === LIGHT.select);
    expect(sel).toHaveLength(2);
    expect(sel.every((x) => x.widthPx === 2 && x.alpha === 1)).toBe(true);
    // Preenchimento 0,25 nas duas peças fechadas de m1 (cortada e projetada), como no guarda-corpo; nenhuma de m3.
    expect(fills.filter((f) => f.color === LIGHT.select && f.alpha === 0.25)).toHaveLength(2);
    expect(sel.some((x) => mesmoAnel(x.pts, ptsDe(LINHAS[2]!)))).toBe(false);
  });

  it('o realce sai depois das linhas normais da massa (fica por cima)', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { strokes } = desenhar(p, s, { selection: ['m1'] });
    const ultimaNormal = strokes.map((x, i) => (x.color !== LIGHT.select && tracosDaMassa([x]).length > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const primeiraSelecao = strokes.findIndex((x) => x.color === LIGHT.select);
    expect(primeiraSelecao).toBeGreaterThan(ultimaNormal);
  });

  it('cursor por cima (sem seleção): contorno de 1,5 px com alpha 0,55, sem preenchimento', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { fills, strokes } = desenhar(p, s, { hover: 'm3' });
    const sel = strokes.filter((x) => x.color === LIGHT.select);
    expect(sel.length).toBeGreaterThan(0);
    expect(sel.every((x) => x.widthPx === 1.5 && x.alpha === 0.55)).toBe(true);
    expect(fills.filter((f) => f.color === LIGHT.select)).toHaveLength(0);
  });

  it('categoria "massa" desligada na vista: nada da massa é desenhado', () => {
    const corte = vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { fills, strokes } = desenhar(p, s, { visible: false });
    expect(fills).toHaveLength(0);
    expect(tracosDaMassa(strokes)).toHaveLength(0);
    expect(corte).not.toHaveBeenCalled();
  });

  it('massa oculta na vista (Hide in View) não desenha; a outra desenha', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { fills, strokes } = desenhar(p, s, { hidden: new Set<Id>(['m1']) });
    expect(fills).toHaveLength(1);
    expect(tracosDaMassa(strokes).every((x) => !mesmoAnel(x.pts, ptsDe(LINHAS[0]!)))).toBe(true);
    expect(tracosDaMassa(strokes)).toHaveLength(2);
  });
});

describe('massa no corte: sem kernel', () => {
  it('kernel fora (o kernel real não está carregado): não lança e não desenha nada', () => {
    const p = projeto();
    const { fills, strokes } = desenhar(p, secao());
    expect(fills).toHaveLength(0);
    expect(strokes).toHaveLength(0);
  });

  it('kernel devolve null: não desenha e não lança', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(null);
    const p = projeto();
    expect(() => desenhar(p, secao())).not.toThrow();
    expect(desenhar(p, secao()).strokes).toHaveLength(0);
  });
});

describe('massa no corte: clique e caixa de seleção', () => {
  const p = projeto();
  const s = secao();

  it('clique dentro do contorno cortado de m1 pega m1, com o tipo mass; longe, nada', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    expect(pickMassaNoCorte(p, s, undefined, { x: 5, y: 4.5 }, 0.1)).toBe('m1');
    expect(pickMassaNoCorte(p, s, undefined, { x: 30, y: 4.5 }, 0.1)).toBeNull();
  });

  it('o re-export pelo pick.ts é o mesmo (é ele que o barrel do render expõe)', () => {
    expect(pickPeloPick).toBe(pickMassaNoCorte);
  });

  it('clique na massa oculta ou sem kernel não pega nada', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    expect(pickMassaNoCorte(p, s, new Set<Id>(['m1']), { x: 5, y: 4.5 }, 0.1)).toBeNull();
    vi.restoreAllMocks();
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(null);
    expect(pickMassaNoCorte(p, s, undefined, { x: 5, y: 4.5 }, 0.1)).toBeNull();
  });

  it('caixa em janela pega só a massa inteira dentro dela; em cruzamento pega toda que toca a caixa', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    // A projeção de m1 vai até z 11: a caixa precisa cobrir isso para a janela aceitar m1.
    expect(massasNaCaixaDoCorte(p, s, undefined, { x: -1, y: -1 }, { x: 11, y: 12 })).toEqual(['m1']);
    // m3 sobra para fora da janela (s até 14, a caixa para em 13): só m1 entra.
    expect(massasNaCaixaDoCorte(p, s, undefined, { x: -1, y: -1 }, { x: 13, y: 12 })).toEqual(['m1']);
    // Cruzamento (caixa da direita para a esquerda): toda massa que toca a caixa.
    expect(massasNaCaixaDoCorte(p, s, undefined, { x: 13, y: 12 }, { x: -1, y: -1 })).toEqual(['m1', 'm3']);
  });

  it('sem kernel, a caixa não pega nada', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(null);
    expect(massasNaCaixaDoCorte(p, s, undefined, { x: -1, y: -1 }, { x: 30, y: 30 })).toEqual([]);
  });
});

describe('elevação de projeto só com massas', () => {
  it('a caixa da elevação de edifício existe e cobre as massas (não vem vazia)', () => {
    const p = projeto();
    const box = elevationFrameBox(p, 'lv_0');
    expect(box).not.toBeNull();
    expect(box!.minX).toBeLessThanOrEqual(-RAIO_M3);
    expect(box!.maxX).toBeGreaterThanOrEqual(RAIO_M3);
    expect(box!.minY).toBeLessThanOrEqual(-RAIO_M3);
    expect(box!.maxY).toBeGreaterThanOrEqual(RAIO_M3);
  });
});
