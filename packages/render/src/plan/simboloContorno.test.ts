import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape } from '@hestia/model';
import { clienteFuroContornoFalso, definirClienteFuroContorno, frameOfWall, openingGeometry } from '@hestia/engine';
import { simboloDoVaoComContorno } from './simboloContorno.ts';
import type { PlanPaint } from './style.ts';
import type { PlanTheme } from './types.ts';

const theme = { ink: '#000', inkSoft: '#888' } as PlanTheme;
const pt = { cutPx: 2, projPx: 1 } as unknown as PlanPaint;

function setup() {
  const base = createEmptyProject();
  const shape: OpeningShape = { kind: 'round', width: 0.9, height: 2.1 };
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', leaves: 0, shape };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  const o: Opening = { id: 'o', kind: 'door', typeId: 'ot_arco', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: o });
  return { p: s.project, g: openingGeometry(s.project, o, frameOfWall(s.project, 'w')!) };
}
const larguraDoVao = (ops: { pts: { x: number; y: number }[] }[]): number => Math.max(...ops.flatMap((o) => o.pts.map((q) => q.x))) - Math.min(...ops.flatMap((o) => o.pts.map((q) => q.x)));

afterEach(() => definirClienteFuroContorno(null));

describe('símbolo de planta do vão livre com forma', () => {
  it('sem cliente devolve null (símbolo de sempre)', () => {
    const { p, g } = setup();
    expect(simboloDoVaoComContorno(p, g, 0, undefined, 1.2, theme, pt, '#fff')).toBeNull();
  });

  it('com cliente: largura cheia abaixo da nascença e corda no arco', () => {
    const { p, g } = setup();
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const baixo = simboloDoVaoComContorno(p, g, 0, undefined, 1.2, theme, pt, '#fff')!;
    const arco = simboloDoVaoComContorno(p, g, 0, undefined, 1.65 + 0.3, theme, pt, '#fff')!;
    expect(larguraDoVao(baixo)).toBeCloseTo(0.9, 6);
    expect(larguraDoVao(arco)).toBeCloseTo(2 * Math.sqrt(0.45 * 0.45 - 0.09), 2);
  });
});
