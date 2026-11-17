// Paredes da massa com TORÇÃO / loft / bulbo (frente massa-paredes-torcidas, M2). A derivação de `massaDerivaParedes.ts` faz uma fatia por nível e
// paredes verticais; aqui a altura de cada nível vira N PASSOS e, em cada passo [z0, z1], cada aresta da fatia de z0 vira uma parede reta INCLINADA.
//
// DECISÃO GEOMÉTRICA (documentada em docs/massa/ESTADO.md): a face lateral entre duas fatias de uma massa torcida NÃO é plana (as quatro pontas não são
// coplanares), então uma parede reta só a aproxima. Escolha: a LINHA DE BASE da parede é a aresta da fatia INFERIOR (os vértices da cadeia são
// compartilhados, então a cadeia fecha em z0 e as junções são as do motor) e o `tilt` é o do deslocamento NORMAL que o contorno da fatia SUPERIOR tem
// em relação ao ponto médio da aresta (raio ao longo da normal esquerda = para fora, pois a cadeia é horária). Com isso o plano passa pela aresta
// de baixo e, no meio da face, pela superfície de cima; a rotação do eixo da face entre as duas fatias (torção) NÃO é absorvida pelo plano: ela é
// dividida em passos (bisseção por passo: cada intervalo cujo desvio medido passa da tolerância é partido ao meio, até `maxPassosPorNivel`).
// O DESVIO é medido (Hausdorff amostrado, 2D, entre as arestas da parede e a fatia real do kernel) na base, no meio e no topo de cada passo.
//
// Fatias em cotas arbitrárias vêm do kernel por projeto sintético (`massaFatiasEmCotas.ts`): nada de malha duplicada em TS.
// Extrusão reta (contorno igual em todas as cotas) dá tilt 0 em todo passo, nenhuma bisseção e as mesmas cadeias de `derivarContornosParedesDaMassa`.

import type { Vec2 } from '@hestia/geom';
import { isMass, WALL_TILT_MAX, type Id, type Project } from '@hestia/model';
import { cadeiaDeParedes, derivarContornosParedesDaMassa, SEGMENTO_MINIMO_PADRAO, TOLERANCIA_PAREDE_PADRAO, type OpcoesParedesMassa } from './massaDerivaParedes.ts';
import { chaveCota, contornosEmCotas, type FonteFatiasEmCotas } from './massaFatiasEmCotas.ts';
import { desvioEntre, deslocamentoNormal, segmentosDeAneis, type Segmento } from './massaParedesGeom.ts';
import { servicoMassa, servicoMassaAuxiliar, type ServicoMassa } from './massaServico.ts';

/** Desvio máximo padrão entre o modelo de paredes e a superfície da massa (m): 5 cm (a torre M3 com 2 cm bate no limite de 16 passos por nível: ver docs/massa/ESTADO.md), só entra na decisão de partir um passo. */
export const DESVIO_PAREDE_PADRAO = 0.05;
/** Passos máximos por nível (potência de 2 na prática, pela bisseção). */
export const PASSOS_MAXIMOS_PADRAO = 16;
/** Inclinação abaixo da qual a parede sai vertical (graus): ruído numérico do kernel. */
const TILT_MINIMO = 1e-4;

export type ModoParedesTorcidas = 'porNivel' | 'porTolerancia';

export interface OpcoesParedesTorcidas extends OpcoesParedesMassa {
  /** `porNivel`: um passo por nível (tilt do passo único); `porTolerancia` (padrão): parte os passos até o desvio caber em `desvioMax`. */
  modo?: ModoParedesTorcidas;
  /** Desvio máximo desejado (m); padrão 5 cm. */
  desvioMax?: number;
  /** Máximo de passos por nível (>= 1); padrão 16. */
  maxPassosPorNivel?: number;
}

/** Cadeia fechada de um passo: vértices horários e o `tilt` (graus) da parede de cada segmento i (de `pontos[i]` a `pontos[i+1]`). */
export interface CadeiaInclinada {
  pontos: Vec2[];
  tilts: number[];
}

