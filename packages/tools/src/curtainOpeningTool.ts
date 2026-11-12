import { cotaDeCorteCortina, sNaParede, type ItemSubelementoCortina, type ParedeSubelementos } from '@hestia/engine';
import {
  ErroEsquadriaCelula,
  folgasDaRegiao,
  folhaMinima,
  isCurtainType,
  isOpening,
  isWall,
  openingTypeById,
  resolverParede,
  retanguloDaRegiao,
  tDoModelo,
  type Command,
  type Id,
  type OpeningType,
  type Project,
  type Wall,
} from '@hestia/model';
import { ToolBase } from './base.ts';
import { hostUnder } from './infer.ts';
import type { PointerInfo, ToolOptions } from './types.ts';

/** Tolerância (m) da comparação de medidas (a mesma do modelo). */
const TOL = 1e-6;
/** Altura (m) acima da base usada para a porta na planta: a fileira de base (j = 0). */
const FILEIRA_BASE = 0.001;

/** Célula da grade sob `s` (m ao longo da parede) e `zr` (m acima da base da cortina), ou undefined. */
function celulaSob(par: ParedeSubelementos, s: number, zr: number): ItemSubelementoCortina | undefined {
  return par.itens.find((it) => it.geo.kind === 'cell' && s >= it.geo.s0 && s <= it.geo.s1 && zr >= it.geo.z0 && zr <= it.geo.z1);
}

/** Medidas da esquadria na célula: se cabe no modo atual, a folga livre e a folha mínima do tipo. `null` sem grade. */
interface Caber {
  cabe: boolean;
  larguraLivre: number;
  minimo: number;
}

/**
 * Porta ou janela na célula de uma parede cortina (decisão 0056, §7.2 a §7.5). O cursor escolhe a célula: na planta, a
 * porta vai à fileira de base e a janela à fileira do corte (1,2 m); na 3D, o ponto da superfície sob o cursor. A célula
 * sob o cursor fica destacada como subelemento da cortina. O clique grava `setCellOpening`; se a esquadria não cabe no
 * modo "preencher célula", pergunta se pode fundir as vizinhas e refaz com `fundir: true`. Espaço inverte o giro e Tab o
 * sentido, como nas esquadrias.
 */
export class CurtainOpeningTool extends ToolBase {
  readonly id: 'curtainDoor' | 'curtainWindow';
  readonly label: string;
  /** Na 3D, o clique chega com o ponto da superfície; o movimento também recebe o elemento e a altura sob o cursor. */
  readonly pick3d = true;
  readonly hover3d = true;
  override get hint(): string {
    return this.t('tl_hint_curtain_opening', { label: this.t(this.id === 'curtainDoor' ? 'tl_tool_curtain_door' : 'tl_tool_curtain_window') });
  }
  private alvo: { wallId: Id; i: number; j: number } | null = null;
  private lastPointer: PointerInfo | null = null;

