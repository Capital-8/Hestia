import { useEffect, useRef, type ReactElement } from 'react';
import type * as THREE from 'three';
import type { OpeningType } from '@hestia/model';
import { previewScene, type Preview3DStyle } from './previewScene.ts';
import { previewTypeSignature } from './previewViews.ts';

interface Preview3DProps {
  /** Renderizador único do diálogo (criado ao abrir e descartado ao fechar). */
  renderer: THREE.WebGLRenderer | null;
  type: OpeningType;
  style: Preview3DStyle;
  angle: number;
  flipHand: boolean;
  flipFacing: boolean;
  /** A aba 3D está ativa: sem isso o canvas fica oculto e o laço não desenha. */
  active: boolean;
  dark?: boolean;
}

/**
 * Canvas da prévia 3D. Usa o `ModelScene` do projeto (mesmas peças, mesma parede com furo) e o `WebGLRenderer`
 * compartilhado pelo diálogo. Arrastar gira e a roda aproxima.
 */
export function Preview3D({
  renderer,
  type,
  style,
  angle,
  flipHand,
  flipFacing,
  active,
  dark = false,
}: Preview3DProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const signature = previewTypeSignature(type);
  // Câmera do usuário entre as atualizações da cena: ângulo, elevação e o zoom relativo ao enquadramento (a cena é refeita a cada edição).
  const camera = useRef<{ azimuth: number; elevation: number; factor: number; typeId: string } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!renderer || !el || !active) return;
    const scene = previewScene(type, style, angle, dark, flipHand, flipFacing);
    const fit = scene.orbit.distance;
    const kept = camera.current;
    if (kept && kept.typeId === type.id && fit > 0) {
      scene.orbit.azimuth = kept.azimuth;
      scene.orbit.elevation = kept.elevation;
      scene.orbit.distance = fit * kept.factor;
      scene.orbit.apply();
    }
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-label', style === 'lines' ? 'Prévia 3D em linhas' : 'Prévia 3D sombreada');
    if (canvas.parentElement !== el) el.appendChild(canvas);
    renderer.shadowMap.enabled = false;
    let frame = 0;
    let lastW = 0;
    let lastH = 0;
    const draw = (): void => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        scene.orbit.setAspect(w, h);
      }
      renderer.render(scene.scene, scene.orbit.camera);
      frame = requestAnimationFrame(draw);
    };
    draw();
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      if (!drag) return;
      scene.orbit.orbit(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent): void => {
      drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      scene.orbit.zoom(e.deltaY);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      if (fit > 0) camera.current = { azimuth: scene.orbit.azimuth, elevation: scene.orbit.elevation, factor: scene.orbit.distance / fit, typeId: type.id };
      cancelAnimationFrame(frame);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      if (canvas.parentElement === el) el.removeChild(canvas);
      scene.dispose();
    };
    // `signature` resume os campos visuais do tipo: mudar o nome ou o custo não refaz a cena.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, signature, style, angle, flipHand, flipFacing, active, dark]);

  return (
    <div
      ref={host}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: active ? 'block' : 'none',
        touchAction: 'none',
        cursor: active ? 'grab' : 'default',
      }}
    />
  );
}