/** Um passo de altura dentro de um nível: da cota absoluta `z0` a `z0 + altura`. */
export interface PassoParedes {
  z0: number;
  altura: number;
  /** Deslocamento da base do passo acima da cota do nível. */
  baseOffset: number;
  /** Nível em cujo topo o passo termina (só no último passo do nível, quando há nível acima dentro da massa); senão `null`. */
  topoNivelId: Id | null;
  cadeias: CadeiaInclinada[];
  /** Desvio máximo medido neste passo (m): Hausdorff contra as fatias reais na base, meio e topo. */
  desvio: number;
}

export interface DerivacaoNivelInclinado {
  nivelId: Id;
  topoNivelId: Id | null;
  altura: number;
  passos: PassoParedes[];
}

export interface AvisosParedesTorcidas {
  /** Passos que bateram em `maxPassosPorNivel` com o desvio ainda acima da tolerância. */
  limiteDePassos: number;
  /** Paredes cuja inclinação passou de 60° e foi limitada. */
  inclinacaoLimitada: number;
  /** Vértices fundidos pelo segmento mínimo (somados em todas as cadeias de todos os passos). */
  segmentosFundidos: number;
}

export interface DerivacaoParedesTorcidas {
  porNivel: DerivacaoNivelInclinado[];
  semFatia: Id[];
  semAltura: Id[];
  /** Maior desvio medido, contra as fatias reais do kernel (inclui a simplificação do contorno). */
  desvioMax: number;
  /** Maior desvio da aproximação inclinada contra o contorno simplificado de cada cota (sem a simplificação). */
  desvioAproximacao: number;
  nParedes: number;
  nPassos: number;
  /** Paredes com `tilt` diferente de 0. */
  nInclinadas: number;
  avisos: AvisosParedesTorcidas;
}

/** Normal esquerda unitária de a→b (a face externa da cadeia horária). */
const normalEsquerda = (a: Vec2, b: Vec2): Vec2 => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
};

interface Avaliacao {
  cadeias: CadeiaInclinada[];
  desvio: number;
  desvioAproximacao: number;
  fundidos: number;
  limitadas: number;
}

/** Cadeias horárias (já simplificadas) de cada componente de uma lista de contornos. */
function cadeiasDe(contornos: readonly Vec2[][], tol: number, minimo: number): Vec2[][] {
  return contornos.map((c) => cadeiaDeParedes(c, tol, minimo)).filter((c) => c.length >= 3);
}

/** Segmentos da cadeia deslocada: cada parede, na altura `h` acima da base, vale a aresta empurrada por `h·tan(tilt)` pela normal esquerda. */
function segmentosNaAltura(cadeia: CadeiaInclinada, h: number): Segmento[] {
  const n = cadeia.pontos.length;
  const out: Segmento[] = [];
  for (let i = 0; i < n; i++) {
    const a = cadeia.pontos[i]!;
    const b = cadeia.pontos[(i + 1) % n]!;
    const nn = normalEsquerda(a, b);
    const d = h * Math.tan((cadeia.tilts[i]! * Math.PI) / 180);
    out.push([
      { x: a.x + nn.x * d, y: a.y + nn.y * d },
      { x: b.x + nn.x * d, y: b.y + nn.y * d },
    ]);
  }
  return out;
}

/**
 * Avalia o passo [z0, z1]: as cadeias (de `c0`, a fatia de baixo), o `tilt` de cada parede (contra `c1`, a fatia de cima) e o desvio medido contra as
 * fatias reais de baixo, do meio (`cm`) e de cima.
 */
