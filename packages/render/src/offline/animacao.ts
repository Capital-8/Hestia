import type { SheetView3DCamera } from '@hestia/model';
import { solarPositionAt } from './solar.ts';

/**
 * Sequência de animação para o estúdio de vídeo. Tipos puros (sem DOM/three): a UI, o preview e o
 * renderizador final consomem a mesma amostragem de câmera e de sol.
 */

export type AnimationMode = 'turntable' | 'keyframes' | 'solar';
export type RenderQuality = 'draft' | 'medium' | 'final' | 'gpu';
export type VideoFormat = 'mp4' | 'webm';

export interface RenderSize {
  w: number;
  h: number;
}

export interface CameraKeyframe {
  id: string;
  /** Tempo em segundos desde o início. */
  t: number;
  /** Cópia estável da câmera (não referencia View3DPoint). */
  camera: SheetView3DCamera;
  easing?: 'linear' | 'smooth';
}

export interface TurntableSettings {
  /** Alvo da órbita, em metros. */
  target: { x: number; y: number; z: number };
  distance: number;
  /** Elevação em radianos, como em SheetView3DCamera. */
  elevation: number;
  startAzimuth: number;
  direction: 1 | -1;
  /** Voltas completas; padrão 1. */
  turns?: number;
  ortho?: boolean;
}

export interface SolarSettings {
  /** Data ISO `YYYY-MM-DD`. */
  date: string;
  latitude: number;
  longitude: number;
  /** Hora local decimal, 0..24. */
  startHour: number;
  endHour: number;
  timezone?: number;
}

export interface AnimationSequence {
  id: string;
  name: string;
  mode: AnimationMode;
  /** Duração em segundos. */
  duration: number;
  fps: number;
  resolution: RenderSize;
  quality: RenderQuality;
  format: VideoFormat;
  /** Cor de fundo `#rrggbb`; null = céu do tema. */
  background: string | null;
  exposure: number;
  turntable?: TurntableSettings;
  keyframes: CameraKeyframe[];
  solar?: SolarSettings;
  /** Câmera fixa do estudo solar; ausente = primeiro keyframe. */
  solarCamera?: SheetView3DCamera;
}

export interface SunState {
  /** Graus, 0 = leste, anti-horário. */
  azimuth: number;
  /** Graus acima do horizonte. */
  elevation: number;
}

const TAU = Math.PI * 2;
const FALLBACK_CAMERA: SheetView3DCamera = {
  azimuth: 0.6,
  elevation: 0.45,
  distance: 22,
  target: { x: 0, y: 0, z: 0 },
  ortho: false,
};

const cloneCamera = (c: SheetView3DCamera): SheetView3DCamera => ({
  ...c,
  target: { ...c.target },
});

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Normaliza um ângulo para [0, 2π). */
const wrapAngle = (a: number): number => ((a % TAU) + TAU) % TAU;

/** Interpola dois ângulos pelo arco mais curto. */
export function lerpAngle(a: number, b: number, t: number): number {
  let delta = wrapAngle(b - a);
  if (delta > Math.PI) delta -= TAU;
  return wrapAngle(a + delta * t);
}

let sequencia = 0;
const uid = (prefixo: string): string => `${prefixo}_${Date.now().toString(36)}_${(sequencia++).toString(36)}`;

/** Número de quadros de uma sequência (mínimo 1). */
export function frameCount(seq: AnimationSequence): number {
  const fps = Number.isFinite(seq.fps) && seq.fps > 0 ? seq.fps : 30;
  const duracao = Number.isFinite(seq.duration) && seq.duration > 0 ? seq.duration : 0;
  return Math.max(1, Math.round(duracao * fps));
}

