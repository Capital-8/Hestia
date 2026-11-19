import { intersectSegments } from '@hestia/geom';
import type { CurvaNivelTN } from '@hestia/engine';
import { FAMILY_FONT_PADRAO, cotaExibida, formatLengthByFamily, formatQuantity, terrainTextFamilyFor, unitsOf, type Project, type Terrain, type TerrainTextFamily } from '@hestia/model';
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
export function rotuloDeCota(p: Project, at: Pt, z: number, escala: number, fam?: TerrainTextFamily): LabelOp {
  const f = fam ?? terrainTextFamilyFor(p.settings, 'spot');
  return { at, text: textoDaFamilia(p, z, f), dx: 7, dy: -7, tone: 'soft', ...estiloDaFamilia(f), papel: { escala, fontMm: f.textMm } };
}

/** Cota exibida com prefixo, unidade e casas da família. */
export function textoDaFamilia(p: Project, z: number, f: TerrainTextFamily): string {
  return `${f.prefix}${formatLengthByFamily(p, cotaExibida(p, z), f)}`;
}

/** Cor, negrito, itálico e fonte da família no rótulo (só o que a família define). */
export function estiloDaFamilia(f: TerrainTextFamily): Pick<LabelOp, 'color' | 'bold' | 'italic' | 'fontFamily'> {
  return { ...(f.color ? { color: f.color } : {}), ...(f.bold ? { bold: true } : {}), ...(f.italic ? { italic: true } : {}), ...(f.font !== FAMILY_FONT_PADRAO ? { fontFamily: f.font } : {}) };
}

/**
 * Rótulos de curva: onde cada linha de rótulo do terreno (x1, y1, x2, y2) cruza uma curva mestra, o valor da cota, centrado no cruzamento e
 * alinhado à curva (o segmento cruzado). Recebe só as curvas mestras do terreno, já vindas do kernel.
 */
export function rotulosDeCurva(p: Project, t: Terrain, mestras: readonly CurvaNivelTN[], escala: number, ocupados?: OcupadoRotulo[]): LabelOp[] {
  const f = terrainTextFamilyFor(p.settings, 'contour', t.rotuloFamilyId);
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
        ocupados?.push(discoDoRotulo(textoDaFamilia(p, c.z, f), f.textMm, escala, x));
        out.push({ at: x, text: textoDaFamilia(p, c.z, f), center: true, rotation: anguloLegivel(q1.x - q0.x, q1.y - q0.y), tone: 'soft', ...estiloDaFamilia(f), papel: { escala, fontMm: f.textMm } });
      }
    }
  }
  return out;
}

/** Espaço mínimo entre dois rótulos automáticos da mesma curva (mm de papel). */
export const ROTULO_AUTO_ESPACO_MM = 90;
/** Tolerância de curvatura sob o texto (graus entre a tangente e a corda do texto): acima disso o rótulo não é posto ali. */
const CURVATURA_MAX_GRAUS = 22;
const ROTULO_AUTO_MAX = 2000;

/** Disco que um rótulo já colocado ocupa (coordenadas do modelo), para os automáticos o evitarem. */
export interface OcupadoRotulo {
  at: Pt;
  r: number;
}

/** Disco de um rótulo: a metade da largura estimada do texto (mais uma folga de meio corpo) em metros do modelo. */
export function discoDoRotulo(texto: string, fontMm: number, escala: number, at: Pt): OcupadoRotulo {
  const m = escala / 1000;
  return { at, r: ((texto.length * fontMm * 0.55) / 2 + fontMm * 0.5) * m };
}

