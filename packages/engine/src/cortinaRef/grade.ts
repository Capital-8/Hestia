/**
 * Referência TS da grade da parede cortina (decisão 0056, §5.1 e §5.2): linhas de cada eixo nos quatro modos, fusão da
 * sobra minúscula, `offset`, e as células. Ângulo só 0 (ENTRADA para outro valor). Usada SÓ pela paridade com o Rust.
 */
import {
  CURTAIN_MIN_REMAINDER, EPS_CMP, TOL_SOLDA, erroEntrada,
  at, type CortinaEntrada, type GridAxisSpec,
} from './tipos.ts';

/** Aviso de eixo (informativo). `pos` é a posição (m) a partir do início/base. */
export interface AvisoEixo {
  codigo: 'sobra-fundida' | 'posicao-fora';
  /** sobra-fundida: largura da célula resultante; posicao-fora: a posição ignorada (m, já com o offset). */
  medido: number;
  /** sobra-fundida: 1,5 × lado nominal; posicao-fora: o comprimento do eixo. */
  limite: number;
  pos: number;
  /** sobra-fundida: índice da célula fundida no eixo (0 = primeira); posicao-fora: ordem da posição manual. */
  indice: number;
}

export interface EixoResolvido {
  /** Comprimento do eixo (L em U, H em V). */
  comprimento: number;
  /** Linhas internas, crescentes, em (0, comprimento). O índice de linha da grade é a posição nesta lista + 1. */
  linhas: number[];
  /** Bordas e linhas: [0, ...linhas, comprimento]. */
  bordas: number[];
  /** Número de células do eixo. */
  n: number;
  avisos: AvisoEixo[];
}

/** Eixo efetivo = `{ ...tipo, ...instância }` campo a campo; campo `undefined` da instância herda do tipo. */
export function eixoEfetivo(tipo: GridAxisSpec, inst?: Partial<GridAxisSpec>): GridAxisSpec {
  const out: Record<string, unknown> = { ...tipo };
  if (inst) for (const [k, v] of Object.entries(inst)) if (v !== undefined) out[k] = v;
  return out as unknown as GridAxisSpec;
}

function dentro(p: number, A: number): boolean {
  return p > TOL_SOLDA && p < A - TOL_SOLDA;
}

