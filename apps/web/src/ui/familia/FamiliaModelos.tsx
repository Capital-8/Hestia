import type { ReactElement } from 'react';

/** Galeria "Novo módulo" (ADR 0049 §4.2, assistentes): cada modelo só preenche uma família inicial. Desenhos esquemáticos de frente. */

interface Esquema { w: number; h: number; portas?: number; gav?: number; prat?: number; tampo?: boolean; aereo?: boolean; rail?: boolean; pernas?: boolean }
type Natureza = 'chapa' | 'livre' | 'ampliar';
interface Modelo { nome: string; desc: string; e: Esquema; n: Natureza }

const GRUPOS: Array<[string, Modelo[]]> = [
  ['Cozinha', [
    { nome: 'Armário base', desc: 'Caixaria · portas', e: { w: 100, h: 52, portas: 2, tampo: true }, n: 'chapa' },
    { nome: 'Base com gavetas', desc: 'Caixaria · gaveta', e: { w: 100, h: 52, gav: 3, tampo: true }, n: 'ampliar' },
    { nome: 'Base de pia', desc: 'Caixaria · recorte no tampo', e: { w: 120, h: 52, portas: 2, tampo: true }, n: 'chapa' },
    { nome: 'Base de cooktop', desc: 'Caixaria · recorte + gavetão', e: { w: 100, h: 52, gav: 2, tampo: true }, n: 'chapa' },
    { nome: 'Armário aéreo', desc: 'Caixaria · portas', e: { w: 100, h: 34, portas: 2, aereo: true }, n: 'chapa' },
    { nome: 'Aéreo basculante', desc: 'Caixaria · pistão', e: { w: 100, h: 28, portas: 1, aereo: true }, n: 'chapa' },
    { nome: 'Torre de forno', desc: 'Caixaria · nichos', e: { w: 52, h: 70, portas: 1, prat: 2 }, n: 'chapa' },
    { nome: 'Paneleiro', desc: 'Caixaria · gavetas altas', e: { w: 52, h: 70, gav: 4 }, n: 'ampliar' },
    { nome: 'Canto em L', desc: 'Caixaria · duas alas', e: { w: 110, h: 52, portas: 2, tampo: true }, n: 'ampliar' },
  ]],
  ['Dormitório e closet', [
    { nome: 'Guarda-roupa (módulo)', desc: 'Caixaria · portas de correr', e: { w: 110, h: 68, portas: 3, rail: true }, n: 'ampliar' },
    { nome: 'Cabideiro e prateleiras', desc: 'Caixaria · aberto', e: { w: 100, h: 62, prat: 4, rail: true }, n: 'chapa' },
    { nome: 'Cômoda', desc: 'Caixaria · gavetas', e: { w: 100, h: 48, gav: 4, tampo: true }, n: 'ampliar' },
    { nome: 'Criado-mudo', desc: 'Caixaria · gaveta', e: { w: 60, h: 40, gav: 2, tampo: true }, n: 'ampliar' },
    { nome: 'Cama com baú', desc: 'Painéis + bloco', e: { w: 120, h: 30, pernas: true }, n: 'livre' },
    { nome: 'Painel de TV', desc: 'Painéis · nichos', e: { w: 120, h: 56, prat: 3 }, n: 'chapa' },
  ]],
  ['Sala, escritório e áreas molhadas', [
    { nome: 'Rack', desc: 'Caixaria · nichos + portas', e: { w: 120, h: 34, portas: 3, tampo: true }, n: 'chapa' },
    { nome: 'Estante', desc: 'Caixaria · prateleiras', e: { w: 100, h: 70, prat: 5 }, n: 'chapa' },
    { nome: 'Mesa com gaveteiro', desc: 'Tampo + pernas + gaveteiro', e: { w: 110, h: 42, gav: 2, tampo: true, pernas: true }, n: 'ampliar' },
    { nome: 'Gabinete de banheiro', desc: 'Caixaria · recorte de cuba', e: { w: 90, h: 40, portas: 2, tampo: true }, n: 'chapa' },
    { nome: 'Armário de lavanderia', desc: 'Caixaria · portas', e: { w: 100, h: 60, portas: 2 }, n: 'chapa' },
    { nome: 'Mesa / banco', desc: 'Forma livre', e: { w: 100, h: 40, pernas: true, tampo: true }, n: 'livre' },
  ]],
  ['Para começar do zero', [
    { nome: 'Módulo em branco', desc: 'Caixa + L, A, P', e: { w: 90, h: 50 }, n: 'chapa' },
    { nome: 'Bloco de forma livre', desc: 'Mobília solta', e: { w: 90, h: 44, pernas: true }, n: 'livre' },
    { nome: 'Conjunto de módulos', desc: 'Agrupa módulos aninhados', e: { w: 130, h: 50, portas: 3 }, n: 'ampliar' },
  ]],
];

