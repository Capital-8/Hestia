import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { localizacaoIssue } from './localizacao.ts';
import { copiarTerreno, isTerrain, isTerrainRegion, normalizarBorda, normalizarContorno } from './terrain.ts';
import { aplicarOpsFontes } from './terrainFontes.ts';
import type { Terrain, TerrainRegion } from './terrainTypes.ts';
import { contornoRegiaoIssue, terrainIssue, terrainRegionIssue } from './validateTerrain.ts';
import type { Project } from './types.ts';

/** Comando de terreno, de região e de localização, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type TerrainCommand = Extract<
  Command,
  { type: 'addTerrain' | 'updateTerrain' | 'editTerrainFontes' | 'addTerrainRegion' | 'updateTerrainRegion' | 'setTerrainRegionContorno' | 'setLocalizacao' }
>;

/** Normaliza o sentido da borda e valida; lança com a mensagem do modelo se o terreno for inválido. */
function aceitarTerreno(tn: Terrain, lang: Lang): Terrain {
  const next = { ...tn, ...(tn.borda ? { borda: normalizarBorda(tn.borda) } : {}) };
  const issue = terrainIssue(next, lang);
  if (issue) throw new Error(issue);
  return next;
}

/** Normaliza o sentido do contorno e valida a região no projeto; lança se for inválida. */
function aceitarRegiao(r: TerrainRegion, p: Project, lang: Lang): TerrainRegion {
  const next = { ...r, contorno: normalizarContorno(r.contorno ?? []) };
  const issue = terrainRegionIssue(next, p, lang);
  if (issue) throw new Error(issue);
  return next;
}

const nivelExiste = (p: Project, id: string): boolean => p.levels.some((l) => l.id === id);

/**
 * Aplica um comando de terreno (A.3 item 4). Devolve false quando o comando não é de terreno. Elemento inválido é
 * recusado (lança) e o projeto não muda. Apagar usa `deleteElements`, que leva as regiões do terreno junto.
 */
export function applyTerrainCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addTerrain': {
      if (!nivelExiste(p, c.terrain.levelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.terrain.levelId }));
      const tn = aceitarTerreno({ ...c.terrain, order: 0 }, lang);
      p.elements[tn.id] = { ...copiarTerreno(tn), order: p.nextOrder++ };
      return true;
    }
    case 'updateTerrain': {
      const e = p.elements[c.id];
      if (!isTerrain(e)) throw new Error(t(lang, 'md_cmd_terrain_missing'));
      if (c.patch.levelId && !nivelExiste(p, c.patch.levelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.patch.levelId }));
      p.elements[c.id] = { ...aceitarTerreno({ ...e, ...c.patch }, lang), id: e.id, kind: 'terrain', order: e.order };
      return true;
    }
    case 'editTerrainFontes': {
      const e = p.elements[c.terrenoId];
      if (!isTerrain(e)) throw new Error(t(lang, 'md_cmd_terrain_missing'));
      p.elements[c.terrenoId] = aceitarTerreno(aplicarOpsFontes(e, c.ops, lang), lang);
      return true;
    }
    case 'addTerrainRegion': {
      if (!nivelExiste(p, c.regiao.levelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.regiao.levelId }));
      const r = aceitarRegiao({ ...c.regiao, order: 0 }, p, lang);
      p.elements[r.id] = { ...r, order: p.nextOrder++ };
      return true;
    }
    case 'updateTerrainRegion': {
      const e = p.elements[c.id];
      if (!isTerrainRegion(e)) throw new Error(t(lang, 'md_cmd_terrain_region_missing'));
      if (c.patch.levelId && !nivelExiste(p, c.patch.levelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.patch.levelId }));
      p.elements[c.id] = { ...aceitarRegiao({ ...e, ...c.patch }, p, lang), id: e.id, kind: 'terrainRegion', order: e.order };
      return true;
    }
    case 'setTerrainRegionContorno': {
      const e = p.elements[c.id];
      if (!isTerrainRegion(e)) throw new Error(t(lang, 'md_cmd_terrain_region_missing'));
      const contorno = normalizarContorno(c.contorno);
      const issue = contornoRegiaoIssue(contorno, lang);
      if (issue) throw new Error(issue);
      p.elements[c.id] = { ...e, contorno };
      return true;
    }
    case 'setLocalizacao': {
      if (c.localizacao === null) {
        delete p.localizacao;
        return true;
      }
      const issue = localizacaoIssue(c.localizacao, lang);
      if (issue) throw new Error(issue);
      p.localizacao = { ...c.localizacao };
      return true;
    }
    default:
      return false;
  }
}
