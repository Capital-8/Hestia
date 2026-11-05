import { formatQuantity, isOpening, isRoof, isWall, unitsOf, type Id, type Project, type ResolvedUnits, type Roof, type Wall } from '@hestia/model';
import { resolveAllRoofs, roofAxisReport } from '@hestia/engine';
import { ToolBase } from './base.ts';
import { pickAt } from './pick.ts';
import { pickRoofAt } from './roofPick.ts';
import type { PointerInfo } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Trecho do eixo fora do telhado menor que isto (m) não é avisado (mesma folga do C2). */
const UNCOVERED_TOL = 1e-3;

const fmt = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m, { withUnit: false });

/**
 * Parede sob o cursor. Na 3D, é o elemento que a própria vista destaca (`hit3d`): escolher pelo ponto projetado na planta
 * erra quando a superfície vista é o beiral ou o topo de uma parede anexada, que cai fora da pegada da parede. Na planta,
 * a parede sob o ponto. A abertura vale pela parede que a hospeda; só paredes do nível atual.
 */
function wallUnder(p: Project, levelId: Id, info: PointerInfo, mpp: number): Id | null {
  if (info.hit3d !== undefined) {
    const e = info.hit3d ? p.elements[info.hit3d] : undefined;
    const w = e && isOpening(e) ? p.elements[e.hostId] : e;
    return w && isWall(w) ? w.id : null;
  }
  const hit = pickAt(p, levelId, info.raw, mpp);
  if (!hit) return null;
  const e = p.elements[hit.id];
  if (isWall(e)) return e.id;
  return isOpening(e) ? e.hostId : null;
}

/** Telhado sob o cursor: na 3D, o que a vista destaca (`hit3d`); na planta, o que cobre o ponto. */
function roofUnder(p: Project, levelId: Id, info: PointerInfo, mpp: number): Id | null {
  if (info.hit3d !== undefined) {
    const r: Roof | undefined = info.hit3d ? (p.elements[info.hit3d] as Roof | undefined) : undefined;
    return r && isRoof(r) ? r.id : null;
  }
  return pickRoofAt(p, levelId, info.raw, mpp);
}

/**
 * Aviso de cobertura de `w` pelo telhado `roofId` (mesma regra do C2, `roofWallIssues`), ou null quando o eixo está todo
 * sob o telhado. Parede curva não acompanha telhado (o perfil é só de parede reta).
 */
export function roofCoverNote(p: Project, w: Wall, roofId: Id, lang: Lang = 'pt'): string | null {
  if (w.sag !== 0) return translate(lang, 'tl_msg_roof_curve', { id: w.id });
  const rs = resolveAllRoofs(p).filter((r) => r.roofId === roofId);
  const rep = roofAxisReport({ ...w, attachTopRoofId: roofId }, rs);
  if (!rep || rep.uncovered <= UNCOVERED_TOL) return null;
  if (rep.uncovered >= rep.length - UNCOVERED_TOL) return translate(lang, 'tl_msg_roof_outside', { id: w.id });
  return translate(lang, 'tl_msg_roof_uncovered', { id: w.id, d: fmt(unitsOf(p), rep.uncovered) });
}

type Stage = 'walls' | 'roof';

/**
 * Anexar topo (Revit: Attach Top/Base). Etapa 1: paredes (as selecionadas ao iniciar, ou clicadas; clicar de novo tira).
 * Etapa 2: clique no telhado. Um comando `updateElements` grava `attachTopToRoof` e `attachTopRoofId` nas paredes, em um
 * único passo de desfazer. Parede sem cobertura total ou curva entra com aviso na barra de status. Enter (ou Tab) alterna
 * entre as etapas. Funciona na planta e na vista 3D (o ponto do clique é o da superfície sob o cursor).
 */
export class AttachRoofTool extends ToolBase {
  readonly id = 'attachroof';
  readonly label = 'Anexar topo';
  override get hint(): string {
    return this.t('tl_hint_attach_roof');
  }
  readonly pick3d = true;
  private stage: Stage = 'walls';
  private walls: Id[] = [];

  protected reset(): void {
    this.stage = 'walls';
    this.walls = [];
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.walls.length > 0 || this.stage === 'roof';
  }

  override start(): void {
    this.reset();
    const p = this.env.project();
    const sel = this.env.selection().filter((id) => isWall(p.elements[id]));
    if (sel.length) {
      this.walls = sel;
      this.toRoof();
    } else this.env.say(this.t('tl_hint_attach_roof'));
  }

  private toRoof(): void {
    if (!this.walls.length) {
      this.env.say(this.t('tl_msg_pick_wall_first'));
      return;
    }
    this.stage = 'roof';
    this.env.say(this.t('tl_msg_walls_chosen', { n: this.walls.length, hint: this.t('tl_hint_attach_roof_pick') }));
  }

