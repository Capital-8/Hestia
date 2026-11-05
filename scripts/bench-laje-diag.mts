import { readFileSync } from 'node:fs';
import { resolveLevel } from '@hestia/engine';
import { migrateProject } from '@hestia/model';
import { ModelScene } from '@hestia/render';
const p = migrateProject(JSON.parse(readFileSync(process.argv[2]!, 'utf8')));
const resolved = p.levels.map((l) => resolveLevel(p, l.id));
const sc = new ModelScene(); sc.update(p, resolved, { edges: false, shadows: false, dark: false });
for (const id of ['semisotano-LAJE', 'piso1-SAC3', 'piso1-S3', 'piso1-W186']) {
  sc.highlight([id], null);
  const camada = (sc as any).realces.camada as import('three').Object3D;
  let fillTris = 0, segs = 0, objs = 0;
  camada.traverse((o: any) => {
    if (!o.geometry) return; objs++;
    const g = o.geometry;
    if (o.isLineSegments) segs += g.getAttribute('position').count / 2;
    else fillTris += g.drawRange.count / 3;
  });
  console.log(id.padEnd(18), 'objetos', objs, 'triângulos fill', fillTris, 'segmentos de aresta', segs);
}
