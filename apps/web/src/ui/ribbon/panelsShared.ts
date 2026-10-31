import { act, panel, soon, soonS, split, stack, t, tool, type RibbonPanel } from './model.ts';

/** Painéis que se repetem entre a aba Modificar e as abas contextuais (como no Revit). */

export const P_SELECT: RibbonPanel = panel('selecionar', t('Selecionar', 'Select'), tool('select'));

export const P_PROPS: RibbonPanel = panel('propriedades', t('Propriedades', 'Properties'), act('typeProps'), act('properties'));

/** Alinhar, Deslocar, Espelhar · Mover, Copiar, Rotacionar · Aparar, Dividir, Matriz · Escala, Fixar, Excluir · extras do Hestia. */
export const P_MODIFY: RibbonPanel = panel(
  'modificar',
  t('Modificar', 'Modify'),
  stack(tool('align', 'small'), tool('offset', 'small'), tool('mirror', 'small')),
  stack(tool('move', 'small'), tool('copy', 'small'), tool('rotate', 'small')),
  stack(tool('trim', 'small'), tool('split', 'small'), tool('array', 'small')),
  stack(soonS(t('Escala', 'Scale'), 'component'), soonS(t('Fixar', 'Pin'), 'soon'), act('delete', 'small')),
  stack(tool('parallel', 'small'), tool('rehost', 'small'), soonS(t('Desafixar', 'Unpin'), 'soon')),
);

export const P_MEASURE: RibbonPanel = panel('medir', t('Medir', 'Measure'), tool('measure'), tool('dimension', 'large', { label: t('Cota alinhada', 'Aligned') }));

export const P_CLIPBOARD: RibbonPanel = panel(
  'area-transferencia',
  t('Área de transferência', 'Clipboard'),
  // Colar com a seta ▾: "Colar" segue o cursor; a seta abre o Colar alinhado aos níveis selecionados.
  split(act('pasteAligned'), [act('pasteAlignedLevels')], t('Colar', 'Paste')),
  stack(act('cutSelection', 'small'), act('copySelection', 'small'), soonS(t('Corresp. tipo', 'Match Type'), 'sametype')),
);

export const P_GEOMETRY: RibbonPanel = panel(
  'geometria',
  t('Geometria', 'Geometry'),
  soon(t('Cortar', 'Cope'), 'cut'),
  stack(soonS(t('Cortar geometria', 'Cut'), 'cut'), tool('joins', 'small'), soonS(t('Entalhar', 'Notch'), 'soon')),
);

export const P_VIEW_MOD: RibbonPanel = panel('vista-mod', t('Vista', 'View'), soon(t('Ocultar em vista', 'Hide in View'), 'hide'), soon(t('Substituir gráficos', 'Override Graphics'), 'layers'));

/** Extra do Hestia: o Revit resolve isto pelo menu de botão direito. Fica visível para não perder o acesso. */
export const P_SELECTION_EXTRA: RibbonPanel = panel(
  'selecao-extra',
  t('Seleção e nível', 'Selection & Level'),
  stack(act('sameType', 'small'), act('sameName', 'small'), act('moveLevel', 'small')),
  stack(act('syncLinked', 'small'), act('unlinkLinked', 'small')),
);

export const P_CREATE: RibbonPanel = panel('criar', t('Criar', 'Create'), act('createSimilar'), soon(t('Criar grupo', 'Create Group'), 'layers'));
