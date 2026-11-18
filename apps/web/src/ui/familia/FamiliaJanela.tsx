import type { ReactElement, ReactNode } from 'react';
import { useFamilia } from './familiaStore.ts';

/** Janela de diálogo do editor de famílias (mesma pele dos diálogos do app); fecha ao clicar fora ou no ✕. */
export function Janela({ titulo, children, rodape, larga }: { titulo: string; children: ReactNode; rodape?: ReactNode; larga?: boolean }): ReactElement {
  const fechar = (): void => useFamilia.getState().set({ dialogo: null });
  return (
    <div className="fam-dback" role="presentation" onPointerDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className={`fam-dwin${larga ? ' larga' : ''}`} role="dialog" aria-label={titulo}>
        <div className="fam-dt"><span>{titulo}</span><button aria-label="Fechar" onClick={fechar}>✕</button></div>
        <div className="fam-db">{children}</div>
        <div className="fam-df">{rodape}<span style={{ flex: 1 }} /><button className="fam-bt pri" onClick={fechar}>OK</button></div>
      </div>
    </div>
  );
}
