import type { Vec2 } from '@hestia/geom';
import { avaliarDerivacao, avaliarEncontro, bitolaPermitida, comprimentoDoSegmento, encaixarLigacoes, idTuboDoProjeto, ligacaoNoMundo, posicionarConexao, regrasDoTubo, resolverComponente, resolverFamilia, trechoDeTubo, type ConexaoEncontro, type LigacaoNoMundo, type LigacaoResolvida, type PontoSegmento, type PosicaoConexao, type RegrasConexao, type TrechoEncontro } from '@hestia/engine';
import { familiaDaBiblioteca, formatQuantity, isComponent, newId, unitsOf, type Component, type Familia, type Id, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import { extremosDoTubo, tuboSob, type PontoTubo } from './tuboGeometria.ts';
import { viabilidadeDoTrecho } from './tuboViabilidade.ts';
import { lerComprimentoDigitado } from './desenhoPolilinha.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/** Família de tubo de reserva: usada quando o projeto não tem o tubo real de nenhum domínio (`CONEXOES_POR_DOMINIO`, ficha F1). */
export const FAMILIA_TUBO_PADRAO = 'tubo-padrao';

/** Tubo real do domínio esgoto (ficha F1/F1b): carregado da biblioteca MEP quando o projeto não tem nenhum tubo. */
export const FAMILIA_TUBO_BIBLIOTECA = 'fam_tubo_esgoto';

/**
 * Ajustes da ferramenta que o painel `TuboProperties` edita: DN em mm, altura (z) dos pontos clicados em m e declividade (ficha M2) em %:
 * com valor, o ponto final fica a `declividade` % da distância em planta acima (positiva) ou abaixo (negativa) do inicial. 0 = nível.
 */
export const opcoesTubo: { dn: number; z: number; declividade: number } = { dn: 50, z: 0, declividade: 0 };

/** Tolerância mínima (m) da captura de ligação aberta; cresce com o zoom (8 px). */
const TOLERANCIA_MINIMA = 0.05;

/** As duas pontas do tubo: a ligação do início (menor z local) e a do fim (maior z local). */
interface PontasDoTubo {
  inicio: LigacaoResolvida;
  fim: LigacaoResolvida;
}

/** Contexto da ferramenta: a família do tubo e as pontas dela. */
interface Contexto {
  familia: Familia;
  pontas: PontasDoTubo;
}

/** Regras de conexão do trecho: as do tipo de tubulação da família (Krona etc.) ou as fixas do domínio; null se não há. */
function regrasDoDominio(ctx: Contexto): RegrasConexao | null {
  return regrasDoTubo(ctx.familia.id, ctx.pontas.inicio.dominio);
}

/** Verdadeiro se o projeto tem alguma família de conexão (não o tubo) das regras. */
function temConexoes(p: Project, r: RegrasConexao): boolean {
  return Object.entries(r).some(([k, id]) => k !== 'tubo' && id !== '' && p.componentFamilies?.[id] !== undefined);
}

/** Ligação aberta de uma instância do projeto, já no mundo. */
interface LigacaoAberta {
  componentId: Id;
  lig: LigacaoNoMundo;
}

/** Pontas da família para o DN pedido (resolve com `L` de 1 m só para achar as posições); null se não tem duas ligações. */
export function pontasDoTubo(familia: Familia, dn: number): PontasDoTubo | null {
  const ligs = [...resolverFamilia(familia, { valores: { DN: dn, L: 1000 } }).ligacoes ?? []].sort((a, b) => a.posicao[2] - b.posicao[2]);
  const inicio = ligs[0];
  const fim = ligs[ligs.length - 1];
  return ligs.length >= 2 && inicio && fim ? { inicio, fim } : null;
}

/** Ligações abertas por projeto (N4): o mouse pedia a lista a cada movimento; o projeto novo a cada comando invalida sozinho. */
const ABERTAS = new WeakMap<Project, LigacaoAberta[]>();

/** Ligações abertas (sem conexão) de todas as instâncias do projeto, no mundo. */
function ligacoesAbertas(p: Project): LigacaoAberta[] {
  const guardada = ABERTAS.get(p);
  if (guardada) return guardada;
  const saida: LigacaoAberta[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || !p.componentFamilies?.[e.familyId]?.ligacoes?.length) continue;
    for (const lig of resolverComponente(p, e).ligacoes ?? []) {
      if (e.ligacoes?.[lig.id] === undefined) saida.push({ componentId: e.id, lig: ligacaoNoMundo(lig, e) });
    }
  }
  ABERTAS.set(p, saida);
  return saida;
}

