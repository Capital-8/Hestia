// Comparação da sub-etapa A3d (decisão 0047 §11): `resolver_nivel` x `resolveLevel`. Reaproveita `compararA3c` (regiões e silhuetas sob a 0049).
import { intersection, orientedRect, union, type MultiPolygon } from '@hestia/geom';
import type { ProfilePoint } from '@hestia/model';
import type { FaixaA3c } from './kernelA3.ts';
import type { FaixaA3d, InclinacaoA3d, ResolvidoA3d } from './kernelA3d.ts';
import { areaDaForma } from './kernelComparaA2.ts';
import { TOLERANCIA_AREA_A3, TOLERANCIA_COORDENADA_A3 } from './kernelComparaA3.ts';
import { compararA3c, type ComparacaoA3c, faixasIguais, regiaoIgual, type ComparadorDeFaixas, type ExcecaoNomeada, type RegiaoCmp, type TipoDeFormaA3c } from './kernelComparaA3c.ts';

// ---------------------------------------------------------------------------------------------------------------
// A3d: `resolver_nivel` (`ResolvedLevel` completo) x `resolveLevel`. Por parede: campos escalares (1e-6), perfis copiados (exatos),
// membranas (camada e material exatos, pontos a 1 µm). Camadas, regiões e silhuetas: `compararA3c` (regiões e silhuetas sob a 0049), com
// as faixas verticais já recortadas pelos perfis: estritas (mesmas alturas, mesma inclinação, mesma região 0048) ou, se a fusão de faixas
// decidiu diferente, por alturas elementares (com a inclinação avaliada na altura amostrada).

const igual1um = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCIA_COORDENADA_A3;
const pontoIgual = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => igual1um(a.x, b.x) && igual1um(a.y, b.y);
const mesmoPerfil = (a: ProfilePoint[] | undefined, b: ProfilePoint[] | undefined): boolean => (a === undefined || b === undefined ? a === b : a.length === b.length && a.every((q, i) => q.t === b[i]!.t && q.h === b[i]!.h));

const mesmaInclinacao = (a: InclinacaoA3d | undefined, b: InclinacaoA3d | undefined): boolean =>
  a === undefined || b === undefined ? a === b : pontoIgual(a.o, b.o) && pontoIgual(a.d, b.d) && igual1um(a.t0, b.t0) && igual1um(a.t1, b.t1) && igual1um(a.h0, b.h0) && igual1um(a.h1, b.h1);

/** Região em planta ocupada pela lista de faixas na altura `z` (faixa inclinada: só onde o topo ainda passa de `z`). */
function regiaoNaAltura(lista: FaixaA3d[], z: number): MultiPolygon {
  const partes: MultiPolygon[] = [];
  for (const f of lista) {
    if (z < f.z0 || z > f.z1) continue;
    const s = f.slope;
    if (!s || s.h1 === s.h0) {
      if (!s || z <= Math.min(s.h0, s.h1)) partes.push(f.poly);
      continue;
    }
    // top(p) = h0 + (h1 - h0) * (d.(p - o) - t0) / (t1 - t0) >= z  <=>  d.(p - o) >= (ou <=) sCorte
    const sCorte = s.t0 + ((z - s.h0) / (s.h1 - s.h0)) * (s.t1 - s.t0);
    const cresce = (s.h1 - s.h0) / (s.t1 - s.t0) > 0;
    const longe = 200;
    const centro = sCorte + (cresce ? longe : -longe);
    const lado = orientedRect(s.o.x + s.d.x * centro, s.o.y + s.d.y * centro, s.d.x, s.d.y, longe, longe);
    const dentro = f.poly.length ? intersection(f.poly, [[lado]]) : [];
    if (dentro.length) partes.push(dentro);
  }
  return partes.length ? union(...partes) : [];
}

/**
 * Faixas de uma camada com perfis: estrita (mesmo número, mesmas alturas e inclinações, mesma região) e, se não casar, por alturas
 * elementares (3 amostras por intervalo, com os h0/h1 das inclinações entre os pontos de corte). Sem inclinação nenhuma é o comparador da A3c.
 */
