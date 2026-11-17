import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { migrateProject } from '@hestia/model';
import { computeSection, roofDrawingsOf } from './section.ts';
import { resolveRoofs, planeZ } from './roofs.ts';
import { pointInMulti } from '@hestia/geom';

it('oraculo de raios do telhado', () => {
  const p = migrateProject(JSON.parse(readFileSync('/home/dennylson/Documentos/Projetos/Projeto sem título (5)/projeto.hestia.json', 'utf8')));
  const roofs = resolveRoofs(p, 'lv_0');
  const out: Record<string, unknown> = {};
  for (const name of ['Norte', 'Leste', 'Sul', 'Oeste']) {
    const v = p.views.find((x) => x.name === name)!;
    const a = v.a, b = v.b;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = { x: -d.y, y: d.x };
    const th = roofs[0]!.layers.reduce((s, l) => s + l.thickness, 0);
    const STEP = 0.02;
    const t0 = 2.5, t1 = len - 2.5, z0 = 2.6, z1 = 3.6;
    const nx = Math.round((t1 - t0) / STEP), nz = Math.round((z1 - z0) / STEP);
    const id = new Int16Array(nx * nz).fill(-1);
    const sdep = new Float32Array(nx * nz).fill(1e9);
    const r = roofs[0]!;
    for (let ix = 0; ix < nx; ix++) {
      const t = t0 + (ix + 0.5) * STEP;
      for (let iz = 0; iz < nz; iz++) {
        const z = z0 + (iz + 0.5) * STEP;
        let best = 1e9, bestId = -1;
        r.planes.forEach((pl, k) => {
          // top(s) = A + B*s ; ponto p(s) = a + d t + n s
          const px = a.x + d.x * t, py = a.y + d.y * t;
          const A = planeZ(pl, { x: px, y: py });
          const B = (pl.percent / 100) * (n.x * pl.up.x + n.y * pl.up.y);
          let lo = 0, hi = 40;
          if (Math.abs(B) < 1e-12) { if (!(A - th <= z && z <= A)) return; }
          else {
            const s1 = (z - A) / B, s2 = (z - A + th) / B;
            lo = Math.max(lo, Math.min(s1, s2)); hi = Math.min(hi, Math.max(s1, s2));
          }
          if (lo > hi) return;
          // dentro do poligono: amostra o trecho [lo,hi] (passo 1 cm) e pega o primeiro s dentro
          for (let s = lo; s <= hi + 1e-9; s += 0.01) {
            if (pointInMulti({ x: px + n.x * s, y: py + n.y * s }, pl.polygon)) { if (s < best) { best = s; bestId = k; } break; }
          }
        });
        id[ix * nz + iz] = bestId; sdep[ix * nz + iz] = best;
      }
    }
    // nosso desenho: silhueta + preenchimentos do telhado
    const s = computeSection(p, { a, b, depth: 30 });
    const rd = roofDrawingsOf(s.beyond)[0];
    const ours = (t: number, z: number) => !!rd && (pointInMulti({ x: t, y: z }, rd.silhouette) || rd.fills.some((f) => pointInMulti({ x: t, y: z }, f.polygons)));
    let miss = 0, extra = 0, both = 0;
    const diff = new Int8Array(nx * nz);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const t = t0 + (ix + 0.5) * STEP, z = z0 + (iz + 0.5) * STEP;
      const truth = id[ix * nz + iz]! >= 0, o = ours(t, z);
      diff[ix * nz + iz] = truth && o ? 0 : truth && !o ? 1 : !truth && o ? 2 : 3;
      if (truth && !o) miss++; else if (!truth && o) extra++; else if (truth && o) both++;
    }
    console.log('ORACULO', name, 'verdade', both + miss, 'nosso', both + extra, 'faltam (verdade e nao nosso)', miss, 'sobram (nosso e nao verdade)', extra);
    out[name] = { nx, nz, t0, z0, STEP, id: Array.from(id), diff: Array.from(diff), segs: rd ? rd.segments.map((q) => [q[0], q[1]]) : [], sil: rd ? rd.silhouette : [] };
  }
  writeFileSync('/tmp/claude-1000/-run-media-dennylson-HD-1TB-Projetos-GitHub-Hestia/a4cae516-fd03-467c-b1c8-229df266fa0d/scratchpad/oracle.json', JSON.stringify(out));
});
