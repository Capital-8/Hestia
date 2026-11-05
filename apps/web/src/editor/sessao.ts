import type { Id } from '@hestia/model';

/**
 * Sessão da aba: o que reabrir quando a página é recarregada (F5) e o que NÃO deve sobreviver ao fechamento.
 *
 * Fica em `sessionStorage`, que é o único armazenamento com o tempo de vida certo: sobrevive ao recarregar e morre
 * quando a aba (ou o app) fecha. Assim "recarreguei" volta no projeto aberto e "abri o programa de novo" cai na tela de
 * projetos — sem depender de truque com o tipo de navegação.
 *
 * O que guarda: o projeto (pasta da biblioteca ou `null` para o autosave) e a vista — planta/corte/3D, nível, abas
 * abertas — para o F5 devolver a tela exatamente como estava.
 */

const CHAVE = 'hestia.sessao';

export type VistaDaSessao = 'plan' | '3d' | 'section' | 'sheet';

/** Aba de vista aberta (mesmo formato de `OpenView`), guardada como JSON simples. */
export type AbaDaSessao =
  | { kind: 'plan'; levelId: Id; planKind?: string; areaPlanId?: Id }
  | { kind: '3d' }
  | { kind: 'section'; viewId: Id }
  | { kind: 'sheet'; sheetId: Id };

/** Tudo o que volta ao recarregar. */
export interface Sessao {
  /** Pasta do projeto na biblioteca; `null` quando o projeto é avulso/novo e vive no autosave. */
  pasta: string | null;
  view: VistaDaSessao;
  levelId: Id;
  planKind: string;
  areaPlanId: Id | null;
  sectionId: Id | null;
  /** Abas de vista abertas, na ordem. */
  openViews: AbaDaSessao[];
}

/** `sessionStorage` do ambiente, ou `null` (modo restrito, worker, ambiente sem DOM). */
function armazem(): Storage | null {
  try {
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Aba válida, ou `null` quando o formato não é de uma vista conhecida. */
function abaValida(valor: unknown): AbaDaSessao | null {
  if (!valor || typeof valor !== 'object') return null;
  const o = valor as Record<string, unknown>;
  switch (o.kind) {
    case '3d':
      return { kind: '3d' };
    case 'plan':
      return typeof o.levelId === 'string'
        ? { kind: 'plan', levelId: o.levelId, ...(typeof o.planKind === 'string' ? { planKind: o.planKind } : {}), ...(typeof o.areaPlanId === 'string' ? { areaPlanId: o.areaPlanId } : {}) }
        : null;
    case 'section':
      return typeof o.viewId === 'string' ? { kind: 'section', viewId: o.viewId } : null;
    case 'sheet':
      return typeof o.sheetId === 'string' ? { kind: 'sheet', sheetId: o.sheetId } : null;
    default:
      return null;
  }
}

/** Valida o que veio do armazenamento: sessão estragada não pode travar a abertura. */
export function sessaoValida(valor: unknown): Sessao | null {
  if (!valor || typeof valor !== 'object') return null;
  const o = valor as Record<string, unknown>;
  const view = o.view;
  const vistas: VistaDaSessao[] = ['plan', '3d', 'section', 'sheet'];
  if (typeof view !== 'string' || !vistas.includes(view as VistaDaSessao)) return null;
  if (typeof o.levelId !== 'string' || o.levelId === '') return null;
  if (typeof o.planKind !== 'string') return null;
  const pasta = typeof o.pasta === 'string' && o.pasta !== '' ? o.pasta : null;
  const abas = Array.isArray(o.openViews) ? o.openViews.map(abaValida).filter((a): a is AbaDaSessao => a !== null) : [];
  return {
    pasta,
    view: view as VistaDaSessao,
    levelId: o.levelId,
    planKind: o.planKind,
    areaPlanId: typeof o.areaPlanId === 'string' ? o.areaPlanId : null,
    sectionId: typeof o.sectionId === 'string' ? o.sectionId : null,
    openViews: abas,
  };
}

/** Grava a sessão (falha silenciosa: sem armazenamento, o F5 cai na tela de projetos). */
export function guardarSessao(sessao: Sessao): void {
  const s = armazem();
  if (!s) return;
  try {
    s.setItem(CHAVE, JSON.stringify(sessao));
  } catch {
    // Cota cheia ou armazenamento bloqueado: sem retomada, nada quebra.
  }
}

/** Sessão guardada, ou `null` quando esta é uma abertura nova (aba/app fechado). */
export function lerSessao(): Sessao | null {
  const s = armazem();
  if (!s) return null;
  try {
    const texto = s.getItem(CHAVE);
    return texto ? sessaoValida(JSON.parse(texto)) : null;
  } catch {
    return null;
  }
}

/** Esquece a sessão: usado ao voltar de propósito para a tela de projetos. */
export function limparSessao(): void {
  const s = armazem();
  if (!s) return;
  try {
    s.removeItem(CHAVE);
  } catch {
    // Sem armazenamento não há o que limpar.
  }
}
