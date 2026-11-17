import { describe, expect, it } from 'vitest';
import type { Project, Stair } from '@hestia/model';
import { importIfc } from './index.ts';
import { ifcBoxes, meshProduct, ref } from './ifcTestKit.ts';

const escadas = (p: Project): Stair[] => Object.values(p.elements).filter((e): e is Stair => e.kind === 'stair');
const genericos = (p: Project): string[] => Object.values(p.elements).filter((e) => e.kind === 'generic').map((e) => (e as { sourceClass: string }).sourceClass);

/** Lance reto: `n` pisos de `tread` m (avançando em +x, ou em -x com `dir = -1`), espelho `riser`, largura `w` em y, o 1º piso em z = riser. */
function lance(id: number, n: number, opts: { tread?: number; riser?: number; w?: number; dir?: 1 | -1; skew?: number } = {}): string[] {
  const { tread = 0.3, riser = 0.17, w = 1.2, dir = 1, skew = 0 } = opts;
  const verts: number[][] = [];
  const faces: number[][] = [];
  for (let k = 1; k <= n; k++) {
    const x0 = dir * (k - 1) * tread;
    const x1 = dir * k * tread;
    const z = riser * k + (k === 3 ? skew : 0);
    const i = verts.length;
    verts.push([x0, 0, z], [x1, 0, z], [x1, w, z], [x0, w, z]);
    // Sentido anti-horário visto de cima (normal para cima), também quando o avanço é em -x.
    faces.push(dir === 1 ? [i + 1, i + 2, i + 3] : [i + 1, i + 3, i + 2], dir === 1 ? [i + 1, i + 3, i + 4] : [i + 1, i + 4, i + 3]);
  }
  return meshProduct(id, 'IFCSTAIRFLIGHT', `Lance ${id}`, verts, faces, '$,$,$,$,.STRAIGHT.');
}

describe('addStairs: lances retos', () => {
  it('lance reto vira escada nativa com N espelhos, base um espelho abaixo do 1º piso', () => {
    const { project, report } = importIfc(ifcBoxes([], lance(1, 5)));
    const s = escadas(project);
    expect(s).toHaveLength(1);
    const run = s[0]!.components[0]!;
    if (run.kind !== 'run') throw new Error('lance esperado');
    expect(run.risers).toHaveLength(6);
    expect(run.risers[1]!.a.x - run.risers[0]!.a.x).toBeCloseTo(0.3, 3);
    expect(Math.hypot(run.risers[0]!.b.x - run.risers[0]!.a.x, run.risers[0]!.b.y - run.risers[0]!.a.y)).toBeCloseTo(1.2, 3);
    const lvl = project.levels.find((l) => l.id === s[0]!.levelId)!;
    expect(lvl.elevation + s[0]!.baseOffset).toBeCloseTo(0, 3);
    expect(s[0]!.height).toBeCloseTo(6 * 0.17, 3);
    expect(s[0]!.openingMode).toBe('none');
    expect(report.imported.escadas).toBe(1);
    expect(genericos(project)).toEqual([]);
  });

  it('subida em -x: a esquerda de quem sobe é o lado de y menor', () => {
    const { project } = importIfc(ifcBoxes([], lance(1, 4, { dir: -1 })));
    const run = escadas(project)[0]!.components[0]!;
    if (run.kind !== 'run') throw new Error('lance esperado');
    expect(run.boundaryLeft[0]!.a.y).toBeCloseTo(0, 6);
    expect(run.boundaryRight[0]!.a.y).toBeCloseTo(1.2, 6);
    expect(run.risers[0]!.a.x).toBeCloseTo(0, 6);
    expect(run.risers[4]!.a.x).toBeCloseTo(-1.2, 6);
  });

  it('espelhos irregulares: fica genérico, com aviso', () => {
    const { project, report } = importIfc(ifcBoxes([], lance(1, 5, { skew: 0.05 })));
    expect(escadas(project)).toHaveLength(0);
    expect(genericos(project)).toEqual(['IFCSTAIRFLIGHT']);
    expect(report.warnings.some((w) => w.includes('Lance 1'))).toBe(true);
  });

  it('menos de 3 degraus: genérico', () => {
    const { project } = importIfc(ifcBoxes([], lance(1, 2)));
    expect(escadas(project)).toHaveLength(0);
  });

  it('escada de dois lances é tudo-ou-nada: um lance ruim deixa os dois genéricos', () => {
    const rels = [
      "#70=IFCSTAIR('0000000000000000000070',$,'Escada',$,$,#7,$,$,.HALF_TURN_STAIR.);",
      `#71=IFCRELAGGREGATES('0000000000000000000071',$,$,$,#70,(${ref(1)},${ref(2)}));`,
    ];
    const { project } = importIfc(ifcBoxes([], [...lance(1, 5), ...lance(2, 5, { skew: 0.05 }), ...rels]));
    expect(escadas(project)).toHaveLength(0);
    expect(genericos(project)).toEqual(['IFCSTAIRFLIGHT', 'IFCSTAIRFLIGHT']);
  });

  it('escada de dois lances bons vira duas escadas nativas', () => {
    const rels = [
      "#70=IFCSTAIR('0000000000000000000070',$,'Escada',$,$,#7,$,$,.HALF_TURN_STAIR.);",
      `#71=IFCRELAGGREGATES('0000000000000000000071',$,$,$,#70,(${ref(1)},${ref(2)}));`,
    ];
    const { project } = importIfc(ifcBoxes([], [...lance(1, 5), ...lance(2, 5), ...rels]));
    expect(escadas(project)).toHaveLength(2);
  });
});
