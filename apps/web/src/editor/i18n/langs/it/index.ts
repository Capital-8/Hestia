/** Agrega os dicionários italianos por área. Gerado/atualizado conforme cada shard recebe IT_*. */
import { IT_SHELL_RIBBON } from '../../areas/shell-ribbon.ts';
import { IT_MISC_UI } from '../../areas/misc-ui.ts';
import { IT_SCHEDULES_EXTRA } from '../../areas/schedules-extra.ts';
import { IT_CANVAS_VIEWPORT } from '../../areas/canvas-viewport.ts';
import { IT_PACKAGES_RENDER } from '../../areas/packages-render.ts';
import { IT_DIALOGS_STAIRS } from '../../areas/dialogs-stairs.ts';
import { IT_PACKAGES_ENGINE_SCHEDULES } from '../../areas/packages-engine-schedules.ts';
import { IT_CANVAS_SHEET } from '../../areas/canvas-sheet.ts';
import { IT_PROPS_ELEMENTS_C } from '../../areas/props-elements-c.ts';
import { IT_CANVAS_NAV } from '../../areas/canvas-nav.ts';
import { IT_PACKAGES_ENGINE } from '../../areas/packages-engine.ts';
import { IT_SHELL_CHROME } from '../../areas/shell-chrome.ts';
import { IT_PROPS_ELEMENTS_B } from '../../areas/props-elements-b.ts';
import { IT_EDITOR_STATUS } from '../../areas/editor-status.ts';
import { IT_PROPS_ELEMENTS_A } from '../../areas/props-elements-a.ts';
import { IT_PROPS_CORE } from '../../areas/props-core.ts';
import { IT_DIALOGS_MISC } from '../../areas/dialogs-misc.ts';
import { IT_PACKAGES_MODEL } from '../../areas/packages-model.ts';
import { IT_DIALOGS_TYPES } from '../../areas/dialogs-types.ts';
import { IT_DIALOGS_OPENING } from '../../areas/dialogs-opening.ts';
import { IT_DIALOGS_CAD } from '../../areas/dialogs-cad.ts';
import { IT_EDITOR_CONTEXT } from '../../areas/editor-context.ts';
import { IT_PROPS_OPTIONS } from '../../areas/props-options.ts';
import { IT_PACKAGES_IO } from '../../areas/packages-io.ts';
import { IT_BIBLIOTECA } from '../../areas/biblioteca.ts';

export const IT_ALL = {
  ...IT_SHELL_RIBBON,
  ...IT_MISC_UI,
  ...IT_SCHEDULES_EXTRA,
  ...IT_CANVAS_VIEWPORT,
  ...IT_PACKAGES_RENDER,
  ...IT_DIALOGS_STAIRS,
  ...IT_PACKAGES_ENGINE_SCHEDULES,
  ...IT_CANVAS_SHEET,
  ...IT_PROPS_ELEMENTS_C,
  ...IT_CANVAS_NAV,
  ...IT_PACKAGES_ENGINE,
  ...IT_SHELL_CHROME,
  ...IT_PROPS_ELEMENTS_B,
  ...IT_EDITOR_STATUS,
  ...IT_PROPS_ELEMENTS_A,
  ...IT_PROPS_CORE,
  ...IT_DIALOGS_MISC,
  ...IT_PACKAGES_MODEL,
  ...IT_DIALOGS_TYPES,
  ...IT_DIALOGS_OPENING,
  ...IT_DIALOGS_CAD,
  ...IT_EDITOR_CONTEXT,
  ...IT_PROPS_OPTIONS,
  ...IT_PACKAGES_IO,
  ...IT_BIBLIOTECA,
};
