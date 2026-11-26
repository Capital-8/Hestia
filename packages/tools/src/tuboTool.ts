import type { Vec2 } from '@hestia/geom';
import { avaliarEncontro, bitolaPermitida, idTuboDoProjeto, regrasDoTubo, tipoSemConexoes, type RegrasConexao, type TrechoEncontro } from '@hestia/engine';
import { familiaDaBiblioteca, isComponent, type Component, type Id, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import { extremosDoTubo, type PontoTubo } from './tuboGeometria.ts';
import type { ModoCota } from './tuboPrumada.ts';
import { alertaDeAngulo, avisoComSugestao, itensDoBloqueio, type BloqueioTubo } from './tuboBloqueio.ts';
import { lerComprimentoDigitado } from './desenhoPolilinha.ts';
import { fantasmaDoTrecho, ligacaoProxima, ligacoesAbertas, pontasDoTubo, semOrigem, temConexoes, type ContextoTraco, type LigacaoAberta } from './tuboApoio.ts';
import { itensDePortas } from './tuboPortas.ts';
import { aparar, derivarNoMeio, garantirFamilias, inserirConexao, type Aparo } from './tuboDerivacao.ts';
import { itensDoMeio, meioDeTubo, semDerivacao, type MeioDeTubo } from './tuboMeio.ts';
import { verificarTraco, type EntradaRota, type Verificacao } from './tuboRota.ts';
import type { PointerInfo, ToolEnv } from './types.ts';

export { pontasDoTubo };

/** Família de tubo de reserva: usada quando o projeto não tem o tubo real de nenhum domínio (`CONEXOES_POR_DOMINIO`, ficha F1). */
export const FAMILIA_TUBO_PADRAO = 'tubo-padrao';

/** Tubo real do domínio esgoto (ficha F1/F1b): carregado da biblioteca MEP quando o projeto não tem nenhum tubo. */
export const FAMILIA_TUBO_BIBLIOTECA = 'fam_tubo_esgoto';

/**
 * Ajustes da ferramenta que o painel `TuboProperties` edita: DN em mm, altura (z) dos pontos clicados em m e declividade (ficha M2) em %:
 * com valor, o ponto final fica a `declividade` % da distância em planta acima (positiva) ou abaixo (negativa) do inicial. 0 = nível.
 * `modoCota` (ficha B4): como desenhar um trecho entre cotas diferentes com declividade 0 (ver `tuboPrumada.ts`).
 */
export const opcoesTubo: OpcoesTraco = { dn: 50, z: 0, declividade: 0, modoCota: 'subir_primeiro' };

/** Ajustes do traçado (o painel edita): `familiaId` só vale para ferramentas com família própria (Eletroduto). */
export interface OpcoesTraco { dn: number; z: number; declividade: number; modoCota: ModoCota; familiaId?: string }

/**
 * O que muda de uma ferramenta de traçado para outra (ficha C3): Tubo e Eletroduto usam o MESMO motor (`TuboTool`). `luvaEmLinha`:
 * trechos em linha reta ganham a luva do tipo (eletroduto vem em varas); `avisosDepois` devolve avisos do projeto já gravado.
 */
export interface ConfigTraco {
  id: string;
  nome: string;
  hint: string;
  opcoes: OpcoesTraco;
  familiaInicial: (fams: Project['componentFamilies'], escolhida: string | undefined) => string;
  luvaEmLinha: boolean;
  /** Ficha C8a: o trecho sai e chega de frente para a direção das entradas de caixa/dispositivo (`tuboCaminho.ts`). */
  respeitaEntradas?: boolean;
  avisosDepois?: (p: Project, ids: Id[]) => string[];
}

export const CONFIG_TUBO: ConfigTraco = {
  id: 'tubo',
  nome: 'Tubo',
  hint: 'Tubo: clique o ponto inicial e o final (Shift trava no eixo; digite o comprimento e Enter). Esc encerra a cadeia.',
  opcoes: opcoesTubo,
  familiaInicial: (fams, escolhida) => escolhida ?? idTuboDoProjeto(fams) ?? (fams?.[FAMILIA_TUBO_PADRAO] ? FAMILIA_TUBO_PADRAO : FAMILIA_TUBO_BIBLIOTECA),
  luvaEmLinha: false,
};

/** Tolerância mínima (m) da captura de ligação aberta; cresce com o zoom (8 px). */
const TOLERANCIA_MINIMA = 0.05;

/** Regras de conexão do trecho: as do tipo de tubulação da família (Krona etc.) ou as fixas do domínio; null se não há. */
function regrasDoDominio(ctx: ContextoTraco): RegrasConexao | null {
  return regrasDoTubo(ctx.familia.id, ctx.pontas.inicio.dominio);
}

/**
 * Ferramenta Tubo (ficha C5): dois cliques criam UMA instância da família de tubo entre os pontos (`trechoDeTubo`) e a conectam às
 * pontas encaixadas (`connectComponents`). A cadeia continua: o fim do trecho vira o início do próximo; Esc encerra. Shift trava no
 * eixo; um número digitado + Enter fixa o comprimento na direção do cursor.
 */
export class TuboTool extends ToolBase {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly pick3d = true;
  private inicio: PontoTubo | null = null;
  /** Recuos (m) a aplicar nas pontas dos trechos do passo atual, depois das conexões (tubo entra na bolsa). */
  private aparos: Aparo[] = [];
  private bloqueio: BloqueioTubo | null = null;
  /** Porta livre que o cursor pega agora (a do último `ponto`), para o halo forte da prévia. */
  private porta: LigacaoAberta | null = null;
  /** Meio de tubo que o cursor pega agora (snap 'derivar aqui', ficha F5). */
  private meio: MeioDeTubo | null = null;
  protected readonly opc: OpcoesTraco;

  constructor(env: ToolEnv, protected readonly cfg: ConfigTraco = CONFIG_TUBO) {
    super(env);
    this.id = cfg.id;
    this.label = cfg.nome;
    this.hint = cfg.hint;
    this.opc = cfg.opcoes;
  }

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.inicio = null;
    this.bloqueio = null;
  }

  protected busy(): boolean {
    return this.inicio !== null;
  }

  override inputPrompt(): string | null {
    return this.inicio ? this.t('tl_inp_length') : null;
  }

  /** Tab: lembra que o comprimento é digitável (o campo de valor recebe o número e o Enter confirma). */
  override tab(): void {
    if (this.inicio) this.env.say('Digite o comprimento do trecho e confirme com Enter.');
  }

  /** Família escolhida (opções) ou a padrão do domínio, e as pontas dela; avisa e devolve null se faltar algo. */
  private contexto(): ContextoTraco | null {
    const fams = this.env.project().componentFamilies;
    const id = this.cfg.familiaInicial(fams, this.env.options().componentFamilyId);
    // Sem a família no projeto, usa a da biblioteca MEP (ela entra no projeto junto com o primeiro trecho, em `criar`).
    const familia = fams?.[id] ?? familiaDaBiblioteca(id);
    if (!familia) {
      this.env.say(`${this.cfg.nome}: escolha uma família de tubo no painel (a família de tubo padrão ainda não está no projeto).`);
      return null;
    }
    const bitola = bitolaPermitida(familia.id, this.opc.dn);
    if (!bitola.ok) {
      this.env.say(`${this.cfg.nome}: ${bitola.motivo}`);
      return null;
    }
    const pontas = pontasDoTubo(familia, this.opc.dn);
    if (!pontas) {
      this.env.say(`${this.cfg.nome}: a família escolhida precisa de duas ligações (início e fim).`);
      return null;
    }
    return { familia, pontas };
  }

  /** Há redução no projeto: a captura de porta ignora a bitola. */
  private bitolaLivre(ctx: ContextoTraco): boolean {
    const regras = regrasDoDominio(ctx);
    return regras !== null && this.env.project().componentFamilies?.[regras.reducao] !== undefined;
  }

  /** Ponto do cursor: captura geral, trava de eixo (Shift ou Orto) e encaixe numa ligação aberta compatível. */
  private ponto(p: PointerInfo, ctx: ContextoTraco, ehFim: boolean): PontoTubo {
    const de = this.inicio ? { x: this.inicio.xyz[0], y: this.inicio.xyz[1] } : undefined;
    let at: Vec2 = this.snap(p, de ? { from: de } : {}).point;
    if (de && (p.shift || this.env.options().orthoLock)) {
      at = Math.abs(at.x - de.x) >= Math.abs(at.y - de.y) ? { x: at.x, y: de.y } : { x: de.x, y: at.y };
    }
    const tol = Math.max(TOLERANCIA_MINIMA, 8 * this.env.metersPerPixel());
    const projeto = this.env.project();
    const regras = regrasDoDominio(ctx);
    const achada = ligacaoProxima(at.x, at.y, ehFim ? ctx.pontas.fim : ctx.pontas.inicio, semOrigem(ligacoesAbertas(projeto), this.inicio?.xyz), tol, this.bitolaLivre(ctx), this.opc.z);
    this.porta = achada;
    this.meio = null;
    if (achada) {
      const [x, y, z] = achada.lig.posicaoMundo;
      // F3/F5: ponto, luminária, caixa, quadro e aparelho (dono que não é tubo nem peça de tubulação) exigem chegar de frente para a porta; a rota de derivação respeita isso nas duas ferramentas.
      const dono = (projeto.elements[achada.componentId] as Component).familyId;
      const categoria = projeto.componentFamilies?.[dono]?.categoria;
      const comEntrada = categoria !== 'eletroduto' && categoria !== 'tubulacao' && categoria !== 'conexao_tubo';
      return { xyz: [x, y, z], alvo: { componentId: achada.componentId, ligacaoId: achada.lig.id }, ...(comEntrada ? { direcao: achada.lig.direcaoMundo } : {}) };
    }
    // No meio de um tubo existente (Alt desliga): derivação com tê ou junção 45°, quando o tipo as tem; o snap pega o ponto do EIXO em planta, qualquer cota.
    const sob = p.alt ? null : this.meioSob(at, ctx, regras, tol);
    this.meio = sob;
    if (sob) return { xyz: sob.xyz, alvo: null, derivacao: true };
    // Declividade (M2): o ponto FINAL livre sobe ou desce em % da distância em planta; ponto encaixado ou derivação mantém a cota do alvo.
    const z = ehFim && this.inicio && this.opc.declividade !== 0 ? this.inicio.xyz[2] + (this.opc.declividade / 100) * Math.hypot(at.x - this.inicio.xyz[0], at.y - this.inicio.xyz[1]) : this.opc.z;
    return { xyz: [at.x, at.y, z], alvo: null };
  }

  /** Tubo da mesma família sob `at`: qualquer cota se o tipo deriva; só na cota da ferramenta se não deriva (o bloqueio avisa o motivo). */
  private meioSob(at: Vec2, ctx: ContextoTraco, regras: RegrasConexao | null, tol: number): MeioDeTubo | null {
    const projeto = this.env.project();
    const sem = tipoSemConexoes(ctx.familia.id) !== undefined;
    if (!sem && !(regras && temConexoes(projeto, regras))) return null;
    const deriva = !sem && regras !== null && (regras.te !== '' || regras.juncao45 !== '');
    return meioDeTubo(projeto, ctx.familia.id, at, this.opc.z, tol, tol, deriva ? Infinity : tol, this.inicio?.alvo?.componentId);
  }

  /** Ficha F5, 'Criar tubo a partir daqui': começa o traçado em `origem` (porta livre ou meio de tubo), como se o primeiro clique fosse ali. */
  iniciarEm(origem: PontoTubo): void {
    this.inicio = origem;
    this.bloqueio = null;
    this.env.say(`${this.cfg.nome}: clique o ponto final${origem.derivacao ? ' (a partir do meio do tubo: o tubo será dividido e entra o tê ou a junção)' : ''}.`);
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.raw = p.raw;
    const ctx = this.contexto();
    if (!ctx) return;
    const pt = this.ponto(p, ctx, this.inicio !== null);
    this.items.push(...itensDePortas(p.raw, this.inicio ? ctx.pontas.fim : ctx.pontas.inicio, semOrigem(ligacoesAbertas(this.env.project()), this.inicio?.xyz), this.porta, this.env.metersPerPixel(), this.bitolaLivre(ctx)), { kind: 'point', at: { x: pt.xyz[0], y: pt.xyz[1] } });
    if (this.meio) {
      const sem = semDerivacao(ctx.familia.id, regrasDoDominio(ctx), ctx.pontas.inicio.dominio);
      this.items.push(...itensDoMeio(this.meio, this.env.metersPerPixel(), sem ? 'Sem derivação neste tipo' : `Derivar aqui (DN ${this.meio.ext.dn})`));
    }
    // Prévia: o trecho que seria bloqueado fica VERMELHO com o motivo (mesma conta do clique, sem gravar); senão a ROTA inteira em fantasma
    // (reta, prumada ou rota até o alvo), com o alerta de ângulo sem peça.
    const v = this.inicio ? this.verificar(ctx, this.inicio, pt, []) : null;
    const hover = v?.bloqueio ?? null;
    if (this.inicio && hover) this.items.push(...itensDoBloqueio({ a: { x: this.inicio.xyz[0], y: this.inicio.xyz[1] }, b: { x: pt.xyz[0], y: pt.xyz[1] }, motivo: hover.motivo, sugestao: hover.sugestao }, true));
    else if (this.inicio && v) {
      const rota = v.pts.length > 2 ? v.pts : [this.inicio, pt];
      rota.slice(1).forEach((q, k) => this.items.push(...fantasmaDoTrecho(this.env.project(), v.dns?.[k] ?? this.opc.dn, (rota[k] as PontoTubo).xyz, q.xyz)));
      const angulo = alertaDeAngulo(this.env.project(), ctx.familia.id, this.opc.dn, regrasDoDominio(ctx), this.inicio, pt);
      if (angulo) this.items.push({ kind: 'label', at: { x: this.inicio.xyz[0], y: this.inicio.xyz[1] }, text: angulo });
    }
    if (this.bloqueio && !hover) this.items.push(...itensDoBloqueio(this.bloqueio));
  }

  override click(p: PointerInfo): void {
    const ctx = this.contexto();
    if (!ctx) return;
    const pt = this.ponto(p, ctx, this.inicio !== null);
    if (!this.inicio) {
      this.inicio = pt;
      this.env.say(`${this.cfg.nome}: clique o ponto final.`);
      return;
    }
    this.criar(ctx, this.inicio, pt);
  }

  /** Liga a ponta `ponta` ('a' início, 'b' fim) do trecho novo `id` ao que há no ponto `pt`: tubo aberto (curva, redução, luva) ou meio de tubo (tê). */
  protected ligarPonta(ctx: ContextoTraco, id: Id, ponta: 'a' | 'b', pt: PontoTubo, novo: TrechoEncontro, avisos: string[]): void {
    const minha = ponta === 'a' ? ctx.pontas.inicio.id : ctx.pontas.fim.id;
    const projeto = this.env.project();
    const regras = regrasDoDominio(ctx);
    if (pt.derivacao) {
      if (regras) derivarNoMeio(this.env, ctx, id, minha, ponta, pt, novo, regras, this.aparos, avisos);
      return;
    }
    if (!pt.alvo) return;
    const direto = (): void => this.env.exec({ type: 'connectComponents', a: id, ligacaoA: minha, b: pt.alvo!.componentId, ligacaoB: pt.alvo!.ligacaoId });
    const outro = projeto.elements[pt.alvo.componentId];
    const ext = isComponent(outro) && outro.familyId === ctx.familia.id ? extremosDoTubo(projeto, outro) : null;
    if (!ext || !regras) return direto();
    const r = avaliarEncontro({ a: ext.a, b: ext.b, dn: ext.dn }, pt.alvo.ligacaoId === ext.idA ? 'a' : 'b', novo, ponta, regras, projeto.componentFamilies);
    if (r.aviso) avisos.push(r.codigo === 'angulo_sem_peca' && ponta === 'a' ? avisoComSugestao(r.aviso, regras, { xyz: [...novo.a], alvo: null }, { xyz: [...novo.b], alvo: null }) : r.aviso);
    // Sem nenhuma conexão do domínio no projeto o tubo liga direto (como antes); com elas, ângulo sem regra fica sem ligação.
    if (!r.conexao) return temConexoes(projeto, regras) ? undefined : direto();
    // Luva: trechos em linha reta e do mesmo DN se ligam direto (o tubo é contínuo, não precisa de peça).
    if (r.conexao.tipo === 'luva' && !this.cfg.luvaEmLinha) return direto();
    const alvos = [{ componentId: pt.alvo.componentId, ligacaoId: pt.alvo.ligacaoId }, { componentId: id, ligacaoId: minha }];
    const pos = inserirConexao(this.env, r.conexao, pt.xyz, alvos, avisos);
    if (!pos) return direto();
    // Tubo entra na bolsa (ficha P2): cada trecho recua do encontro até a ponta ficar dentro da bolsa.
    this.aparos.push({ id: pt.alvo.componentId, ponta: pt.alvo.ligacaoId === ext.idA ? 'a' : 'b', recuo: pos.recuos[0] ?? 0 }, { id, ponta, recuo: pos.recuos[1] ?? 0 });
  }

  /** Guarda o bloqueio (prévia vermelha; a fala leva a sugestão só quando `naFala`, senão o motivo do ângulo fica como sempre). */
  private bloquear(a: PontoTubo, b: PontoTubo, motivo: string, sugestao: string | null, naFala: boolean): void {
    this.env.say('Bloqueado: ' + motivo + (naFala && sugestao ? ' ' + sugestao : ''));
    this.bloqueio = { a: { x: a.xyz[0], y: a.xyz[1] }, b: { x: b.xyz[0], y: b.xyz[1] }, motivo, sugestao };
    this.items = itensDoBloqueio(this.bloqueio);
  }

  /** Entrada da conferência (ficha F5, `tuboRota.ts`): o que a ferramenta sabe agora, sem gravar nada. */
  private entrada(ctx: ContextoTraco): EntradaRota {
    return { projeto: this.env.project(), ctx, regras: regrasDoDominio(ctx), levelId: this.env.levelId(), dn: this.opc.dn, modo: this.opc.modoCota, declividade: this.opc.declividade, luvaEmLinha: this.cfg.luvaEmLinha, respeitaEntradas: this.cfg.respeitaEntradas === true };
  }

  /**
   * Plano e viabilidade do trecho `a`→`b` SEM gravar (o clique e a prévia usam a mesma conta): a cadeia de pontos e de instâncias, ou o
   * bloqueio com motivo e sugestão (`naFala`: a sugestão entra na fala). Com meio de tubo na origem ou no alvo, a rota até lá (F5).
   */
  protected verificar(ctx: ContextoTraco, a: PontoTubo, b: PontoTubo, avisos: string[]): Verificacao {
    return verificarTraco(this.entrada(ctx), a, b, avisos);
  }

  private criar(ctx: ContextoTraco, a: PontoTubo, b: PontoTubo): void {
    const avisos: string[] = [];
    const v = this.verificar(ctx, a, b, avisos);
    if (v.bloqueio) return this.bloquear(a, b, v.bloqueio.motivo, v.bloqueio.sugestao, v.bloqueio.naFala);
    if (v.cadeia.some((c) => !c)) {
      this.env.say(`${this.cfg.nome}: os dois pontos coincidem; escolha um ponto final diferente.`);
      return;
    }
    const { pts } = v;
    const dns = v.dns ?? pts.slice(1).map(() => this.opc.dn);
    const cadeia = v.cadeia as Component[];
    try {
      this.env.transaction(`Desenhar ${this.cfg.nome.toLowerCase()}`, () => {
        garantirFamilias(this.env, ctx, regrasDoDominio(ctx));
        this.aparos = [];
        cadeia.forEach((c, k) => {
          const de = pts[k] as PontoTubo;
          const para = pts[k + 1] as PontoTubo;
          const novo: TrechoEncontro = { a: de.xyz, b: para.xyz, dn: dns[k] as number };
          this.env.exec({ type: 'addComponent', component: c });
          // O início de cada trecho liga ao fim do anterior pelo mesmo caminho dos cantos em L (`ligarPonta`).
          const anterior = cadeia[k - 1];
          this.ligarPonta(ctx, c.id, 'a', anterior ? { xyz: de.xyz, alvo: { componentId: anterior.id, ligacaoId: ctx.pontas.fim.id } } : de, novo, avisos);
          if (k === cadeia.length - 1) this.ligarPonta(ctx, c.id, 'b', para, novo, avisos);
        });
        for (const ap of this.aparos) aparar(this.env, ap.id, ap.ponta, ap.recuo, avisos);
      });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : String(e));
      this.reset();
      return;
    }
    this.items = [];
    this.bloqueio = null;
    avisos.push(...(this.cfg.avisosDepois?.(this.env.project(), cadeia.map((c) => c.id)) ?? []));
    const extra = avisos.length ? ' ' + avisos.join(' ') : '';
    const id = (cadeia[cadeia.length - 1] as Component).id;
    if (b.alvo || b.derivacao) {
      this.inicio = null;
      this.env.say(`${this.cfg.nome} ligado à rede. Clique para iniciar outro trecho; Esc sai.` + extra);
    } else {
      this.inicio = { xyz: b.xyz, alvo: { componentId: id, ligacaoId: ctx.pontas.fim.id } };
      this.env.say(`${this.cfg.nome} criado. Clique o próximo ponto para continuar; Esc encerra a cadeia.` + extra);
    }
  }

  /** Comprimento digitado: o fim fica a essa distância do início, na direção do cursor. */
  override type(text: string): boolean {
    const ctx = this.contexto();
    if (!ctx || !this.inicio) return false;
    const v = lerComprimentoDigitado(this.env, text);
    if (v === null || v <= 0) return false;
    const a = this.inicio.xyz;
    const ref = this.inf?.point ?? this.raw;
    const h = Math.hypot(ref.x - a[0], ref.y - a[1]);
    const ux = h < 1e-9 ? 1 : (ref.x - a[0]) / h;
    const uy = h < 1e-9 ? 0 : (ref.y - a[1]) / h;
    this.criar(ctx, this.inicio, { xyz: [a[0] + ux * v, a[1] + uy * v, a[2] + (this.opc.declividade / 100) * v], alvo: null });
    return true;
  }
}
