import { dist, type Vec2 } from '@hestia/geom';
import { servicoTerreno } from '@hestia/engine';
import { cotaDoProjeto, cotaExibida, formatQuantity, isTerrain, TERRENO_LIMITES, unitsOf, type Id, type Terrain } from '@hestia/model';
import { shapeInputLabel } from './sketchShapes.ts';
import { ToolBase } from './base.ts';
import { contextoDeTraco, RascunhoPolilinha } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { gravarOps, opsBorda, opsCota, opsCurva, opsMover, opsPonto, opsQuebra, opsRemover, opsRemoverBorda, terrenoDaSelecao } from './terrainEditGestos.ts';
import { alcasNaJanela, alvoDeEdicao, cotaDoItem, indiceDasFontes, posicaoDoItem, type FonteRef, type JanelaMundo, type VerticeFonte } from './terrainEditPick.ts';
import { camposValidos, dadosDoPonto, ehRefDePonto, opsDoPonto, type CamposDoPonto, type DadosDoPonto } from './terrainEditPonto.ts';
import { DesenhoDeForma, type ResultadoForma } from './terrainFormaCurva.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/** Submodos do modo "Editar terreno": `editar` (escolher, arrastar, cota, Delete) e os de desenho das fontes. */
export type ModoEdicaoTerreno = 'editar' | 'ponto' | 'curva' | 'quebra' | 'borda';

/** Arrasto em curso de um vértice: de onde saiu e onde está. */
interface Arrasto {
  ref: FonteRef;
  de: Vec2;
  para: Vec2;
}

/** Deslocamento mínimo (px de tela) para um arrasto contar como movimento; menos que isso é só um clique de seleção. */
const ARRASTO_MIN_PX = 3;

/** Tolerância de escolha (px de tela). */
const TOLERANCIA_PX = 8;

/**
 * Editar terreno (A.6): edita as FONTES do terreno (pontos, vértices de curvas e de quebras, borda, rótulos e pontos cotados: dado do modelo) pelos
 * comandos do modelo (`editTerrainFontes`). NUNCA gera malha, curva de nível ou perfil: a cota do terreno derivado vem de `servicoTerreno()`.
 *
 * - `editar`: clicar escolhe o vértice mais próximo (índice espacial das fontes, montado uma vez por conteúdo); arrastar move em planta (um comando
 *   por gesto concluído, um desfazer); o campo Cota muda a cota do ponto, ou da curva INTEIRA se o vértice é de curva; Delete remove; clicar num
 *   rótulo ou ponto cotado e Delete o apaga.
 * - `ponto`, `curva`, `quebra` e `borda`: desenham fontes novas. Curva, quebra e borda são polilinhas do núcleo comum de desenho. Na quebra, a cota de
 *   cada vértice é a do terreno ali (`cotaDoTerreno`), ou a digitada no campo Cota.
 * - Com mais de 500 vértices na janela não há alças nem escolha: a mensagem pede para aproximar. Esc sai do modo sem alterar nada.
 *
 * O "terreno em edição" (`terrenoEdicao` do estado de interface) e a janela da vista chegam por `definirTerreno` e `definirJanela` (a ligação à vista é da U1).
 */
export class TerrainEditTool extends ToolBase {
  readonly id = 'terrainEdit';
  readonly label = 'Editar terreno';
  private modo: ModoEdicaoTerreno = 'editar';
  private idTerreno: Id | null = null;
  private janela: JanelaMundo | null = null;
  private escolhido: FonteRef | null = null;
  private arrasto: Arrasto | null = null;
  /** z do projeto do campo Cota. */
  private cotaZ = 0;
  /** O usuário digitou a cota: vale também na linha de quebra (senão a quebra usa a cota do terreno). */
  private cotaManual = false;
  private r = new RascunhoPolilinha();
  /** Curvas por forma (galeria da Topografia) no submodo `curva`. */
  private forma = new DesenhoDeForma(this.env, () => this.uiLang());
  private zs: number[] = [];
  private ultimoCursor: Vec2 | null = null;

