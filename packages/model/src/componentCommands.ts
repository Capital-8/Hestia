import { applyTransform, type Transform, type Vec2 } from '@hestia/geom';
import { componentIssue, componentesDaFamilia, componentesDoGrupo, familyIssue, transformComponent } from './componentes.ts';
import type { Familia } from './familia/tipos.ts';
import type { Component, ComponentGroup, Id, Project } from './types.ts';

/*
 * Comandos de componentes, famílias e conjuntos do projeto (ADR 0049). Todo comando valida ANTES de alterar (lança `Error` em
 * português e o projeto fica como estava, porque o histórico trabalha sobre rascunho) e entra no desfazer/refazer como qualquer outro.
 */

export type ComponentCommand =
  | { type: 'addComponent'; component: Omit<Component, 'order'> }
  | { type: 'updateComponent'; id: Id; patch: Partial<Omit<Component, 'id' | 'kind' | 'order'>> }
  /** Grava (ou troca) a família no projeto; as instâncias existentes passam a usar a versão nova. */
  | { type: 'upsertFamily'; family: Familia }
  /** Remove a família; recusa se alguma instância ainda a usa. */
  | { type: 'deleteFamily'; id: Id }
  /** Grava (ou troca) o conjunto e acerta o `groupId` dos membros. */
  | { type: 'upsertComponentGroup'; group: ComponentGroup }
  /** Remove o conjunto e deixa os componentes soltos (eles continuam no projeto). */
  | { type: 'deleteComponentGroup'; id: Id }
  /** Move os membros e a linha do conjunto. */
  | { type: 'moveComponentGroup'; id: Id; dx: number; dy: number }
  /** Gira os membros em torno de `centro`, soma o ângulo à rotação e gira a linha junto. */
  | { type: 'rotateComponentGroup'; id: Id; centro: Vec2; angulo: number };

/** Motivo pelo qual o conjunto não pode entrar no projeto, ou `null`. */
function groupIssue(p: Project, g: ComponentGroup): string | null {
  if (!g.id.trim()) return 'O conjunto precisa de um id.';
  if (!g.nome.trim()) return 'O conjunto precisa de um nome.';
  if (!p.levels.some((l) => l.id === g.levelId)) return 'Nível do conjunto não existe.';
  if (g.membros.length === 0) return 'O conjunto precisa de ao menos um componente.';
  const vistos = new Set<Id>();
  for (const id of g.membros) {
    if (vistos.has(id)) return 'Componente repetido no conjunto: ' + id;
    vistos.add(id);
    const e = p.elements[id];
    if (e?.kind !== 'component') return 'Componente do conjunto não existe: ' + id;
    if (e.levelId !== g.levelId) return 'Componente do conjunto está em outro nível: ' + id;
    if (e.groupId !== undefined && e.groupId !== g.id) return 'Componente já pertence a outro conjunto: ' + id;
  }
  if (g.linha && g.linha.a.x === g.linha.b.x && g.linha.a.y === g.linha.b.y) {
    return 'A linha do conjunto precisa de dois pontos diferentes.';
  }
  return null;
}

/** Tira dos conjuntos os componentes que saíram do projeto e apaga o conjunto que ficou sem membros. */
export function removerMembrosExcluidos(p: Project, excluidos: ReadonlySet<Id>): void {
  const grupos = p.componentGroups;
  if (!grupos) return;
  for (const [id, grupo] of Object.entries(grupos)) {
    const membros = grupo.membros.filter((membro) => !excluidos.has(membro));
    if (membros.length === grupo.membros.length) continue;
    if (membros.length === 0) delete grupos[id];
    else grupos[id] = { ...grupo, membros };
  }
}

/**
 * Acompanha a linha dos conjuntos numa transformação padrão: com todos os membros transformados a linha vai junto; com só parte
 * deles o conjunto vira livre (perde a linha) e mantém os membros.
 */
export function ajustarLinhasDeGrupos(p: Project, ids: readonly Id[], t: Transform): void {
  const grupos = p.componentGroups;
  if (!grupos) return;
  const transformados = new Set(ids);
  for (const grupo of Object.values(grupos)) {
    const tocados = grupo.membros.filter((id) => transformados.has(id)).length;
    if (tocados === 0) continue;
    if (tocados === grupo.membros.length) {
      if (grupo.linha) {
        grupo.linha = { ...grupo.linha, a: applyTransform(t, grupo.linha.a), b: applyTransform(t, grupo.linha.b) };
      }
    } else {
      delete grupo.linha;
    }
  }
}