export function faixasIguaisA3d(ref: FaixaA3c[], rust: FaixaA3c[], nota: (tipo: TipoDeFormaA3c, c: RegiaoCmp) => void): { erro: string | null; refinamento: boolean } {
  if (!ref.some((f) => (f as FaixaA3d).slope) && !rust.some((f) => (f as FaixaA3d).slope)) return faixasIguais(ref, rust, nota);
  // Fiapos: faixa de área <= 1e-6 m² (o recorte pelo perfil deixa lascas de ~0 m² num lado e não no outro, como o pintor). // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  const a = (ref as FaixaA3d[]).filter((f) => areaDaForma(f.poly) > TOLERANCIA_AREA_A3);
  const b = (rust as FaixaA3d[]).filter((f) => areaDaForma(f.poly) > TOLERANCIA_AREA_A3);
  const EPS = 1e-6;
  const estrita = a.length === b.length && a.every((f, i) => Math.abs(f.z0 - b[i]!.z0) <= EPS && Math.abs(f.z1 - b[i]!.z1) <= EPS && mesmaInclinacao(f.slope, b[i]!.slope));
  if (estrita) {
    for (let i = 0; i < a.length; i++) {
      const c = regiaoIgual(a[i]!.poly, b[i]!.poly);
      nota('faixa', c);
      if (c.erro) return { erro: `faixa ${i} [${a[i]!.z0}, ${a[i]!.z1}]${a[i]!.slope ? ' inclinada' : ''}: ${c.erro}`, refinamento: false };
    }
    return { erro: null, refinamento: false };
  }
  const zs = [...new Set([...a, ...b].flatMap((f) => [f.z0, f.z1, ...(f.slope ? [f.slope.h0, f.slope.h1] : [])]))].sort((x, y) => x - y);
  const pontos: number[] = [];
  for (const z of zs) if (pontos.length === 0 || z - pontos[pontos.length - 1]! > EPS) pontos.push(z);
  for (let i = 0; i + 1 < pontos.length; i++) {
    for (const k of [0.25, 0.5, 0.75]) {
      const z = pontos[i]! + k * (pontos[i + 1]! - pontos[i]!);
      const c = regiaoIgual(regiaoNaAltura(a, z), regiaoNaAltura(b, z));
      nota('faixa', c);
      if (c.erro) return { erro: `faixas com perfil por alturas elementares: altura ${z} (${a.length} faixas TS, ${b.length} Rust): ${c.erro}`, refinamento: true };
    }
  }
  return { erro: null, refinamento: true };
}

/**
 * Exceção NOMEADA da 0049 para as faixas de uma camada (defeito do TS no recorte pelo perfil: o `polygon-clipping` devolve fatias que somam mais que
 * o polígono). `preRecorte` são as faixas da camada ANTES dos perfis (as de `cluster_resolvido`). A exceção só vale se (1) o Rust não ganha área: para
 * cada altura de base de faixa (z0), a soma das áreas das faixas do Rust fica dentro de 1e-6 m² da soma das faixas de entrada (as fatias que o perfil // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
 * descarta só diminuem a soma) e (2) o TS de fato ganha área em algum z0 (senão a exceção está obsoleta e reprova).
 */
export interface ExcecaoDeFaixa {
  parede: number;
  /** `layerIndex` da camada (camada do tipo, não faixa do tipo). */
  indice: number;
  preRecorte: FaixaA3c[];
  motivo: string;
}

const somaPorZ0 = (faixas: FaixaA3c[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const f of faixas) m.set(f.z0.toFixed(6), (m.get(f.z0.toFixed(6)) ?? 0) + areaDaForma(f.poly)); // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  return m;
};

