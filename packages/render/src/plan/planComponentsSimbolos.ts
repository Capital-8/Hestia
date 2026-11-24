import type { Vec2 } from '@hestia/geom';
import { resolverComponente, type DetalhePlanta, type PrimitivoResolvido, type SimboloResolvido } from '@hestia/engine';
import type { Component, NivelDetalhe, Project } from '@hestia/model';
import { pontoNoMundo } from './planComponentsGeo.ts';
import type { LabelOp, StrokeOp } from './types.ts';

/*
 * Símbolos 2D dos componentes na planta (ficha D2, CONTRATO §4). Os primitivos chegam em METROS no plano do símbolo (já
 * resolvidos por `resolverSimbolos`); aqui viram traços e textos no mundo. Arcos e círculos são discretizados com um número
 * fixo de pontos (determinístico). Texto: altura em metros de MODELO, convertida em papel com escala 1 (1 m = 1000 mm), de
 * modo que `paperMmToPx(fontMm, zoom, 1)` = altura × zoom: o texto acompanha o zoom como o resto do modelo.
 */

/** Pontos por círculo inteiro e por passo de arco (π/18 = 10°). Valores fixos: a saída não depende do zoom. */
const PONTOS_CIRCULO = 36;
const PASSO_ARCO_RAD = Math.PI / 18;

const RANGO_NIVEL: Record<NivelDetalhe, number> = { grosso: 0, medio: 1, fino: 2 };
const RANGO_PLANTA: Record<DetalhePlanta, number> = { coarse: 0, medium: 1, fine: 2 };

/**
 * O símbolo aparece no nível de detalhe? Sem `detalhe` vale sempre; senão, o mesmo critério da silhueta dos corpos (B3):
 * aparece quando o menor nível listado não passa do nível da planta.
 */
export function simboloNoDetalhe(detalhe: readonly NivelDetalhe[] | undefined, nivel: DetalhePlanta): boolean {
  if (detalhe === undefined || detalhe.length === 0) return true;
  return Math.min(...detalhe.map((n) => RANGO_NIVEL[n])) <= RANGO_PLANTA[nivel];
}

/** `detalhe` do símbolo na família original (o resolvido não o carrega); `undefined` quando o símbolo não existe mais. */
export function detalheDoSimbolo(p: Project, c: Component, id: string): NivelDetalhe[] | undefined {
  return p.componentFamilies?.[c.familyId]?.simbolos?.find((s) => s.id === id)?.detalhe;
}

/** Resultado da conversão de um símbolo para o desenho: traços fechados ou abertos e textos, em coordenadas do destino. */
export interface GeometriaSimbolo {
  strokes: Array<{ pts: Vec2[]; closed: boolean }>;
  textos: Array<{ at: Vec2; texto: string; altura: number }>;
}

/** Discretiza um arco entre dois ângulos (rad) em pontos locais; a quantidade depende só do ângulo varrido. */
function pontosDoArco(cx: number, cy: number, raio: number, ini: number, fim: number): Vec2[] {
  const varrido = Math.abs(fim - ini);
  const passos = Math.max(1, Math.ceil(varrido / PASSO_ARCO_RAD));
  const pts: Vec2[] = [];
  for (let i = 0; i <= passos; i++) {
    const a = ini + ((fim - ini) * i) / passos;
    pts.push({ x: cx + raio * Math.cos(a), y: cy + raio * Math.sin(a) });
  }
  return pts;
}

/**
 * Converte os primitivos de um símbolo. `paraDestino(u, v)` leva um ponto LOCAL do símbolo (m, no seu plano) ao destino
 * (planta: mundo do componente; corte: (t, z)). Como a conversão é aplicada ponto a ponto, espelho e rotação valem nos arcos.
 */
export function geometriaDoSimbolo(simbolo: SimboloResolvido, paraDestino: (u: number, v: number) => Vec2): GeometriaSimbolo {
  const saida: GeometriaSimbolo = { strokes: [], textos: [] };
  const aplicar = (pts: Array<[number, number]>): Vec2[] => pts.map(([u, v]) => paraDestino(u, v));
  for (const prim of simbolo.primitivos) {
    aplicarPrimitivo(prim, saida, aplicar);
  }
  return saida;
}

function aplicarPrimitivo(prim: PrimitivoResolvido, saida: GeometriaSimbolo, aplicar: (pts: Array<[number, number]>) => Vec2[]): void {
  switch (prim.tipo) {
    case 'linha':
      saida.strokes.push({ pts: aplicar([prim.de, prim.ate]), closed: false });
      return;
    case 'polilinha':
      saida.strokes.push({ pts: aplicar(prim.pontos), closed: prim.fechada });
      return;
    case 'circulo': {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < PONTOS_CIRCULO; i++) {
        const a = (2 * Math.PI * i) / PONTOS_CIRCULO;
        pts.push([prim.centro[0] + prim.raio * Math.cos(a), prim.centro[1] + prim.raio * Math.sin(a)]);
      }
      saida.strokes.push({ pts: aplicar(pts), closed: true });
      return;
    }
    case 'arco': {
      const locais = pontosDoArco(prim.centro[0], prim.centro[1], prim.raio, prim.inicioRad, prim.fimRad);
      saida.strokes.push({ pts: aplicar(locais.map((q) => [q.x, q.y])), closed: false });
      return;
    }
    case 'texto': {
      const [at] = aplicar([prim.posicao]);
      if (at) saida.textos.push({ at, texto: prim.texto, altura: prim.altura });
      return;
    }
  }
}

/** Rótulo de planta de um texto de símbolo: `papel` com escala 1 e corpo em mm = altura (m) × 1000. */
export function rotuloDeTexto(at: Vec2, texto: string, altura: number, cor: string, rotacao: number): LabelOp {
  return { at, text: texto, color: cor, rotation: rotacao, papel: { escala: 1, fontMm: Math.max(altura, 0) * 1000 } };
}

/** Símbolos da planta de um componente: traços e textos já no mundo, e se algum deles substitui a geometria automática. */
export interface SimbolosDePlanta {
  strokes: StrokeOp[];
  labels: LabelOp[];
  substituiGeometria: boolean;
}

/**
 * Símbolos de planta (`vistas` com `planta` e `plano: xy`) que valem para este detalhe. Acompanham a instância: rotação Z e
 * espelho entram por `pontoNoMundo`. Sem símbolos, devolve listas vazias e `substituiGeometria: false`.
 */
export function simbolosDePlanta(p: Project, c: Component, cor: string, detalhe: DetalhePlanta): SimbolosDePlanta {
  const res = resolverComponente(p, c);
  const visiveis = (res.simbolos ?? []).filter(
    (s) => s.vistas.includes('planta') && s.plano === 'xy' && simboloNoDetalhe(detalheDoSimbolo(p, c, s.id), detalhe),
  );
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];
  const rotacaoGraus = (c.rotation * 180) / Math.PI;
  for (const s of visiveis) {
    const g = geometriaDoSimbolo(s, (u, v) => pontoNoMundo(c, u, v));
    for (const traco of g.strokes) strokes.push({ pts: traco.pts, closed: traco.closed, widthPx: 1, color: cor, alpha: 1 });
    for (const t of g.textos) labels.push(rotuloDeTexto(t.at, t.texto, t.altura, cor, rotacaoGraus));
  }
  return { strokes, labels, substituiGeometria: visiveis.some((s) => s.substituiGeometria) };
}
