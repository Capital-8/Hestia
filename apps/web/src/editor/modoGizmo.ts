import { create } from 'zustand';
import type { ModoGizmoComponente } from '@hestia/render';
import type { Id } from '@hestia/model';
import { useUi } from './state.ts';

/*
 * Modo do gizmo 3D do componente selecionado: Mover (padrão) ou Redimensionar. Preferência de interface, só na memória:
 * volta a Mover sempre que a seleção passa a ser outro componente. Tab alterna na vista 3D (ver `tabTrocaModoGizmo`).
 */

interface EstadoModoGizmo {
  modo: ModoGizmoComponente;
  /** Componente a que o modo se refere; outro id (ou nenhum) reinicia o modo. */
  id: Id | null;
}

export const useModoGizmo = create<EstadoModoGizmo>(() => ({ modo: 'mover', id: null }));

export function outroModoGizmo(m: ModoGizmoComponente): ModoGizmoComponente {
  return m === 'mover' ? 'redimensionar' : 'mover';
}

/** Chave da dica da barra de status para o modo. */
export function chaveDicaGizmo(m: ModoGizmoComponente): 'ui_gz_dica_mover' | 'ui_gz_dica_redim' {
  return m === 'mover' ? 'ui_gz_dica_mover' : 'ui_gz_dica_redim';
}

/** Modo para a seleção atual: mantém o modo se for o mesmo componente; senão volta a Mover. */
export function modoParaSelecao(atual: EstadoModoGizmo, id: Id | null): EstadoModoGizmo {
  return atual.id === id ? atual : { modo: 'mover', id };
}

/** Informa ao estado qual é o único componente selecionado (ou null). Devolve o modo vigente. */
export function sincronizarModoGizmo(id: Id | null): ModoGizmoComponente {
  const atual = useModoGizmo.getState();
  const prox = modoParaSelecao(atual, id);
  if (prox !== atual) {
    useModoGizmo.setState(prox);
    // Componente novo selecionado na 3D: a dica do modo (Mover) aparece na barra de status.
    if (id !== null) useUi.setState({ status: { key: chaveDicaGizmo(prox.modo) } });
  }
  return prox.modo;
}

export interface ContextoTab {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  view: string;
  ferramenta: string;
  /** Há exatamente um componente selecionado. */
  umComponente: boolean;
  dialogoAberto: boolean;
  /** `tagName` do alvo do evento (qualquer caixa); campos de texto, listas e botões não trocam o modo. */
  alvoTag: string | undefined;
  alvoEditavel: boolean;
}

/** Decide se o Tab troca o modo do gizmo: só na 3D, com a Selecionar, um componente selecionado e foco fora de campos/botões/diálogos. */
export function tabTrocaModoGizmo(c: ContextoTab): boolean {
  if (c.key !== 'Tab' || c.ctrl || c.alt || c.meta) return false;
  if (c.view !== '3d' || c.ferramenta !== 'select' || !c.umComponente || c.dialogoAberto || c.alvoEditavel) return false;
  const tag = c.alvoTag?.toUpperCase();
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON';
}

/** Alterna o modo e escreve a dica na barra de status. */
export function alternarModoGizmo(): ModoGizmoComponente {
  const e = useModoGizmo.getState();
  const modo = outroModoGizmo(e.modo);
  useModoGizmo.setState({ modo });
  useUi.setState((s) => ({ status: { key: chaveDicaGizmo(modo) }, previewTick: s.previewTick + 1 }));
  return modo;
}
