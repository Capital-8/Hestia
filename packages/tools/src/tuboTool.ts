import type { Vec2 } from '@hestia/geom';
import { avaliarDerivacao, avaliarEncontro, bitolaPermitida, comprimentoDoSegmento, idTuboDoProjeto, posicionarConexao, regrasDoTubo, trechoDeTubo, type ConexaoEncontro, type PontoSegmento, type PosicaoConexao, type RegrasConexao, type TrechoEncontro } from '@hestia/engine';
import { familiaDaBiblioteca, isComponent, newId, type Component, type Id, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import { extremosDoTubo, tuboSob, type PontoTubo } from './tuboGeometria.ts';
import { viabilidadeDoTrecho } from './tuboViabilidade.ts';
import { planejarPrumada, recuosDoJoelho, type ModoCota, type PlanoPrumada } from './tuboPrumada.ts';
import { eixoDaDirecao, eixoOposto, planejarCaminhoOrtogonal } from './tuboCaminho.ts';
import { alertaDeAngulo, avisoComSugestao, itensDoBloqueio, sugestaoDeBloqueio, type BloqueioTubo } from './tuboBloqueio.ts';
import { lerComprimentoDigitado } from './desenhoPolilinha.ts';
import { fantasmaDoTrecho, ligacaoProxima, ligacoesAbertas, pontasDoTubo, temConexoes, type ContextoTraco } from './tuboApoio.ts';
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

/** Margem (m) somada ao dobro do recuo da curva para o menor trecho entre dois joelhos, e desvio (m) de U/Z sem curva no catálogo. PROVISÓRIOS, não vêm de catálogo nem de norma: CONFERIR. */
const MARGEM_ENTRE_JOELHOS = 0.02;
const DESVIO_SEM_CURVA = 0.1;

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
  private aparos: Array<{ id: Id; ponta: 'a' | 'b'; recuo: number }> = [];
  private bloqueio: BloqueioTubo | null = null;
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
    const bitolaLivre = regras !== null && projeto.componentFamilies?.[regras.reducao] !== undefined;
    const achada = ligacaoProxima(at.x, at.y, ehFim ? ctx.pontas.fim : ctx.pontas.inicio, ligacoesAbertas(projeto), tol, bitolaLivre, this.opc.z);
    if (achada) {
      const [x, y, z] = achada.lig.posicaoMundo;
      const comEntrada = this.cfg.respeitaEntradas && projeto.componentFamilies?.[(projeto.elements[achada.componentId] as Component).familyId]?.categoria === 'dispositivo_eletrico';
      return { xyz: [x, y, z], alvo: { componentId: achada.componentId, ligacaoId: achada.lig.id }, ...(comEntrada ? { direcao: achada.lig.direcaoMundo } : {}) };
    }
    // No meio de um tubo existente: derivação (tê ou junção 45°), quando o projeto tem as conexões do domínio.
    const sob = regras && temConexoes(projeto, regras) ? tuboSob(projeto, ctx.familia.id, [at.x, at.y, this.opc.z], tol, tol) : null;
    if (sob) return { xyz: sob.xyz, alvo: null, derivacao: true };
    // Declividade (M2): o ponto FINAL livre sobe ou desce em % da distância em planta; ponto encaixado ou derivação mantém a cota do alvo.
    const z = ehFim && this.inicio && this.opc.declividade !== 0 ? this.inicio.xyz[2] + (this.opc.declividade / 100) * Math.hypot(at.x - this.inicio.xyz[0], at.y - this.inicio.xyz[1]) : this.opc.z;
    return { xyz: [at.x, at.y, z], alvo: null };
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.raw = p.raw;
    const ctx = this.contexto();
    if (!ctx) return;
    const pt = this.ponto(p, ctx, this.inicio !== null);
    this.items.push({ kind: 'point', at: { x: pt.xyz[0], y: pt.xyz[1] } });
    // Prévia: o trecho que seria bloqueado fica VERMELHO com o motivo (mesma conta do clique, sem gravar); senão o fantasma, com o alerta de ângulo sem peça.
    const hover = this.inicio ? this.verificar(ctx, this.inicio, pt, []).bloqueio : null;
    if (this.inicio && hover) this.items.push(...itensDoBloqueio({ a: { x: this.inicio.xyz[0], y: this.inicio.xyz[1] }, b: { x: pt.xyz[0], y: pt.xyz[1] }, motivo: hover.motivo, sugestao: hover.sugestao }, true));
    else if (this.inicio) {
      this.items.push(...fantasmaDoTrecho(this.env.project(), this.opc.dn, this.inicio.xyz, pt.xyz));
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

  /** Instala a conexão `c` em `ponto` e liga cada boca ao trecho correspondente de `alvos` (mesma ordem de `c.direcoes`); false se faltar a família ou a geometria não casar. */
  private inserirConexao(c: ConexaoEncontro, ponto: PontoSegmento, alvos: Array<{ componentId: Id; ligacaoId: string }>, avisos: string[]): PosicaoConexao | null {
    const fam = this.env.project().componentFamilies?.[c.familiaId];
    if (!fam) {
      avisos.push(`A família de conexão ${c.familiaId} não está no projeto: trechos ligados direto.`);
      return null;
    }
    const pos = posicionarConexao(fam, ponto, c);
    if (!pos) {
      avisos.push(`A família ${c.familiaId} não tem as ligações esperadas: trechos ligados direto.`);
      return null;
    }
    const cid = newId('cm');
    this.env.exec({ type: 'addComponent', component: { id: cid, kind: 'component', familyId: fam.id, typeId: pos.typeId ?? null, levelId: this.env.levelId(), x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: '' } });
    alvos.forEach((al, k) => this.env.exec({ type: 'connectComponents', a: cid, ligacaoA: pos.ligacoes[k] ?? '', b: al.componentId, ligacaoB: al.ligacaoId }));
    return pos;
  }

  /** Liga a ponta `ponta` ('a' início, 'b' fim) do trecho novo `id` ao que há no ponto `pt`: tubo aberto (curva, redução, luva) ou meio de tubo (tê). */
  protected ligarPonta(ctx: ContextoTraco, id: Id, ponta: 'a' | 'b', pt: PontoTubo, novo: TrechoEncontro, avisos: string[]): void {
    const minha = ponta === 'a' ? ctx.pontas.inicio.id : ctx.pontas.fim.id;
    const projeto = this.env.project();
    const regras = regrasDoDominio(ctx);
    if (pt.derivacao) {
      if (regras) this.derivar(ctx, id, minha, ponta, pt, novo, regras, avisos);
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
    const pos = this.inserirConexao(r.conexao, pt.xyz, alvos, avisos);
    if (!pos) return direto();
    // Tubo entra na bolsa (ficha P2): cada trecho recua do encontro até a ponta ficar dentro da bolsa.
    this.aparos.push({ id: pt.alvo.componentId, ponta: pt.alvo.ligacaoId === ext.idA ? 'a' : 'b', recuo: pos.recuos[0] ?? 0 }, { id, ponta, recuo: pos.recuos[1] ?? 0 });
  }

  /** Derivação: divide o tubo sob `pt` em dois (o primeiro mantém o id) e instala o tê ou a junção ligando principal, principal e ramal. */
  private derivar(ctx: ContextoTraco, id: Id, minha: string, ponta: 'a' | 'b', pt: PontoTubo, novo: TrechoEncontro, regras: RegrasConexao, avisos: string[]): void {
    const alvo = tuboSob(this.env.project(), ctx.familia.id, pt.xyz, 1e-6, 1e-6, id);
    if (!alvo) return;
    const { c: t, ext } = alvo;
    const r = avaliarDerivacao({ a: ext.a, b: ext.b, dn: ext.dn }, pt.xyz, novo, ponta, regras);
    const fam = r.conexao ? this.env.project().componentFamilies?.[r.conexao.familiaId] : undefined;
    if (!r.conexao || !fam || !posicionarConexao(fam, pt.xyz, r.conexao)) {
      avisos.push(r.aviso ?? 'Derivação sem a família de conexão no projeto: o trecho fica solto.');
      return;
    }
    const idT2 = newId('cm');
    const base = { id: idT2, levelId: t.levelId };
    const segundo = trechoDeTubo(pt.xyz, ext.b, ctx.familia, ext.dn, base);
    if (!segundo) return;
    const primeiroL = comprimentoDoSegmento(ext.a, pt.xyz) * 1000;
    const antigoFim = t.ligacoes?.[ext.idB];
    this.env.exec({ type: 'addComponent', component: { ...segundo, values: { ...t.values, L: comprimentoDoSegmento(pt.xyz, ext.b) * 1000 } } });
    if (antigoFim) this.env.exec({ type: 'disconnectComponents', a: t.id, ligacaoA: ext.idB });
    this.env.exec({ type: 'updateComponent', id: t.id, patch: { values: { ...t.values, L: primeiroL } } });
    if (antigoFim) this.env.exec({ type: 'connectComponents', a: idT2, ligacaoA: ext.idB, b: antigoFim.componenteId, ligacaoB: antigoFim.ligacaoId });
    const pos = this.inserirConexao(r.conexao, pt.xyz, [{ componentId: t.id, ligacaoId: ext.idB }, { componentId: idT2, ligacaoId: ext.idA }, { componentId: id, ligacaoId: minha }], avisos);
    if (pos) this.aparos.push({ id: t.id, ponta: 'b', recuo: pos.recuos[0] ?? 0 }, { id: idT2, ponta: 'a', recuo: pos.recuos[1] ?? 0 }, { id, ponta, recuo: pos.recuos[2] ?? 0 });
  }

  /**
   * Grava no projeto (dentro da transação do trecho) a família de tubo vinda da biblioteca MEP e, só então, as famílias de conexão do
   * domínio. Projeto que já tem o tubo (inclusive fixtures) não ganha conexões novas por trás.
   */
  private garantirFamilias(ctx: ContextoTraco): void {
    if (this.env.project().componentFamilies?.[ctx.familia.id] !== undefined) return;
    const regras = regrasDoDominio(ctx);
    const ids = new Set<string>([ctx.familia.id, ...(regras ? Object.values(regras) : [])]);
    for (const id of ids) {
      if (this.env.project().componentFamilies?.[id] !== undefined) continue;
      const f = familiaDaBiblioteca(id);
      if (f) this.env.exec({ type: 'upsertFamily', family: structuredClone(f) });
    }
  }

  /** Encurta a ponta `ponta` do trecho `id` em `recuo` (m) rumo à outra ponta; recuo maior que o trecho é ignorado com aviso. */
  private aparar(id: Id, ponta: 'a' | 'b', recuo: number, avisos: string[]): void {
    if (recuo < 1e-9) return;
    const projeto = this.env.project();
    const c = projeto.elements[id];
    const ext = isComponent(c) ? extremosDoTubo(projeto, c) : null;
    if (!isComponent(c) || !ext) return;
    const total = comprimentoDoSegmento(ext.a, ext.b);
    if (recuo >= total - 1e-4) {
      avisos.push('Trecho curto demais para a bolsa da conexão: ele não foi encurtado.');
      return;
    }
    const k = recuo / total;
    const de = ponta === 'a' ? ext.a : ext.b;
    const para = ponta === 'a' ? ext.b : ext.a;
    const novo: PontoSegmento = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k, de[2] + (para[2] - de[2]) * k];
    const a = ponta === 'a' ? novo : ext.a;
    const b = ponta === 'a' ? ext.b : novo;
    const t = trechoDeTubo(a, b, { id: c.familyId }, ext.dn, { id, levelId: c.levelId });
    if (!t) return;
    this.env.exec({ type: 'updateComponent', id, patch: { x: t.x, y: t.y, z: t.z, rotation: t.rotation, inclinacao: t.inclinacao, values: { ...c.values, L: (total - recuo) * 1000 } } });
  }

  /** Guarda o bloqueio (prévia vermelha; a fala leva a sugestão só quando `naFala`, senão o motivo do ângulo fica como sempre). */
  private bloquear(a: PontoTubo, b: PontoTubo, motivo: string, sugestao: string | null, naFala: boolean): void {
    this.env.say('Bloqueado: ' + motivo + (naFala && sugestao ? ' ' + sugestao : ''));
    this.bloqueio = { a: { x: a.xyz[0], y: a.xyz[1] }, b: { x: b.xyz[0], y: b.xyz[1] }, motivo, sugestao };
    this.items = itensDoBloqueio(this.bloqueio);
  }

  /**
   * Cria o trecho `a`→`b`, divide tubos onde há derivação, instala as conexões e liga as pontas: tudo num único passo de desfazer. Com
   * mudança de cota (ficha B4, `planejarPrumada`) o trecho vira uma cadeia de tubos ligados por joelhos. A cadeia continua do fim
   * (a menos que o fim tenha encaixado numa rede).
   */
  /**
   * Plano do trecho. Com entrada de caixa ou dispositivo numa ponta (ficha C8a) o caminho é calculado em 90° respeitando a direção
   * dela; sem caminho (peça girada fora dos eixos, mais de 4 joelhos) cai no plano de sempre e o aviso entra na fala.
   */
  private planejar(ctx: ContextoTraco, a: PontoTubo, b: PontoTubo, avisos: string[]): PlanoPrumada {
    const saida = a.direcao ? eixoDaDirecao(a.direcao) : null;
    const dirB = b.direcao ? eixoDaDirecao(b.direcao) : null;
    if ((saida || dirB) && this.cfg.respeitaEntradas && this.opc.declividade === 0 && this.opc.modoCota !== 'diagonal') {
      const [r0, r1] = recuosDoJoelho(this.env.project(), regrasDoDominio(ctx), this.opc.dn, [0, 0, 0], [1, 0, 0], [1, 1, 0]);
      const recuo = Math.max(r0, r1);
      const caminho = planejarCaminhoOrtogonal(a.xyz, b.xyz, saida, dirB ? eixoOposto(dirB) : null, this.opc.modoCota, recuo > 0 ? 2 * recuo + MARGEM_ENTRE_JOELHOS : 0.05, recuo > 0 ? 3 * recuo : DESVIO_SEM_CURVA);
      if (caminho) return { bloqueio: null, intermediarios: caminho.intermediarios };
      avisos.push('Sem caminho em 90° que respeite a direção das entradas: o trecho foi ligado direto e a rede pode acusar ligação incompatível.');
    }
    return planejarPrumada(a.xyz, b.xyz, this.opc.modoCota, this.opc.declividade, ctx.familia.id);
  }

  /**
   * Plano e viabilidade do trecho `a`→`b` SEM gravar (o clique e a prévia usam a mesma conta): a cadeia de pontos e de instâncias, ou o
   * bloqueio com motivo e sugestão (`naFala`: a sugestão entra na fala). Viabilidade (ficha B2) com os recuos reais de cada nó, inclusive os joelhos internos.
   */
  protected verificar(ctx: ContextoTraco, a: PontoTubo, b: PontoTubo, avisos: string[]): { bloqueio: { motivo: string; sugestao: string | null; naFala: boolean } | null; pts: PontoTubo[]; cadeia: Array<Component | null> } {
    const regras = regrasDoDominio(ctx);
    const plano = this.planejar(ctx, a, b, avisos);
    if (plano.bloqueio !== null) return { bloqueio: { motivo: plano.bloqueio, sugestao: sugestaoDeBloqueio(regras, 'angulo', a, b, undefined, () => true), naFala: false }, pts: [], cadeia: [] };
    const pts: PontoTubo[] = [a, ...plano.intermediarios.map((q): PontoTubo => ({ xyz: [q[0], q[1], q[2]], alvo: null })), b];
    const base = { levelId: this.env.levelId() };
    const cadeia = pts.slice(1).map((q, k) => trechoDeTubo((pts[k] as PontoTubo).xyz, q.xyz, ctx.familia, this.opc.dn, { id: newId('cm'), ...base }));
    if (cadeia.some((c) => !c)) return { bloqueio: null, pts, cadeia };
    const projeto = this.env.project();
    const joelhos = pts.map((q, k) => (k > 0 && k < pts.length - 1 ? recuosDoJoelho(projeto, regras, this.opc.dn, (pts[k - 1] as PontoTubo).xyz, q.xyz, (pts[k + 1] as PontoTubo).xyz) : ([0, 0] as [number, number])));
    const viabilidade = (de: PontoTubo, para: PontoTubo, recuos?: { a: number; b: number }) => viabilidadeDoTrecho(projeto, ctx.familia, ctx.pontas.inicio.dominio, regras, this.opc.dn, de, para, recuos, this.cfg.luvaEmLinha);
    for (let k = 0; k < cadeia.length; k++) {
      const viab = viabilidade(pts[k] as PontoTubo, pts[k + 1] as PontoTubo, { a: (joelhos[k] as [number, number])[1], b: (joelhos[k + 1] as [number, number])[0] });
      if (viab.bloqueio) return { bloqueio: { motivo: viab.bloqueio, sugestao: sugestaoDeBloqueio(regras, viab.codigo, a, b, viab.faltam, (c) => viabilidade(a, c).bloqueio === null), naFala: true }, pts, cadeia };
      avisos.push(...viab.avisos);
    }
    return { bloqueio: null, pts, cadeia };
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
    const cadeia = v.cadeia as Component[];
    try {
      this.env.transaction(`Desenhar ${this.cfg.nome.toLowerCase()}`, () => {
        this.garantirFamilias(ctx);
        this.aparos = [];
        cadeia.forEach((c, k) => {
          const de = pts[k] as PontoTubo;
          const para = pts[k + 1] as PontoTubo;
          const novo: TrechoEncontro = { a: de.xyz, b: para.xyz, dn: this.opc.dn };
          this.env.exec({ type: 'addComponent', component: c });
          // O início de cada trecho liga ao fim do anterior pelo mesmo caminho dos cantos em L (`ligarPonta`).
          const anterior = cadeia[k - 1];
          this.ligarPonta(ctx, c.id, 'a', anterior ? { xyz: de.xyz, alvo: { componentId: anterior.id, ligacaoId: ctx.pontas.fim.id } } : de, novo, avisos);
          if (k === cadeia.length - 1) this.ligarPonta(ctx, c.id, 'b', para, novo, avisos);
        });
        for (const ap of this.aparos) this.aparar(ap.id, ap.ponta, ap.recuo, avisos);
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
