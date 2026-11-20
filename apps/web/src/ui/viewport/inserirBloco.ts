import {
  caixaLocalDoComponente,
  corposDoNivel,
  facesDasParedes,
  posarArrastado,
  type CaixaLocal,
  type Corpo,
  type FaceDeParede,
} from '@hestia/engine';
import {
  familiaDaBiblioteca,
  levelElevation,
  newId,
  normalizarAngulo,
  type Component,
  type Familia,
  type Id,
  type Project,
  type ProjectStore,
} from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { create } from 'zustand';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { opcoesDeEncaixeAtuais } from '../../editor/encaixeComponente.ts';
import { faltantes } from '../familia/carregarNoProjeto.ts';

const CAIXA_VAZIA: CaixaLocal = { min: [0, 0, 0], max: [0, 0, 0] };

export type OrigemInsercaoBloco = 'arrasto' | 'clique';

export interface InsercaoBlocoAtiva {
  familiaId: Id;
  familia: Familia;
  dependencias: Familia[];
  jaNoProjeto: boolean;
  origem: OrigemInsercaoBloco;
  rotacaoBase: number;
  mirrored: boolean;
  levelId: Id;
  projetoPrevia: Project;
  rascunho: Component;
  caixa: CaixaLocal;
  outros: Corpo[];
  faces: FaceDeParede[];
  ultimoPonto: Vec2 | null;
  ultimoSemEncaixe: boolean;
  ultimoPontoParede?: Vec2;
  ultimoCamPos?: Vec2;
  paredeSnap?: number;
  vizinhoSnap?: Id;
}

export interface OpcoesMoverInsercao {
  semEncaixe: boolean;
  pontoNaParede?: Vec2;
  cameraPos?: Vec2;
}

interface InsercaoBlocoStore {
  ativo: InsercaoBlocoAtiva | null;
}

export const useInsercaoBloco = create<InsercaoBlocoStore>(() => ({
  ativo: null,
}));

function comFamiliasNoProjeto(p: Project, familias: readonly Familia[]): Project {
  const componentFamilies = { ...(p.componentFamilies ?? {}) };
  for (const f of familias) componentFamilies[f.id] = f;
  return { ...p, componentFamilies };
}

function criarRascunho(id: Id, familyId: Id, levelId: Id): Component {
  return {
    id,
    kind: 'component',
    familyId,
    typeId: null,
    levelId,
    order: 0,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: '',
  };
}

function textoStatusInsercao(familia: Familia, parede?: number, vizinho?: Id, semEncaixe?: boolean): string {
  const estado = semEncaixe
    ? 'livre (Alt)'
    : parede !== undefined
      ? 'encaixado na parede'
      : vizinho !== undefined
        ? 'colado no móvel'
        : 'mova até parede ou móvel';
  return `${familia.nome}: ${estado} · R gira 90° · Alt livre · Esc cancela`;
}

/** Inicia a inserção ao vivo de uma família da biblioteca (por arrasto do cartão ou por clique). */
export function iniciarInsercaoBloco(
  familiaId: Id,
  origem: OrigemInsercaoBloco,
  store: ProjectStore = editor.store,
): boolean {
  const projeto = store.project;
  const levelId = useUi.getState().levelId;
  if (!projeto.levels.some((l) => l.id === levelId)) {
    useUi.setState({ status: 'Nível ativo não encontrado para inserir o módulo.' });
    return false;
  }

  const existente = projeto.componentFamilies?.[familiaId];
  const familia = existente ?? familiaDaBiblioteca(familiaId);
  if (!familia) {
    useUi.setState({ status: `Família não encontrada: ${familiaId}.` });
    return false;
  }

  const dependencias = existente ? [] : faltantes(store, familia);
  const projetoPrevia = comFamiliasNoProjeto(projeto, [...dependencias, ...(existente ? [] : [familia])]);
  const id = newId('cm');
  const rascunho = criarRascunho(id, familia.id, levelId);
  const caixa = caixaLocalDoComponente(projetoPrevia, rascunho) ?? CAIXA_VAZIA;
  const outros = corposDoNivel(projetoPrevia, levelId, new Set([id]));
  const faces = facesDasParedes(projetoPrevia, levelId);

  if (store === editor.store && editor.activeTool.id !== 'select') {
    editor.setTool('select');
  }

  useInsercaoBloco.setState({
    ativo: {
      familiaId: familia.id,
      familia,
      dependencias,
      jaNoProjeto: Boolean(existente),
      origem,
      rotacaoBase: 0,
      mirrored: false,
      levelId,
      projetoPrevia,
      rascunho,
      caixa,
      outros,
      faces,
      ultimoPonto: null,
      ultimoSemEncaixe: false,
    },
  });
  useUi.setState((s) => ({
    status: `${familia.nome}: mova sobre a planta ou 3D para posicionar · R gira 90° · Esc cancela`,
    previewTick: s.previewTick + 1,
  }));
  return true;
}

