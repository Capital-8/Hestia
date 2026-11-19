import { duplicarPeca } from '@hestia/model';
import { useEffect } from 'react';
import { idAdicionado, idsDePecas } from './familiaPeca.ts';
import { executarPeca, useAvisoPeca } from './familiaPecaAviso.ts';
import { useFamilia } from './familiaStore.ts';

/*
 * Atalhos das peças (só com o editor aberto e o foco fora de campo de texto): Delete pede a confirmação de exclusão e
 * Ctrl+D duplica a peça selecionada, selecionando a cópia.
 */

export function AtalhosPeca(): null {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      const estado = useFamilia.getState();
      if (!estado.aberta || estado.sel === null) return;
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo !== null && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable);
      if (digitando) return;
      if (e.key === 'Delete') {
        e.preventDefault();
        useAvisoPeca.getState().pedirExclusao(estado.sel);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const antes = idsDePecas(estado.familia());
        const motivo = executarPeca('Duplicar peça', (f) => duplicarPeca(f, estado.sel!));
        if (motivo !== null) return;
        const novo = idAdicionado(antes, idsDePecas(useFamilia.getState().familia()));
        if (novo !== null) useFamilia.getState().selecionarPeca(novo);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);
  return null;
}
