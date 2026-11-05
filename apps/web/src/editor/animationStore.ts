import { create } from 'zustand';
import type { AnimationSequence, CameraKeyframe } from '@hestia/render';

/**
 * Estado do Estúdio de animação (sessão). Separado do ProjectStore: a sequência é uma preferência
 * de trabalho, não um elemento do modelo. A persistência em IndexedDB fica na galeria.
 */

export interface AnimationState {
  sequences: Record<string, AnimationSequence>;
  activeId: string | null;
  /** Tempo atual em segundos. */
  playhead: number;
  playing: boolean;
  selectedKeyframe: string | null;

  create(seq: AnimationSequence): void;
  selectSequence(id: string): void;
  update(id: string, patch: Partial<AnimationSequence>): void;
  setPlayhead(t: number): void;
  setPlaying(v: boolean): void;
  selectKeyframe(id: string | null): void;
  addKeyframe(k: CameraKeyframe): void;
  updateKeyframe(id: string, patch: Partial<CameraKeyframe>): void;
  removeKeyframe(id: string): void;
  reset(): void;
}

const inicial = {
  sequences: {} as Record<string, AnimationSequence>,
  activeId: null as string | null,
  playhead: 0,
  playing: false,
  selectedKeyframe: null as string | null,
};

export const useAnimationStore = create<AnimationState>((set, get) => ({
  ...inicial,

  create(seq) {
    set((s) => ({
      sequences: { ...s.sequences, [seq.id]: seq },
      activeId: seq.id,
      playhead: 0,
      playing: false,
      selectedKeyframe: null,
    }));
  },

  selectSequence(id) {
    if (!get().sequences[id]) return;
    set({ activeId: id, playhead: 0, playing: false, selectedKeyframe: null });
  },

  update(id, patch) {
    set((s) => {
      const atual = s.sequences[id];
      if (!atual) return s;
      const proxima = { ...atual, ...patch };
      // Mudar o modo não pode deixar keyframes/câmera de outro modo inconsistentes.
      if (patch.mode && patch.mode !== atual.mode) {
        if (patch.mode === 'turntable' && !proxima.turntable) {
          const cam = proxima.keyframes[0]?.camera ?? proxima.solarCamera;
          if (cam) {
            proxima.turntable = {
              target: { ...cam.target },
              distance: cam.distance,
              elevation: cam.elevation,
              startAzimuth: cam.azimuth,
              direction: 1,
              turns: 1,
              ortho: cam.ortho,
            };
          }
        }
        if (patch.mode === 'solar') {
          proxima.solar ??= {
            date: new Date().toISOString().slice(0, 10),
            latitude: -23.55,
            longitude: -46.63,
            startHour: 8,
            endHour: 17,
            timezone: -3,
          };
          if (!proxima.solarCamera) {
            const t = proxima.turntable;
            const cam = proxima.keyframes[0]?.camera ?? (t
              ? { azimuth: t.startAzimuth, elevation: t.elevation, distance: t.distance, target: { ...t.target }, ortho: t.ortho === true }
              : null);
            if (cam) proxima.solarCamera = { ...cam, target: { ...cam.target } };
          }
        }
        if (patch.mode === 'keyframes' && proxima.keyframes.length === 0) {
          const t = proxima.turntable;
          const cam = proxima.solarCamera ?? proxima.keyframes[0]?.camera ?? (t
            ? { azimuth: t.startAzimuth, elevation: t.elevation, distance: t.distance, target: { ...t.target }, ortho: t.ortho === true }
            : null);
          if (cam) {
            proxima.keyframes = [
              { id: `kf_${Date.now()}_0`, t: 0, camera: { ...cam, target: { ...cam.target } }, easing: 'smooth' },
              { id: `kf_${Date.now()}_1`, t: proxima.duration, camera: { ...cam, target: { ...cam.target } }, easing: 'smooth' },
            ];
          }
        }
      }
      return { sequences: { ...s.sequences, [id]: proxima } };
    });
  },

  setPlayhead(t) {
    const id = get().activeId;
    const seq = id ? get().sequences[id] : null;
    const max = seq ? Math.max(0, seq.duration) : 0;
    set({ playhead: Math.max(0, Math.min(max, Number.isFinite(t) ? t : 0)) });
  },

  setPlaying(v) {
    set({ playing: v });
  },

  selectKeyframe(id) {
    set({ selectedKeyframe: id });
  },

  addKeyframe(k) {
    const { activeId, sequences } = get();
    if (!activeId) return;
    const seq = sequences[activeId];
    if (!seq) return;
    const keyframes = [...seq.keyframes, { ...k, camera: { ...k.camera, target: { ...k.camera.target } } }]
      .sort((a, b) => a.t - b.t);
    set({
      sequences: { ...sequences, [activeId]: { ...seq, mode: 'keyframes', keyframes } },
      selectedKeyframe: k.id,
      playing: false,
    });
  },

  updateKeyframe(id, patch) {
    const { activeId, sequences } = get();
    if (!activeId) return;
    const seq = sequences[activeId];
    if (!seq) return;
    const keyframes = seq.keyframes
      .map((k) => (k.id === id ? { ...k, ...patch, camera: patch.camera ? { ...patch.camera, target: { ...patch.camera.target } } : k.camera } : k))
      .sort((a, b) => a.t - b.t);
    set({ sequences: { ...sequences, [activeId]: { ...seq, keyframes } } });
  },

  removeKeyframe(id) {
    const { activeId, sequences, selectedKeyframe } = get();
    if (!activeId) return;
    const seq = sequences[activeId];
    if (!seq) return;
    set({
      sequences: { ...sequences, [activeId]: { ...seq, keyframes: seq.keyframes.filter((k) => k.id !== id) } },
      selectedKeyframe: selectedKeyframe === id ? null : selectedKeyframe,
    });
  },

  reset() {
    set({ ...inicial, sequences: {} });
  },
}));
