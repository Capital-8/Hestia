import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { editor } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { bibliotecaDoAmbiente } from '../../editor/biblioteca/biblioteca.ts';
import { carregarBiblioteca, publicarBiblioteca, useBiblioteca } from '../../editor/biblioteca/aoVivo.ts';
import './home.css';

/**
 * Tela inicial de projetos (a "Home" do programa).
 *
 * Só o que existe de verdade: o cartão "Em branco" (criar) e os projetos DA PASTA escolhida, cada um com a miniatura da
 * vista 3D. Os modelos de exemplo (casa, prédio, esquadrias…) são material de teste e não aparecem aqui — nem em
 * nenhuma outra lista do programa.
 */

/** Data curta no idioma ativo; data inválida não aparece. */
function dataCurta(iso: string, lang: string): string | null {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return null;
  // units-ok: data/hora localizada, não é formatação de medida.
  return quando.toLocaleString(lang === 'en' ? 'en' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function HomeScreen(): ReactElement {
  const { t, lang } = useT();
  const estado = useBiblioteca();
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const biblioteca = bibliotecaDoAmbiente();
  const temNaoSalvo = useMemo(() => editor.temProjetoNaoSalvo(), []);

  useEffect(() => {
    let vivo = true;
    void carregarBiblioteca().finally(() => {
      if (vivo) setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const escolherPasta = async (): Promise<void> => {
    if (!biblioteca) return;
    try {
      publicarBiblioteca(await biblioteca.escolher());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : t('bib_save_error'));
    }
  };

  const liberar = async (): Promise<void> => {
    if (!biblioteca) return;
    publicarBiblioteca(await biblioteca.liberar());
  };

  const esquecer = async (): Promise<void> => {
    if (!biblioteca) return;
    publicarBiblioteca(await biblioteca.esquecer());
  };

  const abrirProjeto = async (pasta: string): Promise<void> => {
    const r = await editor.abrirDaBiblioteca(pasta);
    if (r.ok) useUi.setState({ tela: 'editor' });
    else setErro(r.error);
  };

  const novoProjeto = (): void => {
    editor.newProject('blank');
    useUi.setState({ tela: 'editor' });
  };

  const continuar = (): void => {
    if (editor.restoreAutosave()) useUi.setState({ tela: 'editor' });
  };

  const abrirArquivo = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    const texto = await f.text();
    const r = editor.openFromText(texto, f.name);
    if (r.ok) useUi.setState({ tela: 'editor' });
    else setErro(r.error);
  };

  const projetos = estado?.projetos ?? [];
  const filtro = busca.trim().toLocaleLowerCase();
  const visiveis = filtro ? projetos.filter((p) => p.nome.toLocaleLowerCase().includes(filtro)) : projetos;

  return (
    <div className="home">
      <header className="home-head">
        <div className="home-brand" aria-hidden="true">H</div>
        <div className="home-titles">
          <h1>{t('bib_home_title')}</h1>
          <p>{estado?.raiz ?? t('bib_home_sub')}</p>
        </div>
        <div className="home-head-actions">
          <button className="btn" onClick={() => arquivoRef.current?.click()}>
            {t('bib_open_file')}
          </button>
          {biblioteca && (
            <button className="btn" onClick={() => void escolherPasta()}>
              {estado?.raiz ? t('bib_change_folder') : t('bib_choose_folder')}
            </button>
          )}
          <input
            ref={arquivoRef}
            type="file"
            accept=".json,.hestia"
            hidden
            onChange={(e) => {
              void abrirArquivo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {!biblioteca && <p className="home-note">{t('bib_unsupported')}</p>}
      {estado?.precisaPermissao && (
        <div className="home-note home-note-warn">
          <span>{t('bib_permission')}</span>
          <button className="btn" onClick={() => void liberar()}>
            {t('bib_allow')}
          </button>
        </div>
      )}
      {erro && <p className="home-note home-note-error">{erro}</p>}
      {carregando && <p className="home-note">{t('bib_loading')}</p>}

      {temNaoSalvo && (
        <button className="home-recover" onClick={continuar}>
          <b>{t('bib_recover_autosave')}</b>
          <span>{t('bib_recover_hint')}</span>
        </button>
      )}

      {estado?.raiz && (
        <div className="home-toolbar">
          <input
            className="home-search"
            type="search"
            placeholder={t('bib_search')}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button className="btn home-forget" onClick={() => void esquecer()}>
            {t('bib_forget_folder')}
          </button>
        </div>
      )}

      <ul className="home-grid">
        {/* Criar: um cartão, sem lista de modelos. A moldura da imagem fica vazia até o projeto ganhar geometria. */}
        <li>
          <button className="home-card home-card-new" onClick={novoProjeto} title={t('bib_new_project')}>
            <span className="home-thumb home-thumb-empty">
              <span className="home-thumb-none">+</span>
            </span>
            <b>{t('bib_new_project')}</b>
            <span className="home-date">{t('bib_new_sub')}</span>
          </button>
        </li>

        {visiveis.map((p) => {
          const data = dataCurta(p.modificadoEm, lang);
          return (
            <li key={p.pasta}>
              <button className="home-card" onClick={() => void abrirProjeto(p.pasta)} title={t('bib_card_open')}>
                <span className="home-thumb">
                  {p.miniatura ? (
                    <img src={p.miniatura} alt="" loading="lazy" />
                  ) : (
                    <span className="home-thumb-none">{t('bib_card_missing')}</span>
                  )}
                </span>
                <b>{p.nome}</b>
                {data && <span className="home-date">{t('bib_saved_at', { date: data })}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {estado?.raiz && visiveis.length === 0 && (
        <p className="home-note home-hint">{filtro ? t('bib_search_none') : t('bib_empty_hint')}</p>
      )}
    </div>
  );
}
