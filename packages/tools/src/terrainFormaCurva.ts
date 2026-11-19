import { angleOf, dist, sub, type Vec2 } from '@hestia/geom';
import { TERRENO_LIMITES } from '@hestia/model';
import { lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import { detailShapeInputPrompt, detailShapePromptMsg, initDetailShapeStep, parseDetailShapeInput, skipCountInputs } from './detailLineToolShapes.ts';
import type { Lang } from './i18n.ts';
import { anchorOf, pointsOf, stepsOf, type ShapeStep } from './perimeterToolShape.ts';
import { discretizarNoTeto, flechaValida, polilinhaDaForma, splinePorPontos, type FormaDiscretizada, type Polilinha } from './terrainFormaGeom.ts';
import type { PreviewItem, ToolEnv, WallDrawShape } from './types.ts';

/** Forma da curva de nível na Topografia: as da galeria da Parede mais a spline por pontos. */
export type TerrainShape = WallDrawShape | 'spline';

/** O que um gesto de forma produz: nada (segue pedindo), a curva pronta (já discretizada) ou uma recusa com o motivo. */
export type ResultadoForma =
  | { kind: 'nada' }
  | { kind: 'pronta'; forma: FormaDiscretizada; reduzida: boolean }
  | { kind: 'recusa'; motivo: 'limite' | 'degenerada' };

/**
 * Desenho de curva de nível por FORMA (arco, círculo, elipse, retângulo, polígono, spline) para a Topografia e o "Editar terreno > Curva".
 * Estado puro, sem tocar o modelo: o dono da ferramenta recebe a polilinha pronta (discretizada com a flecha da barra de opções e dentro do
 * teto de vértices do terreno) e a grava como uma curva só, na cota do campo. A forma "Linha" não passa por aqui (segue o rascunho comum).
 */
export class DesenhoDeForma {
  private step: ShapeStep | null = null;
  private flags: Record<string, boolean> = {};
  private ativaId: TerrainShape | null = null;
  private controle: Vec2[] = [];

  constructor(private readonly env: ToolEnv, private readonly lang: () => Lang) {}

  /** Forma escolhida na galeria; trocar de forma descarta o que estava em curso. */
  forma(): TerrainShape {
    const s = (this.env.options().terrainShape ?? 'line') as TerrainShape;
    if (this.ativaId !== null && this.ativaId !== s) this.limpar();
    this.ativaId = s;
    return s;
  }

  /** Há forma diferente de "Linha" escolhida? */
  get ativa(): boolean {
    return this.forma() !== 'line';
  }

  get flecha(): number {
    return flechaValida(this.env.options().terrainFlecha);
  }

  limpar(): void {
    this.step = null;
    this.flags = {};
    this.controle = [];
  }

  get emCurso(): boolean {
    return this.controle.length > 0 || (this.step !== null && Object.keys(this.step.vals).some((k) => k !== 'sides'));
  }

  get pontosDeControle(): readonly Vec2[] {
    return this.controle;
  }

  /** Âncora da captura (Orto, Polar, medida digitada). O 2º canto do retângulo não tem âncora (cairia sobre o eixo). */
  ancora(): Vec2 | null {
    if (this.forma() === 'spline') return this.controle[this.controle.length - 1] ?? null;
    return this.forma() === 'rect' ? null : anchorOf(this.step);
  }

  private atual(): ShapeStep {
    const s = this.forma() as WallDrawShape;
    return this.step ?? initDetailShapeStep(s, this.env.options().terrainPolygonSides);
  }

  /** Mensagem de status do passo corrente. */
  mensagem(): string | null {
    return this.step ? detailShapePromptMsg(this.step, this.lang()) : null;
  }

  inputPrompt(lenLabel: string): string | null {
    if (this.forma() === 'spline') return this.controle.length > 0 ? lenLabel : null;
    return this.step ? detailShapeInputPrompt(this.step, this.lang(), lenLabel) : null;
  }

  /** Forma pronta: discretiza no teto (`capacidade` = vértices que ainda cabem); `reduzida` se a flecha subiu para caber. */
  private concluida(gerar: (flecha: number) => Polilinha | null, capacidade: number): ResultadoForma {
    const f = this.flecha;
    const r = discretizarNoTeto(gerar, f, Math.max(0, capacidade));
    if (!r) return { kind: 'recusa', motivo: gerar(f) ? 'limite' : 'degenerada' };
    return { kind: 'pronta', forma: r, reduzida: r.flecha > f * (1 + 1e-9) };
  }

  /** Clique: acrescenta um ponto de controle (spline) ou o valor da entrada corrente da forma. `tolFecha`: raio (m) para fechar a spline no 1º ponto. */
  click(q: Vec2, capacidade: number, tolFecha: number): ResultadoForma {
    const forma = this.forma();
    if (forma === 'spline') {
      if (this.controle.length >= 3 && dist(q, this.controle[0]!) <= tolFecha) return this.fecharSpline(capacidade);
      const ult = this.controle[this.controle.length - 1];
      if (ult && dist(ult, q) < 1e-6) return { kind: 'nada' };
      if (this.controle.length + 1 > capacidade) return { kind: 'recusa', motivo: 'limite' };
      this.controle.push(q);
      return { kind: 'nada' };
    }
    const st = this.step ?? (this.step = this.atual());
    const input = stepsOf(st.shape)[st.idx];
    if (!input) return { kind: 'nada' };
    const a = anchorOf(st);
    if (input.kind === 'point') {
      if (a && dist(q, a) < 1e-9) return { kind: 'nada' };
      return this.dar(st, input.key, q, capacidade);
    }
    if ((input.kind === 'length' || input.kind === 'angle') && a) {
      const v = input.kind === 'length' ? dist(q, a) : angleOf(sub(q, a));
      if (input.kind === 'length' && v < 1e-6) return { kind: 'nada' };
      return this.dar(st, input.key, v, capacidade);
    }
    return { kind: 'nada' };
  }

  private dar(st: ShapeStep, key: string, valor: unknown, capacidade: number): ResultadoForma {
    st.vals[key] = valor;
    st.idx += 1;
    skipCountInputs(st);
    if (st.idx < stepsOf(st.shape).length) return { kind: 'nada' };
    const r = this.concluida((f) => polilinhaDaForma(st.shape.id, st.vals, this.flags, f), capacidade);
    if (r.kind === 'recusa' && r.motivo === 'degenerada') {
      // Desfaz a última entrada: o usuário corrige só ela.
      const todos = stepsOf(st.shape);
      const ult = todos.filter((i) => i.kind !== 'count').pop()!;
      st.idx = todos.indexOf(ult);
      delete st.vals[ult.key];
    } else this.limpar();
    return r;
  }

  /** Valor digitado: comprimento (ponto na direção do cursor), raio, semieixo, ângulo ou lados. Null se não é tratado ou o texto é inválido. */
  digitado(text: string, cursor: Vec2, capacidade: number): ResultadoForma | null {
    if (this.forma() === 'spline') {
      const a = this.ancora();
      const v = a ? lerComprimentoDigitado(this.env, text) : null;
      if (!a || v === null) return null;
      this.controle.push(pontoPorComprimento(a, cursor, v));
      return { kind: 'nada' };
    }
    const st = this.step;
    if (!st) return null;
    const input = stepsOf(st.shape)[st.idx];
    if (!input) return null;
    if (input.kind === 'length' || input.kind === 'angle' || input.kind === 'count') {
      const v = parseDetailShapeInput(this.env, st, text, this.lang());
      return v === null ? null : this.dar(st, input.key, v, capacidade);
    }
    const a = anchorOf(st);
    if (input.kind !== 'point' || !a) return null;
    const v = lerComprimentoDigitado(this.env, text);
    return v === null ? null : this.dar(st, input.key, pontoPorComprimento(a, cursor, v), capacidade);
  }

  /** Enter: conclui a spline aberta (2 pontos ou mais). Nas outras formas não há o que concluir. */
  confirmar(capacidade: number): ResultadoForma {
    if (this.forma() !== 'spline' || this.controle.length < 2) return { kind: 'nada' };
    return this.fecharOuAbrir(false, capacidade);
  }

  /** C: conclui a spline fechada (3 pontos ou mais). */
  fecharSpline(capacidade: number): ResultadoForma {
    if (this.forma() !== 'spline' || this.controle.length < 3) return { kind: 'nada' };
    return this.fecharOuAbrir(true, capacidade);
  }

  private fecharOuAbrir(fechada: boolean, capacidade: number): ResultadoForma {
    const c = this.controle.slice();
    const r = this.concluida((f) => splinePorPontos(c, fechada, f), capacidade);
    if (r.kind === 'pronta') this.limpar();
    return r;
  }

  /** Prévia: pontos dados e, quando o cursor completa a forma, a forma discretizada (tracejada). */
  previa(cursor: Vec2 | null, capacidade: number): PreviewItem[] {
    const forma = this.forma();
    const cap = Math.max(2, Math.min(capacidade, TERRENO_LIMITES.vertices));
    const linhas = (p: Polilinha | null): PreviewItem[] => {
      if (!p) return [];
      const out: PreviewItem[] = [];
      for (let i = 1; i < p.pts.length; i++) out.push({ kind: 'line', a: p.pts[i - 1]!, b: p.pts[i]!, dashed: true });
      if (p.fechada && p.pts.length > 2) out.push({ kind: 'line', a: p.pts[p.pts.length - 1]!, b: p.pts[0]!, dashed: true });
      return out;
    };
    if (forma === 'spline') {
      const out: PreviewItem[] = this.controle.map((at) => ({ kind: 'point' as const, at }));
      const c = cursor ? [...this.controle, cursor] : this.controle.slice();
      const r = discretizarNoTeto((f) => splinePorPontos(c, false, f), this.flecha, cap);
      return [...out, ...linhas(r)];
    }
    const st = this.atual();
    const out: PreviewItem[] = pointsOf(this.step).map((at) => ({ kind: 'point' as const, at }));
    const input = stepsOf(st.shape)[st.idx];
    const a = anchorOf(this.step);
    if (!input || !cursor || (!a && input.kind !== 'point')) return out;
    let valor: unknown = null;
    if (input.kind === 'point') valor = cursor;
    else if (input.kind === 'length' && a) valor = dist(cursor, a);
    else if (input.kind === 'angle' && a) valor = angleOf(sub(cursor, a));
    const todos = stepsOf(st.shape);
    const ultimo = st.idx === todos.length - 1 || todos.slice(st.idx + 1).every((i) => i.kind === 'count');
    if (valor !== null && ultimo && this.step) {
      const vals = { ...st.vals, [input.key]: valor };
      out.push(...linhas(discretizarNoTeto((f) => polilinhaDaForma(st.shape.id, vals, this.flags, f), this.flecha, cap)));
    } else if (a) out.push({ kind: 'line', a, b: cursor, dashed: true });
    return out;
  }

  /** Tab alterna o sinalizador da forma (ex.: sentido anti-horário do arco centro-extremidades). Devolve o rótulo e o novo valor, ou null. */
  alternarFlag(): { key: string; value: boolean } | null {
    const forma = this.forma();
    if (forma === 'spline') return null;
    const flag = this.atual().shape.inputs.find((i) => i.kind === 'flag');
    if (!flag) return null;
    this.flags[flag.key] = !this.flags[flag.key];
    return { key: flag.label, value: this.flags[flag.key]! };
  }
}
