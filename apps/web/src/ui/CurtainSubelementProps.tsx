// Seção do subelemento da parede cortina (decisão 0056, §10 fase 2 e fase 5): linha (tipo de montante e travar), segmento (remover e
// restaurar), célula (tipo de painel e "Voltar ao padrão") e célula com porta ou janela (tipo, inversões, marca, modo, alinhamento
// e remover). Componente PURO: recebe o `kind` e os dados por props e devolve cada ação por `onCommand`; não lê nem grava o estado
// do editor. Os construtores de comando são exportados para teste.
import type { ReactElement } from 'react';
import type { Command, CurtainPanelType, Id, LineRef, MullionType } from '@hestia/model';
import { useT } from '../editor/i18n.ts';
import { Check, NumField, Row } from './fields.tsx';
import { TypeSelector, type TypeOption } from './TypeSelector.tsx';

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

/** Comando da posição (m) de uma linha extra ou gerada (`moveGridLine`). */
export function comandoPosicaoDaLinha(wallId: Id, line: LineRef, pos: number): Command {
  return { type: 'moveGridLine', wallId, line, pos };
}

/** Comando "Apagar linha" (só linha extra): tira a linha e o que ficou preso a ela. */
export function comandoApagarLinha(wallId: Id, line: LineRef): Command {
  return { type: 'removeGridLine', wallId, line };
}

