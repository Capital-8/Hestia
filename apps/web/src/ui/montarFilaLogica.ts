import { dependenciasDaFamilia, familiaDaBiblioteca, newId, wallsOnLevel, type Familia, type Id, type Project, type ProjectStore } from '@hestia/model';
import { facesDasParedes, montarFila, type FaceDeParede, type ModuloDeFila, type PedidoDeFila, type ResultadoDeFila } from '@hestia/engine';
import { useUi } from '../editor/state.ts';
import { faltantes } from './familia/carregarNoProjeto.ts';

/*
 * Ponte entre o diálogo "Montar fila" e o motor (`montarFila`): resolve a face da parede selecionada, monta o pedido,
 * calcula a prévia e grava a fila no projeto num único passo de desfazer. Tudo em metros.
 */

export type LadoDaParede = 'esquerdo' | 'direito';

/** Face da parede com o lado a que ela pertence (esquerdo/direito do eixo a→b). */
export interface FaceDaParedeComLado {
  lado: LadoDaParede;
  face: FaceDeParede;
}

/** Um módulo escolhido no diálogo; `largura` ausente = largura do tipo. */
export interface LinhaDaFilaNaTela {
  familyId: Id;
  typeId: Id | null;
  largura?: number;
}

/** O que o diálogo preenche e a lógica converte em `PedidoDeFila`. */
export interface EntradaDaFila {
  levelId: Id;
  wallId: Id;
  lado: LadoDaParede;
  inicio: number;
  comprimento: number;
  linhas: LinhaDaFilaNaTela[];
  preencher: boolean;
}

export type ResultadoCriarFila = { ok: true; ids: Id[] } | { ok: false; erro: string };

/** Comprimento (m) da face; 0 quando a face não existe. */
export function comprimentoDaFace(p: Project, levelId: Id, wallId: Id, lado: LadoDaParede): number {
  const face = facesDaParede(p, levelId, wallId)?.find((f) => f.lado === lado)?.face;
  return face ? Math.hypot(face.b.x - face.a.x, face.b.y - face.a.y) : 0;
}

/**
 * As duas faces da parede reta `wallId` no nível: a esquerda (índice par) e a direita (índice ímpar) do eixo a→b,
 * cada uma com o lado livre à esquerda. `null` se a parede não existe, é curva ou é de outro nível.
 */
export function facesDaParede(p: Project, levelId: Id, wallId: Id): FaceDaParedeComLado[] | null {
  const paredes = wallsOnLevel(p, levelId);
  const parede = paredes.find((w) => w.id === wallId);
  if (!parede || parede.sag !== 0) return null;
  // `facesDasParedes` só inclui paredes retas; o índice da parede entre as retas é o par de faces dela.
  const indice = paredes.filter((w) => w.sag === 0).findIndex((w) => w.id === wallId);
  if (indice < 0) return null;
  const faces = facesDasParedes(p, levelId);
  const esquerda = faces[indice * 2];
  const direita = faces[indice * 2 + 1];
  if (!esquerda || !direita) return null;
  return [
    { lado: 'esquerdo', face: esquerda },
    { lado: 'direito', face: direita },
  ];
}

/** Converte a entrada do diálogo no pedido do motor; `null` se faltar a face, o comprimento ou os módulos. */
export function pedidoDaTela(p: Project, entrada: EntradaDaFila): PedidoDeFila | null {
  const face = facesDaParede(p, entrada.levelId, entrada.wallId)?.find((f) => f.lado === entrada.lado)?.face;
  if (!face) return null;
  if (!Number.isFinite(entrada.inicio) || !Number.isFinite(entrada.comprimento) || entrada.comprimento <= 0) return null;
  if (entrada.linhas.length === 0) return null;
  const modulos: ModuloDeFila[] = entrada.linhas.map((linha) => ({
    familyId: linha.familyId,
    typeId: linha.typeId,
    ...(linha.largura !== undefined ? { largura: linha.largura } : {}),
  }));
  return {
    levelId: entrada.levelId,
    face,
    inicio: entrada.inicio,
    comprimento: entrada.comprimento,
    modulos,
    preencher: entrada.preencher,
    idBase: `fila_${newId()}`,
  };
}

