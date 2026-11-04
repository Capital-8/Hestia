import {
  caixaLocalDoComponente,
  corposDoNivel,
  facesDasParedes,
  posarArrastado,
  type CaixaLocal,
  type Corpo,
  type EntradaArrasto,
  type FaceDeParede,
  type OpcoesArrasto,
  type ResultadoArrasto,
} from '@hestia/engine';
import { familiaDaBiblioteca, levelElevation, newId, type Component, type Familia, type Id, type Project, type ProjectStore } from '@hestia/model';
import { screenToWorld, type Viewport } from '@hestia/render';
import type { Camera } from 'three';
import type { Vec2 } from '@hestia/geom';
import { useUi } from './state.ts';
import { faltantes } from '../ui/familia/carregarNoProjeto.ts';
import { pontoNoPlanoHorizontal } from '../ui/viewport/planoHorizontal.ts';

/*
 * Soltar uma família da paleta no canvas (F3-biblioteca): converte o ponto da vista em ponto do mundo, carrega a família
 * (com as dependências) quando ela ainda não está no projeto e insere a instância já encaixada em parede/vizinho, num só
 * passo de desfazer. A lógica é pura: o DOM e o three.js entram só pela conversão do ponto e pelas dependências injetáveis.
 */

/** Tipo do `dataTransfer` usado pela paleta; o canvas só aceita solturas com este tipo. */
export const TIPO_DRAG_FAMILIA = 'application/x-hestia-familia';

/** Cópia de emergência para componente sem peças: mantém a inserção utilizável sem encaixe geométrico. */
const CAIXA_VAZIA: CaixaLocal = { min: [0, 0, 0], max: [0, 0, 0] };

/** Dependências do soltar; nos testes podem ser trocadas por versões simuladas (como em `arrasto3d.ts`). */
export interface DepsSoltarFamilia {
  caixaLocalDoComponente: (p: Project, c: Component) => CaixaLocal | null;
  corposDoNivel: (p: Project, levelId: Id, excluir: ReadonlySet<Id>) => Corpo[];
  facesDasParedes: (p: Project, levelId: Id) => FaceDeParede[];
  posarArrastado: (entrada: EntradaArrasto, opcoes?: OpcoesArrasto) => ResultadoArrasto;
  familiaDaBiblioteca: (id: Id) => Familia | undefined;
  newId: (prefix: string) => Id;
  /** Seleciona o componente recém-criado. */
  selecionar: (ids: Id[]) => void;
  /** Mensagem para a barra de status. */
  avisar: (mensagem: string) => void;
}

const DEPS_REAIS: DepsSoltarFamilia = {
  caixaLocalDoComponente,
  corposDoNivel,
  facesDasParedes,
  posarArrastado,
  familiaDaBiblioteca,
  newId,
  selecionar: (ids) => useUi.setState({ selection: ids, selectedLevel: null }),
  avisar: (mensagem) => useUi.setState({ status: mensagem }),
};

export interface SoltarFamiliaArgs {
  store: ProjectStore;
  familiaId: Id;
  levelId: Id;
  /** Ponto do mundo (m) onde o móvel cai; a vista já converteu o ponteiro. */
  ponto: Vec2;
  deps?: Partial<DepsSoltarFamilia>;
}

export type ResultadoSoltura =
  | { ok: true; id: Id; parede?: number; vizinho?: Id }
  | { ok: false; erro: string };

/** Id da família carregado pelo `dataTransfer`, ou null quando o arrasto não é da paleta. */
export function idDaFamiliaArrastada(dt: DataTransfer | null): Id | null {
  const id = dt?.getData(TIPO_DRAG_FAMILIA).trim();
  return id ? id : null;
}

