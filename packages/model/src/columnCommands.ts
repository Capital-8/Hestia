import type { Command } from './commands.ts';
import { applyBeamCommand } from './beamCommands.ts';
import { isBeam, transformBeam } from './beam.ts';
import { columnTypesOf, isColumn, transformarElementos, transformColumn } from './column.ts';
import type { Column } from './estrTypes.ts';
import { applyFootingCommand } from './footingCommands.ts';
import { isFooting, transformFooting } from './footing.ts';
import { t, type Lang } from './i18n.ts';
import type { Project } from './types.ts';
import { columnIssue, columnTypeIssue, hospedeiroIssue, materiaisIssue, nivelIssue } from './validateEstr.ts';

/** Comando de pilar, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type ColumnCommand = Extract<Command, { type: 'addColumn' | 'updateColumn' | 'setColumnType' | 'upsertColumnType' | 'deleteColumnType' }>;

/** Valida o pilar contra o projeto (nível, topo, tipo, parede e regras do próprio pilar); lança se inválido. */
function aceitar(p: Project, c: Column, lang: Lang): Column {
  const tipo = columnTypesOf(p)[c.typeId];
  if (!tipo) throw new Error(t(lang, 'md_cmd_column_type_missing'));
  const issue = nivelIssue(p, c.levelId, lang) ?? (c.topLevelId === null ? null : nivelIssue(p, c.topLevelId, lang)) ?? hospedeiroIssue(p, c.hostWallId, lang) ?? columnIssue(c, tipo, lang);
  if (issue) throw new Error(issue);
  return c;
}

/** Aplica um comando de pilar (A.3). Devolve false quando o comando não é de pilar. Apagar usa `deleteElements`. */
export function applyColumnCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addColumn': {
      const col = aceitar(p, { ...structuredClone(c.column), order: 0 }, lang);
      p.elements[col.id] = { ...col, order: p.nextOrder++ };
      return true;
    }
    case 'updateColumn': {
      const e = p.elements[c.id];
      if (!isColumn(e)) throw new Error(t(lang, 'md_cmd_column_missing'));
      p.elements[c.id] = { ...aceitar(p, { ...e, ...structuredClone(c.patch) }, lang), id: e.id, kind: 'column', order: e.order };
      return true;
    }
    case 'setColumnType': {
      const tipo = columnTypesOf(p)[c.typeId];
      if (!tipo) throw new Error(t(lang, 'md_cmd_column_type_missing'));
      for (const id of c.ids) {
        const e = p.elements[id];
        if (!isColumn(e)) continue;
        // Trocar para um tipo estrutural solta o pilar da parede hospedeira (só o arquitetônico a tem).
        const { hostWallId: host, ...resto } = e;
        p.elements[id] = aceitar(p, { ...resto, ...(tipo.disciplina === 'arquitetonico' && host !== undefined ? { hostWallId: host } : {}), typeId: tipo.id, disciplina: tipo.disciplina }, lang);
      }
      return true;
    }
    case 'upsertColumnType': {
      const tipo = structuredClone(c.columnType);
      const issue = columnTypeIssue(tipo, lang) ?? materiaisIssue(p, [tipo.materialId, ...(tipo.camadas ?? []).map((l) => l.materialId)], lang);
      if (issue) throw new Error(issue);
      const atual = columnTypesOf(p);
      const emUso = Object.values(p.elements).some((e) => isColumn(e) && e.typeId === tipo.id && e.disciplina !== tipo.disciplina);
      if (emUso) throw new Error(t(lang, 'md_cmd_type_in_use'));
      p.columnTypes = { ...atual, [tipo.id]: tipo };
      return true;
    }
    case 'deleteColumnType': {
      if (Object.values(p.elements).some((e) => isColumn(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      const { [c.id]: _fora, ...resto } = columnTypesOf(p);
      p.columnTypes = resto;
      return true;
    }
    default:
      return false;
  }
}

/** Comandos de pilar, viga e fundação: um ponto só para `commands.ts`. */
export const applyEstruturaCommand = (p: Project, c: Command, lang: Lang = 'pt'): boolean => applyColumnCommand(p, c, lang) || applyBeamCommand(p, c, lang) || applyFootingCommand(p, c, lang);

/** Parte do comando `transform` que cuida de pilares, vigas e fundações (ver `transformarElementos`). */
export function transformarEstrutura(p: Project, c: Extract<Command, { type: 'transform' }>): void {
  transformarElementos(p, c, isColumn, transformColumn);
  transformarElementos(p, c, isBeam, transformBeam);
  transformarElementos(p, c, isFooting, transformFooting);
}
