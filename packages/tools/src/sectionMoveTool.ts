import { dot, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall } from '@hestia/engine';
import { isWall, openingSill, openingType, unitsOf, type Command, type Id, type Opening } from '@hestia/model';
import { ToolBase } from './base.ts';
import { cotaDoDeslocamento, deslocamentoDigitado, fmtDisplacement, SessaoDeCopias } from './gestoDeslocamento.ts';
import { avisaGuardaCorpoHospedado, guardaCorposBloqueados } from './guardaCorpoEdicao.ts';
import { aceitaVerticalNoCorte, comandosMoverNoCorte, moveisDoCorte } from './sectionMoverElementos.ts';
import { fantasmaDoMover, formasDasNotas, SEM_NOTAS, type AlvosDoMover } from './sectionMoverPrevia.ts';
import { guardaCorpoPieces, moveSectionAnnotations, pickSectionElement, resultPieces, sectionDirection, sectionResult, selectedOpenings } from './sectionEditTools.ts';
import { refuseCopyOverlap, refuseMoveOverlap } from './wallOverlapGuard.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import type { Inference, PointerInfo, ToolEnv } from './types.ts';

/**
 * Mover e Copiar no corte e na elevação: o MESMO fluxo da planta (`MoveTool`), no plano (t, z) da vista.
 *
 *  1. Ponto base: clique com TODOS os snaps do índice da vista (vértices, pontos médios, interseções, perpendicular, mais próximo,
 *     arestas de parede, laje, escada, acabamentos, guarda-corpo e esquadria), rastreios e Orto/Polar (o mesmo `this.snap`).
 *  2. Prévia: o contorno dos elementos selecionados deslocado, a linha do ponto base ao cursor e a cota dinâmica do deslocamento.
 *  3. Destino: clique com snaps (o deslocamento é exatamente base até o ponto capturado) ou a distância digitada + Enter, na
 *     direção do cursor. No Copiar a base fica e cada clique ou valor faz uma cópia (um só desfazer); Esc cancela.
 *
 * Horizontal anda ao longo da linha do corte (parede, escada, rampa, laje, telhado, guarda-corpo manual) ou da parede (abertura);
 * vertical sobe ou desce escada, rampa, laje, telhado e guarda-corpo manual (cota própria) e move o peitoril da abertura. A parede
 * só anda na horizontal: com ela sozinha na seleção a prévia já sai restrita e a barra de status diz por quê. O guarda-corpo
 * hospedado segue a escada ou a rampa; sozinho, a barra de status explica (`tl_msg_railing_hosted_locked`). Com elementos já
 * selecionados o primeiro clique é o ponto base; sem seleção, o elemento sob o clique é selecionado e o clique vira o ponto base.
 * Anotações selecionadas (cota, texto, detalhe e etiqueta) andam no plano da vista. É um gesto único com um só desfazer.
 */
export class SectionMoveTool extends ToolBase {
  readonly id: 'move' | 'copy';
  readonly label: string;
  /** Dica do passo: sem nada para mover, explica como escolher; com seleção, o passo a passo do ponto base e do destino. */
  override get hint(): string {
    if (!this.alvos().temAlgo) return this.t(this.copy ? 'tl_hint_copy_section' : 'tl_hint_move_section');
    return this.t('tl_hint_move', { label: this.t(this.copy ? 'tl_tool_copy' : 'tl_tool_move') });
  }
  private base: Vec2 | null = null;
  /** Última posição capturada do cursor, já restrita ao que o elemento aceita (cota do deslocamento). */
  private cursor: Vec2 | null = null;
  private sessao = new SessaoDeCopias();

  constructor(env: ToolEnv, private copy = false) {
    super(env);
    this.id = copy ? 'copy' : 'move';
    this.label = copy ? 'Copiar' : 'Mover';
  }

  protected reset(): void { this.base = null; this.cursor = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.base !== null; }

  override start(): void {
    this.reset();
    this.sessao.reinicia();
    const p = this.env.project();
    const sel = this.env.selection();
    // Só um guarda-corpo hospedado na seleção: a explicação vem já, antes do primeiro clique.
    if (sel.length > 0 && !this.alvos().temAlgo && guardaCorposBloqueados(p, sel).length > 0) avisaGuardaCorpoHospedado(this.env);
    else this.env.say(this.hint);
  }

