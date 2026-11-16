import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, type Layer, type Wall } from './index.ts';
import { wallTiltIssue } from './wallTilt.ts';
import type { Lang } from './i18n.ts';

/** F2.12 · regra do arco que fecha, nos dois sentidos e no semicírculo. t=0,2; H=3. Convenção: sag>0 e tilt>0 AFASTAM do centro. */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
function caso(over: Partial<Wall>) {
  const p = createEmptyProject();
  p.wallTypes.wt_t = { ...p.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const w = makeWall({ id: 'w1', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...over });
  return { p, w };
}
const issue = (over: Partial<Wall>, tilt: number, lang: Lang = 'pt') => { const { p, w } = caso(over); return wallTiltIssue(p, w, tilt, lang); };
const LANGS: Lang[] = ['pt', 'en', 'es', 'fr', 'de', 'it', 'pl'];

describe('wallTiltIssue: arco inclinado para o centro', () => {
  // corda 4, flecha 1: R = (4+1)/2 = 2,5; H·tan(30°) = 1,732 → R − 1,732 = 0,768 > 0,2/(2cos30°)+0,01 = 0,125
  it('afastando do centro é sempre válido (sag>0 e tilt>0; sag<0 e tilt<0)', () => {
    expect(issue({ sag: 1 }, 60)).toBeNull();
    expect(issue({ sag: -1 }, -60)).toBeNull();
  });
  it('aproximando: válido enquanto R − H·tanθ > t/(2cosθ)+0,01, recusado depois (os dois sinais de sag)', () => {
    expect(issue({ sag: 1 }, -30)).toBeNull();
    expect(issue({ sag: -1 }, 30)).toBeNull();
    expect(issue({ sag: 1 }, -40)).not.toBeNull(); // 2,5 − 3·0,8391 = −0,017
    expect(issue({ sag: -1 }, 40)).not.toBeNull();
    expect(issue({ sag: 1 }, 40)).toBeNull(); // mesmo ângulo, sentido oposto: afasta
  });
  it('semicírculo (flecha = metade da corda, R=2): 60° afastando é válido; aproximando é recusado nos dois sentidos de sag', () => {
    expect(issue({ sag: 2 }, 60)).toBeNull();
    expect(issue({ sag: -2 }, -60)).toBeNull();
    expect(issue({ sag: 2 }, -60)).not.toBeNull(); // 2 − 3·1,732 < 0
    expect(issue({ sag: -2 }, 60)).not.toBeNull();
  });
  it('semicírculo aproximando: limite entre válido e recusado em H·tanθ = R − t/(2cosθ) − 0,01', () => {
    // R=2, H=3: θ=30° → 2 − 1,732 = 0,268 > 0,125 válido; θ=32° → 2 − 1,875 = 0,125 vs 0,2/(2cos32°)+0,01 = 0,128 recusado
    expect(issue({ sag: 2 }, -30)).toBeNull();
    expect(issue({ sag: 2 }, -32)).not.toBeNull();
  });
  it('a recusa é traduzida nos 7 idiomas, com raio e espessura, sem chave crua', () => {
    const textos = LANGS.map((l) => issue({ sag: 2 }, -60, l)!);
    for (const m of textos) {
      expect(m).toContain('2.00');
      expect(m).toContain('0.200');
      expect(m).not.toContain('md_cmd_tilt');
    }
    expect(new Set(textos).size).toBe(LANGS.length);
    expect(textos[0]).toContain('fecharia');
  });
});
