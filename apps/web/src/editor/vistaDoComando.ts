import { planViewOf, type AnnotationCommand, type Command, type Id, type Project, type RemoveAnnotation } from '@hestia/model';
import { planViewIdAtivo, type CamposDaVista } from './vistaAtiva.ts';

/** Comandos de anotação de planta que moram na vista (cota, texto, linha e região de detalhe, etiqueta). */
const ANOTACAO_DE_PLANTA = new Set<Command['type']>([
  'addDimension', 'updateDimension', 'removeDimension',
  'addText', 'updateText', 'removeText',
  'addDetailLine', 'updateDetailLine', 'removeDetailLine',
  'addDetailRegion', 'updateDetailRegion', 'removeDetailRegion',
  'addTag', 'updateTag', 'removeTag',
]);

/** O comando é de anotação de planta (e não separador de ambiente nem outra coisa)? */
export const ehAnotacaoDePlanta = (c: Command): c is AnnotationCommand => ANOTACAO_DE_PLANTA.has(c.type);

/**
 * Id da vista de planta ativa que deve receber o comando de anotação, ou `null` quando o comando já diz onde mora
 * (`viewId`, `planId` ou `sectionId`), não é de anotação de planta, a tela não é planta, ou o `levelId` do comando não
 * é o nível da vista ativa. Vale para piso, cobertura e planta de área: anotação criada na cobertura fica na cobertura.
 */
export function vistaAtivaParaComando(p: Project, ui: CamposDaVista, c: Command): Id | null {
  if (!ehAnotacaoDePlanta(c)) return null;
  if (('viewId' in c && c.viewId !== undefined) || ('planId' in c && c.planId !== undefined) || ('sectionId' in c && c.sectionId !== undefined)) return null;
  const viewId = planViewIdAtivo(ui);
  if (!viewId) return null;
  const nivelDaVista = planViewOf(p, viewId)?.levelId ?? ui.levelId;
  return c.levelId === nivelDaVista ? viewId : null;
}

/**
 * Comandos que excluem as anotações de `ids` que moram na vista `viewId` (e só nela: as das outras vistas do nível,
 * mesmo com o mesmo tipo, não são tocadas). Os comandos levam `viewId`, a forma que alcança a cobertura.
 */
export function remocoesNaVista(p: Project, viewId: Id, ids: readonly Id[]): RemoveAnnotation[] {
  const vista = planViewOf(p, viewId);
  if (!vista) return [];
  const want = new Set(ids);
  const base = { levelId: vista.levelId, viewId };
  const a = vista.annotations;
  return [
    ...a.dimensions.filter((x) => want.has(x.id)).map((x): RemoveAnnotation => ({ type: 'removeDimension', ...base, id: x.id })),
    ...a.texts.filter((x) => want.has(x.id)).map((x): RemoveAnnotation => ({ type: 'removeText', ...base, id: x.id })),
    ...a.detailLines.filter((x) => want.has(x.id)).map((x): RemoveAnnotation => ({ type: 'removeDetailLine', ...base, id: x.id })),
    ...a.detailRegions.filter((x) => want.has(x.id)).map((x): RemoveAnnotation => ({ type: 'removeDetailRegion', ...base, id: x.id })),
    ...a.tags.filter((x) => want.has(x.id)).map((x): RemoveAnnotation => ({ type: 'removeTag', ...base, id: x.id })),
  ];
}
