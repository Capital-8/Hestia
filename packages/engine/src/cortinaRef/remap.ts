/**
 * Remapeamento das sobrescritas da parede cortina quando a grade muda (decisão 0056, §4.4 e §5.2). Chave de célula =
 * ÍNDICE mais POSIÇÃO NORMALIZADA do centro (`s/L`, `z/H`). Algoritmo do ADR, na ordem:
 *   1. mesma topologia (`nu`, `nv` iguais à gravação): vale o índice, se o centro novo ficou a até 0,5 da posição gravada;
 *   2. topologia diferente, ou o passo 1 falhou: vale a posição (`s·L'`, `z·H'`) localizada na grade nova (na fronteira, a célula de menor índice);
 *   3. fusão: duas sobrescritas caem na mesma célula: vence a de menor distância entre o ponto gravado e o centro; a outra é órfã;
 *   4. vizinhança: ponto fora da grade (a parede encurtou): a célula mais próxima, a até uma célula de distância, se não estiver ocupada;
 *   5. órfã: sai no aviso `cortina-override-orfao`. Quem descarta é `normalizarSobrescritas` (em `normalizar.ts`).
 *   6. reescrita: a chave adotada leva o índice e a posição novos (o resultado já traz a chave nova).
 * Linhas e segmentos seguem a mesma lógica em 1D (índice e posição). Determinístico: a ordem da lista de gravação decide empates.
 * Referência TS pura; só para paridade com o Rust. Ver `README.md` desta pasta.
 */
import { ID_AUSENTE, TOL_SOLDA, at, type CellKey, type LineRef, type SegmentRef } from './tipos.ts';
import type { EixoResolvido, GradeResolvida } from './grade.ts';

/** Limiar da topologia igual (passo 1): diferença de posição normalizada, em fração do eixo. */
export const LIMIAR_TOPOLOGIA = 0.5;

/** Estados do remapeamento. `adotada` = 0; as órfãs (1 a 3) saem no aviso. */
export const ESTADO = { adotada: 0, fusao: 1, fora: 2, ocupada: 3 } as const;
export type EstadoRemap = (typeof ESTADO)[keyof typeof ESTADO];

/**
 * Resultado de uma sobrescrita. `a`/`b` = alvo na grade nova: célula (i, j); linha (índice 1..n-1, 0); segmento (linha
 * global, k). `ID_AUSENTE` quando órfã. `s`/`z` = chave gravada de volta (célula: centro normalizado; linha: fração; segmento:
 * meio). `px`/`pz` = posição gravada no plano (m), para o aviso "Ir para".
 */
export interface Remap {
  estado: EstadoRemap;
  regra: 0 | 1 | 2 | 4;
  a: number;
  b: number;
  s: number;
  z: number;
  px: number;
  pz: number;
}

export function resultado(estado: EstadoRemap, regra: Remap['regra'], a: number, b: number, s: number, z: number, px: number, pz: number): Remap {
  return { estado, regra, a, b, s, z, px, pz };
}

export function orfa(estado: EstadoRemap, regra: Remap['regra'], px: number, pz: number): Remap {
  return resultado(estado, regra, ID_AUSENTE, ID_AUSENTE, 0, 0, px, pz);
}

/** Posição normalizada do centro da célula `i` (ou do segmento `i`) de um eixo de bordas `bordas`. */
export function centroNorm(bordas: readonly number[], i: number): number {
  const A = at(bordas, bordas.length - 1);
  return (at(bordas, i) + at(bordas, i + 1)) / 2 / A;
}

/**
 * Célula que contém `p` (m) numa lista de bordas: `null` se fora da grade (com tolerância de soldagem). Na fronteira
 * exata vale a célula de menor índice (ADR §4.4, passo 2).
 */
export function celulaDoPonto(bordas: readonly number[], p: number): number | null {
  const n = bordas.length - 1;
  if (p < -TOL_SOLDA || p > at(bordas, n) + TOL_SOLDA) return null;
  for (let i = 0; i < n; i++) if (p <= at(bordas, i + 1) + TOL_SOLDA) return i;
  return n - 1;
}

/** Célula mais próxima de `p` e a distância até ela (0 se `p` está dentro). Fora, é a da ponta. */
function cellMaisProxima(bordas: readonly number[], p: number): { i: number; dist: number } {
  const n = bordas.length - 1;
  if (p < at(bordas, 0)) return { i: 0, dist: at(bordas, 0) - p };
  if (p > at(bordas, n)) return { i: n - 1, dist: p - at(bordas, n) };
  return { i: celulaDoPonto(bordas, p) ?? 0, dist: 0 };
}

/** Chave de célula gravada agora, na grade `g`. É o que a edição regrava (ADR §4.3). */
export function chaveDaCelula(g: GradeResolvida, i: number, j: number): CellKey {
  return { i, j, s: centroNorm(g.u.bordas, i), z: centroNorm(g.v.bordas, j), nu: g.nu, nv: g.nv };
}

