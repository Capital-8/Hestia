import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { resolveLevel, resolveRoofs, type ResolvedRoof } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeRoof, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { roofFillBase, roofFills, roofFootprint, roofOps } from './roofs.ts';
import { corDaAresta } from './roofsAgua.ts';
import { ALPHA_LINHA_PROJECAO, PREENCHIMENTO_PROJECAO, projecaoDoTelhado, TRACO_PROJECAO, TRACO_RINCAO } from './roofsProjecao.ts';
import { espessurasDoTelhado } from './roofsTracos.ts';
import { defaultPaint } from './style.ts';
import { DARK, LIGHT, type StrokeOp } from './types.ts';
import type { Viewport } from '../viewport.ts';

const P = (x: number, y: number): Vec2 => ({ x, y });
const VIEW: Viewport = { cx: 4, cy: 3, zoom: 100, width: 800, height: 600 };
const RECT = [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 6.3), P(-0.3, 6.3)];
const L_BOUNDARY = [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 3.3), P(4.3, 3.3), P(4.3, 6.3), P(-0.3, 6.3)];
const MANSARD = { lowerPercent: 100, upperPercent: 30, run: 2 };

/** Projeto com um telhado; a cota do beiral (2,80 m) fica acima do topo padrão (2,30 m), então o telhado está oculto. */
function projetoCom(roof: ReturnType<typeof makeRoof>): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoof', roof });
  return s.project;
}

/** Telhado de quatro águas (`hip`) sobre a pegada retangular de 8 × 6 m. */
const casaHip = (): Project => projetoCom(makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: RECT, heightOffset: 2.8, shape: 'hip', slopePercent: 30, dir: P(1, 0) }));

/** Projeção do telhado oculto (`hidden`) com a opção ligada, como a vista faz para os telhados fora do intervalo. */
const projecao = (p: Project, tema = LIGHT, dark = false, detail: 'coarse' | 'medium' = 'medium', extra: { planMode?: boolean } = {}) =>
  roofFills(p, 'lv_0', tema, dark, detail, VIEW, { hidden: new Set(['r']), showProjection: true, ...extra });

const mesmaLinha = (s: StrokeOp, a: Vec2, b: Vec2): boolean => !s.closed && s.pts.length === 2 && JSON.stringify(s.pts) === JSON.stringify([a, b]);

function input(p: Project, over: Partial<PlanInput> = {}): PlanInput {
  return {
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: VIEW,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    ...over,
  };
}

