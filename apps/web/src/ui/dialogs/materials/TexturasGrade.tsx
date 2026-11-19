import type { ReactElement } from 'react';
import { posicaoIcone, type TexturaItem, type TexturasCatalogo } from '@hestia/io';
import { fmtNum, useT } from '../../../editor/i18n.ts';
import { urlDoMapa } from '../../../editor/texturasOnline.ts';
import { megabytes } from './texturasLogic.ts';

/** Lado de cada miniatura na tela (px). O atlas é reduzido a este lado. */
export const LADO_MINIATURA = 84;

interface Props {
  itens: readonly TexturaItem[];
  catalogo: TexturasCatalogo;
  base: string;
  selecionadaId: string | null;
  onSelect: (item: TexturaItem) => void;
}

/**
 * Grade de miniaturas. Todas usam o mesmo atlas (um único download): cada uma mostra o seu quadrado via
 * `background-position`. Item sem ícone no atlas mostra um quadrado neutro.
 */
export function TexturasGrade({ itens, catalogo, base, selecionadaId, onSelect }: Props): ReactElement {
  const { t, lang } = useT();
  const mini = catalogo.miniaturas;
  const atlas = mini ? urlDoMapa(base, mini.arquivo) : null;
  const escala = mini ? LADO_MINIATURA / mini.lado : 1;
  return (
    <div className="tex-grade" role="group" aria-label={t('dlt_tex_grid_label')}>
      {itens.map((it) => {
        const on = it.id === selecionadaId;
        const mb = fmtNum(megabytes(it.bytes), 1, lang);
        const pos = mini && atlas && it.icone !== undefined ? posicaoIcone(mini, it.icone) : null;
        const estiloIcone = pos && mini && atlas
          ? {
              width: LADO_MINIATURA,
              height: LADO_MINIATURA,
              backgroundImage: `url("${atlas}")`,
              backgroundSize: `${mini.colunas * LADO_MINIATURA}px auto`,
              backgroundPosition: `-${pos.x * escala}px -${pos.y * escala}px`,
            }
          : { width: LADO_MINIATURA, height: LADO_MINIATURA };
        return (
          <button
            key={it.id}
            type="button"
            className={`tex-item${on ? ' on' : ''}`}
            aria-pressed={on}
            aria-label={t('dlt_tex_thumb_label', { nome: it.nome, mb })}
            onClick={() => onSelect(it)}
          >
            <span aria-hidden="true" className="tex-icone" style={estiloIcone} />
            <span aria-hidden="true" className="tex-nome">{it.nome}</span>
            <span aria-hidden="true" className="tex-mb">{t('dlt_tex_size', { mb })}</span>
          </button>
        );
      })}
    </div>
  );
}