function avaliarPasso(c0: Vec2[][], cm: Vec2[][], c1: Vec2[][], altura: number, tol: number, minimo: number): Avaliacao {
  // O deslocamento é medido contra o contorno SIMPLIFICADO de cima (a mesma regra da base): num cilindro as duas cadeias são iguais e o tilt dá 0.
  const cima = segmentosDeAneis(cadeiasDe(c1, tol, minimo));
  const cadeias: CadeiaInclinada[] = [];
  let fundidos = 0;
  let limitadas = 0;
  for (const anel of c0) {
    const pontos = cadeiaDeParedes(anel, tol, minimo);
    if (pontos.length < 3) continue;
    fundidos += Math.max(0, cadeiaSemFusao(anel, tol).length - pontos.length);
    const tilts: number[] = [];
    for (let i = 0; i < pontos.length; i++) {
      const a = pontos[i]!;
      const b = pontos[(i + 1) % pontos.length]!;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = cima.length === 0 ? 0 : deslocamentoNormal(m, normalEsquerda(a, b), cima);
      let graus = (Math.atan2(d, altura) * 180) / Math.PI;
      if (Math.abs(graus) < TILT_MINIMO) graus = 0;
      if (Math.abs(graus) > WALL_TILT_MAX) {
        graus = Math.sign(graus) * WALL_TILT_MAX;
        limitadas++;
      }
      tilts.push(graus);
    }
    cadeias.push({ pontos, tilts });
  }
  const modelo = (h: number): Segmento[] => cadeias.flatMap((c) => segmentosNaAltura(c, h));
  const nas = (h: number, real: Vec2[][], tolRef: number | null): number =>
    desvioEntre(modelo(h), segmentosDeAneis(tolRef === null ? real : cadeiasDe(real, tolRef, minimo)));
  const real = [c0, cm, c1];
  const alt = [0, altura / 2, altura];
  let desvio = 0;
  let aprox = 0;
  for (let k = 0; k < 3; k++) {
    desvio = Math.max(desvio, nas(alt[k]!, real[k]!, null));
    aprox = Math.max(aprox, nas(alt[k]!, real[k]!, tol));
  }
  return { cadeias, desvio, desvioAproximacao: aprox, fundidos, limitadas };
}

/** Quantidade de vértices da cadeia antes de fundir os segmentos curtos: só serve de contagem para o aviso. */
function cadeiaSemFusao(anel: readonly Vec2[], tol: number): Vec2[] {
  return cadeiaDeParedes(anel, tol, 0);
}

interface Intervalo {
  nivelIdx: number;
  z0: number;
  z1: number;
  prof: number;
}

/**
 * Paredes inclinadas da massa por nível e passo (ver o cabeçalho do arquivo). `null` sem kernel. As fontes são injetáveis nos testes:
 * `fonte` classifica os níveis (como `derivarContornosParedesDaMassa`) e `fonteCotas` fatia nas cotas dos passos (projeto sintético).
 */
