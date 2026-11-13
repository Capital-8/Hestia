/** Agrega os dicionários franceses por área. Gerado/atualizado conforme cada shard recebe FR_*. */
import { FR_SHELL_RIBBON } from '../../areas/shell-ribbon.ts';
import { FR_MISC_UI } from '../../areas/misc-ui.ts';
import { FR_SCHEDULES_EXTRA } from '../../areas/schedules-extra.ts';
import { FR_CANVAS_VIEWPORT } from '../../areas/canvas-viewport.ts';
import { FR_PACKAGES_RENDER } from '../../areas/packages-render.ts';
import { FR_DIALOGS_STAIRS } from '../../areas/dialogs-stairs.ts';
import { FR_PACKAGES_ENGINE_SCHEDULES } from '../../areas/packages-engine-schedules.ts';
import { FR_CANVAS_SHEET } from '../../areas/canvas-sheet.ts';
import { FR_PROPS_ELEMENTS_C } from '../../areas/props-elements-c.ts';
import { FR_CANVAS_NAV } from '../../areas/canvas-nav.ts';
import { FR_PACKAGES_ENGINE } from '../../areas/packages-engine.ts';
import { FR_SHELL_CHROME } from '../../areas/shell-chrome.ts';
import { FR_PROPS_ELEMENTS_B } from '../../areas/props-elements-b.ts';
import { FR_EDITOR_STATUS } from '../../areas/editor-status.ts';
import { FR_PROPS_ELEMENTS_A } from '../../areas/props-elements-a.ts';
import { FR_PROPS_CORE } from '../../areas/props-core.ts';
import { FR_DIALOGS_MISC } from '../../areas/dialogs-misc.ts';
import { FR_PACKAGES_MODEL } from '../../areas/packages-model.ts';
import { FR_DIALOGS_TYPES } from '../../areas/dialogs-types.ts';
import { FR_DIALOGS_OPENING } from '../../areas/dialogs-opening.ts';
import { FR_DIALOGS_CAD } from '../../areas/dialogs-cad.ts';
import { FR_EDITOR_CONTEXT } from '../../areas/editor-context.ts';
import { FR_PROPS_OPTIONS } from '../../areas/props-options.ts';
import { FR_PACKAGES_IO } from '../../areas/packages-io.ts';
import { FR_BIBLIOTECA } from '../../areas/biblioteca.ts';
import { FR_GUARDA_CORPO } from '../../areas/guarda-corpo.ts';
import { FR_SUPLEMENTOS } from '../../areas/suplementos.ts';
import { FR_PAREDE_CORTINA } from '../../areas/parede-cortina-2.ts';

export const FR_ALL = {
  ...FR_GUARDA_CORPO,
  ...FR_SUPLEMENTOS,
  ...FR_PAREDE_CORTINA,
  ...FR_SHELL_RIBBON,
  ...FR_MISC_UI,
  ...FR_SCHEDULES_EXTRA,
  ...FR_CANVAS_VIEWPORT,
  ...FR_PACKAGES_RENDER,
  ...FR_DIALOGS_STAIRS,
  ...FR_PACKAGES_ENGINE_SCHEDULES,
  ...FR_CANVAS_SHEET,
  ...FR_PROPS_ELEMENTS_C,
  ...FR_CANVAS_NAV,
  ...FR_PACKAGES_ENGINE,
  ...FR_SHELL_CHROME,
  ...FR_PROPS_ELEMENTS_B,
  ...FR_EDITOR_STATUS,
  ...FR_PROPS_ELEMENTS_A,
  ...FR_PROPS_CORE,
  ...FR_DIALOGS_MISC,
  ...FR_PACKAGES_MODEL,
  ...FR_DIALOGS_TYPES,
  ...FR_DIALOGS_OPENING,
  ...FR_DIALOGS_CAD,
  ...FR_EDITOR_CONTEXT,
  ...FR_PROPS_OPTIONS,
  ...FR_PACKAGES_IO,
  ...FR_BIBLIOTECA,
};
