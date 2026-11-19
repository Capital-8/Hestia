import type { PecaResolvida, UsinagemResolvida } from '@hestia/engine';
import type { NivelDetalhe3d } from './logica.ts';

/*
 * Marcadores das usinagens de uma peça resolvida (função PURA: sem three.js, testável em Node). O visualizador
 * transforma cada `Marcador` num objeto filho do mesh da peça. Unidades: metros. Convenção de `pecas.ts`: `a` é a
 * face da origem (w = 0), `b` a oposta (w = espessura), `n`/`s`/`l`/`o` as bordas (só furo; `u` corre ao longo da
 * borda e `v` é a distância da face `a`). Nunca lança: tipo ou face desconhecidos e números inválidos são ignorados.
 */

/** Altura do marcador ao longo da normal (m): meio milímetro, para ler como adesivo fino sobre a face. */
const ALTURA_MARCADOR = 0.0005;

type Vetor3 = [number, number, number];

export type FormaMarcador = 'disco' | 'caixa';

/** Um marcador de usinagem em coordenadas locais da peça (origem = canto mínimo da caixa, metros). */
export interface Marcador {
  /** 'disco' para furo; 'caixa' para rasgo e recorte. */
  forma: FormaMarcador;
  /** Centro do marcador, exatamente sobre o plano da face indicada. */
  centro: Vetor3;
  /** Normal unitária da face, apontando para fora da peça (uma das seis direções de eixo). */
  normal: Vetor3;
  /** Raio do disco (m); 0 na caixa. */
  raio: number;
  /** Dimensões da caixa nos eixos mundiais X, Y, Z (m); [0, 0, 0] no disco. */
  dimensoes: Vetor3;
  /** Altura (espessura) do marcador ao longo da normal (m). */
  altura: number;
}

interface EixosPlano {
  /** Índice do eixo mundial da direção `u` do plano da chapa. */
  u: number;
  /** Índice do eixo mundial da direção `v`. */
  v: number;
  /** Índice do eixo mundial da espessura. */
  t: number;
}

/** Índices (0 = x, 1 = y, 2 = z) de `u`, `v` e da espessura; `null` para eixo desconhecido. */
function eixosPlano(eixo: string): EixosPlano | null {
  if (eixo === 'x') return { u: 1, v: 2, t: 0 };
  if (eixo === 'y') return { u: 0, v: 2, t: 1 };
  if (eixo === 'z') return { u: 0, v: 1, t: 2 };
  return null;
}

/** Face oposta na passagem (furo passante aparece também do outro lado). */
const OPOSTA: Readonly<Record<string, string>> = { a: 'b', b: 'a', n: 's', s: 'n', l: 'o', o: 'l' };

/** Ponto (u, v) da face ou borda em coordenadas locais da peça (mesmas tabelas de `pontoNoMundo` do motor). */
function pontoNaFace(peca: PecaResolvida, e: EixosPlano, face: string, u: number, v: number): Vetor3 {
  const [a, b] = peca.tamanho;
  const pt: Vetor3 = [peca.origem[0], peca.origem[1], peca.origem[2]];
  if (face === 'a' || face === 'b') {
    pt[e.u] = pt[e.u]! + u;
    pt[e.v] = pt[e.v]! + v;
    if (face === 'b') pt[e.t] = pt[e.t]! + peca.espessura;
  } else if (face === 'o' || face === 'l') {
    pt[e.v] = pt[e.v]! + u;
    pt[e.t] = pt[e.t]! + v;
    if (face === 'l') pt[e.u] = pt[e.u]! + a;
  } else {
    pt[e.u] = pt[e.u]! + u;
    pt[e.t] = pt[e.t]! + v;
    if (face === 'n') pt[e.v] = pt[e.v]! + b;
  }
  return pt;
}

/** Normal para fora (unitária, alinhada a eixo) da face ou borda; `null` para face desconhecida. */
function normalDaFace(e: EixosPlano, face: string): Vetor3 | null {
  const n: Vetor3 = [0, 0, 0];
  if (face === 'a') n[e.t] = -1;
  else if (face === 'b') n[e.t] = 1;
  else if (face === 'n') n[e.v] = 1;
  else if (face === 's') n[e.v] = -1;
  else if (face === 'l') n[e.u] = 1;
  else if (face === 'o') n[e.u] = -1;
  else return null;
  return n;
}

/** Face conhecida (a tabela de `pecas.ts`) e números usáveis? */
function usinagemSana(u: UsinagemResolvida): boolean {
  return OPOSTA[u.face] !== undefined && Number.isFinite(u.u) && Number.isFinite(u.v);
}

function marcadoresDoFuro(peca: PecaResolvida, e: EixosPlano, u: UsinagemResolvida): Marcador[] {
  const raio = u.diametro / 2;
  if (!usinagemSana(u) || !Number.isFinite(raio) || raio <= 0 || u.profundidade === 0) return [];
  const faces = u.profundidade < 0 ? [u.face, OPOSTA[u.face]!] : [u.face];
  const saida: Marcador[] = [];
  for (const face of faces) {
    const normal = normalDaFace(e, face);
    if (normal === null) continue;
    saida.push({ forma: 'disco', centro: pontoNaFace(peca, e, face, u.u, u.v), normal, raio, dimensoes: [0, 0, 0], altura: ALTURA_MARCADOR });
  }
  return saida;
}

/** Rasgo e recorte: caixa fina sobre a face; só fazem sentido nas faces `a`/`b` (bordas são só furo). */
function marcadoresDaCaixa(peca: PecaResolvida, e: EixosPlano, u: UsinagemResolvida): Marcador[] {
  if (!usinagemSana(u) || u.profundidade === 0) return [];
  if (u.face !== 'a' && u.face !== 'b') return [];
  const comp = u.comprimento;
  const larg = u.largura;
  if (!Number.isFinite(comp) || !Number.isFinite(larg) || comp <= 0 || larg <= 0) return [];
  const normal = normalDaFace(e, u.face);
  if (normal === null) return [];
  const dimensoes: Vetor3 = [0, 0, 0];
  dimensoes[e.u] = comp;
  dimensoes[e.v] = larg;
  dimensoes[e.t] = ALTURA_MARCADOR;
  return [{ forma: 'caixa', centro: pontoNaFace(peca, e, u.face, u.u + comp / 2, u.v + larg / 2), normal, raio: 0, dimensoes, altura: ALTURA_MARCADOR }];
}

/**
 * Marcadores das usinagens de uma peça (m, coordenadas locais da peça): furo → disco no diâmetro e posição sobre a
 * face (passante também na oposta); rasgo/recorte → caixa pelo comprimento e largura; tipos ou faces desconhecidos
 * e valores inválidos são ignorados sem lançar.
 */
export function marcadoresDaPeca(peca: PecaResolvida): Marcador[] {
  const e = eixosPlano(peca.eixo);
  if (e === null) return [];
  const saida: Marcador[] = [];
  for (const u of peca.usinagens) {
    if (u.tipo === 'furo') saida.push(...marcadoresDoFuro(peca, e, u));
    else if (u.tipo === 'rasgo' || u.tipo === 'recorte') saida.push(...marcadoresDaCaixa(peca, e, u));
  }
  return saida;
}

/** Marcadores visíveis? Somem no detalhe 'grosso' (o mais simples); na peça selecionada continuam. */
export function marcadoresVisiveis(detalhe: NivelDetalhe3d, pecaSelecionada: boolean): boolean {
  return detalhe !== 'grosso' || pecaSelecionada;
}
