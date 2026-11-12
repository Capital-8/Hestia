// Orientacao das faces dos formatos que nao dizem se o material e de dois lados (obj, dae, fbx).
//
// O desenho descarta as faces traseiras (three.js e Bevy fazem isso por padrao). Uma malha fechada e com as faces para
// fora nao perde nada com isso, mas chapas abertas (tecido, folha, tampo de uma face so), malhas de dentro para fora e
// fundos abertos perdem as faces vistas de tras: elas somem conforme o angulo. Aqui a decisao vem de EVIDENCIA: a malha de
// cada grupo e rasterizada (z-buffer ortografico, em baixa resolucao) de varias direcoes; o triangulo que aparece como a
// superficie MAIS PROXIMA e esta de costas para a camera so seria visto sem o descarte. Esses triangulos vao para um grupo
// proprio com `doubleSided: true`; o resto continua de um lado so (com descarte, que e mais barato). Duas faces coincidentes
// de sentidos opostos (modelo ja de dois lados) contam como de frente: nao e preciso marcar nada.
import type { ImportedMeshDef, ImportedMeshGroup } from './types.ts';

/** Direcoes de observacao (unitarias): 6 eixos, 12 diagonais de aresta e 8 de canto. */
const DIRECOES: Array<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const n = Math.hypot(x, y, z);
        out.push([x / n, y / n, z / n]);
      }
    }
  }
  return out;
})();

const RES = 128;

/**
 * Para cada triangulo de `indices[start .. start+count)`: `true` se ele aparece como a superficie mais proxima, de costas
 * para a camera, em alguma das direcoes de observacao (precisa dos dois lados). Triangulos de area zero devolvem `false`.
 */
export function trianglesNeedingBothSides(positions: Float32Array, indices: Uint32Array, start: number, count: number): boolean[] {
  const nTri = Math.floor(count / 3);
  const need: boolean[] = new Array<boolean>(nTri).fill(false);
  if (nTri === 0 || positions.length === 0) return need;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k] as number;
      if (v < mn[k]!) mn[k] = v;
      if (v > mx[k]!) mx[k] = v;
    }
  }
  const diag = Math.hypot(mx[0]! - mn[0]!, mx[1]! - mn[1]!, mx[2]! - mn[2]!);
  if (!(diag > 0)) return need;
  const c = [(mn[0]! + mx[0]!) / 2, (mn[1]! + mx[1]!) / 2, (mn[2]! + mx[2]!) / 2];
  const scale = RES / (diag * 1.05);
  const eps = diag * 2e-4;

  // normal do enrolamento por triangulo
  const nx = new Float32Array(nTri), ny = new Float32Array(nTri), nz = new Float32Array(nTri);
  const valid = new Uint8Array(nTri);
  for (let t = 0; t < nTri; t++) {
    const a = (indices[start + t * 3] as number) * 3, b = (indices[start + t * 3 + 1] as number) * 3, d = (indices[start + t * 3 + 2] as number) * 3;
    const e1x = (positions[b] as number) - (positions[a] as number), e1y = (positions[b + 1] as number) - (positions[a + 1] as number), e1z = (positions[b + 2] as number) - (positions[a + 2] as number);
    const e2x = (positions[d] as number) - (positions[a] as number), e2y = (positions[d + 1] as number) - (positions[a + 1] as number), e2z = (positions[d + 2] as number) - (positions[a + 2] as number);
    const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(gx, gy, gz);
    if (l < 1e-14) continue;
    nx[t] = gx / l;
    ny[t] = gy / l;
    nz[t] = gz / l;
    valid[t] = 1;
  }

  const nv = positions.length / 3;
  const sx = new Float32Array(nv), sy = new Float32Array(nv), sz = new Float32Array(nv);
  const zb = new Float32Array(RES * RES), ib = new Int32Array(RES * RES), fb = new Uint8Array(RES * RES);
  for (const dir of DIRECOES) {
    // base ortonormal (u, v) do plano da imagem; a camera olha para `dir`
    const ax = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = dir[1] * ax[2]! - dir[2] * ax[1]!, uy = dir[2] * ax[0]! - dir[0] * ax[2]!, uz = dir[0] * ax[1]! - dir[1] * ax[0]!;
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = dir[1] * uz - dir[2] * uy, vy = dir[2] * ux - dir[0] * uz, vz = dir[0] * uy - dir[1] * ux;
    for (let i = 0; i < nv; i++) {
      const x = (positions[i * 3] as number) - c[0]!, y = (positions[i * 3 + 1] as number) - c[1]!, z = (positions[i * 3 + 2] as number) - c[2]!;
      sx[i] = (x * ux + y * uy + z * uz) * scale + RES / 2;
      sy[i] = RES / 2 - (x * vx + y * vy + z * vz) * scale;
      sz[i] = x * dir[0] + y * dir[1] + z * dir[2]; // menor = mais perto da camera
    }
    zb.fill(Infinity);
    ib.fill(-1);
    for (let t = 0; t < nTri; t++) {
      if (!valid[t]) continue;
      const a = indices[start + t * 3] as number, b = indices[start + t * 3 + 1] as number, d = indices[start + t * 3 + 2] as number;
      const x0 = sx[a]!, y0 = sy[a]!, x1 = sx[b]!, y1 = sy[b]!, x2 = sx[d]!, y2 = sy[d]!;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;
      const front = nx[t]! * dir[0] + ny[t]! * dir[1] + nz[t]! * dir[2] < 0;
      const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(RES - 1, Math.ceil(Math.max(x0, x1, x2)));
      const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(RES - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (let py = miny; py <= maxy; py++) {
        for (let px = minx; px <= maxx; px++) {
          const X = px + 0.5, Y = py + 0.5;
          const w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area;
          const w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * sz[a]! + w1 * sz[b]! + w2 * sz[d]!;
          const k = py * RES + px;
          const cur = zb[k]!;
          if (cur === Infinity || z < cur - eps) {
            zb[k] = z;
            ib[k] = t;
            fb[k] = front ? 1 : 0;
          } else if (z <= cur + eps && front && !fb[k]) {
            // empate (faces coincidentes de sentidos opostos): a de frente vence
            zb[k] = Math.min(z, cur);
            ib[k] = t;
            fb[k] = 1;
          }
        }
      }
    }
    for (let k = 0; k < RES * RES; k++) {
      const t = ib[k]!;
      if (t >= 0 && !fb[k]) need[t] = true;
    }
  }
  return need;
}

