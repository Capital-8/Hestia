// Contornos das paredes geradas pela massa (plano de massa, A.7 e ficha D2). Para cada nível escolhido, pega a fatia da massa (consulta 142
// do kernel, uma por cópia do arranjo), faz a UNIÃO 2D das cópias como os pisos (D1), simplifica o contorno externo por Douglas-Peucker
// (tolerância padrão 5 cm) e funde os segmentos menores que o mínimo (padrão 0,40 m). Cada contorno vira uma cadeia FECHADA de paredes
// retas, no sentido horário (face externa à esquerda de a→b, como o padrão do motor). Os furos ficam de fora na v1. Quem monta o comando
// é `comandoDerivarParedes` (pacote model). Sem kernel, devolve `null`.

import { dist, type Vec2 } from '@hestia/geom';
import { isMass, type Id, type Project } from '@hestia/model';
import { servicoMassa, type ServicoMassa } from './massaServico.ts';
import { semRepetidos, simplificarAnel, uniaoDeAneis } from './massaDerivaPisos.ts';

/** Tolerância padrão da simplificação do contorno da parede (A.7): 5 cm, em metros. */
export const TOLERANCIA_PAREDE_PADRAO = 0.05;
/** Segmento mínimo de parede (A.7): 0,40 m, em metros. Vértice que faria segmento menor é fundido. */
export const SEGMENTO_MINIMO_PADRAO = 0.4;

export interface OpcoesParedesMassa {
  /** Tolerância de simplificação (m); padrão 5 cm. */
  tolerancia?: number;
  /** Segmento mínimo (m); padrão 0,40 m. */
  segmentoMinimo?: number;
}

/** Uma cadeia fechada de paredes: os vértices em sentido horário, sem repetir o primeiro no fim (a última parede termina no primeiro). */
export type CadeiaParede = Vec2[];

/** Paredes de um nível: a altura é até o próximo nível dentro da massa (`topoNivelId`) ou até o topo da massa (`topoNivelId` null). */
export interface DerivacaoNivelParedes {
  nivelId: Id;
  topoNivelId: Id | null;
  altura: number;
  cadeias: CadeiaParede[];
}

export interface DerivacaoParedesMassa {
  /** Níveis com fatia e altura, na ordem pedida. */
  porNivel: DerivacaoNivelParedes[];
  /** Níveis pedidos sem fatia da massa: não geram nada e aparecem aqui. */
  semFatia: Id[];
  /** Níveis com fatia mas sem altura até o topo da massa (o nível está na cota do topo): não geram nada. */
  semAltura: Id[];
}

/** Área com sinal (fórmula de Gauss): positiva para sentido anti-horário. */
function areaComSinal(anel: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % anel.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** O mesmo anel no sentido horário (a face externa fica à esquerda de cada parede, como o padrão do motor). */
export function emSentidoHorario(anel: readonly Vec2[]): Vec2[] {
  const copia = anel.map((p) => ({ x: p.x, y: p.y }));
  return areaComSinal(copia) > 0 ? copia.reverse() : copia;
}

/**
 * Funde vértices que fariam um segmento menor que o mínimo: cada vértice é mantido só se ficar a pelo menos `minimo` do último mantido,
 * e o último é retirado enquanto ficar mais perto do primeiro que o mínimo. Devolve a cadeia ou `[]` se sobrarem menos de 3 vértices.
 * Fundir muda o contorno (um vértice some), por isso o caso comum (círculo de 64 pontos com 5 cm) quase nunca funde nada.
 */
export function fundirSegmentosCurtos(anel: readonly Vec2[], minimo: number): Vec2[] {
  const out: Vec2[] = [];
  for (const q of anel) {
    const ult = out[out.length - 1];
    if (!ult || dist(ult, q) >= minimo) out.push({ x: q.x, y: q.y });
  }
  while (out.length >= 3 && dist(out[out.length - 1]!, out[0]!) < minimo) out.pop();
  return out.length >= 3 ? out : [];
}

/**
 * Tira vértices colineares com os vizinhos (a no máximo `eps` m da reta anterior→seguinte e entre os dois). O anel da fatia começa onde a
 * semirreta +x local cruza o contorno, que pode ser no meio de um lado reto: sem isso uma parede reta sairia dividida em duas.
 */
export function semColineares(anel: readonly Vec2[], eps = 1e-4): Vec2[] {
  const out = anel.map((p) => ({ x: p.x, y: p.y }));
  let mudou = true;
  while (mudou && out.length > 3) {
    mudou = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i - 1 + out.length) % out.length]!;
      const c = out[i]!;
      const b = out[(i + 1) % out.length]!;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const l2 = abx * abx + aby * aby;
      if (l2 < 1e-18) continue;
      const t = ((c.x - a.x) * abx + (c.y - a.y) * aby) / l2;
      const d = Math.abs(abx * (c.y - a.y) - aby * (c.x - a.x)) / Math.sqrt(l2);
      if (t > 0 && t < 1 && d <= eps) {
        out.splice(i, 1);
        mudou = true;
        i--;
      }
    }
  }
  return out;
}