describe('projeção da cobertura: forma completa do telhado oculto', () => {
  it('contorno tracejado, linhas internas tracejadas finas e preenchimento leve por água, sem seta nem rótulo', () => {
    const p = casaHip();
    const [r] = resolveRoofs(p, 'lv_0') as ResolvedRoof[];
    const base = roofFillBase(p, r!, LIGHT, false, defaultPaint('roof', 100));
    const o = projecao(p);
    // Uma face por água, com o tom do telhado cortado (mesma luz do 3D).
    const cortado = roofOps([r!], p, LIGHT, false, 'medium', VIEW).fills.filter((f) => f.alpha === 0.98).map((f) => f.color);
    expect(o.fills.map((f) => f.color)).toEqual(cortado);
    expect(o.fills).toHaveLength(r!.planes.length);
    expect(o.fills.every((f) => f.alpha === PREENCHIMENTO_PROJECAO && f.hatch === undefined)).toBe(true);
    // Beiral: um contorno fechado tracejado, na tinta, como antes.
    const contorno = o.strokes.filter((s) => s.closed && s.dash);
    expect(contorno).toHaveLength(1);
    expect(contorno[0]!.dash).toEqual(TRACO_PROJECAO);
    expect(contorno[0]!.color).toBe(LIGHT.ink);
    // Cumeeira e espigões: traços abertos tracejados na cor da aresta, com a espessura de projeção.
    const esp = espessurasDoTelhado(defaultPaint('roof', 100));
    const internas = r!.lines.filter((l) => l.kind === 'ridge' || l.kind === 'hip');
    expect(internas.length).toBeGreaterThan(0);
    for (const ln of internas) {
      const s = o.strokes.find((st) => mesmaLinha(st, ln.a, ln.b));
      expect(s, `${ln.kind} sem traço`).toBeDefined();
      expect(s!.dash).toEqual(TRACO_PROJECAO);
      expect(s!.color).toBe(corDaAresta(base));
      expect(s!.alpha).toBe(ALPHA_LINHA_PROJECAO);
      expect(s!.widthPx).toBe(esp.projecao.widthPx);
    }
    // Sem seta de caimento (cor do caimento) e sem rótulo de área ou percentual.
    expect(o.strokes.some((s) => s.color === LIGHT.roofSlope)).toBe(false);
    expect(o.labels).toHaveLength(0);
  });

  it('o rincão sai com pontilhado distinto do tracejado da cumeeira', () => {
    const p = projetoCom(makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: L_BOUNDARY, heightOffset: 2.8, shape: 'hip', slopePercent: 30, dir: P(1, 0) }));
    const [r] = resolveRoofs(p, 'lv_0') as ResolvedRoof[];
    const rincoes = r!.lines.filter((l) => l.kind === 'valley');
    expect(rincoes.length).toBeGreaterThan(0);
    const o = projecao(p);
    for (const ln of rincoes) {
      const s = o.strokes.find((st) => mesmaLinha(st, ln.a, ln.b) || mesmaLinha(st, ln.b, ln.a));
      expect(s!.dash).toEqual(TRACO_RINCAO);
    }
    expect(TRACO_RINCAO.join()).not.toBe(TRACO_PROJECAO.join());
  });

  it('a linha de desnível da mansarda (break) sai tracejada como as outras linhas internas', () => {
    const p = projetoCom(makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [P(0, 0), P(10, 0), P(10, 8), P(0, 8)], heightOffset: 2.8, shape: 'hip', slopePercent: 30, mansard: MANSARD }));
    const [r] = resolveRoofs(p, 'lv_0') as ResolvedRoof[];
    const quebras = r!.lines.filter((l) => l.kind === 'break');
    expect(quebras.length).toBeGreaterThan(0);
    const o = projecao(p);
    for (const ln of quebras) {
      const s = o.strokes.find((st) => mesmaLinha(st, ln.a, ln.b) || mesmaLinha(st, ln.b, ln.a));
      expect(s, 'desnível sem traço').toBeDefined();
      expect(s!.dash).toEqual(TRACO_PROJECAO);
    }
  });

  it('telhado em arco não quebra: um só beiral tracejado e as geratrizes do arco não viram cumeeira', () => {
    const arc = Array.from({ length: 25 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 24;
      return P(8 + 3 * Math.cos(a), 3 + 3 * Math.sin(a));
    });
    const boundary = [P(0, 0), P(8, 0), ...arc.slice(1, -1), P(8, 6), P(0, 6)];
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary, heightOffset: 2.8, shape: 'edges', edgeSlopes: boundary.map(() => 30), edgeOverhangs: boundary.map(() => 0) }) });
    const p = s.project;
    const [r] = resolveRoofs(p, 'lv_0') as ResolvedRoof[];
    const o = projecao(p);
    expect(o.fills).toHaveLength(r!.planes.length);
    expect(o.strokes.filter((st) => st.closed && st.dash)).toHaveLength(1);
    const abertas = o.strokes.filter((st) => !st.closed && st.dash !== undefined && st.color === corDaAresta(roofFillBase(p, r!, LIGHT, false, defaultPaint('roof', 100))));
    expect(abertas.length).toBeLessThan(12);
  });

  it('planta de cobertura (roofPlanMode): só o contorno tracejado, sem preenchimento nem linhas internas', () => {
    const o = projecao(casaHip(), LIGHT, false, 'medium', { planMode: true });
    expect(o.fills).toHaveLength(0);
    expect(o.strokes.every((st) => st.closed)).toBe(true);
    expect(o.strokes).toHaveLength(1);
  });

  it('grosseiro: contorno e preenchimento, sem linhas internas nem símbolos', () => {
    const p = casaHip();
    const [r] = resolveRoofs(p, 'lv_0') as ResolvedRoof[];
    const o = projecao(p, LIGHT, false, 'coarse');
    expect(o.fills).toHaveLength(r!.planes.length);
    expect(o.strokes.every((st) => st.closed)).toBe(true);
  });

  it('opção desligada: o telhado oculto não desenha nada, como antes', () => {
    const p = casaHip();
    const o = roofFills(p, 'lv_0', LIGHT, false, 'medium', VIEW, { hidden: new Set(['r']) });
    expect(o.fills).toHaveLength(0);
    expect(o.strokes).toHaveLength(0);
    expect(o.labels).toHaveLength(0);
  });

  it('projecaoDoTelhado sem rica (planta de cobertura) mantém só o contorno de projeção', () => {
    const p = casaHip();
    const [r] = resolveRoofs(p, 'lv_0') as ResolvedRoof[];
    const esp = espessurasDoTelhado(defaultPaint('roof', 100));
    const o = projecaoDoTelhado(r!, p, roofFootprint(r!), '#ffffff', LIGHT, esp, 0, 100, { rica: false, coarse: false });
    expect(o.fills).toHaveLength(0);
    expect(o.strokes.every((st) => st.closed && st.dash)).toBe(true);
  });
});

describe('projeção da cobertura: tema e sem rosa', () => {
  it.each([
    ['claro', LIGHT, false],
    ['escuro', DARK, true],
  ] as const)('tema %s: nenhuma cor de rosa, nem na água nem no traço', (_n, tema, dark) => {
    const o = projecao(casaHip(), tema, dark);
    const cores = [...o.fills.map((f) => f.color), ...o.strokes.map((st) => st.color)];
    expect(cores.length).toBeGreaterThan(0);
    expect(cores).not.toContain(tema.roofFootprint);
    expect(o.strokes.some((st) => st.color === tema.roofSlope)).toBe(false);
  });

  it('no escuro a água usa a mistura com o fundo (a base do tema escuro), não o papel branco', () => {
    const p = casaHip();
    const [r] = resolveRoofs(p, 'lv_0') as ResolvedRoof[];
    const claro = projecao(p, LIGHT, false).fills[0]!.color;
    const escuro = projecao(p, DARK, true).fills[0]!.color;
    expect(escuro).not.toBe(claro);
    expect(escuro).toBe(roofOps([r!], p, DARK, true, 'medium', VIEW).fills.find((f) => f.alpha === 0.98)!.color);
  });
});

describe('projeção da cobertura na lista completa da planta', () => {
  it('telhado fora do intervalo com a opção ligada entra na lista com o preenchimento leve; desligada, não', () => {
    const p = casaHip();
    const ligada = buildPlanDrawList(input(p));
    expect(ligada.fills.some((f) => f.alpha === PREENCHIMENTO_PROJECAO)).toBe(true);
    expect(ligada.strokes.some((st) => st.color === LIGHT.roofFootprint)).toBe(false);
    const desligada = buildPlanDrawList(input(p, { showRoofProjection: false }));
    expect(desligada.fills.some((f) => f.alpha === PREENCHIMENTO_PROJECAO)).toBe(false);
  });
});
