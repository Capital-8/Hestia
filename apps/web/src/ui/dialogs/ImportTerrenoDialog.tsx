import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { lerCsvPontos, lerLevantamentoDxf, type CamadaLevantamento, type LevantamentoDxf, type OrdemColunasCsv, type ResultadoCsv, type SeparadorCsv } from '@hestia/io';
import { formatQuantity, TERRENO_LIMITES, unitsOf, type CadUnit, type Project } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { useT, type Dict } from '../../editor/i18n.ts';
import {
  bloqueioDaImportacao,
  caixaDasFontes,
  contarVertices,
  cotaDoArquivoExibida,
  destinosPadrao,
  fontesDoCsv,
  fontesDoDxf,
  fontesFinais,
  fontesVazias,
  propostaLocalizacao,
  TOLERANCIA_PADRAO,
  type DestinoCamada,
  type FontesImportadas,
  type PropostaLocalizacao,
} from '../../editor/importTerrenoModel.ts';
import { aplicarImportacaoTerreno, fecharImportTerreno, ImportacaoBloqueada, nomeDoTerreno, tipoDoArquivoTerreno, useImportTerrenoAberto } from '../../editor/terrenoImport.ts';
import { Dialog } from './Dialog.tsx';

/** Unidades do DXF, com a chave do rótulo (as mesmas do diálogo de importação de CAD). */
const UNIDADES: ReadonlyArray<{ value: CadUnit; labelKey: keyof Dict }> = [
  { value: 'mm', labelKey: 'dlc_unit_mm' },
  { value: 'cm', labelKey: 'dlc_unit_cm' },
  { value: 'm', labelKey: 'dlc_unit_m' },
  { value: 'ft', labelKey: 'dlc_unit_ft' },
  { value: 'in', labelKey: 'dlc_unit_in' },
];

const DESTINOS: ReadonlyArray<{ value: DestinoCamada; labelKey: keyof Dict }> = [
  { value: 'ignorar', labelKey: 'ui_tn_imp_dest_ignorar' },
  { value: 'pontos', labelKey: 'ui_tn_imp_dest_pontos' },
  { value: 'curvas', labelKey: 'ui_tn_imp_dest_curvas' },
  { value: 'quebras', labelKey: 'ui_tn_imp_dest_quebras' },
];

const SEPARADORES: ReadonlyArray<{ value: SeparadorCsv; labelKey: keyof Dict }> = [
  { value: ';', labelKey: 'ui_tn_imp_sep_pv' },
  { value: ',', labelKey: 'ui_tn_imp_sep_virgula' },
  { value: '\t', labelKey: 'ui_tn_imp_sep_tab' },
  { value: ' ', labelKey: 'ui_tn_imp_sep_espaco' },
];

const ORDENS: ReadonlyArray<{ value: OrdemColunasCsv; labelKey: keyof Dict }> = [
  { value: 'xyz', labelKey: 'ui_tn_imp_ordem_xyz' },
  { value: 'nez', labelKey: 'ui_tn_imp_ordem_nez' },
];

/** Projeto atual (com snapshot de servidor, para renderizar o diálogo também nos testes). */
const projetoAtual = (): Project => editor.project;

/** Arquivo escolhido: nome, tipo e texto. */
interface Arquivo {
  nome: string;
  tipo: 'dxf' | 'csv';
  texto: string;
}

/** Número digitado (vírgula vira ponto); vazio ou inválido cai no padrão. */
const numero = (texto: string, padrao: number): number => {
  const v = Number(texto.replace(',', '.'));
  return Number.isFinite(v) && texto.trim() !== '' ? v : padrao;
};

/**
 * Diálogo "Importar levantamento" (A.6). Aberto por `abrirImportTerreno()`; o `App` o monta (a ligação ao botão da faixa é
 * da ficha U1). Fechado, não renderiza nada.
 */
export function ImportTerrenoDialog(): ReactElement | null {
  const aberto = useImportTerrenoAberto();
  return aberto ? <ImportTerrenoCorpo /> : null;
}

