import { dist, type Vec2 } from '@hestia/geom';
import { TERRENO_LIMITES, type Terrain } from '@hestia/model';
import { ToolBase } from './base.ts';
import { contextoDeTraco, RascunhoPolilinha } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { gravarOps, opsCotado, opsRotulo, terrenoAlvo } from './terrainEditGestos.ts';
import type { PointerInfo } from './types.ts';

/**
 * Rótulo de curva (`terrainLabel`): DOIS cliques desenham uma linha; onde ela cruza curvas mestras o desenho do terreno escreve a cota. Grava
 * `linhasRotulo` do terreno (selecionado, ou o único do nível) com UM `editTerrainFontes` por linha (um desfazer). A linha é traçada pelo núcleo comum
 * de desenho (snaps, Orto, Polar, comprimento digitado). A ferramenta fica ativa para várias linhas; Esc sai.
 */
export class TerrainLabelTool extends ToolBase {
  readonly id = 'terrainLabel';
  readonly label = 'Rótulo de curva';
  private r = new RascunhoPolilinha();
  private ultimoCursor: Vec2 | null = null;

  override get hint(): string {
    return this.t(this.r.ativo ? 'tl_tn_label_hint2' : 'tl_tn_label_hint1');
  }

  protected reset(): void {
    this.r.limpar();
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.r.ativo;
  }

  private alvo(): Terrain | null {
    return terrenoAlvo(this.env.project(), this.env.selection(), this.env.levelId());
  }

  private atualizaPrevia(q: Vec2 | null): void {
    const a = this.r.ultimo;
    this.items = q ? [{ kind: 'point', at: q }, ...(a ? [{ kind: 'line' as const, a, b: q, dashed: true }] : [])] : [];
  }

  override move(p: PointerInfo): void {
    const q = this.snap(p, contextoDeTraco(this.r.ultimo)).point;
    this.ultimoCursor = q;
    this.atualizaPrevia(q);
  }

  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const a = this.r.ultimo;
    return a && this.ultimoCursor ? [segmentLengthDim(a, this.ultimoCursor)] : [];
  }

  override inputPrompt(): string | null {
    return this.r.ativo ? this.t('tl_inp_length') : null;
  }

  private ponto(q: Vec2): void {
    const tn = this.alvo();
    if (!tn) {
      this.env.say(this.t('tl_tn_label_sem_terreno'));
      return;
    }
    const a = this.r.ultimo;
    if (!a) {
      this.r.adicionar(q);
      this.env.say(this.hint);
      return;
    }
    if (dist(a, q) < 1e-6) return;
    if (tn.linhasRotulo.length / 4 >= TERRENO_LIMITES.linhasRotulo) {
      this.env.say(this.t('tl_tn_label_limite', { max: TERRENO_LIMITES.linhasRotulo }));
      this.r.limpar();
      return;
    }
    const ok = gravarOps(this.env, tn, opsRotulo(tn, a, q), this.t('tl_tn_undo_rotulo'), this.uiLang());
    this.r.limpar();
    if (ok) this.env.say(this.t('tl_tn_label_feito', { n: tn.linhasRotulo.length / 4 + 1 }));
  }

  override click(p: PointerInfo): void {
    const q = this.snap(p, contextoDeTraco(this.r.ultimo)).point;
    this.ponto(q);
    this.atualizaPrevia(q);
  }

  /** Comprimento digitado + Enter: o 2º ponto, na direção do cursor. */
  override type(text: string): boolean {
    const q = this.r.pontoDigitado(this.env, text, this.inf, this.raw);
    if (!q) return false;
    this.ponto(q);
    this.atualizaPrevia(null);
    return true;
  }

  override confirm(): void {
    this.env.say(this.hint);
  }

  /** Esc: cancela a linha em curso; sem linha, sai. */
  override cancel(): void {
    if (this.r.ativo) {
      this.reset();
      this.env.say(this.hint);
    } else this.env.done();
  }
}

/**
 * Cota de ponto (`terrainSpot`): UM clique marca um ponto cotado (`pontosCotados`); o desenho do terreno escreve ali a cota do terreno proposto.
 * Um `editTerrainFontes` por ponto (um desfazer). Fica ativa para vários pontos; Esc sai.
 */
export class TerrainSpotTool extends ToolBase {
  readonly id = 'terrainSpot';
  readonly label = 'Cota de ponto';

  override get hint(): string {
    return this.t('tl_tn_spot_hint');
  }

  protected reset(): void {
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return false;
  }

  override move(p: PointerInfo): void {
    this.items = [{ kind: 'point', at: this.snap(p).point }];
  }

  override click(p: PointerInfo): void {
    const q = this.snap(p).point;
    const tn = terrenoAlvo(this.env.project(), this.env.selection(), this.env.levelId());
    if (!tn) {
      this.env.say(this.t('tl_tn_label_sem_terreno'));
      return;
    }
    if (tn.pontosCotados.length / 2 >= TERRENO_LIMITES.pontosCotados) {
      this.env.say(this.t('tl_tn_spot_limite', { max: TERRENO_LIMITES.pontosCotados }));
      return;
    }
    if (gravarOps(this.env, tn, opsCotado(tn, q), this.t('tl_tn_undo_cotado'), this.uiLang())) this.env.say(this.t('tl_tn_spot_feito', { n: tn.pontosCotados.length / 2 + 1 }));
  }

  /** Sem passo pendente: Esc sai. */
  override cancel(): void {
    this.env.done();
  }
}
