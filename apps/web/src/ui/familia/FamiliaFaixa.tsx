import { criarFamiliaCaixaria, type EstiloPorta } from '@hestia/model';
import type { ModoInteracao3DFamilia } from '@hestia/render';
import { Fragment, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { editor } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Icon } from '../Icon.tsx';
import { carregarNoProjeto } from './carregarNoProjeto.ts';
import type { Chave, PainelAba } from './familiaAbaAcoes.ts';
import { FamiliaAbaRibbon } from './FamiliaAbaRibbon.tsx';
import { PAINEIS_GERENCIAR, PAINEIS_VISTA } from './familiaAbaPaineisVista.ts';
import { PAINEIS_INSERIR, PAINEIS_MODIFICAR } from './familiaAbaPaineis.ts';
import { PainelCorpos } from './FamiliaCorpoCriar.tsx';
import { useFamilia } from './familiaStore.ts';
import type { DialogoFamilia } from './familiaStore.ts';

/*
 * Faixa do editor de famílias, no mesmo molde da faixa do app (abas → painéis → itens; botão grande, pilha de
 * pequenos, botão dividido). Inclui o painel funcional de Caixaria 3D por vãos e as ações do editor.
 */

interface Item {
  rotulo: string;
  icone: string;
  /** Variantes (botão dividido): só entram 2 ou mais, como manda a decisão 0032. */
  variantes?: string[];
  abre?: Exclude<DialogoFamilia, null>;
  /** Botões de desfazer/refazer, carregar no projeto ou criar nova caixaria. */
  acao?: 'desfazer' | 'refazer' | 'carregar' | 'nova_caixaria';
  /** Modo de interação 3D ativado por este botão. */
  modo3d?: ModoInteracao3DFamilia;
  novo?: boolean;
  desligado?: boolean;
  dica?: string;
}
type Slot = Item | Item[];
interface Painel { id: string; titulo: string; itens: Slot[] }

const I = (rotulo: string, icone: string, o: Partial<Item> = {}): Item => ({ rotulo, icone, ...o });

const ESTILOS_PORTA_POR_VARIANTE: Readonly<Record<string, EstiloPorta>> = {
  '1 folha': 'giro_1',
  '2 folhas': 'giro_2',
  Basculante: 'basculante',
  Correr: 'correr',
};

const PAINEIS: Painel[] = [
  {
    id: 'caixaria',
    titulo: 'Caixaria 3D',
    itens: [
      I('Nova caixaria', 'component', { acao: 'nova_caixaria', novo: true, dica: 'Cria uma caixaria paramétrica do zero pronta para modelar por vãos no 3D' }),
      I('Selecionar', 'select', { modo3d: 'selecionar', dica: 'Seleciona peças ou vãos no 3D (Esc)' }),
      I('Prateleira', 'beam', { modo3d: 'prateleira', dica: 'Clique em um vão no 3D para inserir prateleira horizontal (H)' }),
      I('Divisória', 'column', { modo3d: 'divisoria', dica: 'Clique em um vão no 3D para inserir divisória vertical (V)' }),
      I('Porta', 'door', { modo3d: 'porta', variantes: ['1 folha', '2 folhas', 'Basculante', 'Correr'], dica: 'Escolhe o estilo de porta e preenche o vão clicado no 3D' }),
      I('Gavetas', 'schedule', { modo3d: 'gavetas', dica: 'Insere conjunto de gavetas no vão clicado no 3D' }),
      I('Tampo', 'slab', { modo3d: 'tampo', dica: 'Clique na face superior no 3D para alternar tampo' }),
      I('Tamponamento', 'wall', { modo3d: 'tamponamento', dica: 'Clique numa face externa no 3D para alternar tamponamento' }),
      [
        I('Cabideiro', 'beam', { modo3d: 'cabideiro', dica: 'Insere cabideiro no vão clicado no 3D' }),
        I('Ripado', 'curtain', { modo3d: 'ripado', dica: 'Insere ripado no vão clicado no 3D' }),
      ],
      [
        I('Sapateira', 'layers', { modo3d: 'sapateira', dica: 'Insere sapateira no vão clicado no 3D' }),
        I('Recorte', 'trim', { modo3d: 'recorte', dica: 'Clique no tampo no 3D para alternar recorte de pia/cooktop' }),
      ],
    ],
  },
  { id: 'referencia', titulo: 'Referência', itens: [I('Módulo aninhado', 'component', { dica: 'Família dentro de família (guarda-roupa, cozinha)' })] },
  { id: 'propriedades', titulo: 'Propriedades', itens: [I('Parâmetros', 'type', { abre: 'parametros' }), I('Tipos', 'layers', { abre: 'tipos' }), I('Encaixe', 'joins', { abre: 'encaixe', dica: 'Conectores e escolhas do módulo' }), I('Catálogo', 'style', { abre: 'catalogo', dica: 'Chapas, fitas de borda e ferragens' }), I('Catálogo MEP', 'style', { abre: 'catalogoMep', dica: 'Tubos e conexões de fabricante: ver, importar CSV e criar famílias' })] },
  { id: 'testar', titulo: 'Testar', itens: [I('Lista de peças', 'schedule', { abre: 'pecas' })] },
  { id: 'editor', titulo: 'Editor de família', itens: [I('Abrir e salvar', 'sheet', { abre: 'arquivo', dica: 'Abre e salva famílias em arquivo hestia-familia' }), I('Carregar no projeto', 'paste', { acao: 'carregar', dica: 'Grava a família no projeto num único passo de desfazer e abre a ferramenta Componente' }), I('Desfazer', 'undo', { acao: 'desfazer' }), I('Refazer', 'redo', { acao: 'refazer' })] },
];

