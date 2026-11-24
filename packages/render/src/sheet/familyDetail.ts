import { detalharFamilia, quadroDeDetalhe, tabelaDaFamilia, type QuadroDetalhe, type SimboloResolvido } from '@hestia/engine';
import { viewportAnchor, type Component, type Familia, type Project, type SheetViewport } from '@hestia/model';
import { emptyParts, type SheetPoint, type ViewportParts } from './types.ts';

/*
 * Detalhe de uma instância de família como vista da prancha (ficha D6b). A instância (`componentId`) e o detalhe
 * (`detailId`) vêm do projeto; tipo e valores são os da instância, então mudar a instância atualiza o quadro (o cache
 * da prancha invalida pela assinatura do modelo). O desenho (laços, cotas e símbolos 2D) fica centrado na âncora da
 * caixa, acima da tabela de dimensões. Nunca lança: instância ou detalhe inexistente vira um quadro com aviso.
 */

const TINTA = '#16181c';
const CINZA = '#8a929c';
/** Espessuras (mm de papel). */
const TRACO_CORTE = 0.35;
const TRACO_CONTORNO = 0.25;
const TRACO_COTA = 0.13;
/** Altura do texto da tabela e da linha da tabela (mm de papel). */
const TEXTO_TABELA = 2.2;
const LINHA_TABELA = 3.6;
/** Máximo de linhas de tabela mostradas (limite de laço). */
const MAX_LINHAS_TABELA = 30;
/** Folga entre o desenho e a tabela (mm de papel). */
const FOLGA = 4;
/** Segmentos de um círculo ou arco de símbolo. */
const SEGMENTOS = 48;

export type FamilyDetailSource = Extract<SheetViewport['view'], { kind: 'familyDetail' }>;

interface Alvo {
  componente: Component;
  familia: Familia;
}

function alvoDe(p: Project, view: FamilyDetailSource): Alvo | null {
  const el = p.elements[view.componentId];
  if (el?.kind !== 'component') return null;
  const familia = p.componentFamilies?.[el.familyId];
  if (!familia || !(familia.detalhes ?? []).some((d) => d.id === view.detailId)) return null;
  return { componente: el, familia };
}

/** Tabelas da família (grade de texto) para a instância; vazias são descartadas. */
function tabelasDaInstancia(a: Alvo): string[][][] {
  const tipos = a.familia.tipos ?? [];
  const doTipo = tipos.find((t) => t.id === (a.componente.typeId ?? a.familia.tipoPadrao))?.valores ?? {};
  const valores = { ...doTipo, ...(a.componente.values ?? {}) };
  return (a.familia.tabelas ?? []).map((t) => tabelaDaFamilia(a.familia, t.id, tipos, valores)).filter((g) => g.length > 0);
}

interface Caixa {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Pontos de um primitivo 2D (m); círculo e arco entram pela caixa do círculo. */
function primitivoPontos(pr: SimboloResolvido['primitivos'][number]): [number, number][] {
  switch (pr.tipo) {
    case 'linha':
      return [pr.de, pr.ate];
    case 'polilinha':
      return pr.pontos;
    case 'texto':
      return [pr.posicao];
    case 'circulo':
    case 'arco':
      return [[pr.centro[0] - pr.raio, pr.centro[1] - pr.raio], [pr.centro[0] + pr.raio, pr.centro[1] + pr.raio]];
  }
}

function caixaDoQuadro(q: QuadroDetalhe, simbolos: readonly SimboloResolvido[], fator: number): Caixa | null {
  const c: Caixa = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    c.minX = Math.min(c.minX, x);
    c.minY = Math.min(c.minY, y);
    c.maxX = Math.max(c.maxX, x);
    c.maxY = Math.max(c.maxY, y);
  };
  for (const l of q.linhas) for (const pt of l.pontos) add(pt.x, pt.y);
  for (const t of q.textos) add(t.posicao.x, t.posicao.y);
  for (const s of simbolos) for (const pr of s.primitivos) for (const [u, v] of primitivoPontos(pr)) add(u * fator, v * fator);
  return Number.isFinite(c.minX) ? c : null;
}

function desenharSimbolos(out: ViewportParts, simbolos: readonly SimboloResolvido[], origem: SheetPoint, fator: number): void {
  const mv = (u: number, v: number): SheetPoint => ({ x: origem.x + u * fator, y: origem.y + v * fator });
  for (const s of simbolos) {
    for (const pr of s.primitivos) {
      if (pr.tipo === 'linha') out.paths.push({ pts: [mv(...pr.de), mv(...pr.ate)], closed: false, widthMm: TRACO_CONTORNO, color: TINTA });
      else if (pr.tipo === 'polilinha') out.paths.push({ pts: pr.pontos.map(([u, v]) => mv(u, v)), closed: pr.fechada, widthMm: TRACO_CONTORNO, color: TINTA });
      else if (pr.tipo === 'texto') out.texts.push({ at: mv(...pr.posicao), text: pr.texto, sizeMm: 2.5, rotation: 0, center: true, color: TINTA });
      else {
        const ini = pr.tipo === 'arco' ? pr.inicioRad : 0;
        const fim = pr.tipo === 'arco' ? pr.fimRad : Math.PI * 2;
        const pts: SheetPoint[] = [];
        for (let i = 0; i <= SEGMENTOS; i++) {
          const ang = ini + ((fim - ini) * i) / SEGMENTOS;
          pts.push(mv(pr.centro[0] + pr.raio * Math.cos(ang), pr.centro[1] + pr.raio * Math.sin(ang)));
        }
        out.paths.push({ pts, closed: pr.tipo === 'circulo', widthMm: TRACO_CONTORNO, color: TINTA });
      }
    }
  }
}

