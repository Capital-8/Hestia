import type { SectionResult } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { resolverLista } from '../plan/zoomOps.ts';
import type { PlanDrawList, PlanTheme } from '../plan/types.ts';
import type { Viewport } from '../viewport.ts';
import { buildSectionDrawList } from './build.ts';

/**
 * Quadro da vista de corte/elevação (R4, Fase 2.5).
 *
 * A lista de desenho do corte não depende mais do pan/zoom: as espessuras vão com o peso de papel (`papel`) e a hachura
 * com `zoomMin`, então o shader aplica o zoom corrente. Com isso a lista é montada **uma vez** por
 * projeto+vista+tema+seleção e reaproveitada em todos os quadros seguintes; pan e zoom só mexem na câmera e no uniform
 * de zoom da cena. A geometria do corte (o `SectionResult` do motor) continua a mesma, e o caminho CPU resolve a lista
 * para o zoom corrente com `resolverLista` (mesmas contas de antes).
 */

/** Entrada do quadro: tudo o que muda a lista, menos a vista (pan, zoom e tamanho). */
export interface SectionFrameInput {
  project: Project;
  /** Versão do projeto no histórico (`editor.store.version`): muda a cada edição. */
  version: number | string;
  sectionId: Id;
  section: SectionResult;
  theme: PlanTheme;
  dark: boolean;
  showGrid: boolean;
  hidden?: ReadonlySet<Id>;
  revealed?: ReadonlySet<Id>;
  annotations?: import('@hestia/model').SectionAnnotations;
  levelExtents?: Record<Id, { a: number; b: number }>;
  highlight?: { selection: Id[]; hover: Id | null; aviso?: Id[] };
  thinLines?: boolean;
}

/** Contadores do caminho de corte, para a bancada (`?debug=1`). */
export interface SectionFrameStats {
  /** Listas montadas na CPU. */
  builds: number;
  /** Quadros que reaproveitaram a lista (pan, zoom, cursor, nova renderização). */
  reuses: number;
  /** Tempo da última montagem e o acumulado (ms). */
  ultimoBuildMs: number;
  totalBuildMs: number;
  /** Listas resolvidas para o zoom corrente (só no caminho CPU). */
  resolvidos: number;
}

/**
 * Identidade do resultado do corte. O cálculo roda em segundo plano: o commit já subiu a versão do projeto e a tela
 * desenhou o resultado anterior; quando o novo chega, projeto e versão continuam os mesmos. Sem esta identidade na
 * chave, o quadro reutilizaria a lista antiga e a janela alinhada só apareceria no próximo movimento/tecla.
 */
let proximoNumeroDeSecao = 1;
const numeroDaSecao = new WeakMap<SectionResult, number>();
function identidadeDaSecao(section: SectionResult): number {
  let id = numeroDaSecao.get(section);
  if (id === undefined) {
    id = proximoNumeroDeSecao++;
    numeroDaSecao.set(section, id);
  }
  return id;
}

/**
 * Cache do desenho do corte por vista. A chave não tem `cx`, `cy`, `zoom`, `width` nem `height`: mudar a vista não refaz
 * nada. O fundo entra pela cor do tema, e a seleção/cursor pelos ids, como no `PlanFrame` da planta.
 */
export class SectionFrame {
  private project: Project | null = null;
  private base: PlanDrawList | null = null;
  private key = '';
  private zoom = Number.NaN;
  private resolved: PlanDrawList | null = null;
  private builds = 0;
  private reuses = 0;
  private resolvidos = 0;
  private ultimoBuildMs = 0;
  private totalBuildMs = 0;

  /** Esquece a lista: o próximo quadro monta tudo de novo (troca de dispositivo, saída da vista). */
  reset(): void {
    this.project = null;
    this.base = null;
    this.key = '';
    this.zoom = Number.NaN;
    this.resolved = null;
  }

  stats(): SectionFrameStats {
    return { builds: this.builds, reuses: this.reuses, ultimoBuildMs: this.ultimoBuildMs, totalBuildMs: this.totalBuildMs, resolvidos: this.resolvidos };
  }

  /** Chave da geometria: projeto, vista, tema, opções de desenho e o que a seleção/cursor acrescentam. */
  static keyOf(i: SectionFrameInput): string {
    const hl = i.highlight;
    const sel = hl && hl.selection.length > 0 ? hl.selection.join(',') : '';
    const hid = i.hidden?.size ? `h:${[...i.hidden].sort().join(',')}` : '';
    const rev = i.revealed?.size ? `r:${[...i.revealed].sort().join(',')}` : '';
    const ann = i.annotations ? JSON.stringify(i.annotations) : '';
    const ext = i.levelExtents ? JSON.stringify(i.levelExtents) : '';
    return [i.version, i.sectionId, identidadeDaSecao(i.section), i.theme.bg, i.theme.ink, i.dark ? 'd' : 'l', i.showGrid ? 'g' : '-', i.thinLines ? 't' : '-', hid, rev, ann, ext, sel, hl?.hover ?? '', (hl?.aviso ?? []).join(',')].join('|');
  }

  /**
   * Lista de desenho da vista. Com GPU, a lista base volta como está: o shader aplica `papel`/`zoomMin` com o zoom
   * corrente. Sem GPU, o Canvas2D recebe a lista já resolvida para o zoom (e ela é cacheada por zoom).
   */
  drawList(input: SectionFrameInput, v: Viewport, gpu: boolean): PlanDrawList {
    const key = SectionFrame.keyOf(input);
    if (this.base === null || this.project !== input.project || this.key !== key) {
      const t0 = performance.now();
      this.project = input.project;
      this.key = key;
      this.base = buildSectionDrawList({
        project: input.project,
        section: input.section,
        // O zoom só entra no `widthPx` de segurança: quem manda na espessura é `papel` (GPU e `larguraEmPx`).
        viewport: v,
        theme: input.theme,
        dark: input.dark,
        showGrid: input.showGrid,
        hidden: input.hidden,
        revealed: input.revealed,
        annotations: input.annotations,
        levelExtents: input.levelExtents,
        highlight: input.highlight,
        thinLines: input.thinLines,
      });
      this.ultimoBuildMs = performance.now() - t0;
      this.totalBuildMs += this.ultimoBuildMs;
      this.builds++;
      this.zoom = Number.NaN;
      this.resolved = null;
    } else {
      this.reuses++;
    }
    if (gpu) return this.base;
    if (this.resolved === null || this.zoom !== v.zoom) {
      this.resolved = resolverLista(this.base, v.zoom);
      this.zoom = v.zoom;
      this.resolvidos++;
    }
    return this.resolved;
  }
}

/** Cache da vista de corte do app (uma só: a tela mostra uma vista por vez). */
export const sectionFrame = new SectionFrame();