function moverGrupo(p: Project, id: Id, dx: number, dy: number): void {
  const grupo = p.componentGroups?.[id];
  if (!grupo) throw new Error('Conjunto inexistente: ' + id);
  const t: Transform = { kind: 'translate', d: { x: dx, y: dy } };
  for (const componente of componentesDoGrupo(p, id)) p.elements[componente.id] = transformComponent(componente, t);
  if (grupo.linha) {
    grupo.linha = { ...grupo.linha, a: applyTransform(t, grupo.linha.a), b: applyTransform(t, grupo.linha.b) };
  }
}

function girarGrupo(p: Project, id: Id, centro: Vec2, angulo: number): void {
  const grupo = p.componentGroups?.[id];
  if (!grupo) throw new Error('Conjunto inexistente: ' + id);
  const t: Transform = { kind: 'rotate', about: centro, angle: angulo };
  for (const componente of componentesDoGrupo(p, id)) p.elements[componente.id] = transformComponent(componente, t);
  if (grupo.linha) {
    grupo.linha = { ...grupo.linha, a: applyTransform(t, grupo.linha.a), b: applyTransform(t, grupo.linha.b) };
  }
}

export function applyComponentCommand(p: Project, c: ComponentCommand): void {
  switch (c.type) {
    case 'addComponent': {
      const issue = componentIssue(p, c.component);
      if (issue) throw new Error(issue);
      if (p.elements[c.component.id]) throw new Error('Já existe um elemento com este id.');
      p.elements[c.component.id] = { ...c.component, order: p.nextOrder++ };
      break;
    }
    case 'updateComponent': {
      const e = p.elements[c.id];
      if (e?.kind !== 'component') throw new Error('Componente inexistente: ' + c.id);
      const next: Component = { ...e, ...c.patch };
      const issue = componentIssue(p, next);
      if (issue) throw new Error(issue);
      p.elements[c.id] = next;
      break;
    }
    case 'upsertFamily': {
      const issue = familyIssue(c.family);
      if (issue) throw new Error(issue);
      p.componentFamilies = { ...(p.componentFamilies ?? {}), [c.family.id]: structuredClone(c.family) };
      break;
    }
    case 'deleteFamily': {
      if (!p.componentFamilies?.[c.id]) throw new Error('Família inexistente: ' + c.id);
      const usos = componentesDaFamilia(p, c.id).length;
      if (usos > 0) throw new Error(`Família em uso por ${usos} componente${usos > 1 ? 's' : ''}.`);
      const { [c.id]: _removida, ...resto } = p.componentFamilies;
      void _removida;
      p.componentFamilies = resto;
      break;
    }
    case 'upsertComponentGroup': {
      const issue = groupIssue(p, c.group);
      if (issue) throw new Error(issue);
      const anteriores = componentesDoGrupo(p, c.group.id);
      const membros = new Set(c.group.membros);
      // Membros que saíram da lista (numa troca) voltam a ser componentes soltos.
      for (const antigo of anteriores) {
        if (membros.has(antigo.id)) continue;
        const e = p.elements[antigo.id];
        if (e?.kind === 'component' && e.groupId === c.group.id) delete e.groupId;
      }
      p.componentGroups = { ...(p.componentGroups ?? {}), [c.group.id]: structuredClone(c.group) };
      for (const id of c.group.membros) {
        const e = p.elements[id];
        if (e?.kind === 'component') e.groupId = c.group.id;
      }
      break;
    }
    case 'deleteComponentGroup': {
      const grupo = p.componentGroups?.[c.id];
      if (!grupo) throw new Error('Conjunto inexistente: ' + c.id);
      for (const id of grupo.membros) {
        const e = p.elements[id];
        if (e?.kind === 'component' && e.groupId === c.id) delete e.groupId;
      }
      const { [c.id]: _removido, ...resto } = p.componentGroups ?? {};
      void _removido;
      p.componentGroups = resto;
      break;
    }
    case 'moveComponentGroup':
      moverGrupo(p, c.id, c.dx, c.dy);
      break;
    case 'rotateComponentGroup':
      girarGrupo(p, c.id, c.centro, c.angulo);
      break;
  }
}

export function componentCommandLabel(c: ComponentCommand): string {
  switch (c.type) {
    case 'addComponent': return 'Inserir componente';
    case 'updateComponent': return 'Alterar componente';
    case 'upsertFamily': return 'Carregar família';
    case 'deleteFamily': return 'Excluir família';
    case 'upsertComponentGroup': return 'Criar conjunto';
    case 'deleteComponentGroup': return 'Desfazer conjunto';
    case 'moveComponentGroup': return 'Mover conjunto';
    case 'rotateComponentGroup': return 'Girar conjunto';
  }
}