/** Texto de aviso centrado na âncora da caixa. */
function aviso(vp: SheetViewport, texto: string): ViewportParts {
  const out = emptyParts();
  const a = viewportAnchor(vp);
  out.texts.push({ at: { x: a.x, y: a.y }, text: texto, sizeMm: 2.5, rotation: 0, center: true, color: CINZA });
  return out;
}

function desenharTabela(out: ViewportParts, grades: readonly string[][][], x0: number, yTopo: number, largura: number): void {
  let y = yTopo;
  let usadas = 0;
  for (const grade of grades) {
    const nCol = Math.max(1, ...grade.map((l) => l.length));
    const w = largura / nCol;
    for (const [i, linha] of grade.entries()) {
      if (usadas++ >= MAX_LINHAS_TABELA) return;
      linha.forEach((cel, j) => out.texts.push({ at: { x: x0 + j * w + 1, y: y - LINHA_TABELA * 0.7 }, text: cel, sizeMm: TEXTO_TABELA, rotation: 0, center: false, color: i === 0 ? CINZA : TINTA }));
      y -= LINHA_TABELA;
      out.paths.push({ pts: [{ x: x0, y }, { x: x0 + largura, y }], closed: false, widthMm: 0.1, color: CINZA });
    }
    y -= FOLGA / 2;
  }
}

function alturaDaTabela(grades: readonly string[][][]): number {
  const linhas = Math.min(MAX_LINHAS_TABELA, grades.reduce((n, g) => n + g.length, 0));
  return linhas > 0 ? linhas * LINHA_TABELA + FOLGA * 2 : 0;
}

/** Tamanho do conteúdo (mm de papel) do detalhe na escala dada, com a tabela embaixo; null se não resolve. */
export function familyDetailContentMm(p: Project, view: FamilyDetailSource, scale: number): { w: number; h: number } | null {
  const a = alvoDe(p, view);
  if (!a) return null;
  const res = detalharFamilia(a.familia, a.componente.typeId ?? undefined, a.componente.values ?? {}, view.detailId);
  if (!res) return null;
  const caixa = caixaDoQuadro(quadroDeDetalhe(res, scale), res.simbolos, 1000 / scale);
  const grades = tabelasDaInstancia(a);
  const colunas = Math.max(0, ...grades.flatMap((g) => g.map((l) => l.length)));
  return { w: Math.max(caixa ? caixa.maxX - caixa.minX : 0, colunas * 22) + 16, h: (caixa ? caixa.maxY - caixa.minY : 0) + alturaDaTabela(grades) + 16 };
}

/** Partes do viewport de detalhe de família, em mm de papel (caixa em `vp.at`, âncora em `viewportAnchor`). */
export function familyDetailPartsOf(p: Project, vp: SheetViewport): ViewportParts {
  if (vp.view.kind !== 'familyDetail') return emptyParts();
  const view = vp.view;
  const a = alvoDe(p, view);
  const res = a ? detalharFamilia(a.familia, a.componente.typeId ?? undefined, a.componente.values ?? {}, view.detailId) : null;
  if (!a || !res) return aviso(vp, 'Detalhe inexistente');
  const fator = 1000 / vp.scale;
  const caixa = caixaDoQuadro(quadroDeDetalhe(res, vp.scale), res.simbolos, fator);
  if (!caixa) return aviso(vp, res.nome);

  const grades = tabelasDaInstancia(a);
  const hTab = alturaDaTabela(grades);
  // Desenho centrado na âncora, na parte de cima; a tabela fica abaixo dele, alinhada à esquerda da caixa.
  const ancora = viewportAnchor(vp);
  const origem: SheetPoint = { x: ancora.x - (caixa.minX + caixa.maxX) / 2, y: ancora.y - (caixa.minY + caixa.maxY) / 2 + hTab / 2 };
  const q = quadroDeDetalhe(res, vp.scale, origem);

  const out = emptyParts();
  for (const l of q.linhas) {
    const largura = l.tipo === 'corte' ? TRACO_CORTE : l.tipo === 'contorno' ? TRACO_CONTORNO : TRACO_COTA;
    out.paths.push({ pts: l.pontos, closed: l.fechada, widthMm: largura, color: TINTA });
  }
  for (const t of q.textos) out.texts.push({ at: t.posicao, text: t.texto, sizeMm: t.alturaMm, rotation: 0, center: true, color: TINTA });
  desenharSimbolos(out, res.simbolos, origem, fator);
  if (hTab > 0) desenharTabela(out, grades, vp.at.x + 3, origem.y + caixa.minY - FOLGA, vp.size.w - 6);
  return out;
}
