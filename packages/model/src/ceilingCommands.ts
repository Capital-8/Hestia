import type { Command } from './commands.ts';
import { isCeiling, type Ceiling, type Project } from './types.ts';
import { t, type Lang } from './i18n.ts';

/** Comando de forro, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type CeilingCommand = Extract<
  Command,
  { type: 'addCeiling' | 'addCeilings' | 'updateCeiling' | 'removeCeiling' | 'upsertCeilingType' | 'deleteCeilingType' | 'duplicateCeilingType' | 'detachCeilingRoom' | 'relinkCeilingRoom' }
>;

/** Validação de um forro novo: contorno com ao menos 3 pontos, tipo existente e nível existente. */
function validateCeilingInput(p: Project, c: Omit<Ceiling, 'order'>, lang: Lang): void {
  if (c.boundary.length < 3) throw new Error(t(lang, 'md_cmd_ceiling_min_points'));
  if (!p.ceilingTypes[c.typeId]) throw new Error(t(lang, 'md_cmd_ceiling_type_missing'));
  if (!p.levels.some((l) => l.id === c.levelId)) throw new Error(t(lang, 'md_level_missing'));
}

/**
 * Aplica um comando de forro (decisão 0021). Devolve false quando o comando não é de forro: quem chama segue o `switch`
 * normal de `applyCommand`.
 */
export function applyCeilingCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addCeiling':
      validateCeilingInput(p, c.ceiling, lang);
      p.elements[c.ceiling.id] = { ...c.ceiling, order: p.nextOrder++ };
      return true;
    case 'addCeilings':
      // Tudo ou nada: valida o lote inteiro antes de criar qualquer forro ("Forro no ambiente" é um só desfazer).
      for (const x of c.ceilings) validateCeilingInput(p, x, lang);
      for (const x of c.ceilings) p.elements[x.id] = { ...x, order: p.nextOrder++ };
      return true;
    case 'updateCeiling': {
      const e = p.elements[c.id];
      if (!isCeiling(e)) throw new Error(t(lang, 'md_cmd_ceiling_missing'));
      p.elements[c.id] = { ...e, ...c.patch };
      return true;
    }
    case 'detachCeilingRoom': {
      // Solta o forro do ambiente (decisão 0023 §13, P-5): o contorno atual vira estático. Sem ambiente, não faz nada.
      const e = p.elements[c.id];
      if (!isCeiling(e)) throw new Error(t(lang, 'md_cmd_ceiling_missing'));
      if (e.roomId) p.elements[c.id] = { ...e, roomLinked: false };
      return true;
    }
    case 'relinkCeilingRoom': {
      // Religa ao ambiente indicado (o de origem ou o que contém o forro; a escolha é de quem chama). O contorno sai no motor.
      const e = p.elements[c.id];
      if (!isCeiling(e)) throw new Error(t(lang, 'md_cmd_ceiling_missing'));
      if (!p.elements[c.roomId] || p.elements[c.roomId]!.kind !== 'room') throw new Error(t(lang, 'md_cmd_room_missing'));
      p.elements[c.id] = { ...e, roomId: c.roomId, roomLinked: true };
      return true;
    }
    case 'removeCeiling':
      if (!isCeiling(p.elements[c.id])) throw new Error(t(lang, 'md_cmd_ceiling_missing'));
      delete p.elements[c.id];
      return true;
    case 'upsertCeilingType':
      p.ceilingTypes[c.ceilingType.id] = c.ceilingType;
      return true;
    case 'deleteCeilingType':
      if (Object.values(p.elements).some((e) => isCeiling(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (Object.keys(p.ceilingTypes).length <= 1) throw new Error(t(lang, 'md_cmd_last_ceiling_type'));
      delete p.ceilingTypes[c.id];
      return true;
    case 'duplicateCeilingType': {
      const src = p.ceilingTypes[c.id];
      if (!src) throw new Error(t(lang, 'md_cmd_ceiling_type_missing'));
      if (p.ceilingTypes[c.newId]) throw new Error(t(lang, 'md_cmd_ceiling_type_exists'));
      p.ceilingTypes[c.newId] = { ...src, id: c.newId, name: c.name, layers: src.layers.map((l) => ({ ...l })) };
      return true;
    }
    default:
      return false;
  }
}