  override get hint(): string {
    const cota = this.fmtCota(this.cotaZ);
    switch (this.modo) {
      case 'ponto': return this.t('tl_tn_edit_hint_ponto', { cota });
      case 'curva': return this.formaAtiva() ? this.t(this.forma.forma() === 'spline' ? 'tl_tn_hint_spline' : 'tl_tn_hint_forma', { cota, passo: '', flecha: this.fmtLen(this.forma.flecha) }) : this.t('tl_tn_edit_hint_curva', { cota });
      case 'quebra': return this.t(this.cotaManual ? 'tl_tn_edit_hint_quebra_cota' : 'tl_tn_edit_hint_quebra_terreno', { cota });
      case 'borda': return this.t('tl_tn_edit_hint_borda');
      default: return this.t('tl_tn_edit_hint_editar');
    }
  }

  // ---- estado da barra de opções e do modo (ficha U1) --------------------------------------------------------------------

  get modoAtual(): ModoEdicaoTerreno {
    return this.modo;
  }

  /** Muda o submodo; o traçado em curso é descartado e a escolha, limpa. */
  definirModo(m: ModoEdicaoTerreno): void {
    if (m === this.modo) return;
    this.modo = m;
    this.reset();
    this.env.say(this.hint);
  }

  get terrenoId(): Id | null {
    return this.idTerreno;
  }

  /** Terreno em edição (o `terrenoEdicao.terrenoId` do estado de interface). */
  definirTerreno(id: Id | null): void {
    if (id === this.idTerreno) return;
    this.idTerreno = id;
    this.reset();
  }

  /** Janela do mundo que a vista mostra: decide o limite de 500 alças. Sem janela, vale o terreno inteiro. */
  definirJanela(j: JanelaMundo | null): void {
    this.janela = j;
  }

  /** Item escolhido (vértice, rótulo ou ponto cotado), ou null. */
  get selecionado(): FonteRef | null {
    return this.escolhido;
  }

  /** Cota do campo, como o usuário a vê (z do projeto mais a altitude da cota zero). */
  get cotaDoCampo(): number {
    return cotaExibida(this.env.project(), this.cotaZ);
  }

  get cotaDoModelo(): number {
    return this.cotaZ;
  }

  /**
   * Vértice ou ponto escolhido com posição e cota (null se não há, se a referência sumiu ou se é rótulo ou ponto cotado): é o que o painel
   * "Ponto selecionado" lê. x e y do projeto; z do projeto (some `cotaZero` para a cota exibida).
   */
  get pontoSelecionado(): DadosDoPonto | null {
    const tn = this.terreno();
    return tn && ehRefDePonto(this.escolhido) ? dadosDoPonto(tn, this.escolhido) : null;
  }

  /**
   * Ajuste fino do ponto escolhido pelo painel: x e y do projeto e a cota EXIBIDA (passa por `cotaDoProjeto`). UM `editTerrainFontes` (um desfazer).
   * Ponto solto: só ele; vértice de curva: x e y do vértice e a cota da CURVA INTEIRA; vértice de quebra: x, y e z. Recusa, com mensagem e sem
   * mudar nada, número fora dos limites do terreno ou terreno que ficaria inválido (por exemplo, vértice duplicado).
   */
  definirPontoSelecionado(campos: { x?: number; y?: number; cota?: number }): boolean {
    const tn = this.terreno();
    const atual = this.pontoSelecionado;
    if (!tn || !atual) return false;
    const c: CamposDoPonto = { ...(campos.x !== undefined ? { x: campos.x } : {}), ...(campos.y !== undefined ? { y: campos.y } : {}), ...(campos.cota !== undefined ? { z: cotaDoProjeto(this.env.project(), campos.cota) } : {}) };
    if (!camposValidos(c)) {
      this.env.say(this.t('tl_tn_edit_ponto_invalido', { coord: formatQuantity(unitsOf(this.env.project()), 'length', TERRENO_LIMITES.coordMax), cota: formatQuantity(unitsOf(this.env.project()), 'length', TERRENO_LIMITES.cotaMax) }));
      return false;
    }
    const ok = gravarOps(this.env, tn, opsDoPonto(atual, c), this.t('tl_tn_undo_edit_ponto_props'), this.uiLang());
    if (ok) this.env.say(this.t('tl_tn_edit_ponto_ajustado'));
    return ok;
  }

