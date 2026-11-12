import {
  categoryOfElement,
  graphicsCategoryLabels,
  GRAPHICS_CATEGORIES,
  planViewHiddenOf,
  planViewOf,
  viewAnnotationsOf,
  viewGraphicsOf,
  viewProfileOf,
  visibleInView,
  type Command,
  type GraphicsCategory,
  type Id,
  type Project,
  type ViewHidden,
  type VisibilitySession,
} from '@hestia/model';
import { t, type Lang } from './i18n.ts';
import { idsDeAnotacoes } from './vistaDeArea.ts';

/**
 * Política R1 por vista (PLANO-MESTRE 4.5, Fase 3): ao criar algo que a vista oculta (pelo perfil da planta de área,
 * por categoria sem visibilidade nos gráficos, por `hidden.categories` ou por ocultar/isolar temporário), a ferramenta
 * segue funcionando (não bloqueia) e a interface avisa, com "Mostrar categoria nesta vista" e "Desfazer". Vale para
 * qualquer vista de planta: a pergunta "aparece?" é sempre `visibleInView` (a regra única, planViewVisibility.ts).
 */

/** Categorias que a vista oculta entre os itens criados entre `before` e `after`, ou null quando tudo aparece. */
export function hiddenCreationWarning(before: Project, after: Project, viewId: Id, session: VisibilitySession = {}): GraphicsCategory[] | null {
  if (before === after) return null;
  const vista = planViewOf(after, viewId);
  if (!vista) return null;
  const achadas = new Set<GraphicsCategory>();
  // Elementos do modelo novos neste nível (o de outro nível não aparece nesta vista de qualquer jeito).
  if (after.elements !== before.elements) {
    for (const [id, e] of Object.entries(after.elements)) {
      if (before.elements[id]) continue;
      const nivel = (e as { levelId?: Id }).levelId;
      if (nivel !== undefined && nivel !== vista.levelId) continue;
      const categoria = categoryOfElement(e);
      if (categoria && !visibleInView(after, viewId, id, session)) achadas.add(categoria);
    }
  }
  // Anotações novas desta vista (cota, texto, detalhe, etiqueta): categoria `annotation`, camadas do perfil.
  const anotDepois = viewAnnotationsOf(after, viewId);
  const anotAntes = planViewOf(before, viewId) ? viewAnnotationsOf(before, viewId) : undefined;
  if (anotDepois !== anotAntes) {
    const antes = new Set<Id>(anotAntes ? idsDeAnotacoes(anotAntes) : []);
    for (const id of idsDeAnotacoes(anotDepois)) {
      if (!antes.has(id) && !visibleInView(after, viewId, id, session)) achadas.add('annotation');
    }
  }
  return achadas.size ? GRAPHICS_CATEGORIES.filter((c) => achadas.has(c)) : null;
}

/** "Paredes, portas e pisos" no idioma: os nomes das categorias, ligados por "e". */
export function categoriasPorExtenso(lang: Lang, categorias: readonly GraphicsCategory[]): string {
  const nomes = graphicsCategoryLabels(lang);
  const lista = categorias.map((c) => nomes[c]);
  return lista.length > 1 ? t(lang, 'edc_list_and', { list: lista.slice(0, -1).join(', '), last: lista[lista.length - 1]! }) : (lista[0] ?? '');
}

const semCategoria = (h: ViewHidden | undefined, cats: ReadonlySet<GraphicsCategory>): ViewHidden | null => {
  const categories = (h?.categories ?? []).filter((c) => !cats.has(c));
  const elements = h?.elements ?? [];
  return categories.length === 0 && elements.length === 0 ? null : { ...(elements.length ? { elements: [...elements] } : {}), ...(categories.length ? { categories } : {}) };
};

/**
 * Comando que mostra as categorias na vista `viewId` (e só nela): desliga a ocultação por categoria (`hidden.categories`),
 * liga a visibilidade da categoria nos gráficos da vista e, na planta de área, liga a camada do perfil que a esconde
 * (paredes, aberturas, pisos, cotas, anotações). Um comando só, um passo de desfazer. `null` quando nada a mudar no
 * projeto (o que sobra, se houver, é ocultação temporária da sessão).
 */
export function comandoMostrarCategorias(p: Project, viewId: Id, categorias: readonly GraphicsCategory[]): Command | null {
  const vista = planViewOf(p, viewId);
  if (!vista) return null;
  const cats = new Set(categorias);
  const patch: Extract<Command, { type: 'updatePlanView' }>['patch'] = {};

  const oculto = planViewHiddenOf(p, viewId);
  if (oculto.categories?.some((c) => cats.has(c))) patch.hidden = semCategoria(oculto, cats);

  const overrides = viewGraphicsOf(p, viewId).overrides;
  const ligar = categorias.filter((c) => !overrides[c].visible);
  if (ligar.length) patch.graphics = { overrides: Object.fromEntries(ligar.map((c) => [c, { visible: true }])) };

  if (vista.kind === 'area' && vista.area) {
    const ly = viewProfileOf(p, viewId).layers;
    const g: Partial<NonNullable<typeof vista.area>['graphics']> = {};
    if (cats.has('wall') && ly.walls === 'hidden') g.showWalls = 'normal';
    if ((cats.has('door') || cats.has('window')) && !ly.openings) g.showOpenings = true;
    if (cats.has('floor') && !ly.floors) g.showFloors = true;
    if (cats.has('annotation')) {
      if (!ly.dimensions) g.showDimensions = true;
      if (!ly.texts || !ly.detail || !ly.tags) g.showAnnotations = true;
    }
    if (Object.keys(g).length) patch.area = { graphics: g };
  }
  return Object.keys(patch).length ? { type: 'updatePlanView', viewId, patch } : null;
}
