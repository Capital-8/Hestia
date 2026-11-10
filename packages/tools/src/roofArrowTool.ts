import { add, dot, len, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { isRoof, unitsOf, type Roof, type RoofPlaneDef } from '@hestia/model';
import { ToolBase } from './base.ts';
import { contextoDeTraco, lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { commitRoofPatch } from './roofCheck.ts';
import { roofSlopeError } from './roofGeom.ts';
import { lowestVertex } from './roofEdges.ts';
import { planeIndexAt, roofToFreePatch } from './roofFreeConvert.ts';
import { fmtPercent } from './slabSlope.ts';
import type { PointerInfo } from './types.ts';



/**
 * Seta de inclinação (A5, Revit: águas livres). Com um telhado de qualquer forma selecionado, dois cliques definem uma
 * água: o primeiro fixa a linha de beiral (perpendicular à subida, no lado mais baixo da água) e o segundo, a direção de
 * subida; a inclinação vem da barra de opções. Se o telhado ainda não é de águas livres, a primeira seta o converte
 * (as águas atuais viram planos, `roofToFreePatch`) na mesma alteração, então um Ctrl+Z desfaz tudo. A água que contém
 * o primeiro clique é alterada (nova subida, inclinação e beiral); fora de toda água, uma nova água cobre o contorno.
 */
export class RoofArrowTool extends ToolBase {
  readonly id = 'roofarrow';
  readonly label = 'Seta de inclinação';
  override get hint(): string {
    return this.t('tl_hint_roof_arrow');
  }
  private first: Vec2 | null = null;

  /** Telhado selecionado, se for o único selecionado. */
  private roof(): Roof | null {
    const sel = this.env.selection();
    if (sel.length !== 1) return null;
    const r = this.env.project().elements[sel[0]!];
    return isRoof(r) ? r : null;
  }

  /** Mensagem para o estado da seleção: o que falta para a seta funcionar. */
  private stateHint(): string {
    const r = this.roof();
    if (!r) return this.t('tl_msg_roof_arrow_select');
    if (r.shape !== 'free') return this.t('tl_msg_roof_arrow_free');
    return this.t('tl_hint_roof_arrow');
  }

  override start(): void {
    this.reset();
    this.env.say(this.stateHint());
  }

  /** O primeiro Esc cancela só o passo em andamento; sem passo, o Esc sai da ferramenta (ToolBase.cancel). */
  override cancel(): void {
    if (this.busy()) {
      this.reset();
      this.env.say('Passo cancelado. Esc de novo sai da ferramenta.');
      return;
    }
    super.cancel();
  }

  protected reset(): void {
    this.first = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.first !== null;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.items = [];
    const inf = this.snap(p, contextoDeTraco(this.first));
    if (!this.first) {
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    const up = this.upOf(inf.point);
    if (!up) return;
    this.items.push({ kind: 'line', a: this.first, b: inf.point });
    const r = this.roof();
    if (r) this.items.push({ kind: 'polygon', ring: r.boundary, dashed: true });
    this.items.push({ kind: 'label', at: inf.point, text: fmtPercent(unitsOf(this.env.project()), this.env.options().roofSlope ?? 30) });
  }

  /** Direção de subida unitária do primeiro clique até `q`, ou null quando os pontos coincidem. */
  private upOf(q: Vec2): Vec2 | null {
    if (!this.first) return null;
    const d = sub(q, this.first);
    return len(d) < 0.01 ? null : norm(d);
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const r = this.roof();
    if (!r) {
      this.env.say(this.stateHint());
      return;
    }
    const inf = this.snap(p, contextoDeTraco(this.first));
    if (!this.first) {
      this.first = inf.point;
      this.env.say('Agora clique no ponto para onde a água sobe.');
      return;
    }
    this.commit(r, inf.point);
  }

  /** Cota dinâmica do comprimento da seta (mesmo provedor da parede). */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const c = this.inf?.point;
    return this.first && c && len(sub(c, this.first)) > 1e-6 ? [segmentLengthDim(this.first, c)] : [];
  }

  override inputPrompt(): string | null {
    return this.first ? this.t('tl_inp_length') : null;
  }

  /** Comprimento digitado + Enter: define a direção de subida a essa distância do 1º clique, na direção do cursor. */
  override type(text: string): boolean {
    const r = this.roof();
    if (!r || !this.first) return false;
    const v = lerComprimentoDigitado(this.env, text);
    if (v === null) return false;
    this.commit(r, pontoPorComprimento(this.first, this.inf?.point ?? this.raw, v));
    return true;
  }

  /**
   * Define a água: altera a que contém o primeiro clique (nova subida, inclinação e beiral; a cota mais baixa da água é
   * mantida) ou, fora de toda água, acrescenta uma água sobre o contorno. Telhado que não é livre é convertido antes,
   * na mesma alteração.
   */
  private commit(r: Roof, to: Vec2): void {
    const up = this.upOf(to);
    if (!up || !this.first) {
      this.env.say(this.t('tl_msg_roof_dir_zero'));
      return;
    }
    const slope = this.env.options().roofSlope ?? 30;
    const err = roofSlopeError(slope);
    if (err) {
      this.env.say(err);
      return;
    }
    const convert = r.shape === 'free' ? {} : roofToFreePatch(r, slope);
    const boundary = convert.boundary ?? r.boundary;
    const planes = [...(convert.planes ?? r.planes)];
    const centroid = { x: boundary.reduce((s, q) => s + q.x, 0) / boundary.length, y: boundary.reduce((s, q) => s + q.y, 0) / boundary.length };
    const k = planeIndexAt(planes, this.first, centroid);
    const place = (ring: Vec2[]): Vec2 => {
      // A origem fica na reta de beiral: o vértice mais baixo na subida, na mesma posição transversal do primeiro clique.
      const low = lowestVertex(ring, up);
      return add(this.first!, mul(up, dot(low, up) - dot(this.first!, up)));
    };
    if (k >= 0) {
      const old = planes[k]!;
      const base = Math.min(...old.polygon.map((q) => old.z0 + (old.percent / 100) * dot(sub(q, old.origin), old.up)));
      planes[k] = { polygon: old.polygon, origin: place(old.polygon), up, percent: slope, z0: base } satisfies RoofPlaneDef;
    } else {
      planes.push({ polygon: boundary, origin: place(boundary), up, percent: slope, z0: 0 });
    }
    const patch: Partial<Roof> = { ...convert, planes };
    const was = r.shape === 'free' ? '' : ' O telhado virou de águas livres.';
    const verb = k >= 0 ? `Água ${k + 1} alterada` : 'Água adicionada';
    if (commitRoofPatch(this.env, [r.id], patch, this.env.lang?.() ?? 'pt')) this.env.say(`${verb} com inclinação de ${fmtPercent(unitsOf(this.env.project()), slope)}.${was} Ctrl+Z desfaz.`);
    this.reset();
  }
}
