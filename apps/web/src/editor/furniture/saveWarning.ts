import { useUi } from '../state.ts';
import { saveSizeWarningMb } from './budget.ts';

/** Depois de salvar: projeto acima de 40 MB (móveis importados pesam) avisa na barra de status. */
export function avisarTamanhoDoProjeto(jsonLength: number): void {
  const mb = saveSizeWarningMb(jsonLength);
  if (mb !== null) useUi.setState({ status: { key: 'fur_save_big', args: { mb } } });
}
