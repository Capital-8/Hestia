import { newId, type DetailLine, type DetailRegion, type Dimension, type ElementTag, type Id, type SectionAnnotations, type TextNote, type Wall } from '@hestia/model';
import type { Inference, PointerInfo, PreviewItem, Tool, ToolEnv } from './types.ts';
import { infer, type InferContext } from './infer.ts';
import { floorEdges, floorVertices } from './floorPick.ts';
import { openingSnapGeometry } from './openingSnapPoints.ts';
import { componentSnapIndex } from './componentSnap.ts';
import { cadSnapIndexes } from './snapCad.ts';
import type { Vec2 } from '@hestia/geom';
import { t as translate, type DictKey, type Lang } from './i18n.ts';

/** Implementação comum: Esc em dois passos, inferência e rótulos. */
export abstract class ToolBase implements Tool {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly hint: string;
  protected inf: Inference | null = null;
  protected items: PreviewItem[] = [];
  protected raw: Vec2 = { x: 0, y: 0 };
  /** Último ponteiro entregue à captura: `refreshPreviewAtPointer()` reexecuta a prévia nele quando a vista muda. */
  protected ultimoPonteiro: PointerInfo | null = null;

  constructor(protected env: ToolEnv) {}

  /** Idioma da interface (`env.lang?.() ?? 'pt'`). */
  protected uiLang(): Lang {
    return this.env.lang?.() ?? 'pt';
  }

  /** Texto traduzível da chave no idioma da interface. */
  protected t(key: DictKey, args?: Record<string, string | number>): string {
    return translate(this.uiLang(), key, args);
  }

  start(): void {
    this.reset();
    this.env.say(this.hint);
  }

  protected abstract reset(): void;
  /** Há um passo em andamento que o primeiro Esc deve cancelar? */
  protected abstract busy(): boolean;

  move(_p: PointerInfo): void {}
  click(_p: PointerInfo): void {}
  type(_text: string): boolean {
    return false;
  }
  tab(): void {}
  space(): void {}
  confirm(): void {
    if (this.busy()) {
      this.reset();
      this.env.say(this.hint);
    }
  }

  cancel(): void {
    if (this.busy()) {
      this.reset();
      this.env.say(this.hint);
    } else {
      this.env.done();
    }
  }

  preview(): PreviewItem[] {
    return this.items;
  }

  /**
   * Recalcula a prévia no último ponteiro. O resultado do corte chega em segundo plano: quando é publicado, a ferramenta
   * ainda tem a geometria antiga em `items` e precisa reler a vista sem esperar o próximo movimento do mouse.
   */
  refreshPreviewAtPointer(): void {
    if (this.ultimoPonteiro) this.move(this.ultimoPonteiro);
  }

  inference(): Inference | null {
    return this.inf;
  }

  inputPrompt(): string | null {
    return null;
  }

