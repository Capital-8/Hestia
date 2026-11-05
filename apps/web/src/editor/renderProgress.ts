import { create } from 'zustand';

export interface RenderProgress {
  kind: 'image' | 'video';
  phase: 'preparing' | 'rendering' | 'encoding' | 'saving';
  frame: number;
  total: number;
  /** 0..1 */
  fraction: number;
  etaMs: number | null;
  message?: string;
}

interface RenderJobState {
  progress: RenderProgress | null;
  cancelar: (() => void) | null;
  iniciar: (p: Omit<RenderProgress, 'fraction'> & { fraction?: number }) => void;
  atualizar: (patch: Partial<RenderProgress>) => void;
  finalizar: () => void;
  definirCancelar: (fn: (() => void) | null) => void;
}

export const useRenderJob = create<RenderJobState>((set) => ({
  progress: null,
  cancelar: null,
  iniciar(p) {
    set({
      progress: {
        ...p,
        fraction: p.fraction ?? (p.total > 0 ? p.frame / p.total : 0),
      },
    });
  },
  atualizar(patch) {
    set((s) => {
      if (!s.progress) return s;
      const next = { ...s.progress, ...patch };
      if (patch.frame !== undefined || patch.total !== undefined) {
        next.fraction = next.total > 0 ? Math.max(0, Math.min(1, next.frame / next.total)) : 0;
      }
      return { progress: next };
    });
  },
  finalizar() {
    set({ progress: null, cancelar: null });
  },
  definirCancelar(fn) {
    set({ cancelar: fn });
  },
}));
