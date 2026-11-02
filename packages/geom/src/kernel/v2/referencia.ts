/**
 * Referência em TypeScript (força bruta) das três consultas da Fase 0 (decisão 0046 §5). É a verdade contra a
 * qual o harness compara o Rust e o que o `falso.ts` executa.
 *
 * Regras (as mesmas de `crates/geom-wasm/src/consultas.rs`):
 * - caixa da parede = caixa do segmento expandida por `espessura / 2` em cada lado;
 * - `paredes_na_caixa`: a caixa da parede cruza a caixa pedida (fronteira inclusiva);
 * - `pares_proximos`: a caixa de uma parede expandida por `tol` cruza a da outra (equivale a a distância por
 *   eixo entre as caixas, zero se se sobrepõem, ser <= tol nos dois eixos); fronteira inclusiva;
 * - resultados em ordem crescente de `id_num` / pares lexicográficos.
 */
import { NIVEL_TODOS } from './esquema.gerado.ts';

export interface LinhaParede {
  id: number;
  nivel: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  espessura: number;
}

export interface EstatisticasNivel {
  nParedes: number;
  caixa: [number, number, number, number];
  comprimentoTotal: number;
}

const doNivel = (paredes: readonly LinhaParede[], nivel: number): LinhaParede[] =>
  paredes.filter((p) => nivel === NIVEL_TODOS || p.nivel === nivel).sort((a, b) => a.id - b.id);

interface Caixa {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

function caixaDaParede(p: LinhaParede): Caixa {
  const m = p.espessura / 2;
  return {
    minx: Math.min(p.ax, p.bx) - m,
    miny: Math.min(p.ay, p.by) - m,
    maxx: Math.max(p.ax, p.bx) + m,
    maxy: Math.max(p.ay, p.by) + m,
  };
}

export function referenciaEstatisticasNivel(paredes: readonly LinhaParede[], nivel: number): EstatisticasNivel {
  const ps = doNivel(paredes, nivel);
  if (ps.length === 0) return { nParedes: 0, caixa: [0, 0, 0, 0], comprimentoTotal: 0 };
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  let comprimento = 0;
  for (const p of ps) {
    minx = Math.min(minx, p.ax, p.bx);
    miny = Math.min(miny, p.ay, p.by);
    maxx = Math.max(maxx, p.ax, p.bx);
    maxy = Math.max(maxy, p.ay, p.by);
    comprimento += Math.sqrt((p.bx - p.ax) ** 2 + (p.by - p.ay) ** 2);
  }
  return { nParedes: ps.length, caixa: [minx, miny, maxx, maxy], comprimentoTotal: comprimento };
}

export function referenciaParedesNaCaixa(
  paredes: readonly LinhaParede[],
  nivel: number,
  minx: number,
  miny: number,
  maxx: number,
  maxy: number,
): Uint32Array {
  const ids: number[] = [];
  for (const p of doNivel(paredes, nivel)) {
    const c = caixaDaParede(p);
    if (c.minx <= maxx && c.maxx >= minx && c.miny <= maxy && c.maxy >= miny) ids.push(p.id);
  }
  return Uint32Array.from(ids);
}

/** Pares `(a, b)` com `a < b`, achatados `[a0, b0, a1, b1, ...]`, em ordem lexicográfica. */
export function referenciaParesProximos(paredes: readonly LinhaParede[], nivel: number, tol: number): Uint32Array {
  const ps = doNivel(paredes, nivel);
  const caixas = ps.map(caixaDaParede);
  const pares: number[] = [];
  for (let i = 0; i < ps.length; i++) {
    const a = caixas[i]!;
    for (let j = i + 1; j < ps.length; j++) {
      const b = caixas[j]!;
      if (a.minx - tol <= b.maxx && a.maxx + tol >= b.minx && a.miny - tol <= b.maxy && a.maxy + tol >= b.miny) {
        pares.push(ps[i]!.id, ps[j]!.id);
      }
    }
  }
  return Uint32Array.from(pares);
}
