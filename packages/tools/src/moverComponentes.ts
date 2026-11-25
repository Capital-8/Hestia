import type { Vec2 } from '@hestia/geom';
import { isComponent, type Id, type Project } from '@hestia/model';
import { componentGhostItemsNasPoses } from './componentGhost.ts';
import { ArrastoComponentes, textoStatusArrastoComponentes, type ResultadoArrastoComponentes } from './componentDrag.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

/**
 * Componentes de família (elétricos, hidráulicos, móveis) na ferramenta Mover. Usa o mesmo arrasto do Selecionar
 * (`ArrastoComponentes`: encaixe na parede e nos vizinhos, movimento rígido do conjunto), e o gesto inteiro vira um só passo de
 * desfazer, junto com as demais peças da seleção. A ligação de eletroduto não é reconectada: ela fica aberta e a rede acusa.
 */
export class MovimentoComponentes {
  private arrasto: ArrastoComponentes | null = null;
  private poses: ResultadoArrastoComponentes | null = null;

  /** Ids da seleção que são componentes de família (na ordem da seleção). */
  static selecionados(p: Project, selecao: readonly Id[]): Id[] {
    return selecao.filter((id) => isComponent(p.elements[id]));
  }

  constructor(private readonly env: Pick<ToolEnv, 'project' | 'levelId' | 'opcoesEncaixe' | 'say'>, private readonly ids: readonly Id[]) {}

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

  /** Prévia dos componentes no deslocamento `d`; a barra mostra o encaixe ou a colisão do passo. */
  previa(d: Vec2, alt: boolean): PreviewItem[] {
    const r = this.calcular(d, alt);
    const st = textoStatusArrastoComponentes(this.env.project(), r);
    if (st) this.env.say(st);
    return componentGhostItemsNasPoses(this.env.project(), r.poses);
  }

  /** Grava as poses de `d` num único passo (dentro da transação do Mover). */
  aplicar(env: Pick<ToolEnv, 'exec' | 'transaction'>, d: Vec2, alt: boolean): void {
    const r = this.calcular(d, alt);
    this.arrasto?.aplicar(env, r.poses);
  }
}
