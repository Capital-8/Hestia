import { componentIssue, componentesDaFamilia, familyIssue } from './componentes.ts';
import type { Familia } from './familia/tipos.ts';
import type { Component, Id, Project } from './types.ts';

/*
 * Comandos de componentes e de famílias do projeto (ADR 0049). Todo comando valida ANTES de alterar (lança `Error` em português e o
 * projeto fica como estava, porque o histórico trabalha sobre rascunho) e entra no desfazer/refazer como qualquer outro.
 */

export type ComponentCommand =
  | { type: 'addComponent'; component: Omit<Component, 'order'> }
  | { type: 'updateComponent'; id: Id; patch: Partial<Omit<Component, 'id' | 'kind' | 'order'>> }
  /** Grava (ou troca) a família no projeto; as instâncias existentes passam a usar a versão nova. */
  | { type: 'upsertFamily'; family: Familia }
  /** Remove a família; recusa se alguma instância ainda a usa. */
  | { type: 'deleteFamily'; id: Id };

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
  }
}

export function componentCommandLabel(c: ComponentCommand): string {
  switch (c.type) {
    case 'addComponent': return 'Inserir componente';
    case 'updateComponent': return 'Alterar componente';
    case 'upsertFamily': return 'Carregar família';
    case 'deleteFamily': return 'Excluir família';
  }
}
