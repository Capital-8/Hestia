/**
 * Pontos de contribuição do manifesto 2.0 (spec 08 §4), já NORMALIZADOS: só dados, sem código. Textos visíveis chegam
 * resolvidos (`"%chave"` do `i18n` do manifesto vira `{ pt, en }`). Nada aqui executa; quem executa são as fases C a H.
 */

/** Texto visível: uma string vale para os dois idiomas (nomes próprios, siglas) ou `{ pt, en }`. Mesma forma de `Txt` da faixa. */
export type PluginText = string | { pt: string; en: string };

/** JSON puro (sem `undefined`, funções, `NaN`). Usado nos blocos que outras fases interpretam (visão, expressão, tipo). */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export type PluginActionType = 'dialog' | 'tool' | 'exporter' | 'importer' | 'handler' | 'schedule' | 'check';
/** O que um comando faz: abre um diálogo/ferramenta/exportador/importador do próprio suplemento ou chama um handler. */
export interface PluginAction { type: PluginActionType; ref: string }

export interface CommandContribution { id: string; title: PluginText; keywords?: string[]; run: PluginAction }
export interface RibbonItemContribution { command: string; size?: 'large' | 'small'; icon?: string }
export interface RibbonPanelContribution { id: string; title: PluginText; items: RibbonItemContribution[] }
export interface RibbonContribution { panels: RibbonPanelContribution[] }
export interface PanelContribution {
  id: string; title: PluginText; dock: 'properties' | 'browser';
  when?: { kind: string; minSelected?: number }; view: JsonValue;
}
export type DialogFieldType = 'number' | 'text' | 'choice' | 'bool' | 'length' | 'angle';
export interface DialogField {
  key: string; label: PluginText; type: DialogFieldType;
  default?: number | string | boolean; min?: number; max?: number; options?: string[];
}
export interface DialogAction { id: string; label: PluginText; run: PluginAction }
export interface DialogContribution { id: string; title: PluginText; fields: DialogField[]; actions: DialogAction[] }
export type ToolPromptKind = 'point' | 'line' | 'polyline' | 'pick-element';
export interface ToolContribution {
  id: string; title: PluginText; icon?: string;
  prompts: Array<{ key: string; kind: ToolPromptKind; label: PluginText }>; onCommit: string;
}
export interface ImporterContribution { id: string; title: PluginText; extensions: string[]; handler: string }
export interface ExporterContribution { id: string; title: PluginText; extension: string; mime: string; handler?: string; template?: JsonValue }
export type FamilyCategory = 'wall' | 'opening' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'stair' | 'ramp';
export interface FamilyContribution { id: string; category: FamilyCategory; types: Array<{ [k: string]: JsonValue }> }
export interface MaterialContribution { id: string; name: string; color: string; gloss?: number; opacity?: number }
export interface ScheduleColumn { key: string; title: PluginText; expr: JsonValue; unit?: string; total?: 'sum' | 'count' }
export interface ScheduleContribution { id: string; title: PluginText; source: string; columns: ScheduleColumn[]; filter?: JsonValue; groupBy?: string[] }
export type CheckSeverity = 'info' | 'warning' | 'error';
export interface CheckContribution {
  id: string; title: PluginText; severity: CheckSeverity; applyTo: string; message: PluginText; rule?: JsonValue; handler?: string;
}

export interface Contributes {
  commands?: CommandContribution[];
  ribbon?: RibbonContribution;
  panels?: PanelContribution[];
  dialogs?: DialogContribution[];
  tools?: ToolContribution[];
  importers?: ImporterContribution[];
  exporters?: ExporterContribution[];
  families?: FamilyContribution[];
  materials?: MaterialContribution[];
  schedules?: ScheduleContribution[];
  checks?: CheckContribution[];
}

export type ContributionPoint = keyof Contributes;

/** Permissão que cada ponto exige no manifesto (spec 08 §4). */
export const POINT_CAPABILITY = {
  commands: 'ui.commands', ribbon: 'ui.ribbon', panels: 'ui.panels', dialogs: 'ui.dialogs', tools: 'ui.tools',
  importers: 'io.import', exporters: 'io.export', families: 'content.families', materials: 'content.materials',
  schedules: 'content.schedules', checks: 'checks.run',
} as const satisfies Record<ContributionPoint, string>;

/** Limites (spec 08 §4): contagens de entradas e de caracteres; o tamanho do manifesto é em bytes (256 KiB). */
export const CONTRIBUTES_LIMITS = {
  maxEntries: 200, titleChars: 80, messageChars: 200, exprChars: 500, exprDepth: 12, familyTypes: 200, jsonDepth: 16, manifestBytes: 256 * 1024,
} as const;