/** Verificação automática de `ExcecaoDeFaixa`; `null` = a exceção vale. */
export function verificaExcecaoDeFaixa(ex: ExcecaoDeFaixa, ts: FaixaA3c[], rust: FaixaA3c[]): string | null {
  const entrada = somaPorZ0(ex.preRecorte);
  const doRust = somaPorZ0(rust);
  const doTs = somaPorZ0(ts);
  // Evidência do defeito: fatiando cada faixa de entrada nos mesmos cortes de t que o Rust usou (t0/t1 das inclinações), as fatias EXATAS somam a
  // área da faixa; as do `polygon-clipping` do TS somam MAIS que ela (a exceção vale só se isso ocorre).
  const incl = (rust as FaixaA3d[]).flatMap((f) => (f.slope ? [f.slope] : []));
  let tsGanha = false;
  if (incl.length) {
    const { o, d } = incl[0]!;
    const todos = [...new Set(incl.flatMap((s) => [s.t0, s.t1]))].sort((x, y) => x - y);
    // partições: todos os cortes, e a de cada inclinação sozinha (como o TS fatia: um trecho por vez entre os lados)
    const particoes = [todos, ...incl.map((s) => [s.t0, s.t1])];
    for (const f of ex.preRecorte) {
      for (const cortes of particoes) {
        const limites = [Math.min(...todos) - 1, ...cortes, Math.max(...todos) + 1];
        let soma = 0;
        for (let i = 0; i + 1 < limites.length; i++) {
          const ta = limites[i]!;
          const tb = limites[i + 1]!;
          const meio = (ta + tb) / 2;
          soma += areaDaForma(intersection(f.poly, [[orientedRect(o.x + d.x * meio, o.y + d.y * meio, d.x, d.y, (tb - ta) / 2, 50)]]));
        }
        if (soma > areaDaForma(f.poly) + TOLERANCIA_AREA_A3) tsGanha = true;
      }
    }
  }
  for (const [z0, area] of doRust) {
    const ref = entrada.get(z0);
    if (ref === undefined) return `faixas do Rust com z0 ${z0} que não existe na entrada`;
    if (area > ref + TOLERANCIA_AREA_A3) return `o Rust ganha área em z0 ${z0}: ${area} > ${ref} da entrada`;
  }
  void doTs;
  return tsGanha ? null : 'as fatias do TS não somam mais que a faixa de entrada: a exceção nomeada está obsoleta';
}

export interface ComparacaoA3d extends ComparacaoA3c {
  /** Camadas aceitas por exceção nomeada de faixa. */
  excecoesDeFaixa: number;
  paredes: number;
  paredesComPerfilTopo: number;
  paredesComPerfilBase: number;
  /** Paredes com `topProfile` do modelo (aplicado sem ser copiado). */
  paredesComPerfilDoModelo: number;
  paredesComMembranas: number;
  membranas: number;
  /** Faixas com `slope` (topo inclinado) na referência. */
  faixasInclinadas: number;
  /** Maior desvio de coordenada nos campos escalares, perfis e membranas. */
  desvioMaximo: number;
}