/** Linhas internas de um eixo de comprimento `A`. Ver §5.1. Lança `ENTRADA: ...` para entrada inconsistente. */
export function linhasDoEixo(A: number, spec: GridAxisSpec): EixoResolvido {
  if (!(A > 0) || !Number.isFinite(A)) throw erroEntrada(`comprimento do eixo inválido (${A})`);
  if ((spec.angle ?? 0) !== 0) throw erroEntrada('angulo diferente de 0 não é suportado antes da fase 7');
  const o = spec.offset ?? 0;
  if (!Number.isFinite(o)) throw erroEntrada('offset inválido');
  const r = spec.minRemainder ?? CURTAIN_MIN_REMAINDER;
  if (!(r >= 0) || !Number.isFinite(r)) throw erroEntrada('minRemainder inválido');

  const avisos: AvisoEixo[] = [];
  let bruto: number[] = [];
  /** Lado nominal da célula (para o aviso de sobra fundida); 0 = sem nominal (manual). */
  let nominal = 0;
  /** Funde as pontas? fixedDistance sempre; fixedNumber/maxDistance só com offset diferente de 0; manual nunca. */
  let fundir = o !== 0 && spec.mode !== 'manual'; // manual: as linhas são do usuário, nunca se funde sobra

  switch (spec.mode) {
    case 'fixedNumber':
    case 'maxDistance': {
      let n: number;
      if (spec.mode === 'fixedNumber') {
        const c = spec.count;
        if (c === undefined || !Number.isInteger(c) || c < 1) throw erroEntrada('fixedNumber exige count inteiro >= 1');
        n = c;
        nominal = A / n;
      } else {
        const d = spec.distance;
        if (d === undefined || !(d > 0) || !Number.isFinite(d)) throw erroEntrada('maxDistance exige distance > 0');
        n = Math.max(1, Math.ceil(A / d - EPS_CMP));
        nominal = d;
      }
      // Padrão de n células iguais; com offset ele se desloca inteiro (as linhas k = 0 e k = n entram ou saem).
      for (let k = 0; k <= n; k++) bruto.push((A * k) / n + o);
      break;
    }
    case 'fixedDistance': {
      const d = spec.distance;
      if (d === undefined || !(d > 0) || !Number.isFinite(d)) throw erroEntrada('fixedDistance exige distance > 0');
      nominal = d;
      fundir = true;
      const m = Math.floor(A / d + EPS_CMP);
      if (m === 0) break; // eixo menor que d: uma célula só, o offset não tem célula cheia para deslocar
      const R = Math.max(0, A - m * d);
      const justify = spec.justify ?? 'start';
      const p0 = justify === 'start' ? 0 : justify === 'end' ? R : R / 2;
      // Padrão periódico p0 + k·d, deslocado de o; guarda os que caem em (0, A).
      const kmin = Math.floor((0 - p0 - o) / d) - 1;
      const kmax = Math.ceil((A - p0 - o) / d) + 1;
      for (let k = kmin; k <= kmax; k++) bruto.push(p0 + k * d + o);
      break;
    }
    case 'manual': {
      const pos = spec.positions;
      if (!pos) throw erroEntrada('manual exige positions');
      const ancora = spec.anchor ?? 'start';
      pos.forEach((p, ordem) => {
        if (!Number.isFinite(p)) throw erroEntrada('posição manual inválida');
        const q = (ancora === 'start' ? p : A - p) + o;
        if (!dentro(q, A)) avisos.push({ codigo: 'posicao-fora', medido: q, limite: A, pos: q, indice: ordem });
        else bruto.push(q);
      });
      break;
    }
    default:
      throw erroEntrada(`modo de grade desconhecido (${String((spec as { mode: unknown }).mode)})`);
  }

  // Filtra o que caiu no vão, ordena e solda (a primeira das duas linhas próximas vale).
  bruto = bruto.filter((p) => dentro(p, A)).sort((a, b) => a - b);
  const linhas: number[] = [];
  for (const p of bruto) if (linhas.length === 0 || p - at(linhas, linhas.length - 1) >= TOL_SOLDA) linhas.push(p);

  if (fundir && linhas.length > 0) {
    const avisar = (pos: number, largura: number, indice: number): void => {
      if (nominal > 0 && largura > 1.5 * nominal + EPS_CMP) avisos.push({ codigo: 'sobra-fundida', medido: largura, limite: 1.5 * nominal, pos, indice });
    };
    if (at(linhas, 0) < r - EPS_CMP) {
      const sumiu = linhas.shift() as number;
      avisar(sumiu, linhas[0] ?? A, 0);
    }
    if (linhas.length > 0 && A - at(linhas, linhas.length - 1) < r - EPS_CMP) {
      const sumiu = linhas.pop() as number;
      avisar(sumiu, A - (linhas[linhas.length - 1] ?? 0), linhas.length);
    }
  }

  return { comprimento: A, linhas, bordas: [0, ...linhas, A], n: linhas.length + 1, avisos };
}

export interface Celula {
  /** Coluna (U), 0 = a primeira a partir do início. */
  i: number;
  /** Fileira (V), 0 = a de baixo. */
  j: number;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

export interface GradeResolvida {
  L: number;
  H: number;
  u: EixoResolvido;
  v: EixoResolvido;
  nu: number;
  nv: number;
  /** Ordem de saída: coluna i primeiro, depois fileira j (i-major). */
  celulas: Celula[];
  eixoU: GridAxisSpec;
  eixoV: GridAxisSpec;
}

export function resolverGrade(e: CortinaEntrada): GradeResolvida {
  const eixoU = eixoEfetivo(e.tipo.u, e.instancia?.grid?.u);
  const eixoV = eixoEfetivo(e.tipo.v, e.instancia?.grid?.v);
  const u = linhasDoEixo(e.L, eixoU);
  const v = linhasDoEixo(e.H, eixoV);
  const celulas: Celula[] = [];
  for (let i = 0; i < u.n; i++) {
    for (let j = 0; j < v.n; j++) celulas.push({ i, j, s0: at(u.bordas, i), s1: at(u.bordas, i + 1), z0: at(v.bordas, j), z1: at(v.bordas, j + 1) });
  }
  return { L: e.L, H: e.H, u, v, nu: u.n, nv: v.n, celulas, eixoU, eixoV };
}
