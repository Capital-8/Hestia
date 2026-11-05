import type { Command } from './commands.ts';
import { dropRoomTags } from './areaPlanCommands.ts';
import { isRoom, type Project } from './types.ts';
import { t, type Lang } from './i18n.ts';

/** Comando de ambiente, fora do `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type RoomCommand = Extract<Command, { type: 'addRoom' | 'updateRoom' | 'removeRoom' }>;

/** Aplica um comando de ambiente (decisão 0018). Devolve false quando o comando não é de ambiente. */
export function applyRoomCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addRoom':
      if (!p.levels.some((l) => l.id === c.room.levelId)) throw new Error(t(lang, 'md_level_missing'));
      p.elements[c.room.id] = { ...c.room, order: p.nextOrder++ };
      return true;
    case 'updateRoom': {
      const r = p.elements[c.id];
      if (!isRoom(r)) throw new Error(t(lang, 'md_cmd_room_missing'));
      p.elements[c.id] = { ...r, ...c.patch };
      return true;
    }
    case 'removeRoom':
      delete p.elements[c.id];
      dropRoomTags(p, [c.id]);
      return true;
    default:
      return false;
  }
}
