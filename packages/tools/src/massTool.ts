import { makeMass, massIssue, MASSA_LIMITES, newId, normalizarSecoes, type Id, type Mass } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { ToolBase } from './base.ts';
import { contextoDeTraco, lerComprimentoDigitado, pontoPorComprimento, RascunhoPolilinha } from './desenhoPolilinha.ts';
import { fmtNumLang } from './i18n.ts';
import type { PointerInfo, PreviewItem } from './types.ts';
import { ALTURA_PADRAO, LADOS_MAX, LADOS_MIN, LADOS_PADRAO, type ModoMassa, type PerfilTipo } from './massToolOpcoes.ts';
import { anelDoPerfil, capturaCirculo, capturaElipse, capturaLivre, capturaPoligono, pilhaBulbo, pilhaDeDois, type CapturaPerfil, type DadosMassa } from './massToolPerfis.ts';

/**
 * Ferramenta Massa (ficha T1a): cria UMA massa por vez com a pilha de seções do modo (A.2). Extrusão pede um perfil;
 * mistura e loft pedem o perfil da base e depois o do topo; bulbo pede centro e raio máximo. O perfil livre traça pelo
 * núcleo comum (`desenhoPolilinha.ts`): Enter conclui, C fecha, Esc cancela o passo. O modelo valida (`massIssue`):
 * massa recusada não é criada e a mensagem dele vai à barra de status. Um clique de criação = um passo de desfazer.
 */
export class MassTool extends ToolBase {
  readonly id = 'mass';
  readonly label = 'Massa';
  override get hint(): string {
    return this.t('tl_hint_mass');
  }
  /** Recebe o id da massa criada pelo loft: a interface abre o diálogo "Seções da massa" (A.6). Ausente = ninguém ouve. */
  aoCriar: ((massaId: Id) => void) | null = null;
  private modoAtual: ModoMassa = 'extrusao';
  private perfilAtual: PerfilTipo = 'circulo';
  private alturaAtual = ALTURA_PADRAO;
  private ladosAtual = LADOS_PADRAO;
  /** Perfil da base já desenhado (mistura e loft); null enquanto o passo é o da base. */
  private base: CapturaPerfil | null = null;
  /** Centro do perfil em andamento, depois do primeiro clique. */
  private centro: Vec2 | null = null;
  private readonly r = new RascunhoPolilinha();

  /** Opções da barra: a troca de modo ou de perfil recomeça o passo em andamento. */
  get modo(): ModoMassa {
    return this.modoAtual;
  }
  set modo(m: ModoMassa) {
    if (m === this.modoAtual) return;
    this.modoAtual = m;
    this.reset();
  }
  get perfil(): PerfilTipo {
    return this.perfilAtual;
  }
  set perfil(p: PerfilTipo) {
    if (p === this.perfilAtual) return;
    this.perfilAtual = p;
    this.reset();
  }
  /** Altura da massa, em metros. Valor não positivo ou não numérico é ignorado. */
  get altura(): number {
    return this.alturaAtual;
  }
  set altura(h: number) {
    if (Number.isFinite(h) && h > 0) this.alturaAtual = h;
  }
  /** Lados do polígono regular: inteiro de 3 a 64 (fora disso o valor é limitado). */
  get lados(): number {
    return this.ladosAtual;
  }
  set lados(n: number) {
    if (Number.isFinite(n)) this.ladosAtual = Math.min(LADOS_MAX, Math.max(LADOS_MIN, Math.round(n)));
  }

  protected reset(): void {
    this.r.limpar();
    this.centro = null;
    this.base = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.passoEmAndamento() || this.base !== null;
  }

  /** O bulbo é sempre círculo; os demais modos usam a opção de perfil. */
  private perfilDoPasso(): PerfilTipo {
    return this.modoAtual === 'bulbo' ? 'circulo' : this.perfilAtual;
  }

  private passoEmAndamento(): boolean {
    return this.centro !== null || this.r.ativo;
  }

  /** A massa é de planta: em corte e elevação a captura viria em (t, z), então a ferramenta não age. */
  private naVistaDeCorte(): boolean {
    return !!this.env.section?.() || this.env.isSectionView?.() === true;
  }

