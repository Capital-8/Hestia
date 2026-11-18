import { useEffect, useRef, type RefObject } from 'react';
import { useUi } from '../../editor/state.ts';

export interface SheetKeyActions {
  onEscape: () => void;
  onDelete: () => void;
  onNudge: (dx: number, dy: number) => void;
  onFit: () => void;
  onActualSize: () => void;
  onToggleGrid: () => void;
  /** Tab do Alinhar (alterna a feição sob o cursor); ausente = Tab normal. */
  onTab?: () => void;
  /** Enter do Alinhar (aplica a fila do Ctrl+clique). */
  onConfirm?: () => void;
  /** Atalho A: liga/desliga a ferramenta Alinhar. */
  onAlign?: () => void;
  /** Atalho M: liga/desliga a ferramenta Mover. */
  onMove?: () => void;
  /** Caractere digitado (Mover: distância). Devolver true consome a tecla. */
  onChar?: (ch: string) => boolean;
  /** Backspace (Mover: apaga a distância digitada). Devolver true consome a tecla. */
  onBackspace?: () => boolean;
}

/**
 * Atalhos da aba de prancha, como no Revit: sem Ctrl, as teclas não acionam ferramentas do modelo (o Ctrl+Z global
 * continua valendo). São ignoradas quando o foco está num campo de texto ou há um diálogo aberto.
 */
export function useSheetKeys(actions: SheetKeyActions, spaceRef: RefObject<boolean>): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const isField = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        // Espaço segurado é o pan (Espaço + arrastar). Sem diálogo nem campo com foco, não deixa o botão focado (ribbon)
        // ou a rolagem da página reagirem à mesma tecla.
        if (!isField(e.target)) {
          spaceRef.current = true;
          if (!useUi.getState().dialog) e.preventDefault();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isField(e.target) || useUi.getState().dialog) return;
      const a = actionsRef.current;
      if (a.onChar && e.key.length === 1 && a.onChar(e.key)) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Backspace' && a.onBackspace?.()) {
        e.preventDefault();
        return;
      }
      switch (e.key) {
        case 'Escape':
          a.onEscape();
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          a.onDelete();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          a.onNudge(e.shiftKey ? -10 : -1, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          a.onNudge(e.shiftKey ? 10 : 1, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          a.onNudge(0, e.shiftKey ? 10 : 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          a.onNudge(0, e.shiftKey ? -10 : -1);
          break;
        case 'z':
        case 'Z':
        case 'f':
        case 'F':
          a.onFit();
          break;
        case 'g':
        case 'G':
          a.onToggleGrid();
          break;
        case 'a':
        case 'A':
          // Revit: AL. Aqui é A, porque na prancha as teclas não acionam ferramentas do modelo.
          a.onAlign?.();
          break;
        case 'm':
        case 'M':
          a.onMove?.();
          break;
        case 'Tab':
          if (a.onTab) {
            e.preventDefault();
            a.onTab();
          }
          break;
        case 'Enter':
          if (a.onConfirm) {
            e.preventDefault();
            a.onConfirm();
          }
          break;
        case '0':
          a.onActualSize();
          break;
        default:
          break;
      }
    };
    const onUp = (e: KeyboardEvent): void => {
      if (e.key !== ' ') return;
      spaceRef.current = false;
      if (!isField(e.target) && !useUi.getState().dialog) e.preventDefault();
    };
    // Alt-tab com Espaço segurado perde o keyup: sem o reset, todo clique seguinte na prancha viraria pan.
    const soltar = (): void => {
      spaceRef.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', soltar);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', soltar);
    };
  }, [spaceRef]);
}
