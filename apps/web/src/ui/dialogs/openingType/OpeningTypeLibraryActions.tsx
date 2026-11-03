import { useRef, useState, type ReactElement } from 'react';
import {
  duplicateOpeningType,
  exportOpeningTypes,
  importOpeningTypes,
  openingFavorites,
  type ImportOpeningTypesResult,
  type OpeningType,
  type Project,
} from '@hestia/model';
import { editor, useProject } from '../../../editor/controller.ts';
import { saveText } from '../../../editor/saveText.ts';
import { useUi } from '../../../editor/state.ts';
import { resolveText, useT, type Dict, type Lang, type TextLike } from '../../../editor/i18n.ts';

/** Nome do arquivo de tipos de esquadria gerado pela biblioteca (muda com o idioma). */
const arquivoTipos = (lang: Lang): string => (lang === 'en' ? 'opening-types.hestia-types.json' : 'tipos-esquadrias.hestia-tipos.json');

/** Projeto com o tipo em edição no lugar do gravado: duplicar e exportar levam o que está na tela (o rascunho). */
const comRascunho = (p: Project, t: OpeningType): Project => ({ ...p, openingTypes: { ...p.openingTypes, [t.id]: t } });

type Traduzir = (key: keyof Dict, args?: Record<string, string | number>) => string;

/** Frase do resultado da importação, para a barra de status e para o diálogo. */
function resumoDaImportacao(r: ImportOpeningTypesResult, tr: Traduzir): string {
  if (r.imported.length === 0 && r.skipped.length === 0) return tr('dlo_msg_import_empty');
  const pulados = r.skipped.length > 0
    ? tr(r.skipped.length === 1 ? 'dlo_msg_import_skipped_one' : 'dlo_msg_import_skipped_many', { n: r.skipped.length })
    : '';
  return tr(r.imported.length === 1 ? 'dlo_msg_import_done_one' : 'dlo_msg_import_done_many', { n: r.imported.length, skipped: pulados });
}

const linha = { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px' } as const;

/**
 * Ações da biblioteca sobre o tipo em edição: duplicar, exportar (o tipo, ou os favoritos) e importar um arquivo.
 * Cada ação grava (ou gera o arquivo) e mostra o resultado na barra de status e logo abaixo dos botões.
 */
export function OpeningTypeLibraryActions({ type }: { type: OpeningType }): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const entrada = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<TextLike | null>(null);
  const [resultado, setResultado] = useState<ImportOpeningTypesResult | null>(null);
  const favoritos = openingFavorites(p).filter((id) => p.openingTypes[id]);
  const falha = (e: unknown): string => (e instanceof Error ? e.message : t('dlo_err_unknown'));

  const diz = (texto: TextLike): void => {
    setMsg(texto);
    useUi.setState({ status: texto });
  };

  /** Cópia com nome e código novos; a cópia passa a ser o tipo em edição (como o "Duplicar" do cabeçalho). */
  const duplica = (): void => {
    try {
      const copia = duplicateOpeningType(comRascunho(editor.project, type), type.id);
      editor.store.exec({ type: 'upsertOpeningType', openingType: copia }, t('dlo_cmd_duplicate_type'));
      useUi.setState({ dialogArg: copia.id });
      setResultado(null);
      diz({ key: 'dlo_msg_duplicated', args: { name: copia.name } });
    } catch (e) {
      diz(falha(e));
    }
  };

  const exporta = async (ids: string[]): Promise<void> => {
    try {
      const arquivo = exportOpeningTypes(comRascunho(editor.project, type), ids);
      diz(await saveText(arquivoTipos(lang), JSON.stringify(arquivo, null, 2) + '\n'));
    } catch (e) {
      diz(falha(e));
    }
  };

  /** Lê o arquivo escolhido e grava os tipos numa só transação (um Desfazer desfaz a importação inteira). */
  const importa = async (arq: File | undefined): Promise<void> => {
    if (!arq) return;
    let dado: unknown;
    try {
      dado = JSON.parse(await arq.text());
    } catch {
      setResultado(null);
      diz(t('dlo_err_json'));
      return;
    }
    try {
      const r = importOpeningTypes(editor.project, dado);
      if (r.commands.length > 0) editor.store.exec({ type: 'batch', commands: r.commands }, t('dlo_cmd_import'));
      setResultado(r);
      diz(resumoDaImportacao(r, t));
    } catch (e) {
      setResultado(null);
      diz(falha(e));
    }
  };

  return (
    <div className="op-lib-actions">
      <div className="op-lib-title">{t('col_type')}</div>
      <div style={linha}>
        <button type="button" className="btn small" onClick={duplica}>{t('dlo_btn_duplicate_short')}</button>
        <button type="button" className="btn small" onClick={() => void exporta([type.id])}>{t('dlo_btn_export')}</button>
        {favoritos.length > 0 ? (
          <button type="button" className="btn small" onClick={() => void exporta(favoritos)}>
            {t('dlo_btn_export_favorites', { n: favoritos.length })}
          </button>
        ) : null}
        <button type="button" className="btn small" onClick={() => entrada.current?.click()}>{t('dlo_btn_import')}</button>
        <input
          ref={entrada}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void importa(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {msg ? <p role="status" style={{ margin: '2px 8px 6px', fontSize: 11, color: 'var(--fg-soft)' }}>{resolveText(msg, lang)}</p> : null}
      {resultado && resultado.skipped.length > 0 ? (
        <ul aria-label={t('dlo_aria_skipped')} style={{ margin: '0 8px 8px', paddingLeft: 16, fontSize: 11, color: 'var(--fg-soft)' }}>
          {resultado.skipped.map((s, i) => (
            <li key={`${i}-${s.name}`}>
              <b>{s.name}</b>: {s.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
