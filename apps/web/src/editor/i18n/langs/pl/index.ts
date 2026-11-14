/** Agrega os dicionários poloneses por área. Gerado/atualizado conforme cada shard recebe PL_*. */
import { PL_SHELL_RIBBON } from '../../areas/shell-ribbon.ts';
import { PL_MISC_UI } from '../../areas/misc-ui.ts';
import { PL_SCHEDULES_EXTRA } from '../../areas/schedules-extra.ts';
import { PL_CANVAS_VIEWPORT } from '../../areas/canvas-viewport.ts';
import { PL_PACKAGES_RENDER } from '../../areas/packages-render.ts';
import { PL_DIALOGS_STAIRS } from '../../areas/dialogs-stairs.ts';
import { PL_PACKAGES_ENGINE_SCHEDULES } from '../../areas/packages-engine-schedules.ts';
import { PL_CANVAS_SHEET } from '../../areas/canvas-sheet.ts';
import { PL_PROPS_ELEMENTS_C } from '../../areas/props-elements-c.ts';
import { PL_CANVAS_NAV } from '../../areas/canvas-nav.ts';
import { PL_PACKAGES_ENGINE } from '../../areas/packages-engine.ts';
import { PL_SHELL_CHROME } from '../../areas/shell-chrome.ts';
import { PL_PROPS_ELEMENTS_B } from '../../areas/props-elements-b.ts';
import { PL_EDITOR_STATUS } from '../../areas/editor-status.ts';
import { PL_PROPS_ELEMENTS_A } from '../../areas/props-elements-a.ts';
import { PL_PROPS_CORE } from '../../areas/props-core.ts';
import { PL_DIALOGS_MISC } from '../../areas/dialogs-misc.ts';
import { PL_PACKAGES_MODEL } from '../../areas/packages-model.ts';
import { PL_DIALOGS_TYPES } from '../../areas/dialogs-types.ts';
import { PL_DIALOGS_OPENING } from '../../areas/dialogs-opening.ts';
import { PL_DIALOGS_CAD } from '../../areas/dialogs-cad.ts';
import { PL_EDITOR_CONTEXT } from '../../areas/editor-context.ts';
import { PL_PROPS_OPTIONS } from '../../areas/props-options.ts';
import { PL_PACKAGES_IO } from '../../areas/packages-io.ts';
import { PL_BIBLIOTECA } from '../../areas/biblioteca.ts';
import { PL_GUARDA_CORPO } from '../../areas/guarda-corpo.ts';
import { PL_SUPLEMENTOS } from '../../areas/suplementos.ts';
import { PL_SUPUI } from '../../areas/suplementosUi.ts'; // SUPLEMENTOS (fase H)
import { PL_PAREDE_CORTINA } from '../../areas/parede-cortina-3.ts';

export const PL_ALL = {
  ...PL_GUARDA_CORPO,
  ...PL_SUPLEMENTOS,
  ...PL_SUPUI,
  ...PL_PAREDE_CORTINA,
  ...PL_SHELL_RIBBON,
  ...PL_MISC_UI,
  ...PL_SCHEDULES_EXTRA,
  ...PL_CANVAS_VIEWPORT,
  ...PL_PACKAGES_RENDER,
  ...PL_DIALOGS_STAIRS,
  ...PL_PACKAGES_ENGINE_SCHEDULES,
  ...PL_CANVAS_SHEET,
  ...PL_PROPS_ELEMENTS_C,
  ...PL_CANVAS_NAV,
  ...PL_PACKAGES_ENGINE,
  ...PL_SHELL_CHROME,
  ...PL_PROPS_ELEMENTS_B,
  ...PL_EDITOR_STATUS,
  ...PL_PROPS_ELEMENTS_A,
  ...PL_PROPS_CORE,
  ...PL_DIALOGS_MISC,
  ...PL_PACKAGES_MODEL,
  ...PL_DIALOGS_TYPES,
  ...PL_DIALOGS_OPENING,
  ...PL_DIALOGS_CAD,
  ...PL_EDITOR_CONTEXT,
  ...PL_PROPS_OPTIONS,
  ...PL_PACKAGES_IO,
  ...PL_BIBLIOTECA,
};