function Menu({ ancora, itens, fechar, escolher }: { ancora: DOMRect; itens: string[]; fechar: () => void; escolher: (s: string) => void }): ReactElement {
  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 80 }} onPointerDown={fechar} />
      <div className="rb-menu" role="menu" style={{ left: ancora.left, top: ancora.bottom + 1, zIndex: 81 }}>
        {itens.map((v) => <button key={v} role="menuitem" className="rb-menuitem" onClick={() => { fechar(); escolher(v); }}><Icon name="wall" size={16} /><span>{v}</span></button>)}
      </div>
    </>,
    document.body,
  );
}

function aplicarFerramenta(it: Item, nomeVariante?: string): void {
  const s = useFamilia.getState();
  if (it.abre) {
    s.set({ dialogo: it.abre });
    return;
  }
  if (it.modo3d !== undefined) {
    const patch: { modo3d: ModoInteracao3DFamilia; ferramenta: null; estiloPorta?: EstiloPorta } = {
      modo3d: it.modo3d,
      ferramenta: null,
    };
    if (it.modo3d === 'porta' && nomeVariante !== undefined) {
      const estilo = ESTILOS_PORTA_POR_VARIANTE[nomeVariante];
      if (estilo !== undefined) patch.estiloPorta = estilo;
    }
    s.set(patch);
    return;
  }
  s.set({ ferramenta: nomeVariante ?? it.rotulo });
}

function Botao({ it, grande, aoCarregar }: { it: Item; grande: boolean; aoCarregar?: () => void }): ReactElement {
  const ferramenta = useFamilia((s) => s.ferramenta);
  const modo3d = useFamilia((s) => s.modo3d);
  const podeDesfazer = useFamilia((s) => s.historico.podeDesfazer);
  const podeRefazer = useFamilia((s) => s.historico.podeRefazer);
  const rotuloDesfazer = useFamilia((s) => s.historico.rotuloDesfazer);
  const rotuloRefazer = useFamilia((s) => s.historico.rotuloRefazer);
  const [ancora, setAncora] = useState<DOMRect | null>(null);

  const on = it.modo3d !== undefined
    ? modo3d === it.modo3d
    : ferramenta === it.rotulo || (it.variantes?.includes(ferramenta ?? '') ?? false);
  const rotuloHistorico = it.acao === 'desfazer' ? rotuloDesfazer : it.acao === 'refazer' ? rotuloRefazer : null;
  const dica = [it.rotulo, it.acao === 'desfazer' || it.acao === 'refazer' ? (rotuloHistorico ?? (it.acao === 'desfazer' ? 'Nada para desfazer' : 'Nada para refazer')) : '', it.dica, it.novo ? 'Novo nesta proposta (ampliar ADR 0049)' : '', it.desligado ? 'Fora do v1' : ''].filter(Boolean).join('\n— ');
  const desabilitado = it.desligado === true || (it.acao === 'desfazer' && !podeDesfazer) || (it.acao === 'refazer' && !podeRefazer);
  const click = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (it.acao === 'desfazer') { useFamilia.getState().desfazer(); return; }
    if (it.acao === 'refazer') { useFamilia.getState().refazer(); return; }
    if (it.acao === 'carregar') { aoCarregar?.(); return; }
    if (it.acao === 'nova_caixaria') {
      const nova = criarFamiliaCaixaria();
      const estado = useFamilia.getState();
      estado.novaFamilia(nova);
      estado.set({ modo3d: 'prateleira', vista: '3d', vaoSel: nova.caixaria?.raiz.id ?? null, ferramenta: null });
      return;
    }
    if (it.variantes) setAncora(e.currentTarget.getBoundingClientRect());
    else aplicarFerramenta(it);
  };
  return (
    <>
      <button className={`rb-btn ${grande ? 'rb-large' : 'rb-small rb-iconly'}${on ? ' on' : ''}${it.desligado ? ' soon' : ''}`} title={dica} aria-label={it.rotulo} aria-pressed={on || undefined} disabled={desabilitado} onClick={click}>
        <Icon name={it.icone} size={grande ? 28 : 16} />
        {grande && <span className="rb-lbl">{it.rotulo}{it.variantes ? ' ▾' : ''}{it.novo ? <em className="fam-novo">novo</em> : null}</span>}
      </button>
      {ancora && it.variantes && <Menu ancora={ancora} itens={it.variantes} fechar={() => setAncora(null)} escolher={(v) => aplicarFerramenta(it, v)} />}
    </>
  );
}

