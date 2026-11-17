import { useEffect, useRef, type KeyboardEvent, type ReactElement } from 'react';
import type { Material } from '@hestia/model';
import { criarCena, liberarRenderer, obterRenderer, type CenaMaterial, type PreviewShape } from './cenaMaterial3d.ts';

export type { PreviewShape };

interface Props {
  material: Material;
  shape: PreviewShape;
  /** Lado em px (padrão 220). */
  size?: number;
  /** Miniatura: sem sombra pesada e sem arrastar. */
  low?: boolean;
  /** Mostra piso e parede de ladrilhos (padrão); falso mostra só o objeto. */
  cenario?: boolean;
}

const PASSO_TECLA = 0.15;

/**
 * Prévia 3D de material: objeto sobre piso/parede de ladrilhos soltos. Um único WebGLRenderer é compartilhado
 * entre todas as prévias; cada uma copia o quadro para o seu canvas 2D. Desenha só sob demanda.
 */
export function MaterialPreview({ material, shape, size = 220, low = false, cenario = true }: Props): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cenaRef = useRef<CenaMaterial | null>(null);
  const desenharRef = useRef<() => void>(() => {});
  const rot = useRef({ yaw: -0.5, pitch: 0.1 });
  const latest = useRef({ material, shape });
  latest.current = { material, shape };

  // Cena e renderer: nascem ao montar (ou ao mudar `low`) e são descartados ao desmontar.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof document === 'undefined') return;
    let compartilhado: ReturnType<typeof obterRenderer>;
    try {
      compartilhado = obterRenderer();
    } catch {
      return; // sem WebGL: o canvas fica vazio (o rótulo continua acessível)
    }
    const cena = criarCena(compartilhado.env, latest.current.shape, latest.current.material, low);
    cenaRef.current = cena;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const desenhar = (): void => {
      frame = 0;
      const { renderer } = compartilhado;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.round(canvas.clientWidth * dpr) || Math.round(canvas.width);
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      renderer.setPixelRatio(1);
      renderer.setSize(px, px, false);
      renderer.shadowMap.enabled = !low;
      cena.camera.aspect = 1;
      cena.camera.updateProjectionMatrix();
      cena.girar(rot.current.yaw, rot.current.pitch);
      renderer.render(cena.scene, cena.camera);
      ctx?.clearRect(0, 0, px, px);
      ctx?.drawImage(renderer.domElement, 0, 0, px, px);
    };
    desenharRef.current = () => {
      if (!frame) frame = requestAnimationFrame(desenhar);
    };
    desenharRef.current();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      desenharRef.current = () => {};
      cenaRef.current = null;
      cena.dispose();
      liberarRenderer();
    };
  }, [low]);

  // Material e forma: só atualizam o MeshPhysicalMaterial / visibilidade, sem recriar a cena.
  useEffect(() => {
    cenaRef.current?.aplicarMaterial(material);
    desenharRef.current();
  }, [material]);
  useEffect(() => {
    cenaRef.current?.definirCenario(cenario);
    desenharRef.current();
  }, [cenario, low]);
  useEffect(() => {
    cenaRef.current?.definirForma(shape);
    desenharRef.current();
  }, [shape]);

  // Arrastar com o mouse gira o objeto.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const girar = (dyaw: number, dpitch: number): void => {
    rot.current = { yaw: rot.current.yaw + dyaw, pitch: Math.max(-1.2, Math.min(1.2, rot.current.pitch + dpitch)) };
    desenharRef.current();
  };
  const onTecla = (e: KeyboardEvent<HTMLCanvasElement>): void => {
    if (low) return;
    const mapa: Record<string, [number, number]> = {
      ArrowLeft: [-PASSO_TECLA, 0],
      ArrowRight: [PASSO_TECLA, 0],
      ArrowUp: [0, -PASSO_TECLA],
      ArrowDown: [0, PASSO_TECLA],
    };
    const d = mapa[e.key];
    if (!d) return;
    e.preventDefault();
    girar(d[0], d[1]);
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role="img"
      aria-label={`Prévia 3D do material (${shape === 'sphere' ? 'esfera' : shape === 'cube' ? 'cubo' : 'plano'}). Use as setas para girar.`}
      tabIndex={low ? -1 : 0}
      style={{ width: size, height: size, display: 'block', touchAction: 'none', cursor: low ? 'default' : 'grab' }}
      onKeyDown={onTecla}
      onPointerDown={(e) => {
        if (low || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        girar((e.clientX - d.x) * 0.01, (e.clientY - d.y) * 0.01);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}