/** Ponto e tangente a `s` metros do início da curva (ao longo do comprimento; curva fechada dá a volta). */
function pontoNaCurva(c: CurvaNivelTN, acum: readonly number[], total: number, s: number): Pt {
  const n = c.pontos.length;
  let d = c.fechada ? ((s % total) + total) % total : Math.min(Math.max(s, 0), total);
  let lo = 0;
  let hi = acum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (acum[mid]! < d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = c.pontos[(i - 1) % n]!;
  const b = c.pontos[i % n]!;
  const seg = acum[i]! - acum[i - 1]!;
  d = seg > 0 ? (d - acum[i - 1]!) / seg : 0;
  return { x: a.x + (b.x - a.x) * d, y: a.y + (b.y - a.y) * d };
}

/**
 * Rótulos automáticos de cota nas curvas mestras do terreno (tipo com `rotularCurvas`): em uma de cada `rotularCada` cotas mestras distintas, um ou mais
 * por curva, espaçados por `ROTULO_AUTO_ESPACO_MM` de papel (mais curvas longas, mais rótulos; curvas curtas demais para o texto não levam nenhum).
 * Cada rótulo fica sobre um trecho quase reto da própria curva, alinhado a ele, e não pode tocar outro (os `ocupados` incluem os das linhas de rótulo
 * manuais). A distância é em mm de papel, então a quantidade acompanha a escala da vista. Determinístico: mesma entrada, mesma saída.
 */
export function rotulosAutomaticosDeCurva(p: Project, t: Terrain, mestras: readonly CurvaNivelTN[], escala: number, cada: number, ocupados: OcupadoRotulo[]): LabelOp[] {
  const f = terrainTextFamilyFor(p.settings, 'contour', t.rotuloFamilyId);
  const m = escala / 1000;
  const cotas = [...new Set(mestras.map((c) => c.z))].sort((a, b) => a - b);
  const passo = Math.max(1, Math.round(cada));
  const escolhidas = new Set(cotas.filter((_, i) => i % passo === 0));
  const out: LabelOp[] = [];
  const grau = Math.PI / 180;
  const ordenadas = mestras.filter((c) => escolhidas.has(c.z) && c.pontos.length >= 2).sort((a, b) => a.z - b.z || b.pontos.length - a.pontos.length);
  for (const c of ordenadas) {
    const n = c.pontos.length;
    const acum = [0];
    const ate = c.fechada ? n : n - 1;
    for (let i = 0; i < ate; i++) {
      const a = c.pontos[i]!;
      const b = c.pontos[(i + 1) % n]!;
      acum.push(acum[acum.length - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = acum[acum.length - 1]!;
    const texto = textoDaFamilia(p, c.z, f);
    const larg = texto.length * f.textMm * 0.55 * m;
    if (total < larg * 3) continue;
    const disco = discoDoRotulo(texto, f.textMm, escala, { x: 0, y: 0 });
    const k = Math.max(1, Math.floor(total / (ROTULO_AUTO_ESPACO_MM * m)));
    for (let i = 0; i < k; i++) {
      const centro = (total * (i + 0.5)) / k;
      // Candidatos: o centro da fatia e deslocamentos dentro dela, quando ali a curva é muito curva ou já há rótulo.
      for (const desl of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45]) {
        const s = centro + (desl * total) / k;
        if (!c.fechada && (s < larg || s > total - larg)) continue;
        const q = pontoNaCurva(c, acum, total, s);
        const a = pontoNaCurva(c, acum, total, s - larg / 2);
        const b = pontoNaCurva(c, acum, total, s + larg / 2);
        const corda = Math.atan2(b.y - a.y, b.x - a.x);
        const t1 = pontoNaCurva(c, acum, total, s - larg / 4);
        const t2 = pontoNaCurva(c, acum, total, s + larg / 4);
        let dif = Math.abs(Math.atan2(t2.y - t1.y, t2.x - t1.x) - corda);
        if (dif > Math.PI) dif = 2 * Math.PI - dif;
        if (dif > CURVATURA_MAX_GRAUS * grau) continue;
        if (ocupados.some((o) => Math.hypot(o.at.x - q.x, o.at.y - q.y) < o.r + disco.r)) continue;
        ocupados.push({ at: q, r: disco.r });
        out.push({ at: q, text: texto, center: true, rotation: anguloLegivel(b.x - a.x, b.y - a.y), tone: 'soft', ...estiloDaFamilia(f), papel: { escala, fontMm: f.textMm } });
        break;
      }
      if (out.length >= ROTULO_AUTO_MAX) return out;
    }
  }
  return out;
}