/** Sequência inicial: turntable em torno da câmera dada, ou dois keyframes iguais. */
export function defaultSequence(
  seed: { id?: string; name: string; camera: SheetView3DCamera },
  mode: AnimationMode = 'turntable',
): AnimationSequence {
  const camera = cloneCamera(seed.camera);
  const duracao = 8;
  const fps = 30;
  const keyframes: CameraKeyframe[] = mode === 'keyframes'
    ? [
      { id: uid('kf'), t: 0, camera: cloneCamera(camera), easing: 'smooth' },
      { id: uid('kf'), t: duracao, camera: cloneCamera(camera), easing: 'smooth' },
    ]
    : [];
  return {
    id: seed.id ?? uid('anim'),
    name: seed.name,
    mode,
    duration: duracao,
    fps,
    resolution: { w: 1280, h: 720 },
    quality: 'draft',
    format: 'webm',
    background: null,
    exposure: 0,
    turntable: mode === 'turntable'
      ? {
        target: { ...camera.target },
        distance: camera.distance,
        elevation: camera.elevation,
        startAzimuth: camera.azimuth,
        direction: 1,
        turns: 1,
        ortho: camera.ortho,
      }
      : undefined,
    keyframes,
    solar: mode === 'solar'
      ? {
        date: new Date().toISOString().slice(0, 10),
        latitude: -23.55,
        longitude: -46.63,
        startHour: 8,
        endHour: 17,
        timezone: -3,
      }
      : undefined,
    solarCamera: mode === 'solar' ? cloneCamera(camera) : undefined,
  };
}

/** Câmera de referência quando a sequência não tem keyframes nem câmera solar. */
function cameraDeReferencia(seq: AnimationSequence): SheetView3DCamera {
  return seq.solarCamera ?? seq.keyframes[0]?.camera ?? FALLBACK_CAMERA;
}

/**
 * Amostra a câmera no tempo `t` (segundos). Turntable gira em torno do alvo; keyframes interpolam
 * alvo/distância/elevação/azimute; solar usa a câmera fixa.
 */
export function sampleCamera(seq: AnimationSequence, t: number): SheetView3DCamera {
  const duracao = Number.isFinite(seq.duration) && seq.duration > 0 ? seq.duration : 1;
  if (seq.mode === 'turntable' && seq.turntable) {
    const tt = seq.turntable;
    const u = clamp(t / duracao, 0, 1);
    const turns = Number.isFinite(tt.turns) && tt.turns ? tt.turns : 1;
    return {
      azimuth: wrapAngle(tt.startAzimuth + (tt.direction ?? 1) * TAU * turns * u),
      elevation: tt.elevation,
      distance: Math.max(0.01, tt.distance),
      target: { ...tt.target },
      ortho: tt.ortho === true,
    };
  }

  if (seq.mode === 'keyframes' && seq.keyframes.length > 0) {
    const kfs = [...seq.keyframes].sort((a, b) => a.t - b.t);
    if (kfs.length === 1) return cloneCamera(kfs[0]!.camera);
    if (t <= kfs[0]!.t) return cloneCamera(kfs[0]!.camera);
    const ultimo = kfs[kfs.length - 1]!;
    if (t >= ultimo.t) return cloneCamera(ultimo.camera);
    let i = 0;
    while (i < kfs.length - 1 && t > kfs[i + 1]!.t) i++;
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    const span = Math.max(1e-9, b.t - a.t);
    const bruto = clamp((t - a.t) / span, 0, 1);
    const k = (b.easing ?? a.easing) === 'smooth' ? smoothstep(bruto) : bruto;
    return {
      azimuth: lerpAngle(a.camera.azimuth, b.camera.azimuth, k),
      elevation: a.camera.elevation + (b.camera.elevation - a.camera.elevation) * k,
      distance: Math.max(0.01, a.camera.distance + (b.camera.distance - a.camera.distance) * k),
      target: {
        x: a.camera.target.x + (b.camera.target.x - a.camera.target.x) * k,
        y: a.camera.target.y + (b.camera.target.y - a.camera.target.y) * k,
        z: a.camera.target.z + (b.camera.target.z - a.camera.target.z) * k,
      },
      ortho: a.camera.ortho,
    };
  }

  return cloneCamera(cameraDeReferencia(seq));
}

/**
 * Sol da sequência no tempo `t` (graus). Só o modo solar tem sol animado; nos demais, o preview
 * usa o sol da vista 3D do projeto.
 */
export function sampleSun(seq: AnimationSequence, t: number): SunState | null {
  if (seq.mode !== 'solar' || !seq.solar) return null;
  return solarPositionAt(seq.solar, t, seq.duration);
}
