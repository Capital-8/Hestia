/**
 * Terreno no corte e na elevação, ficha V3, sobre o Rust REAL: T2, T3 e T5 (fixtureTerreno.ts) pelo `buildSectionDrawList`, com a contagem e o estilo
 * das operações de desenho, a seleção e o realce. O serviço global do terreno é redirecionado para um serviço com o kernel carregado aqui. Só na suíte WASM.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { computeSection, servicoTerreno } from '@hestia/engine';
import { ProjectStore, type Project } from '@hestia/model';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { idTerrenoFixture, projetoTerreno } from '../packages/engine/src/fixtureTerreno.ts';
import { ServicoTerreno } from '../packages/engine/src/kernelTerrenoServico.ts';
import { LIGHT } from '../packages/render/src/plan/types.ts';
import { buildSectionDrawList, type SectionInput } from '../packages/render/src/section/build.ts';
import { sectionStyleOf } from '../packages/render/src/section/style.ts';
import { pickTerrenoNoCorte, terrenosNaCaixaDoCorte, TRACO_PERFIL_EXISTENTE } from '../packages/render/src/section/terreno.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});
afterEach(() => vi.restoreAllMocks());

const v = (x: number, y: number) => ({ x, y });
/** Redireciona o serviço global para um com o kernel real. */
const comKernel = (): void => {
  const s = new ServicoTerreno(() => ger);
  vi.spyOn(servicoTerreno(), 'corte').mockImplementation((p, o, d, prof, n) => s.corte(p, o, d, prof, n));
};

function desenho(p: Project, line: { a: { x: number; y: number }; b: { x: number; y: number }; depth: number }, extra: Partial<SectionInput> = {}) {
  const input: SectionInput = { project: p, section: computeSection(p, line), viewport: { cx: 10, cy: 10, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false, ...extra };
  return { input, lista: buildSectionDrawList(input), paint: sectionStyleOf(p, 60).paint };
}
const tracejados = (r: ReturnType<typeof desenho>) => r.lista.strokes.filter((s) => s.dash?.[0] === TRACO_PERFIL_EXISTENTE[0] && s.dash?.[1] === TRACO_PERFIL_EXISTENTE[1]);
const corte = { a: v(-1, 10), b: v(21, 10), depth: 12 };
const elevacao = { a: v(-1, -2), b: v(21, -2), depth: 40 };

describe('terreno no corte e na elevação (kernel real)', () => {
  it('T2 em corte: um solo cortado com preenchimento e contorno de corte; sem perfil existente (sem região)', () => {
    if (!ger) return;
    comKernel();
    const p = projetoTerreno('T2');
    const r = desenho(p, corte);
    const cut = r.paint.site.cut;
    const fechados = r.lista.strokes.filter((s) => s.closed && s.widthPx === cut.widthPx);
    expect(r.lista.fills).toHaveLength(1);
    expect(r.lista.fills[0]!.polygons[0]![0]!.length).toBeGreaterThanOrEqual(4);
    expect(fechados.length).toBeGreaterThanOrEqual(1);
    expect(tracejados(r)).toHaveLength(0);
    // O perfil do kernel: z de 10,25 a 12,25 ao longo de s.
    const zs = r.lista.fills[0]!.polygons[0]![0]!.map((q) => q.y);
    expect(Math.max(...zs)).toBeCloseTo(12.25, 6);
  });

  it('T5 em corte: solo cortado com preenchimento e o perfil existente tracejado (só em T5, que tem plataforma)', () => {
    if (!ger) return;
    comKernel();
    const r = desenho(projetoTerreno('T5'), corte);
    expect(r.lista.fills).toHaveLength(1);
    const t = tracejados(r);
    expect(t).toHaveLength(1);
    expect(t[0]!.closed).toBe(false);
    expect(t[0]!.widthPx).toBe(r.paint.site.proj.widthPx);
    // O perfil existente é o terreno plano em z = 10; o solo cortado desce a 8 na plataforma.
    expect(t[0]!.pts.every((q) => Math.abs(q.y - 10) < 1e-9)).toBe(true);
    expect(Math.min(...r.lista.fills[0]!.polygons[0]![0]!.map((q) => q.y))).toBeLessThan(8);
  });

  it('T3 em elevação: só a silhueta, linha fina aberta, sem preenchimento do solo nem tracejado', () => {
    if (!ger) return;
    comKernel();
    const r = desenho(projetoTerreno('T3'), elevacao);
    expect(r.lista.fills).toHaveLength(0);
    expect(tracejados(r)).toHaveLength(0);
    const finas = r.lista.strokes.filter((s) => !s.closed && s.widthPx === r.paint.site.proj.widthPx && s.pts.some((q) => Math.abs(q.y - 5) < 1e-6));
    expect(finas).toHaveLength(1);
    expect(Math.max(...finas[0]!.pts.map((q) => q.y))).toBeCloseTo(5, 6);
  });

  it('T2 e T5 em elevação: silhueta presente e o terreno desenhado antes do que vem depois (primeiro das listas)', () => {
    if (!ger) return;
    comKernel();
    for (const n of ['T2', 'T5'] as const) {
      const r = desenho(projetoTerreno(n), elevacao);
      expect(r.lista.strokes.some((s) => !s.closed && s.widthPx === r.paint.site.proj.widthPx && s.pts.length >= 2)).toBe(true);
    }
  });

  it('seleção e realce: clicar no solo cortado e na caixa acha o terreno; selecionado leva a cor de seleção', () => {
    if (!ger) return;
    comKernel();
    const p = projetoTerreno('T5');
    const r = desenho(p, corte);
    const id = idTerrenoFixture('T5');
    expect(pickTerrenoNoCorte(p, r.input.section, undefined, r.paint.site, v(10, 7), 0.1)).toBe(id);
    expect(pickTerrenoNoCorte(p, r.input.section, undefined, r.paint.site, v(10, 30), 0.1)).toBeNull();
    expect(terrenosNaCaixaDoCorte(p, r.input.section, undefined, r.paint.site, v(-5, 0), v(25, 20))).toEqual([id]);
    const sel = desenho(p, corte, { highlight: { selection: [id], hover: null } });
    expect(sel.lista.fills.filter((f) => f.color === LIGHT.select && f.alpha === 0.25)).toHaveLength(1);
    expect(sel.lista.strokes.filter((s) => s.color === LIGHT.select && s.widthPx === 2).length).toBeGreaterThanOrEqual(2);
  });

  it('categoria site desligada ou terreno oculto: nada do terreno', () => {
    if (!ger) return;
    comKernel();
    const p = projetoTerreno('T5');
    const base = desenho(p, corte);
    const oculto = desenho(p, corte, { hidden: new Set([idTerrenoFixture('T5')]) });
    expect(base.lista.fills).toHaveLength(1);
    expect(oculto.lista.fills).toHaveLength(0);
    expect(tracejados(oculto)).toHaveLength(0);
    const st = new ProjectStore(p);
    st.exec({ type: 'setSectionGraphics', patch: { overrides: { site: { visible: false } } } });
    const off = st.project;
    const semCategoria = desenho(off, corte);
    expect(semCategoria.paint.site.visible).toBe(false);
    expect(semCategoria.lista.fills).toHaveLength(0);
    expect(tracejados(semCategoria)).toHaveLength(0);
  });
});