function ImportTerrenoCorpo(): ReactElement {
  const { t, lang } = useT();
  const p = useSyncExternalStore((cb) => editor.store.subscribe(cb), projetoAtual, projetoAtual);
  const units = useMemo(() => unitsOf(p), [p]);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [levelId, setLevelId] = useState(() => useUi.getState().levelId);
  const [nome, setNome] = useState('');
  const [unit, setUnit] = useState<CadUnit | null>(null);
  const [incluirSemCota, setIncluirSemCota] = useState(false);
  const [editados, setEditados] = useState<Record<string, DestinoCamada>>({});
  const [tolerancia, setTolerancia] = useState(String(TOLERANCIA_PADRAO));
  const [separador, setSeparador] = useState<SeparadorCsv | null>(null);
  const [ordem, setOrdem] = useState<OrdemColunasCsv | null>(null);
  const [aceitar, setAceitar] = useState(true);

  const lev = useMemo<LevantamentoDxf | null>(
    () => (arquivo?.tipo === 'dxf' ? lerLevantamentoDxf(arquivo.texto, arquivo.nome, { ...(unit ? { unit } : {}), incluirSemCota }) : null),
    [arquivo, unit, incluirSemCota],
  );
  const csv = useMemo<ResultadoCsv | null>(
    () => (arquivo?.tipo === 'csv' ? lerCsvPontos(arquivo.texto, { ...(separador ? { separador } : {}), ...(ordem ? { ordem } : {}) }) : null),
    [arquivo, separador, ordem],
  );
  const destinos = useMemo(() => ({ ...(lev ? destinosPadrao(lev.camadas) : {}), ...editados }), [lev, editados]);
  const tol = numero(tolerancia, TOLERANCIA_PADRAO);
  const fontes = useMemo<FontesImportadas>(() => (lev ? fontesDoDxf(lev, destinos, tol) : csv ? fontesDoCsv(csv) : fontesVazias()), [lev, csv, destinos, tol]);
  const proposta = useMemo(() => propostaLocalizacao(fontes, p), [fontes, p]);
  const finais = useMemo(() => fontesFinais(fontes, proposta, aceitar), [fontes, proposta, aceitar]);
  const bloqueio = useMemo(() => (arquivo ? bloqueioDaImportacao(finais, levelId, lang) : null), [arquivo, finais, levelId, lang]);
  const vertices = contarVertices(finais);
  const caixa = caixaDasFontes(fontes);
  const cota = (z: number): string => formatQuantity(units, 'length', cotaDoArquivoExibida(p, proposta, aceitar, z), { decimals: 2 });

  const escolher = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setErro(null);
    const tipo = tipoDoArquivoTerreno(f.name);
    if (tipo === null) {
      setArquivo(null);
      setErro(t('ui_tn_imp_erro_tipo'));
      return;
    }
    try {
      setArquivo({ nome: nomeDoTerreno(f.name), tipo, texto: await f.text() });
      setNome(nomeDoTerreno(f.name));
      setUnit(null);
      setEditados({});
      setSeparador(null);
      setOrdem(null);
    } catch {
      setArquivo(null);
      setErro(t('ui_tn_imp_erro_leitura'));
    }
  };

  const aplicar = (): void => {
    if (!arquivo) return;
    setErro(null);
    try {
      const r = aplicarImportacaoTerreno(
        editor.store,
        { levelId, nome: nome.trim() || arquivo.nome, fontes, proposta, aceitarProposta: aceitar, rotulo: t('ui_tn_imp_rotulo_undo') },
        lang,
      );
      fecharImportTerreno();
      useUi.setState({ status: { key: 'ui_tn_imp_status', args: { n: r.vertices } } });
    } catch (e) {
      setErro(e instanceof ImportacaoBloqueada ? t(e.bloqueio.chave, e.bloqueio.args) : e instanceof Error ? e.message : t('ui_tn_imp_erro_leitura'));
    }
  };

  return (
    <Dialog
      title={t('ui_tn_imp_titulo')}
      sub={t('ui_tn_imp_sub')}
      onClose={fecharImportTerreno}
      size="wide"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={fecharImportTerreno}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={aplicar} disabled={!arquivo || bloqueio !== null}>{t('dlc_btn_import')}</button>
        </>
      }
    >
      <label className="fm-field" style={{ display: 'block', marginBottom: 10 }}>
        {t('ui_tn_imp_arquivo')}
        <input type="file" accept=".dxf,.csv" aria-label={t('ui_tn_imp_arquivo')} onChange={(e) => void escolher(e.target.files?.[0])} style={{ marginLeft: 8 }} />
      </label>

      {arquivo ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center', marginBottom: 10 }}>
          <label htmlFor="imp-tn-nome">{t('ui_tn_imp_nome')}</label>
          <input id="imp-tn-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
          <label htmlFor="imp-tn-nivel">{t('col_level')}</label>
          <select id="imp-tn-nivel" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      ) : null}

      {lev ? (
        <SecaoDxf
          lev={lev}
          destinos={destinos}
          onDestino={(camada, d) => setEditados((e) => ({ ...e, [camada]: d }))}
          unit={unit ?? lev.unit}
          onUnit={setUnit}
          incluirSemCota={incluirSemCota}
          onIncluirSemCota={setIncluirSemCota}
          tolerancia={tolerancia}
          onTolerancia={setTolerancia}
          cota={cota}
        />
      ) : null}
      {csv ? <SecaoCsv csv={csv} onSeparador={setSeparador} onOrdem={setOrdem} /> : null}

      {proposta ? (
        <SecaoLocalizacao proposta={proposta} aceitar={aceitar} onAceitar={setAceitar} formatar={(v) => formatQuantity(units, 'length', v, { decimals: 0 })} />
      ) : null}

      {arquivo ? (
        <p role="status" style={{ margin: '10px 0 0' }}>
          {t('ui_tn_imp_total', { n: vertices, max: TERRENO_LIMITES.vertices })}
          {caixa ? ` ${t('ui_tn_imp_faixa_final', { min: cota(caixa.minZ), max: cota(caixa.maxZ) })}` : ''}
        </p>
      ) : null}
      {bloqueio ? <p role="alert" style={{ color: '#b91c1c', margin: '6px 0 0' }}>{t(bloqueio.chave, bloqueio.args)}</p> : null}
      {erro ? <p role="alert" style={{ color: '#b91c1c', margin: '6px 0 0' }}>{erro}</p> : null}
    </Dialog>
  );
}

