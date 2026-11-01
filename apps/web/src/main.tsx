import { createRoot } from 'react-dom/client';
import './styles.css';
import './ribbon.css';
import './appshell.css';
import './dock.css';
import './contextmenu.css';
import { installAppShell } from './editor/appShell.ts';
import { installRecentCommands } from './editor/recentCommands.ts';
import { App } from './App.tsx';

installAppShell();
installRecentCommands();

createRoot(document.getElementById('root')!).render(<App />);

// Ganchos de depuração para testes no navegador (?debug=1). `resolveSlabs` e `resolveFloors` deixam o e2e medir o furo da
// escada na laje e a área de cada camada de piso (decisão 0025); `junctionLevel` e `cutLevelByJunction` deixam o e2e
// conferir o recorte da parede pela junção (0023 §10, P7c parte 2).
if (new URLSearchParams(location.search).has('debug')) {
  void Promise.all([import('./editor/controller.ts'), import('./editor/state.ts'), import('@hestia/engine'), import('@hestia/tools'), import('@hestia/model')]).then(([c, s, e, t, m]) => {
    (window as unknown as { __hestia: unknown }).__hestia = {
      editor: c.editor,
      useUi: s.useUi,
      resolveSlabs: e.resolveSlabs,
      resolveFloors: e.resolveFloors,
      resolveStairs: e.resolveStairs,
      stairArrivalTop: e.stairArrivalTop,
      resolveLevel: e.resolveLevel,
      junctionLevel: e.junctionLevel,
      cutLevelByJunction: e.cutLevelByJunction,
      quantifyLevel: e.quantifyLevel,
      sectionSnapIndex: t.sectionSnapIndex,
      model: m,
    };
  });
}
