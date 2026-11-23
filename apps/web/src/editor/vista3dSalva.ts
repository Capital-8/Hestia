import { view3dViewOf, type Camera3D, type Id, type Project, type SheetView3DCamera, type View3DView } from '@hestia/model';

/**
 * Vistas 3D salvas (plano de UX de 2026-11-23): ponte pura entre a aba `3d:<id>` e a vista guardada no projeto.
 * A câmera da tela é a da órbita (radianos, como `SheetView3DCamera`); a da vista salva usa graus (`Camera3D`), então
 * estes conversores são o único lugar que troca a unidade. Nada aqui muda o projeto.
 */

/** Campos da interface que dizem qual vista 3D está ativa (subconjunto de `UiState`). */
export interface Vista3dFields {
  view: string;
  view3dViewId?: Id | null;
}

/** Vista 3D salva da aba ativa; undefined = 3D padrão (ou a aba não é 3D). */
export function vista3dSalvaDe(p: Partial<Pick<Project, 'view3dViews'>>, st: Vista3dFields): View3DView | undefined {
  return st.view === '3d' && st.view3dViewId ? view3dViewOf(p, st.view3dViewId) : undefined;
}

/** Câmera da órbita (radianos) para a vista salva (graus). */
export function cameraSalvaDaOrbita(c: SheetView3DCamera): Camera3D {
  return { azimuth: (c.azimuth * 180) / Math.PI, elevation: (c.elevation * 180) / Math.PI, distance: c.distance, target: { x: c.target.x, y: c.target.y, z: c.target.z }, ortho: c.ortho };
}

/** Câmera da vista salva (graus) para a órbita (radianos). */
export function cameraOrbitaDaSalva(c: Camera3D): SheetView3DCamera {
  return { azimuth: (c.azimuth * Math.PI) / 180, elevation: (c.elevation * Math.PI) / 180, distance: c.distance, target: { x: c.target.x, y: c.target.y, z: c.target.z }, ortho: c.ortho };
}

/** Mesma câmera (para não gravar um passo de desfazer vazio ao sair da vista). */
export function mesmaCamera3d(a: Camera3D, b: Camera3D): boolean {
  return a.azimuth === b.azimuth && a.elevation === b.elevation && a.distance === b.distance && a.ortho === b.ortho
    && a.target.x === b.target.x && a.target.y === b.target.y && a.target.z === b.target.z;
}
