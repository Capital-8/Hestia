import {
  caixaLocalDoComponente,
  corposDoNivel,
  facesDasParedes,
  posarArrastado,
  posarGrupoRigido,
  type CaixaLocal,
  type Corpo,
  type EntradaArrasto,
  type FaceDeParede,
  type OpcoesArrasto,
  type Pose,
  type ResultadoArrasto,
} from '@hestia/engine';
import { isComponent, levelElevation, type Component, type Id, type Project } from '@hestia/model';

/** Dependências do arrasto; nos testes podem ser trocadas por versões simuladas. */
export interface DepsArrasto3D {
  caixaLocalDoComponente: (p: Project, c: Component) => CaixaLocal | null;
  corposDoNivel: (p: Project, levelId: Id, excluir: ReadonlySet<Id>) => Corpo[];
  facesDasParedes: (p: Project, levelId: Id) => FaceDeParede[];
  posarArrastado: (entrada: EntradaArrasto, opcoes?: OpcoesArrasto) => ResultadoArrasto;
}

const DEPS_REAIS: DepsArrasto3D = {
  caixaLocalDoComponente,
  corposDoNivel,
  facesDasParedes,
  posarArrastado,
};

/** Caixa de emergência para um componente sem peças: mantém o arrasto utilizável sem encaixe geométrico. */
const CAIXA_VAZIA: CaixaLocal = { min: [0, 0, 0], max: [0, 0, 0] };

/** Pose no plano que o arrasto devolve para cada membro. */
export interface PoseNoPlano {
  x: number;
  y: number;
  rotation: number;
}

/** Resultado de um passo do arrasto. */
export interface ResultadoMover3D {
  poses: Map<Id, PoseNoPlano>;
  parede?: number;
  vizinho?: string;
  colisoes: string[];
}

export interface OpcoesArrasto3D {
  projeto: Project;
  /** Componentes que se movem: o clicado ou todos os membros do conjunto, com o clicado primeiro (o líder). */
  ids: readonly Id[];
  levelId: Id;
  /** Ponto (x, y) do plano em que o ponteiro começou. */
  ponteiro: { x: number; y: number };
  deps?: Partial<DepsArrasto3D>;
}

/**
 * Arrasto de componentes no plano do piso (F3-arrasto3d), sem DOM e sem three.js. O líder é o primeiro de `ids`:
 * o deslocamento do ponteiro desde `ponteiro` vira a pose desejada dele, `posarArrastado` decide o encaixe e os demais
 * membros acompanham o mesmo movimento rígido (translação e, se o líder girou ao encaixar, giro em torno da pose inicial).
 * O entorno (outros móveis e faces de parede) é lido uma vez, na primeira chamada de `mover`, e reaproveitado.
 */
export class Arrasto3D {
  private readonly projeto: Project;
  private readonly ids: Id[];
  private readonly lider: Id;
  private readonly levelId: Id;
  private readonly ponteiro: { x: number; y: number };
  private readonly deps: DepsArrasto3D;
  private readonly iniciais = new Map<Id, Pose>();
  private readonly caixa: CaixaLocal;
  private outros: Corpo[] | null = null;
  private faces: FaceDeParede[] | null = null;

  constructor({ projeto, ids, levelId, ponteiro, deps }: OpcoesArrasto3D) {
    if (ids.length === 0) throw new Error('O arrasto precisa de ao menos um componente.');
    this.projeto = projeto;
    this.ids = [...ids];
    this.lider = this.ids[0]!;
    this.levelId = levelId;
    this.ponteiro = { ...ponteiro };
    this.deps = { ...DEPS_REAIS, ...deps };
    const elevacao = levelElevation(projeto, levelId);
    for (const id of this.ids) {
      const e = projeto.elements[id];
      if (!isComponent(e)) throw new Error('Componente do arrasto não existe: ' + id);
      this.iniciais.set(id, { x: e.x, y: e.y, rotation: e.rotation, mirrored: e.mirrored, z: elevacao + e.z });
    }
    const lider = projeto.elements[this.lider];
    this.caixa = (isComponent(lider) ? this.deps.caixaLocalDoComponente(projeto, lider) : null) ?? CAIXA_VAZIA;
  }

  /** Move o líder para o deslocamento do ponteiro e devolve as poses finais de todos os membros. */
  mover(ponto: { x: number; y: number }, opcoes: { semEncaixe: boolean }): ResultadoMover3D {
    const inicialDoLider = this.iniciais.get(this.lider)!;
    const desejada: Pose = {
      ...inicialDoLider,
      x: inicialDoLider.x + (ponto.x - this.ponteiro.x),
      y: inicialDoLider.y + (ponto.y - this.ponteiro.y),
    };
    const { outros, faces } = this.entorno();
    const resultado = this.deps.posarArrastado(
      { alvo: { id: this.lider, pose: desejada, caixa: this.caixa }, outros, faces },
      { semEncaixe: opcoes.semEncaixe },
    );
    const poses = posarGrupoRigido({ lider: this.lider, iniciais: this.iniciais, poseFinalDoLider: resultado.pose });
    return {
      poses,
      ...(resultado.parede !== undefined ? { parede: resultado.parede } : {}),
      ...(resultado.vizinho !== undefined ? { vizinho: resultado.vizinho } : {}),
      colisoes: [...resultado.colisoes.moveis],
    };
  }

  private entorno(): { outros: readonly Corpo[]; faces: readonly FaceDeParede[] } {
    if (this.outros === null || this.faces === null) {
      const excluir = new Set(this.ids);
      this.outros = this.deps.corposDoNivel(this.projeto, this.levelId, excluir);
      this.faces = this.deps.facesDasParedes(this.projeto, this.levelId);
    }
    return { outros: this.outros, faces: this.faces };
  }
}