  /** Cota do item escolhido, como o usuário a vê (null se não há item com cota). */
  get cotaDoSelecionado(): number | null {
    const tn = this.terreno();
    const z = tn && this.escolhido ? cotaDoItem(tn, this.escolhido) : null;
    return z === null ? null : cotaExibida(this.env.project(), z);
  }

  /**
   * Valor digitado no campo Cota (exibido; passa por `cotaDoProjeto`). Com um ponto ou vértice escolhido, grava a cota nele: no ponto, só nele; no
   * vértice de curva, na CURVA INTEIRA. Falso, sem mudar nada, se o número não servir.
   */
  definirCotaDoCampo(valor: number): boolean {
    const z = cotaDoProjeto(this.env.project(), valor);
    if (!Number.isFinite(z) || Math.abs(z) > TERRENO_LIMITES.cotaMax) {
      this.env.say(this.t('tl_tn_msg_cota_invalida'));
      return false;
    }
    this.cotaZ = z;
    this.cotaManual = true;
    const tn = this.terreno();
    if (tn && this.escolhido && this.modo === 'editar' && cotaDoItem(tn, this.escolhido) !== null) {
      if (gravarOps(this.env, tn, opsCota(tn, this.escolhido, z), this.t('tl_tn_undo_edit_cota'), this.uiLang())) this.env.say(this.t('tl_tn_edit_cota_mudada', { cota: this.fmtCota(z) }));
    }
    return true;
  }

  /** Volta a linha de quebra a usar a cota do terreno em cada vértice. */
  usarCotaDoTerreno(): void {
    this.cotaManual = false;
  }

  /** "Remover borda": volta a valer a envoltória das fontes. */
  removerBorda(): boolean {
    const tn = this.terreno();
    if (!tn) return false;
    if (!tn.borda) {
      this.env.say(this.t('tl_tn_edit_sem_borda'));
      return false;
    }
    const ok = gravarOps(this.env, tn, opsRemoverBorda(), this.t('tl_tn_undo_edit_borda_remover'), this.uiLang());
    if (ok) this.env.say(this.t('tl_tn_edit_borda_removida'));
    return ok;
  }

  /** Alças que o modo mostra na janela e a mensagem quando são demais ("aproxime para editar pontos"). */
  alcas(): { alcas: VerticeFonte[]; mensagem: string | null } {
    const tn = this.terreno();
    if (!tn) return { alcas: [], mensagem: null };
    const a = alcasNaJanela(indiceDasFontes(tn), this.janela);
    return { alcas: a.vertices, mensagem: a.excedeu ? this.t('tl_tn_edit_aproxime') : null };
  }

  // ---- ciclo ---------------------------------------------------------------------------------------------------------------

  override start(): void {
    if (!this.idTerreno) this.idTerreno = terrenoDaSelecao(this.env.project(), this.env.selection())?.id ?? null;
    this.reset();
    this.env.say(this.terreno() ? this.hint : this.t('tl_tn_edit_sem_terreno'));
  }

  protected reset(): void {
    this.r.limpar();
    this.forma.limpar();
    this.zs = [];
    this.escolhido = null;
    this.arrasto = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.arrasto !== null || this.r.ativo || this.forma.emCurso;
  }

  private terreno(): Terrain | null {
    const e = this.idTerreno ? this.env.project().elements[this.idTerreno] : undefined;
    return isTerrain(e) ? e : null;
  }

  private fmtLen(m: number): string {
    return formatQuantity(unitsOf(this.env.project()), 'length', m);
  }

  private fmtCota(z: number): string {
    const p = this.env.project();
    return formatQuantity(unitsOf(p), 'length', cotaExibida(p, z));
  }

  private tol(): number {
    return TOLERANCIA_PX * this.env.metersPerPixel();
  }

  /** O que está sob o cursor; vértices só entram se a janela não passa do limite (com excesso, a mensagem sai na barra de status). */
  private alvoSob(tn: Terrain, at: Vec2, avisar: boolean): FonteRef | null {
    const ix = indiceDasFontes(tn);
    const a = alcasNaJanela(ix, this.janela);
    if (a.excedeu && avisar) this.env.say(this.t('tl_tn_edit_aproxime'));
    return alvoDeEdicao(tn, ix, at, this.tol(), !a.excedeu);
  }

