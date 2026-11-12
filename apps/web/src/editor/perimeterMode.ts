import { camposDeNivel } from './vistaAtiva.ts';
import type { SketchDraft, SketchTarget } from '@hestia/geom';
import type { PerimeterModifyKind } from '@hestia/tools';
import { DEFAULT_CEILING_HEIGHT, isFloor, isSlab, type Id, type Project } from '@hestia/model';
import {
  OUTLINE_LOCKED_MSG,
  PerimeterTool,
  type ToolId,
  SKETCH_DEFAULTS,
  commitPerimeter,
  draftFromElement,
  perimeterOptionsOf,
  setDefaults,
  setSegSlope,
  type CommitPerimeterOptions,
  type PerimeterBarOptions,
  type Tool,
  type ToolEnv,
  type ToolOptions,
} from '@hestia/tools';
import type { PerimeterView } from './perimeterApi.ts';
import { resolveText, useI18n, type TextLike } from './i18n.ts';
import { COMANDO_DO_ESBOCO, COMANDO_RECUSADO, SEM_ESBOCO } from './perimeterComandos.ts';
import { VISAO_FECHADA, alvoDaFerramenta, arestaDe, formaDaFerramenta, formaDaTela } from './perimeterView.ts';
import { useUi } from './state.ts';
import type { PerimeterLineKind, PerimeterShape } from '../ui/perimeter/PerimeterRibbonPanels.tsx';

/** O que o modo precisa do controlador: o ambiente das ferramentas, o projeto, a troca da ferramenta ativa e o aviso de mudança. */
export interface PerimetroPorta {
  env(): ToolEnv;
  projeto(): Project;
  /** Torna `tool` a ferramenta ativa; null volta à Selecionar. */
  ativar(tool: Tool | null): void;
  /** Avisa a interface de que o estado do modo mudou (repinta a planta e a barra). */
  atualizar(): void;
}

/** Uma sessão aberta: a ferramenta com o rascunho, o alvo, o elemento em edição (se houver) e as opções da barra. */
interface Sessao {
  tool: PerimeterTool;
  target: SketchTarget;
  /** Elemento em edição; ausente = criando. */
  editing?: Id;
  /** Seleção de antes de abrir a edição: o Cancelar a devolve, já que abrir o modo a limpa. */
  selecaoAnterior?: Id[];
  levelId: Id;
  typeId?: Id;
  opts: PerimeterBarOptions;
}

const ABERTO_FERRAMENTA: TextLike = { key: 'edc_perim_open_tool' };
const ABERTO_VISTA: TextLike = { key: 'edc_perim_open_view' };
const JA_ABERTO: TextLike = { key: 'edc_perim_already_open' };

/**
 * Tipo, opções da barra e padrão de cada alvo, lidos das opções de ferramenta atuais: o modo começa com o que o usuário
 * já usava (balanço e inclinação do telhado, cota e núcleo do piso, laje e forro).
 */
function iniciais(target: SketchTarget, o: ToolOptions): { typeId?: Id; opts: PerimeterBarOptions } {
  const padrao = { overhang: SKETCH_DEFAULTS.overhang, slopePct: SKETCH_DEFAULTS.slopePct };
  switch (target) {
    case 'roof':
      return { typeId: o.roofTypeId, opts: { overhang: o.roofOverhang ?? padrao.overhang, slopePct: o.roofSlope ?? padrao.slopePct, extendToCore: false, heightOffset: 0 } };
    case 'floor':
      return { typeId: o.floorTypeId, opts: { ...padrao, extendToCore: o.floorCore ?? false, heightOffset: o.floorOffset } };
    case 'slab':
      return { typeId: o.slabTypeId, opts: { ...padrao, extendToCore: false, heightOffset: o.slabOffset } };
    case 'ceiling':
      return { typeId: o.ceilingTypeId, opts: { ...padrao, extendToCore: false, heightOffset: o.ceilingOffset ?? DEFAULT_CEILING_HEIGHT } };
  }
}

/**
 * Opções de `commitPerimeter`. O telhado recebe balanço e inclinação padrão; piso, laje e forro, estender até o núcleo
 * e a cota. A cota do telhado não vai: a barra não a mostra, e o motor a calcula na criação.
 */
function opcoesDe(s: Sessao): CommitPerimeterOptions {
  const base = { typeId: s.typeId, levelId: s.levelId, origin: s.tool.origin() };
  const o = s.opts;
  if (s.target === 'roof') return { ...base, overhang: o.overhang, slopePct: o.slopePct };
  return { ...base, extendToCore: o.extendToCore, heightOffset: o.heightOffset, linkToWalls: o.linkToWalls, followRoom: o.followRoom };
}

