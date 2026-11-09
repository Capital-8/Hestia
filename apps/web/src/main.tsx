import { createRoot } from 'react-dom/client';
import { estadoKernel, medicaoOperacoes } from '@hestia/geom';
import { iniciarDespachoKernel } from '@hestia/engine';
import './styles.css';
import './ribbon.css';
import './appshell.css';
import './dock.css';
import './contextmenu.css';
import { installAppShell } from './editor/appShell.ts';
import { configDoDespacho } from './editor/preferenciasKernel.ts';
import { installRecentCommands } from './editor/recentCommands.ts';
import { instalarConsentimentoAnalytics } from './consentimento.ts';
import { App } from './App.tsx';

instalarConsentimentoAnalytics();
installAppShell();
installRecentCommands();

createRoot(document.getElementById('root')!).render(<App />);

// Kernel Rust sempre ativo em produção (decisão do dono de 2026-11-06): fatias A e B do v2 (0047 §12, 0050) e kernel v1 (booleanas e offset). Só em DEV a URL (`?kernel=ts`, `?kernelFatias=`) desliga, para depuração. `resolveLevel` passa a pedir o nível ao Rust
// (no modo sombra, também compara com o TS, que nunca é o resultado exibido). O despacho é instalado já no boot: até o wasm carregar, o editor mostra
// "calculando…" (`kernelPendente`) em vez de resultado do TypeScript, e recalcula quando ele chega. Se o wasm falhar, o erro é explícito (nunca TypeScript). Sem a
// fatia ligada (só DEV), nada é instalado nem baixado.
const despacho = configDoDespacho();
if (despacho.fatiaA || despacho.fatiaB) void iniciarDespachoKernel(despacho);

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
      // Miniatura da biblioteca (o e2e confere que ela sai com o modelo, salvando fora da aba 3D).
      miniatura: () => import('./editor/miniatura.ts').then((m) => m.capturarMiniatura3d()),
      resolveLevel: e.resolveLevel,
      junctionLevel: e.junctionLevel,
      cutLevelByJunction: e.cutLevelByJunction,
      quantifyLevel: e.quantifyLevel,
      sectionSnapIndex: t.sectionSnapIndex,
      // Guarda-corpo (decisão 0055, §21): o e2e mede malha, linhas, visibilidade por categoria e IFC no navegador real.
      servicoGuardaCorpo: e.servicoGuardaCorpo,
      visibilidade: () => import('./editor/viewVisibility.ts'),
      ifc: () => import('./editor/ifcExport.ts'),
      model: m,
    };
  });
}
