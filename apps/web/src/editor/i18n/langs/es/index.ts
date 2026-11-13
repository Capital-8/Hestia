/** Agrega os dicionários espanhóis por área. Gerado/atualizado conforme cada shard recebe ES_*. */
import { ES_SHELL_RIBBON } from '../../areas/shell-ribbon.ts';
import { ES_MISC_UI } from '../../areas/misc-ui.ts';
import { ES_SCHEDULES_EXTRA } from '../../areas/schedules-extra.ts';
import { ES_CANVAS_VIEWPORT } from '../../areas/canvas-viewport.ts';
import { ES_PACKAGES_RENDER } from '../../areas/packages-render.ts';
import { ES_DIALOGS_STAIRS } from '../../areas/dialogs-stairs.ts';
import { ES_PACKAGES_ENGINE_SCHEDULES } from '../../areas/packages-engine-schedules.ts';
import { ES_CANVAS_SHEET } from '../../areas/canvas-sheet.ts';
import { ES_PROPS_ELEMENTS_C } from '../../areas/props-elements-c.ts';
import { ES_CANVAS_NAV } from '../../areas/canvas-nav.ts';
import { ES_PACKAGES_ENGINE } from '../../areas/packages-engine.ts';
import { ES_SHELL_CHROME } from '../../areas/shell-chrome.ts';
import { ES_PROPS_ELEMENTS_B } from '../../areas/props-elements-b.ts';
import { ES_EDITOR_STATUS } from '../../areas/editor-status.ts';
import { ES_PROPS_ELEMENTS_A } from '../../areas/props-elements-a.ts';
import { ES_PROPS_CORE } from '../../areas/props-core.ts';
import { ES_DIALOGS_MISC } from '../../areas/dialogs-misc.ts';
import { ES_PACKAGES_MODEL } from '../../areas/packages-model.ts';
import { ES_DIALOGS_TYPES } from '../../areas/dialogs-types.ts';
import { ES_DIALOGS_OPENING } from '../../areas/dialogs-opening.ts';
import { ES_DIALOGS_CAD } from '../../areas/dialogs-cad.ts';
import { ES_EDITOR_CONTEXT } from '../../areas/editor-context.ts';
import { ES_PROPS_OPTIONS } from '../../areas/props-options.ts';
import { ES_PACKAGES_IO } from '../../areas/packages-io.ts';
import { ES_BIBLIOTECA } from '../../areas/biblioteca.ts';
import { ES_GUARDA_CORPO } from '../../areas/guarda-corpo.ts';
import { ES_SUPLEMENTOS } from '../../areas/suplementos.ts';
import { ES_PAREDE_CORTINA } from '../../areas/parede-cortina-1.ts';

export const ES_ALL = {
  ...ES_GUARDA_CORPO,
  ...ES_SUPLEMENTOS,
  ...ES_PAREDE_CORTINA,
  ...ES_SHELL_RIBBON,
  ...ES_MISC_UI,
  ...ES_SCHEDULES_EXTRA,
  ...ES_CANVAS_VIEWPORT,
  ...ES_PACKAGES_RENDER,
  ...ES_DIALOGS_STAIRS,
  ...ES_PACKAGES_ENGINE_SCHEDULES,
  ...ES_CANVAS_SHEET,
  ...ES_PROPS_ELEMENTS_C,
  ...ES_CANVAS_NAV,
  ...ES_PACKAGES_ENGINE,
  ...ES_SHELL_CHROME,
  ...ES_PROPS_ELEMENTS_B,
  ...ES_EDITOR_STATUS,
  ...ES_PROPS_ELEMENTS_A,
  ...ES_PROPS_CORE,
  ...ES_DIALOGS_MISC,
  ...ES_PACKAGES_MODEL,
  ...ES_DIALOGS_TYPES,
  ...ES_DIALOGS_OPENING,
  ...ES_DIALOGS_CAD,
  ...ES_EDITOR_CONTEXT,
  ...ES_PROPS_OPTIONS,
  ...ES_PACKAGES_IO,
  ...ES_BIBLIOTECA,
};