/**
 * Modo "Criar/Editar perímetro". Abre a ferramenta de perímetro para um alvo (ou para editar um elemento), guarda a
 * barra, e grava o resultado de Concluir num só passo de desfazer. Mudar de ferramenta, vista ou nível não conclui:
 * a barra pede Concluir ou Cancelar. Esc e Enter ficam com a ferramenta (ver `PerimeterTool`).
 */
export class PerimeterMode {
  private sessao: Sessao | null = null;
  /** Última visão montada, com o contador e a barra de status em que foi montada: repintar sem mudança devolve o mesmo objeto. */
  private cache: { tick: number; status: TextLike; visao: PerimeterView } | null = null;

  constructor(private readonly porta: PerimetroPorta) {}

  /** Verdadeiro enquanto o modo está aberto. */
  get ativo(): boolean {
    return this.sessao !== null;
  }

  /**
   * Verdadeiro no Selecionar do esboço: sem forma escolhida e sem comando de Modificar. É o estado em que o clique e a
   * caixa escolhem linhas (o botão Selecionar da faixa fica pressionado e o Shift soma em vez de travar o desenho).
   */
  get selecionando(): boolean {
    return this.selecionandoLinhas();
  }

  /** Abre o modo para criar um elemento do alvo, no nível atual, com a forma padrão (linha). */
  begin(target: SketchTarget): void {
    if (this.recusaSeAberto()) return;
    const ui = useUi.getState();
    const { typeId, opts } = iniciais(target, ui.options);
    this.abrir({ tool: new PerimeterTool(this.porta.env(), target), target, levelId: ui.levelId, typeId, opts });
  }

  /** "Editar perímetro": abre o modo com o contorno do elemento. Elemento sem perímetro editável é recusado na barra. */
  edit(id: Id): void {
    if (this.recusaSeAberto()) return;
    const p = this.porta.projeto();
    const el = p.elements[id];
    const d = draftFromElement(p, id);
    const opts = perimeterOptionsOf(p, id);
    if (!el || !d || !opts || !('levelId' in el)) {
      this.dizer({ key: 'edc_perim_not_editable' });
      return;
    }
    // Piso ou laje vinculado às paredes: o contorno é travado (decisão 0031). Recusa já na abertura, com o caminho.
    if ((isFloor(el) || isSlab(el)) && el.outlineSource?.linked) {
      this.dizer(OUTLINE_LOCKED_MSG);
      return;
    }
    const tool = new PerimeterTool(this.porta.env(), d.target);
    tool.loadDraft(d);
    const selecaoAnterior = [...useUi.getState().selection];
    this.abrir({ tool, target: d.target, editing: id, levelId: el.levelId, opts, selecaoAnterior });
  }

  /**
   * Concluir: valida e grava num só passo de desfazer, seleciona o elemento e fecha o modo. Em recusa (contorno aberto,
   * ou o motor não gera o telhado), nada é criado: o modo fica aberto e o motivo vai para a barra.
   */
  finish(): void {
    const s = this.sessao;
    if (!s) return;
    const r = commitPerimeter(this.porta.projeto(), s.tool.draft(), opcoesDe(s), useI18n.getState().lang);
    if (!r.ok) {
      this.dizer(r.message);
      return;
    }
    const env = this.porta.env();
    env.transaction(s.editing ? 'edc_perim_undo_edit' : 'edc_perim_undo_create', () => {
      for (const c of r.commands) env.exec(c);
    });
    this.fechar();
    env.setSelection([r.id]);
    this.dizer(r.message);
  }

  /**
   * Cancelar: descarta o rascunho e fecha o modo. O elemento em edição não muda, e a seleção de antes de abrir a edição
   * volta (na criação, a seleção segue como está).
   */
  cancel(): void {
    const s = this.sessao;
    if (!s) return;
    this.fechar();
    if (s.editing) useUi.setState({ selection: s.selecaoAnterior ?? [] });
    this.dizer(s.editing ? { key: 'edc_perim_cancelled' } : { key: 'edc_perim_discarded' });
  }

  /** Forma da galeria. Escolher uma forma desliga o comando de Modificar ligado. */
  setShape(f: PerimeterShape): void {
    this.comSessao((s) => {
      this.desligaComando(s);
      s.tool.setShape(formaDaTela(f));
    });
  }

