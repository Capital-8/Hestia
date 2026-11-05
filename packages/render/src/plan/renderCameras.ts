import { projectRenderCameras, type Id, type Project } from '@hestia/model';
import { DISTANCIA_CAMERA_M, direcaoDaCamera, poligonoDoCone } from '@hestia/tools';
import { cantosDoQuadrado, tracoEm } from './marcadores.ts';
import type { PlanOps, PlanTheme } from './types.ts';

/** Meio ângulo (rad) das setas da câmera desenhada: 30° para trás do eixo. */
const SETA_MEIO_RAD = Math.PI / 6;
/** Comprimento (m) das setas da câmera desenhada na planta. */
const SETA_M = 0.6;

/**
 * Câmeras de render do nível na planta (H13): para cada uma, o cone de visão translúcido (FOV horizontal, mesma conta da
 * ferramenta), a seta da direção até o alvo, o ícone da posição e o nome. A selecionada fica em destaque. Só as câmeras
 * cujo `levelId` é o do nível desenhado; sem câmeras, nada.
 */
export function renderCamerasOps(p: Project, levelId: Id, selecionada: Id | null, theme: PlanTheme): PlanOps {
  const out: PlanOps = { fills: [], strokes: [], labels: [] };
  for (const c of projectRenderCameras(p)) {
    if (c.levelId !== levelId) continue;
    const sel = c.id === selecionada;
    const pos = { x: c.position.x, y: c.position.y };
    const { angulo } = direcaoDaCamera(pos, c.target);
    const ring = poligonoDoCone(pos, angulo, c.fovDeg, DISTANCIA_CAMERA_M);
    const cor = sel ? theme.select : theme.accent;
    out.fills.push({ polygons: [[ring]], color: cor, alpha: sel ? 0.22 : 0.1 });
    out.strokes.push({ pts: ring, closed: true, widthPx: sel ? 2 : 1, color: cor, alpha: 0.9 });
    const ponta = { x: pos.x + DISTANCIA_CAMERA_M * Math.cos(angulo), y: pos.y + DISTANCIA_CAMERA_M * Math.sin(angulo) };
    out.strokes.push({ pts: [pos, ponta], closed: false, widthPx: sel ? 2 : 1.5, color: cor, alpha: 1 });
    const costas = angulo + Math.PI;
    const setas = [costas + SETA_MEIO_RAD, costas - SETA_MEIO_RAD].map((a) => ({ x: ponta.x + SETA_M * Math.cos(a), y: ponta.y + SETA_M * Math.sin(a) }));
    out.strokes.push({ pts: [setas[0]!, ponta, setas[1]!], closed: false, widthPx: sel ? 2 : 1.5, color: cor, alpha: 1 });
    out.strokes.push({ ...tracoEm(pos, cantosDoQuadrado(3), true), widthPx: 1.5, color: cor, alpha: 1 });
    out.labels.push({ at: ponta, text: c.name, dx: 10, dy: -14, tone: sel ? 'accent' : 'info' });
  }
  return out;
}