  private toWalls(): void {
    this.stage = 'walls';
    this.env.say(this.t('tl_hint_attach_roof'));
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.items = [];
    if (this.walls.length) this.items.push({ kind: 'highlight', ids: this.walls });
    if (this.stage === 'roof') {
      const roof = roofUnder(this.env.project(), this.env.levelId(), p, this.env.metersPerPixel());
      if (roof) this.items.push({ kind: 'highlight', ids: [roof] });
    }
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const pr = this.env.project();
    const levelId = this.env.levelId();
    const mpp = this.env.metersPerPixel();
    if (this.stage === 'walls') {
      const w = wallUnder(pr, levelId, p, mpp);
      if (!w) {
        const onRoof = !!p.hit3d && isRoof(pr.elements[p.hit3d]);
        this.env.say(this.t(onRoof ? 'tl_msg_that_is_roof' : 'tl_msg_click_wall_then_enter'));
        return;
      }
      this.walls = this.walls.includes(w) ? this.walls.filter((id) => id !== w) : [...this.walls, w];
      this.env.say(this.walls.length ? this.t('tl_msg_walls_chosen_enter', { n: this.walls.length }) : this.t('tl_hint_attach_roof'));
      return;
    }
    const roof = roofUnder(pr, levelId, p, mpp);
    if (!roof) {
      // Se clicou numa parede na etapa do telhado, troca a seleção para essa parede
      const w = wallUnder(pr, levelId, p, mpp);
      if (w) {
        this.walls = [w];
        this.env.setSelection([w]);
        this.env.say(this.t('tl_msg_wall_changed'));
        return;
      }
      this.env.say(this.t('tl_msg_attach_pick_roof'));
      return;
    }
    this.apply(roof);
  }

  override confirm(): void {
    if (this.stage === 'walls') this.toRoof();
    else this.toWalls();
  }

  override tab(): void {
    this.confirm();
  }

  /** Grava o telhado nas paredes escolhidas, em um único comando (um passo de desfazer). Conclui a ferramenta. */
  private apply(roofId: Id): void {
    const pr = this.env.project();
    const ids = this.walls.filter((id) => isWall(pr.elements[id]));
    if (!ids.length) {
      this.toWalls();
      this.env.say(this.t('tl_msg_walls_gone'));
      return;
    }
    const notes = ids.flatMap((id) => {
      const w = pr.elements[id];
      const note = isWall(w) ? roofCoverNote(pr, w, roofId, this.uiLang()) : null;
      return note ? [note] : [];
    });
    this.env.exec({ type: 'updateElements', ids, patch: { attachTopToRoof: true, attachTopRoofId: roofId } });
    this.reset();
    const done = this.t('tl_msg_top_attached', { n: ids.length });
    const more = notes.length > 1 ? this.t('tl_msg_and_more', { n: notes.length - 1 }) : '';
    this.env.say(notes.length ? `${done}${this.t('tl_msg_warning_note', { msg: `${notes[0]}${more}` })}.${this.t('tl_msg_ctrl_z_undo')}` : `${done}${this.t('tl_msg_ctrl_z_undo')}`);
    this.env.done();
  }
}

/**
 * Desanexar topo (Revit: Detach Top/Base). Com paredes selecionadas, Enter (ou ao ativar a ferramenta) solta o topo delas;
 * clicar numa parede solta só essa. Cada solta é um comando, com passo próprio de desfazer.
 */
export class DetachRoofTool extends ToolBase {
  readonly id = 'detachroof';
  readonly label = 'Desanexar topo';
  override get hint(): string {
    return this.t('tl_hint_detach_roof');
  }
  readonly pick3d = true;

  protected reset(): void {
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return false;
  }

  /** Paredes selecionadas (qualquer uma; as não anexadas são ignoradas com aviso). */
  private selectedWalls(): Id[] {
    const pr = this.env.project();
    return this.env.selection().filter((id) => isWall(pr.elements[id]));
  }

  override start(): void {
    this.reset();
    const sel = this.selectedWalls();
    if (sel.length) this.detach(sel);
    else this.env.say(this.hint);
  }

  override confirm(): void {
    const sel = this.selectedWalls();
    if (sel.length) this.detach(sel);
    else this.env.say(this.t('tl_msg_select_walls_enter'));
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const w = wallUnder(this.env.project(), this.env.levelId(), p, this.env.metersPerPixel());
    if (!w) {
      this.env.say(this.t('tl_msg_click_attached_wall'));
      return;
    }
    this.detach([w]);
  }

  /** Solta o topo das paredes `ids` que estão anexadas; uma só alteração, um passo de desfazer. */
  private detach(ids: Id[]): void {
    const pr = this.env.project();
    const attached = ids.filter((id) => {
      const w = pr.elements[id];
      return isWall(w) && w.attachTopToRoof === true;
    });
    if (!attached.length) {
      this.env.say(this.t('tl_msg_attach_none'));
      return;
    }
    this.env.exec({ type: 'updateElements', ids: attached, patch: { attachTopToRoof: false, attachTopRoofId: undefined } });
    this.env.say(this.t('tl_msg_top_detached', { n: attached.length }));
  }
}
