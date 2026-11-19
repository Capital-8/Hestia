import { dist, type Vec2 } from '@hestia/geom';
import { aplicarOpsFontes, cotaDoProjeto, cotaExibida, defaultTerrainTypeIdOf, formatQuantity, isTerrain, isTerrainRegion, makeTerrain, newId, TERRENO_LIMITES, terrainIssue, unitsOf, type Id, type Terrain } from '@hestia/model';
import { ToolBase } from './base.ts';
import { shapeInputLabel } from './sketchShapes.ts';
import { contextoDeTraco, RascunhoPolilinha } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { DesenhoDeForma, type ResultadoForma } from './terrainFormaCurva.ts';
import { cabeMais, curvaDoRascunho, fontesVazias, opsAcrescentar, opSubstituir, previaDasFontes, semFontes, verticesDasFontes, type FontesPendentes } from './terrainToolCurva.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/** Modos da ferramenta Topografia: pontos soltos ou curvas de nível desenhadas. */
export type ModoTopografia = 'pontos' | 'curvas';

/** Valores padrão dos campos "Cota" (z do projeto, m: exibida, é a altitude da cota zero) e "Passo" (m) da barra de opções. */
export const COTA_PADRAO = 0;
export const PASSO_PADRAO = 1;

/**
 * Topografia (A.6): escreve as FONTES do terreno (pontos e curvas de nível, dado do modelo) e nunca geometria derivada.
 *
 * - Modo `pontos`: cada clique coloca um ponto na cota do campo "Cota".
 * - Modo `curvas`: polilinha pelo núcleo comum de desenho (snaps, Orto, Polar, comprimento digitado, C fecha), todos os vértices na
 *   cota do campo. Enter conclui a curva e a cota avança pelo "Passo".
 * - Enter sem curva em curso cria o terreno (`addTerrain` + `editTerrainFontes`) ou acrescenta as fontes ao terreno selecionado.
 * - Esc cancela a curva em curso; de novo, descarta as fontes pendentes; de novo, sai.
 *
 * A "Cota" e o "Passo" são estado da ferramenta (a barra de opções é da ficha U1). A cota digitada vale como a EXIBIDA
 * (`z + localizacao.cotaZero`) e passa por `cotaDoProjeto`; por dentro a ferramenta guarda o z do projeto.
 */
export class TerrainTool extends ToolBase {
  readonly id = 'terrain';
  readonly label = 'Topografia';
  private modo: ModoTopografia = 'pontos';
  /** z do projeto da cota corrente. */
  private cotaZ = COTA_PADRAO;
  private passoV = PASSO_PADRAO;
  private fontes: FontesPendentes = semFontes();
  private r = new RascunhoPolilinha();
  /** Curvas por forma (arco, círculo, elipse, retângulo, polígono, spline): vale no modo `curvas` com forma diferente de "Linha". */
  private forma = new DesenhoDeForma(this.env, () => this.uiLang());
  private ultimoPt: Vec2 | null = null;

  override get hint(): string {
    const args = { cota: this.fmtCota(this.cotaZ), passo: this.fmtLen(this.passoV), flecha: this.fmtLen(this.forma.flecha) };
    if (this.modo === 'curvas' && this.forma.ativa) return this.t(this.forma.forma() === 'spline' ? 'tl_tn_hint_spline' : 'tl_tn_hint_forma', args);
    return this.t(this.modo === 'pontos' ? 'tl_tn_hint_pontos' : 'tl_tn_hint_curvas', args);
  }

  // ---- estado da barra de opções (ficha U1) ------------------------------------------------------------------------------

  get modoAtual(): ModoTopografia {
    return this.modo;
  }

  /** Muda o modo; a curva em traçado é descartada (as fontes já concluídas ficam). */
  definirModo(m: ModoTopografia): void {
    if (m === this.modo) return;
    this.modo = m;
    this.r.limpar();
    this.forma.limpar();
    this.items = [];
    this.env.say(this.hint);
  }

  /** Cota do campo "Cota", como o usuário a vê (z do projeto mais a altitude da cota zero). */
  get cotaDoCampo(): number {
    return cotaExibida(this.env.project(), this.cotaZ);
  }

