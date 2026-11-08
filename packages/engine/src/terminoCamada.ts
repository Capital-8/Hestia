import { arcPointAt, boxesOverlap, difference, intersection, multiArea, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { layerSpans, type FuncaoRefParede, type Id, type Project, type TerminoCamada } from '@hestia/model';
import { frameOfWall } from './resolve.ts';
import { pointAt, sAtDepth, toLocal, type WallFrame } from './frame.ts';
import { boxOfMulti, doorRectsReaching, restringirAosTrechos, trechosReais, wallBlockedZone } from './terminoBlock.ts';
import type { ResolvedWall } from './types.ts';

/**
 * Término por camada da parede (decisão 0054). A camada de piso ou de laje para numa camada da parede, escolhida pela função
 * (`structure`, `substrate`, ...), pelo lado da parede em relação à laje, pela face e por um deslocamento. Vale para toda
 * parede que a camada toca, as internas e as do perímetro externo, sem marcar parede por parede.
 *
 * Tudo se mede em PROFUNDIDADE `d` a partir da face externa da parede (a mesma de `layerSpans`): a face externa é `d = 0`
 * e a interna `d = total`. A laje fica do lado externo (`ext`) ou do interno (`int`) da parede, e a mesma parede pode ter
 * laje dos dois lados (elemento que passa por cima dela, ou laje de um lado e outra do outro).
 */

/** Largura (m) da faixa colada à face da parede em que se procura a laje: ela só conta se cobrir área nessa faixa. */
export const LARGURA_PRESENCA = 0.05;
/** Folga (m) para a banda passar das faces da parede. */
export const FOLGA_BANDA = 1;
/** Área mínima (m2) de uma peça da laje na faixa de presença para a laje contar como presente naquele lado. */
export const AREA_MINIMA = 1e-9;
/** Tolerância (m) para a camada do meio da parede contar nas duas metades. */
export const TOLERANCIA_META = 1e-9;
/** Camada da parede como a busca a enxerga: função, e distâncias da face externa ao início e ao fim. */
export interface CamadaDeBusca {
  funcao: string;
  de: number;
  ate: number;
}

/** Resultado da busca: a profundidade da borda da camada da laje e se foi preciso cair na camada seguinte. */
export interface BordaEscolhida {
  borda: number;
  aviso: boolean;
}

/**
 * Profundidade da borda da camada da laje numa parede. `ladoLaje` é o lado da parede em que a laje está. A metade `proximo`
 * é a do lado da laje; `distante`, a oposta. A camada pedida é a primeira daquela metade a partir da face dela; a camada
 * central (a que cruza o meio da espessura) conta nas duas metades. Sem a função na metade, a busca segue em direção ao lado
 * oposto pela parede toda (aviso); sem a função em parte alguma, vale a primeira camada da metade (aviso).
 */
export function bordaDaCamada(camadas: readonly CamadaDeBusca[], total: number, regra: TerminoCamada, ladoLaje: 'ext' | 'int'): BordaEscolhida {
  const sentido = ladoLaje === 'ext' ? 1 : -1;
  const avanco = (regra.cm / 100) * sentido;
  const meio = total / 2;
  if (regra.funcao === 'eixo') return { borda: meio + avanco, aviso: false };
  const metadeExterna = (regra.lado === 'proximo') === (ladoLaje === 'ext');
  const indices = camadas.map((_, i) => i);
  const ordem = metadeExterna ? indices : indices.slice().reverse();
  const centro = (c: CamadaDeBusca): number => (c.de + c.ate) / 2;
  const naMetade = (c: CamadaDeBusca): boolean => (metadeExterna ? centro(c) <= meio + TOLERANCIA_META : centro(c) >= meio - TOLERANCIA_META);
  let achada = ordem.find((i) => naMetade(camadas[i]!) && camadas[i]!.funcao === regra.funcao);
  let aviso = false;
  if (achada === undefined) {
    aviso = true;
    achada = ordem.find((i) => camadas[i]!.funcao === regra.funcao) ?? ordem.find((i) => naMetade(camadas[i]!));
  }
  if (achada === undefined) return { borda: meio + avanco, aviso };
  const c = camadas[achada]!;
  const proxima = ladoLaje === 'ext' ? c.de : c.ate;
  const distante = ladoLaje === 'ext' ? c.ate : c.de;
  const face = regra.face === 'proxima' ? proxima : regra.face === 'distante' ? distante : centro(c);
  return { borda: face + avanco, aviso };
}

/** Aviso do término por camada: a parede não tem a função pedida no lado pedido e a borda foi para a camada seguinte. */
export interface AvisoTerminoCamada {
  wallId: Id;
  funcao: FuncaoRefParede;
  lado: 'proximo' | 'distante';
}

/**
 * Faixa de uma parede entre os trechos `t0..t1` do eixo e as profundidades `d0..d1`. Parede reta: o retângulo. Arco: o setor,
 * amostrado a cada `passo` (o mesmo passo das camadas em arco, `passoDoArco`).
 */
export function bandaDaParede(f: WallFrame, t0: number, t1: number, d0: number, d1: number): MultiPolygon {
  const s0 = sAtDepth(f, d0);
  const s1 = sAtDepth(f, d1);
  const arco = f.arc;
  if (!arco) return [[[pointAt(f, t0, s0), pointAt(f, t1, s0), pointAt(f, t1, s1), pointAt(f, t0, s1)]]];
  const passo = Math.min(0.5, Math.max(0.05, Math.sqrt(8 * arco.radius * 3e-4)));
  const n = Math.max(1, Math.ceil((t1 - t0) / passo));
  const ida: Vec2[] = [];
  const volta: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    ida.push(arcPointAt(arco, t, s0));
    volta.push(arcPointAt(arco, t, s1));
  }
  return [[[...ida, ...volta.reverse()]]];
}