/**
 * Remapeia uma linha gerada (`index` na gravação, `pos` fração, `n` células) para a grade gerada `gen` (antes de extras e
 * sobrescritas). Linha = índice se a topologia é igual e a fração ficou a até 0,5; senão a linha interna mais próxima
 * do ponto, se estiver a até uma célula de distância. `a` = índice 1..n-1 da grade gerada.
 */
export function remapearLinha(
  ref: { index: number; pos: number; n: number },
  gen: { comprimento: number; linhas: readonly number[] },
): Remap {
  const A = gen.comprimento;
  const nNovo = gen.linhas.length + 1;
  const p = ref.pos * A;
  if (ref.n === nNovo && ref.index >= 1 && ref.index <= gen.linhas.length) {
    const q = at(gen.linhas, ref.index - 1);
    if (Math.abs(q / A - ref.pos) <= LIMIAR_TOPOLOGIA) return resultado(ESTADO.adotada, 1, ref.index, 0, q / A, 0, q, 0);
  }
  if (gen.linhas.length === 0) return orfa(ESTADO.fora, 0, p, 0);
  let melhor = 0;
  for (let k = 1; k < gen.linhas.length; k++) {
    if (Math.abs(at(gen.linhas, k) - p) < Math.abs(at(gen.linhas, melhor) - p)) melhor = k;
  }
  const q = at(gen.linhas, melhor);
  if (Math.abs(q - p) <= A / nNovo + TOL_SOLDA) return resultado(ESTADO.adotada, 2, melhor + 1, 0, q / A, 0, q, 0);
  return orfa(ESTADO.fora, 0, p, 0);
}

interface CandCelula { k: number; i: number; j: number; regra: 1 | 2; d: number; px: number; pz: number }

/**
 * Remapeia as chaves de célula para a grade `g` (passos 1 a 6 do ADR §4.4). Retorna um resultado por chave, na mesma
 * ordem. A chave adotada já traz o centro normalizado novo (passo 6).
 */
export function remapearCelulas(chaves: readonly CellKey[], g: GradeResolvida): Remap[] {
  const { L, H, nu, nv } = g;
  const sB = g.u.bordas;
  const zB = g.v.bordas;
  const cS = (i: number): number => (at(sB, i) + at(sB, i + 1)) / 2;
  const cZ = (j: number): number => (at(zB, j) + at(zB, j + 1)) / 2;
  const out: Remap[] = chaves.map(() => orfa(ESTADO.fora, 0, 0, 0));
  const adotada = (regra: 1 | 2 | 4, i: number, j: number, px: number, pz: number): Remap =>
    resultado(ESTADO.adotada, regra, i, j, cS(i) / L, cZ(j) / H, px, pz);

  const cands: CandCelula[] = [];
  const pendentes: number[] = [];
  chaves.forEach((c, k) => {
    const px = c.s * L;
    const pz = c.z * H;
    // Passo 1: mesma topologia, o índice vale se o centro novo ficou a até 0,5 da posição gravada.
    if (c.nu === nu && c.nv === nv && c.i >= 0 && c.i < nu && c.j >= 0 && c.j < nv
      && Math.abs(cS(c.i) / L - c.s) <= LIMIAR_TOPOLOGIA && Math.abs(cZ(c.j) / H - c.z) <= LIMIAR_TOPOLOGIA) {
      cands.push({ k, i: c.i, j: c.j, regra: 1, d: Math.hypot(px - cS(c.i), pz - cZ(c.j)), px, pz });
      return;
    }
    // Passo 2: a posição gravada, localizada na grade nova.
    const i = celulaDoPonto(sB, px);
    const j = celulaDoPonto(zB, pz);
    if (i !== null && j !== null) cands.push({ k, i, j, regra: 2, d: Math.hypot(px - cS(i), pz - cZ(j)), px, pz });
    else pendentes.push(k);
  });

  // Passo 3: fusão. Na mesma célula vence a de menor distância (empate: a primeira na ordem de gravação).
  const porCelula = new Map<number, CandCelula[]>();
  for (const c of cands) {
    const id = c.i * nv + c.j;
    const lista = porCelula.get(id);
    if (lista) lista.push(c);
    else porCelula.set(id, [c]);
  }
  const ocupadas = new Set<number>();
  for (const [id, lista] of porCelula) {
    let vence = lista[0] as CandCelula;
    for (const c of lista) if (c.d < vence.d) vence = c;
    ocupadas.add(id);
    for (const c of lista) {
      out[c.k] = c === vence ? adotada(c.regra, c.i, c.j, c.px, c.pz) : orfa(ESTADO.fusao, c.regra, c.px, c.pz);
    }
  }

  // Passo 4: vizinhança. Ponto fora da grade: a célula mais próxima, a até uma célula de distância, se livre.
  for (const k of pendentes) {
    const c = chaves[k] as CellKey;
    const px = c.s * L;
    const pz = c.z * H;
    const a = cellMaisProxima(sB, px);
    const b = cellMaisProxima(zB, pz);
    if (a.dist > at(sB, a.i + 1) - at(sB, a.i) + TOL_SOLDA || b.dist > at(zB, b.i + 1) - at(zB, b.i) + TOL_SOLDA) {
      out[k] = orfa(ESTADO.fora, 0, px, pz);
      continue;
    }
    const id = a.i * nv + b.i;
    if (ocupadas.has(id)) {
      out[k] = orfa(ESTADO.ocupada, 0, px, pz);
      continue;
    }
    ocupadas.add(id);
    out[k] = adotada(4, a.i, b.i, px, pz);
  }
  return out;
}

