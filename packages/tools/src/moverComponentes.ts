import type { Vec2 } from '@hestia/geom';
import type { PlanoMovimento } from '@hestia/engine';
import { isComponent, type Id, type Project } from '@hestia/model';
import { componentGhostItemsNasPoses } from './componentGhost.ts';
import { ArrastoComponentes, textoStatusArrastoComponentes, type ResultadoArrastoComponentes } from './componentDrag.ts';
import { aplicarPlanoDoGesto, itensDoPlano, planoDoGesto, type AmbienteMovimento } from './movimentoLigadoTools.ts';
import { DEFAULT_DISJOIN, type PreviewItem, type ToolEnv } from './types.ts';

/**
 * Componentes de família (elétricos, hidráulicos, móveis) na ferramenta Mover. Usa o mesmo arrasto do Selecionar
 * (`ArrastoComponentes`: encaixe na parede e nos vizinhos, movimento rígido do conjunto), e o gesto inteiro vira um só passo de
 * desfazer, junto com as demais peças da seleção. As ligações ACOMPANHAM (ficha F4): tubos esticam e conexões vêm junto
 * (`planejarMovimentoLigado`); "Desconectar" na barra (ou Alt) solta tudo e deixa só o movimento rígido, como antes.
 */
export class MovimentoComponentes {
  private arrasto: ArrastoComponentes | null = null;
  private poses: ResultadoArrastoComponentes | null = null;

  /** Ids da seleção que são componentes de família (na ordem da seleção). */
  static selecionados(p: Project, selecao: readonly Id[]): Id[] {
    return selecao.filter((id) => isComponent(p.elements[id]));
  }

  constructor(private readonly env: Pick<ToolEnv, 'project' | 'levelId' | 'opcoesEncaixe' | 'say' | 'options'>, private readonly ids: readonly Id[]) {}

  /** Poses finais de todos os membros para o deslocamento `d` (o líder é o primeiro da seleção). */
  calcular(d: Vec2, alt: boolean): ResultadoArrastoComponentes {
    const pr = this.env.project();
    if (this.arrasto === null) {
      const lider = this.ids[0]!;
      const c = pr.elements[lider];
      this.arrasto = new ArrastoComponentes(pr, isComponent(c) ? c.levelId : this.env.levelId(), [...this.ids], lider);
    }
    const enc = this.env.opcoesEncaixe?.(alt) ?? { semEncaixe: alt, encaixeVizinho: true };
    this.poses = this.arrasto.mover(d, enc.semEncaixe, enc.encaixeVizinho);
    return this.poses;
  }

  /** Plano das ligações para o gesto `d`: `null` com "Desconectar" ligado (opção invertida pelo Alt), com giro ou sem nada a mover. */
  plano(d: Vec2, alt: boolean): PlanoMovimento | null {
    return this.planoDe(this.calcular(d, alt), alt);
  }

  private planoDe(r: ResultadoArrastoComponentes, alt: boolean): PlanoMovimento | null {
    const solta = (this.env.options().moveDisjoin ?? DEFAULT_DISJOIN.move) !== alt;
    return planoDoGesto(this.env.project(), r.poses, !solta);
  }

  /** Motivo do bloqueio do gesto (trecho acima do comprimento máximo), ou `null`. */
  bloqueado(d: Vec2, alt: boolean): string | null {
    return this.plano(d, alt)?.bloqueado ?? null;
  }

  /** Prévia dos componentes no deslocamento `d` e dos tubos esticados; a barra mostra o encaixe, a colisão ou o bloqueio. */
  previa(d: Vec2, alt: boolean): PreviewItem[] {
    const r = this.calcular(d, alt);
    const plano = this.planoDe(r, alt);
    const st = plano?.bloqueado !== undefined ? `Bloqueado: ${plano.bloqueado}` : textoStatusArrastoComponentes(this.env.project(), r);
    if (st) this.env.say(st);
    return [...componentGhostItemsNasPoses(this.env.project(), r.poses), ...itensDoPlano(this.env.project(), plano)];
  }

  /** Grava as poses de `d` e o plano das ligações num único passo (dentro da transação do Mover). */
  aplicar(env: AmbienteMovimento, d: Vec2, alt: boolean): void {
    const r = this.calcular(d, alt);
    const plano = this.planoDe(r, alt);
    env.transaction('Mover componente', () => {
      this.arrasto?.aplicar(env, r.poses);
      if (plano) aplicarPlanoDoGesto(env, plano, this.ids);
    });
  }
}
