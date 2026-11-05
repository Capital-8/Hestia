import { cameraDaVista3D, type Id, type Project, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, OrbitCamera, cameraDaOrbita, defaultSequence, type AnimationMode } from '@hestia/render';
import { useAnimationStore } from './animationStore.ts';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { camera3DAtual, pedirCamera3D } from './vista3dAoVivo.ts';
import { cameraPreviewAtual } from './render/previewCamera.ts';
import { activateView } from './viewTabActions.ts';

const CAMERA_PADRAO: SheetView3DCamera = {
  azimuth: 0.6,
  elevation: 0.45,
  distance: 22,
  target: { x: 0, y: 0, z: 0 },
  ortho: false,
};

/**
 * Câmera de partida do estúdio: a vista 3D viva, o ponto salvo escolhido ou um enquadramento
 * calculado a partir da caixa do modelo. O cálculo usa a MESMA montagem do 3D, mas é descartado
 * em seguida (só a câmera serializável fica).
 */
function cameraPadrao(p: Project): SheetView3DCamera {
  try {
    const cena = new ModelScene();
    try {
      const niveis = p.levels.map((l) => resolveLevel(p, l.id));
      cena.update(p, niveis, { dark: false, edges: false, shadows: false });
      const box = cena.exportarVetores().box;
      const orb = new OrbitCamera();
      orb.fit(box);
      orb.setAspect(16, 9);
      orb.setOrtho(false);
      orb.apply();
      return cameraDaOrbita(orb);
    } finally {
      cena.dispose();
    }
  } catch {
    return { ...CAMERA_PADRAO, target: { ...CAMERA_PADRAO.target } };
  }
}

function primeiraCamera(p: Project, pointId?: Id): SheetView3DCamera {
  if (pointId) {
    const salva = cameraDaVista3D(p, { kind: '3d', pointId });
    if (salva) return { ...salva, target: { ...salva.target } };
  }
  const viva = camera3DAtual();
  if (viva) return { ...viva, target: { ...viva.target } };
  return cameraPadrao(p);
}

/**
 * Abre o Estúdio de animação numa aba de vista. Se já existe uma sequência ativa, só ativa a aba;
 * `novo: true` cria outra sequência a partir da câmera atual.
 */
export function openAnimationStudio(opts: { mode?: AnimationMode; pointId?: Id; novo?: boolean } = {}): void {
  const store = useAnimationStore.getState();
  if (!opts.novo && store.activeId && store.sequences[store.activeId]) {
    activateView({ kind: 'animation' });
    return;
  }
  const p = editor.project;
  const camera = primeiraCamera(p, opts.pointId);
  const n = Object.keys(store.sequences).length + 1;
  const seq = defaultSequence({ name: n === 1 ? 'Animação 1' : `Animação ${n}`, camera }, opts.mode ?? 'turntable');
  store.create(seq);
  activateView({ kind: 'animation' });
  useUi.setState({ status: `Estúdio de animação: ${seq.name}.` });
}

/**
 * Sai do estúdio sem apagar a sequência (ela continua na galeria/estado da sessão). Leva a
 * câmera da prévia para a vista 3D, para o usuário continuar exatamente de onde estava.
 */
export function closeAnimationStudio(): void {
  const camera = cameraPreviewAtual();
  useAnimationStore.getState().setPlaying(false);
  if (camera) pedirCamera3D(camera);
  else activateView({ kind: '3d' });
}

/** Renomeia a sequência ativa. */
export function renameAnimationStudio(name: string): void {
  const s = useAnimationStore.getState();
  if (!s.activeId) return;
  const limpo = name.trim();
  if (!limpo) return;
  s.update(s.activeId, { name: limpo });
}
