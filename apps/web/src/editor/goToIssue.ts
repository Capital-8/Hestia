import { fitBox } from '@hestia/render';
import type { ValidationIssue } from '@hestia/model';
import { editor } from './controller.ts';
import { issueTarget } from './issuesView.ts';
import { useUi } from './state.ts';
import { alvoDoAvisoDeTerreno } from './terrenoVista.ts';

/** Seleciona o elemento do aviso e leva a vista até ele. Troca de nível só quando preciso. */
export function goToIssue(issue: ValidationIssue): void {
  // Terreno e região: o nível e a caixa vêm do modelo (`alvoDoAvisoDeTerreno`); os demais elementos seguem o caminho comum.
  const t = alvoDoAvisoDeTerreno(editor.project, issue) ?? issueTarget(editor.project, issue);
  if (!t) {
    useUi.setState({ status: { key: 'edc_element_gone' } });
    return;
  }
  const ui = useUi.getState();
  // selectLevel limpa a seleção, volta à planta e reinicia a ferramenta; por isso só é usado quando o nível muda.
  if (t.levelId && t.levelId !== ui.levelId) editor.selectLevel(t.levelId);
  else if (ui.view !== 'plan') editor.setView('plan');
  useUi.setState({ selection: [t.elementId] });
  const v = editor.viewport();
  // Piso: enquadra a caixa do contorno; parede e abertura: centraliza no ponto médio.
  if (t.box && v) editor.setViewport(fitBox(v, t.box));
  else if (t.center && v) editor.setViewport({ ...v, cx: t.center.x, cy: t.center.y });
}