const ROTULO: Record<Natureza, string> = { chapa: 'peças de chapa', livre: 'forma livre', ampliar: 'ampliar ADR' };

function Miniatura({ e }: { e: Esquema }): ReactElement {
  const mw = Math.min(130, e.w);
  const x0 = (150 - mw) / 2;
  const y0 = 78 - e.h - 8;
  const portas = e.portas ?? 0;
  const gav = e.gav ?? 0;
  const prat = e.prat ?? 0;
  return (
    <svg viewBox="0 0 150 78" aria-hidden="true">
      <rect x={x0} y={y0} width={mw} height={e.h} fill="var(--fam-corpo)" fillOpacity={0.55} stroke="var(--line-strong)" />
      {e.tampo && <rect x={x0 - 3} y={y0 - 4} width={mw + 6} height={4} fill="var(--fam-tampo)" />}
      {Array.from({ length: portas }, (_, i) => <rect key={`p${i}`} x={x0 + 2 + i * (mw / portas)} y={y0 + 2} width={mw / portas - 4} height={e.h - 4} fill="var(--fam-porta)" stroke="var(--line-strong)" />)}
      {Array.from({ length: gav }, (_, i) => <rect key={`g${i}`} x={x0 + 2} y={y0 + 2 + i * ((e.h - 4) / gav)} width={mw - 4} height={(e.h - 4) / gav - 2} fill="var(--fam-porta)" stroke="var(--line-strong)" />)}
      {!portas && !gav && Array.from({ length: prat }, (_, i) => <path key={`s${i}`} d={`M${x0} ${y0 + ((i + 1) * e.h) / (prat + 1)}h${mw}`} stroke="var(--line-strong)" strokeWidth={2} />)}
      {e.rail && <path d={`M${x0 + 4} ${y0 + 12}h${mw - 8}`} stroke="var(--fg-soft)" strokeWidth={2} />}
      {e.pernas && <path d={`M${x0 + 4} ${y0 + e.h}v8M${x0 + mw - 4} ${y0 + e.h}v8`} stroke="var(--fg-soft)" strokeWidth={3} />}
      {e.aereo && <path d={`M${x0 - 6} ${y0 - 10}h${mw + 12}`} stroke="var(--fg-soft)" strokeDasharray="3 2" />}
    </svg>
  );
}

export function ModelosNovo(): ReactElement {
  return (
    <div className="fam-novo-grid">
      <ul className="fam-tree"><li className="h">Modelos</li><li className="l2 sel">Marcenaria</li><li className="l2">Mobiliário</li><li className="l2">Louças e metais</li><li className="l2">Equipamentos</li><li className="h">Meus modelos</li><li className="l2">(vazio)</li></ul>
      <div className="fam-gal-scroll">
        {GRUPOS.map(([g, itens]) => (
          <section key={g}>
            <div className="fam-ghd">{g}</div>
            <div className="fam-gal">{itens.map((m) => (
              <button key={m.nome} className="fam-tpl" onClick={() => undefined}>
                <Miniatura e={m.e} /><b>{m.nome}</b><small>{m.desc}</small><span className={`fam-tag${m.n === 'ampliar' ? ' aviso' : ''}`}>{ROTULO[m.n]}</span>
              </button>
            ))}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
