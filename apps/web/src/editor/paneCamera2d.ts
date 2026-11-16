import { fitBox, type Viewport } from '@hestia/render';
import type { Id } from '@hestia/model';
import { editor } from './controller.ts';
import type { PaneCamera2D } from './panes.ts';
import { viewKeyOf, type ViewKeyFields } from './viewKey.ts';

/** Câmera 2D própria de um canvas de painel inativo: da instância, não do controlador (que guarda só a da vista ativa). */
export interface OwnCamera2d {
  key: Id;
  v: Viewport;
  /** Já enquadrada (ou restaurada). O corte ainda sem resultado espera o cálculo para enquadrar. */
  framed: boolean;
}
export interface OwnCameraRef { current: OwnCamera2d | null }

type Fields = ViewKeyFields & { sectionId: Id | null };

/**
 * Câmera 2D do painel inativo para o tamanho dado. Primeira vez (ou vista nova): restaura `saved` quando houver, senão enquadra
 * a vista do painel (`fitBox` da caixa do nível ou do corte). Depois só acompanha o tamanho do canvas. Não toca no controlador.
 */
export function ownViewport(ref: OwnCameraRef, f: Fields, width: number, height: number, saved: PaneCamera2D | null): Viewport {
  const key = viewKeyOf(f);
  let cur = ref.current;
  if (!cur || cur.key !== key) {
    const base: Viewport = saved ? { cx: saved.center.x, cy: saved.center.y, zoom: saved.zoom, width, height } : { cx: 5, cy: 3.5, zoom: 60, width, height };
    cur = { key, v: base, framed: saved !== null };
  } else if (cur.v.width !== width || cur.v.height !== height) {
    cur = { ...cur, v: { ...cur.v, width, height } };
  }
  if (!cur.framed) {
    const box = editor.frameBox(f);
    if (box) cur = { ...cur, v: fitBox(cur.v, box), framed: true };
  }
  ref.current = cur;
  return cur.v;
}

/** Câmera 2D de um viewport, no formato guardado no painel. */
export function camera2dOf(v: Viewport): PaneCamera2D {
  return { zoom: v.zoom, center: { x: v.cx, y: v.cy } };
}