  constructor(env: ConstructorParameters<typeof ToolBase>[0], kind: 'curtainDoor' | 'curtainWindow') {
    super(env);
    this.id = kind;
    this.label = kind === 'curtainDoor' ? 'Porta na cortina' : 'Janela na cortina';
  }

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.alvo = null;
    this.lastPointer = null;
  }

  protected busy(): boolean {
    return false;
  }

  override start(): void {
    this.reset();
    this.env.setSubelemento?.(null);
    this.env.say(this.hint);
  }

  /** Sai da ferramenta: tira o destaque da célula antes de voltar à seleção. */
  override cancel(): void {
    this.env.setSubelemento?.(null);
    super.cancel();
  }

  private opcoes(): ToolOptions {
    return this.env.options();
  }

  private tipoAtual(pr: Project): OpeningType | undefined {
    const o = this.opcoes();
    return openingTypeById(pr, this.id === 'curtainDoor' ? o.doorTypeId : o.windowTypeId);
  }

  /** Parede sob o cursor: na 3D, a que a vista destaca (com a altura da superfície); na planta, a mais perto do ponto. */
  private paredeSob(p: PointerInfo): { wallId: Id; zAbs: number | null } | null {
    const pr = this.env.project();
    if (p.hit3d !== undefined) {
      if (!p.hit3d || p.hitZ === undefined) return null;
      const e = pr.elements[p.hit3d];
      const w = e && isOpening(e) ? pr.elements[e.hostId] : e;
      return w && isWall(w) ? { wallId: w.id, zAbs: p.hitZ } : null;
    }
    const snapOn = this.opcoes().snap?.enabled !== false;
    const host = hostUnder(p.raw, pr, this.env.levelId(), this.env.metersPerPixel(), snapOn, 16);
    return host ? { wallId: host.wallId, zAbs: null } : null;
  }

  /** Altura (m) do alvo acima da base da cortina: a da superfície na 3D; na planta, a fileira de base (porta) ou o corte (janela). */
  private alturaRelativa(zBase: number, zAbs: number | null): number {
    if (zAbs !== null) return zAbs - zBase;
    if (this.id === 'curtainDoor') return FILEIRA_BASE;
    return cotaDeCorteCortina(this.env.project(), this.env.levelId()) - zBase;
  }

  /** Destaca a célula sob o cursor (subelemento da cortina) e grava o alvo do clique; sem célula, limpa o destaque. */
  private destacar(p: PointerInfo): void {
    this.alvo = null;
    this.items = [];
    const pr = this.env.project();
    const sob = this.paredeSob(p);
    const wall = sob ? pr.elements[sob.wallId] : undefined;
    if (!sob || !wall || !isWall(wall) || !isCurtainType(pr.wallTypes[wall.typeId])) {
      this.env.setSubelemento?.(null);
      this.env.say(this.hint);
      return;
    }
    const par = this.env.subelementos?.(wall.id) ?? null;
    if (!par) {
      this.env.setSubelemento?.(null);
      this.env.say(this.t('tl_msg_curtain_no_grid'));
      return;
    }
    const item = celulaSob(par, sNaParede(par, p.raw.x, p.raw.y), this.alturaRelativa(par.zBase, sob.zAbs));
    if (!item || item.sub.kind !== 'cell') {
      this.env.setSubelemento?.(null);
      this.env.say(this.hint);
      return;
    }
    const { i, j } = item.sub.cell;
    this.alvo = { wallId: wall.id, i, j };
    this.env.setSubelemento?.({ wallId: wall.id, kind: 'cell', cell: item.sub.cell });
    this.env.say(this.resumo(pr, wall, i, j));
  }

  /** Medidas da esquadria na célula no modo atual (prévia; o comando decide de verdade no clique). */
  private caber(pr: Project, wall: Wall, i: number, j: number, tipo: OpeningType): Caber | null {
    const res = resolverParede(pr, wall);
    if (!res) return null;
    const f = folgasDaRegiao(pr, wall, res, retanguloDaRegiao(res, i, j));
    const grade = (this.opcoes().curtainFit ?? 'cell') === 'grid';
    const largura = grade ? f.larguraBruta : f.larguraLivre;
    const altura = grade ? f.alturaBruta : f.alturaLivre;
    return { cabe: tipo.width <= largura + TOL && tipo.height <= altura + TOL, larguraLivre: f.larguraLivre, minimo: folhaMinima(tipo) };
  }

  /** Linha da barra de status para a célula: se cabe (ou precisa fundir) e o aviso de folha mínima quando a célula é estreita. */
  private resumo(pr: Project, wall: Wall, i: number, j: number): string {
    const tipo = this.tipoAtual(pr);
    const c = tipo ? this.caber(pr, wall, i, j, tipo) : null;
    if (!tipo || !c) return this.t('tl_msg_curtain_no_type');
    if (c.minimo > 0 && c.larguraLivre < c.minimo - TOL) {
      return tDoModelo(this.uiLang(), 'md_ct_w_folha_minima', { i, j, medida: c.larguraLivre.toFixed(2), minimo: c.minimo.toFixed(2) });
    }
    return this.t(c.cabe ? 'tl_msg_curtain_fits' : 'tl_msg_curtain_needs_fuse', { type: tipo.name, i, j });
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.lastPointer = p;
    this.destacar(p);
  }

  override click(p: PointerInfo): void {
    this.move(p);
    if (this.alvo) this.colocar(this.alvo, false);
  }

  /**
   * Grava a esquadria na célula. Sem `fundir`, se não cabe, pergunta se pode fundir as vizinhas e refaz com `fundir: true`
   * (dizer não não muda nada). Erros do modelo saem na barra de status, no idioma da interface.
   */
  private colocar(alvo: { wallId: Id; i: number; j: number }, fundir: boolean): void {
    const o = this.opcoes();
    const tipo = this.tipoAtual(this.env.project());
    if (!tipo) {
      this.env.say(this.t('tl_msg_curtain_no_type'));
      return;
    }
    const cmd: Command = {
      type: 'setCellOpening',
      wallId: alvo.wallId,
      i: alvo.i,
      j: alvo.j,
      openingTypeId: tipo.id,
      flipHand: o.openingFlipHand ?? false,
      flipFacing: o.openingFlipFacing ?? false,
      mark: o.placementMark ?? '',
      fit: o.curtainFit ?? 'cell',
      align: o.curtainAlign ?? 'center',
      fundir,
    };
    try {
      this.env.exec(cmd);
      this.env.say(this.t('tl_msg_curtain_placed', { type: tipo.name }));
    } catch (e) {
      if (!(e instanceof ErroEsquadriaCelula)) throw e;
      if (e.chave === 'md_ct_opening_no_fit' && !fundir && this.env.confirm) {
        const pergunta = this.t('tl_msg_curtain_confirm_fuse', { type: tipo.name, w: tipo.width.toFixed(2), h: tipo.height.toFixed(2) });
        void Promise.resolve(this.env.confirm(pergunta)).then((ok) => {
          if (ok) this.colocar(alvo, true);
          else this.env.say(this.t('tl_msg_curtain_fuse_refused'));
        });
        return;
      }
      this.env.say(tDoModelo(this.uiLang(), e.chave));
    }
  }

  /** Tab inverte o sentido da esquadria (para onde abre), como nas esquadrias. */
  override tab(): void {
    this.alternar('openingFlipFacing');
  }

  /** Espaço inverte o giro (dobradiça), como nas esquadrias. */
  override space(): void {
    this.alternar('openingFlipHand');
  }

  private alternar(campo: 'openingFlipHand' | 'openingFlipFacing'): void {
    const atual = this.opcoes()[campo] ?? false;
    this.env.setOptions?.({ [campo]: !atual } as Partial<ToolOptions>);
    if (this.lastPointer) this.move(this.lastPointer);
  }
}
