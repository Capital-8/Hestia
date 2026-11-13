import type { DialogContribution, PluginAction, PluginText } from './contributesTypes.ts';
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
}
