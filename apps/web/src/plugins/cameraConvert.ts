import type { SceneCamera } from '@hestia/plugin-api';
import type { SheetView3DCamera } from '@hestia/model';

/** Campo de visão vertical da câmera orbital do Hestia (OrbitCamera.perspective), em radianos. */
export const HESTIA_FOV_Y = (38 * Math.PI) / 180;

/** Câmera orbital do Hestia (Z para cima) → câmera do contrato de cena. */
export function toSceneCamera(c: SheetView3DCamera): SceneCamera {
  const ce = Math.cos(c.elevation);
  const dir = { x: ce * Math.cos(c.azimuth), y: ce * Math.sin(c.azimuth), z: Math.sin(c.elevation) };
  return {
    projection: c.ortho ? 'orthographic' : 'perspective',
    target: { ...c.target },
    position: { x: c.target.x + dir.x * c.distance, y: c.target.y + dir.y * c.distance, z: c.target.z + dir.z * c.distance },
    up: { x: 0, y: 0, z: 1 },
    fovY: HESTIA_FOV_Y,
    orthoHeight: 2 * c.distance * Math.tan(HESTIA_FOV_Y / 2),
    near: 0.05,
    far: 2000,
  };
}

/** Câmera do contrato → órbita do Hestia. A órbita é uma câmera "olhar para o alvo"; `up` e `roll` são descartados. */
export function fromSceneCamera(c: SceneCamera): SheetView3DCamera {
  const dx = c.position.x - c.target.x;
  const dy = c.position.y - c.target.y;
  const dz = c.position.z - c.target.z;
  const distance = Math.max(1e-6, Math.hypot(dx, dy, dz));
  return {
    azimuth: Math.atan2(dy, dx),
    elevation: Math.asin(Math.max(-1, Math.min(1, dz / distance))),
    distance,
    target: { ...c.target },
    ortho: c.projection === 'orthographic',
  };
}