/**
 * Ligação aberta mais próxima de `(x, y)` que casa com a ponta do tubo (domínio, seção, DN e fluxo, por `encaixarLigacoes`).
 * Em planta o z do cursor é desconhecido: a distância usa o z da própria candidata. A direção do tubo ainda não existe (depende
 * do outro ponto), então a ponta é posta de frente para a candidata; `bitolaLivre` (há redução no projeto) ignora o DN.
 */
function ligacaoProxima(x: number, y: number, ponta: LigacaoResolvida, abertas: LigacaoAberta[], tolerancia: number, bitolaLivre = false): LigacaoAberta | null {
  let melhor: LigacaoAberta | null = null;
  let melhorD = Infinity;
  for (const c of abertas) {
    const alvo: LigacaoNoMundo = { ...ponta, ...(bitolaLivre ? { diametro: c.lig.diametro } : {}), posicaoMundo: [x, y, c.lig.posicaoMundo[2]], direcaoMundo: [-c.lig.direcaoMundo[0], -c.lig.direcaoMundo[1], -c.lig.direcaoMundo[2]] };
    const r = encaixarLigacoes(alvo, [c.lig], tolerancia);
    if (r === null) continue;
    const d = Math.hypot(r.deslocamento[0], r.deslocamento[1], r.deslocamento[2]);
    if (d < melhorD) {
      melhor = c;
      melhorD = d;
    }
  }
  return melhor;
}

/**
 * Ferramenta Tubo (ficha C5): dois cliques criam UMA instância da família de tubo entre os pontos (`trechoDeTubo`) e a conectam às
 * pontas encaixadas (`connectComponents`). A cadeia continua: o fim do trecho vira o início do próximo; Esc encerra. Shift trava no
 * eixo; um número digitado + Enter fixa o comprimento na direção do cursor.
 */
export class TuboTool extends ToolBase {
  readonly id = 'tubo';
  readonly label = 'Tubo';
  readonly hint = 'Tubo: clique o ponto inicial e o final (Shift trava no eixo; digite o comprimento e Enter). Esc encerra a cadeia.';
  readonly pick3d = true;
  private inicio: PontoTubo | null = null;
  /** Recuos (m) a aplicar nas pontas dos trechos do passo atual, depois das conexões (tubo entra na bolsa). */
  private aparos: Array<{ id: Id; ponta: 'a' | 'b'; recuo: number }> = [];

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.inicio = null;
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
  private contexto(): Contexto | null {
    const fams = this.env.project().componentFamilies;
    const id = this.env.options().componentFamilyId ?? idTuboDoProjeto(fams) ?? (fams?.[FAMILIA_TUBO_PADRAO] ? FAMILIA_TUBO_PADRAO : FAMILIA_TUBO_BIBLIOTECA);
    // Sem a família no projeto, usa a da biblioteca MEP (ela entra no projeto junto com o primeiro trecho, em `criar`).
    const familia = fams?.[id] ?? familiaDaBiblioteca(id);
    if (!familia) {
      this.env.say('Tubo: escolha uma família de tubo no painel (a família de tubo padrão ainda não está no projeto).');
      return null;
    }
    const bitola = bitolaPermitida(familia.id, opcoesTubo.dn);
    if (!bitola.ok) {
      this.env.say(`Tubo: ${bitola.motivo}`);
      return null;
    }
    const pontas = pontasDoTubo(familia, opcoesTubo.dn);
    if (!pontas) {
      this.env.say('Tubo: a família escolhida precisa de duas ligações (início e fim).');
      return null;
    }
    return { familia, pontas };
  }

