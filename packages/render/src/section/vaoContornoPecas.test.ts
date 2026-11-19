import { afterEach, describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { clienteFuroContornoFalso, computeSection, definirClienteFuroContorno } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type OpeningShape, type OpeningType, type Project } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

function projeto(tipo: (base: Project) => OpeningType): Project {
  const base = createEmptyProject();
  const t = tipo(base);
  base.openingTypes[t.id] = t;
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  const o: Opening = { id: 'o1', kind: t.kind, typeId: t.id, hostId: 'w1', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

const entrada = (p: Project, a: Vec2, b: Vec2): SectionInput => ({
  project: p,
  section: computeSection(p, { a, b, depth: 3 }),
  viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 },
  theme: LIGHT,
  dark: false,
  showGrid: false,
});
const elevacao = (p: Project) => buildSectionDrawList(entrada(p, v(0, -1), v(6, -1)));
const corte = (p: Project) => buildSectionDrawList(entrada(p, v(3, -1), v(3, 1)));

afterEach(() => definirClienteFuroContorno(null));

const comForma = (base: Project, id: string, shape?: OpeningShape): OpeningType => ({ ...base.openingTypes[id]!, id: `${id}_f`, ...(shape ? { shape } : {}) });

describe('elevação e corte de vão com contorno desenham as peças do modelo (não só o perfil)', () => {
  it('porta almofadada em arco pleno: tem os mesmos desenhos de peça do retangular (folha, almofadas, maçaneta, dobradiças, V)', () => {
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const rect = elevacao(projeto((b) => comForma(b, 'ot_pgiro90')));
    const arco = elevacao(projeto((b) => comForma(b, 'ot_pgiro90', { kind: 'round', width: 0.9, height: 2.1 })));
    // O arco não reduz o desenho a um contorno: tem pelo menos ~80% dos preenchimentos e dos traços do retangular.
    expect(arco.fills.length).toBeGreaterThanOrEqual(Math.floor(rect.fills.length * 0.8));
    expect(arco.strokes.length).toBeGreaterThanOrEqual(Math.floor(rect.strokes.length * 0.8));
    expect(arco.strokes.length).toBeGreaterThan(12);
  });

  it('janela com forma: vidro e divisões aparecem na elevação', () => {
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const rect = elevacao(projeto((b) => comForma(b, 'ot_j120')));
    const arco = elevacao(projeto((b) => comForma(b, 'ot_j120', { kind: 'round', width: 1.2, height: 1.5 })));
    expect(arco.fills.length).toBeGreaterThanOrEqual(Math.floor(rect.fills.length * 0.7));
  });

  it('corte transversal em arco: a cabeça do batente aparece como peça (o corte não é só o perfil do furo)', () => {
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const rect = corte(projeto((b) => comForma(b, 'ot_pgiro90')));
    const arco = corte(projeto((b) => comForma(b, 'ot_pgiro90', { kind: 'round', width: 0.9, height: 2.1 })));
    expect(arco.fills.length).toBeGreaterThanOrEqual(Math.floor(rect.fills.length * 0.6));
  });
});
