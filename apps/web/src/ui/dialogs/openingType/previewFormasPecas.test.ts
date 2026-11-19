import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, defaultOpeningShape, openingShapeProblems, shapeCompat, type OpeningShapeKind, type OpeningType } from '@hestia/model';
import { clienteFuroContornoFalso, definirClienteFuroContorno } from '@hestia/engine';
import { previewElevationDrawList, previewElevationSvg, previewMiniatureSvg, previewSectionFrames } from './previewViews.ts';

/**
 * Prévia do diálogo com forma (docs/estudo-esquadrias/40): a elevação sai do MESMO modelo do motor (`openingModel` com contorno), com
 * as peças do retangular (folhas, vidros, divisões, almofadas, ferragens), e não do contorno liso de antes (1 preenchimento + 1 traço).
 */
const FORMAS: OpeningShapeKind[] = ['round', 'segmental', 'pointed', 'circle', 'gable'];
const comForma = (t: OpeningType, k: OpeningShapeKind): OpeningType => ({ ...t, shape: defaultOpeningShape(k, t.width, t.height) });
const tipo = (id: string): OpeningType => DEFAULT_OPENING_TYPES.find((t) => t.id === id)!;

beforeEach(() => definirClienteFuroContorno(clienteFuroContornoFalso()));
afterEach(() => definirClienteFuroContorno(null));

describe('elevação da prévia com forma: as peças do retangular continuam', () => {
  it('162 tipos x arco pleno, abatido, ogival, círculo e empena: nunca só o contorno, e a maior parte das peças do retangular fica', () => {
    expect(DEFAULT_OPENING_TYPES.length).toBe(162);
    let casos = 0;
    for (const t of DEFAULT_OPENING_TYPES) {
      const base = previewElevationDrawList(t).drawList;
      for (const k of FORMAS) {
        const d = comForma(t, k);
        if (openingShapeProblems(d).length > 0) continue;
        casos++;
        const l = previewElevationDrawList(d).drawList;
        // Operação incompatível com a forma (matriz do doc 39): o motor gera a esquadria fixa (aro + vidro); a prévia mostra isso, não as peças do retangular.
        if (shapeCompat(t, k).verdict === 'incompatível') {
          if (t.leaves > 0) expect(l.fills.length, `${t.id} ${k}: fixa (aro + vidro)`).toBeGreaterThanOrEqual(2);
          continue;
        }
        // Antes da correção: o vão com forma virava 1 preenchimento e 1 traço (o perfil). Agora: as peças do modelo, como no retangular.
        expect(l.fills.length, `${t.id} ${k}: preenchimentos x retangular`).toBeGreaterThanOrEqual(Math.floor(base.fills.length * 0.45));
        expect(l.strokes.length, `${t.id} ${k}: traços x retangular`).toBeGreaterThanOrEqual(Math.floor(base.strokes.length * 0.6));
      }
    }
    expect(casos).toBeGreaterThan(700);
  }, 120_000);

  it('porta almofadada em arco: almofadas, maçaneta e linha de abertura (V) aparecem', () => {
    const rect = previewElevationDrawList(tipo('ot_pgiro90')).drawList;
    const arco = previewElevationDrawList(comForma(tipo('ot_pgiro90'), 'round')).drawList;
    expect(arco.strokes.length).toBeGreaterThanOrEqual(rect.strokes.length - 4);
    expect(arco.fills.length).toBeGreaterThanOrEqual(rect.fills.length - 4);
  });

  it('janela de correr em arco pleno: vidro (azul) e a linha de correr aparecem; o SVG tem dezenas de peças, não 2', () => {
    const svg = previewElevationSvg(comForma(tipo('ot_j120'), 'round'));
    expect((svg.match(/data-op="fill"/g) ?? []).length).toBeGreaterThan(6);
    expect((svg.match(/data-op="stroke"/g) ?? []).length).toBeGreaterThan(12);
  });

  it('muda com a forma, com a flecha e com o estilo da folha (a prévia acompanha o rascunho)', () => {
    const base = tipo('ot_pgiro90');
    const redondo = previewElevationSvg(comForma(base, 'round'));
    const ogival = previewElevationSvg(comForma(base, 'pointed'));
    const abatido = previewElevationSvg({ ...base, shape: { kind: 'segmental', width: base.width, height: base.height, rise: 0.1 } });
    const abatido2 = previewElevationSvg({ ...base, shape: { kind: 'segmental', width: base.width, height: base.height, rise: 0.25 } });
    const veneziana = previewElevationSvg({ ...comForma(base, 'round'), leafStyle: 'louver' });
    expect(new Set([redondo, ogival, abatido, abatido2, veneziana]).size).toBe(5);
  });

  it('vão retangular (sem forma ou rect): elevação idêntica à do tipo sem o campo', () => {
    for (const id of ['ot_pgiro90', 'ot_j120', 'ot_pcorrer160']) {
      const t = tipo(id);
      expect(previewElevationSvg({ ...t, shape: { kind: 'rect', width: t.width, height: t.height } })).toBe(previewElevationSvg(t));
    }
  });

  it('corte transversal em arco: a cabeça e a soleira mostram peças do batente (não só o perfil do furo)', () => {
    const rect = previewSectionFrames(tipo('ot_pgiro90'))[0]!;
    const arco = previewSectionFrames(comForma(tipo('ot_pgiro90'), 'round'))[0]!;
    expect(arco.drawList.fills.length).toBeGreaterThanOrEqual(Math.floor(rect.drawList.fills.length * 0.6));
  });
});

describe('miniatura com forma (lista de tipos)', () => {
  it('é a elevação do modelo: tem peças e muda da miniatura do retangular', () => {
    const t = tipo('ot_j120');
    const a = previewMiniatureSvg(comForma(t, 'circle'), 96, 64);
    const b = previewMiniatureSvg(t, 96, 64);
    expect(a).not.toBe(b);
    expect((a.match(/data-op="/g) ?? []).length).toBeGreaterThan(8);
  });
});
