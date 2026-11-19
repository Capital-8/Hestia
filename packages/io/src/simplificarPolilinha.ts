/**
 * Simplificação de polilinhas de levantamento (Douglas-Peucker em planta). Só reduz vértices das FONTES importadas
 * (curvas e quebras); não gera malha nem curva nova. A cota (z) de um vértice mantido não muda.
 */

/** Distância em planta do ponto (px, py) ao segmento (ax, ay)–(bx, by); segmento degenerado vale a distância ao ponto. */
function distanciaAoSegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const comp2 = dx * dx + dy * dy;
  if (comp2 === 0) return Math.hypot(px - ax, py - ay);
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / comp2));
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}

/** Índices (ordenados) dos pontos mantidos pelo Douglas-Peucker; iterativo, sem recursão (polilinhas de 100 mil pontos). */
function indicesMantidos(v: readonly number[], passo: number, n: number, tolerancia: number): number[] {
  const manter = new Uint8Array(n);
  manter[0] = 1;
  manter[n - 1] = 1;
  const pilha: Array<[number, number]> = [[0, n - 1]];
  while (pilha.length > 0) {
    const [a, b] = pilha.pop()!;
    if (b - a < 2) continue;
    const ax = v[a * passo]!;
    const ay = v[a * passo + 1]!;
    const bx = v[b * passo]!;
    const by = v[b * passo + 1]!;
    let maior = -1;
    let ondeMaior = -1;
    for (let k = a + 1; k < b; k++) {
      const d = distanciaAoSegmento(v[k * passo]!, v[k * passo + 1]!, ax, ay, bx, by);
      if (d > maior) {
        maior = d;
        ondeMaior = k;
      }
    }
    if (maior > tolerancia) {
      manter[ondeMaior] = 1;
      pilha.push([a, ondeMaior], [ondeMaior, b]);
    }
  }
  const out: number[] = [];
  for (let k = 0; k < n; k++) if (manter[k] === 1) out.push(k);
  return out;
}

/**
 * Douglas-Peucker em planta. `v` é um vetor plano com `passo` números por vértice (2 = x, y; 3 = x, y, z); o erro é medido
 * só em (x, y). As pontas nunca saem. Tolerância ≤ 0 (ou vetor com menos de 3 vértices) devolve uma cópia. Em polilinha
 * `fechada` (sem repetir o primeiro vértice no fim) o anel é tratado com o primeiro vértice repetido no fim, e se sobrar
 * menos de 3 vértices o anel original é mantido.
 */
export function simplificarPolilinha(v: readonly number[], tolerancia: number, passo: 2 | 3 = 2, fechada = false): number[] {
  const n = Math.floor(v.length / passo);
  if (!(tolerancia > 0) || n < 3) return v.slice();
  const base = fechada ? [...v.slice(0, n * passo), ...v.slice(0, passo)] : v.slice(0, n * passo);
  const total = fechada ? n + 1 : n;
  let indices = indicesMantidos(base, passo, total, tolerancia);
  if (fechada) {
    indices = indices.filter((k) => k < n);
    if (indices.length < 3) return v.slice();
  }
  const out: number[] = [];
  for (const k of indices) for (let c = 0; c < passo; c++) out.push(base[k * passo + c]!);
  return out;
}

/** Maior distância em planta de um vértice de `original` à polilinha `simplificada` (para conferir o erro nos testes). */
export function erroMaximoSimplificacao(original: readonly number[], simplificada: readonly number[], passo: 2 | 3 = 2): number {
  const n = Math.floor(original.length / passo);
  const m = Math.floor(simplificada.length / passo);
  let pior = 0;
  for (let k = 0; k < n; k++) {
    let melhor = Infinity;
    for (let j = 0; j + 1 < m; j++) {
      melhor = Math.min(
        melhor,
        distanciaAoSegmento(original[k * passo]!, original[k * passo + 1]!, simplificada[j * passo]!, simplificada[j * passo + 1]!, simplificada[(j + 1) * passo]!, simplificada[(j + 1) * passo + 1]!),
      );
    }
    pior = Math.max(pior, melhor);
  }
  return pior;
}