/** Aceita (e marca como cópia) só o arrasto de família da paleta. */
export function prepararArrastoDeFamilia(e: { dataTransfer: DataTransfer; preventDefault: () => void }): void {
  if (!e.dataTransfer.types.includes(TIPO_DRAG_FAMILIA)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

/**
 * Ponto do mundo sob o ponteiro para a vista ativa: planta pelo `screenToWorld`; 3D pelo plano horizontal na elevação do
 * nível. Corte/prancha e 3D sem câmera devolvem null (soltar ali não faz nada).
 */
export function pontoDeSolturaDaVista(
  view: string,
  pontoLocal: Vec2,
  tamanho: { width: number; height: number },
  camera: Camera,
  viewport: Viewport | null,
  projeto: Project,
  levelId: Id,
): Vec2 | null {
  if (view === '3d') {
    const ndc = { x: (pontoLocal.x / tamanho.width) * 2 - 1, y: 1 - (pontoLocal.y / tamanho.height) * 2 };
    return pontoNoPlanoHorizontal(camera, ndc, levelElevation(projeto, levelId));
  }
  if (view !== 'plan' || !viewport) return null;
  return screenToWorld(viewport, pontoLocal);
}

export interface SoltarDaPaletaArgs {
  familiaId: Id;
  view: string;
  pontoLocal: Vec2;
  tamanho: { width: number; height: number };
  camera: Camera;
  viewport: Viewport | null;
  projeto: Project;
  store: ProjectStore;
  levelId: Id;
}

/** Ponte do canvas: converte o ponto local da vista e entrega a soltura; fora da planta/3D não faz nada. */
export function soltarDaPaleta({ familiaId, view, pontoLocal, tamanho, camera, viewport, projeto, store, levelId }: SoltarDaPaletaArgs): ResultadoSoltura | null {
  const ponto = pontoDeSolturaDaVista(view, pontoLocal, tamanho, camera, viewport, projeto, levelId);
  return ponto ? soltarFamilia({ store, familiaId, levelId, ponto }) : null;
}

function projetoComFamilias(p: Project, familias: readonly Familia[]): Project {
  const componentFamilies = { ...(p.componentFamilies ?? {}) };
  for (const familia of familias) componentFamilies[familia.id] = familia;
  return { ...p, componentFamilies };
}

function mensagemDeInsercao(familia: Familia, resultado: ResultadoArrasto): string {
  if (resultado.parede !== undefined) return `${familia.nome} encaixado na parede.`;
  if (resultado.vizinho !== undefined) return `${familia.nome} colado no móvel vizinho.`;
  return `${familia.nome} inserido.`;
}

/**
 * Solta a família no ponto: valida nível e família, resolve a caixa com a família já disponível (para o encaixe), posa pelo
 * `posarArrastado` e grava a carga da família + a instância numa única transação. Devolve o id criado ou o motivo do erro.
 */
export function soltarFamilia({ store, familiaId, levelId, ponto, deps }: SoltarFamiliaArgs): ResultadoSoltura {
  const d: DepsSoltarFamilia = { ...DEPS_REAIS, ...deps };
  const projeto = store.project;

  if (!projeto.levels.some((nivel) => nivel.id === levelId)) {
    const erro = 'Nível ativo não encontrado: não foi possível soltar a família.';
    d.avisar(erro);
    return { ok: false, erro };
  }

  const existente = projeto.componentFamilies?.[familiaId];
  const daBiblioteca = existente ? null : d.familiaDaBiblioteca(familiaId);
  const familia = existente ?? daBiblioteca;
  if (!familia) {
    const erro = `Família de componente não encontrada: ${familiaId}.`;
    d.avisar(erro);
    return { ok: false, erro };
  }

  const dependencias = existente ? [] : faltantes(store, familia);
  // A caixa e o entorno precisam enxergar a família antes de ela entrar no projeto: resolve num rascunho só de leitura.
  const projetoDaPose = projetoComFamilias(projeto, [...dependencias, ...(existente ? [] : [familia])]);

  const id = d.newId('cm');
  const rascunho: Component = {
    id,
    kind: 'component',
    familyId: familia.id,
    typeId: null,
    levelId,
    order: 0,
    x: ponto.x,
    y: ponto.y,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: '',
  };
  const caixa = d.caixaLocalDoComponente(projetoDaPose, rascunho) ?? CAIXA_VAZIA;
  const outros = d.corposDoNivel(projetoDaPose, levelId, new Set<Id>([id]));
  const faces = d.facesDasParedes(projetoDaPose, levelId);
  const resultado = d.posarArrastado({
    alvo: {
      id,
      pose: { x: ponto.x, y: ponto.y, rotation: 0, mirrored: false, z: levelElevation(projeto, levelId) },
      caixa,
    },
    outros,
    faces,
  });

  const componente: Component = {
    ...rascunho,
    x: resultado.pose.x,
    y: resultado.pose.y,
    rotation: resultado.pose.rotation,
    mirrored: resultado.pose.mirrored,
  };

  try {
    store.transaction('Soltar família', () => {
      for (const dependencia of dependencias) store.exec({ type: 'upsertFamily', family: structuredClone(dependencia) });
      if (!existente) store.exec({ type: 'upsertFamily', family: structuredClone(familia) });
      store.exec({ type: 'addComponent', component: componente });
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Não foi possível soltar a família.';
    d.avisar(erro);
    return { ok: false, erro };
  }

  d.selecionar([id]);
  d.avisar(mensagemDeInsercao(familia, resultado));
  return {
    ok: true,
    id,
    ...(resultado.parede !== undefined ? { parede: resultado.parede } : {}),
    ...(resultado.vizinho !== undefined ? { vizinho: resultado.vizinho } : {}),
  };
}
