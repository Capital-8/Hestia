import { progressoDeConferencia, type FonteCatalogo, type ItemCatalogo } from '@hestia/model';
import type { ReactElement } from 'react';
import { dataDeHoje } from './familiaCatalogoMep.ts';

/*
 * Painel de conferência do item do catálogo (ficha P3, fase 2): progresso "N de M linhas conferidas", selo do item, link para a
 * página do PDF e a fonte citada, o nome de quem confere, "Marcar todas as linhas" com confirmação dentro da página e a
 * exportação das conferências. Sem `confirm()`: a confirmação é um bloco na própria tela.
 */

export interface PainelConferenciaProps {
  item: ItemCatalogo;
  /** Fonte do fabricante; ausente em "Meus catálogos". */
  fonte?: FonteCatalogo;
  /** Itens do catálogo com conferência guardada de outra versão da fonte (ignorada). */
  ignoradas: number;
  conferente: string;
  confirmando: boolean;
  onConferente: (nome: string) => void;
  onPedirTodas: () => void;
  onConfirmarTodas: () => void;
  onCancelarTodas: () => void;
  onExportar: () => void;
}

export function PainelConferencia(p: PainelConferenciaProps): ReactElement {
  const { conferidas, total } = progressoDeConferencia(p.item);
  const conferido = p.item.estado === 'conferido';
  const { fonte } = p;
  return (
    <div className="fam-cmep-conferencia">
      <div className="fam-cmep-linha">
        <span className="fam-cmep-progresso" aria-live="polite">{`${conferidas} de ${total} linhas conferidas`}</span>
        <span className={`fam-cmep-selo${conferido ? ' ok' : ''}`}>{conferido ? 'conferido' : 'CONFERIR'}</span>
        {conferido && <span className="fam-cmep-quem">{`conferido por ${p.item.conferidoPor ?? ''} em ${p.item.conferidoEm ?? ''}`}</span>}
      </div>

      {fonte ? (
        <div className="fam-cat-aviso">
          {`Fonte: ${fonte.documento}${fonte.edicao ? `, ${fonte.edicao}` : ''}${fonte.sha256 ? `, SHA-256 ${fonte.sha256.slice(0, 12)}…` : ''}. `}
          {fonte.url && p.item.pagina !== undefined && (
            <a href={`${fonte.url}#page=${p.item.pagina}`} target="_blank" rel="noopener noreferrer">{`Abrir o PDF na página ${p.item.pagina}`}</a>
          )}
        </div>
      ) : (
        <div className="fam-cat-aviso">Dados seus. A conferência de cada linha fica no próprio item.</div>
      )}

      {p.ignoradas > 0 && (
        <div className="fam-cat-erro" role="alert">
          {`${p.ignoradas} item(ns) deste catálogo tinham conferência de outra versão da fonte (SHA-256 diferente): ignorada(s). Confira de novo com o PDF atual.`}
        </div>
      )}

      <div className="fam-cmep-linha">
        <label>Conferido por <input aria-label="Conferido por" value={p.conferente} onChange={(e) => p.onConferente(e.target.value)} size={14} placeholder="seu nome" /></label>
        <button className="fam-bt" onClick={p.onPedirTodas}>Marcar todas as linhas</button>
        <button className="fam-bt" onClick={p.onExportar}>Exportar conferências</button>
      </div>

      {p.confirmando && (
        <div className="fam-cmep-confirma" role="group" aria-label="Confirmar conferência de todas as linhas">
          <span>{`Marcar as ${total} linhas de ${p.item.nome} como conferidas por ${p.conferente.trim()} em ${dataDeHoje()}? Linhas já conferidas recebem o seu nome e a data de hoje.`}</span>
          <button className="fam-bt pri" onClick={p.onConfirmarTodas}>Confirmar</button>
          <button className="fam-bt" onClick={p.onCancelarTodas}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
