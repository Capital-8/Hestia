import type { CheckContribution, DialogContribution, ExporterContribution, ImporterContribution, PanelContribution, PluginAction, PluginText, ScheduleContribution, ToolContribution } from './contributesTypes.ts';
import { POINT_CAPABILITY } from './contributesTypes.ts';
import type { PluginManifestV2 } from './manifestV2.ts';
import type { CapabilityV2 } from './permissions.ts';

/**
 * Registro de contribuições (spec 08 §4): guarda o que cada suplemento ATIVO acrescenta ao Hestia e entrega listas já
 * resolvidas (ids qualificados `<pluginId>:<id>`, permissão conferida). Só dados: não executa comando algum, não importa
 * store nem React (a ligação com a interface fica em `apps/web/src/plugins/registry.ts`).
 */

/** Id exposto pelo host: `<pluginId>:<id>`. O `pluginId` não contém `:` (reverso-DNS), então a separação é inequívoca. */
export const qualifiedId = (pluginId: string, id: string): string => `${pluginId}:${id}`;

export interface RegisteredCommand {
  qid: string; pluginId: string; pluginName: string; id: string; title: PluginText; keywords: string[]; run: PluginAction;
}
export interface RegisteredRibbonItem { commandQid: string; title: PluginText; size: 'large' | 'small'; icon?: string }
export interface RegisteredRibbonPanel { qid: string; pluginId: string; pluginName: string; id: string; title: PluginText; items: RegisteredRibbonItem[] }
export interface RegisteredDialog extends Omit<DialogContribution, 'id'> { qid: string; pluginId: string; pluginName: string; id: string }

export interface RegisteredImporter extends Omit<ImporterContribution, 'id'> { qid: string; pluginId: string; pluginName: string; id: string }
export interface RegisteredExporter extends Omit<ExporterContribution, 'id'> { qid: string; pluginId: string; pluginName: string; id: string }
export interface RegisteredCheck extends Omit<CheckContribution, 'id'> { qid: string; pluginId: string; pluginName: string; id: string }
export interface RegisteredSchedule extends Omit<ScheduleContribution, 'id'> { qid: string; pluginId: string; pluginName: string; id: string }
export interface RegisteredTool extends Omit<ToolContribution, 'id'> { qid: string; pluginId: string; pluginName: string; id: string }
export interface RegisteredPanel extends Omit<PanelContribution, 'id'> { qid: string; pluginId: string; pluginName: string; id: string }

interface Entry { manifest: PluginManifestV2; grants: Set<CapabilityV2> }

