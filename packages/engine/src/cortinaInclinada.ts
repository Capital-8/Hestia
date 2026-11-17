// Parede cortina INCLINADA (frente massa-paredes-torcidas, fase 1b). O kernel resolve a cortina num plano vertical (grade, montantes, painéis, quantidades);
// a inclinação entra em volta dele, sem tocar no Rust: (1) o adaptador entrega ao kernel a altura INCLINADA H/cos(tilt), de modo que a grade e as peças
// são medidas ao longo da face inclinada; (2) a malha 3D que volta (matrizes das instâncias e vértices das peças avulsas) é girada rígida em torno da linha
// de base (a→b na cota da base) por `tilt` graus, positivo = topo à ESQUERDA de a→b (a mesma convenção de `Wall.tilt`). Só parede RETA (arco inclinado é um cone;
// `wallTiltIssue` recusa). NÃO cobertos: planta (continua a seção vertical na base), corte, junção de topo com vizinhas, esquadrias de célula e quantidades de
// vão: ver docs/massa/ESTADO.md.

import type { Id, Project } from '@hestia/model';
import { isWall, wallTiltOf } from '@hestia/model';
import type { MalhaCortinaProjeto } from './kernelCortinaServico.ts';

/** Cortina reta inclinada: a linha de base e o ângulo. */
export interface PlanoInclinado {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Cota absoluta da base (m). */
  zBase: number;
  /** Graus, + = topo à esquerda de a→b. */
  tilt: number;
}

/** `H / cos(tilt)`: a altura medida ao longo da face inclinada. Sem inclinação devolve `h`. */
export const alturaInclinada = (h: number, tiltGraus: number): number => (tiltGraus === 0 ? h : h / Math.cos((tiltGraus * Math.PI) / 180));

/** Inclinação efetiva de uma parede cortina RETA (0 para arco ou sem tilt). */
export function inclinacaoDaCortina(w: { tilt?: number; sag: number }): number {
  return w.sag === 0 ? wallTiltOf(w) : 0;
}

/** Os planos inclinados das cortinas do projeto (só as que têm tilt e linha reta), por id da parede. `zBase` vem das cortinas da entrada do kernel. */
export function planosInclinados(p: Project, zBasePorId: ReadonlyMap<Id, number>): Map<Id, PlanoInclinado> {
  const out = new Map<Id, PlanoInclinado>();
  for (const [id, zBase] of zBasePorId) {
    const w = p.elements[id];
    if (!isWall(w)) continue;
    const tilt = inclinacaoDaCortina(w);
    if (tilt !== 0) out.set(id, { a: w.a, b: w.b, zBase, tilt });
  }
  return out;
}

/** Transformação afín (3×3 linha-maior + translação) da rotação em torno da linha de base. */
function rotacao(pl: PlanoInclinado): { L: number[]; t: number[] } {
  const dx = pl.b.x - pl.a.x;
  const dy = pl.b.y - pl.a.y;
  const c = Math.hypot(dx, dy) || 1;
  const u = [dx / c, dy / c, 0];
  const n = [-dy / c, dx / c, 0];
  const th = (pl.tilt * Math.PI) / 180;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  const A = [pl.a.x, pl.a.y, pl.zBase];
  // r = P − A: componentes (ru, rn, rz); o vetor `cima` vira cosθ·cima + senθ·n e a normal vira cosθ·n − senθ·cima.
  const aplica = (P: number[]): number[] => {
    const r = [P[0]! - A[0]!, P[1]! - A[1]!, P[2]! - A[2]!];
    const ru = r[0]! * u[0]! + r[1]! * u[1]!;
    const rn = r[0]! * n[0]! + r[1]! * n[1]!;
    const rz = r[2]!;
    const rn2 = rn * cs + rz * sn;
    const rz2 = -rn * sn + rz * cs;
    return [A[0]! + u[0]! * ru + n[0]! * rn2, A[1]! + u[1]! * ru + n[1]! * rn2, A[2]! + rz2];
  };
  const t = aplica([0, 0, 0]);
  const col = [aplica([1, 0, 0]), aplica([0, 1, 0]), aplica([0, 0, 1])].map((v) => [v[0]! - t[0]!, v[1]! - t[1]!, v[2]! - t[2]!]);
  // L[i][k] = col[k][i]
  const L = [col[0]![0]!, col[1]![0]!, col[2]![0]!, col[0]![1]!, col[1]![1]!, col[2]![1]!, col[0]![2]!, col[1]![2]!, col[2]![2]!];
  return { L, t };
}

/** Gira um ponto do mundo em torno da linha de base do plano. */
export function girarPonto(pl: PlanoInclinado, P: readonly [number, number, number]): [number, number, number] {
  const { L, t } = rotacao(pl);
  return [L[0]! * P[0] + L[1]! * P[1] + L[2]! * P[2] + t[0]!, L[3]! * P[0] + L[4]! * P[1] + L[5]! * P[2] + t[1]!, L[6]! * P[0] + L[7]! * P[1] + L[8]! * P[2] + t[2]!];
}

/** A malha com as cortinas inclinadas giradas (instâncias e peças avulsas); as demais seguem iguais. Sem plano, devolve a própria malha. */
export function aplicarInclinacaoNaMalha(m: MalhaCortinaProjeto, planos: ReadonlyMap<Id, PlanoInclinado>): MalhaCortinaProjeto {
  if (planos.size === 0) return m;
  const instancias = m.instancias.map((g) => {
    const pl = planos.get(g.wallId);
    if (!pl) return g;
    const { L, t } = rotacao(pl);
    const out = new Float32Array(g.matrizes.length);
    for (let k = 0; k < g.n; k++) {
      const o = 12 * k;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          let v = L[3 * i]! * g.matrizes[o + j]! + L[3 * i + 1]! * g.matrizes[o + 4 + j]! + L[3 * i + 2]! * g.matrizes[o + 8 + j]!;
          if (j === 3) v += t[i]!;
          out[o + 4 * i + j] = v;
        }
      }
    }
    return { ...g, matrizes: out };
  });
  const grupos = m.grupos.map((g) => {
    const pl = planos.get(g.wallId);
    if (!pl) return g;
    const { L, t } = rotacao(pl);
    const v = new Float32Array(g.vertices.length);
    for (let i = 0; i + 2 < g.vertices.length; i += 3) {
      const x = g.vertices[i]!;
      const y = g.vertices[i + 1]!;
      const z = g.vertices[i + 2]!;
      v[i] = L[0]! * x + L[1]! * y + L[2]! * z + t[0]!;
      v[i + 1] = L[3]! * x + L[4]! * y + L[5]! * z + t[1]!;
      v[i + 2] = L[6]! * x + L[7]! * y + L[8]! * z + t[2]!;
    }
    return { ...g, vertices: v };
  });
  return { ...m, instancias, grupos };
}
