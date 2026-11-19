import { outline, outlineInset, type OPt, type OpeningShape } from '@hestia/model';
import type { OpeningPart, PartBox, PartRole } from './openingModelTypes.ts';

/*
 * Ajuste das peças que o recorte por polígono não alcança em vão com forma (docs/estudo-esquadrias/37). Nenhuma peça do modelo
 * retangular é apagada ou trocada por chapa lisa: o que tem perfil de seção própria (divisor e travessa em T, em L) ou é
 * ferragem (dobradiça, maçaneta) mantém a forma e só tem a CAIXA encurtada ou deslocada até caber no contorno.
 * - Barra com perfil `ts` (corre em z, ex.: montante): o topo desce (e, no círculo, a base sobe) até os cantos caberem na região.
 * - Barra com perfil `sz` (corre em t, ex.: travessa): cada ponta recua até os cantos caberem.
 * - Dobradiça e maçaneta: andam em z (e, se preciso, em t para o centro; a maçaneta inteira com o mesmo deslocamento) até caberem.
 */

const EPS = 1e-9;
/** Peças de preenchimento com perfil de seção (não prisma `tz`) que o recorte deixa como são. */
const BARRAS: ReadonlySet<PartRole> = new Set<PartRole>(['mullion', 'transom', 'muntin', 'bead', 'track']);
const FERRAGENS: ReadonlySet<PartRole> = new Set<PartRole>(['hinge', 'handle']);

/** Ponto dentro do anel (par-ímpar) ou a até `tol` da borda. */
export function noAnel(ring: readonly OPt[], x: number, z: number, tol = 1e-7): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  if (c) return true;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    if (Math.hypot(x - (ax + k * (bx - ax)), z - (az + k * (bz - az))) <= tol) return true;
  }
  return false;
}

const cantos = (b: PartBox): OPt[] => [[b.t0, b.z0], [b.t1, b.z0], [b.t1, b.z1], [b.t0, b.z1]];
const cabe = (ring: readonly OPt[], b: PartBox): boolean => cantos(b).every(([x, z]) => noAnel(ring, x, z));

/** Maior `x` em [`ok`, `ruim`] (ok cabe, ruim não) que ainda cabe, por bissecção. */
function limite(ok: number, ruim: number, cabeEm: (v: number) => boolean): number {
  let a = ok;
  let b = ruim;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (cabeEm(m)) a = m;
    else b = m;
  }
  return a;
}

/** Barra com perfil encurtada para caber em `ring`; a mesma peça quando já cabe ou não há como (sem eixo de encurtar). */
export function barraNoContorno(part: OpeningPart, ring: readonly OPt[]): OpeningPart {
  const b = part.box;
  if (cabe(ring, b)) return part;
  const plano = part.profile?.plane;
  if (plano === 'ts' || (plano === undefined && b.z1 - b.z0 >= b.t1 - b.t0)) {
    // cada ponta anda sozinha, a partir de uma cota do meio em que os dois lados da barra cabem (círculo: a base também sai)
    const naCota = (z: number): boolean => noAnel(ring, b.t0, z) && noAnel(ring, b.t1, z);
    const meio = Array.from({ length: 41 }, (_, i) => (b.z0 + b.z1) / 2 + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * (b.z1 - b.z0)) / 40).find((z) => z >= b.z0 && z <= b.z1 && naCota(z));
    if (meio === undefined) return part;
    const z0 = limite(meio, b.z0, naCota);
    const z1 = limite(meio, b.z1, naCota);
    return z1 - z0 > 1e-6 ? { ...part, box: { ...b, z0, z1 } } : part;
  }
  if (plano === 'sz' || plano === undefined) {
    const mid = (b.t0 + b.t1) / 2;
    if (!cabe(ring, { ...b, t0: mid - EPS * 10, t1: mid + EPS * 10 })) return part;
    // cada ponta anda sozinha: só os dois cantos dela contam
    const naPonta = (t: number): boolean => noAnel(ring, t, b.z0) && noAnel(ring, t, b.z1);
    const t0 = limite(mid, b.t0, naPonta);
    const t1 = limite(mid, b.t1, naPonta);
    return t1 - t0 > 1e-6 ? { ...part, box: { ...b, t0, t1 } } : part;
  }
  return part;
}

