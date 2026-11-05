import { newId } from './ids.ts';
import type { Id, Project } from './types.ts';

/**
 * Câmera de render (Revit: *Camera*): uma entidade do projeto, colocada em planta por nível. Ela é a câmera que o
 * render final usa, não a câmera da tela. Unidades: metros, Z para cima. `position.z` é a altura absoluta do olho;
 * `fovDeg` é o campo de visão horizontal, em graus.
 */
export interface RenderCamera {
  id: Id;
  name: string;
  levelId: Id;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fovDeg: number;
  aspect: { w: number; h: number };
}

/** Câmeras de render do projeto (ausente = nenhuma). */
export const projectRenderCameras = (p: Pick<Project, 'renderCameras'>): RenderCamera[] => p.renderCameras ?? [];

export function renderCameraOf(p: Pick<Project, 'renderCameras'>, id: Id): RenderCamera | undefined {
  return projectRenderCameras(p).find((x) => x.id === id);
}

/** Nome padrão de uma câmera nova: "Câmera 1", "Câmera 2"… sem repetir nome. */
export function defaultRenderCameraName(p: Pick<Project, 'renderCameras'>): string {
  const nomes = new Set(projectRenderCameras(p).map((x) => x.name));
  for (let n = 1; ; n++) if (!nomes.has(`Câmera ${n}`)) return `Câmera ${n}`;
}

/** Cópia independente: nada de compartilhar position, target ou aspect com o original. */
function clonar(c: RenderCamera): RenderCamera {
  return {
    ...c,
    position: { ...c.position },
    target: { ...c.target },
    aspect: { ...c.aspect },
  };
}

/** Câmera nova a partir dos dados (sem id). O id é gerado aqui e os objetos são copiados. */
export function makeRenderCamera(input: Omit<RenderCamera, 'id' | 'name'>, name: string): RenderCamera {
  return clonar({ ...input, id: newId('rcam'), name });
}

const finitos = (v: { x: number; y: number; z: number }): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Recusa em pt-BR de uma câmera (sem id). `null` = válida. */
export function renderCameraIssue(c: Omit<RenderCamera, 'id'>, p: Pick<Project, 'levels'>): string | null {
  if (c.name.trim() === '') return 'O nome da câmera não pode ficar vazio.';
  if (!p.levels.some((l) => l.id === c.levelId)) return 'O nível da câmera não existe no projeto.';
  if (!finitos(c.position) || !finitos(c.target)) return 'As coordenadas da câmera devem ser números finitos.';
  const dx = c.target.x - c.position.x;
  const dy = c.target.y - c.position.y;
  const dz = c.target.z - c.position.z;
  if (Math.hypot(dx, dy, dz) < 0.01) return 'O alvo da câmera não pode estar na mesma posição da câmera.';
  if (!Number.isFinite(c.fovDeg) || c.fovDeg < 10 || c.fovDeg > 120) return 'O campo de visão da câmera deve estar entre 10° e 120°.';
  const { w, h } = c.aspect;
  if (!(Number.isFinite(w) && w > 0) || !(Number.isFinite(h) && h > 0)) return 'A proporção da câmera deve ter largura e altura maiores que zero.';
  return null;
}

/** Comandos das câmeras de render (com desfazer, como os demais). */
export type RenderCameraCommand =
  | { type: 'addRenderCamera'; camera: RenderCamera }
  | { type: 'updateRenderCamera'; id: Id; patch: Partial<Omit<RenderCamera, 'id'>> }
  | { type: 'removeRenderCamera'; id: Id }
  | { type: 'setRenderCameraOrder'; ids: Id[] };

const semId = ({ id: _id, ...resto }: RenderCamera): Omit<RenderCamera, 'id'> => resto;

/**
 * Aplica um comando de câmera de render sobre o rascunho do projeto. Lança Error em pt-BR se recusar. Remover uma
 * câmera não altera pranchas (a câmera de render não é usada por pranchas nesta fase).
 */
export function applyRenderCameraCommand(p: Project, c: RenderCameraCommand): void {
  switch (c.type) {
    case 'addRenderCamera': {
      if (projectRenderCameras(p).some((x) => x.id === c.camera.id)) throw new Error('Câmera de render já existe');
      const nova = clonar({ ...c.camera, name: c.camera.name.trim() });
      const issue = renderCameraIssue(semId(nova), p);
      if (issue) throw new Error(issue);
      p.renderCameras = [...projectRenderCameras(p), nova];
      break;
    }
    case 'updateRenderCamera': {
      const atual = renderCameraOf(p, c.id);
      if (!atual) throw new Error('Câmera de render inexistente');
      const merged = clonar({
        ...atual,
        ...(c.patch.name !== undefined ? { name: c.patch.name.trim() } : {}),
        ...(c.patch.levelId !== undefined ? { levelId: c.patch.levelId } : {}),
        ...(c.patch.position !== undefined ? { position: c.patch.position } : {}),
        ...(c.patch.target !== undefined ? { target: c.patch.target } : {}),
        ...(c.patch.fovDeg !== undefined ? { fovDeg: c.patch.fovDeg } : {}),
        ...(c.patch.aspect !== undefined ? { aspect: c.patch.aspect } : {}),
      });
      const issue = renderCameraIssue(semId(merged), p);
      if (issue) throw new Error(issue);
      p.renderCameras = projectRenderCameras(p).map((x) => (x.id === c.id ? merged : x));
      break;
    }
    case 'removeRenderCamera': {
      if (!renderCameraOf(p, c.id)) throw new Error('Câmera de render inexistente');
      p.renderCameras = projectRenderCameras(p).filter((x) => x.id !== c.id);
      break;
    }
    case 'setRenderCameraOrder': {
      const atuais = projectRenderCameras(p);
      if (c.ids.length !== atuais.length || new Set(c.ids).size !== atuais.length) throw new Error('A ordem das câmeras de render está incompleta.');
      const porId = new Map(atuais.map((x) => [x.id, x]));
      const proximos = c.ids.map((id) => porId.get(id));
      if (proximos.some((x) => x === undefined)) throw new Error('A ordem das câmeras de render cita uma câmera inexistente.');
      p.renderCameras = proximos as RenderCamera[];
      break;
    }
  }
}