  // ---- escolher e arrastar -------------------------------------------------------------------------------------------------

  private avisoEscolha(tn: Terrain, ref: FonteRef): void {
    const z = cotaDoItem(tn, ref);
    const cota = z === null ? '' : this.fmtCota(z);
    const chave = { ponto: 'tl_tn_edit_sel_ponto', curva: 'tl_tn_edit_sel_curva', quebra: 'tl_tn_edit_sel_quebra', rotulo: 'tl_tn_edit_sel_rotulo', cotado: 'tl_tn_edit_sel_cotado' } as const;
    this.env.say(this.t(chave[ref.tipo], { cota }));
  }

  down(p: PointerInfo): void {
    if (this.modo !== 'editar') return;
    const tn = this.terreno();
    if (!tn) return;
    this.ultimoPonteiro = p;
    this.escolhido = this.alvoSob(tn, p.raw, true);
    this.arrasto = null;
    if (!this.escolhido) return;
    this.avisoEscolha(tn, this.escolhido);
    const pos = posicaoDoItem(tn, this.escolhido);
    if (pos && opsMover(tn, this.escolhido, pos.x, pos.y).length > 0) this.arrasto = { ref: this.escolhido, de: pos, para: pos };
  }

  drag(p: PointerInfo): void {
    const a = this.arrasto;
    if (!a) return;
    a.para = this.snap(p, contextoDeTraco(a.de)).point;
    this.items = [{ kind: 'line', a: a.de, b: a.para, dashed: true }, { kind: 'point', at: a.para }];
  }

  up(_p: PointerInfo): void {
    const a = this.arrasto;
    this.arrasto = null;
    this.items = [];
    const tn = this.terreno();
    if (!a || !tn || dist(a.de, a.para) <= ARRASTO_MIN_PX * this.env.metersPerPixel()) return;
    if (gravarOps(this.env, tn, opsMover(tn, a.ref, a.para.x, a.para.y), this.t('tl_tn_undo_edit_mover'), this.uiLang())) this.env.say(this.t('tl_tn_edit_movido'));
  }

  /** Delete: remove o item escolhido (vértice, rótulo ou ponto cotado). Sem item, devolve false e o Delete segue o caminho normal. */
  deleteKey(): boolean {
    const tn = this.terreno();
    if (!tn || !this.escolhido || this.modo !== 'editar') return false;
    const ref = this.escolhido;
    this.escolhido = null;
    this.arrasto = null;
    if (gravarOps(this.env, tn, opsRemover(tn, ref), this.t('tl_tn_undo_edit_remover'), this.uiLang())) this.env.say(this.t('tl_tn_edit_removido'));
    return true;
  }

  // ---- desenhar fontes -----------------------------------------------------------------------------------------------------

  /** Submodo `curva` com forma diferente de "Linha". */
  private formaAtiva(): boolean {
    return this.modo === 'curva' && this.forma.ativa;
  }

  /** Vértices que ainda cabem no terreno em edição. */
  private capacidade(): number {
    const tn = this.terreno();
    if (!tn) return 0;
    const usados = tn.pontos.length / 3 + tn.curvas.reduce((n, c) => n + c.xy.length / 2, 0) + tn.quebras.reduce((n, q) => n + q.xyz.length / 3, 0) + (tn.borda?.length ?? 0) / 2;
    return TERRENO_LIMITES.vertices - usados;
  }

  private origem(): Vec2 | null {
    if (this.formaAtiva()) return this.forma.ancora();
    return this.r.ultimo;
  }

  private captura(p: PointerInfo): Vec2 {
    return this.snap(p, contextoDeTraco(this.origem())).point;
  }

  /** Cota do vértice novo: a do terreno ali (linha de quebra sem cota digitada), ou a do campo. Fora do terreno ou sem kernel, a do campo. */
  private cotaDoVertice(q: Vec2): number {
    if (this.modo === 'quebra' && !this.cotaManual) {
      const z = servicoTerreno().cotaDoTerreno(this.env.project(), [q], 1)?.[0]?.z;
      if (typeof z === 'number' && Number.isFinite(z)) return z;
    }
    return this.cotaZ;
  }

