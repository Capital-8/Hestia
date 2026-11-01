import { newId, stairTypeUsage, type Id, type Project, type ProjectStore, type StairType } from '@hestia/model';
import { validateStairType, type StairValidationInput, type StairTypeIssue } from '../ui/dialogs/stairTypeForm.ts';
import type { DeleteResult } from './typeActions.ts';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Motivo pelo qual o tipo de escada não pode ser excluído (em uso ou único); null quando pode. */
export function stairTypeDeleteBlock(p: Project, typeId: Id): string | null {
  if (Object.keys(p.stairTypes).length <= 1) return 'É o único tipo de escada do projeto.';
  const uso = stairTypeUsage(p, typeId);
  if (uso > 0) return `Em uso por ${plural(uso, 'escada', 'escadas')}.`;
  return null;
}

/** Exclui o tipo de escada (o comando recusa se estiver em uso), devolvendo o erro em vez de lançá-lo. */
export function tryDeleteStairType(store: ProjectStore, typeId: Id): DeleteResult {
  try {
    store.exec({ type: 'deleteStairType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha desconhecida.' };
  }
}

/** Grava o tipo de escada (o modelo confere as regras ao salvar), devolvendo o erro em vez de lançá-lo. */
export function saveStairType(store: ProjectStore, stairType: StairType, label = 'Editar tipo de escada'): DeleteResult {
  try {
    store.exec({ type: 'upsertStairType', stairType }, label);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha desconhecida.' };
  }
}

/** Cópia do tipo de escada com id novo e nome "(cópia)". Devolve o id criado, ou null se o tipo não existe. */
export function duplicateStairType(store: ProjectStore, typeId: Id): Id | null {
  const src = store.project.stairTypes[typeId];
  if (!src) return null;
  const copy: StairType = { ...structuredClone(src), id: newId('stt'), name: `${src.name} (cópia)` };
  store.exec({ type: 'upsertStairType', stairType: copy }, 'Duplicar tipo de escada');
  return copy.id;
}

/** Renomeia o tipo de escada; nome vazio não é aceito. */
export function renameStairType(store: ProjectStore, typeId: Id, name: string): DeleteResult {
  const clean = name.trim();
  const src = store.project.stairTypes[typeId];
  if (!src) return { ok: false, error: 'Tipo inexistente.' };
  if (!clean) return { ok: false, error: 'Dê um nome ao tipo.' };
  store.exec({ type: 'upsertStairType', stairType: { ...src, name: clean } }, 'Renomear tipo de escada');
  return { ok: true };
}

/** Texto antigo (pt-BR) de um problema estruturado, para manter `stairTypeError` compatível. */
function stairIssueMessage(i: StairTypeIssue): string {
  switch (i.code) {
    case 'stt-name-empty': return 'Dê um nome ao tipo.';
    case 'stt-riser': return 'O espelho máximo precisa ser maior que zero.';
    case 'stt-riser-min': return 'O espelho mínimo precisa ser maior que zero.';
    case 'stt-riser-min-range': return 'O espelho mínimo precisa ser menor que o espelho máximo.';
    case 'stt-tread': return 'O piso mínimo precisa ser maior que zero.';
    case 'stt-width': return 'A largura mínima do lance precisa ser maior que zero.';
    case 'stt-headroom': return 'A folga de cabeça precisa ser maior que zero.';
    case 'stt-landing': return 'A espessura do patamar precisa ser maior que zero.';
    case 'stt-nosing-negative': return 'O nariz não pode ser negativo.';
    case 'stt-nosing': return 'O nariz precisa ser menor que o piso mínimo.';
    case 'stt-cost': return 'O custo não pode ser negativo.';
    case 'stt-mono-depth': return 'Escada monolítica: a profundidade estrutural precisa ser maior que zero.';
    case 'stt-assembled': return 'Escada montada: a espessura do piso e do espelho precisa ser maior que zero.';
    case 'stt-post-tread': return 'Escada com poste central: a espessura do degrau precisa ser maior que zero.';
    case 'stt-tread-range': return 'O piso máximo precisa ser maior ou igual ao piso mínimo.';
    case 'stt-calc-range': return 'O alvo da regra de cálculo precisa ficar entre o mínimo e o máximo da faixa.';
    case 'stt-factor': return i.params.factor === 'a'
      ? 'O fator do espelho na regra de cálculo precisa ser maior que zero.'
      : 'O fator do piso na regra de cálculo precisa ser maior que zero.';
    case 'stt-overlap': return 'A sobreposição dos degraus precisa ser menor que a espessura do degrau.';
    case 'stt-overlap-negative': return 'A sobreposição dos degraus não pode ser negativa.';
    case 'stt-material': return 'Escolha um material existente para o tipo.';
    default: return 'Tipo de escada inválido.';
  }
}

/**
 * Validação do tipo antes de salvar: usa a validação estruturada (`validateStairType`) e devolve a 1ª mensagem de erro em
 * pt-BR, ou null. Mantida como wrapper para os chamadores antigos.
 */
export function stairTypeError(t: StairValidationInput): string | null {
  const first = validateStairType(t).find((i) => i.severity === 'error');
  return first ? stairIssueMessage(first) : null;
}

/**
 * Cria a cópia do tipo e aplica a cópia às escadas dadas, em UM passo de desfazer (como o painel de paredes).
 * Devolve o id da cópia, ou null se o tipo não existe.
 */
export function duplicateStairTypeFor(store: ProjectStore, ids: Id[], typeId: Id): Id | null {
  const src = store.project.stairTypes[typeId];
  if (!src) return null;
  const copy: StairType = { ...structuredClone(src), id: newId('stt'), name: `${src.name} (cópia)` };
  store.transaction('Duplicar tipo de escada', () => {
    store.exec({ type: 'upsertStairType', stairType: copy });
    if (ids.length) store.exec({ type: 'updateElements', ids, patch: { typeId: copy.id } });
  });
  return copy.id;
}
