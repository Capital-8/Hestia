import type { Vec2 } from '@hestia/geom';
import { ToolBase } from './base.ts';
import { contextoDeTraco } from './desenhoPolilinha.ts';
import { pickAt } from './pick.ts';
import type { PointerInfo, PreviewItem, ToolEnv } from './types.ts';

/**
 * Ferramenta interativa de suplemento (docs/plugins/08 §4 `tools`, fase H). O host captura cliques e posições com os
 * snaps do app e os entrega ao handler do suplemento (que roda num Worker, por isso assíncrono) por uma PONTE; a resposta
 * traz o rascunho de prévia e, ao confirmar, um lote de comandos que a ponte aplica pela porta de escrita (um passo de
 * desfazer). Este pacote não conhece o `plugin-api` (fronteira entre pacotes): os tipos abaixo são estruturais e a ponte,
 * em `apps/web/src/plugins/toolBridge.ts`, valida tudo o que vem do suplemento antes de chegar aqui.
 */

export type PluginToolPromptKind = 'point' | 'line' | 'polyline' | 'pick-element';
export interface PluginToolPrompt { key: string; kind: PluginToolPromptKind; label: string }

/** Rascunho já validado e limitado pela ponte. Coordenadas em metro. */
export interface PluginToolDraft {
  lines: Array<{ a: Vec2; b: Vec2; dashed?: boolean }>;
  points: Vec2[];
  labels: Array<{ at: Vec2; text: string }>;
}

export interface PluginToolReply {
  draft?: PluginToolDraft;
  commit?: { label: string; commands: unknown[] };
  message?: string;
  done?: boolean;
}

/** Evento enviado ao handler (forma idêntica à de `ToolEvent` do plugin-api; o `start` é enviado pela ponte). */
export type PluginToolEvent = { type: string; [k: string]: unknown };

export interface PluginToolBridge {
  /** Entrega um evento ao handler. Rejeita se o handler falhou (a ferramenta vira `failed`, o app segue). */
  send(event: PluginToolEvent): Promise<PluginToolReply>;
  /** Aplica o lote pela porta de escrita: atômico, um passo de desfazer. */
  apply(label: string, commands: unknown[]): { ok: true; applied: number } | { ok: false; error: string };
}

export interface PluginToolSpec {
  /** Id qualificado `<pluginId>:<toolId>`. */
  id: string;
  title: string;
  prompts: PluginToolPrompt[];
  /** Valores validados do diálogo que abriu a ferramenta (metro e radiano). */
  values?: Record<string, unknown>;
  /** Textos de interface já traduzidos pelo app. */
  messages: { failed: string; nothingToPick: string };
  /** Pede ao app que redesenhe a prévia (as respostas chegam fora do ciclo de eventos do ponteiro). */
  redraw: () => void;
}

type Collected = Vec2 | Vec2[] | { elementId: string };

export class PluginTool extends ToolBase {
  readonly id = 'plugin';
  readonly label: string;
  private idx = 0;
  private collected: Record<string, Collected> = {};
  private poly: Vec2[] = [];
  private chain: Promise<void> = Promise.resolve();
  private moveSlot: { ev: PluginToolEvent } | null = null;
  /** Cresce a cada reinício/cancelamento: respostas de eventos antigos são ignoradas. */
  private epoch = 0;
  private dead = false;
  /** Verdadeiro depois que o handler falhou: a ferramenta se encerra e o app segue normal. */
  failed = false;

  constructor(env: ToolEnv, private readonly spec: PluginToolSpec, private readonly bridge: PluginToolBridge) {
    super(env);
    this.label = spec.title;
  }

  override get hint(): string {
    return this.spec.prompts[this.idx]?.label ?? this.spec.title;
  }

  private get prompt(): PluginToolPrompt | undefined {
    return this.spec.prompts[this.idx];
  }

  override start(): void {
    super.start();
    this.post({ type: 'start', tool: this.spec.id, prompts: this.spec.prompts.map((p) => ({ key: p.key, kind: p.kind })), ...(this.spec.values ? { values: this.spec.values } : {}) });
  }

  protected reset(): void {
    this.idx = 0;
    this.collected = {};
    this.poly = [];
    this.items = [];
    this.inf = null;
    this.epoch++;
  }

  protected busy(): boolean {
    return this.idx > 0 || this.poly.length > 0 || Object.keys(this.collected).length > 0;
  }

  // ---- fila serial de eventos (o handler vê os eventos na ordem; movimentos seguidos se fundem no último) ----

  private post(ev: PluginToolEvent, quiet = false): void {
    this.moveSlot = null;
    this.chain = this.chain.then(() => this.run(ev, quiet));
  }

  private postMove(ev: PluginToolEvent): void {
    if (this.moveSlot) {
      this.moveSlot.ev = ev;
      return;
    }
    const slot = { ev };
    this.moveSlot = slot;
    this.chain = this.chain.then(() => {
      if (this.moveSlot === slot) this.moveSlot = null;
      return this.run(slot.ev, false);
    });
  }