  private desenha(): boolean {
    return this.modo === 'curva' || this.modo === 'quebra' || this.modo === 'borda';
  }

  private atualizaPrevia(q: Vec2 | null): void {
    const itens: PreviewItem[] = [];
    const pts = this.r.pts;
    if (this.formaAtiva()) itens.push(...this.forma.previa(q, this.capacidade()));
    else {
      for (let i = 1; i < pts.length; i++) itens.push({ kind: 'line', a: pts[i - 1]!, b: pts[i]! });
      const fim = this.r.ultimo;
      if (q && fim) itens.push({ kind: 'line', a: fim, b: q, dashed: true });
    }
    if (this.modo === 'borda' && pts.length >= 3) itens.push({ kind: 'line', a: pts[pts.length - 1]!, b: pts[0]!, dashed: true });
    if (q && this.modo !== 'editar') itens.push({ kind: 'point', at: q }, { kind: 'label', at: q, text: this.t('tl_tn_cota_rotulo', { cota: this.fmtCota(this.cotaDoVertice(q)) }) });
    this.items = itens;
  }

  override move(p: PointerInfo): void {
    if (this.modo === 'editar') {
      const tn = this.terreno();
      this.ultimoPonteiro = p;
      const ref = tn ? this.alvoSob(tn, p.raw, false) : null;
      const pos = tn && ref ? posicaoDoItem(tn, ref) : null;
      this.items = pos ? [{ kind: 'point', at: pos }] : [];
      return;
    }
    const q = this.captura(p);
    this.ultimoCursor = q;
    this.atualizaPrevia(q);
  }

  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const fim = this.formaAtiva() ? this.forma.ancora() : this.r.ultimo;
    return this.desenha() && fim && this.ultimoCursor ? [segmentLengthDim(fim, this.ultimoCursor)] : [];
  }

  override inputPrompt(): string | null {
    if (this.formaAtiva()) return this.forma.inputPrompt(this.t('tl_inp_length'));
    return this.desenha() && this.r.ativo ? this.t('tl_inp_length') : null;
  }

  override click(p: PointerInfo): void {
    if (this.modo === 'editar') return;
    const tn = this.terreno();
    if (!tn) return;
    const q = this.captura(p);
    if (this.modo === 'ponto') {
      const novo = tn.pontos.length / 3;
      if (gravarOps(this.env, tn, opsPonto(q.x, q.y, this.cotaZ), this.t('tl_tn_undo_edit_ponto'), this.uiLang())) {
        // O ponto recém-criado fica escolhido: o painel "Ponto selecionado" permite o ajuste fino de X, Y e Cota.
        this.escolhido = { tipo: 'ponto', i: novo };
        this.env.say(this.t('tl_tn_edit_ponto_feito', { cota: this.fmtCota(this.cotaZ) }));
      }
    } else if (this.formaAtiva()) this.aplicarForma(this.forma.click(q, this.capacidade(), 8 * this.env.metersPerPixel()));
    else if (this.modo !== 'quebra' && this.r.pts.length >= 3 && dist(q, this.r.pts[0]!) <= 8 * this.env.metersPerPixel()) this.concluir(true);
    else this.novoVertice(q);
    this.atualizaPrevia(q);
  }

  private novoVertice(q: Vec2): void {
    if (this.r.adicionar(q)) this.zs.push(this.cotaDoVertice(q));
  }

  /** `C` fecha a curva ou a borda (três pontos ou mais); comprimento digitado + Enter acrescenta um ponto na direção do cursor. */
  override type(text: string): boolean {
    if (!this.desenha()) return false;
    if (this.formaAtiva()) {
      const r = text.toLowerCase() === 'c' ? this.forma.fecharSpline(this.capacidade()) : this.forma.digitado(text, this.inf?.point ?? this.raw, this.capacidade());
      if (!r) return false;
      this.aplicarForma(r);
      return true;
    }
    if (text.toLowerCase() === 'c' && this.modo !== 'quebra' && this.r.pts.length >= 3) {
      this.concluir(true);
      return true;
    }
    const q = this.r.pontoDigitado(this.env, text, this.inf, this.raw);
    if (!q) return false;
    this.novoVertice(q);
    this.ultimoCursor = null;
    this.atualizaPrevia(null);
    return true;
  }

  /** Enter: conclui a curva, a linha de quebra ou a borda em traçado. */
  override confirm(): void {
    if (!this.desenha()) return;
    if (this.formaAtiva()) {
      if (this.forma.pontosDeControle.length >= 2) this.aplicarForma(this.forma.confirmar(this.capacidade()));
      else this.env.say(this.t('tl_tn_msg_curva_min'));
      return;
    }
    const n = this.r.pts.length;
    if (this.modo === 'borda') {
      if (n >= 3) this.concluir(true);
      else this.env.say(this.t('tl_tn_edit_borda_min'));
    } else if (n >= 2) this.concluir(false);
    else this.env.say(this.t(this.modo === 'curva' ? 'tl_tn_msg_curva_min' : 'tl_tn_edit_quebra_min'));
  }

  /** Grava o traçado em curso como UM `editTerrainFontes` (um desfazer). Se o modelo recusar (ex.: borda que se cruza), o traçado fica para corrigir. */
  private concluir(fechada: boolean): void {
    const tn = this.terreno();
    if (!tn) return;
    const pts = this.r.pts.slice();
    const lang = this.uiLang();
    let ok = false;
    if (this.modo === 'curva') ok = gravarOps(this.env, tn, opsCurva(pts, this.cotaZ, fechada), this.t('tl_tn_undo_edit_curva'), lang);
    else if (this.modo === 'quebra') ok = gravarOps(this.env, tn, opsQuebra(pts, this.zs), this.t('tl_tn_undo_edit_quebra'), lang);
    else if (this.modo === 'borda') ok = gravarOps(this.env, tn, opsBorda(pts), this.t('tl_tn_undo_edit_borda'), lang);
    if (!ok) return;
    this.r.limpar();
    this.zs = [];
    this.atualizaPrevia(this.ultimoCursor);
    this.env.say(this.t(this.modo === 'borda' ? 'tl_tn_edit_borda_feita' : 'tl_tn_edit_linha_feita', { n: pts.length }));
  }

  /** Tab alterna o sinalizador da forma (ex.: sentido do arco centro-extremidades). */
  override tab(): void {
    const f = this.formaAtiva() ? this.forma.alternarFlag() : null;
    if (f) this.env.say(this.t('tl_msg_flag_toggle', { label: shapeInputLabel(f.key, this.uiLang()), value: f.value ? this.t('tl_yes') : this.t('tl_no') }));
  }

  /** Forma pronta (já discretizada no teto de vértices do terreno) grava UMA curva na cota do campo; um desfazer. */
  private aplicarForma(r: ResultadoForma): void {
    const tn = this.terreno();
    if (r.kind === 'recusa') this.env.say(r.motivo === 'limite' ? this.t('tl_tn_msg_limite', { max: TERRENO_LIMITES.vertices }) : this.t('tl_msg_degenerate_shape'));
    else if (r.kind === 'pronta' && tn) {
      if (gravarOps(this.env, tn, opsCurva(r.forma.pts, this.cotaZ, r.forma.fechada), this.t('tl_tn_undo_edit_curva'), this.uiLang())) {
        this.env.say(r.reduzida ? this.t('tl_tn_msg_flecha_aumentada', { flecha: this.fmtLen(r.forma.flecha), max: TERRENO_LIMITES.vertices }) : this.t('tl_tn_edit_linha_feita', { n: r.forma.pts.length }));
      }
    } else if (r.kind === 'nada') this.env.say(this.forma.mensagem() ?? this.t('tl_tn_msg_spline_ponto', { n: this.forma.pontosDeControle.length }));
    this.atualizaPrevia(this.ultimoCursor);
  }

  /** Esc: cancela o arrasto ou o traçado em curso; sem nada em curso, SAI do modo sem alterar o terreno. */
  override cancel(): void {
    if (this.busy()) {
      this.r.limpar();
      this.forma.limpar();
      this.zs = [];
      this.arrasto = null;
      this.items = [];
      this.env.say(this.hint);
      return;
    }
    this.escolhido = null;
    this.items = [];
    this.env.done();
  }
}