const PASSO = 0.005;

/**
 * Menor deslocamento (dt, dz) que leva TODAS as caixas do conjunto para dentro de `ring`: primeiro só em z (para cima ou para
 * baixo), depois com recuo em t para o centro (círculo: a dobradiça na ombreira não cabe em nenhuma cota). `null` = já cabe.
 */
function deslocamento(ring: readonly OPt[], caixas: readonly PartBox[]): { dt: number; dz: number } | null {
  const cabeTodas = (dt: number, dz: number): boolean => caixas.every((b) => cabe(ring, { ...b, t0: b.t0 + dt, t1: b.t1 + dt, z0: b.z0 + dz, z1: b.z1 + dz }));
  if (cabeTodas(0, 0)) return null;
  const lado = caixas.reduce((s, b) => s + (b.t0 + b.t1), 0) >= 0 ? -1 : 1; // para o centro
  const alcance = Math.max(...caixas.map((b) => Math.max(Math.abs(b.t0), Math.abs(b.t1))));
  let melhor: { dt: number; dz: number; custo: number } | undefined;
  for (let dt = 0; dt <= alcance + EPS && dt < (melhor?.custo ?? Infinity); dt += PASSO) {
    for (let k = 0; k * PASSO < Math.min(melhor?.custo ?? 2, 2); k++) {
      const achou = (k === 0 ? [0] : [-k * PASSO, k * PASSO]).find((dz) => cabeTodas(lado * dt, dz));
      if (achou === undefined) continue;
      const custo = Math.hypot(dt, achou);
      if (!melhor || custo < melhor.custo) melhor = { dt: lado * dt, dz: achou, custo };
      break;
    }
  }
  return melhor ? { dt: melhor.dt, dz: melhor.dz } : null;
}

/** Chave que junta as peças de uma mesma ferragem: a maçaneta (`handle-<folha>-...`) anda inteira; cada dobradiça sozinha. */
const grupoDaFerragem = (p: OpeningPart): string => (p.role === 'handle' ? p.id.split('-').slice(0, 2).join('-') : p.id);

/**
 * Peças com perfil de seção e ferragens acomodadas ao contorno da esquadria. `dRef` é a espessura do batente (as barras
 * param no recuo dele). Devolve o MESMO vetor quando nada muda.
 */
export function acomodaAoContorno(parts: readonly OpeningPart[], shape: OpeningShape, dRef: number): OpeningPart[] {
  const bruto = outline(shape);
  const util = outlineInset(shape, { side: 0, arc: Math.max(0, dRef), base: 0 });
  const regiaoBarra = util.length >= 3 ? util : bruto;
  const grupos = new Map<string, OpeningPart[]>();
  for (const p of parts) if (FERRAGENS.has(p.role) && !p.profile) grupos.set(grupoDaFerragem(p), [...(grupos.get(grupoDaFerragem(p)) ?? []), p]);
  const move = new Map<string, { dt: number; dz: number }>();
  for (const [g, ps] of grupos) {
    const d = deslocamento(bruto, ps.map((q) => q.box));
    if (d) move.set(g, d);
  }
  return parts.map((p) => {
    if (BARRAS.has(p.role) && p.profile && p.profile.plane !== 'tz' && !p.dashed && p.material !== 'concrete') return barraNoContorno(p, regiaoBarra);
    const d = FERRAGENS.has(p.role) && !p.profile ? move.get(grupoDaFerragem(p)) : undefined;
    return d ? { ...p, box: { ...p.box, t0: p.box.t0 + d.dt, t1: p.box.t1 + d.dt, z0: p.box.z0 + d.dz, z1: p.box.z1 + d.dz } } : p;
  });
}