  /**
   * Liga um comando de Modificar sobre as linhas do esboço, ou desliga (null, ou o mesmo comando de novo). Ligar tira a
   * forma da galeria: comando e forma não ficam ligados juntos.
   */
  setModify(k: PerimeterModifyKind | null): void {
    const s = this.sessao;
    if (!s) return;
    const alvo = k === null || k === s.tool.modifyKind() ? null : k;
    if (alvo === null) {
      this.voltaSelecao(s);
      this.dizer({ key: 'edc_perim_command_off' });
      return;
    }
    s.tool.setShape(null);
    // A ferramenta já publica o próximo passo na barra (escolher o alvo, distância, ponto de base…).
    if (!s.tool.setModify(alvo)) return this.dizer(COMANDO_RECUSADO);
    this.porta.atualizar();
  }

  /**
   * Esc com o modo aberto. A ferramenta trata o passo e a forma; a camada do app completa o retorno ao Selecionar quando a
   * linha escolhida era a seta de inclinação (não é uma forma e ficaria ligada): sem comando de Modificar, o Esc volta à
   * linha de limite, e o clique seguinte já escolhe linhas. Devolve false sem modo.
   */
  esc(): boolean {
    const s = this.sessao;
    if (!s) return false;
    if (s.tool.modifyKind() === null && s.tool.activeShape() === null && s.tool.lineKind() === 'slope') {
      s.tool.setLineKind('boundary');
      this.porta.atualizar();
      return true;
    }
    s.tool.cancel();
    return true;
  }

  setLineKind(k: PerimeterLineKind): void {
    this.comSessao((s) => {
      this.desligaComando(s);
      s.tool.setLineKind(k);
      if (k === 'boundary' && s.tool.activeShape() === null) s.tool.setShape('line');
    });
  }

  /** Seleção de linhas sem forma nem comando: Shift soma à seleção, como na ferramenta Selecionar. */
  selecionandoLinhas(): boolean {
    const s = this.sessao;
    return s !== null && s.tool.activeShape() === null && s.tool.modifyKind() === null && s.tool.lineKind() === 'boundary';
  }

  /**
   * Ctrl+Z (`refazer` falso) e Ctrl+Y (verdadeiro) com o modo aberto: desfazem ou refazem o rascunho do perímetro, nunca o
   * projeto. Devolve false sem modo, para o controlador seguir com o histórico do projeto.
   */
  historico(refazer: boolean): boolean {
    const s = this.sessao;
    if (!s) return false;
    const ok = refazer ? s.tool.redoDraft() : s.tool.undoDraft();
    if (ok) this.dizer(refazer ? { key: 'edc_perim_redo_draft' } : { key: 'edc_perim_undo_draft' });
    else this.dizer(refazer ? { key: 'edc_perim_nothing_redo' } : { key: 'edc_perim_nothing_undo' });
    return true;
  }

  /**
   * Ctrl+A no esboço: seleciona todas as linhas. A troca de seleção é um `replace` no histórico do rascunho (como o
   * clique), então não cria passo de desfazer, não mexe na geometria nem na origem do contorno. Fora do modo devolve
   * false, para o controlador seguir com a seleção do projeto.
   */
  selecionarTudo(): boolean {
    const s = this.sessao;
    if (!s) return false;
    const d = s.tool.draft();
    if (d.segs.length === 0) {
      this.dizer({ key: 'edc_perim_no_lines' });
      return true;
    }
    s.tool.draftHistory.replace({ ...d, selected: d.segs.map((x) => x.id) });
    this.dizer({ key: 'edc_perim_lines_selected', args: { n: d.segs.length } });
    return true;
  }

  /**
   * Opções da barra. No telhado, balanço e inclinação padrão valem também para as linhas sem valor próprio: o rascunho
   * guarda o padrão novo, para a aresta selecionada mostrar o que o telhado vai gravar.
   */
  setOptions(patch: Partial<PerimeterBarOptions>): void {
    this.comSessao((s) => {
      s.opts = { ...s.opts, ...patch };
      if (s.target === 'roof' && (patch.overhang !== undefined || patch.slopePct !== undefined)) {
        s.tool.loadDraft(setDefaults(s.tool.draft(), { overhang: s.opts.overhang, slopePct: s.opts.slopePct }));
      }
    });
  }

  /** Flags da aresta selecionada (só telhado): define ou não inclinação, inclinação própria e balanço próprio. */
  setEdge(patch: { definesSlope?: boolean; slopePct?: number; overhang?: number }): void {
    const s = this.sessao;
    if (!s) return;
    const d = s.tool.draft();
    const id = d.selected[0];
    if (s.target !== 'roof') this.dizer({ key: 'edc_perim_roof_only' });
    else if (id === undefined) this.dizer({ key: 'edc_perim_select_edge' });
    else s.tool.loadDraft(setSegSlope(d, id, patch));
    this.porta.atualizar();
  }

