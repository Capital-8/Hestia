import { useState, type ReactElement } from 'react';
import type { TexturaItem } from '@hestia/io';
import { useT, type Lang } from '../../../editor/i18n.ts';
import { urlDoMapa } from '../../../editor/texturasOnline.ts';
import { rotuloCategoria } from './texturasLogic.ts';

interface Props {
  item: TexturaItem;
  base: string;
  lang: Lang;
  /** Tamanho dos mapas já formatado (ex.: "12,3"). */
  mb: string;
  podeAplicar: boolean;
  semMaterial: boolean;
  aviso: string;
  onCriar: () => void;
  onAplicar: () => void;
}

/** Pré-visualização maior da textura (baixa o Color.jpg sob demanda) e as duas ações. */
export function TexturasPrevia({ item, base, lang, mb, podeAplicar, semMaterial, aviso, onCriar, onAplicar }: Props): ReactElement {
  const { t } = useT();
  const src = urlDoMapa(base, item.mapas.cor);
  return (
    <>
      {/* `key` recria o estado de carregamento quando a textura muda. */}
      <PreviaImagem key={src} src={src} alt={item.nome} />
      <h3 className="tex-titulo">{item.nome}</h3>
      <p className="hint" title={t('dlt_tex_size_tip')}>
        {rotuloCategoria(item.categoria, lang)} · {t('dlt_tex_size', { mb })}
      </p>
      <p className="hint">{t('dlt_tex_future_note')}</p>
      <div className="tex-acoes" role="group" aria-label={t('dlt_tex_actions_label')}>
        <button className="btn primary" onClick={onCriar}>{t('dlt_tex_create')}</button>
        <button className="btn" disabled={!podeAplicar} aria-describedby={semMaterial ? 'tex-sem-material' : undefined} onClick={onAplicar}>
          {t('dlt_tex_apply')}
        </button>
        {semMaterial ? <p id="tex-sem-material" className="hint">{t('dlt_tex_apply_none')}</p> : null}
      </div>
      <p className="hint" role="status" aria-live="polite">{aviso}</p>
    </>
  );
}

function PreviaImagem({ src, alt }: { src: string; alt: string }): ReactElement {
  const { t } = useT();
  const [fase, setFase] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  return (
    <div className="tex-previa-img">
      {fase !== 'ok' ? <p className="hint">{fase === 'erro' ? t('dlt_tex_preview_error') : t('dlt_tex_preview_loading')}</p> : null}
      <img
        src={src}
        alt={alt}
        onLoad={() => setFase('ok')}
        onError={() => setFase('erro')}
        style={{ display: fase === 'ok' ? 'block' : 'none' }}
      />
    </div>
  );
}