  /** Captura do clique: Orto e Polar partem do centro (ou do último vértice do perfil livre). */
  private snapDoPasso(p: PointerInfo): Vec2 {
    const de = this.perfilDoPasso() === 'livre' ? this.r.ultimo : this.centro;
    return this.snap(p, contextoDeTraco(de)).point;
  }

  override move(p: PointerInfo): void {
    if (this.naVistaDeCorte()) {
      this.items = [];
      return;
    }
    this.items = this.previa(this.snapDoPasso(p));
  }

  /** Prévia: a base já feita, o traço do perfil livre ou o contorno do perfil em andamento até o cursor. */
  private previa(q: Vec2): PreviewItem[] {
    const itens: PreviewItem[] = [];
    if (this.base) itens.push({ kind: 'polygon', ring: anelDoPerfil(this.base.perfil, this.base.centro) });
    if (this.perfilDoPasso() === 'livre') {
      const pts = this.r.pts;
      for (let i = 1; i < pts.length; i++) itens.push({ kind: 'line', a: pts[i - 1]!, b: pts[i]! });
      const ultimo = this.r.ultimo;
      if (ultimo) itens.push({ kind: 'line', a: ultimo, b: q, dashed: true });
    } else if (this.centro) {
      const cap = this.capturaDoCursor(this.centro, q);
      itens.push({ kind: 'polygon', ring: anelDoPerfil(cap.perfil, cap.centro), dashed: true });
      itens.push({ kind: 'line', a: this.centro, b: q, dashed: true });
    }
    return itens;
  }

  override click(p: PointerInfo): void {
    if (this.naVistaDeCorte()) {
      this.env.say(this.t('tl_mass_plan_only'));
      return;
    }
    const q = this.snapDoPasso(p);
    if (this.perfilDoPasso() === 'livre') {
      this.acrescentar(q);
      return;
    }
    if (!this.centro) {
      this.centro = q;
      this.env.say(this.promptBorda());
      return;
    }
    this.concluirPasso(this.capturaDoCursor(this.centro, q));
  }

  /** Perfil com centro: o segundo clique é o raio, ou o canto na elipse. */
  private capturaDoCursor(centro: Vec2, q: Vec2): CapturaPerfil {
    switch (this.perfilDoPasso()) {
      case 'elipse':
        return capturaElipse(centro, q);
      case 'poligono':
        return capturaPoligono(centro, q, this.ladosAtual);
      default:
        return capturaCirculo(centro, q);
    }
  }

  private acrescentar(q: Vec2): void {
    if (this.r.pts.length >= MASSA_LIMITES.pontosLivre) {
      this.env.say(this.t('tl_mass_livre_max', { max: MASSA_LIMITES.pontosLivre }));
      return;
    }
    if (!this.r.adicionar(q)) return;
    this.env.say(this.t('tl_mass_livre_point', { n: this.r.pts.length }));
  }

  /** Enter conclui o perfil livre com os pontos traçados; com menos de três, o modelo diz o que falta. */
  override confirm(): void {
    if (this.perfilDoPasso() === 'livre' && this.r.ativo) {
      this.concluirPasso(capturaLivre(this.r.pts));
      return;
    }
    super.confirm();
  }

  /** Valor digitado: C fecha o perfil livre; número com passo aberto é o raio (ou o comprimento do vértice); sem passo, é a altura. */
  override type(text: string): boolean {
    if (this.naVistaDeCorte()) return false;
    const livre = this.perfilDoPasso() === 'livre';
    if (livre && this.r.ativo && text.toLowerCase() === 'c' && this.r.pts.length >= 3) {
      this.concluirPasso(capturaLivre(this.r.pts));
      return true;
    }
    if (!/\d/.test(text)) return false;
    if (livre && this.r.ativo) {
      const q = this.r.pontoDigitado(this.env, text, this.inf, this.raw);
      if (q) this.acrescentar(q);
      return true;
    }
    if (!livre && this.centro && this.perfilDoPasso() !== 'elipse') {
      const v = lerComprimentoDigitado(this.env, text);
      if (v !== null) this.concluirPasso(this.capturaDoCursor(this.centro, pontoPorComprimento(this.centro, this.inf?.point ?? this.raw, v)));
      return true;
    }
    if (this.passoEmAndamento()) return false;
    const h = lerComprimentoDigitado(this.env, text);
    if (h !== null) {
      this.altura = h;
      this.env.say(this.t('tl_mass_altura_set', { h: fmtNumLang(h, 2, this.uiLang()) }));
    }
    return true;
  }

