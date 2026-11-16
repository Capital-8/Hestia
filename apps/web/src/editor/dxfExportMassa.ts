import { ESTILO_CORTE_MASSA, ESTILO_PLANTA_MASSA, linhasCorteDaMassa, linhasMassaPlanta, semAneisRepetidos, type LinhaCorteMassaProjeto, type LinhaPlantaMassaProjeto, type SectionResult } from '@hestia/engine';
import type { DxfMassPath, DxfSectionItem } from '@hestia/io';
import type { Id, Project } from '@hestia/model';

/**
 * Massa conceitual no DXF (plano de massa, ficha X1). A geometria vem do kernel (consultas 141 e 143, já traduzidas pelo `servicoMassa`); aqui só se
 * escolhe o que vai ao arquivo. Sem kernel pronto, ou com erro dele, a massa NÃO sai e nada lança (A.5: nenhum caminho TS gera a geometria da massa).
 */

/** Polilinhas da planta: cada linha da consulta (cortado, projetado e acima) é um anel fechado na camada `MASSA`; só o `acima` sai tracejado. */
export function massaPathsDaPlanta(linhas: readonly LinhaPlantaMassaProjeto[], hidden: ReadonlySet<Id>): DxfMassPath[] {
  return linhas
    .filter((l) => !hidden.has(l.massaId) && l.pontos.length >= 3)
    .map((l) => ({
      pts: semAneisRepetidos(l.pontos),
      closed: true,
      ...(l.estilo === ESTILO_PLANTA_MASSA.acima ? { dashed: true } : {}),
    }));
}

/**
 * Massas do nível para o DXF da planta, na mesma cota de corte da vista (`linhasMassaPlanta`, que já escolhe as massas do nível e as que o cruzam).
 * `undefined` = nenhuma camada `MASSA` (categoria oculta, sem massa, sem kernel ou erro dele); presente, mesmo vazio, a camada entra na tabela LAYER.
 */
export function massaDxfDaPlanta(p: Project, levelId: Id, cutZ: number, hidden: ReadonlySet<Id>, visible: boolean): DxfMassPath[] | undefined {
  if (!visible) return undefined;
  const linhas = linhasMassaPlanta(p, levelId, cutZ);
  return linhas ? massaPathsDaPlanta(linhas, hidden) : undefined;
}

/** Anel `(s, z)` do kernel como polígono do corte: o ponto de fechamento repetido sai (o escritor fecha o anel). */
function poligonoDoCorte(l: LinhaCorteMassaProjeto): DxfSectionItem['polygons'] {
  const pts = l.pontos.map((q) => ({ x: q.s, y: q.z }));
  const f = pts[0];
  const u = pts[pts.length - 1];
  const repetido = pts.length > 1 && !!f && !!u && Math.abs(f.x - u.x) < 1e-9 && Math.abs(f.y - u.y) < 1e-9;
  return [[repetido ? pts.slice(0, -1) : pts]];
}

/**
 * Corte e elevação: o cortado (estilo 0) é o polígono de peso de corte (`CORTE_MASSA`); o projetado (estilo 1) vai à camada de projeção da massa
 * (`CORTE_MASSA_PROJECAO`). A feição (estilo 3) é linha aberta e o DXF da seção só leva polígonos fechados: não sai (decisão registrada no relatório).
 */
export function massaItensDoCorte(linhas: readonly LinhaCorteMassaProjeto[]): { cut: DxfSectionItem[]; beyond: DxfSectionItem[] } {
  const out = { cut: [] as DxfSectionItem[], beyond: [] as DxfSectionItem[] };
  for (const l of linhas) {
    if (l.pontos.length < 3) continue;
    if (l.estilo === ESTILO_CORTE_MASSA.cortado) out.cut.push({ category: 'mass', polygons: poligonoDoCorte(l) });
    else if (l.estilo === ESTILO_CORTE_MASSA.projetado) out.beyond.push({ category: 'mass', polygons: poligonoDoCorte(l) });
  }
  return out;
}

/** Itens da massa do corte `section` (consulta 143 em todos os níveis); sem massa, sem kernel ou com erro dele: vazio. */
export function massaDoCorte(p: Project, section: SectionResult, visible: boolean): { cut: DxfSectionItem[]; beyond: DxfSectionItem[] } {
  const linhas = visible ? linhasCorteDaMassa(p, section) : null;
  return linhas ? massaItensDoCorte(linhas) : { cut: [], beyond: [] };
}
