// Seção do subelemento da parede cortina (decisão 0056, §10 fase 2): linha (tipo de montante e travar), segmento (remover e
// restaurar) e célula (tipo de painel e "Voltar ao padrão"). Componente PURO: recebe o `kind` e os dados por props e devolve
// cada ação por `onCommand`; não lê nem grava o estado do editor (a ligação ao subelemento selecionado fica para depois).
// Os construtores de comando são exportados para teste.
import type { ReactElement } from 'react';
import type { Command, CurtainPanelType, Id, LineRef, MullionType } from '@hestia/model';
import { useT } from '../editor/i18n.ts';
import { Check, Row } from './fields.tsx';

/** Valor do seletor de montante quando a linha herda o tipo de montante do sistema (sem sobrescrita). */
export const MONTANTE_HERDA = 'herda';
/** Valor do seletor de montante quando a linha não tem montante. */
export const MONTANTE_NENHUM = 'nenhum';

/** Valor do seletor a partir do montante da linha na grade final (undefined = herda, null = sem montante). */
export function valorDoMontante(montante: Id | null | undefined): string {
  if (montante === undefined) return MONTANTE_HERDA;
  if (montante === null) return MONTANTE_NENHUM;
  return montante;
}

/** Comando do seletor de montante. Herdar tira a sobrescrita da linha (`clearLineOverride`). */
export function comandoDoMontante(wallId: Id, line: LineRef, valor: string): Command {
  if (valor === MONTANTE_HERDA) return { type: 'clearLineOverride', wallId, line };
  if (valor === MONTANTE_NENHUM) return { type: 'setLineMullion', wallId, line, mullionTypeId: null };
  return { type: 'setLineMullion', wallId, line, mullionTypeId: valor };
}

/** Comando de travar ou destravar a linha (`locked` é o estado novo). */
export function comandoDaTrava(wallId: Id, line: LineRef, locked: boolean): Command {
  return { type: 'lockGridLine', wallId, line, locked };
}

/** Comando do segmento: restaurar quando está removido; remover quando não está. */
export function comandoDoSegmento(wallId: Id, line: LineRef, k: number, removido: boolean): Command {
  return removido ? { type: 'restoreSegment', wallId, line, k } : { type: 'removeSegment', wallId, line, k };
}

/** Comando do tipo de painel da célula (i, j) da grade atual. */
export function comandoDoPainel(wallId: Id, i: number, j: number, panelTypeId: Id): Command {
  return { type: 'setCellPanel', wallId, i, j, panelTypeId };
}

/** Comando "Voltar ao padrão" da célula (i, j): tira a sobrescrita de painel. */
export function comandoVoltarPadrao(wallId: Id, i: number, j: number): Command {
  return { type: 'clearCellOverride', wallId, i, j };
}

export type SubelementoCortinaProps =
  | {
      kind: 'line';
      wallId: Id;
      line: LineRef;
      /** Montante da linha na grade final (undefined = herda do sistema, null = sem montante). */
      montante: Id | null | undefined;
      travada: boolean;
      montantes: MullionType[];
      onCommand: (c: Command) => void;
    }
  | {
      kind: 'segment';
      wallId: Id;
      line: LineRef;
      k: number;
      removido: boolean;
      onCommand: (c: Command) => void;
    }
  | {
      kind: 'cell';
      wallId: Id;
      i: number;
      j: number;
      /** Tipo de painel efetivo da célula (o da sobrescrita, ou o padrão). */
      painel: Id;
      /** A célula tem sobrescrita de painel própria. */
      sobrescrita: boolean;
      paineis: CurtainPanelType[];
      onCommand: (c: Command) => void;
    };

/** Subelemento selecionado da parede cortina: linha, segmento ou célula, conforme `kind`. */
export function SubelementoCortina(props: SubelementoCortinaProps): ReactElement {
  const { t } = useT();
  if (props.kind === 'line') {
    const { wallId, line, montante, travada, montantes, onCommand } = props;
    return (
      <div>
        <div className="hint">{t('pct_sub_line_title')}</div>
        <Row label={t('pct_sub_line_mullion')} htmlFor="sub-linha-montante">
          <select id="sub-linha-montante" className="select" value={valorDoMontante(montante)} onChange={(e) => onCommand(comandoDoMontante(wallId, line, e.target.value))}>
            <option value={MONTANTE_HERDA}>{t('pct_sub_line_inherit')}</option>
            <option value={MONTANTE_NENHUM}>{t('pct_sub_line_none')}</option>
            {montantes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Row>
        <Row label={t('pct_sub_line_locked')} htmlFor="sub-linha-trava">
          <Check id="sub-linha-trava" checked={travada} onChange={(v) => onCommand(comandoDaTrava(wallId, line, v))} />
        </Row>
      </div>
    );
  }
  if (props.kind === 'segment') {
    const { wallId, line, k, removido, onCommand } = props;
    return (
      <div>
        <div className="hint">{t('pct_sub_seg_title')}</div>
        <div className="hint">{removido ? t('pct_sub_seg_removed') : t('pct_sub_seg_present')}</div>
        <button type="button" className="btn small" onClick={() => onCommand(comandoDoSegmento(wallId, line, k, removido))}>
          {removido ? t('pct_sub_seg_restore') : t('pct_sub_seg_remove')}
        </button>
      </div>
    );
  }
  const { wallId, i, j, painel, sobrescrita, paineis, onCommand } = props;
  return (
    <div>
      <div className="hint">{t('pct_sub_cell_title')}</div>
      <Row label={t('pct_sub_cell_panel')} htmlFor="sub-celula-painel">
        <select id="sub-celula-painel" className="select" value={painel} onChange={(e) => onCommand(comandoDoPainel(wallId, i, j, e.target.value))}>
          {paineis.map((pn) => (
            <option key={pn.id} value={pn.id}>{pn.name}</option>
          ))}
        </select>
      </Row>
      <div className="hint">{sobrescrita ? t('pct_sub_cell_own') : t('pct_sub_cell_follows')}</div>
      <button type="button" className="btn small" disabled={!sobrescrita} onClick={() => onCommand(comandoVoltarPadrao(wallId, i, j))}>
        {t('pct_sub_cell_default')}
      </button>
    </div>
  );
}
