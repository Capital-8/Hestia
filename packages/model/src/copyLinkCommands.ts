import type { Command } from './commands.ts';
import type { Project } from './types.ts';

/**
 * Aplica comandos do vínculo de andar-tipo (copyLink). Devolve false quando o comando não é de
 * vínculo: quem chama segue o `switch` normal de `applyCommand`. Fica fora de `commands.ts`, que já
 * passa do limite de linhas.
 */
export function applyCopyLinkCommand(p: Project, c: Command): boolean {
  switch (c.type) {
    case 'addCopyLink': {
      const links = p.copyLinks ?? [];
      const i = links.findIndex((l) => l.id === c.link.id);
      // Upsert: repetir o mesmo id (ex.: refazer a pré-visualização) não duplica o vínculo.
      p.copyLinks = i >= 0 ? links.map((l, k) => (k === i ? c.link : l)) : [...links, c.link];
      return true;
    }
    case 'deleteCopyLink':
      if (p.copyLinks?.some((l) => l.id === c.id)) p.copyLinks = p.copyLinks.filter((l) => l.id !== c.id);
      return true;
    default:
      return false;
  }
}
