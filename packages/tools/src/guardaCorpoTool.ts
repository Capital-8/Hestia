import { dist, type Vec2 } from '@hestia/geom';
import {
  DEFAULT_TIPO_GUARDA_CORPO_ID,
  LIMITES_GUARDA_CORPO,
  isGuardaCorpo,
  makeGuardaCorpo,
  newId,
  type HospedeiroGC,
  type Id,
  type LadoGC,
  type LadoHospedado,
  type PontoCaminhoGC,
  type Project,
} from '@hestia/model';
import { ToolBase } from './base.ts';
import type { PointerInfo, PreviewItem, ToolEnv } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Lado ligado nos dois lados de uma escada ou rampa, nos lances e nos patamares (o padrão do botão de criar). */
const LIGADO: LadoHospedado = { lance: true, patamar: true };
export const ladosAmbosGC = (): Record<LadoGC, LadoHospedado> => ({ esquerdo: { ...LIGADO }, direito: { ...LIGADO } });

/** Tipo de guarda-corpo válido: o pedido se existir no projeto, senão o padrão, senão o primeiro. */
export function tipoGuardaCorpoValido(p: Project, want?: Id | null): Id | null {
  if (want && p.tiposGuardaCorpo?.[want]) return want;
  if (p.tiposGuardaCorpo?.[DEFAULT_TIPO_GUARDA_CORPO_ID]) return DEFAULT_TIPO_GUARDA_CORPO_ID;
  return Object.keys(p.tiposGuardaCorpo ?? {})[0] ?? null;
}

/** Subconjunto do ambiente de ferramenta que a criação de guarda-corpo usa (também serve à faixa de ações). */
export type RailingEnv = Pick<ToolEnv, 'project' | 'exec' | 'setSelection'>;

export type RailingCreateResult = { id: Id } | { error: string };

/**
 * Cria um guarda-corpo com o hospedeiro dado em UM comando `addGuardaCorpo` (um passo de desfazer) e o seleciona.
 * O tipo cai no pedido, no padrão ou no primeiro do projeto; sem tipo, devolve erro. Nunca cria o guarda-corpo sem tipo.
 */
export function criarGuardaCorpo(
  env: RailingEnv,
  levelId: Id,
  hospedeiro: HospedeiroGC,
  opts: { typeId?: Id | null; mark?: string; noMessage?: string } = {},
): RailingCreateResult {
  const p = env.project();
  const typeId = tipoGuardaCorpoValido(p, opts.typeId);
  if (!typeId) return { error: opts.noMessage ?? 'O projeto não tem tipo de guarda-corpo.' };
  const id = newId('gc');
  const guardaCorpo = makeGuardaCorpo({ id, levelId, typeId, hospedeiro, mark: opts.mark ?? '' });
  env.exec({ type: 'addGuardaCorpo', guardaCorpo });
  env.setSelection([id]);
  return { id };
}

/** Já há guarda-corpo ligado a esta escada ou rampa? */
export function temGuardaCorpoDeHospedeiro(p: Project, hostId: Id): boolean {
  return Object.values(p.elements).some((e) => isGuardaCorpo(e) && (e.hospedeiro.tipo === 'escada' ? e.hospedeiro.escadaId : e.hospedeiro.tipo === 'rampa' ? e.hospedeiro.rampaId : null) === hostId);
}

/** Ids dos guarda-corpos hospedados nesta escada ou rampa. */
export function guardaCorposDoHospedeiro(p: Project, hostId: Id): Id[] {
  return Object.values(p.elements)
    .filter((e) => isGuardaCorpo(e) && (e.hospedeiro.tipo === 'escada' ? e.hospedeiro.escadaId : e.hospedeiro.tipo === 'rampa' ? e.hospedeiro.rampaId : null) === hostId)
    .map((e) => e.id);
}

/** Desliga o guarda-corpo da escada ou rampa: remove os hospedados nela (quem chama agrupa num único passo de desfazer). Devolve quantos saíram. */
export function removerGuardaCorpoDeHospedeiro(env: Pick<ToolEnv, 'project' | 'exec'>, hostId: Id): number {
  const ids = guardaCorposDoHospedeiro(env.project(), hostId);
  for (const id of ids) env.exec({ type: 'deleteGuardaCorpo', id });
  return ids.length;
}

/**
 * Ferramenta de guarda-corpo (decisão 0055, Fase 6a): traça o caminho manual (borda de laje, varanda, mezanino). Clique
 * nos pontos (a captura usa as bordas de laje, paredes e escadas); Enter conclui, C fecha o laço, Esc cancela.
 */
export class GuardaCorpoTool extends ToolBase {
  readonly id = 'railing';
  readonly label = 'Guarda-corpo';
  override get hint(): string {
    return this.t('tl_hint_railing');
  }
  private pts: Vec2[] = [];

  protected reset(): void {
    this.pts = [];
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.pts.length > 0;
  }

  override move(p: PointerInfo): void {
    const q = this.snap(p).point;
    const items: PreviewItem[] = [];
    for (let i = 1; i < this.pts.length; i++) items.push({ kind: 'line', a: this.pts[i - 1]!, b: this.pts[i]! });
    const tail = this.pts[this.pts.length - 1];
    if (tail) items.push({ kind: 'line', a: tail, b: q, dashed: true });
    this.items = items;
  }

  override click(p: PointerInfo): void {
    const q = this.snap(p).point;
    const tail = this.pts[this.pts.length - 1];
    if (tail && dist(tail, q) < 1e-6) return;
    if (this.pts.length >= LIMITES_GUARDA_CORPO.caminhoManual) {
      this.env.say(this.t('tl_msg_railing_point', { n: this.pts.length }));
      return;
    }
    this.pts.push(q);
    this.env.say(this.t('tl_msg_railing_point', { n: this.pts.length }));
  }

  /** `C` fecha o laço (com três pontos ou mais) e conclui. */
  override type(text: string): boolean {
    if (text.toLowerCase() === 'c' && this.pts.length >= 3) {
      this.finish(true);
      return true;
    }
    return false;
  }

  /** Enter conclui o caminho aberto (com dois pontos ou mais). */
  override confirm(): void {
    if (this.pts.length >= 2) this.finish(false);
    else if (this.pts.length === 1) this.env.say(this.t('tl_msg_railing_min'));
    else super.confirm();
  }

  private finish(fechado: boolean): void {
    const caminho: PontoCaminhoGC[] = this.pts.map((v) => ({ x: v.x, y: v.y, dz: 0 }));
    const r = criarGuardaCorpo(this.env, this.env.levelId(), { tipo: 'manual', uso: 'livre', caminho, fechado, ladoDeslocamento: 'esquerdo' }, {
      typeId: this.env.options().railingTypeId ?? null,
      noMessage: this.t('tl_msg_railing_no_type'),
    });
    if ('error' in r) {
      this.env.say(r.error);
      return;
    }
    this.reset();
    this.env.say(this.hint);
  }
}

/** Mensagens de criação a partir de escada ou rampa, no idioma pedido (usadas pela faixa de ações). */
export function mensagensDeGuardaCorpo(lang: Lang = 'pt'): { noHost: string; exists: string; noType: string } {
  return {
    noHost: translate(lang, 'tl_msg_railing_no_host'),
    exists: translate(lang, 'tl_msg_railing_host_exists'),
    noType: translate(lang, 'tl_msg_railing_no_type'),
  };
}