  override inputPrompt(): string | null { return this.base ? this.t('tl_inp_distance') : null; }

  /** Esc: no Copiar com cópias feitas encerra a sessão (o passo de desfazer já está gravado); senão cancela o ponto base. */
  override cancel(): void {
    if (this.sessao.encerraComEsc(this.copy)) {
      this.reset();
      this.env.done();
      return;
    }
    super.cancel();
  }

  /** O que a seleção leva e o que anda por conta própria; aberturas e anotações só andam no Mover (a cópia delas não existe no corte). */
  private alvos(): AlvosDoMover & { temAlgo: boolean; paredes: Id[]; soHorizontal: boolean } {
    const p = this.env.project();
    const sel = this.env.selection();
    const movidos = moveisDoCorte(p, sel);
    const paredes = sel.filter((id) => isWall(p.elements[id]));
    const aberturas = this.copy ? [] : selectedOpenings(this.env, paredes);
    const notas = this.copy ? SEM_NOTAS : formasDasNotas(this.env, sel);
    const temAlgo = movidos.length + aberturas.length + notas.total > 0;
    // Só parede (sozinha ou com guarda-corpo...): nada na seleção aceita cota vertical; a prévia já sai horizontal.
    const soHorizontal = movidos.length > 0 && aberturas.length === 0 && notas.total === 0 && !movidos.some((id) => aceitaVerticalNoCorte(p, id));
    return { movidos, aberturas, notas, temAlgo, paredes, soHorizontal };
  }

  /**
   * Ponto capturado (mesmo motor da planta, com o ponto base como origem do Orto, Polar e rastreios). Com só parede na seleção, o
   * cursor é projetado na horizontal do ponto base ANTES de capturar: o ponto, o marcador e o fantasma já saem restritos.
   */
  private ponto(p: PointerInfo, soHorizontal: boolean): Inference {
    const from = this.base ?? undefined;
    const travado = from && soHorizontal ? { ...p, raw: { x: p.raw.x, y: from.y } } : p;
    return this.snap(travado, { from });
  }