  /** Ponto do cursor: captura geral, trava de eixo (Shift ou Orto) e encaixe numa ligação aberta compatível. */
  private ponto(p: PointerInfo, ctx: Contexto, ehFim: boolean): PontoTubo {
    const de = this.inicio ? { x: this.inicio.xyz[0], y: this.inicio.xyz[1] } : undefined;
    let at: Vec2 = this.snap(p, de ? { from: de } : {}).point;
    if (de && (p.shift || this.env.options().orthoLock)) {
      at = Math.abs(at.x - de.x) >= Math.abs(at.y - de.y) ? { x: at.x, y: de.y } : { x: de.x, y: at.y };
    }
    const tol = Math.max(TOLERANCIA_MINIMA, 8 * this.env.metersPerPixel());
    const projeto = this.env.project();
    const regras = regrasDoDominio(ctx);
    const bitolaLivre = regras !== null && projeto.componentFamilies?.[regras.reducao] !== undefined;
    const achada = ligacaoProxima(at.x, at.y, ehFim ? ctx.pontas.fim : ctx.pontas.inicio, ligacoesAbertas(projeto), tol, bitolaLivre);
    if (achada) {
      const [x, y, z] = achada.lig.posicaoMundo;
      return { xyz: [x, y, z], alvo: { componentId: achada.componentId, ligacaoId: achada.lig.id } };
    }
    // No meio de um tubo existente: derivação (tê ou junção 45°), quando o projeto tem as conexões do domínio.
    const sob = regras && temConexoes(projeto, regras) ? tuboSob(projeto, ctx.familia.id, [at.x, at.y, opcoesTubo.z], tol, tol) : null;
    if (sob) return { xyz: sob.xyz, alvo: null, derivacao: true };
    // Declividade (M2): o ponto FINAL livre sobe ou desce em % da distância em planta; ponto encaixado ou derivação mantém a cota do alvo.
    const z = ehFim && this.inicio && opcoesTubo.declividade !== 0 ? this.inicio.xyz[2] + (opcoesTubo.declividade / 100) * Math.hypot(at.x - this.inicio.xyz[0], at.y - this.inicio.xyz[1]) : opcoesTubo.z;
    return { xyz: [at.x, at.y, z], alvo: null };
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.raw = p.raw;
    const ctx = this.contexto();
    if (!ctx) return;
    const pt = this.ponto(p, ctx, this.inicio !== null);
    this.items.push({ kind: 'point', at: { x: pt.xyz[0], y: pt.xyz[1] } });
    if (this.inicio) this.items.push(...this.fantasma(this.inicio.xyz, pt.xyz));
  }

  /** Fantasma do trecho: faixa de largura DN, eixo tracejado e o comprimento. */
  private fantasma(a: PontoSegmento, b: PontoSegmento): PreviewItem[] {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const h = Math.hypot(dx, dy);
    const A: Vec2 = { x: a[0], y: a[1] };
    const B: Vec2 = { x: b[0], y: b[1] };
    const itens: PreviewItem[] = [{ kind: 'line', a: A, b: B, dashed: true }];
    if (h > 1e-9) {
      const m = opcoesTubo.dn / 2000;
      const nx = (-dy / h) * m;
      const ny = (dx / h) * m;
      itens.push({ kind: 'polygon', ring: [{ x: A.x + nx, y: A.y + ny }, { x: B.x + nx, y: B.y + ny }, { x: B.x - nx, y: B.y - ny }, { x: A.x - nx, y: A.y - ny }], dashed: true });
    }
    const L = comprimentoDoSegmento(a, b);
    itens.push({ kind: 'label', at: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, text: formatQuantity(unitsOf(this.env.project()), 'length', L) });
    return itens;
  }

