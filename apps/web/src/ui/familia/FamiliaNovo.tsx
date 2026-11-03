import { BIBLIOTECA_BASE, type Familia } from '@hestia/model';
import { useMemo, useState, type ReactElement } from 'react';
import { FamiliaNovoCartao } from './FamiliaNovoCartao.tsx';
import { CATEGORIAS, criarCopiaDeFamilia, filtrarFamilias, type CategoriaGaleria } from './familiaNovo.ts';
import { useFamilia } from './familiaStore.ts';
import { Janela } from './FamiliaJanela.tsx';
import { lerMeusModelosDoNavegador, removerModeloDoNavegador } from './meusModelos.ts';
import './familiaNovo.css';

/** Diálogo "Novo módulo": árvore de categorias, busca e galeria da biblioteca base (mais "Meus modelos"). */

function contarPorCategoria(familias: readonly Familia[]): Record<CategoriaGaleria, number> {
  const contagem: Record<CategoriaGaleria, number> = {
    todas: familias.length,
    marcenaria: 0,
    mobiliario: 0,
    loucas: 0,
    equipamento: 0,
    generico: 0,
    meus: 0,
  };
  for (const f of familias) contagem[f.categoria] += 1;
  return contagem;
}

export function FamiliaNovo(): ReactElement {
  const [categoria, setCategoria] = useState<CategoriaGaleria>('todas');
  const [busca, setBusca] = useState('');
  const [meus, setMeus] = useState<Familia[]>(() => lerMeusModelosDoNavegador());
  const [sel, setSel] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const contagem = useMemo(() => ({ ...contarPorCategoria(BIBLIOTECA_BASE), meus: meus.length }), [meus.length]);
  const fonte = categoria === 'meus' ? meus : BIBLIOTECA_BASE;
  const lista = useMemo(() => filtrarFamilias(fonte, categoria, busca), [fonte, categoria, busca]);
  const selecionada = lista.find((f) => f.id === sel) ?? null;

  const escolherCategoria = (id: CategoriaGaleria): void => {
    setCategoria(id);
    setSel(null);
    setConfirmando(null);
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
              <button type="button" onClick={() => escolherCategoria(c.id)}>{c.rotulo} <span className="fam-novo-cont">{contagem[c.id]}</span></button>
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