  /** Esc: cancela o passo em andamento; no topo da mistura ou do loft, sem passo, volta à base; fora disso sai da ferramenta. */
  override cancel(): void {
    if (this.passoEmAndamento()) {
      this.limparPasso();
      this.env.say(this.dicaDoPasso());
      return;
    }
    if (this.base) {
      this.base = null;
      this.env.say(this.t('tl_mass_back_base'));
      return;
    }
    this.env.done();
  }

  override inputPrompt(): string | null {
    if (this.perfilDoPasso() === 'livre') return this.r.ativo ? this.t('tl_inp_length') : null;
    return this.centro && this.perfilDoPasso() !== 'elipse' ? this.t('tl_inp_mass_radius') : null;
  }

  /** Texto de status do passo atual (também o que sai com o Esc). */
  private dicaDoPasso(): string {
    if (this.perfilDoPasso() === 'livre') return this.r.pts.length ? this.t('tl_mass_livre_point', { n: this.r.pts.length }) : this.t('tl_mass_livre_start');
    if (this.base) return this.t('tl_mass_center_top');
    return this.modoAtual === 'mistura' || this.modoAtual === 'loft' ? this.t('tl_mass_center_base') : this.t('tl_mass_center');
  }

  /** Pergunta depois do centro: o raio, o canto da elipse ou o raio máximo do bulbo. */
  private promptBorda(): string {
    if (this.perfilDoPasso() === 'elipse') return this.t('tl_mass_corner');
    return this.modoAtual === 'bulbo' ? this.t('tl_mass_radius_max') : this.t('tl_mass_radius');
  }

  private limparPasso(): void {
    this.centro = null;
    this.r.limpar();
    this.items = [];
  }

  /**
   * Um perfil completo. Mistura e loft guardam a base e pedem o topo (a base já é validada sozinha, para o erro aparecer
   * já aqui); os demais modos criam a massa.
   */
  private concluirPasso(captura: CapturaPerfil): void {
    const modo = this.modoAtual;
    if ((modo === 'mistura' || modo === 'loft') && !this.base) {
      if (this.recusada(this.montar(pilhaDeDois(captura, captura, this.alturaAtual)).issue)) return;
      this.base = captura;
      this.limparPasso();
      this.env.say(this.dicaDoPasso());
      return;
    }
    const dados = modo === 'bulbo' ? pilhaBulbo(captura, this.alturaAtual) : pilhaDeDois(this.base ?? captura, captura, this.alturaAtual);
    this.criarMassa(dados);
  }

  /** Monta o comando da massa (com a validação do modelo) sem gravar nada. */
  private montar(d: DadosMassa): { massa: Omit<Mass, 'order'>; issue: string | null } {
    const massa = makeMass({ id: newId('mass'), levelId: this.env.levelId(), origem: d.origem, secoes: normalizarSecoes(d.secoes), interpolacao: d.interpolacao });
    return { massa, issue: massIssue({ ...massa, order: 0 }, this.uiLang()) };
  }

  /** Massa ou passo recusado: mostra a mensagem do modelo, limpa o passo (a base da mistura fica) e não cria nada. */
  private recusada(issue: string | null): boolean {
    if (!issue) return false;
    this.limparPasso();
    this.env.say(issue);
    return true;
  }

  /** Grava a massa num único comando (um passo de desfazer), seleciona-a e, no loft, avisa quem abre o diálogo de seções. */
  private criarMassa(d: DadosMassa): void {
    const { massa, issue } = this.montar(d);
    if (this.recusada(issue)) return;
    this.env.exec({ type: 'addMass', mass: massa });
    this.env.setSelection([massa.id]);
    const aoCriar = this.modoAtual === 'loft' ? this.aoCriar : null;
    this.reset();
    aoCriar?.(massa.id);
    this.env.say(this.hint);
  }
}
