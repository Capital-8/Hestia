import {
  conferirItem,
  csvDoItem,
  editarLinha,
  familiaDoItem,
  itemDeCsv,
  KRONA_ESGOTO,
  KRONA_SOLDAVEL,
  OPCOES_MATERIAL_CORPO,
  paraIdsDeParametro,
  RECEITAS_MEP,
  validarItemCatalogo,
  type DominioMep,
  type ItemCatalogo,
} from '@hestia/model';
import { useMemo, useState, type ReactElement } from 'react';
import { Janela } from './FamiliaJanela.tsx';
import { dataDeHoje, guardarItemNoNavegador, lerMeusItensDoNavegador, proximoIdDeItem, removerItemDoNavegador } from './familiaCatalogoMep.ts';
import { idsAbertosNestaSessao, proximoIdDeUsuario, registrarIdAberto } from './familiaNovo.ts';
import { useFamilia } from './familiaStore.ts';
import { armazenamentoDoNavegador, baixarTexto, mesclarMeusModelos } from './meusModelos.ts';
import './familiaCatalogo.css';
import './familiaCatalogoMep.css';
import './familiaDialogos.css';

/*
 * Catálogos de tubos e conexões (fase 2, ficha P3). Três fontes: os catálogos do fabricante (somente leitura, sempre CONFERIR até
 * alguém conferir com o PDF), e "Meus catálogos" (editáveis: importar CSV, editar células, conferir, copiar do fabricante). Daqui
 * sai uma família: escolha a receita de geometria e o domínio e ela entra no editor e em "Meus modelos".
 */

type Fonte = 'esgoto' | 'soldavel' | 'meus';
const FONTES: ReadonlyArray<{ id: Fonte; rotulo: string }> = [
  { id: 'esgoto', rotulo: 'Krona — esgoto' },
  { id: 'soldavel', rotulo: 'Krona — água fria soldável' },
  { id: 'meus', rotulo: 'Meus catálogos' },
];

const num = (v: number | undefined): string => (v === undefined ? '' : String(v));

