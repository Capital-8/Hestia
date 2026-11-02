import { useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon.tsx';
import { useFamilia } from './familiaStore.ts';
import type { DialogoFamilia } from './familiaStore.ts';

/*
 * Faixa do editor de famílias, no mesmo molde da faixa do app (abas → painéis → itens; botão grande, pilha de
 * pequenos, botão dividido). Por enquanto só os botões "Parâmetros", "Tipos" e "Lista de peças" fazem algo (abrem a
 * tabela); os demais marcam a ferramenta na barra de status. Ícones: os que o app já tem; os novos entram na fase F7.
 */

interface Item {
  rotulo: string;
  icone: string;
  /** Variantes (botão dividido): só entram 2 ou mais, como manda a decisão 0032. */
  variantes?: string[];
  abre?: Exclude<DialogoFamilia, null>;
  novo?: boolean;
  desligado?: boolean;
  dica?: string;
}
type Slot = Item | Item[];
interface Painel { id: string; titulo: string; itens: Slot[] }

const I = (rotulo: string, icone: string, o: Partial<Item> = {}): Item => ({ rotulo, icone, ...o });

const PAINEIS: Painel[] = [
  { id: 'chapa', titulo: 'Peças de chapa', itens: [I('Painel', 'wall', { variantes: ['Lateral', 'Base', 'Travessa / topo', 'Prateleira', 'Divisória', 'Fundo', 'Rodapé'] }), I('Tampo', 'slab'), I('Porta', 'door', { variantes: ['De abrir', 'De correr', 'Basculante', 'Dobradiça dupla'] }), I('Gaveta', 'schedule', { novo: true, dica: 'Peça composta: frente, laterais, traseira, fundo e corrediça' })] },
  { id: 'livre', titulo: 'Forma livre', itens: [I('Bloco', 'cube'), I('Vazio', 'opening', { dica: 'Corta os sólidos da família' }), [I('Cilindro', 'cube', { desligado: true }), I('Extrusão', 'cube', { desligado: true }), I('Revolução', 'cube', { desligado: true })]] },
  { id: 'ferragens', titulo: 'Ferragens', itens: [[I('Puxador', 'type'), I('Dobradiça', 'type'), I('Corrediça', 'type')], [I('Pé regulável', 'type'), I('Cabideiro', 'type'), I('Outra…', 'type')]] },
  { id: 'usinagem', titulo: 'Usinagem', itens: [[I('Furo', 'trim'), I('Rasgo', 'trim'), I('Recorte', 'trim')]] },
  { id: 'referencia', titulo: 'Referência', itens: [I('Plano de referência', 'plan'), I('Repetir', 'array'), I('Módulo aninhado', 'component', { novo: true, dica: 'Família dentro de família (guarda-roupa, cozinha)' })] },
  { id: 'propriedades', titulo: 'Propriedades', itens: [I('Parâmetros', 'type', { abre: 'parametros' }), I('Tipos', 'layers', { abre: 'tipos' }), I('Categoria e hospedagem', 'level')] },
  { id: 'testar', titulo: 'Testar', itens: [I('Flexionar', 'fit'), I('Validar', 'select'), I('Lista de peças', 'schedule', { abre: 'pecas' })] },
  { id: 'editor', titulo: 'Editor de família', itens: [I('Carregar no projeto', 'paste', { dica: 'Grava a família no projeto num único passo de desfazer (ainda não faz nada)' }), I('Carregar e fechar', 'paste')] },
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

function Botao({ it, grande }: { it: Item; grande: boolean }): ReactElement {
  const ferramenta = useFamilia((s) => s.ferramenta);
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const marca = (nome: string): void => {
    if (it.abre) useFamilia.getState().set({ dialogo: it.abre });
    else useFamilia.getState().set({ ferramenta: nome });
  };
  const on = ferramenta === it.rotulo || (it.variantes?.includes(ferramenta ?? '') ?? false);
  const dica = [it.rotulo, it.dica, it.novo ? 'Novo nesta proposta (ampliar ADR 0049)' : '', it.desligado ? 'Fora do v1' : ''].filter(Boolean).join('\n— ');
  const click = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (it.variantes) setAncora(e.currentTarget.getBoundingClientRect());
    else marca(it.rotulo);
  };
  return (
    <>
      <button className={`rb-btn ${grande ? 'rb-large' : 'rb-small rb-iconly'}${on ? ' on' : ''}${it.desligado ? ' soon' : ''}`} title={dica} aria-label={it.rotulo} aria-pressed={on || undefined} disabled={it.desligado} onClick={click}>
        <Icon name={it.icone} size={grande ? 28 : 16} />
        {grande && <span className="rb-lbl">{it.rotulo}{it.variantes ? ' ▾' : ''}{it.novo ? <em className="fam-novo">novo</em> : null}</span>}
      </button>
      {ancora && it.variantes && <Menu ancora={ancora} itens={it.variantes} fechar={() => setAncora(null)} escolher={(v) => marca(v)} />}
    </>
  );
}

const ABAS = ['Criar', 'Inserir', 'Modificar', 'Vista', 'Gerenciar'];

export function FamiliaFaixa(): ReactElement {
  return (
    <>
      <nav className="ribbon-tabs" aria-label="Abas do editor de família">
        {ABAS.map((a, i) => <button key={a} className={`rtab${i === 0 ? ' on' : ''}`} disabled={i !== 0} title={i === 0 ? undefined : 'Aba ainda sem painéis'}>{a}</button>)}
      </nav>
      <div className="ribbon" role="toolbar" aria-label="Ferramentas da família">
        {PAINEIS.map((p) => (
          <div key={p.id} className="rb-panel" role="group" aria-label={p.titulo}>
            <div className="rb-cols">
              {p.itens.map((slot, i) => Array.isArray(slot)
                ? <div key={i} className="rb-stack">{slot.map((it) => <PequenoComRotulo key={it.rotulo} it={it} />)}</div>
                : <Botao key={slot.rotulo} it={slot} grande />)}
            </div>
            <div className="rb-title">{p.titulo}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Na pilha o botão pequeno mostra o rótulo ao lado do ícone (a faixa do app mostra só o ícone; aqui ajuda a validar). */
function PequenoComRotulo({ it }: { it: Item }): ReactElement {
  const ferramenta = useFamilia((s) => s.ferramenta);
  return (
    <button className={`rb-btn rb-small fam-pequeno${ferramenta === it.rotulo ? ' on' : ''}${it.desligado ? ' soon' : ''}`} title={it.rotulo} disabled={it.desligado} onClick={() => useFamilia.getState().set({ ferramenta: it.rotulo })}>
      <Icon name={it.icone} size={16} /><span>{it.rotulo}</span>
    </button>
  );
}
