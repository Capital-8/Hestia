import * as THREE from 'three';
import { componentesDoGrupo, isComponent, levelElevation, type Id, type Project } from '@hestia/model';
import { Arrasto3D, type ResultadoMover3D } from '../../editor/arrasto3d.ts';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { pontoNoPlanoHorizontal } from './planoHorizontal.ts';

/** Arrasto de componente armado no `down` da vista 3D. */
export interface ArrastoComponente3D {
  ids: Id[];
  lider: Id;
  /** Altura (m, no mundo) do plano em que o ponteiro anda. */
  planoZ: number;
  /** Chave da sessão: todas as transações do gesto viram um só passo de desfazer. */
  sessao: object;
  arrasto: Arrasto3D;
  /** Já houve ao menos uma transação com alteração (necessário para o Esc desfazer). */
  aplicou: boolean;
}

export interface ArmarArrasto3DArgs {
  projeto: Project;
  id: Id;
  camera: THREE.Camera;
  ndc: { x: number; y: number };
  selecao: readonly Id[];
}

/** Converte o ponto local do canvas (px) no NDC da câmera. */
export function ndcDoPonto(ponto: { x: number; y: number }, tamanho: { width: number; height: number }): { x: number; y: number } {
  return { x: (ponto.x / tamanho.width) * 2 - 1, y: 1 - (ponto.y / tamanho.height) * 2 };
}

/** Ids que o arrasto move: o componente clicado ou todos os membros do conjunto dele, com o clicado primeiro. */
export function idsDoArrasto(projeto: Project, id: Id): Id[] {
  const e = projeto.elements[id];
  if (!isComponent(e) || e.groupId === undefined) return [id];
  const membros = componentesDoGrupo(projeto, e.groupId)
    .map((c) => c.id)
    .filter((membro) => membro !== id);
  return [id, ...membros];
}

/** Seleção ao armar: se o componente já está selecionado, mantém; senão seleciona o grupo inteiro. */
export function selecaoAoArmar(atual: readonly Id[], id: Id, ids: readonly Id[]): Id[] {
  return atual.includes(id) ? [...atual] : [...ids];
}

/** Texto da barra de status para o resultado do passo. */
export function textoStatusArrasto(
  projeto: Project,
  resultado: Pick<ResultadoMover3D, 'parede' | 'vizinho' | 'colisoes'>,
): string {
  if (resultado.parede !== undefined) return 'Encaixado na parede';
  if (resultado.vizinho !== undefined) return `Colado em ${marcaOuId(projeto, resultado.vizinho)}`;
  const primeiro = resultado.colisoes[0];
  return primeiro !== undefined ? `Colide com ${marcaOuId(projeto, primeiro)}` : '';
}

function marcaOuId(projeto: Project, id: Id): string {
  const e = projeto.elements[id];
  return isComponent(e) && e.mark.trim() ? e.mark : id;
}

/**
 * Arma o arrasto quando o `down` caiu sobre um componente. Devolve `null` para qualquer outro elemento ou quando o
 * raio não cruza o plano do piso do líder (aí o gesto segue como órbita, como antes).
 */
export function armarArrasto3d(args: ArmarArrasto3DArgs): ArrastoComponente3D | null {
  const c = args.projeto.elements[args.id];
  if (!isComponent(c)) return null;
  const planoZ = levelElevation(args.projeto, c.levelId) + c.z;
  const ponteiro = pontoNoPlanoHorizontal(args.camera, args.ndc, planoZ);
  if (!ponteiro) return null;
  const ids = idsDoArrasto(args.projeto, args.id);
  if (!args.selecao.includes(args.id)) {
    useUi.setState({ selection: selecaoAoArmar(args.selecao, args.id, ids), selectedLevel: null });
  }
  return {
    ids,
    lider: args.id,
    planoZ,
    sessao: {},
    arrasto: new Arrasto3D({ projeto: args.projeto, ids, levelId: c.levelId, ponteiro }),
    aplicou: false,
  };
}

/** Um passo do arrasto: move no plano e aplica as poses na sessão única de desfazer. */
export function moverArrasto3d(
  estado: ArrastoComponente3D | null,
  camera: THREE.Camera,
  ndc: { x: number; y: number },
  semEncaixe: boolean,
): void {
  if (!estado) return;
  const ponto = pontoNoPlanoHorizontal(camera, ndc, estado.planoZ);
  if (!ponto) return;
  const resultado = estado.arrasto.mover(ponto, { semEncaixe });
  const versao = editor.store.version;
  editor.store.transaction(
    'Mover componente',
    () => {
      for (const [id, pose] of resultado.poses) {
        editor.store.exec({ type: 'updateComponent', id, patch: { x: pose.x, y: pose.y, rotation: pose.rotation } });
      }
    },
    estado.sessao,
  );
  if (editor.store.version !== versao) estado.aplicou = true;
  useUi.setState({ status: textoStatusArrasto(editor.project, resultado) });
}

/** Arma o arrasto a partir do ponto local do canvas (px), sem o chamador montar o NDC. */
export function armarArrastoNoPonto(
  projeto: Project,
  id: Id,
  camera: THREE.Camera,
  ponto: { x: number; y: number },
  tamanho: { width: number; height: number },
  selecao: readonly Id[],
): ArrastoComponente3D | null {
  return armarArrasto3d({ projeto, id, camera, ndc: ndcDoPonto(ponto, tamanho), selecao });
}

/** Um passo do arrasto a partir do ponto local do canvas (px). */
export function moverArrastoNoPonto(
  estado: ArrastoComponente3D | null,
  camera: THREE.Camera,
  ponto: { x: number; y: number },
  tamanho: { width: number; height: number },
  semEncaixe: boolean,
): void {
  moverArrasto3d(estado, camera, ndcDoPonto(ponto, tamanho), semEncaixe);
}

/** Cancela o gesto: desfaz a sessão inteira, sem deixar passo novo no histórico. */
export function cancelarArrasto3d(estado: ArrastoComponente3D | null): void {
  if (!estado?.aplicou) return;
  editor.store.undo();
  estado.aplicou = false;
}

/**
 * Trata o Esc durante o arrasto: desfaz a sessão, chama `aoEncerrar` para zerar o gesto da vista e consome a tecla.
 * Devolve `false` quando não havia arrasto armado (o Esc segue o caminho de sempre).
 */
export function cancelarArrastoComEsc(
  e: KeyboardEvent,
  estado: ArrastoComponente3D | null,
  aoEncerrar: () => void,
): boolean {
  if (e.key !== 'Escape' || !estado) return false;
  cancelarArrasto3d(estado);
  aoEncerrar();
  e.preventDefault();
  e.stopImmediatePropagation();
  return true;
}
