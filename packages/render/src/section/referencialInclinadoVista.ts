import type { OpeningPlane } from '@hestia/model';

/**
 * Referencial da esquadria numa parede inclinada, para o desenho nas vistas de corte e elevação (P1, decisão E11); é o mesmo
 * do 3D (`model3d/referencialInclinado3d.ts`). Coordenadas do modelo: u = t (largura) ou s (espessura, normal à esquerda),
 * z a partir do peitoril, `s` a profundidade da peça.
 *  - 'inclinado': todo o conjunto no plano da face: y = peitoril·tanθ + s·cosθ + z·senθ e z' = z·cosθ − s·senθ (ocupação
 *    vertical h·cosθ, deslocamento (peitoril + h·cosθ/2)·tanθ no centro do vão);
 *  - 'vertical': a prumo (z' = z), ancorado na face: y = peitoril·tanθ + sgn·(t/(2cosθ) − ponta) + s, com `ponta` a ponta da
 *    peça rumo à face de ancoragem (recuo ≥ 0).
 */
export interface TiltFrameView {
  plane: OpeningPlane;
  /** Inclinação em radianos, com sinal (+ = topo para +n do vão). */
  theta: number;
  sill: number;
  thickness: number;
}

export interface VistaInclinada {
  /** Corte transversal: (s, z) do modelo -> (deslocamento em n, altura) na tela, relativos ao centro do vão em z = peitoril. */
  transversal: (s: number, z: number) => { u: number; z: number };
  /** Elevação: a largura não muda; a altura depende da profundidade `s` da peça. */
  elevacao: (u: number, z: number, s: number) => { u: number; z: number };
}

/** `pontaS`: maior sgn·s da peça rumo à face de ancoragem (modo vertical); vem da projeção do corte transversal. */
export function vistaInclinada(f: TiltFrameView | undefined, pontaS: number): VistaInclinada {
  if (!f || f.theta === 0) return { transversal: (s, z) => ({ u: s, z }), elevacao: (u, z) => ({ u, z }) };
  const sn = Math.sin(f.theta), cs = Math.cos(f.theta), tn = Math.tan(f.theta);
  const base = f.sill * tn;
  if (f.plane === 'inclinado') {
    return {
      transversal: (s, z) => ({ u: base + s * cs + z * sn, z: z * cs - s * sn }),
      elevacao: (u, z, s) => ({ u, z: z * cs - s * sn }),
    };
  }
  const sgn = f.theta >= 0 ? 1 : -1;
  const off = base + sgn * (f.thickness / (2 * cs) - pontaS);
  return { transversal: (s, z) => ({ u: off + s, z }), elevacao: (u, z) => ({ u, z }) };
}

/** Ponta (maior sgn·s) a partir dos vértices s do corte transversal da esquadria. */
export function pontaDaPeca(ss: Iterable<number>, theta: number): number {
  const sgn = theta >= 0 ? 1 : -1;
  let ponta = 0;
  for (const s of ss) ponta = Math.max(ponta, sgn * s);
  return ponta;
}