  /**
   * Escolha de ferramenta da faixa (e atalho de teclado). Fora do modo, Telhado, Piso, Laje e Forro abrem o modo para o
   * alvo. Dentro dele, os comandos de Modificar viram comando sobre o esboço (`COMANDO_DO_ESBOCO`), Selecionar volta
   * às linhas, e as ferramentas sem sentido no esboço avisam por quê; qualquer outra troca é recusada e o modo fica.
   * Devolve true quando a escolha foi tratada aqui.
   */
  intercepta(id: ToolId): boolean {
    if (!this.ativo) {
      const alvo = alvoDaFerramenta(id);
      if (alvo) this.begin(alvo);
      return alvo !== null;
    }
    const comando = COMANDO_DO_ESBOCO[id];
    if (comando) this.setModify(comando);
    else if (id === 'select') this.comSessao((s) => this.voltaSelecao(s));
    else this.dizer(SEM_ESBOCO[id] ?? ABERTO_FERRAMENTA);
    return true;
  }

  /** Troca de vista ou de nível com o modo aberto: recusada (true), e o modo fica. */
  bloqueiaNavegacao(): boolean {
    if (!this.ativo) return false;
    this.dizer(ABERTO_VISTA);
    return true;
  }

  /** Fecha sem mensagem, quando o projeto é trocado e o modo deixa de valer. */
  encerrar(): void {
    this.sessao = null;
  }

  /** Estado para a tela: rascunho e resultado correntes, barra, linha sob o cursor e aresta selecionada. */
  view(): PerimeterView {
    const { previewTick: tick, status } = useUi.getState();
    if (this.cache?.tick === tick && this.cache.status === status) return this.cache.visao;
    const visao = this.montaVisao(status);
    this.cache = { tick, status, visao };
    return visao;
  }

  private montaVisao(status: TextLike): PerimeterView {
    const s = this.sessao;
    if (!s) return { ...VISAO_FECHADA, status };
    const d: SketchDraft = s.tool.draft();
    return {
      active: true,
      modify: s.tool.modifyKind(),
      selecting: s.tool.activeShape() === null && s.tool.modifyKind() === null,
      target: s.target,
      ...(s.editing ? { editing: s.editing } : {}),
      draft: d,
      result: s.tool.closeInfo(),
      shape: formaDaFerramenta(s.tool.activeShape()),
      lineKind: s.tool.lineKind(),
      options: s.opts,
      hoverId: s.tool.hoverId(),
      selectionBox: s.tool.selectionBox(),
      selectedEdge: arestaDe(d),
      status,
    };
  }

  private abrir(s: Sessao): void {
    this.sessao = s;
    useUi.setState((u) => ({ view: 'plan', sectionId: null, ...camposDeNivel(this.porta.projeto(), u, s.levelId), selection: [], hover: null }));
    this.porta.ativar(s.tool);
    s.tool.setShape('line');
    this.porta.atualizar();
  }

  private fechar(): void {
    this.sessao = null;
    this.porta.ativar(null);
  }

  /** Desliga o comando de Modificar ligado, se houver (a ferramenta volta às linhas). */
  private desligaComando(s: Sessao): void {
    if (s.tool.modifyKind() !== null) s.tool.setModify(null);
  }

  /**
   * Selecionar: tira o comando, volta a linha de limite (a seta de inclinação também não é seleção) e tira a forma, para
   * o clique e a caixa escolherem linhas.
   */
  private voltaSelecao(s: Sessao): void {
    this.desligaComando(s);
    if (s.tool.lineKind() !== 'boundary') s.tool.setLineKind('boundary');
    s.tool.setShape(null);
  }

  /** Aplica `fn` à sessão aberta e avisa a interface. Sem sessão, nada acontece. */
  private comSessao(fn: (s: Sessao) => void): void {
    const s = this.sessao;
    if (!s) return;
    fn(s);
    this.porta.atualizar();
  }

  /** Mostra uma mensagem na barra de status e avisa a interface. */
  private dizer(msg: TextLike): void {
    this.porta.env().say(resolveText(msg, useI18n.getState().lang));
    this.porta.atualizar();
  }

  /** Com o modo aberto, begin e edit são recusados (true). */
  private recusaSeAberto(): boolean {
    if (!this.ativo) return false;
    this.dizer(JA_ABERTO);
    return true;
  }
}
