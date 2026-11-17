import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { newId, type Material } from '@hestia/model';
import type { TexturaItem, TexturasCatalogo } from '@hestia/io';
import { editor } from '../../../editor/controller.ts';
import { fmtNum, useT } from '../../../editor/i18n.ts';
import { baseAtual, carregarCatalogo } from '../../../editor/texturasOnline.ts';
import { Dialog } from '../Dialog.tsx';
import { TexturasGrade } from './TexturasGrade.tsx';
import { TexturasPrevia } from './TexturasPrevia.tsx';
import {
  aplicarTexturaNoMaterial,
  categoriasDistintas,
  criarMaterialDaTextura,
  filtrarTexturas,
  LOTE_TEXTURAS,
  megabytes,
  ordenarTexturas,
  paginar,
  podeAplicarTextura,
  rotuloCategoria,
  texturaEhAtual,
} from './texturasLogic.ts';
import './TexturasOnline.css';

type Estado = { fase: 'carregando' } | { fase: 'erro' } | { fase: 'ok'; catalogo: TexturasCatalogo };

interface Props {
  /** Material selecionado no navegador (já gravado). Sem ele, "Aplicar" fica desabilitado. */
  materialSelecionado: Material | undefined;
  /** Recebe o id do material criado, para o navegador selecioná-lo. */
  onCriado: (id: string) => void;
  onClose: () => void;
}

/**
 * Painel "Texturas online" (subdiálogo sobre o gerenciador de materiais). Baixa o catálogo sob demanda; a rede
 * falhando só afeta este painel. Criar e aplicar gravam `aparencia.textura` com `imagemId = catalogo:<id>`.
 * TODO(etapa futura): embutir os JPG no zip do projeto e aplicar a textura no 3D (UV triplanar, escala real).
 */
export function TexturasOnline({ materialSelecionado, onCriado, onClose }: Props): ReactElement {
  const { t, lang } = useT();
  const [base] = useState(baseAtual);
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [limite, setLimite] = useState(LOTE_TEXTURAS);
  const [escolhida, setEscolhida] = useState<TexturaItem | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    carregarCatalogo(fetch, base).then(
      (catalogo) => { if (vivo) setEstado({ fase: 'ok', catalogo }); },
      () => { if (vivo) setEstado({ fase: 'erro' }); },
    );
    return () => { vivo = false; };
  }, [base, tentativa]);

  const catalogo = estado.fase === 'ok' ? estado.catalogo : null;
  const itens = useMemo(() => (catalogo ? ordenarTexturas(catalogo.itens) : []), [catalogo]);
  const categorias = useMemo(() => categoriasDistintas(itens), [itens]);
  const filtrados = useMemo(() => filtrarTexturas(itens, { busca, categoria: categoria || null }), [itens, busca, categoria]);
  const { visiveis, restantes } = paginar(filtrados, limite);
  const podeAplicar = podeAplicarTextura(materialSelecionado, escolhida);

  const tentar = (): void => {
    setEstado({ fase: 'carregando' });
    setTentativa((n) => n + 1);
  };
  const mudarBusca = (v: string): void => {
    setBusca(v);
    setLimite(LOTE_TEXTURAS);
  };
  const mudarCategoria = (v: string): void => {
    setCategoria(v);
    setLimite(LOTE_TEXTURAS);
  };

  // Outra textura escolhida: a confirmação da anterior sai.
  const escolher = (item: TexturaItem): void => {
    setEscolhida(item);
    setAviso('');
  };

  const criar = (): void => {
    if (!escolhida) return;
    const id = newId('mat');
    const m = criarMaterialDaTextura(escolhida, id);
    editor.store.exec({ type: 'upsertMaterial', material: m }, 'dlt_mat_new');
    onCriado(id);
    setAviso(t('dlt_tex_created', { nome: m.name }));
  };
  const aplicar = (): void => {
    if (!escolhida || !materialSelecionado) return;
    const m = aplicarTexturaNoMaterial(materialSelecionado, escolhida);
    editor.store.exec({ type: 'upsertMaterial', material: m }, 'undo_edit_material');
    setAviso(t('dlt_tex_applied', { nome: m.name }));
  };

  const total = itens.length;
  return (
    <Dialog
      title={t('dlt_tex_title')}
      sub={catalogo ? t(total === 1 ? 'dlt_tex_count_one' : 'dlt_tex_count_many', { n: total }) : undefined}
      onClose={onClose}
      z={70}
      size="wide"
      footer={<button className="btn" onClick={onClose}>{t('stt_close')}</button>}
    >
      {estado.fase === 'carregando' ? <p className="hint" role="status">{t('dlt_tex_loading')}</p> : null}
      {estado.fase === 'erro' ? (
        <div className="tex-estado" role="alert">
          <p>{t('dlt_tex_error')}</p>
          <button className="btn small" onClick={tentar}>{t('dlt_tex_retry')}</button>
        </div>
      ) : null}
      {catalogo && total === 0 ? <p className="hint">{t('dlt_tex_empty')}</p> : null}
      {catalogo && total > 0 ? (
        <div className="tex-corpo">
          <div className="tex-lista">
            <div className="tex-barra">
              <input
                id="tex-busca"
                className="input"
                type="search"
                placeholder={t('dlt_tex_search')}
                aria-label={t('dlt_tex_search')}
                value={busca}
                onChange={(e) => mudarBusca(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <select id="tex-categoria" className="select" aria-label={t('dlt_tex_category')} value={categoria} onChange={(e) => mudarCategoria(e.target.value)}>
                <option value="">{t('dlt_tex_all_categories')}</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>{rotuloCategoria(c, lang)}</option>
                ))}
              </select>
            </div>
            {filtrados.length === 0 ? <p className="hint">{t('dlt_tex_no_match')}</p> : (
              <TexturasGrade itens={visiveis} catalogo={catalogo} base={base} selecionadaId={escolhida?.id ?? null} onSelect={escolher} />
            )}
            {filtrados.length > 0 ? (
              <div className="tex-rodape">
                <span className="hint">{t('dlt_tex_showing', { a: visiveis.length, b: filtrados.length })}</span>
                {restantes > 0 ? <button className="btn small" onClick={() => setLimite((n) => n + LOTE_TEXTURAS)}>{t('dlt_tex_show_more')}</button> : null}
              </div>
            ) : null}
          </div>
          <aside className="tex-previa" aria-label={t('dlt_tex_title')}>
            {escolhida ? (
              <TexturasPrevia
                item={escolhida}
                base={base}
                lang={lang}
                mb={fmtNum(megabytes(escolhida.bytes), 1, lang)}
                podeAplicar={podeAplicar}
                semMaterial={materialSelecionado === undefined}
                aviso={aviso}
                atual={texturaEhAtual(materialSelecionado, escolhida)}
                onCriar={criar}
                onAplicar={aplicar}
              />
            ) : (
              <p className="hint">{t('dlt_tex_select_hint')}</p>
            )}
          </aside>
        </div>
      ) : null}
    </Dialog>
  );
}
