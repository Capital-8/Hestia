import { createRoot } from 'react-dom/client';
import { ativarKernelExperimental, estadoKernel, medicaoOperacoes } from '@hestia/geom';
import './styles.css';
import './ribbon.css';
import './appshell.css';
import './dock.css';
import './contextmenu.css';
import { installAppShell } from './editor/appShell.ts';
import { kernelExperimentalLigado } from './editor/preferenciasKernel.ts';
import { installRecentCommands } from './editor/recentCommands.ts';
import { instalarConsentimentoAnalytics } from './consentimento.ts';
import { App } from './App.tsx';

instalarConsentimentoAnalytics();
installAppShell();
installRecentCommands();

createRoot(document.getElementById('root')!).render(<App />);

// Kernel geométrico experimental: preferência da aplicação (localStorage, com override por `?kernel=`), desligada por
// padrão. A ativação é adiada para o navegador ficar ocioso: baixar 358 kB e instanciar o wasm durante o boot competia
// com a primeira pintura (medido: FCP ~11% pior ao ativar de imediato). Enquanto não fica pronto, o seam usa o
// TypeScript — nenhum resultado muda. Fire-and-forget: nunca bloqueia e o carregador nunca lança.
if (kernelExperimentalLigado()) {
  const ativar = (): void => void ativarKernelExperimental();
  const g = globalThis as { requestIdleCallback?: (cb: () => void, opcoes?: { timeout: number }) => number };
  if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(ativar, { timeout: 4000 });
  else setTimeout(ativar, 2500);
}

// Ganchos de depuração para testes no navegador (?debug=1). `resolveSlabs` e `resolveFloors` deixam o e2e medir o furo da
// escada na laje e a área de cada camada de piso (decisão 0025); `junctionLevel` e `cutLevelByJunction` deixam o e2e
// conferir o recorte da parede pela junção (0023 §10, P7c parte 2).
if (new URLSearchParams(location.search).has('debug')) {
  // Diagnóstico do kernel experimental (docs/decisoes/0045): estado e medição do seam, para o e2e.
  (window as unknown as { __hestiaKernel: unknown }).__hestiaKernel = {
    estado: estadoKernel,
    medicao: medicaoOperacoes,
  };
  void Promise.all([import('./editor/controller.ts'), import('./editor/state.ts'), import('@hestia/engine'), import('@hestia/tools'), import('@hestia/model')]).then(([c, s, e, t, m]) => {
    (window as unknown as { __hestia: unknown }).__hestia = {
      editor: c.editor,
      abrirPorFases: (t: string, n: string) => import('./editor/aberturaProjeto.ts').then((a) => a.abrirProjetoPorFases(t, n)),
      priorizar: (alvo: { nivel?: string; vista?: string }) => import('./editor/aberturaProjeto.ts').then((a) => a.priorizar(alvo)),
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
