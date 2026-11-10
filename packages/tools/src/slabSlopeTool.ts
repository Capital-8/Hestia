import { dist, type Vec2 } from '@hestia/geom';
import { isSlab, type Slab } from '@hestia/model';
import { ToolBase } from './base.ts';
import { contextoDeTraco, lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { unitsOf } from '@hestia/model';
import { parseQuantityText } from './numeric.ts';
import { selectedSlabs } from './slabPick.ts';
import { fmtPercent, slopeArrowLength, slopeError, slopeFrom, slopePreview } from './slabSlope.ts';
import type { PointerInfo } from './types.ts';

/**
 * Definir inclinação da laje selecionada (Revit: Slope arrow). 1º clique = origem da linha de caimento; 2º clique =
 * direção. Depois, o percentual: Enter aplica o da barra de opções, ou digite outro valor e Enter. A ferramenta só
 * emite `updateElements` com o campo `slope`.
 */
export class SlopeTool extends ToolBase {
  readonly id = 'slope';
  readonly label = 'Inclinação';
  override get hint(): string {
    return this.t('tl_hint_slab_slope');
  }
  private origin: Vec2 | null = null;
  private dirPt: Vec2 | null = null;

  override start(): void {
    this.reset();
    this.env.say(this.target() ? this.hint : 'Selecione uma laje primeiro e escolha Inclinação de novo.');
  }

  protected reset(): void {
    this.origin = null;
    this.dirPt = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.origin !== null;
  }

  /** A única laje selecionada (a inclinação é de uma laje por vez). */
  private target(): Slab | null {
    const p = this.env.project();
    const ids = selectedSlabs(p, this.env.selection());
    if (ids.length !== 1) return null;
    const s = p.elements[ids[0]!];
    return isSlab(s) ? s : null;
  }

  private percent(): number {
    return this.env.options().slabSlopePercent;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.items = [];
    const s = this.target();
    if (!s) return;
    const inf = this.snap(p, contextoDeTraco(this.origin, { extraPoints: s.boundary }));
    this.items.push({ kind: 'highlight', ids: [s.id] });
    if (this.origin && this.dirPt) {
      const slope = slopeFrom(this.origin, this.dirPt, this.percent());
      if (slope) this.items.push(...slopePreview(slope, slopeArrowLength(s.boundary), unitsOf(this.env.project())));
      return;
    }
    if (this.origin) this.items.push({ kind: 'line', a: this.origin, b: inf.point, dashed: true });
    else this.items.push({ kind: 'point', at: inf.point });
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const s = this.target();
    if (!s) {
      this.env.say('Selecione uma laje primeiro.');
      return;
    }
    if (this.dirPt) {
      this.env.say(`Enter aplica ${fmtPercent(unitsOf(this.env.project()), this.percent())}; ou digite outro percentual e Enter.`);
      return;
    }
    const inf = this.snap(p, contextoDeTraco(this.origin, { extraPoints: s.boundary }));
    if (!this.origin) {
      this.origin = inf.point;
      this.env.say('Agora clique na direção do caimento.');
      return;
    }
    if (dist(inf.point, this.origin) < 1e-6) {
      this.env.say('Direção inválida: clique em outro ponto.');
      return;
    }
    this.dirPt = inf.point;
    this.env.say(`Percentual: Enter aplica ${fmtPercent(unitsOf(this.env.project()), this.percent())}; ou digite outro valor e Enter.`);
  }

  override inputPrompt(): string | null {
    if (this.dirPt) return this.t('tl_inp_percent');
    return this.origin ? this.t('tl_inp_length') : null;
  }

  /** Cota dinâmica do trecho origem-cursor (mesmo provedor da parede). */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const c = this.inf?.point;
    return this.origin && !this.dirPt && c && dist(this.origin, c) > 1e-6 ? [segmentLengthDim(this.origin, c)] : [];
  }

  override type(text: string): boolean {
    if (this.origin && !this.dirPt) {
      // Comprimento digitado: a direção do caimento fica a essa distância da origem, na direção do cursor (Orto/Polar valem).
      const v = lerComprimentoDigitado(this.env, text);
      if (v === null) return false;
      this.dirPt = pontoPorComprimento(this.origin, this.inf?.point ?? this.raw, v);
      this.env.say(`Percentual: Enter aplica ${fmtPercent(unitsOf(this.env.project()), this.percent())}; ou digite outro valor e Enter.`);
      return true;
    }
    if (!this.dirPt) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'slope');
    if (v === null) {
      this.env.say('Valor inválido. Digite o percentual (ex.: 2,5).');
      return false;
    }
    return this.apply(v * 100);
  }

  override confirm(): void {
    if (this.dirPt) {
      this.apply(this.percent());
      return;
    }
    super.confirm();
  }

  /** Grava a inclinação na laje selecionada, em um passo de desfazer. */
  private apply(percent: number): boolean {
    const s = this.target();
    if (!s || !this.origin || !this.dirPt) return false;
    const err = slopeError(percent);
    if (err) {
      this.env.say(err);
      return false;
    }
    const slope = slopeFrom(this.origin, this.dirPt, percent);
    if (!slope) {
      this.env.say('Direção inválida: clique em outro ponto.');
      return false;
    }
    this.env.exec({ type: 'updateElements', ids: [s.id], patch: { slope } });
    this.reset();
    this.env.say(this.t('tl_msg_slope_set', { pct: fmtPercent(unitsOf(this.env.project()), percent) }));
    return true;
  }
}
