/**
 * Quantitativos de suplementos no app (ADR 0057, spec 08 §4, fase E): do registro à tabela e ao arquivo CSV.
 * A tela (`ui/PluginSchedule.tsx`) só desenha o que sai daqui.
 */
import type { RegisteredSchedule } from '@hestia/plugin-api';
import { buildSchedule, scheduleInProjectUnits, scheduleToCsv, type PluginScheduleSpec, type Project, type ResolvedUnits, type ScheduleTable } from '@hestia/model';
import type { Lang } from '../editor/i18n.ts';
import { txt } from '../ui/ribbon/model.ts';

/** Quantitativo registrado -> especificação do modelo (títulos no idioma ativo). */
export function scheduleSpecOf(s: RegisteredSchedule, lang: Lang): PluginScheduleSpec {
  return {
    pluginId: s.pluginId, id: s.id, title: txt(s.title, lang), source: s.source,
    columns: s.columns.map((c) => ({ key: c.key, title: txt(c.title, lang), expr: c.expr, ...(c.unit ? { unit: c.unit } : {}), ...(c.total ? { total: c.total } : {}) })),
    ...(s.filter !== undefined ? { filter: s.filter } : {}),
    ...(s.groupBy ? { groupBy: s.groupBy } : {}),
  };
}

export const buildPluginSchedule = (p: Project, s: RegisteredSchedule, lang: Lang): { spec: PluginScheduleSpec; table: ScheduleTable } => {
  const spec = scheduleSpecOf(s, lang);
  return { spec, table: buildSchedule(p, spec) };
};

/** Idiomas que usam vírgula decimal: o CSV sai com `;` e vírgula decimal (abre direto no Excel); inglês usa `,` e ponto. */
export const csvOptionsFor = (lang: Lang, totalsLabel: string): { separator: ',' | ';'; decimalComma: boolean; totalsLabel: string } =>
  lang === 'en' ? { separator: ',', decimalComma: false, totalsLabel } : { separator: ';', decimalComma: true, totalsLabel };

const BOM = String.fromCharCode(0xfeff);

/** Conteúdo e nome do CSV (com BOM UTF-8 para o Excel reconhecer acentos); com `units`, valores nas unidades do projeto. */
export function scheduleCsvFile(s: RegisteredSchedule, table: ScheduleTable, lang: Lang, totalsLabel: string, units?: ResolvedUnits): { nome: string; conteudo: string } {
  const out = units ? scheduleInProjectUnits(table, units) : table;
  const slug = `${s.pluginId}-${s.id}`.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  return { nome: `${slug}.csv`, conteudo: `${BOM}${scheduleToCsv(out, csvOptionsFor(lang, totalsLabel))}` };
}