/**
 * Preenche `doubleSided` dos grupos que ainda nao dizem (`undefined`), dividindo cada um em um grupo de um lado so (o que
 * nunca aparece de costas) e um de dois lados (o que aparece). Troca a ordem dos triangulos dentro do grupo (nao muda a
 * imagem). Devolve quantos triangulos ficaram em grupos de dois lados.
 */
export function markDoubleSided(def: ImportedMeshDef): number {
  const groups: ImportedMeshGroup[] = def.groups.length > 0 ? def.groups : [{ start: 0, count: def.indices.length, materialIndex: 0 }];
  if (groups.every((g) => g.doubleSided !== undefined)) return def.groups.reduce((s, g) => s + (g.doubleSided ? g.count / 3 : 0), 0);
  // A malha INTEIRA da definicao entra no z-buffer (os outros materiais escondem faces do grupo); o resultado e dividido por grupo.
  const needAll = trianglesNeedingBothSides(def.positions, def.indices, 0, def.indices.length);
  const out = new Uint32Array(def.indices.length);
  const newGroups: ImportedMeshGroup[] = [];
  let at = 0;
  let both = 0;
  for (const g of groups) {
    if (g.doubleSided !== undefined) {
      out.set(def.indices.subarray(g.start, g.start + g.count), at);
      newGroups.push({ ...g, start: at });
      at += g.count;
      if (g.doubleSided) both += g.count / 3;
      continue;
    }
    const t0 = g.start / 3;
    const nT = Math.floor(g.count / 3);
    for (const wantBoth of [false, true]) {
      const first = at;
      for (let t = 0; t < nT; t++) {
        if (needAll[t0 + t] !== wantBoth) continue;
        out[at] = def.indices[g.start + t * 3]!;
        out[at + 1] = def.indices[g.start + t * 3 + 1]!;
        out[at + 2] = def.indices[g.start + t * 3 + 2]!;
        at += 3;
      }
      if (at > first) {
        newGroups.push({ start: first, count: at - first, materialIndex: g.materialIndex, ...(wantBoth ? { doubleSided: true } : {}) });
        if (wantBoth) both += (at - first) / 3;
      }
    }
  }
  def.indices = out;
  def.groups = newGroups;
  return both;
}