export class ContributionRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly subs = new Set<() => void>();
  private ver = 0;

  /** Cresce a cada mudança: serve de "foto" para `useSyncExternalStore`. */
  version(): number { return this.ver; }

  subscribe(cb: () => void): () => void { this.subs.add(cb); return () => { this.subs.delete(cb); }; }

  private changed(): void {
    this.ver++;
    for (const cb of [...this.subs]) {
      try { cb(); } catch { /* um assinante com defeito não derruba os demais */ }
    }
  }

  /** Registra (ou substitui) um suplemento com as permissões CONCEDIDAS; contribuição sem permissão concedida fica de fora. */
  register(manifest: PluginManifestV2, grants: readonly CapabilityV2[]): void {
    this.entries.set(manifest.id, { manifest, grants: new Set(grants) });
    this.changed();
  }

  /** Muda as concessões de um suplemento já registrado. */
  setGrants(pluginId: string, grants: readonly CapabilityV2[]): void {
    const e = this.entries.get(pluginId);
    if (!e) return;
    e.grants = new Set(grants);
    this.changed();
  }

  /** Retira todas as contribuições do suplemento (desativar, desinstalar ou falha). */
  unregister(pluginId: string): void {
    if (this.entries.delete(pluginId)) this.changed();
  }

  has(pluginId: string): boolean { return this.entries.has(pluginId); }
  pluginIds(): string[] { return [...this.entries.keys()]; }

  private granted(e: Entry, point: keyof typeof POINT_CAPABILITY): boolean { return e.grants.has(POINT_CAPABILITY[point]); }

  commands(): RegisteredCommand[] {
    const out: RegisteredCommand[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'commands')) continue;
      for (const c of e.manifest.contributes.commands ?? []) {
        out.push({ qid: qualifiedId(e.manifest.id, c.id), pluginId: e.manifest.id, pluginName: e.manifest.name, id: c.id, title: c.title, keywords: c.keywords ?? [], run: c.run });
      }
    }
    return out;
  }

  command(qid: string): RegisteredCommand | undefined { return this.commands().find((c) => c.qid === qid); }

  /** Painéis da aba Suplementos (sempre essa aba: o suplemento não a escolhe). Botão cujo comando não existe é descartado. */
  ribbonPanels(): RegisteredRibbonPanel[] {
    const out: RegisteredRibbonPanel[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'ribbon') || !this.granted(e, 'commands')) continue;
      const cmds = new Map((e.manifest.contributes.commands ?? []).map((c) => [c.id, c]));
      for (const p of e.manifest.contributes.ribbon?.panels ?? []) {
        const items: RegisteredRibbonItem[] = [];
        for (const it of p.items) {
          const c = cmds.get(it.command);
          if (c) items.push({ commandQid: qualifiedId(e.manifest.id, c.id), title: c.title, size: it.size ?? 'large', ...(it.icon ? { icon: it.icon } : {}) });
        }
        if (items.length) out.push({ qid: qualifiedId(e.manifest.id, p.id), pluginId: e.manifest.id, pluginName: e.manifest.name, id: p.id, title: p.title, items });
      }
    }
    return out;
  }

  dialogs(): RegisteredDialog[] {
    const out: RegisteredDialog[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'dialogs')) continue;
      for (const d of e.manifest.contributes.dialogs ?? []) {
        out.push({ ...d, qid: qualifiedId(e.manifest.id, d.id), pluginId: e.manifest.id, pluginName: e.manifest.name });
      }
    }
    return out;
  }

  dialog(qid: string): RegisteredDialog | undefined { return this.dialogs().find((d) => d.qid === qid); }

  /** Importadores (permissão `io.import`; só chegam ao registro os de runtime script/external, pelo validador do manifesto). */
  importers(): RegisteredImporter[] {
    const out: RegisteredImporter[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'importers')) continue;
      for (const i of e.manifest.contributes.importers ?? []) out.push({ ...i, qid: qualifiedId(e.manifest.id, i.id), pluginId: e.manifest.id, pluginName: e.manifest.name });
    }
    return out;
  }

  // SUPLEMENTOS (fase H): ferramentas e painéis laterais.
  tools(): RegisteredTool[] {
    const out: RegisteredTool[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'tools')) continue;
      for (const t of e.manifest.contributes.tools ?? []) out.push({ ...t, qid: qualifiedId(e.manifest.id, t.id), pluginId: e.manifest.id, pluginName: e.manifest.name });
    }
    return out;
  }

  tool(qid: string): RegisteredTool | undefined { return this.tools().find((t) => t.qid === qid); }

  /** Verificações (exige `checks.run` concedida). */
  checks(): RegisteredCheck[] {
    const out: RegisteredCheck[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'checks')) continue;
      for (const c of e.manifest.contributes.checks ?? []) out.push({ ...c, qid: qualifiedId(e.manifest.id, c.id), pluginId: e.manifest.id, pluginName: e.manifest.name });
    }
    return out;
  }

  panels(): RegisteredPanel[] {
    const out: RegisteredPanel[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'panels')) continue;
      for (const p of e.manifest.contributes.panels ?? []) out.push({ ...p, qid: qualifiedId(e.manifest.id, p.id), pluginId: e.manifest.id, pluginName: e.manifest.name });
    }
    return out;
  }

  /** Exportadores (permissão `io.export`; handler de script/external ou `template` declarativo). */
  exporters(): RegisteredExporter[] {
    const out: RegisteredExporter[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'exporters')) continue;
      for (const x of e.manifest.contributes.exporters ?? []) out.push({ ...x, qid: qualifiedId(e.manifest.id, x.id), pluginId: e.manifest.id, pluginName: e.manifest.name });
    }
    return out;
  }

  /** Quantitativos (exige `content.schedules` concedida). */
  schedules(): RegisteredSchedule[] {
    const out: RegisteredSchedule[] = [];
    for (const e of this.entries.values()) {
      if (!this.granted(e, 'schedules')) continue;
      for (const s of e.manifest.contributes.schedules ?? []) out.push({ ...s, qid: qualifiedId(e.manifest.id, s.id), pluginId: e.manifest.id, pluginName: e.manifest.name });
    }
    return out;
  }

  /** O suplemento tem esta permissão concedida agora? (o host confere a cada uso). */
  isGranted(pluginId: string, cap: CapabilityV2): boolean { return this.entries.get(pluginId)?.grants.has(cap) ?? false; }
  schedule(qid: string): RegisteredSchedule | undefined { return this.schedules().find((s) => s.qid === qid); }

  /** O suplemento registrado tem esta permissão concedida? */
  hasGrant(pluginId: string, cap: CapabilityV2): boolean { return this.entries.get(pluginId)?.grants.has(cap) ?? false; }
}
