import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';

/**
 * Tela neutra entre o carregamento e a retomada da sessão.
 *
 * Ao recarregar a página com um projeto aberto, a sessão da aba (`editor/sessao.ts`) manda voltar nele — mas abrir um
 * projeto da pasta é assíncrono. Sem esta tela, a Home apareceria por um quadro e "pularia" para o editor. Aqui só o
 * fundo do app e uma linha discreta; quando a sessão não existe (primeira abertura da aba), nem chega a aparecer.
 */
export function TelaDeAbertura(): ReactElement {
  const { t } = useT();
  return (
    <div className="home-abrindo" role="status" aria-live="polite">
      <span className="home-abrindo-texto">{t('bib_opening')}</span>
    </div>
  );
}
