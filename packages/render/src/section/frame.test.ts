import { computeSection } from '@hestia/engine';
import { DEFAULT_VIEW_GRAPHICS, buildTemplate } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { larguraEmPx } from '../plan/espessura.ts';
import { PlanScene } from '../plan/gpuPlan.ts';
import { rasterizarCena } from '../plan/rasterSoftware.ts';
import { LIGHT, type FillOp, type PlanDrawList, type StrokeOp } from '../plan/types.ts';
import { sectionBox } from './build.ts';
import { SectionFrame, type SectionFrameInput } from './frame.ts';

const linha = { a: { x: 4, y: -2 }, b: { x: 4, y: 12 }, depth: 14 };
const elevacao = { a: { x: -8, y: -6 }, b: { x: 18, y: -6 }, depth: 20 };

/** Projeto da casa, com e sem gráficos de corte salvos (sem: traços fixos; com: pesos em papel, que dependem do zoom). */
function projeto(salvo: boolean) {
  const p = buildTemplate('house2');
  return salvo ? { ...p, sectionGraphics: structuredClone(DEFAULT_VIEW_GRAPHICS) } : p;
}

function entrada(salvo: boolean, sectionId = 'sv1'): SectionFrameInput {
  const project = projeto(salvo);
  const section = computeSection(project, linha);
  return { project, version: 1, sectionId, section, theme: LIGHT, dark: false, showGrid: false };
}

const vista = (zoom: number, cx: number, cy: number) => ({ cx, cy, zoom, width: 320, height: 240 });

/**
 * Lista que o caminho antigo montava para um zoom: espessura em px já resolvida e hachura decidida na hora. É a
 * referência da igualdade de imagem — o que muda com o R4 é só *quando* essa decisão acontece, não o desenho.
 */
function comoAntes(dl: PlanDrawList, zoom: number): PlanDrawList {
  const fills: FillOp[] = [];
  for (const f of dl.fills) {
    if (!f.hatch) {
      fills.push(f);
      continue;
    }
    const min = f.hatch.zoomMin ?? 0;
    if (zoom < min) {
      const { hatch: _hatch, ...resto } = f;
      void _hatch;
      fills.push(resto);
    } else {
      const { zoomMin: _min, ...hachura } = f.hatch;
      void _min;
      fills.push({ ...f, hatch: hachura });
    }
  }
  const strokes: StrokeOp[] = dl.strokes.map((s) => {
    const { papel: _papel, ...resto } = s;
    void _papel;
    return { ...resto, widthPx: larguraEmPx(s, zoom) };
  });
  return { background: dl.background, fills, strokes, labels: dl.labels };
}

/** Pixels da lista na vista dada, com o mesmo rasterizador de software dos testes da planta. */
function raster(dl: PlanDrawList, v: ReturnType<typeof vista>, W = 240, H = 180): Float64Array {
  const cena = new PlanScene();
  cena.setDrawList(dl, v);
  const buf = rasterizarCena(cena, v, W, H);
  cena.dispose();
  return buf;
}

/** Diferença de imagem: pixels alterados, fração e maior diferença de canal (0..1). */
function diferenca(a: Float64Array, b: Float64Array): { pixels: number; fracao: number; maior: number } {
  let pixels = 0;
  let maior = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
    if (d > 1 / 255) pixels++;
    maior = Math.max(maior, d);
  }
  return { pixels, fracao: pixels / (a.length / 3), maior };
}

