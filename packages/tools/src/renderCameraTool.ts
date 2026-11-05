import type { Vec2 } from '@hestia/geom';
import { defaultRenderCameraName, makeRenderCamera } from '@hestia/model';
import { ToolBase } from './base.ts';
import { ASPECT_CAMERA_PADRAO, DISTANCIA_CAMERA_M, FOV_CAMERA_PADRAO_DEG, alturaDoOlho, alvoAPartirDaDirecao, direcaoDaCamera, poligonoDoCone } from './renderCameraGeometria.ts';
import type { PointerInfo } from './types.ts';

/** Distância mínima (m) entre a posição e o cursor para a direção ser válida. */
const DIRECAO_MIN_M = 0.05;
/** Meio ângulo (rad) das setas da direção: 30° para trás do eixo. */
const SETA_MEIO_RAD = Math.PI / 6;
/** Comprimento (m) das setas da direção. */
const SETA_M = 0.6;

/**
 * Ferramenta Câmera de render (estilo Revit: Camera), só na planta.
 *
 * Clique 1 fixa a posição (x, y) no plano; a altura do olho vem da elevação do nível ativo + 1,6 m (`alturaDoOlho`).
 * O cursor define a direção: a prévia mostra o cone de visão (FOV horizontal de 60°) e a seta até o alvo, a 10 m, à
 * altura do olho (olha na horizontal). Clique 2 ou Enter confirma; Esc cancela. A câmera nasce no nível ativo, com
 * proporção 16:9 e nome padrão ("Câmera 1", "Câmera 2"…). Erros do modelo vão para a barra de status.
 */
export class RenderCameraTool extends ToolBase {
  readonly id = 'renderCamera';
  readonly label = 'Câmera de render';
  readonly hint = 'Câmera de render: clique a posição na planta e depois clique para onde ela olha. Enter confirma, Esc cancela.';
  /** Posição confirmada no clique 1 (x, y). */
  private pos: Vec2 | null = null;
  /** Último ângulo da direção (rad, plano XY); o Enter usa este valor. */
  private angulo = 0;

  protected reset(): void {
    this.pos = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.pos !== null;
  }

  override start(): void {
    this.reset();
    if (this.env.section?.()) {
      this.env.say('Câmera de render só funciona na planta. Volte à planta do nível.');
      return;
    }
    this.env.say(this.hint);
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.items = [];
    this.inf = null;
    if (this.env.section?.()) return;
    if (!this.pos) {
      this.snap(p);
      return;
    }
    this.atualizarDirecao(p.raw);
    const pos = this.pos;
    const ring = poligonoDoCone(pos, this.angulo, FOV_CAMERA_PADRAO_DEG, DISTANCIA_CAMERA_M);
    const alvo = alvoAPartirDaDirecao(pos, this.angulo, DISTANCIA_CAMERA_M, 0);
    const alvoXY: Vec2 = { x: alvo.x, y: alvo.y };
    this.items.push({ kind: 'polygon', ring });
    this.items.push({ kind: 'line', a: pos, b: alvoXY });
    for (const sinal of [1, -1]) {
      const a = this.angulo + Math.PI + sinal * SETA_MEIO_RAD;
      this.items.push({ kind: 'line', a: alvoXY, b: { x: alvoXY.x + SETA_M * Math.cos(a), y: alvoXY.y + SETA_M * Math.sin(a) } });
    }
    this.items.push({ kind: 'point', at: pos });
    this.items.push({ kind: 'label', at: alvoXY, text: `${defaultRenderCameraName(this.env.project())} · ${FOV_CAMERA_PADRAO_DEG}°` });
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    if (this.env.section?.()) {
      this.env.say('Câmera de render só funciona na planta. Volte à planta do nível.');
      return;
    }
    if (!this.pos) {
      this.pos = this.snap(p).point;
      this.env.say('Clique para onde a câmera olha. Enter confirma a última direção, Esc cancela.');
      return;
    }
    if (Math.hypot(p.raw.x - this.pos.x, p.raw.y - this.pos.y) < DIRECAO_MIN_M) {
      this.env.say('Afaste o cursor da posição da câmera para definir a direção.');
      return;
    }
    this.atualizarDirecao(p.raw);
    this.criar();
  }

  /** Enter: confirma com a direção da última prévia. Sem posição, nada a confirmar. */
  override confirm(): void {
    if (this.pos) this.criar();
  }

  private atualizarDirecao(cursor: Vec2): void {
    if (!this.pos) return;
    if (Math.hypot(cursor.x - this.pos.x, cursor.y - this.pos.y) < DIRECAO_MIN_M) return;
    this.angulo = direcaoDaCamera(this.pos, cursor).angulo;
  }

  /** Grava a câmera no nível ativo. Altura: elevação do nível + 1,6 m (sem nível, 1,6 m). O alvo olha na horizontal. */
  private criar(): void {
    const pos = this.pos;
    if (!pos) return;
    const p = this.env.project();
    const levelId = this.env.levelId();
    const nivel = p.levels.find((l) => l.id === levelId);
    const z = alturaDoOlho(nivel?.elevation ?? Number.NaN);
    const camera = makeRenderCamera(
      {
        levelId,
        position: { x: pos.x, y: pos.y, z },
        target: alvoAPartirDaDirecao(pos, this.angulo, DISTANCIA_CAMERA_M, z),
        fovDeg: FOV_CAMERA_PADRAO_DEG,
        aspect: { ...ASPECT_CAMERA_PADRAO },
      },
      defaultRenderCameraName(p),
    );
    try {
      this.env.transaction('Criar câmera de render', () => this.env.exec({ type: 'addRenderCamera', camera }));
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : String(e));
      return;
    }
    this.reset();
    this.env.say(`${camera.name} criada no nível ${nivel?.name ?? ''}. Clique na próxima posição ou Esc sai.`);
  }
}