/** Cadeia de paredes de um contorno externo: tira repetidos, simplifica (Douglas-Peucker), põe em sentido horário, tira colineares e funde os curtos. */
export function cadeiaDeParedes(anel: readonly Vec2[], tolerancia: number, segmentoMinimo: number): CadeiaParede {
  const simples = simplificarAnel(semRepetidos(anel), tolerancia);
  return fundirSegmentosCurtos(semColineares(emSentidoHorario(simples)), segmentoMinimo);
}

/**
 * Paredes da massa por nível (A.7). Para cada nível: fatias da massa (todas as cópias), união 2D, o contorno externo de cada componente
 * vira uma cadeia fechada. A altura vai até o PRÓXIMO nível do projeto que cai dentro da massa, ou, se não houver, até o topo da massa.
 * Sem kernel (a fonte devolve `null`), devolve `null` sem lançar. A fonte é injetável para os testes; em produção é o `servicoMassa()`.
 *
 * Chama `fatias(p)` UMA vez e filtra por nível alvo (E16 item 1): `fatias(p, nivel)` não serve para escolher o nível da fatia.
 */
export function derivarContornosParedesDaMassa(
  p: Project,
  massaId: Id,
  niveis: readonly Id[],
  opcoes: OpcoesParedesMassa = {},
  fonte: Pick<ServicoMassa, 'fatias'> = servicoMassa(),
): DerivacaoParedesMassa | null {
  const tolerancia = opcoes.tolerancia ?? TOLERANCIA_PAREDE_PADRAO;
  const minimo = opcoes.segmentoMinimo ?? SEGMENTO_MINIMO_PADRAO;
  const todas = fonte.fatias(p);
  if (todas === null) return null;
  const vazio: DerivacaoParedesMassa = { porNivel: [], semFatia: [...niveis], semAltura: [] };
  const m = p.elements[massaId];
  if (!isMass(m)) return vazio;
  const nivelDaMassa = p.levels.find((l) => l.id === m.levelId);
  const ultima = m.secoes[m.secoes.length - 1];
  if (!nivelDaMassa || !ultima) return vazio;
  const base = nivelDaMassa.elevation + m.baseOffset;
  const topo = base + ultima.z;
  const dentroDaMassa = (cota: number): boolean => cota >= base - 1e-9 && cota <= topo + 1e-9;
  const ordenados = [...p.levels].sort((a, b) => a.elevation - b.elevation);

  const porNivel: DerivacaoNivelParedes[] = [];
  const semFatia: Id[] = [];
  const semAltura: Id[] = [];
  for (const nivelId of niveis) {
    const minhas = todas.filter((f) => f.massaId === massaId && f.nivelId === nivelId);
    const nivel = p.levels.find((l) => l.id === nivelId);
    if (minhas.length === 0 || !nivel) {
      semFatia.push(nivelId);
      continue;
    }
    const proximo = ordenados.find((l) => l.elevation > nivel.elevation + 1e-9 && dentroDaMassa(l.elevation)) ?? null;
    const altura = proximo ? proximo.elevation - nivel.elevation : topo - nivel.elevation;
    if (!(altura > 1e-9)) {
      semAltura.push(nivelId);
      continue;
    }
    const uniao = uniaoDeAneis(minhas.map((f) => semRepetidos(f.pontos)));
    const cadeias = uniao.map((poli) => cadeiaDeParedes(poli[0]!, tolerancia, minimo)).filter((c) => c.length >= 3);
    porNivel.push({ nivelId, topoNivelId: proximo?.id ?? null, altura, cadeias });
  }
  return { porNivel, semFatia, semAltura };
}