/** Faixa do eixo `[menor t, maior t]` dos vértices de um anel, no sistema da parede. */
function intervaloT(f: WallFrame, anel: Ring): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of anel) {
    const t = toLocal(f, q).t;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return [lo, hi];
}

/**
 * Região da camada da laje com o término por camada da parede (decisão 0054). `ref` é o contorno de partida (a face de acabamento
 * do circuito, o contorno estático ou o anel do perímetro); `walls` são as paredes do escopo; `z0..z1` é a faixa de cota da
 * camada. Para cada parede com a laje colada à face externa ou à interna (área na faixa de presença), a camada:
 * - é cortada de `ref` na parte da parede além da borda (e, com recuo, na faixa que sobra antes da face);
 * - avança sobre a parede até a borda (a região entre a face e a borda entra);
 * - nos vãos de porta que chegam ao topo da camada, a parede não é cortada (a camada continua sob a soleira, como na decisão 0025).
 * O que a camada não alcança fica fora dela. Sem parede, devolve `ref`.
 */
export function regionCamada(p: Project, ref: MultiPolygon, walls: readonly ResolvedWall[], regra: TerminoCamada, z0: number, z1: number, avisos?: AvisoTerminoCamada[]): MultiPolygon {
  const bx = boxOfMulti(ref);
  if (!bx) return ref;
  const blocos: MultiPolygon[] = [];
  const proprios: MultiPolygon[] = [];
  for (const rw of walls) {
    const trechos = trechosReais(p, rw, z0, z1);
    if (trechos !== null && trechos.length === 0) continue;
    const pegada = wallBlockedZone(rw, { kind: 'face' });
    const bz = boxOfMulti(pegada);
    if (!bz || !boxesOverlap(bx, bz)) continue;
    const f = frameOfWall(p, rw.wallId);
    if (!f) continue;
    const F = restringirAosTrechos(rw, pegada, trechos);
    if (F.length === 0) continue;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const poly of F) {
      const [lo, hi] = intervaloT(f, poly[0]!);
      tMin = Math.min(tMin, lo);
      tMax = Math.max(tMax, hi);
    }
    const T = f.thickness;
    const camadas: CamadaDeBusca[] = layerSpans(f.type).map((sp) => ({ funcao: sp.layer.function, de: sp.from, ate: sp.to }));
    const portas = doorRectsReaching(p, rw, z1);
    for (const lado of ['ext', 'int'] as const) {
      const faixa = lado === 'ext' ? bandaDaParede(f, tMin, tMax, -LARGURA_PRESENCA, 0) : bandaDaParede(f, tMin, tMax, T, T + LARGURA_PRESENCA);
      const presentes = intersection(ref, faixa).filter((poly) => multiArea([poly]) > AREA_MINIMA);
      if (presentes.length === 0) continue;
      const { borda, aviso } = bordaDaCamada(camadas, T, regra, lado);
      if (aviso) avisos?.push({ wallId: rw.wallId, funcao: regra.funcao, lado: regra.lado });
      // A borda avança `avanco` sobre a parede: a faixa passa dessa medida nas duas pontas da presença, para o canto (esquadria) não ficar com o entalhe.
      const avanco = Math.max(0, lado === 'ext' ? borda : T - borda);
      const banda = (d0: number, d1: number): MultiPolygon =>
        union(...presentes.map((poly) => { const [lo, hi] = intervaloT(f, poly[0]!); return bandaDaParede(f, lo - avanco, hi + avanco, d0, d1); }));
      const tira = (d0: number, d1: number): MultiPolygon => intersection(F, banda(d0, d1));
      let bloco: MultiPolygon;
      if (lado === 'ext') {
        if (borda > 0) proprios.push(tira(-FOLGA_BANDA, borda));
        bloco = tira(borda, T + FOLGA_BANDA);
        if (borda < 0) bloco = union(bloco, banda(borda, 0));
        // Borda além da face oposta (avanço maior que a espessura): a camada passa da parede toda e segue além dela.
        if (borda > T) proprios.push(banda(T, borda));
      } else {
        if (borda < T) proprios.push(tira(borda, T + FOLGA_BANDA));
        bloco = tira(-FOLGA_BANDA, borda);
        if (borda > T) bloco = union(bloco, banda(T, borda));
        if (borda < 0) proprios.push(banda(borda, 0));
      }
      blocos.push(portas.length === 0 ? bloco : difference(bloco, ...portas));
    }
  }
  const proprios_ = proprios.filter((m) => m.length > 0);
  const blocos_ = blocos.filter((m) => m.length > 0);
  if (proprios_.length === 0 && blocos_.length === 0) return ref;
  const sem = blocos_.length === 0 ? ref : difference(ref, ...blocos_);
  return proprios_.length === 0 ? sem : union(sem, ...proprios_);
}
