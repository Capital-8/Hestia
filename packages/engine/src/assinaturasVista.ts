import { planViewOf, type Id, type Project } from '@hestia/model';
import { hashTexto, nivelDoElemento } from './assinaturasNivel.ts';

/**
 * Assinaturas separadas por natureza: a de geometria (global) e a de desenho de cada vista. Desde a Fase 2 o
 * `assinaturasDoProjeto` também deixa `planViews` fora do global, então `assinaturaGeometriaGlobal` dá a mesma separação
 * para o `levels` reduzido ao modelo.
 */

/**
 * Assinatura global só de GEOMETRIA: o mesmo bloco `global` de `assinaturasDoProjeto`, mas com cada nível reduzido ao
 * que é modelo (`id`, `name`, `elevation` e `roomSeparators`). Mudar intervalo, gráficos, ocultos ou anotação de uma
 * vista não a altera; mudar cota, nome, separador de ambiente, configuração do projeto ou elemento sem nível, sim.
 */
export function assinaturaGeometriaGlobal(p: Project): string {
  const { elements, views: _views, planViews: _planViews, roomCategories: _roomCategories, colorSchemes: _colorSchemes, nextOrder: _nextOrder, name: _name, thumbnail: _thumbnail, ...resto } = p;
  const niveis = p.levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation, roomSeparators: l.roomSeparators ?? [] }));
  const globais: string[] = [];
  for (const id of Object.keys(elements)) {
    const e = elements[id]!;
    if (nivelDoElemento(elements, e) === null) globais.push(`${id}:${JSON.stringify(e)}`);
  }
  return hashTexto(`${JSON.stringify({ ...resto, levels: niveis })}\u0002${globais.join('\n')}`);
}

/**
 * Assinatura de DESENHO de uma vista de planta: tipo, nível, intervalo, gráficos, ocultos, anotações (sempre
 * próprias da vista: a herança da planta de área acabou na migração 23 → 24) e a configuração da planta de área. Não inclui o nome nem os elementos do
 * modelo (esses entram pela assinatura por nível). Vista inexistente: `'-'`.
 */
export function assinaturaDeVista(p: Project, viewId: Id): string {
  const v = planViewOf(p, viewId);
  if (!v) return '-';
  return hashTexto(JSON.stringify({ kind: v.kind, levelId: v.levelId, viewRange: v.viewRange, graphics: v.graphics ?? null, hidden: v.hidden ?? null, annotations: v.annotations, area: v.area ?? null }));
}