/** Famílias da biblioteca (com dependências) que a prévia precisa para resolver os módulos pedidos. */
function familiasParaPrevia(p: Project, linhas: readonly LinhaDaFilaNaTela[]): Familia[] {
  const faltando = new Map<Id, Familia>();
  const vistas = new Set<Id>();
  for (const linha of linhas) {
    if (vistas.has(linha.familyId)) continue;
    vistas.add(linha.familyId);
    const doProjeto = p.componentFamilies?.[linha.familyId];
    const familia = doProjeto ?? familiaDaBiblioteca(linha.familyId);
    if (!familia) continue;
    for (const dependencia of dependenciasDaFamilia(familia, (id) => p.componentFamilies?.[id] ?? familiaDaBiblioteca(id))) {
      if (!p.componentFamilies?.[dependencia.id]) faltando.set(dependencia.id, dependencia);
    }
    if (!doProjeto) faltando.set(familia.id, familia);
  }
  return [...faltando.values()];
}

/** Prévia da fila; famílias da biblioteca ainda não carregadas entram só nesta cópia do projeto. */
export function previaDaFila(p: Project, entrada: EntradaDaFila): ResultadoDeFila | null {
  const pedido = pedidoDaTela(p, entrada);
  return pedido ? montarFila(projetoComFamilias(p, familiasParaPrevia(p, entrada.linhas)), pedido) : null;
}

/** Famílias (com dependências) que faltam no projeto para os módulos pedidos, na ordem de entrada. */
function familiasParaCarregar(store: ProjectStore, linhas: readonly LinhaDaFilaNaTela[]): Familia[] {
  const faltando = new Map<Id, Familia>();
  const vistas = new Set<Id>();
  for (const linha of linhas) {
    if (vistas.has(linha.familyId)) continue;
    vistas.add(linha.familyId);
    const doProjeto = store.project.componentFamilies?.[linha.familyId];
    const familia = doProjeto ?? familiaDaBiblioteca(linha.familyId);
    if (!familia) continue;
    for (const dependencia of faltantes(store, familia)) faltando.set(dependencia.id, dependencia);
    if (!doProjeto) faltando.set(familia.id, familia);
  }
  return [...faltando.values()];
}

/** Projeto raso com as famílias que serão carregadas, para a prévia já resolver larguras da biblioteca. */
function projetoComFamilias(p: Project, familias: readonly Familia[]): Project {
  if (familias.length === 0) return p;
  const componentFamilies = { ...(p.componentFamilies ?? {}) };
  for (const familia of familias) componentFamilies[familia.id] = familia;
  return { ...p, componentFamilies };
}

/**
 * Grava a fila no projeto num único passo de desfazer: carrega as famílias que faltam (com dependências), insere os
 * componentes e o conjunto e seleciona os novos componentes. Devolve os ids criados ou o motivo da recusa.
 */
export function criarFila(store: ProjectStore, entrada: EntradaDaFila): ResultadoCriarFila {
  const pedido = pedidoDaTela(store.project, entrada);
  if (!pedido) return { ok: false, erro: 'Escolha uma parede reta e ao menos um módulo.' };
  const paraCarregar = familiasParaCarregar(store, entrada.linhas);
  const simulacao = montarFila(projetoComFamilias(store.project, paraCarregar), pedido);
  if (simulacao.componentes.length === 0) {
    return { ok: false, erro: simulacao.avisos[0] ?? 'Nenhum módulo válido para montar a fila.' };
  }
  try {
    let ids: Id[] = [];
    store.transaction('Montar fila', () => {
      for (const familia of paraCarregar) store.exec({ type: 'upsertFamily', family: structuredClone(familia) });
      const resultado = montarFila(store.project, pedido);
      for (const componente of resultado.componentes) store.exec({ type: 'addComponent', component: componente });
      store.exec({ type: 'upsertComponentGroup', group: resultado.grupo });
      ids = resultado.grupo.membros;
    });
    if (ids.length > 0) useUi.setState({ selection: ids, selectedLevel: null });
    return { ok: true, ids };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não foi possível montar a fila.' };
  }
}
