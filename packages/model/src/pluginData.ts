import type { Id, Project } from './types.ts';

/**
 * Dados de plugins gravados no arquivo do projeto (docs/plugins). Dois usos, ambos opcionais (ausente = nenhum):
 *  - `projectUid`: ID estável do projeto para os plugins (não muda ao renomear nem ao salvar noutro arquivo);
 *  - `viewOverrides`: substituições de material SÓ de visualização, por plugin e por id do material de ORIGEM.
 *    O material do projeto (`Project.materials`) nunca é alterado por elas.
 */
export interface ViewMaterialOverrideData {
  color?: string;
  opacity?: number;
  gloss?: number;
  params?: Record<string, number | string | boolean>;
}

export interface PluginProjectData {
  projectUid?: string;
  viewOverrides?: Record<string, Record<Id, ViewMaterialOverrideData>>;
}

export type PluginDataCommand =
  | { type: 'ensurePluginProjectUid'; uid: string }
  | { type: 'setPluginViewOverride'; pluginId: string; materialId: Id; override: ViewMaterialOverrideData }
  | { type: 'clearPluginViewOverride'; pluginId: string; materialId: Id };

export const pluginProjectUid = (p: Pick<Project, 'plugins'>): string | undefined => p.plugins?.projectUid;

export const pluginViewOverrides = (p: Pick<Project, 'plugins'>, pluginId: string): Record<Id, ViewMaterialOverrideData> => p.plugins?.viewOverrides?.[pluginId] ?? {};

const HEX = /^#[0-9a-fA-F]{6}$/;
const unit = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

/** Normaliza e valida; lança Error se algo for inválido (o editor mostra a mensagem). */
function cleanOverride(o: ViewMaterialOverrideData): ViewMaterialOverrideData {
  const out: ViewMaterialOverrideData = {};
  if (o.color !== undefined) { if (!HEX.test(o.color)) throw new Error('Cor inválida (use #rrggbb).'); out.color = o.color.toLowerCase(); }
  if (o.opacity !== undefined) { if (!unit(o.opacity)) throw new Error('Opacidade deve estar entre 0 e 1.'); out.opacity = o.opacity; }
  if (o.gloss !== undefined) { if (!unit(o.gloss)) throw new Error('Brilho deve estar entre 0 e 1.'); out.gloss = o.gloss; }
  if (o.params !== undefined) {
    const entries = Object.entries(o.params);
    if (entries.length > 32) throw new Error('Parâmetros demais (máximo 32).');
    const params: Record<string, number | string | boolean> = {};
    for (const [k, v] of entries) {
      if (k.length > 40 || (typeof v === 'string' && v.length > 200) || !['number', 'string', 'boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(`Parâmetro "${k}" inválido.`);
      params[k] = v;
    }
    out.params = params;
  }
  return out;
}

export function applyPluginDataCommand(p: Project, c: PluginDataCommand): void {
  switch (c.type) {
    case 'ensurePluginProjectUid':
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(c.uid)) throw new Error('ID de projeto inválido.');
      if (!p.plugins?.projectUid) p.plugins = { ...p.plugins, projectUid: c.uid };
      break;
    case 'setPluginViewOverride': {
      if (!p.materials[c.materialId]) throw new Error(`Material de origem inexistente: ${c.materialId}`);
      const o = cleanOverride(c.override);
      const all = { ...p.plugins?.viewOverrides };
      all[c.pluginId] = { ...all[c.pluginId], [c.materialId]: o };
      p.plugins = { ...p.plugins, viewOverrides: all };
      break;
    }
    case 'clearPluginViewOverride': {
      const mine = p.plugins?.viewOverrides?.[c.pluginId];
      if (!mine || !(c.materialId in mine)) break;
      const { [c.materialId]: _drop, ...rest } = mine;
      void _drop;
      const all = { ...p.plugins!.viewOverrides, [c.pluginId]: rest };
      p.plugins = { ...p.plugins, viewOverrides: all };
      break;
    }
  }
}
