import { dist, type Vec2 } from '@hestia/geom';
import { isLot, ladosPadrao, LOTE_LIMITES, lotIssue, makeLot, newId, normalizarLote, type Lot } from '@hestia/model';
import { ToolBase } from './base.ts';
import { contextoDeTraco, RascunhoPolilinha } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/**
 * Linhas de propriedade (A.6, ficha P3): desenha o polígono do LOTE pelo núcleo comum de desenho (snaps, Orto e Polar a partir do último
 * ponto, comprimento digitado + Enter, Enter ou C fecha, Esc cancela) e grava `addLot`. O lote é só de planta e prancha e não usa o kernel (D8).
 *
 * - Ao concluir, cada lado nasce `lateral` com recuo 0, exceto o PRIMEIRO lado desenhado, que nasce `frente`. O modelo normaliza o sentido
 *   (anti-horário) levando os lados junto, então o lado desenhado primeiro continua sendo a frente mesmo se o traçado foi horário.
 * - Modo "escolher ponto": o diálogo "Por tabela…" liga a ferramenta só para receber UM clique (o ponto inicial da tabela) e devolve o ponto
 *   por `escolherPonto`; nada é criado nesse modo.
 */
export class LotTool extends ToolBase {
  readonly id = 'lot';
  /** A tecla C (sem número digitado) fecha o contorno: o controlador a entrega a `type('c')`. */
  readonly fechaComC = true;
  readonly label = 'Linhas de propriedade';
  private r = new RascunhoPolilinha();
  private ultimoCursor: Vec2 | null = null;
  private escolha: { aoEscolher: (q: Vec2) => void; aoCancelar?: () => void } | null = null;

  override get hint(): string {
    return this.t(this.escolha ? 'tl_lt_hint_ponto_inicial' : 'tl_lt_hint');
  }

  /** Liga o modo "escolher ponto": o próximo clique chama `aoEscolher` com o ponto (com snap) e a ferramenta termina; Esc chama `aoCancelar`. */
  escolherPonto(aoEscolher: (q: Vec2) => void, aoCancelar?: () => void): void {
    this.r.limpar();
    this.escolha = { aoEscolher, ...(aoCancelar ? { aoCancelar } : {}) };
    this.env.say(this.hint);
  }

  /** Pontos do polígono em traçado (cópia). */
  pontosPendentes(): Vec2[] {
    return this.r.pts.map((q) => ({ ...q }));
  }

  protected reset(): void {
    this.r.limpar();
    this.ultimoCursor = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.r.ativo;
  }

  private captura(p: PointerInfo): Vec2 {
    return this.snap(p, contextoDeTraco(this.r.ultimo)).point;
  }

  private atualizaPrevia(q: Vec2 | null): void {
    const itens: PreviewItem[] = [];
    const pts = this.r.pts;
    if (pts.length >= 2) itens.push({ kind: 'polygon', ring: pts, dashed: true });
    const fim = this.r.ultimo;
    if (q && fim) itens.push({ kind: 'line', a: fim, b: q, dashed: true });
    if (q) itens.push({ kind: 'point', at: q });
    this.items = itens;
  }

  override move(p: PointerInfo): void {
    const q = this.captura(p);
    this.ultimoCursor = q;
    this.atualizaPrevia(q);
  }

  /** Cota dinâmica do trecho em traçado (mesmo provedor da parede). */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const fim = this.r.ultimo;
    return fim && this.ultimoCursor && !this.escolha ? [segmentLengthDim(fim, this.ultimoCursor)] : [];
  }

  override inputPrompt(): string | null {
    return this.r.ativo ? this.t('tl_inp_length') : null;
  }

  override click(p: PointerInfo): void {
    const q = this.captura(p);
    if (this.escolha) {
      const e = this.escolha;
      this.escolha = null;
      this.env.say(this.t('tl_lt_ponto_inicial'));
      this.env.done();
      e.aoEscolher(q);
      return;
    }
    if (this.r.pts.length >= 3 && dist(q, this.r.pts[0]!) <= 8 * this.env.metersPerPixel()) {
      this.concluir();
      return;
    }
    this.novoVertice(q);
    this.atualizaPrevia(q);
  }

  private novoVertice(q: Vec2): void {
    if (this.r.pts.length >= LOTE_LIMITES.pontos) {
      this.env.say(this.t('tl_lt_limite', { max: LOTE_LIMITES.pontos }));
      return;
    }
    if (this.r.adicionar(q)) this.env.say(this.t('tl_lt_ponto', { n: this.r.pts.length }));
  }

  /** `C` fecha o polígono (três pontos ou mais); comprimento digitado + Enter acrescenta um ponto na direção do cursor. */
  override type(text: string): boolean {
    if (this.escolha) return false;
    if (text.toLowerCase() === 'c' && this.r.pts.length >= 3) {
      this.concluir();
      return true;
    }
    const q = this.r.pontoDigitado(this.env, text, this.inf, this.raw);
    if (!q) return false;
    this.novoVertice(q);
    this.ultimoCursor = null;
    this.atualizaPrevia(null);
    return true;
  }

  /** Enter: fecha e cria o lote (três pontos ou mais). */
  override confirm(): void {
    if (this.r.ativo) this.concluir();
    else this.env.say(this.hint);
  }

  /** Esc: cancela o polígono em traçado (ou o modo "escolher ponto"); sem nada em curso, sai da ferramenta. */
  override cancel(): void {
    if (this.escolha) {
      const e = this.escolha;
      this.escolha = null;
      this.env.done();
      e.aoCancelar?.();
      return;
    }
    if (this.r.ativo) {
      this.reset();
      this.env.say(this.t('tl_lt_cancelado'));
    } else this.env.done();
  }

  private nomeNovo(): string {
    const n = Object.values(this.env.project().elements).filter(isLot).length;
    return `${this.t('tl_lt_nome')} ${n + 1}`;
  }

  private concluir(): void {
    if (this.r.pts.length < 3) {
      this.env.say(this.t('tl_lt_min'));
      return;
    }
    const lados = ladosPadrao(this.r.pts.length);
    lados[0] = { papel: 'frente', recuo: 0 };
    const n = normalizarLote(this.r.pts, lados);
    const lote = makeLot({ id: newId('lt'), levelId: this.env.levelId(), name: this.nomeNovo(), contorno: n.contorno, lados: n.lados });
    const problema = lotIssue({ ...lote, order: 0 } as Lot, this.uiLang());
    if (problema) {
      this.env.say(problema);
      return;
    }
    this.env.transaction(this.t('tl_lt_undo'), () => this.env.exec({ type: 'addLot', lot: lote }));
    this.reset();
    this.env.say(this.t('tl_lt_criado'));
    this.env.setSelection([lote.id]);
    this.env.done();
  }
}