interface SecaoDxfProps {
  lev: LevantamentoDxf;
  destinos: Readonly<Record<string, DestinoCamada>>;
  onDestino: (camada: string, d: DestinoCamada) => void;
  unit: CadUnit;
  onUnit: (u: CadUnit) => void;
  incluirSemCota: boolean;
  onIncluirSemCota: (v: boolean) => void;
  tolerancia: string;
  onTolerancia: (v: string) => void;
  cota: (z: number) => string;
}

/** Tabela de camadas (contagem, faixa de cota e destino), unidade, entidades sem cota e simplificação. */
function SecaoDxf(props: SecaoDxfProps): ReactElement {
  const { t } = useT();
  const { lev } = props;
  const semCota = lev.camadas.reduce((s, c) => s + c.contagem.semCota, 0);
  const faixa = (c: CamadaLevantamento): string => (c.zMin === null || c.zMax === null ? '—' : `${props.cota(c.zMin)} … ${props.cota(c.zMax)}`);
  const aviso = (codigo: LevantamentoDxf['avisos'][number]['codigo'], n: number): string =>
    t(({ bulge: 'ui_tn_imp_aviso_bulge', malha: 'ui_tn_imp_aviso_malha', bloco: 'ui_tn_imp_aviso_bloco', unidade: 'ui_tn_imp_aviso_unidade' } as const)[codigo], { n });
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>{t('ui_tn_imp_col_camada')}</th>
            <th>{t('ui_tn_imp_col_cotas')}</th>
            <th>{t('ui_tn_imp_col_faixa')}</th>
            <th>{t('ui_tn_imp_col_destino')}</th>
          </tr>
        </thead>
        <tbody>
          {lev.camadas.map((c) => (
            <tr key={c.nome}>
              <td>{c.nome}</td>
              <td>{t('ui_tn_imp_camada_contagem', { n: c.contagem.entidades, pontos: c.contagem.pontos, constantes: c.contagem.constantes, variaveis: c.contagem.variaveis })}</td>
              <td>{faixa(c)}</td>
              <td>
                <select aria-label={`${t('ui_tn_imp_col_destino')}: ${c.nome}`} value={props.destinos[c.nome] ?? 'ignorar'} onChange={(e) => props.onDestino(c.nome, e.target.value as DestinoCamada)}>
                  {DESTINOS.map((d) => <option key={d.value} value={d.value}>{t(d.labelKey)}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {semCota > 0 || props.incluirSemCota ? (
        <label style={{ display: 'block', marginBottom: 6 }}>
          <input type="checkbox" checked={props.incluirSemCota} onChange={(e) => props.onIncluirSemCota(e.target.checked)} /> {t('ui_tn_imp_incluir_sem_cota')}
          {semCota > 0 ? ` (${t('ui_tn_imp_sem_cota_total', { n: semCota })})` : ''}
        </label>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center' }}>
        <label htmlFor="imp-tn-unidade">{t('dlc_unit')}</label>
        <select id="imp-tn-unidade" value={props.unit} onChange={(e) => props.onUnit(e.target.value as CadUnit)}>
          {UNIDADES.map((u) => <option key={u.value} value={u.value}>{t(u.labelKey)}</option>)}
        </select>
        <label htmlFor="imp-tn-tol">{t('ui_tn_imp_simplificar')}</label>
        <input id="imp-tn-tol" className="input" value={props.tolerancia} onChange={(e) => props.onTolerancia(e.target.value)} style={{ width: 90 }} />
      </div>
      {lev.avisos.map((a) => <p key={a.codigo} style={{ margin: '6px 0 0', opacity: 0.8 }}>{aviso(a.codigo, a.n)}</p>)}
    </>
  );
}

/** Separador e ordem das colunas do CSV (detectados e ajustáveis) e o resumo da leitura. */
function SecaoCsv({ csv, onSeparador, onOrdem }: { csv: ResultadoCsv; onSeparador: (s: SeparadorCsv) => void; onOrdem: (o: OrdemColunasCsv) => void }): ReactElement {
  const { t } = useT();
  return (
    <>
      <p role="status" style={{ margin: '0 0 8px' }}>
        {t('ui_tn_imp_csv_resumo', { n: csv.pontos.length / 3, invalidas: csv.invalidas })}
        {csv.cabecalho ? ` ${t('ui_tn_imp_csv_cabecalho')}` : ''}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center' }}>
        <label htmlFor="imp-tn-sep">{t('ui_tn_imp_csv_separador')}</label>
        <select id="imp-tn-sep" value={csv.separador} onChange={(e) => onSeparador(e.target.value as SeparadorCsv)}>
          {SEPARADORES.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
        </select>
        <label htmlFor="imp-tn-ordem">{t('ui_tn_imp_csv_ordem')}</label>
        <select id="imp-tn-ordem" value={csv.ordem} onChange={(e) => onOrdem(e.target.value as OrdemColunasCsv)}>
          {ORDENS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
        </select>
      </div>
    </>
  );
}

/** Proposta de localização para coordenadas grandes, com a caixa de aceite. */
function SecaoLocalizacao({ proposta, aceitar, onAceitar, formatar }: { proposta: PropostaLocalizacao; aceitar: boolean; onAceitar: (v: boolean) => void; formatar: (v: number) => string }): ReactElement {
  const { t } = useT();
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ margin: '0 0 4px' }}>
        {t('ui_tn_imp_loc_proposta', { max: formatar(TERRENO_LIMITES.coordMax), e: formatar(proposta.origemE), n: formatar(proposta.origemN), z: formatar(proposta.cotaZero) })}
      </p>
      <label>
        <input type="checkbox" checked={aceitar} onChange={(e) => onAceitar(e.target.checked)} /> {t('ui_tn_imp_loc_aceitar')}
      </label>
    </div>
  );
}