  private async run(ev: PluginToolEvent, quiet: boolean): Promise<void> {
    if (this.dead || this.failed) return;
    const epoch = this.epoch;
    try {
      const reply = await this.bridge.send(ev);
      if (quiet) return;
      // Ferramenta já encerrada (troca de ferramenta): o clique que confirmou o lote já foi dado, então o lote é aplicado; o resto é descartado.
      if (this.dead) { if (reply.commit) this.bridge.apply(reply.commit.label, reply.commit.commands); return; }
      if (epoch !== this.epoch) return;
      this.handle(reply);
    } catch {
      if (this.dead) return;
      this.fail();
    }
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.items = [];
    this.env.say(this.spec.messages.failed);
    this.spec.redraw();
    this.env.done();
  }

  private handle(r: PluginToolReply): void {
    if (r.draft) {
      this.items = this.draftItems(r.draft);
    }
    if (r.message) this.env.say(r.message);
    if (r.commit) {
      const res = this.bridge.apply(r.commit.label, r.commit.commands);
        this.items = [];
      this.env.say(res.ok ? this.hint : res.error);
    }
    this.spec.redraw();
    if (r.done) this.env.done();
  }

  private draftItems(d: PluginToolDraft): PreviewItem[] {
    return [
      ...d.lines.map((l): PreviewItem => ({ kind: 'line', a: l.a, b: l.b, dashed: l.dashed ?? true })),
      ...d.points.map((at): PreviewItem => ({ kind: 'point', at })),
      ...d.labels.map((l): PreviewItem => ({ kind: 'label', at: l.at, text: l.text })),
    ];
  }

  // ---- entrada do usuário ----

  private last(): Vec2 | null {
    return this.poly[this.poly.length - 1] ?? null;
  }

  override move(p: PointerInfo): void {
    if (this.failed) return;
    const q = this.snap(p, contextoDeTraco(this.last())).point;
    this.postMove({ type: 'move', key: this.prompt?.key ?? '', point: { x: q.x, y: q.y }, collected: { ...this.collected } });
  }

  override click(p: PointerInfo): void {
    const pr = this.prompt;
    if (this.failed || !pr) return;
    if (pr.kind === 'pick-element') {
      const hit = pickAt(this.env.project(), this.env.levelId(), p.raw, this.env.metersPerPixel());
      if (!hit) { this.env.say(this.spec.messages.nothingToPick); return; }
      this.collected[pr.key] = { elementId: hit.id };
      this.advance(pr, p.raw, hit.id);
      return;
    }
    const q = this.snap(p, contextoDeTraco(this.last())).point;
    const pt = { x: q.x, y: q.y };
    if (pr.kind === 'point') {
      this.collected[pr.key] = pt;
      this.advance(pr, pt);
    } else if (pr.kind === 'line') {
      this.poly.push(pt);
      if (this.poly.length < 2) this.sendPoint(pr, pt, false);
      else { this.collected[pr.key] = [...this.poly]; this.advance(pr, pt); }
    } else {
      this.poly.push(pt);
      this.sendPoint(pr, pt, false); // polilinha: cada clique vai ao handler; Enter encerra o passo
    }
  }

  /** Conclui o passo atual (ponto, linha, elemento ou polilinha) e passa ao próximo; o último conclui o ciclo. */
  private advance(pr: PluginToolPrompt, pt: Vec2, elementId?: string): void {
    this.poly = [];
    this.idx++;
    const complete = this.idx >= this.spec.prompts.length;
    this.sendPoint(pr, pt, complete, elementId);
    if (complete) { this.idx = 0; this.collected = {}; this.items = []; }
    this.env.say(this.hint);
  }

  private sendPoint(pr: PluginToolPrompt, pt: Vec2, complete: boolean, elementId?: string): void {
    this.post({
      type: 'point', key: pr.key, kind: pr.kind, point: { x: pt.x, y: pt.y }, ...(elementId ? { elementId } : {}),
      complete, collected: { ...this.collected, ...(pr.kind === 'polyline' && !complete ? { [pr.key]: [...this.poly] } : {}) },
    });
  }

  override confirm(): void {
    const pr = this.prompt;
    if (this.failed) return;
    if (pr?.kind === 'polyline' && this.poly.length >= 2) {
      this.collected[pr.key] = [...this.poly];
      this.advance(pr, this.poly[this.poly.length - 1]!);
      return;
    }
    this.post({ type: 'key', key: 'Enter' });
  }

  override tab(): void {
    if (!this.failed) this.post({ type: 'key', key: 'Tab' });
  }

  override space(): void {
    if (!this.failed) this.post({ type: 'key', key: 'Space' });
  }

  /** Esc: cancela o passo em andamento (o handler é avisado); sem passo em andamento, sai da ferramenta. */
  override cancel(): void {
    const estava = this.busy();
    this.reset();
    this.post({ type: 'cancel' }, true);
    this.spec.redraw();
    if (estava) this.env.say(this.hint);
    else this.env.done();
  }

  /** Encerra a ferramenta: respostas que chegarem depois são ignoradas. */
  dispose(): void {
    this.dead = true;
  }
}
