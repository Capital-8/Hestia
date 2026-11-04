import type { Vec2 } from '@hestia/geom';
import {
  caixaLocalDoComponente,
  corposDoNivel,
  facesDasParedes,
  posarArrastado,
  posarGrupoRigido,
  type CaixaLocal,
  type Corpo,
  type FaceDeParede,
  type Pose,
} from '@hestia/engine';
import { isComponent, levelElevation, type Id, type Project } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/** Pose no plano devolvida para cada membro do arrasto. */
export interface PoseNoPlano {
  x: number;
  y: number;
  rotation: number;
}

/** Resultado de um passo do arrasto de componentes da planta. */
export interface ResultadoArrastoComponentes {
  poses: Map<Id, PoseNoPlano>;
  parede?: number;
  vizinho?: string;
  colisoes: string[];
}

/** Caixa de emergência para um componente sem peças: mantém o arrasto utilizável sem encaixe geométrico. */
const CAIXA_VAZIA: CaixaLocal = { min: [0, 0, 0], max: [0, 0, 0] };

/** Tolerância (rad) para considerar que o conjunto não girou. */
const TOL_ROTACAO = 1e-9;

/**
 * Arrasto de componentes na PLANTA com o mesmo encaixe do 3D. O líder é o componente sob o cursor; a pose desejada dele é a
 * inicial deslocada pelo ponteiro, `posarArrastado` decide o encaixe na parede/vizinho e os demais membros acompanham por
 * movimento rígido (`posarGrupoRigido`). O entorno (outros móveis e faces de parede) é lido uma vez, no primeiro passo do arrasto.
 */
export class ArrastoComponentes {
  private readonly projeto: Project;
  private readonly ids: Id[];
  private readonly lider: Id;
  private readonly levelId: Id;
  private readonly iniciais = new Map<Id, Pose>();
  private readonly caixa: CaixaLocal;
  private outros: Corpo[] | null = null;
  private faces: FaceDeParede[] | null = null;

  constructor(projeto: Project, levelId: Id, ids: readonly Id[], lider: Id) {
    if (ids.length === 0) throw new Error('O arrasto precisa de ao menos um componente.');
    if (!ids.includes(lider)) throw new Error('O líder do arrasto precisa estar entre os componentes.');
    this.projeto = projeto;
    this.ids = [...ids];
    this.lider = lider;
    this.levelId = levelId;
    const elevacao = levelElevation(projeto, levelId);
    for (const id of this.ids) {
      const e = projeto.elements[id];
      if (!isComponent(e)) throw new Error('Componente do arrasto não existe: ' + id);
      this.iniciais.set(id, { x: e.x, y: e.y, rotation: e.rotation, mirrored: e.mirrored, z: elevacao + e.z });
    }
    const doLider = projeto.elements[this.lider];
    this.caixa = (isComponent(doLider) ? caixaLocalDoComponente(projeto, doLider) : null) ?? CAIXA_VAZIA;
  }

  /** Move o líder pelo deslocamento do ponteiro e devolve as poses finais de todos os membros. */
  mover(deslocamento: Vec2, semEncaixe: boolean): ResultadoArrastoComponentes {
    const inicialDoLider = this.iniciais.get(this.lider)!;
    const desejada: Pose = {
      ...inicialDoLider,
      x: inicialDoLider.x + deslocamento.x,
      y: inicialDoLider.y + deslocamento.y,
    };
    const { outros, faces } = this.entorno();
    const resultado = posarArrastado(
      { alvo: { id: this.lider, pose: desejada, caixa: this.caixa }, outros, faces },
      { semEncaixe },
    );
    const poses = posarGrupoRigido({ lider: this.lider, iniciais: this.iniciais, poseFinalDoLider: resultado.pose }) as Map<Id, PoseNoPlano>;
    return {
      poses,
      ...(resultado.parede !== undefined ? { parede: resultado.parede } : {}),
      ...(resultado.vizinho !== undefined ? { vizinho: resultado.vizinho } : {}),
      colisoes: [...resultado.colisoes.moveis],
    };
  }