/** Comando "Voltar ao padrão" de uma linha gerada: tira a sobrescrita dela (posição, trava e montante). */
export function comandoVoltarPadraoDaLinha(wallId: Id, line: LineRef): Command {
  return { type: 'clearLineOverride', wallId, line };
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

/** Trocar o tipo da porta ou janela da célula (i, j). Se o novo tipo não cabe, o modelo recusa e o app avisa. */
export function comandoTipoEsquadria(wallId: Id, i: number, j: number, openingTypeId: Id): Command {
  return { type: 'updateCellOpening', wallId, i, j, patch: { openingTypeId } };
}

/** Inverter o giro (`flipHand`) ou o sentido (`flipFacing`) da esquadria da célula. */
export function comandoInverterEsquadria(wallId: Id, i: number, j: number, campo: 'flipHand' | 'flipFacing', valor: boolean): Command {
  return { type: 'updateCellOpening', wallId, i, j, patch: campo === 'flipHand' ? { flipHand: valor } : { flipFacing: valor } };
}

/** Marca da esquadria da célula (etiqueta e tabela). */
export function comandoMarcaEsquadria(wallId: Id, i: number, j: number, mark: string): Command {
  return { type: 'updateCellOpening', wallId, i, j, patch: { mark } };
}

/** Modo da esquadria da célula: preencher a célula (`cell`) ou ajustar a grade à porta (`grid`). */
export function comandoModoEsquadria(wallId: Id, i: number, j: number, fit: 'cell' | 'grid'): Command {
  return { type: 'updateCellOpening', wallId, i, j, patch: { fit } };
}

/** Alinhamento da grade ajustada à porta (centro, início ou fim da célula). */
export function comandoAlinhamentoEsquadria(wallId: Id, i: number, j: number, align: 'center' | 'start' | 'end'): Command {
  return { type: 'updateCellOpening', wallId, i, j, patch: { align } };
}

/** Peitoril da janela na célula (m; `null` = a base da célula). Só o campo do patch muda; o modelo refaz a colocação. */
export function comandoPeitoril(wallId: Id, i: number, j: number, sillOverride: number | null): Command {
  return { type: 'updateCellOpening', wallId, i, j, patch: { sillOverride } };
}

/**
 * Valor digitado do peitoril (m) para o comando: vazio = a base da célula (`null`); número (vírgula ou ponto) não negativo; `undefined` se não
 * é um valor válido (o campo volta ao que estava).
 */
export function valorDoPeitoril(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (limpo === '') return null;
  const n = Number(limpo.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Remover a porta ou janela da célula: a célula volta ao padrão e as linhas presas que sobrarem saem. */
export function comandoRemoverEsquadria(wallId: Id, i: number, j: number): Command {
  return { type: 'removeCellOpening', wallId, i, j };
}

export type SubelementoCortinaProps =
  | {
      kind: 'line';
      wallId: Id;
      line: LineRef;
      /** Montante da linha na grade final (undefined = herda do sistema, null = sem montante). */
      montante: Id | null | undefined;
      travada: boolean;
      /** Posição (m) da linha na grade final, a partir do início (U) ou da base (V). */
      pos: number;
      /** Linha extra (apaga-se) ou gerada do tipo (volta-se ao padrão). */
      extra: boolean;
      /** Linha gerada com sobrescrita própria (posição, trava ou montante): "Voltar ao padrão" fica ativo. */
      sobrescrita: boolean;
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
      /** A célula tem porta ou janela: o painel fica sob ela (só leitura) e o botão leva à esquadria. */
      comEsquadria?: boolean;
      onSelecionarEsquadria?: () => void;
      onCommand: (c: Command) => void;
    }
  | {
      /** Esquadria da célula (fase 5): tipo, inversões, marca, modo, alinhamento, peitoril e remover. */
      kind: 'opening';
      wallId: Id;
      i: number;
      j: number;
      tipo: 'door' | 'window';
      openingTypeId: Id;
      flipHand: boolean;
      flipFacing: boolean;
      mark: string;
      fit: 'cell' | 'grid';
      align: 'center' | 'start' | 'end';
      /** Peitoril por instância (m); `null` = a base da célula. */
      peitoril: number | null;
      /** Tipos de esquadria do seletor (os de porta ou de janela, conforme `tipo`) e os favoritos. */
      tipos: TypeOption[];
      favoritos: readonly Id[];
      onEditarTipo: () => void;
      onSelecionarCelula: () => void;
      onCommand: (c: Command) => void;
    };

/** Subelemento selecionado da parede cortina: linha, segmento, célula ou célula com esquadria, conforme `kind`. */
export function SubelementoCortina(props: SubelementoCortinaProps): ReactElement {
  const { t } = useT();
  if (props.kind === 'opening') {
    const { wallId, i, j, tipo, openingTypeId, flipHand, flipFacing, mark, fit, align, peitoril, tipos, favoritos, onEditarTipo, onSelecionarCelula, onCommand } = props;
    return (
      <div>
        <div className="hint">{t('pct_sub_opening_title')}</div>
        <TypeSelector
          categoryLabel={t(tipo === 'door' ? 'prb_place_door' : 'prb_place_window')}
          triggerId="sub-opening-type"
          label={t('prb_prop_type_opening')}
          options={tipos}
          selectedId={openingTypeId}
          favoriteIds={favoritos}
          onSelect={(id) => onCommand(comandoTipoEsquadria(wallId, i, j, id))}
          onEdit={onEditarTipo}
        />
        <div>
          <button id="sub-opening-hand" type="button" className="btn small" aria-pressed={flipHand} onClick={() => onCommand(comandoInverterEsquadria(wallId, i, j, 'flipHand', !flipHand))}>
            {t('pct_flip_hand')}
          </button>
          <button id="sub-opening-facing" type="button" className="btn small" aria-pressed={flipFacing} onClick={() => onCommand(comandoInverterEsquadria(wallId, i, j, 'flipFacing', !flipFacing))}>
            {t('pct_flip_facing')}
          </button>
        </div>
        <Row label={t('pct_mark')} htmlFor="sub-opening-mark">
          <input id="sub-opening-mark" className="input" defaultValue={mark} onBlur={(e) => {
            if (e.target.value !== mark) onCommand(comandoMarcaEsquadria(wallId, i, j, e.target.value));
          }} />
        </Row>
        <Row label={t('pct_mode')} htmlFor="sub-opening-fit">
          <select id="sub-opening-fit" className="select" value={fit} onChange={(e) => onCommand(comandoModoEsquadria(wallId, i, j, e.target.value as 'cell' | 'grid'))}>
            <option value="cell">{t('pct_fit_cell')}</option>
            <option value="grid">{t('pct_fit_grid')}</option>
          </select>
        </Row>
        {fit === 'grid' && (
          <Row label={t('pct_justify')} htmlFor="sub-opening-align">
            <select id="sub-opening-align" className="select" value={align} onChange={(e) => onCommand(comandoAlinhamentoEsquadria(wallId, i, j, e.target.value as 'center' | 'start' | 'end'))}>
              <option value="center">{t('pct_justify_center')}</option>
              <option value="start">{t('pct_justify_start')}</option>
              <option value="end">{t('pct_justify_end')}</option>
            </select>
          </Row>
        )}
        <Row label={t('pct_sub_opening_sill')} htmlFor="sub-opening-sill">
          <input
            key={`sill-${peitoril ?? 'padrao'}`}
            id="sub-opening-sill"
            className="input"
            type="text"
            inputMode="decimal"
            defaultValue={peitoril ?? ''}
            placeholder={t('pct_sub_opening_sill_default')}
            onBlur={(e) => {
              const valor = valorDoPeitoril(e.target.value);
              if (valor !== undefined && valor !== peitoril) onCommand(comandoPeitoril(wallId, i, j, valor));
            }}
          />
        </Row>
        <div>
          <button id="sub-opening-cell" type="button" className="btn small" onClick={onSelecionarCelula}>
            {t('pct_sub_opening_select_cell')}
          </button>
          <button id="sub-opening-remove" type="button" className="btn small" onClick={() => onCommand(comandoRemoverEsquadria(wallId, i, j))}>
            {t('pct_remove_opening')}
          </button>
        </div>
      </div>
    );
  }
  if (props.kind === 'line') {
    const { wallId, line, montante, travada, pos, extra, sobrescrita, montantes, onCommand } = props;
    return (
      <div>
        <div className="hint">{t('pct_sub_line_title')}</div>
        <Row label={t('pct_inst_extra_pos')} htmlFor="sub-linha-pos">
          <NumField
            id="sub-linha-pos"
            value={pos}
            quantity="length"
            decimals={3}
            onCommit={(v) => {
              if (Math.abs(v - pos) > 1e-9) onCommand(comandoPosicaoDaLinha(wallId, line, v));
            }}
          />
        </Row>
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
        {extra ? (
          <button id="sub-linha-apagar" type="button" className="btn small" onClick={() => onCommand(comandoApagarLinha(wallId, line))}>
            {t('pct_inst_extra_delete')}
          </button>
        ) : (
          <button id="sub-linha-padrao" type="button" className="btn small" disabled={!sobrescrita} onClick={() => onCommand(comandoVoltarPadraoDaLinha(wallId, line))}>
            {t('pct_sub_cell_default')}
          </button>
        )}
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
  const { wallId, i, j, painel, sobrescrita, paineis, comEsquadria = false, onSelecionarEsquadria, onCommand } = props;
  // Célula com esquadria: o painel fica sob ela (só leitura: o modelo recusa trocar) e "Voltar ao padrão" não aparece, pois apagaria a esquadria.
  return (
    <div>
      <div className="hint">{t('pct_sub_cell_title')}</div>
      <Row label={t('pct_sub_cell_panel')} htmlFor="sub-celula-painel">
        <select id="sub-celula-painel" className="select" value={painel} disabled={comEsquadria} onChange={(e) => onCommand(comandoDoPainel(wallId, i, j, e.target.value))}>
          {paineis.map((pn) => (
            <option key={pn.id} value={pn.id}>{pn.name}</option>
          ))}
        </select>
      </Row>
      {comEsquadria ? (
        <>
          <div className="hint">{t('pct_sub_cell_under_opening')}</div>
          <button id="sub-celula-esquadria" type="button" className="btn small" onClick={onSelecionarEsquadria}>
            {t('pct_sub_cell_select_opening')}
          </button>
        </>
      ) : (
        <>
          <div className="hint">{sobrescrita ? t('pct_sub_cell_own') : t('pct_sub_cell_follows')}</div>
          <button type="button" className="btn small" disabled={!sobrescrita} onClick={() => onCommand(comandoVoltarPadrao(wallId, i, j))}>
            {t('pct_sub_cell_default')}
          </button>
        </>
      )}
    </div>
  );
}