/** Atualiza a prévia ao vivo da inserção aplicando encaixe em parede e móveis vizinhos. */
export function moverInsercaoBloco(ponto: Vec2, opcoes: OpcoesMoverInsercao): InsercaoBlocoAtiva | null {
  const cur = useInsercaoBloco.getState().ativo;
  if (!cur) return null;

  const elevacao = levelElevation(cur.projetoPrevia, cur.levelId);
  // Seletor de encaixe da interface: `opcoes.semEncaixe` é só o Alt; o modo Livre e o vizinho vêm do seletor.
  const enc = opcoesDeEncaixeAtuais(opcoes.semEncaixe);
  const resultado = posarArrastado(
    {
      alvo: {
        id: cur.rascunho.id,
        pose: { x: ponto.x, y: ponto.y, rotation: cur.rotacaoBase, mirrored: cur.mirrored, z: elevacao },
        caixa: cur.caixa,
      },
      outros: cur.outros,
      faces: cur.faces,
    },
    {
      semEncaixe: enc.semEncaixe,
      encaixeVizinho: enc.encaixeVizinho,
      distanciaParede: 0.75,
      ...(opcoes.pontoNaParede ? { pontoNaParede: opcoes.pontoNaParede } : {}),
      ...(opcoes.cameraPos ? { cameraPos: opcoes.cameraPos } : {}),
    },
  );

  const proximo: InsercaoBlocoAtiva = {
    ...cur,
    ultimoPonto: { ...ponto },
    ultimoSemEncaixe: opcoes.semEncaixe,
    ...(opcoes.pontoNaParede ? { ultimoPontoParede: { ...opcoes.pontoNaParede } } : { ultimoPontoParede: undefined }),
    ...(opcoes.cameraPos ? { ultimoCamPos: { ...opcoes.cameraPos } } : { ultimoCamPos: undefined }),
    paredeSnap: resultado.parede,
    vizinhoSnap: resultado.vizinho,
    rascunho: {
      ...cur.rascunho,
      x: resultado.pose.x,
      y: resultado.pose.y,
      rotation: resultado.pose.rotation,
      mirrored: resultado.pose.mirrored,
    },
  };
  useInsercaoBloco.setState({ ativo: proximo });
  useUi.setState((s) => ({
    status: textoStatusInsercao(cur.familia, resultado.parede, resultado.vizinho, enc.semEncaixe),
    previewTick: s.previewTick + 1,
  }));
  return proximo;
}

/** Gira o bloco em inserção (em radianos) e recalcula a prévia no último ponto. */
export function girarInsercaoBloco(delta: number): void {
  const cur = useInsercaoBloco.getState().ativo;
  if (!cur) return;
  const rotacaoBase = normalizarAngulo(cur.rotacaoBase + delta);
  const atualizado: InsercaoBlocoAtiva = {
    ...cur,
    rotacaoBase,
    rascunho: { ...cur.rascunho, rotation: rotacaoBase },
  };
  useInsercaoBloco.setState({ ativo: atualizado });
  if (atualizado.ultimoPonto) {
    moverInsercaoBloco(atualizado.ultimoPonto, {
      semEncaixe: atualizado.ultimoSemEncaixe,
      ...(atualizado.ultimoPontoParede ? { pontoNaParede: atualizado.ultimoPontoParede } : {}),
      ...(atualizado.ultimoCamPos ? { cameraPos: atualizado.ultimoCamPos } : {}),
    });
  } else {
    useUi.setState((s) => ({ previewTick: s.previewTick + 1 }));
  }
}

/** Confirma a inserção do bloco na pose atual da prévia; com `manterAtivo`, prepara a próxima cópia. */
export function confirmarInsercaoBloco(manterAtivo = false, store: ProjectStore = editor.store): Id | null {
  const cur = useInsercaoBloco.getState().ativo;
  if (!cur || !cur.ultimoPonto) {
    cancelarInsercaoBloco();
    return null;
  }

  const componente = structuredClone(cur.rascunho);
  try {
    store.transaction('Inserir bloco da biblioteca', () => {
      if (!cur.jaNoProjeto) {
        for (const dep of cur.dependencias) store.exec({ type: 'upsertFamily', family: structuredClone(dep) });
        store.exec({ type: 'upsertFamily', family: structuredClone(cur.familia) });
      }
      store.exec({ type: 'addComponent', component: componente });
    });
  } catch (e) {
    useUi.setState({ status: e instanceof Error ? e.message : 'Não foi possível inserir o módulo.' });
    useInsercaoBloco.setState({ ativo: null });
    return null;
  }

  useUi.setState((s) => ({
    selection: [componente.id],
    selectedLevel: null,
    status: manterAtivo
      ? `${cur.familia.nome} inserido · clique para colocar outro ou Esc para concluir`
      : `${cur.familia.nome} inserido.`,
    previewTick: s.previewTick + 1,
  }));

  if (!manterAtivo) {
    useInsercaoBloco.setState({ ativo: null });
    return componente.id;
  }

  const novoId = newId('cm');
  const novoProjeto = store.project;
  const novoRascunho = { ...criarRascunho(novoId, cur.familia.id, cur.levelId), rotation: cur.rotacaoBase, mirrored: cur.mirrored };
  const outros = corposDoNivel(novoProjeto, cur.levelId, new Set([novoId]));
  useInsercaoBloco.setState({
    ativo: {
      ...cur,
      jaNoProjeto: true,
      dependencias: [],
      origem: 'clique',
      projetoPrevia: novoProjeto,
      rascunho: novoRascunho,
      outros,
      ultimoPonto: cur.ultimoPonto,
    },
  });
  return componente.id;
}

/** Cancela a inserção em andamento e limpa a prévia da cena. */
export function cancelarInsercaoBloco(): void {
  if (!useInsercaoBloco.getState().ativo) return;
  useInsercaoBloco.setState({ ativo: null });
  useUi.setState((s) => ({ status: '', previewTick: s.previewTick + 1 }));
}