/** Compara `resolver_nivel` (`rust`) com `resolveLevel` (`ref`). `perfisDoModelo`: id_num das paredes com `topProfile` no modelo. */
export function compararA3d(
  ref: ResolvidoA3d,
  rust: ResolvidoA3d,
  paredesCurvas: ReadonlySet<number> = new Set(),
  perfisDoModelo: ReadonlySet<number> = new Set(),
  maxDivergencias = 20,
  excecoes: readonly ExcecaoNomeada[] = [],
  excecoesDeFaixa: readonly ExcecaoDeFaixa[] = [],
): ComparacaoA3d {
  let usadasFaixa = 0;
  const comparador: ComparadorDeFaixas = (fr, fu, nota, camada) => {
    const ex = camada && !camada.faixa ? excecoesDeFaixa.find((e) => e.parede === camada.parede && e.indice === camada.indice) : undefined;
    if (!ex) return faixasIguaisA3d(fr, fu, nota);
    const comum = faixasIguaisA3d(fr, fu, () => undefined);
    if (!comum.erro) return comum;
    const falha = verificaExcecaoDeFaixa(ex, fr, fu);
    if (falha) return { erro: `exceção nomeada de faixa (${ex.motivo}): ${falha}`, refinamento: false };
    usadasFaixa++;
    return { erro: null, refinamento: false };
  };
  const base = compararA3c(ref, rust, paredesCurvas, maxDivergencias, excecoes, comparador);
  const r: ComparacaoA3d = { ...base, paredes: 0, paredesComPerfilTopo: 0, paredesComPerfilBase: 0, paredesComPerfilDoModelo: 0, paredesComMembranas: 0, membranas: 0, faixasInclinadas: 0, desvioMaximo: 0, excecoesDeFaixa: 0 };
  const divergencias = r.divergencias;
  if (ref.paredes.length !== rust.paredes.length) {
    divergencias.push(`${rust.paredes.length} paredes (Rust) x ${ref.paredes.length} (TS)`);
    return r;
  }
  const nota = (d: number): void => {
    r.desvioMaximo = Math.max(r.desvioMaximo, d);
  };
  for (let i = 0; i < ref.paredes.length && divergencias.length < maxDivergencias; i++) {
    const a = ref.paredes[i]!;
    const b = rust.paredes[i]!;
    const rotulo = `parede ${i} (id ${a.id}, grupo ${a.grupo})`;
    if (a.id !== b.id || a.grupo !== b.grupo) {
      divergencias.push(`${rotulo}: id/grupo ${b.id}/${b.grupo} (Rust) x ${a.id}/${a.grupo} (TS)`);
      continue;
    }
    let erro: string | null = null;
    for (const c of ['a', 'b', 'u', 'n'] as const) {
      if (!pontoIgual(a[c], b[c])) erro ??= `${c} (${b[c].x}, ${b[c].y}) (Rust) x (${a[c].x}, ${a[c].y}) (TS)`;
      else nota(Math.max(Math.abs(a[c].x - b[c].x), Math.abs(a[c].y - b[c].y)));
    }
    for (const c of ['length', 'sHi', 'sLo', 'baseZ', 'height', 'nominalZ0', 'nominalZ1'] as const) {
      if (a[c] === undefined || b[c] === undefined ? a[c] !== b[c] : !igual1um(a[c], b[c])) erro ??= `${c} ${String(b[c])} (Rust) x ${String(a[c])} (TS)`;
      else if (a[c] !== undefined && b[c] !== undefined) nota(Math.abs(a[c] - b[c]));
    }
    if (!mesmoPerfil(a.profileTop, b.profileTop)) erro ??= `profileTop ${JSON.stringify(b.profileTop)} (Rust) x ${JSON.stringify(a.profileTop)} (TS)`;
    if (!mesmoPerfil(a.profileBottom, b.profileBottom)) erro ??= `profileBottom ${JSON.stringify(b.profileBottom)} (Rust) x ${JSON.stringify(a.profileBottom)} (TS)`;
    if (a.membranas.length !== b.membranas.length) erro ??= `${b.membranas.length} membranas (Rust) x ${a.membranas.length} (TS)`;
    else {
      a.membranas.forEach((m, k) => {
        const n = b.membranas[k]!;
        if (m.camada !== n.camada || m.material !== n.material) erro ??= `membrana ${k}: camada/material ${n.camada}/${n.material} (Rust) x ${m.camada}/${m.material} (TS)`;
        else if (!pontoIgual(m.pts[0]!, n.pts[0]!) || !pontoIgual(m.pts[1]!, n.pts[1]!)) erro ??= `membrana ${k}: pontos ${JSON.stringify(n.pts)} (Rust) x ${JSON.stringify(m.pts)} (TS)`;
        else nota(Math.max(...m.pts.flatMap((p, j) => [Math.abs(p.x - n.pts[j]!.x), Math.abs(p.y - n.pts[j]!.y)])));
      });
    }
    if (erro) {
      divergencias.push(`${rotulo}: ${erro}`);
      continue;
    }
    r.paredes++;
    if (a.profileTop) r.paredesComPerfilTopo++;
    if (a.profileBottom) r.paredesComPerfilBase++;
    if (perfisDoModelo.has(a.id)) r.paredesComPerfilDoModelo++;
    if (a.membranas.length) {
      r.paredesComMembranas++;
      r.membranas += a.membranas.length;
    }
  }
  for (const c of ref.camadas) for (const f of c.faixas) if (f.slope) r.faixasInclinadas++;
  r.excecoesDeFaixa = usadasFaixa;
  return r;
}
