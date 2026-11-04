import type { ReactElement } from 'react';
import { useState } from 'react';
import { AbaConectores } from './FamiliaEncaixeConectores.tsx';
import { AbaEscolhas } from './FamiliaEncaixeEscolhas.tsx';
import { Janela } from './FamiliaJanela.tsx';
import { useFamilia } from './familiaStore.ts';
import './familiaDialogos.css';
import './familiaEncaixe.css';

/*
 * Diálogo de Encaixe: conectores e escolhas da família (ficha PAINEL-encaixe), no molde dos diálogos de Tipos e
 * Parâmetros — duas abas sobre a família do histórico, com as edições puras de `edicaoEncaixe` como fonte de verdade
 * (um passo de desfazer por edição; a recusa não altera nada).
 */

type Aba = 'conectores' | 'escolhas';
type Registrar = (motivo: string | null) => boolean;

export function DialogoEncaixe(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const [aba, setAba] = useState<Aba>('conectores');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const registrar: Registrar = (motivo) => {
    setMensagem(motivo);
    return motivo === null;
  };
  const trocar = (nova: Aba): void => {
    setAba(nova);
    setMensagem(null);
  };

  return (
    <Janela titulo={`Encaixe da família · ${familia.nome}`} larga>
      <div className="fam-enca-abas" role="tablist" aria-label="Encaixe da família">
        <button role="tab" aria-selected={aba === 'conectores'} className={aba === 'conectores' ? 'on' : ''} onClick={() => { trocar('conectores'); }}>Conectores</button>
        <button role="tab" aria-selected={aba === 'escolhas'} className={aba === 'escolhas' ? 'on' : ''} onClick={() => { trocar('escolhas'); }}>Escolhas</button>
      </div>
      {mensagem !== null && <div className="fam-dlg-erro" role="alert">{mensagem}</div>}
      {aba === 'conectores'
        ? <AbaConectores familia={familia} registrar={registrar} />
        : <AbaEscolhas familia={familia} registrar={registrar} />}
    </Janela>
  );
}
