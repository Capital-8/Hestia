import { BIBLIOTECA_BASE, criarFamiliaCaixaria, exportarFamilias, lerArquivo, serializar, type Familia, type ResultadoImportacao } from '@hestia/model';
import { useMemo, useState, type ChangeEvent, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { FamiliaNovoCartao } from './FamiliaNovoCartao.tsx';
import { CATEGORIAS, criarCopiaDeFamilia, filtrarFamilias, type CategoriaGaleria } from './familiaNovo.ts';
import { useFamilia } from './familiaStore.ts';
import { Janela } from './FamiliaJanela.tsx';
import { armazenamentoDoNavegador, baixarTexto, lerMeusModelos, lerMeusModelosDoNavegador, mesclarMeusModelos, removerModeloDoNavegador } from './meusModelos.ts';
import './familiaNovo.css';

/** Diálogo "Novo módulo": árvore de categorias, busca e galeria da biblioteca base (mais "Meus modelos"). */

function contarPorCategoria(familias: readonly Familia[]): Record<CategoriaGaleria, number> {
  const contagem: Partial<Record<CategoriaGaleria, number>> = { todas: familias.length, meus: 0 };
  for (const f of familias) contagem[f.categoria] = (contagem[f.categoria] ?? 0) + 1;
  return contagem as Record<CategoriaGaleria, number>;
}

export function FamiliaNovo(): ReactElement {
  const [categoria, setCategoria] = useState<CategoriaGaleria>('todas');
  const [busca, setBusca] = useState('');
  const [meus, setMeus] = useState<Familia[]>(() => lerMeusModelosDoNavegador());
  const [sel, setSel] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const { t } = useT();

  const contagem = useMemo(() => ({ ...contarPorCategoria(BIBLIOTECA_BASE), meus: meus.length }), [meus.length]);
  const fonte = categoria === 'meus' ? meus : BIBLIOTECA_BASE;
  const lista = useMemo(() => filtrarFamilias(fonte, categoria, busca), [fonte, categoria, busca]);
  const selecionada = lista.find((f) => f.id === sel) ?? null;

  const escolherCategoria = (id: CategoriaGaleria): void => {
    setCategoria(id);
    setSel(null);
    setConfirmando(null);
    setAviso(null);
  };

  /** Baixa "Meus modelos" inteiro num arquivo `hestia-familia` (o mesmo formato de Abrir e salvar). */
  const exportar = (): void => {
    if (meus.length === 0) {
      setAviso({ texto: t('fam_meus_nada_exportar'), erro: true });
      return;
    }
    const nome = 'meus-modelos.hestia-familia.json';
    baixarTexto(nome, serializar(exportarFamilias(meus)));
    setAviso({ texto: t('fam_meus_exportado', { n: meus.length, nome }), erro: false });
  };

  /** Lê um arquivo `hestia-familia` e guarda as famílias válidas em "Meus modelos"; só lê dados, nunca executa nada. */
  const importar = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    let resultado: ResultadoImportacao;
    try {
      resultado = lerArquivo(await arquivo.text());
    } catch (falha) {
      setAviso({ texto: t('fam_meus_erro_importar', { motivo: falha instanceof Error ? falha.message : t('fam_meus_nenhum') }), erro: true });
      return;
    }
    if (resultado.familias.length === 0) {
      setAviso({ texto: t('fam_meus_erro_importar', { motivo: t('fam_meus_nenhum') }), erro: true });
      return;
    }
    const storage = armazenamentoDoNavegador();
    if (storage === null) {
      setAviso({ texto: t('fam_meus_sem_armazenamento'), erro: true });
      return;
    }
    mesclarMeusModelos(storage, resultado.familias);
    const salvos = lerMeusModelos(storage);
    setMeus(salvos);
    if (salvos.length === 0) {
      setAviso({ texto: t('fam_meus_sem_armazenamento'), erro: true });
      return;
    }
    const guardadas = resultado.familias.filter((f) => salvos.some((x) => x.id === f.id)).length;
    const partes = [t('fam_meus_importado', { n: guardadas })];
    if (resultado.ignoradas.length > 0) {
      const motivos = resultado.ignoradas.map((i) => `${i.nome} (${i.motivo})`).join('; ');
      partes.push(t('fam_meus_ignorados', { n: resultado.ignoradas.length, motivos }));
    }
    setAviso({ texto: partes.join(' '), erro: false });
  };

  const criarFamilia = (familia: Familia | null): void => {
    if (familia === null) return;
    const nova = criarCopiaDeFamilia(familia);
    const estado = useFamilia.getState();
    estado.novaFamilia(nova);
    estado.selecionarPeca(nova.pecas[0]?.id ?? null);
    estado.set({ dialogo: null });
  };

  const criar = (): void => criarFamilia(selecionada);

  const criarCaixariaDoZero = (): void => {
    const nova = criarFamiliaCaixaria({ nome: 'Móvel modulado' });
    const estado = useFamilia.getState();
    estado.novaFamilia(nova);
    estado.selecionarPeca(null);
    estado.set({ dialogo: null, modo3d: 'prateleira', vista: '3d', vaoSel: nova.caixaria?.raiz.id ?? null });
  };

  const remover = (id: string): void => {
    setMeus(removerModeloDoNavegador(id));
    setConfirmando(null);
    if (sel === id) setSel(null);
  };

  return (
    <Janela
      titulo="Novo ▸ Família ▸ Escolha o modelo"
      larga
      rodape={
        <>
          <button type="button" className="fam-bt pri" disabled={selecionada === null} onClick={criar}>Criar</button>
          <button type="button" className="fam-bt" onClick={criarCaixariaDoZero}>Criar caixaria do zero</button>
          <span className="fam-mut">{selecionada === null ? 'Escolha um modelo da galeria' : `Cópia de “${selecionada.nome}”`}</span>
        </>
      }
    >
      <div className="fam-novo-grid">
        <ul className="fam-tree fam-novo-categorias">
          <li className="h">Biblioteca</li>
          <li className={categoria === 'todas' ? 'sel' : ''}>
            <button type="button" onClick={() => escolherCategoria('todas')}>Todas <span className="fam-novo-cont">{contagem.todas}</span></button>
          </li>
          {CATEGORIAS.map((c) => (
            <li key={c.id} className={categoria === c.id ? 'sel' : ''}>
              <button type="button" onClick={() => escolherCategoria(c.id)}>{c.rotulo} <span className="fam-novo-cont">{contagem[c.id] ?? 0}</span></button>
            </li>
          ))}
        </ul>
        <div className="fam-novo-main">
          <div className="fam-novo-busca">
            <input
              className="fam-f"
              type="search"
              value={busca}
              placeholder="Buscar por nome ou descrição"
              aria-label="Buscar modelos"
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {categoria === 'meus' && (
            <div className="fam-meus-acoes">
              <button type="button" className="fam-bt" title={t('fam_meus_exportar_dica')} onClick={exportar}>{t('fam_meus_exportar')}</button>
              <label className="fam-bt" title={t('fam_meus_importar_dica')}>
                {t('fam_meus_importar')}
                <input type="file" accept=".json,application/json" hidden aria-label={t('fam_meus_importar')} onChange={(e) => { void importar(e); }} />
              </label>
              {aviso !== null && (
                <span className={`fam-msg${aviso.erro ? ' erro' : ''}`} role={aviso.erro ? 'alert' : 'status'}>{aviso.texto}</span>
              )}
            </div>
          )}
          <div className="fam-gal-scroll">
            {lista.length === 0 ? (
              <div className="fam-hint">
                {categoria === 'meus'
                  ? 'Nenhum modelo guardado ainda. Use “Guardar em Meus modelos” em Abrir e salvar.'
                  : 'Nenhum modelo encontrado com essa busca.'}
              </div>
            ) : (
              <div className="fam-gal">
                {lista.map((f) => (
                  <FamiliaNovoCartao
                    key={f.id}
                    familia={f}
                    selecionada={f.id === sel}
                    onSelecionar={() => setSel(f.id)}
                    onCriar={() => criarFamilia(f)}
                    remocao={categoria === 'meus' ? {
                      confirmando: confirmando === f.id,
                      onPedir: () => setConfirmando(f.id),
                      onConfirmar: () => remover(f.id),
                      onCancelar: () => setConfirmando(null),
                    } : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Janela>
  );
}
