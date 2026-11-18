import type { Familia } from '@hestia/model';
import type { ReactElement } from 'react';
import { miniaturaDaFamilia, type RetanguloMiniatura } from './familiaMiniatura.ts';

/** Cartão da galeria: miniatura de frente, nome, descrição curta e a contagem de tipos. */

interface Remocao {
  confirmando: boolean;
  onPedir: () => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export interface FamiliaNovoCartaoProps {
  familia: Familia;
  selecionada: boolean;
  onSelecionar: () => void;
  onCriar: () => void;
  remocao?: Remocao;
}

function corDoRetangulo(r: RetanguloMiniatura): string {
  if (r.vazio) return 'var(--fam-fundo)';
  if (r.papel === 'porta' || r.papel === 'frente_gaveta') return 'var(--fam-porta)';
  if (r.papel === 'tampo') return 'var(--fam-tampo)';
  if (r.papel === 'fundo' || r.papel === 'generica') return 'var(--fam-fundo)';
  return 'var(--fam-corpo)';
}

function Miniatura({ familia }: { familia: Familia }): ReactElement {
  const miniatura = miniaturaDaFamilia(familia);
  return (
    <svg viewBox={`0 0 ${miniatura.largura} ${miniatura.altura}`} role="img" aria-label={`Miniatura de ${familia.nome}`}>
      {miniatura.retangulos.map((r, i) => (
        <rect key={`${r.papel}-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={corDoRetangulo(r)} fillOpacity={r.vazio ? 0.28 : 0.92} stroke="var(--line-strong)" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

export function FamiliaNovoCartao({ familia, selecionada, onSelecionar, onCriar, remocao }: FamiliaNovoCartaoProps): ReactElement {
  return (
    <div className={`fam-novo-card${selecionada ? ' sel' : ''}`}>
      <button type="button" className="fam-tpl" onClick={onSelecionar} onDoubleClick={onCriar} title="Clique para selecionar; duplo clique para criar">
        <Miniatura familia={familia} />
        <b>{familia.nome}</b>
        <small>{familia.descricao ?? 'Sem descrição.'}</small>
        <span className="fam-tag">{familia.tipos.length} tipos</span>
      </button>
      {remocao && (remocao.confirmando ? (
        <span className="fam-novo-conf" role="group" aria-label={`Remover ${familia.nome}`}>
          Remover?
          <button type="button" className="fam-bt" onClick={remocao.onConfirmar}>Sim</button>
          <button type="button" className="fam-bt" onClick={remocao.onCancelar}>Não</button>
        </span>
      ) : (
        <button type="button" className="fam-novo-rem" aria-label={`Remover ${familia.nome}`} title="Remover de Meus modelos" onClick={remocao.onPedir}>×</button>
      ))}
    </div>
  );
}