  /**
   * Aplica as poses num único passo de desfazer. Conjuntos inteiros vão por `moveComponentGroup` quando não houve giro; com giro,
   * `rotateComponentGroup` em torno da pose inicial do líder seguido do restante em `moveComponentGroup` mantém a linha coerente.
   * Os demais componentes (soltos ou de conjunto parcial) vão por `updateComponent`.
   */
  aplicar(env: Pick<ToolEnv, 'exec' | 'transaction'>, poses: ReadonlyMap<Id, PoseNoPlano>): void {
    const finalDoLider = poses.get(this.lider);
    if (!finalDoLider) return;
    const inicialDoLider = this.iniciais.get(this.lider)!;
    const dTheta = finalDoLider.rotation - inicialDoLider.rotation;
    const girou = Math.abs(dTheta) > TOL_ROTACAO;
    const alvo = new Set(this.ids);
    const grupos = Object.values(this.projeto.componentGroups ?? {}).filter(
      (g) => g.membros.length > 0 && g.membros.every((id) => alvo.has(id)),
    );
    const nosGrupos = new Set(grupos.flatMap((g) => g.membros));
    const dx = finalDoLider.x - inicialDoLider.x;
    const dy = finalDoLider.y - inicialDoLider.y;
    const centro = { x: inicialDoLider.x, y: inicialDoLider.y };
    env.transaction('Mover componente', () => {
      for (const grupo of grupos) {
        if (girou) env.exec({ type: 'rotateComponentGroup', id: grupo.id, centro, angulo: dTheta });
        env.exec({ type: 'moveComponentGroup', id: grupo.id, dx, dy });
      }
      for (const id of this.ids) {
        if (nosGrupos.has(id)) continue;
        const pose = poses.get(id);
        if (!pose) continue;
        env.exec({ type: 'updateComponent', id, patch: { x: pose.x, y: pose.y, rotation: pose.rotation } });
      }
      if (girou) this.removerLinhasParciais(env);
    });
  }

  /** Com giro, o conjunto que só teve parte dos membros movida perde a linha (ela deixaria de representar a fila). */
  private removerLinhasParciais(env: Pick<ToolEnv, 'exec'>): void {
    const alvo = new Set(this.ids);
    for (const grupo of Object.values(this.projeto.componentGroups ?? {})) {
      if (!grupo.linha) continue;
      const tocados = grupo.membros.filter((id) => alvo.has(id)).length;
      if (tocados === 0 || tocados === grupo.membros.length) continue;
      const semLinha = { ...grupo };
      delete semLinha.linha;
      env.exec({ type: 'upsertComponentGroup', group: semLinha });
    }
  }

  private entorno(): { outros: readonly Corpo[]; faces: readonly FaceDeParede[] } {
    if (this.outros === null || this.faces === null) {
      this.outros = corposDoNivel(this.projeto, this.levelId, new Set(this.ids));
      this.faces = facesDasParedes(this.projeto, this.levelId);
    }
    return { outros: this.outros, faces: this.faces };
  }
}

function marcaOuId(projeto: Project, id: Id): string {
  const e = projeto.elements[id];
  return isComponent(e) && e.mark.trim() ? e.mark : id;
}

/** Texto da barra de status para o resultado do passo, como no arrasto do 3D. */
export function textoStatusArrastoComponentes(
  projeto: Project,
  resultado: Pick<ResultadoArrastoComponentes, 'parede' | 'vizinho' | 'colisoes'>,
): string {
  if (resultado.parede !== undefined) return 'Encaixado na parede';
  if (resultado.vizinho !== undefined) return `Colado em ${marcaOuId(projeto, resultado.vizinho)}`;
  const primeiro = resultado.colisoes[0];
  return primeiro !== undefined ? `Colide com ${marcaOuId(projeto, primeiro)}` : '';
}
