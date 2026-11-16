import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { asMulti, closeGapsSafe, dist, union } from '@hestia/geom';
import { wallFacesCached } from '@hestia/engine';
import { ProjectStore, migrateProject } from '@hestia/model';
import { perimeterFromBox } from './sketchByPerimeter.ts';

it('passo que cria o segmento micro: faces -> union -> closeGapsSafe -> ringToSegs', () => {
  const p = migrateProject(JSON.parse(readFileSync('/home/dennylson/Documentos/Projetos/Projeto sem título (5)/projeto.hestia.json', 'utf8')));
  const store = new ProjectStore(p);
  const outl = wallFacesCached(store.project, 'lv_0');
  const u = union(...outl.map((w) => asMulti(w.outline)));
  const g = closeGapsSafe(u);
  const dump = (tag: string, m: typeof u) => m.forEach((poly, k) => poly.forEach((r, h) => {
    const lens = r.map((q, i) => dist(q, r[(i + 1) % r.length]!) * 1000);
    console.log(tag, `poly${k} anel${h} n=${r.length} menores(mm)=`, lens.filter((l) => l < 10).map((l) => l.toFixed(3)).join(','));
  }));
  dump('union      ', u);
  dump('closeGaps  ', g);
  const r = perimeterFromBox({ project: () => store.project, levelId: () => 'lv_0', hiddenInView: () => new Set<string>() }, { x: -50, y: -50 }, { x: 50, y: 50 });
  console.log('ringToSegs n=', r.segs.length, 'menores(mm)=', r.segs.map((s) => dist(s.a, s.b) * 1000).filter((l) => l < 10).map((l) => l.toFixed(3)).join(','));
});
