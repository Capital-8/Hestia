import { intersectSegments } from '@hestia/geom';
import type { CurvaNivelTN } from '@hestia/engine';
import { cotaExibida, formatQuantity, unitsOf, type Project, type Terrain } from '@hestia/model';
import type { LabelOp } from './types.ts';

/** Corpo do texto dos rótulos de cota, em mm de papel. */
export const COTA_TEXTO_MM = 1.8;

type Pt = { x: number; y: number };

/** Ângulo do texto (graus), sempre legível: de −90 (exclusive) a 90. */
export function anguloLegivel(dx: number, dy: number): number {
  let r = (Math.atan2(dy, dx) * 180) / Math.PI;
  while (r > 90) r -= 180;
  while (r <= -90) r += 180;
  return r;
}

/** Texto da cota exibida (z do projeto + cota zero da localização) pela unidade do projeto. */
export function textoDaCota(p: Project, z: number): string {
  return formatQuantity(unitsOf(p), 'length', cotaExibida(p, z));
}

/** Rótulo do ponto cotado: o valor ao lado da cruz. */
export function rotuloDeCota(p: Project, at: Pt, z: number, escala: number): LabelOp {
  return { at, text: textoDaCota(p, z), dx: 7, dy: -7, tone: 'soft', papel: { escala, fontMm: COTA_TEXTO_MM } };
}

/**
 * Rótulos de curva: onde cada linha de rótulo do terreno (x1, y1, x2, y2) cruza uma curva mestra, o valor da cota, centrado no cruzamento e
 * alinhado à curva (o segmento cruzado). Recebe só as curvas mestras do terreno, já vindas do kernel.
 */
export function rotulosDeCurva(p: Project, t: Terrain, mestras: readonly CurvaNivelTN[], escala: number): LabelOp[] {
  const out: LabelOp[] = [];
  for (let k = 0; k + 3 < t.linhasRotulo.length; k += 4) {
    const a = { x: t.linhasRotulo[k]!, y: t.linhasRotulo[k + 1]! };
    const b = { x: t.linhasRotulo[k + 2]!, y: t.linhasRotulo[k + 3]! };
    for (const c of mestras) {
      const n = c.pontos.length;
      const ate = c.fechada ? n : n - 1;
      // Cruzamento exatamente num vértice da curva acerta os dois segmentos vizinhos: um rótulo só (E2E Q1b: apareciam dois, um sobre o outro).
      const vistos: Pt[] = [];
      for (let i = 0; i < ate; i++) {
        const q0 = c.pontos[i]!;
        const q1 = c.pontos[(i + 1) % n]!;
        const x = intersectSegments(a, b, q0, q1);
        if (!x) continue;
        if (vistos.some((v) => Math.hypot(v.x - x.x, v.y - x.y) < 1e-6)) continue;
        vistos.push(x);
        out.push({ at: x, text: textoDaCota(p, c.z), center: true, rotation: anguloLegivel(q1.x - q0.x, q1.y - q0.y), tone: 'soft', papel: { escala, fontMm: COTA_TEXTO_MM } });
      }
    }
  }
  return out;
}
