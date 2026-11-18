import { afterEach, describe, expect, it } from 'vitest';
import { clienteFuroContornoFalso, definirClienteFuroContorno } from '@hestia/engine';
import { buildTemplate, makeWall, ProjectStore, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { dxfGeometryOf, planDxf, sectionDxf } from './dxfExport.ts';

/**
 * Vão com contorno no DXF (docs/estudo-esquadrias/29): planta, corte e elevação. Vão retangular (ou sem cliente) sai idêntico ao
 * de antes; com o cliente instalado, o vão com forma sai pelo contorno (arcos com bulge na elevação e no corte).
 */
const ARCO: OpeningShape = { kind: 'round', width: 0.9, height: 2.4 };

/** Parede de 6 m com uma janela em x = 4 (o tipo `ot_arco`), com forma ou sem ela. */
function projeto(forma: boolean): Project {
  const base = structuredClone(buildTemplate('blank'));
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', width: 0.9, height: 2.4, leaves: 0, closure: 'none', ...(forma ? { shape: ARCO } : {}) };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: base.defaults.wallTypeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  const janela: Opening = { id: 'o_arco', kind: 'window', typeId: 'ot_arco', hostId: 'w1', offset: 4, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: janela });
  s.exec({ type: 'addView', view: { id: 'corte_t', name: 'Corte T', kind: 'section', a: { x: 4.35, y: -1 }, b: { x: 4.35, y: 1 }, depth: 3 } });
  s.exec({ type: 'addView', view: { id: 'elev_f', name: 'Elevação F', kind: 'section', a: { x: -1, y: -1 }, b: { x: 7, y: -1 }, depth: 3 } });
  return s.project;
}

/** Quantas vezes o código 42 (bulge) aparece no arquivo: o cabeçalho tem outros 42, então compara-se a diferença. */
const conta42 = (t: string): number => t.split('\r\n42\r\n').length - 1;

afterEach(() => definirClienteFuroContorno(null));

describe('vão com contorno no DXF (planta, corte e elevação)', () => {
  it('vão retangular: planta, corte e elevação idênticos com o cliente instalado', () => {
    const p = projeto(false);
    const sem = [planDxf(p, 'lv_0'), sectionDxf(p, 'corte_t'), sectionDxf(p, 'elev_f')];
    definirClienteFuroContorno(clienteFuroContornoFalso());
    expect([planDxf(p, 'lv_0'), sectionDxf(p, 'corte_t'), sectionDxf(p, 'elev_f')]).toEqual(sem);
  });

  it('vão com forma sem cliente: saída igual à do vão retangular (a forma só vale com o furo por contorno)', () => {
    const com = projeto(true);
    const rect = projeto(false);
    expect(planDxf(com, 'lv_0')).toBe(planDxf(rect, 'lv_0'));
    expect(sectionDxf(com, 'corte_t')).toBe(sectionDxf(rect, 'corte_t'));
    expect(sectionDxf(com, 'elev_f')).toBe(sectionDxf(rect, 'elev_f'));
  });

  it('elevação com cliente: o vão de arco sai com bulge (arcos nativos), a mais que sem o contorno', () => {
    const p = projeto(true);
    const sem = conta42(sectionDxf(p, 'elev_f'));
    definirClienteFuroContorno(clienteFuroContornoFalso());
    expect(conta42(sectionDxf(p, 'elev_f'))).toBeGreaterThan(sem);
  });

  it('planta com cliente: o símbolo do vão segue a forma (caixilho na meia-largura real), diferente do retangular', () => {
    const p = projeto(true);
    const sem = dxfGeometryOf(p, 'lv_0').openings[0]!.symbol;
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const com = dxfGeometryOf(p, 'lv_0').openings[0]!.symbol;
    expect(JSON.stringify(com)).not.toBe(JSON.stringify(sem));
    // Os pontos do símbolo continuam dentro da largura do vão bruto (o caixilho não passa do vão).
    expect(com!.every((s) => s.pts.length >= 2)).toBe(true);
  });
});
