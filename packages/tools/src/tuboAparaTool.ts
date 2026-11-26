import type { Vec2 } from '@hestia/geom';
import { isComponent, type Id, type Project } from '@hestia/model';
import { componentIdsInBox } from './pick.ts';
import { pickLineTarget } from './ringTarget.ts';
import { planejarAteReferencia, planejarCanto, type Referencia } from './tuboAparar.ts';
import { aplicarPlanoTrecho, itensDoPlanoTrecho, textoDoPlanoTrecho, type PlanoTrecho } from './tuboPegadoresPlano.ts';
import { trechoEm } from './tuboTrecho.ts';
import type { PointerInfo, PreviewItem, ToolEnv, TrimMode } from './types.ts';

/*
 * Aparar/Estender sobre tubo e eletroduto (ficha F6a): a parte de tubo da ferramenta `TrimTool`. Modo 'canto': dois cliques em dois
 * tubos (cada clique marca a parte que fica) e o canto fecha com o joelho. Modos 'unico'/'varios': 1º clique na referência (tubo, parede ou
 * peça), 2º no tubo a estender ou aparar. Prévia viva (fantasma, ou vermelho com motivo) e um passo de desfazer.
 */

type Primeiro = { tipo: 'tubo' | 'parede' | 'peca'; id: Id; at: Vec2 };

export class AparaTubo {
  private primeiro: Primeiro | null = null;

  constructor(private readonly env: ToolEnv, private readonly modo: () => TrimMode) {}

  busy(): boolean {
    return this.primeiro !== null;
  }

  reset(): void {
    this.primeiro = null;
  }

  private tubo(p: Project, at: Vec2): Id | null {
    return trechoEm(p, this.env.levelId(), at, Math.max(0.02, 6 * this.env.metersPerPixel()))?.id ?? null;
  }

  /** Referência sob o cursor (no modo um elemento, primeiro clique): tubo, parede ou peça. */
  private referencia(p: Project, at: Vec2): Primeiro | null {
    const t = this.tubo(p, at);
    if (t) return { tipo: 'tubo', id: t, at };
    const w = pickLineTarget(p, this.env.levelId(), at, this.env.metersPerPixel(), this.env);
    if (w?.kind === 'wall') return { tipo: 'parede', id: w.id, at };
    const r = this.env.metersPerPixel() * 4;
    const c = componentIdsInBox(p, this.env.levelId(), { x: at.x - r, y: at.y - r }, { x: at.x + r, y: at.y + r }, this.env).find((id) => isComponent(p.elements[id]));
    return c ? { tipo: 'peca', id: c, at } : null;
  }

  /** O plano do 2º clique, ou `null` se o cursor não está sobre um alvo válido. */
  private plano(p: Project, at: Vec2): PlanoTrecho | null {
    const alvo = this.tubo(p, at);
    const a = this.primeiro;
    if (!a || !alvo) return null;
    if (this.modo() === 'canto') return a.tipo === 'tubo' && a.id !== alvo ? planejarCanto(p, { id: a.id, at: a.at }, { id: alvo, at }) : null;
    if (a.id === alvo) return null;
    return planejarAteReferencia(p, alvo, at, { tipo: a.tipo, id: a.id, at: a.at } as Referencia);
  }

  /** O cursor está sobre algo que esta parte trata (tubo, ou o 2º passo já iniciado)? */
  trata(at: Vec2): boolean {
    return this.primeiro !== null || this.tubo(this.env.project(), at) !== null;
  }

  move(p: PointerInfo): PreviewItem[] | null {
    const pr = this.env.project();
    if (!this.trata(p.raw)) return null;
    const base: PreviewItem[] = [{ kind: 'highlight', ids: [...(this.primeiro ? [this.primeiro.id] : []), ...(this.tubo(pr, p.raw) ? [this.tubo(pr, p.raw) as Id] : [])] }];
    const plano = this.plano(pr, p.raw);
    if (plano?.bloqueado !== undefined) this.env.say(`Bloqueado: ${plano.bloqueado}${plano.sugestao ? ' ' + plano.sugestao : ''}`);
    return [...base, ...itensDoPlanoTrecho(pr, plano)];
  }

  click(p: PointerInfo): void {
    const pr = this.env.project();
    if (!this.primeiro) {
      const ref = this.modo() === 'canto' ? (this.tubo(pr, p.raw) ? { tipo: 'tubo' as const, id: this.tubo(pr, p.raw) as Id, at: p.raw } : null) : this.referencia(pr, p.raw);
      if (!ref) return;
      this.primeiro = ref;
      this.env.say(this.modo() === 'canto' ? 'Aparar ao canto: clique no segundo tubo, na parte que deve ficar.' : 'Aparar/Estender: clique no tubo a estender ou aparar, na parte que deve ficar.');
      return;
    }
    const plano = this.plano(pr, p.raw);
    if (!plano) {
      this.env.say('Escolha outro tubo.');
      return;
    }
    const r = aplicarPlanoTrecho(this.env, plano, 'Aparar/Estender tubo');
    if (!r.ok) {
      this.env.say(`Bloqueado: ${r.motivo}`);
      return;
    }
    this.primeiro = null;
    const texto = [...r.avisos].join(' ');
    this.env.say(`Tubo ajustado. ${texto}`.trim());
    const alerta = textoDoPlanoTrecho(plano);
    if (alerta !== '' && this.env.alert) this.env.alert(alerta);
  }
}
