import { planViewOf, type Id, type Project } from '@hestia/model';
import { hashTexto, nivelDoElemento } from './assinaturasNivel.ts';

/**
 * Assinaturas separadas por natureza, para a Fase 2 trocar a mistura de `assinaturasDoProjeto` (o bloco `global` lê o
 * `levels` inteiro, com intervalo, gráficos, ocultos e anotações de vista). Funções NOVAS: não alteram nem substituem
 * `assinaturasDoProjeto`, que continua produzindo o mesmo valor.
 */

/**
 * Assinatura global só de GEOMETRIA: o mesmo bloco `global` de `assinaturasDoProjeto`, mas com cada nível reduzido ao
 * que é modelo (`id`, `name`, `elevation` e `roomSeparators`). Mudar intervalo, gráficos, ocultos ou anotação de uma
 * vista não a altera; mudar cota, nome, separador de ambiente, configuração do projeto ou elemento sem nível, sim.
 */
export function assinaturaGeometriaGlobal(p: Project): string {
  const { elements, views: _views, areaPlans: _areaPlans, roomCategories: _roomCategories, colorSchemes: _colorSchemes, nextOrder: _nextOrder, name: _name, thumbnail: _thumbnail, ...resto } = p;
  const niveis = p.levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation, roomSeparators: l.roomSeparators ?? [] }));
  const globais: string[] = [];
  for (const id of Object.keys(elements)) {
    const e = elements[id]!;
    if (nivelDoElemento(elements, e) === null) globais.push(`${id}:${JSON.stringify(e)}`);
  }
  return hashTexto(`${JSON.stringify({ ...resto, levels: niveis })}\u0002${globais.join('\n')}`);
}

/**
 * Assinatura de DESENHO de uma vista de planta: tipo, nível, intervalo, gráficos, ocultos, anotações (as que a vista
 * desenha, com a herança da planta de área) e a configuração da planta de área. Não inclui o nome nem os elementos do
 * modelo (esses entram pela assinatura por nível). Vista inexistente: `'-'`.
 */
export function assinaturaDeVista(p: Project, viewId: Id): string {
  const v = planViewOf(p, viewId);
  if (!v) return '-';
  return hashTexto(JSON.stringify({ kind: v.kind, levelId: v.levelId, viewRange: v.viewRange, graphics: v.graphics ?? null, hidden: v.hidden ?? null, annotations: v.annotations, area: v.area ?? null }));
}