  /** z do projeto da cota corrente (é o z gravado nas fontes). */
  get cotaDoModelo(): number {
    return this.cotaZ;
  }

  /** Valor digitado no campo "Cota" (exibido): passa por `cotaDoProjeto`. Falso, sem mudar nada, se não for um número dentro do limite. */
  definirCotaDoCampo(valor: number): boolean {
    const z = cotaDoProjeto(this.env.project(), valor);
    if (!Number.isFinite(z) || Math.abs(z) > TERRENO_LIMITES.cotaMax) {
      this.env.say(this.t('tl_tn_msg_cota_invalida'));
      return false;
    }
    this.cotaZ = z;
    return true;
  }

  get passo(): number {
    return this.passoV;
  }

  /** Passo que a cota avança a cada curva concluída (pode ser negativo, para descer). Zero ou não numérico é recusado. */
  definirPasso(valor: number): boolean {
    if (!Number.isFinite(valor) || valor === 0 || Math.abs(valor) > TERRENO_LIMITES.cotaMax) {
      this.env.say(this.t('tl_tn_msg_passo_invalido'));
      return false;
    }
    this.passoV = valor;
    return true;
  }

  /** Fontes pendentes (cópia): o que o Enter final grava. */
  fontesPendentes(): FontesPendentes {
    return { pontos: this.fontes.pontos.slice(), curvas: this.fontes.curvas.map((c) => ({ ...c, xy: c.xy.slice() })) };
  }

  // ---- ciclo da ferramenta -----------------------------------------------------------------------------------------------

  protected reset(): void {
    this.fontes = semFontes();
    this.r.limpar();
    this.forma.limpar();
    this.ultimoPt = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.r.ativo || this.forma.emCurso || !fontesVazias(this.fontes);
  }

  private fmtLen(m: number): string {
    return formatQuantity(unitsOf(this.env.project()), 'length', m);
  }

  private fmtCota(z: number): string {
    return this.fmtLen(cotaExibida(this.env.project(), z));
  }

  /** Último ponto confirmado (rascunho ou ponto solto): origem do Orto, Polar e rastreios, como na parede. */
  private origem(): Vec2 | null {
    if (this.modo === 'curvas' && this.forma.ativa) return this.forma.ancora();
    return this.r.ultimo ?? this.ultimoPt;
  }

  private captura(p: PointerInfo): Vec2 {
    return this.snap(p, contextoDeTraco(this.origem())).point;
  }

  private ultimoCursor: Vec2 | null = null;

  /** Vértices que ainda cabem no terreno (teto de `TERRENO_LIMITES.vertices`, contando as fontes pendentes). */
  private capacidade(): number {
    return TERRENO_LIMITES.vertices - verticesDasFontes(this.fontes);
  }

  private atualizaPrevia(q: Vec2 | null): void {
    const itens: PreviewItem[] = previaDasFontes(this.fontes);
    const pts = this.r.pts;
    const porForma = this.modo === 'curvas' && this.forma.ativa;
    if (porForma) itens.push(...this.forma.previa(q, this.capacidade()));
    else {
      for (let i = 1; i < pts.length; i++) itens.push({ kind: 'line', a: pts[i - 1]!, b: pts[i]! });
      const fim = this.r.ultimo;
      if (q && fim) itens.push({ kind: 'line', a: fim, b: q, dashed: true });
    }
    if (q) itens.push({ kind: 'point', at: q }, { kind: 'label', at: q, text: this.t('tl_tn_cota_rotulo', { cota: this.fmtCota(this.cotaZ) }) });
    this.items = itens;
  }

  override move(p: PointerInfo): void {
    const q = this.captura(p);
    this.ultimoCursor = q;
    this.atualizaPrevia(q);
  }

