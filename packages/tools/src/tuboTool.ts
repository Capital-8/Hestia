import type { Vec2 } from '@hestia/geom';
import { comprimentoDoSegmento, encaixarLigacoes, ligacaoNoMundo, resolverComponente, resolverFamilia, trechoDeTubo, type LigacaoNoMundo, type LigacaoResolvida, type PontoSegmento } from '@hestia/engine';
import { formatQuantity, isComponent, newId, unitsOf, type Familia, type Id, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import { lerComprimentoDigitado } from './desenhoPolilinha.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/** Família de tubo padrão do domínio (a real vem da ficha F1, onda 6): quem a registrar no projeto usa este id. */
export const FAMILIA_TUBO_PADRAO = 'tubo-padrao';

/** Ajustes da ferramenta que o painel `TuboProperties` edita: DN em mm e altura (z) dos pontos clicados em m. */
export const opcoesTubo: { dn: number; z: number } = { dn: 50, z: 0 };

/** Tolerância mínima (m) da captura de ligação aberta; cresce com o zoom (8 px). */
const TOLERANCIA_MINIMA = 0.05;

/** As duas pontas do tubo: a ligação do início (menor z local) e a do fim (maior z local). */
interface PontasDoTubo {
  inicio: LigacaoResolvida;
  fim: LigacaoResolvida;
}

/** Ponto escolhido: coordenadas do mundo (m) e, se encaixou numa ligação aberta, quem é ela. */
interface PontoTubo {
  xyz: [number, number, number];
  alvo: { componentId: Id; ligacaoId: string } | null;
}

/** Ligação aberta de uma instância do projeto, já no mundo. */
interface LigacaoAberta {
  componentId: Id;
  lig: LigacaoNoMundo;
}

/** Pontas da família para o DN pedido (resolve com `L` de 1 m só para achar as posições); null se não tem duas ligações. */
export function pontasDoTubo(familia: Familia, dn: number): PontasDoTubo | null {
  const ligs = [...resolverFamilia(familia, { valores: { DN: dn, L: 1000 } }).ligacoes].sort((a, b) => a.posicao[2] - b.posicao[2]);
  const inicio = ligs[0];
  const fim = ligs[ligs.length - 1];
  return ligs.length >= 2 && inicio && fim ? { inicio, fim } : null;
}

/** Ligações abertas (sem conexão) de todas as instâncias do projeto, no mundo. */
function ligacoesAbertas(p: Project): LigacaoAberta[] {
  const saida: LigacaoAberta[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || !p.componentFamilies?.[e.familyId]?.ligacoes?.length) continue;
    for (const lig of resolverComponente(p, e).ligacoes) {
      if (e.ligacoes?.[lig.id] === undefined) saida.push({ componentId: e.id, lig: ligacaoNoMundo(lig, e) });
    }
  }
  return saida;
}

/**
 * Ligação aberta mais próxima de `(x, y)` que casa com a ponta do tubo (domínio, seção, DN e fluxo, por `encaixarLigacoes`).
 * Em planta o z do cursor é desconhecido: a distância usa o z da própria candidata. A direção do tubo ainda não existe (depende
 * do outro ponto), então a ponta é posta de frente para a candidata; curvas e tês são da ficha C6.
 */
function ligacaoProxima(x: number, y: number, ponta: LigacaoResolvida, abertas: LigacaoAberta[], tolerancia: number): LigacaoAberta | null {
  let melhor: LigacaoAberta | null = null;
  let melhorD = Infinity;
  for (const c of abertas) {
    const alvo: LigacaoNoMundo = { ...ponta, posicaoMundo: [x, y, c.lig.posicaoMundo[2]], direcaoMundo: [-c.lig.direcaoMundo[0], -c.lig.direcaoMundo[1], -c.lig.direcaoMundo[2]] };
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
  override readonly pick3d = true;
  private inicio: PontoTubo | null = null;

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
  private contexto(): { familia: Familia; pontas: PontasDoTubo } | null {
    const id = this.env.options().componentFamilyId ?? FAMILIA_TUBO_PADRAO;
    const familia = this.env.project().componentFamilies?.[id];
    if (!familia) {
      this.env.say('Tubo: escolha uma família de tubo no painel (a família de tubo padrão ainda não está no projeto).');
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
  private ponto(p: PointerInfo, pontas: PontasDoTubo, ehFim: boolean): PontoTubo {
    const de = this.inicio ? { x: this.inicio.xyz[0], y: this.inicio.xyz[1] } : undefined;
    let at: Vec2 = this.snap(p, de ? { from: de } : {}).point;
    if (de && (p.shift || this.env.options().orthoLock)) {
      at = Math.abs(at.x - de.x) >= Math.abs(at.y - de.y) ? { x: at.x, y: de.y } : { x: de.x, y: at.y };
    }
    const tol = Math.max(TOLERANCIA_MINIMA, 8 * this.env.metersPerPixel());
    const achada = ligacaoProxima(at.x, at.y, ehFim ? pontas.fim : pontas.inicio, ligacoesAbertas(this.env.project()), tol);
    if (achada) {
      const [x, y, z] = achada.lig.posicaoMundo;
      return { xyz: [x, y, z], alvo: { componentId: achada.componentId, ligacaoId: achada.lig.id } };
    }
    return { xyz: [at.x, at.y, opcoesTubo.z], alvo: null };
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.raw = p.raw;
    const ctx = this.contexto();
    if (!ctx) return;
    const pt = this.ponto(p, ctx.pontas, this.inicio !== null);
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
    const pt = this.ponto(p, ctx.pontas, this.inicio !== null);
    if (!this.inicio) {
      this.inicio = pt;
      this.env.say('Tubo: clique o ponto final.');
      return;
    }
    this.criar(ctx, this.inicio, pt);
  }

  /** Cria o trecho `a`→`b` e liga as pontas; continua a cadeia a partir do fim (a menos que o fim tenha encaixado numa rede). */
  private criar(ctx: { familia: Familia; pontas: PontasDoTubo }, a: PontoTubo, b: PontoTubo): void {
    const id = newId('cm');
    const c = trechoDeTubo(a.xyz, b.xyz, ctx.familia, opcoesTubo.dn, { id, levelId: this.env.levelId() });
    if (!c) {
      this.env.say('Tubo: os dois pontos coincidem; escolha um ponto final diferente.');
      return;
    }
    try {
      this.env.transaction('Desenhar tubo', () => {
        this.env.exec({ type: 'addComponent', component: c });
        if (a.alvo) this.env.exec({ type: 'connectComponents', a: id, ligacaoA: ctx.pontas.inicio.id, b: a.alvo.componentId, ligacaoB: a.alvo.ligacaoId });
        if (b.alvo) this.env.exec({ type: 'connectComponents', a: id, ligacaoA: ctx.pontas.fim.id, b: b.alvo.componentId, ligacaoB: b.alvo.ligacaoId });
      });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : String(e));
      this.reset();
      return;
    }
    this.items = [];
    if (b.alvo) {
      this.inicio = null;
      this.env.say('Tubo ligado à rede. Clique para iniciar outro trecho; Esc sai.');
    } else {
      this.inicio = { xyz: b.xyz, alvo: { componentId: id, ligacaoId: ctx.pontas.fim.id } };
      this.env.say('Tubo criado. Clique o próximo ponto para continuar; Esc encerra a cadeia.');
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
    this.criar(ctx, this.inicio, { xyz: [a[0] + ux * v, a[1] + uy * v, a[2]], alvo: null });
    return true;
  }
}