  override click(p: PointerInfo): void {
    const ctx = this.contexto();
    if (!ctx) return;
    const pt = this.ponto(p, ctx, this.inicio !== null);
    if (!this.inicio) {
      this.inicio = pt;
      this.env.say('Tubo: clique o ponto final.');
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
    this.env.exec({ type: 'addComponent', component: { id: cid, kind: 'component', familyId: fam.id, typeId: null, levelId: this.env.levelId(), x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: '' } });
    alvos.forEach((al, k) => this.env.exec({ type: 'connectComponents', a: cid, ligacaoA: pos.ligacoes[k] ?? '', b: al.componentId, ligacaoB: al.ligacaoId }));
    return pos;
  }

  /** Liga a ponta `ponta` ('a' início, 'b' fim) do trecho novo `id` ao que há no ponto `pt`: tubo aberto (curva, redução, luva) ou meio de tubo (tê). */
  private ligarPonta(ctx: Contexto, id: Id, ponta: 'a' | 'b', pt: PontoTubo, novo: TrechoEncontro, avisos: string[]): void {
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
    const r = avaliarEncontro({ a: ext.a, b: ext.b, dn: ext.dn }, pt.alvo.ligacaoId === ext.idA ? 'a' : 'b', novo, ponta, regras);
    if (r.aviso) avisos.push(r.aviso);
    // Sem nenhuma conexão do domínio no projeto o tubo liga direto (como antes); com elas, ângulo sem regra fica sem ligação.
    if (!r.conexao) return temConexoes(projeto, regras) ? undefined : direto();
    // Luva: trechos em linha reta e do mesmo DN se ligam direto (o tubo é contínuo, não precisa de peça).
    if (r.conexao.tipo === 'luva') return direto();
    const alvos = [{ componentId: pt.alvo.componentId, ligacaoId: pt.alvo.ligacaoId }, { componentId: id, ligacaoId: minha }];
    const pos = this.inserirConexao(r.conexao, pt.xyz, alvos, avisos);
    if (!pos) return direto();
    // Tubo entra na bolsa (ficha P2): cada trecho recua do encontro até a ponta ficar dentro da bolsa.
    this.aparos.push({ id: pt.alvo.componentId, ponta: pt.alvo.ligacaoId === ext.idA ? 'a' : 'b', recuo: pos.recuos[0] ?? 0 }, { id, ponta, recuo: pos.recuos[1] ?? 0 });
  }

  /** Derivação: divide o tubo sob `pt` em dois (o primeiro mantém o id) e instala o tê ou a junção ligando principal, principal e ramal. */
  private derivar(ctx: Contexto, id: Id, minha: string, ponta: 'a' | 'b', pt: PontoTubo, novo: TrechoEncontro, regras: RegrasConexao, avisos: string[]): void {
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
  private garantirFamilias(ctx: Contexto): void {
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

  /** Cria o trecho `a`→`b`, divide tubos onde há derivação, instala as conexões e liga as pontas: tudo num único passo de desfazer. A cadeia continua do fim (a menos que o fim tenha encaixado numa rede). */
  private criar(ctx: Contexto, a: PontoTubo, b: PontoTubo): void {
    const id = newId('cm');
    const c = trechoDeTubo(a.xyz, b.xyz, ctx.familia, opcoesTubo.dn, { id, levelId: this.env.levelId() });
    if (!c) {
      this.env.say('Tubo: os dois pontos coincidem; escolha um ponto final diferente.');
      return;
    }
    // Viabilidade (ficha B2), com os recuos reais, ANTES de gravar: bloqueio não cria nada e o início da cadeia fica como estava.
    const viab = viabilidadeDoTrecho(this.env.project(), ctx.familia, ctx.pontas.inicio.dominio, regrasDoDominio(ctx), opcoesTubo.dn, a, b);
    if (viab.bloqueio) {
      this.env.say('Bloqueado: ' + viab.bloqueio);
      return;
    }
    const avisos: string[] = [...viab.avisos];
    const novo: TrechoEncontro = { a: a.xyz, b: b.xyz, dn: opcoesTubo.dn };
    try {
      this.env.transaction('Desenhar tubo', () => {
        this.garantirFamilias(ctx);
        this.env.exec({ type: 'addComponent', component: c });
        this.aparos = [];
        this.ligarPonta(ctx, id, 'a', a, novo, avisos);
        this.ligarPonta(ctx, id, 'b', b, novo, avisos);
        for (const ap of this.aparos) this.aparar(ap.id, ap.ponta, ap.recuo, avisos);
      });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : String(e));
      this.reset();
      return;
    }
    this.items = [];
    const extra = avisos.length ? ' ' + avisos.join(' ') : '';
    if (b.alvo || b.derivacao) {
      this.inicio = null;
      this.env.say('Tubo ligado à rede. Clique para iniciar outro trecho; Esc sai.' + extra);
    } else {
      this.inicio = { xyz: b.xyz, alvo: { componentId: id, ligacaoId: ctx.pontas.fim.id } };
      this.env.say('Tubo criado. Clique o próximo ponto para continuar; Esc encerra a cadeia.' + extra);
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
    this.criar(ctx, this.inicio, { xyz: [a[0] + ux * v, a[1] + uy * v, a[2] + (opcoesTubo.declividade / 100) * v], alvo: null });
    return true;
  }
}