  override move(p: PointerInfo): void {
    this.items = [];
    const alvos = this.alvos();
    const inf = this.ponto(p, alvos.soHorizontal);
    this.cursor = inf.point;
    if (!this.base) {
      // Sem seleção, o elemento que o clique vai escolher já aparece realçado.
      if (!alvos.temAlgo) {
        const alvo = pickSectionElement(this.env, p.raw);
        if (alvo) this.items.push({ kind: 'highlight', ids: [alvo] });
      }
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    const d = sub(inf.point, this.base);
    this.items.push({ kind: 'line', a: this.base, b: inf.point, dashed: true });
    const result = sectionResult(this.env);
    const u = sectionDirection(this.env);
    if (result && u) this.items.push(...fantasmaDoMover(this.env.project(), result, resultPieces(result), guardaCorpoPieces(this.env, result), alvos, u, d.x, d.y));
    this.items.push({ kind: 'label', at: inf.point, text: fmtDisplacement(unitsOf(this.env.project()), d) });
  }

  /** Cota do deslocamento (ponto base até o cursor), pelo provedor do sistema único (o mesmo da planta). */
  tempDims(overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    return cotaDoDeslocamento(this.env, this.base, this.cursor, overrides);
  }

  override click(p: PointerInfo): void {
    if (!this.base) { this.escolheBase(p); return; }
    const inf = this.ponto(p, this.alvos().soHorizontal);
    this.aplica(sub(inf.point, this.base));
  }

  /** Primeiro clique: sem seleção o elemento sob o clique vira a seleção; o ponto base é o ponto capturado (com snaps). */
  private escolheBase(p: PointerInfo): void {
    // Só um guarda-corpo hospedado selecionado: a explicação vale mais que escolher outro elemento (cada clique repete a barra de status).
    const hospedadoSozinho = !this.alvos().temAlgo && guardaCorposBloqueados(this.env.project(), this.env.selection()).length > 0;
    if (!hospedadoSozinho && !this.alvos().temAlgo) {
      const alvo = pickSectionElement(this.env, p.raw);
      if (alvo) this.env.setSelection([alvo]);
    }
    const alvos = this.alvos();
    if (!alvos.temAlgo) {
      if (hospedadoSozinho || guardaCorposBloqueados(this.env.project(), this.env.selection()).length > 0) avisaGuardaCorpoHospedado(this.env);
      else this.env.say(this.t('tl_msg_section_move_select'));
      return;
    }
    const inf = this.snap(p);
    this.base = inf.point;
    this.cursor = inf.point;
    this.items = [];
    // Só parede: já diz a razão da prévia horizontal (não é uma reação muda).
    this.env.say(alvos.soHorizontal ? this.t('tl_msg_section_move_vertical') : this.hint);
  }

  override type(text: string): boolean {
    if (!this.base) return false;
    const d = deslocamentoDigitado(this.env, text, this.base, this.inf?.point ?? this.raw);
    if (d === null) return false;
    this.aplica(d);
    return true;
  }

  /** Aplica o deslocamento `d` = (dt ao longo do corte, dz vertical) à seleção, num só passo de desfazer. */
  private aplica(d: Vec2): void {
    const u = sectionDirection(this.env);
    if (!u) { this.base = null; this.env.say('Não foi possível ler a direção do corte.'); return; }
    const alvos = this.alvos();
    const dt = d.x;
    // Parede sozinha não sobe nem desce: o deslocamento é só horizontal, e a prévia já era.
    const dz = alvos.soHorizontal ? 0 : d.y;
    if (Math.abs(dt) < 1e-6 && Math.abs(dz) < 1e-6) {
      // Parede sozinha com o cursor na vertical do ponto base: não fica sem resposta, a razão volta à barra de status.
      if (alvos.soHorizontal) this.env.say(this.t('tl_msg_section_move_vertical'));
      return;
    }
    const p0 = this.env.project();
    const selection = this.env.selection();
    const mover = comandosMoverNoCorte(p0, selection, u, dt, dz, this.copy);
    // Mesma regra da planta (decisão 0044): mover ou copiar não deixa parede em cima de parede.
    if (alvos.paredes.length && Math.abs(dt) > 1e-6) {
      const t = { kind: 'translate', d: { x: u.x * dt, y: u.y * dt } } as const;
      if (this.copy ? refuseCopyOverlap(this.env, alvos.paredes, t) : refuseMoveOverlap(this.env, alvos.paredes, t)) { this.base = null; return; }
    }
    const commands: Command[] = [...mover.commands];
    for (const o of alvos.aberturas) {
      const f = frameOfWall(p0, o.hostId);
      if (!f) continue;
      const patch: Partial<Opening> = {};
      if (Math.abs(dt) > 1e-6) patch.offset = o.offset + dot({ x: u.x * dt, y: u.y * dt }, f.u);
      if (Math.abs(dz) > 1e-6) patch.sillOverride = Math.max(0, openingSill(openingType(p0, o), o) + dz);
      if (Object.keys(patch).length) commands.push({ type: 'updateElements', ids: [o.id], patch });
    }
    const notes = this.copy ? [] : moveSectionAnnotations(this.env, selection, dt, dz);
    commands.push(...notes);
    if (!commands.length) {
      // Nada se moveu: o ponto base não fica preso, e a razão aparece na barra de status.
      this.base = null;
      this.items = [];
      if (mover.bloqueados.length) avisaGuardaCorpoHospedado(this.env);
      else this.env.say(mover.semVertical.length ? this.t('tl_msg_section_move_vertical') : this.t('tl_msg_section_move_select'));
      return;
    }
    this.env.transaction(this.copy ? 'Copiar no corte' : 'Mover no corte', () => { for (const c of commands) this.env.exec(c); }, this.copy ? this.sessao.chave : undefined);
    if (this.copy) this.sessao.registra();
    this.items = [];
    // Mover termina o gesto e volta a Selecionar (como na planta); Copiar segue com a mesma base. O aviso vem por último para não ser apagado.
    if (!this.copy) { this.reset(); this.env.done(); }
    // O que ficou para trás por regra (hospedado sozinho, parede na vertical) é dito depois, para a mensagem não sumir.
    if (mover.bloqueados.length) { avisaGuardaCorpoHospedado(this.env); return; }
    if (mover.semVertical.length) { this.env.say(this.t('tl_msg_section_move_vertical')); return; }
    this.env.say(this.copy ? 'Copiado no corte. Ctrl+Z desfaz.' : notes.length > 0 && commands.length === notes.length ? 'Anotações movidas no corte. Ctrl+Z desfaz.' : 'Movido no corte. Ctrl+Z desfaz.');
  }
}
