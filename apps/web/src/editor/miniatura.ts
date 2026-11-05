import * as THREE from 'three';
import { lerCena3D, prepararCena3D } from './vista3dAoVivo.ts';

/**
 * Miniatura do projeto para a tela inicial: um quadro da mesma cena 3D, desenhado num renderizador descartável.
 *
 * Desenhar fora da tela (em vez de ler o canvas da vista) faz a captura funcionar de qualquer aba — planta, corte,
 * prancha — e sem trocar a vista do usuário. O custo é um renderizador a mais por salvamento (logo liberado); se a GPU
 * não deixar criar, o salvamento segue sem miniatura: o card da tela inicial cai para a planta.
 */

export const LARGURA_MINIATURA = 480;
export const ALTURA_MINIATURA = 320;
/** Fundo de reserva quando a cena não tem um (o JPEG não guarda transparência). */
const FUNDO_RESERVA = '#dfe7ee';

/** JPEG `data:` URL com o quadro atual da vista 3D, ou `null` quando não há cena/vista viva. */
export function capturarMiniatura3d(): string | null {
  if (typeof document === 'undefined') return null;
  // Fora da aba 3D a cena existe mas SEM os níveis montados: a miniatura sairia só com o fundo. Prepara (monta o que
  // faltar e enquadra a câmera) e, se ainda não houver geometria, o projeto é salvo sem miniatura.
  if (!prepararCena3D()) return null;
  const viva = lerCena3D();
  if (!viva) return null;
  const cena = viva.scene as THREE.Scene;
  let renderizador: THREE.WebGLRenderer | null = null;
  const fundoAnterior = cena.background;
  try {
    const camera = (viva.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).clone();
    if ('aspect' in camera) camera.aspect = LARGURA_MINIATURA / ALTURA_MINIATURA;
    camera.updateProjectionMatrix();

    const canvas = document.createElement('canvas');
    renderizador = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderizador.setPixelRatio(1);
    renderizador.setSize(LARGURA_MINIATURA, ALTURA_MINIATURA, false);
    if (!cena.background) cena.background = new THREE.Color(FUNDO_RESERVA);
    renderizador.render(cena, camera);
    const url = canvas.toDataURL('image/jpeg', 0.72);
    return url.startsWith('data:image/jpeg') ? url : null;
  } catch {
    // GPU recusou o contexto ou a captura: o projeto é salvo sem miniatura.
    return null;
  } finally {
    cena.background = fundoAnterior;
    try {
      renderizador?.dispose();
      renderizador?.forceContextLoss();
    } catch {
      // Sem problema: o contexto é descartado junto com o canvas.
    }
  }
}
