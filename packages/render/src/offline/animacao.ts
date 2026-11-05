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

/** Normaliza um ângulo para [0, 2π). */
const wrapAngle = (a: number): number => ((a % TAU) + TAU) % TAU;

/** Interpola dois ângulos pelo arco mais curto. */
export function lerpAngle(a: number, b: number, t: number): number {
  let delta = wrapAngle(b - a);
  if (delta > Math.PI) delta -= TAU;
  return wrapAngle(a + delta * t);
}

/** Interpolação linear entre (ta, pa) e (tb, pb); com tempos coincidentes devolve pb. */
function lerpPonto(t: number, ta: number, tb: number, pa: number, pb: number): number {
  const d = tb - ta;
  if (Math.abs(d) < 1e-12) return pb;
  return ((tb - t) * pa + (t - ta) * pb) / d;
}

/**
 * Catmull-Rom com tempos não uniformes (Barry–Goldman). Avaliada no trecho [t1, t2], passa
 * exatamente por p1 em t1 e por p2 em t2, com tangentes vindas dos vizinhos p0 e p3.
 */
function catmullRom(
  t: number,
  t0: number, t1: number, t2: number, t3: number,
  p0: number, p1: number, p2: number, p3: number,
): number {
  const a1 = lerpPonto(t, t0, t1, p0, p1);
  const a2 = lerpPonto(t, t1, t2, p1, p2);
  const a3 = lerpPonto(t, t2, t3, p2, p3);
  const b1 = lerpPonto(t, t0, t2, a1, a2);
  const b2 = lerpPonto(t, t1, t3, a2, a3);
  return lerpPonto(t, t1, t2, b1, b2);
}

/**
 * Azimutes dos keyframes desdobrados: cada passo entre keyframes consecutivos usa o arco mais curto
 * (delta em (-π, π]) e o resultado é acumulado, para que a curva não dê a volta inteira à toa.
 * A redução módulo 2π só acontece no retorno da amostragem.
 */
function azimutesDesdobrados(kfs: CameraKeyframe[]): number[] {
  const out: number[] = [kfs[0]!.camera.azimuth];
  for (let i = 1; i < kfs.length; i++) {
    let delta = wrapAngle(kfs[i]!.camera.azimuth - kfs[i - 1]!.camera.azimuth);
    if (delta > Math.PI) delta -= TAU;
    out.push(out[i - 1]! + delta);
  }
  return out;
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
 * Amostra a câmera no tempo `t` (segundos). Prioridade: se há keyframes, eles mandam em qualquer
 * modo (interpolação Catmull-Rom que passa por cada keyframe). Sem keyframes, turntable gira em
 * torno do alvo e, na falta dele, a câmera solar/de referência fica fixa.
 *
 * Nota: o campo `easing` dos keyframes não é usado pela interpolação de câmera nesta fase; o
 * campo continua no modelo de dados.
 */
export function sampleCamera(seq: AnimationSequence, t: number): SheetView3DCamera {
  const duracao = Number.isFinite(seq.duration) && seq.duration > 0 ? seq.duration : 1;

  if (seq.keyframes.length > 0) {
    const kfs = [...seq.keyframes].sort((a, b) => a.t - b.t);
    if (kfs.length === 1) return cloneCamera(kfs[0]!.camera);
    if (t <= kfs[0]!.t) return cloneCamera(kfs[0]!.camera);
    const ultimo = kfs[kfs.length - 1]!;
    if (t >= ultimo.t) return cloneCamera(ultimo.camera);
    let i = 0;
    while (i < kfs.length - 1 && t > kfs[i + 1]!.t) i++;
    const b = kfs[i + 1]!;
    if (b.t - kfs[i]!.t < 1e-9) return cloneCamera(b.camera);

    // Vizinhos fantasmas nas pontas: repetem o primeiro/último ponto, com tempo espelhado.
    const n = kfs.length;
    const ts = kfs.map((k) => k.t);
    const tempo = (j: number): number => (j < 0
      ? 2 * ts[0]! - ts[1]!
      : j >= n ? 2 * ts[n - 1]! - ts[n - 2]! : ts[j]!);
    const canal = (vals: number[]) => (j: number): number => vals[clamp(j, 0, n - 1)]!;
    const az = azimutesDesdobrados(kfs);
    const amostra = (vals: number[]): number => {
      const v = canal(vals);
      return catmullRom(
        t,
        tempo(i - 1), tempo(i), tempo(i + 1), tempo(i + 2),
        v(i - 1), v(i), v(i + 1), v(i + 2),
      );
    };
    const elevs = kfs.map((k) => k.camera.elevation);
    const dists = kfs.map((k) => k.camera.distance);
    const tx = kfs.map((k) => k.camera.target.x);
    const ty = kfs.map((k) => k.camera.target.y);
    const tz = kfs.map((k) => k.camera.target.z);
    return {
      azimuth: wrapAngle(amostra(az)),
      elevation: amostra(elevs),
      distance: Math.max(0.01, amostra(dists)),
      target: { x: amostra(tx), y: amostra(ty), z: amostra(tz) },
      ortho: kfs[i]!.camera.ortho,
    };
  }

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