/**
 * Remapeia os segmentos removidos: a linha (gerada ou extra) pelo mesmo critério, e o segmento ao longo dela pelo
 * índice (topologia igual) ou pelo meio normalizado. `a` = linha global (U = 0..nu; V = nu+1..nu+nv+1), `b` = k.
 * Borda não é referenciável (o `LineRef` só aponta linhas internas): segmento de borda sai órfão.
 */
export function remapearSegmentos(refs: readonly SegmentRef[], g: GradeResolvida): Remap[] {
  const out: Remap[] = refs.map(() => orfa(ESTADO.fora, 0, 0, 0));
  interface Cand { k: number; a: number; b: number; regra: 1 | 2; d: number; px: number }
  const cands: Cand[] = [];
  refs.forEach((r, k) => {
    let eixo: 'u' | 'v';
    let linhaFinal: number;
    if ('added' in r.line) {
      const iu = g.u.origens.findIndex((o) => o.id === (r.line as { added: string }).added);
      const iv = iu >= 0 ? -1 : g.v.origens.findIndex((o) => o.id === (r.line as { added: string }).added);
      if (iu >= 0) { eixo = 'u'; linhaFinal = iu + 1; } else if (iv >= 0) { eixo = 'v'; linhaFinal = iv + 1; } else {
        out[k] = orfa(ESTADO.fora, 0, r.mid, 0);
        return;
      }
    } else {
      const ln = r.line;
      const gen = ln.axis === 'u' ? g.u.gerado : g.v.gerado;
      const rl = remapearLinha(ln, gen);
      if (rl.estado !== ESTADO.adotada) { out[k] = rl; return; }
      const eixoObj = ln.axis === 'u' ? g.u : g.v;
      const idx = eixoObj.origens.findIndex((o) => o.origem === 'gerada' && o.indiceGerado === rl.a);
      if (idx < 0) { out[k] = orfa(ESTADO.fora, 0, rl.px, 0); return; }
      eixo = ln.axis;
      linhaFinal = idx + 1;
    }
    const outro = eixo === 'u' ? g.v : g.u;
    const global = eixo === 'u' ? linhaFinal : g.nu + 1 + linhaFinal;
    const A = at(outro.bordas, outro.bordas.length - 1);
    let kNovo = -1;
    let regra: 1 | 2 = 2;
    if (r.nk === outro.n && r.k >= 0 && r.k < outro.n && Math.abs(centroNorm(outro.bordas, r.k) - r.mid) <= LIMIAR_TOPOLOGIA) {
      kNovo = r.k;
      regra = 1;
    } else {
      const q = celulaDoPonto(outro.bordas, r.mid * A);
      if (q !== null) kNovo = q;
    }
    if (kNovo < 0) {
      out[k] = orfa(ESTADO.fora, 0, r.mid * A, 0);
      return;
    }
    cands.push({ k, a: global, b: kNovo, regra, d: Math.abs(r.mid - centroNorm(outro.bordas, kNovo)), px: r.mid * A });
  });

  // Fusão: dois segmentos removidos no mesmo segmento alvo; vence o de menor distância (empate: o primeiro).
  const grupos = new Map<string, Cand[]>();
  for (const c of cands) {
    const id = `${c.a}:${c.b}`;
    const lista = grupos.get(id);
    if (lista) lista.push(c);
    else grupos.set(id, [c]);
  }
  for (const lista of grupos.values()) {
    let vence = lista[0] as Cand;
    for (const c of lista) if (c.d < vence.d) vence = c;
    for (const c of lista) {
      const outro = c.a <= g.nu ? g.v : g.u;
      out[c.k] = c === vence
        ? resultado(ESTADO.adotada, c.regra, c.a, c.b, centroNorm(outro.bordas, c.b), 0, c.px, 0)
        : orfa(ESTADO.fusao, c.regra, c.px, 0);
    }
  }
  return out;
}

/** Linha de grade referenciada por uma sobrescrita, para gravar de volta (normalização). */
export function refDaLinhaGerada(eixo: 'u' | 'v', indiceGerado: number, gen: EixoResolvido): LineRef {
  return { axis: eixo, index: indiceGerado, pos: at(gen.linhas, indiceGerado - 1) / gen.comprimento, n: gen.n };
}
