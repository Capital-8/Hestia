/**
 * Arestas de uma malha de triângulos pelo ângulo entre faces: o mesmo critério e a mesma saída do `THREE.EdgesGeometry`, sem as cadeias
 * de texto e os objetos por triângulo dele. O `EdgesGeometry` gasta ~10 µs por triângulo (hash em texto por vértice e por aresta); um guarda-corpo
 * de balaústres tem ~9 mil triângulos, então ligar as arestas num projeto com dezenas de escadas com guarda-corpo levava segundos. Aqui o vértice
 * é identificado por um inteiro (posição arredondada a 1e-4, como lá) e a aresta por um número, e a ordem das arestas é a mesma (ordem de inserção).
 *
 * Igual ao do three (conferido em `arestasRapidas3d.test.ts`): triângulo degenerado (dois vértices no mesmo ponto arredondado) é ignorado; a aresta
 * compartilhada em sentido oposto sai se o cosseno entre as normais das faces é <= cos(limiar); aresta sem par sai ao final.
 */

const PRECISAO = 1e4;

/**
 * Arestas (pares de pontos, `x y z x y z ...`) da malha. `posicoes` são `x y z` por vértice; `indices` (opcional) lista os triângulos, e sem eles
 * cada três vértices seguidos são um triângulo. `limiarGraus`: a aresta só sai se o ângulo entre as faces passa disso.
 */
export function arestasPorAngulo(posicoes: ArrayLike<number>, indices: ArrayLike<number> | null, limiarGraus: number): number[] {
  const limiarDot = Math.cos((Math.PI / 180) * limiarGraus);
  const nIndices = indices ? indices.length : Math.floor(posicoes.length / 3);
  const nTri = Math.floor(nIndices / 3);
  // Posições como no buffer do three (Float32): o hash e o resultado partem dos mesmos valores.
  const pos = posicoes instanceof Float32Array ? posicoes : Float32Array.from(posicoes);

  // Identificação de vértices por posição arredondada: UM id por vértice do buffer (calculado uma vez, não a cada canto de triângulo).
  const nVert = Math.floor(pos.length / 3);
  let capacidade = 1024;
  while (capacidade < nVert * 2) capacidade *= 2;
  const mascara = capacidade - 1;
  const tabela = new Int32Array(capacidade).fill(-1);
  const rx = new Float64Array(nVert);
  const ry = new Float64Array(nVert);
  const rz = new Float64Array(nVert);
  const idVert = new Int32Array(nVert).fill(-1);
  let nIds = 0;
  const idDe = (v: number): number => {
    const memo = idVert[v]!;
    if (memo >= 0) return memo;
    const ax = Math.round(pos[3 * v]! * PRECISAO);
    const ay = Math.round(pos[3 * v + 1]! * PRECISAO);
    const az = Math.round(pos[3 * v + 2]! * PRECISAO);
    let h = (Math.imul(ax | 0, 73856093) ^ Math.imul(ay | 0, 19349663) ^ Math.imul(az | 0, 83492791)) & mascara;
    for (;;) {
      const id = tabela[h]!;
      if (id === -1) break;
      if (rx[id] === ax && ry[id] === ay && rz[id] === az) return (idVert[v] = id);
      h = (h + 1) & mascara;
    }
    rx[nIds] = ax;
    ry[nIds] = ay;
    rz[nIds] = az;
    tabela[h] = nIds;
    return (idVert[v] = nIds++);
  };

  // Arestas orientadas (id0, id1) numa tabela de endereçamento aberto sobre typed arrays -> registro. A ordem dos registros é a de inserção (a de saída).
  const maxArestas = nTri * 3;
  let capE = 1024;
  while (capE < maxArestas * 2) capE *= 2;
  const mascE = capE - 1;
  const tabE = new Int32Array(capE).fill(-1);
  const k0 = new Int32Array(maxArestas);
  const k1 = new Int32Array(maxArestas);
  const idx0 = new Int32Array(maxArestas);
  const idx1 = new Int32Array(maxArestas);
  const vivo = new Uint8Array(maxArestas);
  const normais = new Float64Array(maxArestas * 3);
  let nReg = 0;
  /** Registro da aresta orientada (h0 -> h1), ou -1. */
  const achar = (h0: number, h1: number): number => {
    let h = (Math.imul(h0, 0x9e3779b1) ^ Math.imul(h1 + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
    h = (h ^ (h >>> 15)) & mascE;
    for (;;) {
      const r = tabE[h]!;
      if (r === -1) return -1 - h; // < 0: slot livre (-1 - slot)
      if (k0[r] === h0 && k1[r] === h1) return r;
      h = (h + 1) & mascE;
    }
  };
  const saida: number[] = [];
  const empurrar = (v: number): void => {
    saida.push(pos[3 * v]!, pos[3 * v + 1]!, pos[3 * v + 2]!);
  };
  for (let i = 0; i + 2 < nIndices; i += 3) {
    const a = indices ? indices[i]! : i;
    const b = indices ? indices[i + 1]! : i + 1;
    const c = indices ? indices[i + 2]! : i + 2;
    // Normal da face, como `Triangle.getNormal`: (c − b) × (a − b), normalizada (zero se degenerada).
    const bx = pos[3 * b]!;
    const by = pos[3 * b + 1]!;
    const bz = pos[3 * b + 2]!;
    const e1x = pos[3 * c]! - bx;
    const e1y = pos[3 * c + 1]! - by;
    const e1z = pos[3 * c + 2]! - bz;
    const e2x = pos[3 * a]! - bx;
    const e2y = pos[3 * a + 1]! - by;
    const e2z = pos[3 * a + 2]! - bz;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l2 = nx * nx + ny * ny + nz * nz;
    if (l2 > 0) {
      const inv = 1 / Math.sqrt(l2);
      nx *= inv;
      ny *= inv;
      nz *= inv;
    } else {
      nx = ny = nz = 0;
    }
    const ia = idDe(a);
    const ib = idDe(b);
    const ic = idDe(c);
    if (ia === ib || ib === ic || ic === ia) continue;
    for (let j = 0; j < 3; j++) {
      const h0 = j === 0 ? ia : j === 1 ? ib : ic;
      const h1 = j === 0 ? ib : j === 1 ? ic : ia;
      const v0 = j === 0 ? a : j === 1 ? b : c;
      const v1 = j === 0 ? b : j === 1 ? c : a;
      const par = achar(h1, h0);
      if (par >= 0 && vivo[par]) {
        // Aresta irmã: sai se as faces passam do limiar; em qualquer caso, a irmã deixa de valer.
        if (nx * normais[3 * par]! + ny * normais[3 * par + 1]! + nz * normais[3 * par + 2]! <= limiarDot) {
          empurrar(v0);
          empurrar(v1);
        }
        vivo[par] = 0;
      } else {
        const r = achar(h0, h1);
        if (r < 0) {
          const reg = nReg++;
          tabE[-1 - r] = reg;
          k0[reg] = h0;
          k1[reg] = h1;
          idx0[reg] = v0;
          idx1[reg] = v1;
          vivo[reg] = 1;
          normais[3 * reg] = nx;
          normais[3 * reg + 1] = ny;
          normais[3 * reg + 2] = nz;
        }
      }
    }
  }
  for (let r = 0; r < nReg; r++) {
    if (!vivo[r]) continue;
    empurrar(idx0[r]!);
    empurrar(idx1[r]!);
  }
  return saida;
}