export function FamiliaCatalogoMep(): ReactElement {
  const [fonte, setFonte] = useState<Fonte>('esgoto');
  const [meus, setMeus] = useState<ItemCatalogo[]>(() => lerMeusItensDoNavegador());
  const [itemId, setItemId] = useState<string>(KRONA_ESGOTO.itens[0]?.id ?? '');
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [csvAberto, setCsvAberto] = useState(false);
  const [csv, setCsv] = useState('bitola;codigo;B;Db;De;e\n');
  const [meta, setMeta] = useState({ nome: 'Meu item', tipo: 'tubo', serie: 'Minha série' });
  const [conferente, setConferente] = useState('');
  const [novaBitola, setNovaBitola] = useState('');
  const [receita, setReceita] = useState(RECEITAS_MEP[0]?.id ?? 'tubo');
  const [dominio, setDominio] = useState<DominioMep>('esgoto');
  const [nomeFamilia, setNomeFamilia] = useState('');
  const [material, setMaterial] = useState('');

  const itens = fonte === 'esgoto' ? KRONA_ESGOTO.itens : fonte === 'soldavel' ? KRONA_SOLDAVEL.itens : meus;
  const item = itens.find((i) => i.id === itemId) ?? itens[0];
  const editavel = fonte === 'meus';
  const problemas = useMemo(() => (item ? validarItemCatalogo(item) : []), [item]);
  const letras = item ? Object.keys(item.colunas) : [];
  const def = RECEITAS_MEP.find((r) => r.id === receita);

  const dizer = (texto: string, erro = false): void => setAviso({ texto, erro });
  const escolherFonte = (f: Fonte): void => {
    setFonte(f);
    const lista = f === 'esgoto' ? KRONA_ESGOTO.itens : f === 'soldavel' ? KRONA_SOLDAVEL.itens : meus;
    setItemId(lista[0]?.id ?? '');
    setAviso(null);
  };
  const salvar = (novo: ItemCatalogo): void => setMeus(guardarItemNoNavegador(novo));

  const importar = (): void => {
    const id = proximoIdDeItem(meus.map((i) => i.id));
    const r = itemDeCsv(csv, { id, nome: meta.nome, tipo: meta.tipo, serie: meta.serie });
    if (!r.item) return dizer(r.problemas.join(' '), true);
    salvar(r.item);
    setFonte('meus');
    setItemId(id);
    setCsvAberto(false);
    dizer(r.problemas.length > 0 ? `Importado com ${r.problemas.length} aviso(s): ${r.problemas.slice(0, 3).join(' ')}` : `Importado: ${r.item.linhas.length} linha(s). Marcado CONFERIR.`, r.problemas.length > 0);
  };

  const copiarParaMeus = (): void => {
    if (!item) return;
    const id = proximoIdDeItem(meus.map((i) => i.id));
    salvar(paraIdsDeParametro(item, id, `${item.nome} (cópia)`));
    setFonte('meus');
    setItemId(id);
    dizer('Copiado para Meus catálogos, com as letras do desenho trocadas pelos nomes de parâmetro (D→Db, d→De, A→Aext). Complete a espessura (e) se faltar.');
  };

  const editarCelula = (bitola: string, coluna: string, texto: string): void => {
    if (!item) return;
    const v = Number(texto.replace(',', '.'));
    if (texto.trim() === '' || !Number.isFinite(v)) return;
    salvar(editarLinha(item, bitola, { [coluna]: v }));
  };

  const adicionarLinha = (): void => {
    if (!item || novaBitola.trim() === '') return;
    if (item.linhas.some((l) => l.bitola === novaBitola.trim())) return dizer('Essa bitola já existe no item.', true);
    salvar(editarLinha(item, novaBitola.trim(), {}));
    setNovaBitola('');
  };

  const removerLinha = (bitola: string): void => {
    if (item) salvar({ ...item, linhas: item.linhas.filter((l) => l.bitola !== bitola), estado: 'CONFERIR' });
  };

  const conferir = (): void => {
    if (!item) return;
    try {
      salvar(conferirItem(item, conferente, dataDeHoje()));
      dizer(`Conferido por ${conferente.trim()} em ${dataDeHoje()}.`);
    } catch (e) {
      dizer(e instanceof Error ? e.message : String(e), true);
    }
  };

  const criarFamilia = (): void => {
    if (!item) return;
    const id = proximoIdDeUsuario(idsAbertosNestaSessao());
    const nome = nomeFamilia.trim() === '' ? `${def?.rotulo ?? 'Peça'} — ${item.nome}` : nomeFamilia.trim();
    const r = familiaDoItem(item, { receita, id, nome, dominio, ...(material === '' ? {} : { material }) });
    if (!r.ok) return dizer(r.erros.join(' '), true);
    registrarIdAberto(id);
    const storage = armazenamentoDoNavegador();
    if (storage !== null) mesclarMeusModelos(storage, [r.familia]);
    const estado = useFamilia.getState();
    estado.novaFamilia(r.familia);
    estado.set({ dialogo: null });
  };

  return (
    <Janela titulo="Catálogos de tubos e conexões" larga>
      <div className="fam-cat-abas" role="tablist" aria-label="Catálogos">
        {FONTES.map((f) => (
          <button key={f.id} role="tab" aria-selected={fonte === f.id} className={`fam-cat-aba${fonte === f.id ? ' on' : ''}`} onClick={() => escolherFonte(f.id)}>{f.rotulo}</button>
        ))}
      </div>
      <div className="fam-cat-aviso">
        {editavel ? 'Seus dados. Edite as células, importe CSV ou copie um item do fabricante. Tudo nasce CONFERIR; só você marca como conferido.' : `Transcrição automática do catálogo do fabricante (${(fonte === 'esgoto' ? KRONA_ESGOTO : KRONA_SOLDAVEL).fonte.documento}, ${(fonte === 'esgoto' ? KRONA_ESGOTO : KRONA_SOLDAVEL).fonte.edicao}). Somente leitura: confira com o PDF antes de usar em projeto.`}
      </div>

      <div className="fam-cmep-linha">
        <label>Item
          <select value={item?.id ?? ''} onChange={(e) => setItemId(e.target.value)} aria-label="Item do catálogo">
            {itens.map((i) => <option key={i.id} value={i.id}>{i.nome} — {i.estado === 'conferido' ? 'conferido' : 'CONFERIR'}{i.pagina ? ` (p. ${i.pagina})` : ''}</option>)}
          </select>
        </label>
        {editavel && item && <button className="fam-bt" onClick={() => { setMeus(removerItemDoNavegador(item.id)); setItemId(''); }}>Excluir item</button>}
        {!editavel && item && <button className="fam-bt" onClick={copiarParaMeus}>Copiar para Meus catálogos</button>}
        <button className="fam-bt" onClick={() => setCsvAberto((v) => !v)}>Importar CSV…</button>
        {item && <button className="fam-bt" onClick={() => baixarTexto(`${item.id}.csv`, csvDoItem(item), 'text/csv')}>Exportar CSV</button>}
      </div>

      {csvAberto && (
        <div className="fam-cmep-csv">
          <div className="fam-cmep-linha">
            <label>Nome <input value={meta.nome} onChange={(e) => setMeta({ ...meta, nome: e.target.value })} /></label>
            <label>Tipo de peça <input value={meta.tipo} onChange={(e) => setMeta({ ...meta, tipo: e.target.value })} /></label>
            <label>Série <input value={meta.serie} onChange={(e) => setMeta({ ...meta, serie: e.target.value })} /></label>
          </div>
          <textarea aria-label="CSV" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="bitola;codigo;B;Db;De;e" />
          <div className="fam-cat-aviso">Primeira linha: <b>bitola</b>, <b>codigo</b> (opcional) e as colunas com os nomes de parâmetro (B, Db, De, e, Z, C, C1, C2, Z2, B2, Db2). Separador ; ou tab, decimal com ponto ou vírgula.</div>
          <button className="fam-bt pri" onClick={importar}>Criar item</button>
        </div>
      )}

      {aviso && <div className={aviso.erro ? 'fam-cat-erro' : 'fam-cat-aviso'} role={aviso.erro ? 'alert' : 'status'}>{aviso.texto}</div>}

      {item ? (
        <>
          <div className="fam-cmep-tabela" role="region" aria-label="Tabela do item">
            <table>
              <thead>
                <tr><th>Bitola</th><th>Código</th>{letras.map((c) => <th key={c} title={item.colunas[c]}>{c}</th>)}{editavel && <th />}</tr>
              </thead>
              <tbody>
                {item.linhas.map((l) => (
                  <tr key={l.bitola}>
                    <td>{l.bitola}</td>
                    <td>{l.codigo ?? ''}</td>
                    {letras.map((c) => (
                      <td key={c}>
                        {editavel
                          ? <input aria-label={`${l.bitola} ${c}`} defaultValue={num(l.valores[c])} onBlur={(e) => editarCelula(l.bitola, c, e.target.value)} size={6} />
                          : num(l.valores[c])}
                      </td>
                    ))}
                    {editavel && <td><button className="fam-bt" aria-label={`Remover ${l.bitola}`} onClick={() => removerLinha(l.bitola)}>✕</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fam-cmep-legenda">{letras.map((c) => <span key={c}><b>{c}</b> = {item.colunas[c]}</span>)}</div>
          {editavel && (
            <div className="fam-cmep-linha">
              <label>Nova bitola <input value={novaBitola} onChange={(e) => setNovaBitola(e.target.value)} size={8} /></label>
              <button className="fam-bt" onClick={adicionarLinha}>Adicionar linha</button>
              <label>Conferido por <input value={conferente} onChange={(e) => setConferente(e.target.value)} size={14} placeholder="seu nome" /></label>
              <button className="fam-bt" onClick={conferir}>Marcar como conferido</button>
            </div>
          )}
          {item.estado === 'conferido' && <div className="fam-cat-aviso">Conferido por {item.conferidoPor} em {item.conferidoEm}. Editar qualquer número volta para CONFERIR.</div>}
          {problemas.length > 0 && (
            <div className="fam-cat-erro" role="alert">
              <div>{problemas.length} ponto(s) a conferir:</div>
              <ul>{problemas.slice(0, 5).map((p, i) => <li key={i}>{p.nivel === 'erro' ? 'Erro' : 'Aviso'}: {p.mensagem} ({p.onde})</li>)}</ul>
            </div>
          )}
          <div className="fam-cmep-criar">
            <b>Criar família deste item</b>
            {editavel ? (
              <div className="fam-cmep-linha">
                <label>Peça
                  <select value={receita} onChange={(e) => setReceita(e.target.value)} aria-label="Receita de geometria">
                    {RECEITAS_MEP.map((r) => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
                  </select>
                </label>
                <label>Sistema
                  <select value={dominio} onChange={(e) => setDominio(e.target.value as DominioMep)} aria-label="Domínio">
                    <option value="esgoto">Esgoto</option>
                    <option value="agua_fria">Água fria</option>
                  </select>
                </label>
                <label>Material
                  <select value={material} onChange={(e) => setMaterial(e.target.value)} aria-label="Material da família">
                    <option value="">Padrão do sistema</option>
                    {OPCOES_MATERIAL_CORPO.map((o) => <option key={o.apelido} value={o.apelido}>{o.nome}</option>)}
                  </select>
                </label>
                <label>Nome <input value={nomeFamilia} onChange={(e) => setNomeFamilia(e.target.value)} placeholder="opcional" /></label>
                <button className="fam-bt pri" onClick={criarFamilia}>Criar família</button>
              </div>
            ) : <div className="fam-cat-aviso">As famílias deste catálogo já estão em Novo módulo (Tubulação e Conexões). Para variar as medidas, copie o item para Meus catálogos.</div>}
            {editavel && def && <div className="fam-cat-aviso">{def.ajuda} Geometria simplificada; nada aqui afirma conformidade com norma.</div>}
          </div>
        </>
      ) : <div className="fam-cat-aviso">Nenhum item. Importe um CSV ou copie um item do fabricante.</div>}
    </Janela>
  );
}