export function derivarParedesInclinadasDaMassa(
  p: Project,
  massaId: Id,
  niveis: readonly Id[],
  opcoes: OpcoesParedesTorcidas = {},
  fonte: Pick<ServicoMassa, 'fatias'> = servicoMassa(),
  fonteCotas: FonteFatiasEmCotas = servicoMassaAuxiliar(),
): DerivacaoParedesTorcidas | null {
  const tol = opcoes.tolerancia ?? TOLERANCIA_PAREDE_PADRAO;
  const minimo = opcoes.segmentoMinimo ?? SEGMENTO_MINIMO_PADRAO;
  const desvioAlvo = opcoes.desvioMax ?? DESVIO_PAREDE_PADRAO;
  const maxPassos = Math.max(1, Math.floor(opcoes.maxPassosPorNivel ?? PASSOS_MAXIMOS_PADRAO));
  const profMax = opcoes.modo === 'porNivel' ? 0 : Math.floor(Math.log2(maxPassos) + 1e-9);
  const base = derivarContornosParedesDaMassa(p, massaId, niveis, opcoes, fonte);
  if (base === null) return null;
  const vazio: DerivacaoParedesTorcidas = {
    porNivel: [],
    semFatia: base.semFatia,
    semAltura: base.semAltura,
    desvioMax: 0,
    desvioAproximacao: 0,
    nParedes: 0,
    nPassos: 0,
    nInclinadas: 0,
    avisos: { limiteDePassos: 0, inclinacaoLimitada: 0, segmentosFundidos: 0 },
  };
  const m = p.elements[massaId];
  if (!isMass(m) || base.porNivel.length === 0) return vazio;

  const cota = (id: Id): number => p.levels.find((l) => l.id === id)!.elevation;
  const pendentes: Intervalo[] = base.porNivel.map((n, i) => {
    const z0 = cota(n.nivelId);
    return { nivelIdx: i, z0, z1: z0 + n.altura, prof: 0 };
  });
  const contornos = new Map<string, Vec2[][]>();
  const finais: Array<Intervalo & Avaliacao> = [];
  let limiteDePassos = 0;
  while (pendentes.length > 0) {
    const pedir = pendentes.flatMap((iv) => [iv.z0, (iv.z0 + iv.z1) / 2, iv.z1]).filter((z) => !contornos.has(chaveCota(z)));
    if (pedir.length > 0) {
      const novos = contornosEmCotas(p, massaId, pedir, fonteCotas);
      if (novos === null) return null;
      for (const [k, v] of novos) contornos.set(k, v);
    }
    const atual = pendentes.splice(0, pendentes.length);
    for (const iv of atual) {
      const zm = (iv.z0 + iv.z1) / 2;
      const c0 = contornos.get(chaveCota(iv.z0)) ?? [];
      const cm = contornos.get(chaveCota(zm)) ?? c0;
      const c1 = contornos.get(chaveCota(iv.z1)) ?? c0;
      const av = avaliarPasso(c0, cm, c1, iv.z1 - iv.z0, tol, minimo);
      if (av.desvioAproximacao > desvioAlvo + 1e-9 && iv.prof < profMax) {
        pendentes.push({ ...iv, z1: zm, prof: iv.prof + 1 }, { ...iv, z0: zm, prof: iv.prof + 1 });
        continue;
      }
      if (av.desvioAproximacao > desvioAlvo + 1e-9 && opcoes.modo !== 'porNivel') limiteDePassos++;
      finais.push({ ...iv, ...av });
    }
  }
  finais.sort((a, b) => a.nivelIdx - b.nivelIdx || a.z0 - b.z0);
  let desvioMax = 0;
  let desvioAproximacao = 0;
  let nParedes = 0;
  let nInclinadas = 0;
  let fundidos = 0;
  let limitadas = 0;
  const porNivel: DerivacaoNivelInclinado[] = base.porNivel.map((n, i) => {
    const passos: PassoParedes[] = finais
      .filter((f) => f.nivelIdx === i)
      .map((f) => {
        desvioMax = Math.max(desvioMax, f.desvio);
        desvioAproximacao = Math.max(desvioAproximacao, f.desvioAproximacao);
        fundidos += f.fundidos;
        limitadas += f.limitadas;
        for (const c of f.cadeias) {
          nParedes += c.pontos.length;
          nInclinadas += c.tilts.filter((t) => t !== 0).length;
        }
        const chega = Math.abs(f.z1 - (cota(n.nivelId) + n.altura)) < 1e-9;
        return { z0: f.z0, altura: f.z1 - f.z0, baseOffset: f.z0 - cota(n.nivelId), topoNivelId: chega ? n.topoNivelId : null, cadeias: f.cadeias, desvio: f.desvio };
      });
    return { nivelId: n.nivelId, topoNivelId: n.topoNivelId, altura: n.altura, passos };
  });
  return {
    porNivel,
    semFatia: base.semFatia,
    semAltura: base.semAltura,
    desvioMax,
    desvioAproximacao,
    nParedes,
    nPassos: porNivel.reduce((s, n) => s + n.passos.length, 0),
    nInclinadas,
    avisos: { limiteDePassos, inclinacaoLimitada: limitadas, segmentosFundidos: fundidos },
  };
}