  /** Cota dinâmica do trecho em traçado (mesmo provedor da parede). */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const fim = this.modo === 'curvas' && this.forma.ativa ? this.forma.ancora() : this.r.ultimo;
    return this.modo === 'curvas' && fim && this.ultimoCursor ? [segmentLengthDim(fim, this.ultimoCursor)] : [];
  }

  override inputPrompt(): string | null {
    if (this.modo === 'curvas' && this.forma.ativa) return this.forma.inputPrompt(this.t('tl_inp_length'));
    return this.modo === 'curvas' && this.r.ativo ? this.t('tl_inp_length') : null;
  }

  override click(p: PointerInfo): void {
    const q = this.captura(p);
    if (this.modo === 'pontos') this.novoPonto(q);
    else if (this.forma.ativa) this.aplicarForma(this.forma.click(q, this.capacidade(), 8 * this.env.metersPerPixel()));
    else if (this.r.pts.length >= 3 && dist(q, this.r.pts[0]!) <= 8 * this.env.metersPerPixel()) this.concluirCurva(true);
    else this.novoVertice(q);
    this.atualizaPrevia(q);
  }

  private novoPonto(q: Vec2): void {
    if (this.ultimoPt && dist(this.ultimoPt, q) < 1e-6) return;
    if (!cabeMais(this.fontes, 1)) {
      this.env.say(this.t('tl_tn_msg_limite', { max: TERRENO_LIMITES.vertices }));
      return;
    }
    this.fontes.pontos.push(q.x, q.y, this.cotaZ);
    this.ultimoPt = q;
    this.env.say(this.t('tl_tn_msg_ponto', { n: this.fontes.pontos.length / 3, cota: this.fmtCota(this.cotaZ) }));
  }

  private novoVertice(q: Vec2): void {
    if (!cabeMais(this.fontes, this.r.pts.length + 1)) {
      this.env.say(this.t('tl_tn_msg_limite', { max: TERRENO_LIMITES.vertices }));
      return;
    }
    if (this.r.adicionar(q)) this.env.say(this.t('tl_tn_msg_curva_ponto', { n: this.r.pts.length }));
  }

  /** `C` fecha a curva (três pontos ou mais) e conclui; comprimento digitado + Enter acrescenta um ponto na direção do cursor. */
  override type(text: string): boolean {
    if (this.modo !== 'curvas') return false;
    if (this.forma.ativa) {
      if (text.toLowerCase() === 'c') {
        this.aplicarForma(this.forma.fecharSpline(this.capacidade()));
        return true;
      }
      const r = this.forma.digitado(text, this.inf?.point ?? this.raw, this.capacidade());
      if (!r) return false;
      this.aplicarForma(r);
      this.ultimoCursor = null;
      this.atualizaPrevia(null);
      return true;
    }
    if (text.toLowerCase() === 'c' && this.r.pts.length >= 3) {
      this.concluirCurva(true);
      return true;
    }
    const q = this.r.pontoDigitado(this.env, text, this.inf, this.raw);
    if (!q) return false;
    this.novoVertice(q);
    this.ultimoCursor = null;
    this.atualizaPrevia(null);
    return true;
  }

  /** Enter: conclui a curva em curso (dois pontos ou mais); sem curva em curso, cria o terreno. */
  override confirm(): void {
    if (this.modo === 'curvas' && this.forma.ativa) {
      const n = this.forma.pontosDeControle.length;
      if (n >= 2) this.aplicarForma(this.forma.confirmar(this.capacidade()));
      else if (n === 1 || this.forma.emCurso) this.env.say(this.t('tl_tn_msg_curva_min'));
      else this.criar();
      return;
    }
    if (this.modo === 'curvas' && this.r.pts.length >= 2) this.concluirCurva(false);
    else if (this.modo === 'curvas' && this.r.pts.length === 1) this.env.say(this.t('tl_tn_msg_curva_min'));
    else this.criar();
  }

  /** Esc: cancela a curva em curso; com fontes pendentes, descarta tudo; sem nada, sai da ferramenta. */
  override cancel(): void {
    if (this.forma.emCurso) {
      this.forma.limpar();
      this.atualizaPrevia(this.ultimoCursor);
      this.env.say(this.hint);
      return;
    }
    if (this.r.ativo) {
      this.r.limpar();
      this.atualizaPrevia(this.ultimoCursor);
      this.env.say(this.hint);
    } else if (!fontesVazias(this.fontes)) {
      this.reset();
      this.env.say(this.t('tl_tn_msg_cancelado'));
    } else this.env.done();
  }

  /** Tab alterna o sinalizador da forma (ex.: sentido do arco centro-extremidades). */
  override tab(): void {
    const f = this.modo === 'curvas' && this.forma.ativa ? this.forma.alternarFlag() : null;
    if (f) this.env.say(this.t('tl_msg_flag_toggle', { label: shapeInputLabel(f.key, this.uiLang()), value: f.value ? this.t('tl_yes') : this.t('tl_no') }));
  }

  /** Resultado de um gesto de forma: a curva pronta entra nas fontes pendentes (como a curva por cliques); recusas e avisos saem na barra de status. */
  private aplicarForma(r: ResultadoForma): void {
    if (r.kind === 'recusa') {
      this.env.say(r.motivo === 'limite' ? this.t('tl_tn_msg_limite', { max: TERRENO_LIMITES.vertices }) : this.t('tl_msg_degenerate_shape'));
    } else if (r.kind === 'pronta') {
      this.fixarCurva(r.forma.pts, r.forma.fechada);
      if (r.reduzida) this.env.say(this.t('tl_tn_msg_flecha_aumentada', { flecha: this.fmtLen(r.forma.flecha), max: TERRENO_LIMITES.vertices }));
    } else this.env.say(this.forma.mensagem() ?? this.t('tl_tn_msg_spline_ponto', { n: this.forma.pontosDeControle.length }));
    this.atualizaPrevia(this.ultimoCursor);
  }

  private concluirCurva(fechada: boolean): void {
    this.fixarCurva(this.r.pts, fechada);
    this.r.limpar();
    this.atualizaPrevia(this.ultimoCursor);
  }

  private fixarCurva(pts: readonly Vec2[], fechada: boolean): void {
    const z = this.cotaZ;
    this.fontes.curvas.push(curvaDoRascunho(pts, z, fechada));
    this.cotaZ = z + this.passoV;
    this.env.say(this.t('tl_tn_msg_curva_feita', { cota: this.fmtCota(z), proxima: this.fmtCota(this.cotaZ) }));
  }

  /** Terreno de destino das fontes: o terreno selecionado (ou o da região selecionada); sem seleção, um terreno novo. */
  private alvo(): Terrain | null {
    const p = this.env.project();
    for (const id of this.env.selection()) {
      const e = p.elements[id];
      if (isTerrain(e)) return e;
      if (isTerrainRegion(e) && isTerrain(p.elements[e.terrenoId])) return p.elements[e.terrenoId] as Terrain;
    }
    return null;
  }

  private criar(): void {
    if (fontesVazias(this.fontes)) {
      this.env.say(this.t('tl_tn_msg_vazio'));
      return;
    }
    const lang = this.uiLang();
    const alvo = this.alvo();
    const f = this.fontes;
    // Valida antes de executar: assim nada fica pela metade (o terreno novo nasce vazio e ganha as fontes em seguida).
    const resultado = alvo ? aplicarOpsFontes(alvo, opsAcrescentar(f), lang) : { ...makeTerrain({ id: 'tn_validacao', levelId: this.env.levelId(), pontos: f.pontos, curvas: f.curvas }), order: 0 };
    const problema = terrainIssue(resultado, lang);
    if (problema) {
      this.env.say(problema);
      return;
    }
    const id: Id = alvo?.id ?? newId('tn');
    this.env.transaction(this.t(alvo ? 'tl_tn_undo_acrescentar' : 'tl_tn_undo_criar'), () => {
      if (alvo) this.env.exec({ type: 'editTerrainFontes', terrenoId: id, ops: opsAcrescentar(f) });
      else {
        this.env.exec({ type: 'addTerrain', terrain: makeTerrain({ id, levelId: this.env.levelId(), tipoId: defaultTerrainTypeIdOf(this.env.project().settings) }) });
        this.env.exec({ type: 'editTerrainFontes', terrenoId: id, ops: [opSubstituir(f)] });
      }
    });
    this.env.say(this.t(alvo ? 'tl_tn_msg_acrescentado' : 'tl_tn_msg_criado', { pontos: f.pontos.length / 3, curvas: f.curvas.length, vertices: verticesDasFontes(f) }));
    this.reset();
    this.env.setSelection([id]);
    this.env.done();
  }
}