  protected ctx(extra: Partial<InferContext> = {}): InferContext {
    // Corte/elevação tem prioridade: a vista entrega o contexto em (t, z). A planta continua igual.
    const sec = this.env.section?.();
    if (sec) {
      // As opções globais valem igual na planta: captura, Orto/Polar e incremento polar.
      const options = this.env.options();
      const angle = options.angleMode;
      return sec.inferContext({
        snap: options.snap,
        orthoLock: options.orthoLock || angle?.ortho === true,
        polar: angle?.polar === true,
        polarIncrementDeg: angle?.polarIncrementDeg,
        ...extra,
      });
    }
    const project = this.env.project();
    const levelId = this.env.levelId();
    const hidden = this.env.hiddenInView?.();
    const under = this.env.underlayLevelId?.() ?? null;
    const levelsIn = (l: string): string[] => (under ? [l, under] : [l]);
    const visible = hidden ? (w: Wall) => !hidden.has(w.id) : undefined;
    const levels = levelsIn(levelId);
    // Aberturas entram na captura com cantos, centro e ombreiras; na inserção de abertura (só paredes) ficam de fora.
    const openings = extra.onWallsOnly ? [] : levels.flatMap((l) => openingSnapGeometry(project, l, visible));
    // Escadas, rampas e guarda-corpos entram indexados (vértices, meios, centros e arestas): milhares de pontos custam só o que está perto do cursor.
    const components = extra.onWallsOnly ? [] : levels.map((l) => componentSnapIndex(project, l));
    const options = this.env.options();
    const angle = options.angleMode;
    return {
      project,
      levelId,
      isVisible: visible,
      underlayLevelId: under,
      mpp: this.env.metersPerPixel(),
      gridStep: this.env.gridStep(),
      orthoLock: options.orthoLock || angle?.ortho === true,
      polar: angle?.polar === true,
      polarIncrementDeg: angle?.polarIncrementDeg,
      snap: options.snap,
      ...extra,
      indexed: components,
      ...(hidden ? { hiddenIds: hidden } : {}),
      // Vértices dos pisos do nível entram sempre; os pontos que a ferramenta passa (contorno em construção) somam-se a eles.
      extraPoints: [
        ...levels.flatMap((l) => floorVertices(project, l)),
        ...openings.flatMap((g) => g.points),
        ...(extra.extraPoints ?? []),
      ],
      extraSegments: [
        ...levels.flatMap((l) => floorEdges(project, l)),
        ...openings.flatMap((g) => g.segments),
        ...(extra.extraSegments ?? []),
      ],
      // Desenhos CAD importados visíveis: o que a vista oculta (temporária ou permanentemente) não se captura.
      cad: cadSnapIndexes(project, levels).filter((ix) => !hidden?.has(ix.id)),
    };
  }

  protected snap(p: PointerInfo, extra: Partial<InferContext> = {}): Inference {
    this.raw = p.raw;
    this.ultimoPonteiro = p;
    const ctx = this.ctx({ previous: this.inf, ...extra });
    if (p.shift) ctx.orthoLock = true;
    this.inf = infer(p.raw, ctx);
    return this.inf;
  }
}

export const makeId = newId;

/**
 * Planta de área aberta na vista, quando há uma. As ferramentas de anotação passam este id no comando para
 * gravar a anotação na planta (vista) e não no nível; `undefined` mantém a anotação na planta de piso.
 */
export const viewPlanId = (env: ToolEnv): Id | undefined => env.areaPlanId?.() ?? undefined;

/**
 * Acrescenta uma anotação na vista de corte/elevação ativa, pelo MESMO comando por item da planta (`sectionId`), com
 * validação do modelo e rótulo de desfazer certos. Falso quando a vista ativa não é corte.
 */
function appendSection<K extends keyof SectionAnnotations>(env: ToolEnv, key: K, item: SectionAnnotations[K][number]): boolean {
  const sec = env.section?.();
  if (!sec) return false;
  const levelId = env.levelId();
  const sectionId = sec.id;
  switch (key) {
    case 'dimensions':
      env.exec({ type: 'addDimension', levelId, sectionId, dimension: item as Dimension });
      break;
    case 'texts':
      env.exec({ type: 'addText', levelId, sectionId, text: item as TextNote });
      break;
    case 'detailLines':
      env.exec({ type: 'addDetailLine', levelId, sectionId, item: item as DetailLine });
      break;
    case 'detailRegions':
      env.exec({ type: 'addDetailRegion', levelId, sectionId, item: item as DetailRegion });
      break;
    case 'tags':
      env.exec({ type: 'addTag', levelId, sectionId, item: item as ElementTag });
      break;
  }
  return true;
}

export const addSectionDimension = (env: ToolEnv, item: Dimension): boolean => appendSection(env, 'dimensions', item);
export const addSectionText = (env: ToolEnv, item: TextNote): boolean => appendSection(env, 'texts', item);
export const addSectionDetailLine = (env: ToolEnv, item: DetailLine): boolean => appendSection(env, 'detailLines', item);
export const addSectionDetailRegion = (env: ToolEnv, item: DetailRegion): boolean => appendSection(env, 'detailRegions', item);
export const addSectionTag = (env: ToolEnv, item: ElementTag): boolean => appendSection(env, 'tags', item);