describe('quadro do corte: a lista não depende da vista', () => {
  it('pan, zoom e tamanho reaproveitam a mesma lista (GPU)', () => {
    const frame = new SectionFrame();
    const i = entrada(false);
    const v = vista(60, 4, 3);
    const dl = frame.drawList(i, v, true);
    expect(frame.drawList(i, { ...v, cx: 9, cy: 8 }, true)).toBe(dl);
    expect(frame.drawList(i, { ...v, zoom: 120 }, true)).toBe(dl);
    expect(frame.drawList(i, { ...v, zoom: 30, width: 900, height: 500 }, true)).toBe(dl);
    expect(frame.stats()).toMatchObject({ builds: 1, reuses: 3 });
  });

  it('projeto, vista, tema, seleção e estilo refazem a lista', () => {
    const frame = new SectionFrame();
    const i = entrada(false);
    const v = vista(60, 4, 3);
    const dl = frame.drawList(i, v, true);
    expect(frame.drawList({ ...i, version: 2 }, v, true)).not.toBe(dl);
    expect(frame.drawList({ ...i, version: 2, sectionId: 'sv2' }, v, true)).not.toBe(dl);
    expect(frame.drawList({ ...i, version: 2, dark: true }, v, true)).not.toBe(dl);
    expect(frame.drawList({ ...i, version: 2, highlight: { selection: ['w1'], hover: null } }, v, true)).not.toBe(dl);
    expect(frame.drawList({ ...i, version: 2, highlight: { selection: ['w1'], hover: null }, thinLines: true }, v, true)).not.toBe(dl);
  });

  it('`reset` volta ao primeiro quadro', () => {
    const frame = new SectionFrame();
    const i = entrada(false);
    const v = vista(60, 4, 3);
    const dl = frame.drawList(i, v, true);
    frame.reset();
    expect(frame.drawList(i, v, true)).not.toBe(dl);
    expect(frame.stats().builds).toBe(2);
  });

  it('um resultado novo do corte refaz a lista mesmo com o mesmo projeto e a mesma versão', () => {
    // O corte é calculado em segundo plano: o commit já subiu a versão e o quadro desenhou o resultado anterior; quando o
    // novo é publicado, projeto e versão continuam os mesmos. A janela alinhada tem de aparecer sem esperar outro evento.
    const frame = new SectionFrame();
    const project = projeto(false);
    const v = vista(60, 4, 3);
    const antes = computeSection(project, linha);
    const i: SectionFrameInput = { project, version: 1, sectionId: 'sv1', section: antes, theme: LIGHT, dark: false, showGrid: false };
    const dl = frame.drawList(i, v, true);
    const depois = computeSection(project, { ...linha, a: { x: 3.9, y: -2 } });
    expect(depois).not.toBe(antes);
    expect(SectionFrame.keyOf({ ...i, section: depois })).not.toBe(SectionFrame.keyOf(i));
    expect(frame.drawList({ ...i, section: depois }, v, true)).not.toBe(dl);
    expect(frame.stats().builds).toBe(2);
  });

  it('sem GPU, a lista resolvida é cacheada por zoom e mantém a lista base intacta', () => {
    const frame = new SectionFrame();
    const i = entrada(false);
    const v = vista(60, 4, 3);
    const base = frame.drawList(i, v, true);
    const cpu60 = frame.drawList(i, v, false);
    expect(cpu60).not.toBe(base);
    expect(frame.drawList(i, { ...v, cx: 2 }, false)).toBe(cpu60);
    const cpu20 = frame.drawList(i, { ...v, zoom: 20 }, false);
    expect(cpu20).not.toBe(cpu60);
    expect(frame.drawList(i, { ...v, zoom: 20, cx: 7 }, false)).toBe(cpu20);
    // Abaixo de 40 px/m a hachura sai (como antes) e a lista base continua com ela para a GPU.
    expect(cpu20.fills.some((f) => f.hatch)).toBe(false);
    expect(base.fills.some((f) => f.hatch)).toBe(true);
    expect(frame.stats()).toMatchObject({ builds: 1, resolvidos: 2 });
  });
});

describe('igualdade de imagem do corte: antes (zoom na montagem) × depois (zoom no shader)', () => {
  const casos = [
    { nome: 'corte sem gráficos salvos', salvo: false, secao: linha, zoomBase: 60 },
    { nome: 'corte com gráficos salvos (pesos de papel)', salvo: true, secao: linha, zoomBase: 60 },
    { nome: 'elevação', salvo: false, secao: elevacao, zoomBase: 60 },
  ] as const;

  for (const caso of casos) {
    it(`${caso.nome}: zooms 20/40/60/120 iguais à referência`, () => {
      const project = projeto(caso.salvo);
      const section = computeSection(project, caso.secao);
      const box = sectionBox(section);
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      const frame = new SectionFrame();
      const i: SectionFrameInput = { project, version: 1, sectionId: 'sv1', section, theme: LIGHT, dark: false, showGrid: false };
      const base = frame.drawList(i, vista(caso.zoomBase, cx, cy), true);
      for (const zoom of [20, 40, 60, 120]) {
        const v = vista(zoom, cx, cy);
        expect(frame.drawList(i, v, true), `zoom ${zoom}`).toBe(base);
        const depois = raster(base, v);
        const antes = raster(comoAntes(base, zoom), v);
        const d = diferenca(antes, depois);
        // Tolerância declarada: 0 pixel acima de 1/255 (comparação exata do raster de software).
        expect(d, `zoom ${zoom}`).toEqual({ pixels: 0, fracao: 0, maior: 0 });
      }
    });
  }
});
