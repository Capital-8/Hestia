import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { isWall, type Id, type Project, type WallType } from './types.ts';
import { curtainPanelTypesOf, curtainShadowLayer, curtainTypeIssue, montanteIssue, mullionTypesOf, painelIssue, papeisDeMontante } from './wallCurtain.ts';

// Comandos da parede cortina (decisão 0056, §4.7). Sem o `switch` de `commands.ts` (aquele arquivo passa do limite de
// linhas). Na fase 0: os tipos de montante e de painel, e a preparação do tipo de parede (camada-sombra e família).

/** Comandos de tipo de montante e de painel, tratados aqui. */
export type CurtainCommand = Extract<
  Command,
  { type: 'upsertMullionType' | 'deleteMullionType' | 'upsertCurtainPanelType' | 'deleteCurtainPanelType' }
>;

/** Montante usado por alguma parede cortina, no tipo (papel) ou numa linha da instância. */
function montanteEmUso(p: Project, id: Id): boolean {
  const emTipo = Object.values(p.wallTypes).some((w) => w.family === 'curtain' && !!w.curtain && papeisDeMontante(w.curtain.mullions).includes(id));
  if (emTipo) return true;
  return Object.values(p.elements).some(
    (e) =>
      isWall(e) &&
      !!e.curtain &&
      ((e.curtain.lineOverrides ?? []).some((lo) => lo.mullionTypeId === id) || (e.curtain.addedLines ?? []).some((al) => al.mullionTypeId === id)),
  );
}

/** Painel usado por alguma parede cortina: padrão do tipo, padrão da instância ou sobrescrita de célula. */
function painelEmUso(p: Project, id: Id): boolean {
  const emTipo = Object.values(p.wallTypes).some((w) => w.family === 'curtain' && w.curtain?.defaultPanelTypeId === id);
  if (emTipo) return true;
  return Object.values(p.elements).some(
    (e) =>
      isWall(e) &&
      !!e.curtain &&
      (e.curtain.defaultPanelTypeId === id || (e.curtain.cells ?? []).some((c) => c.override.kind === 'panel' && c.override.panelTypeId === id)),
  );
}

/**
 * Prepara um tipo de parede antes de gravar (decisão 0056, §4.1, §4.7): a família é fixada na criação, a camada-sombra
 * é regravada pela profundidade do sistema e o tipo é validado. Tipo básico passa sem mudança.
 */
export function prepararTipoParede(p: Project, wt: WallType, lang: Lang = 'pt'): WallType {
  const antes = p.wallTypes[wt.id];
  if (antes && (antes.family ?? 'basic') !== (wt.family ?? 'basic')) throw new Error(t(lang, 'md_ct_family_fixed'));
  if (wt.family !== 'curtain') return wt;
  const normal: WallType = { ...wt, layers: wt.curtain ? [curtainShadowLayer(p, wt.curtain)] : wt.layers };
  const erro = curtainTypeIssue(normal, p, lang);
  if (erro) throw new Error(erro);
  return normal;
}

/**
 * Aplica um comando da parede cortina. Devolve false quando o comando não é desta família: quem chama segue o `switch`
 * de `applyCommand`. A primeira escrita de um mapa grava o conjunto completo (`mullionTypes`, `curtainPanelTypes`).
 */
export function applyCurtainCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'upsertMullionType': {
      const erro = montanteIssue(c.mullionType, lang);
      if (erro) throw new Error(erro);
      p.mullionTypes = { ...mullionTypesOf(p), [c.mullionType.id]: c.mullionType };
      return true;
    }
    case 'deleteMullionType': {
      const tipos = mullionTypesOf(p);
      if (!tipos[c.id]) throw new Error(t(lang, 'md_ct_mullion_missing'));
      if (montanteEmUso(p, c.id)) throw new Error(t(lang, 'md_cmd_mullion_in_use'));
      if (Object.keys(tipos).length <= 1) throw new Error(t(lang, 'md_cmd_mullion_last'));
      const resto = { ...tipos };
      delete resto[c.id];
      p.mullionTypes = resto;
      return true;
    }
    case 'upsertCurtainPanelType': {
      const erro = painelIssue(c.panelType, lang);
      if (erro) throw new Error(erro);
      p.curtainPanelTypes = { ...curtainPanelTypesOf(p), [c.panelType.id]: c.panelType };
      return true;
    }
    case 'deleteCurtainPanelType': {
      const tipos = curtainPanelTypesOf(p);
      if (!tipos[c.id]) throw new Error(t(lang, 'md_ct_panel_missing'));
      if (painelEmUso(p, c.id)) throw new Error(t(lang, 'md_cmd_panel_in_use'));
      if (Object.keys(tipos).length <= 1) throw new Error(t(lang, 'md_cmd_panel_last'));
      const resto = { ...tipos };
      delete resto[c.id];
      p.curtainPanelTypes = resto;
      return true;
    }
    default:
      return false;
  }
}
