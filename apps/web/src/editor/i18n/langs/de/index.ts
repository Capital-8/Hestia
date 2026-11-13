/** Agrega os dicionários alemães por área. Gerado/atualizado conforme cada shard recebe DE_*. */
import { DE_SHELL_RIBBON } from '../../areas/shell-ribbon.ts';
import { DE_MISC_UI } from '../../areas/misc-ui.ts';
import { DE_SCHEDULES_EXTRA } from '../../areas/schedules-extra.ts';
import { DE_CANVAS_VIEWPORT } from '../../areas/canvas-viewport.ts';
import { DE_PACKAGES_RENDER } from '../../areas/packages-render.ts';
import { DE_DIALOGS_STAIRS } from '../../areas/dialogs-stairs.ts';
import { DE_PACKAGES_ENGINE_SCHEDULES } from '../../areas/packages-engine-schedules.ts';
import { DE_CANVAS_SHEET } from '../../areas/canvas-sheet.ts';
import { DE_PROPS_ELEMENTS_C } from '../../areas/props-elements-c.ts';
import { DE_CANVAS_NAV } from '../../areas/canvas-nav.ts';
import { DE_PACKAGES_ENGINE } from '../../areas/packages-engine.ts';
import { DE_SHELL_CHROME } from '../../areas/shell-chrome.ts';
import { DE_PROPS_ELEMENTS_B } from '../../areas/props-elements-b.ts';
import { DE_EDITOR_STATUS } from '../../areas/editor-status.ts';
import { DE_PROPS_ELEMENTS_A } from '../../areas/props-elements-a.ts';
import { DE_PROPS_CORE } from '../../areas/props-core.ts';
import { DE_DIALOGS_MISC } from '../../areas/dialogs-misc.ts';
import { DE_PACKAGES_MODEL } from '../../areas/packages-model.ts';
import { DE_DIALOGS_TYPES } from '../../areas/dialogs-types.ts';
import { DE_DIALOGS_OPENING } from '../../areas/dialogs-opening.ts';
import { DE_DIALOGS_CAD } from '../../areas/dialogs-cad.ts';
import { DE_EDITOR_CONTEXT } from '../../areas/editor-context.ts';
import { DE_PROPS_OPTIONS } from '../../areas/props-options.ts';
import { DE_PACKAGES_IO } from '../../areas/packages-io.ts';
import { DE_BIBLIOTECA } from '../../areas/biblioteca.ts';
import { DE_GUARDA_CORPO } from '../../areas/guarda-corpo.ts';
import { DE_PAREDE_CORTINA } from '../../areas/parede-cortina-2.ts';

export const DE_ALL = {
  ...DE_GUARDA_CORPO,
  ...DE_PAREDE_CORTINA,
  ...DE_SHELL_RIBBON,
  ...DE_MISC_UI,
  ...DE_SCHEDULES_EXTRA,
  ...DE_CANVAS_VIEWPORT,
  ...DE_PACKAGES_RENDER,
  ...DE_DIALOGS_STAIRS,
  ...DE_PACKAGES_ENGINE_SCHEDULES,
  ...DE_CANVAS_SHEET,
  ...DE_PROPS_ELEMENTS_C,
  ...DE_CANVAS_NAV,
  ...DE_PACKAGES_ENGINE,
  ...DE_SHELL_CHROME,
  ...DE_PROPS_ELEMENTS_B,
  ...DE_EDITOR_STATUS,
  ...DE_PROPS_ELEMENTS_A,
  ...DE_PROPS_CORE,
  ...DE_DIALOGS_MISC,
  ...DE_PACKAGES_MODEL,
  ...DE_DIALOGS_TYPES,
  ...DE_DIALOGS_OPENING,
  ...DE_DIALOGS_CAD,
  ...DE_EDITOR_CONTEXT,
  ...DE_PROPS_OPTIONS,
  ...DE_PACKAGES_IO,
  ...DE_BIBLIOTECA,
};