/** Abas da faixa: Criar mostra os painéis de criação deste arquivo; as outras usam `familiaAbaPaineis*.ts`. */
type AbaFaixa = 'criar' | 'inserir' | 'modificar' | 'vista' | 'gerenciar';
const ABAS: { id: AbaFaixa; rotulo: Chave }[] = [
  { id: 'criar', rotulo: 'fa_aba_criar' },
  { id: 'inserir', rotulo: 'fa_aba_inserir' },
  { id: 'modificar', rotulo: 'fa_aba_modificar' },
  { id: 'vista', rotulo: 'fa_aba_vista' },
  { id: 'gerenciar', rotulo: 'fa_aba_gerenciar' },
];
const PAINEIS_DA_ABA: Record<Exclude<AbaFaixa, 'criar'>, { titulo: Chave; paineis: PainelAba[] }> = {
  inserir: { titulo: 'fa_aba_inserir', paineis: PAINEIS_INSERIR },
  modificar: { titulo: 'fa_aba_modificar', paineis: PAINEIS_MODIFICAR },
  vista: { titulo: 'fa_aba_vista', paineis: PAINEIS_VISTA },
  gerenciar: { titulo: 'fa_aba_gerenciar', paineis: PAINEIS_GERENCIAR },
};

export function FamiliaFaixa(): ReactElement {
  const { t } = useT();
  const [aba, setAba] = useState<AbaFaixa>('criar');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const carregar = (): void => {
    const familia = useFamilia.getState().familia();
    const r = carregarNoProjeto(editor.store, familia);
    if (!r.ok) {
      setMensagem(r.erro);
      return;
    }
    setMensagem(null);
    useUi.setState((s) => ({
      options: { ...s.options, componentFamilyId: r.familia.id, componentTypeId: null },
    }));
    useFamilia.getState().ocultar();
    editor.setTool('component');
    // Depois de ativar a ferramenta: o `start` dela escreve o texto de ajuda, e o sucesso precisa ficar visível.
    useUi.setState({ status: `${r.familia.nome} carregada no projeto.` });
  };
  return (
    <>
      <nav className="ribbon-tabs" aria-label="Abas do editor de família">
        {ABAS.map((a) => <button key={a.id} className={`rtab${aba === a.id ? ' on' : ''}`} aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>{t(a.rotulo)}</button>)}
      </nav>
      {aba !== 'criar' && <FamiliaAbaRibbon titulo={PAINEIS_DA_ABA[aba].titulo} paineis={PAINEIS_DA_ABA[aba].paineis} />}
      {aba === 'criar' && <>{mensagem && <div className="fam-msg erro" role="alert">{mensagem}</div>}
      <div className="ribbon" role="toolbar" aria-label="Ferramentas da família">
        {PAINEIS.map((p, indice) => (
          <Fragment key={p.id}>
            <div className="rb-panel" role="group" aria-label={p.titulo}>
              <div className="rb-cols">
                {p.itens.map((slot, i) => Array.isArray(slot)
                  ? <div key={i} className="rb-stack">{slot.map((it) => <PequenoComRotulo key={`${p.id}-${it.rotulo}`} it={it} />)}</div>
                  : <Botao key={`${p.id}-${slot.rotulo}`} it={slot} grande aoCarregar={carregar} />)}
              </div>
              <div className="rb-title">{p.titulo}</div>
            </div>
            {indice === 0 && <PainelCorpos />}
          </Fragment>
        ))}
      </div></>}
    </>
  );
}

/** Na pilha o botão pequeno mostra o rótulo ao lado do ícone (a faixa do app mostra só o ícone; aqui ajuda a validar). */
function PequenoComRotulo({ it }: { it: Item }): ReactElement {
  const ferramenta = useFamilia((s) => s.ferramenta);
  const modo3d = useFamilia((s) => s.modo3d);
  const on = it.modo3d !== undefined ? modo3d === it.modo3d : ferramenta === it.rotulo;
  return (
    <button
      className={`rb-btn rb-small fam-pequeno${on ? ' on' : ''}${it.desligado ? ' soon' : ''}`}
      title={it.dica ?? it.rotulo}
      aria-pressed={on || undefined}
      disabled={it.desligado}
      onClick={() => aplicarFerramenta(it)}
    >
      <Icon name={it.icone} size={16} /><span>{it.rotulo}</span>
    </button>
  );
}
