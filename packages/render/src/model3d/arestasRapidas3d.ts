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
/** Cada vértice tem id < 2^26, então id0 * 2^26 + id1 é exato em ponto flutuante. */
const BASE = 67108864;

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

  // Identificação de vértices por posição arredondada: tabela de endereçamento aberto sobre inteiros, com verificação exata.
  let capacidade = 1024;
  while (capacidade < nTri * 6) capacidade *= 2;
  const mascara = capacidade - 1;
  const tabela = new Int32Array(capacidade).fill(-1);
  let rx: Float64Array = new Float64Array(Math.max(16, nTri * 3));
  let ry: Float64Array = new Float64Array(rx.length);
  let rz: Float64Array = new Float64Array(rx.length);
  let nIds = 0;
  const idDe = (v: number): number => {
    const ax = Math.round(pos[3 * v]! * PRECISAO);
    const ay = Math.round(pos[3 * v + 1]! * PRECISAO);
    const az = Math.round(pos[3 * v + 2]! * PRECISAO);
    let h = (Math.imul(ax | 0, 73856093) ^ Math.imul(ay | 0, 19349663) ^ Math.imul(az | 0, 83492791)) & mascara;
    for (;;) {
      const id = tabela[h]!;
      if (id === -1) break;
      if (rx[id] === ax && ry[id] === ay && rz[id] === az) return id;
      h = (h + 1) & mascara;
    }
    if (nIds === rx.length) {
      const cresce = (a: Float64Array): Float64Array => {
        const b = new Float64Array(a.length * 2);
        b.set(a);
        return b;
      };
      rx = cresce(rx);
      ry = cresce(ry);
      rz = cresce(rz);
    }
    rx[nIds] = ax;
    ry[nIds] = ay;
    rz[nIds] = az;
    tabela[h] = nIds;
    return nIds++;
  };

  // Arestas por chave numérica -> posição no registro (ou -1: já combinada com a irmã). A ordem de inserção do Map é a de saída.
  const arestas = new Map<number, number>();
  const idx0: number[] = [];
  const idx1: number[] = [];
  const normais: number[] = [];
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
      const chave = h0 * BASE + h1;
      const reversa = h1 * BASE + h0;
      const par = arestas.get(reversa);
      if (par !== undefined && par >= 0) {
        // Aresta irmã: sai se as faces passam do limiar; em qualquer caso, a irmã deixa de valer.
        if (nx * normais[3 * par]! + ny * normais[3 * par + 1]! + nz * normais[3 * par + 2]! <= limiarDot) {
          empurrar(v0);
          empurrar(v1);
        }
        arestas.set(reversa, -1);
      } else if (!arestas.has(chave)) {
        arestas.set(chave, idx0.length);
        idx0.push(v0);
        idx1.push(v1);
        normais.push(nx, ny, nz);
      }
    }
  }
  for (const r of arestas.values()) {
    if (r < 0) continue;
    empurrar(idx0[r]!);
    empurrar(idx1[r]!);
  }
  return saida;
}
