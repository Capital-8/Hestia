import { adicionarPeca, type Eixo, type PapelPeca, type Peca } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { DICAS_EIXO, EIXO_PADRAO, PAPEIS, espessuraPadrao, idAdicionado, idPadraoDeNome, idsDePecas, medidasPadrao, rotuloDoPapel } from './familiaPeca.ts';
import { useAvisoPeca } from './familiaPecaAviso.ts';
import { useFamilia } from './familiaStore.ts';
import { PopoverPeca } from './FamiliaPecaPopover.tsx';

/** Formulário de nova peça: papéis, medidas e origem em fórmulas; "Criar" passa por `adicionarPeca` e mostra a recusa aqui. */

interface Props {
  ancora: DOMRect;
  onFechar: () => void;
}

const PAPEL_INICIAL: PapelPeca = 'divisoria';

function FormularioNovaPeca({ onFechar }: { onFechar: () => void }): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const [papel, setPapel] = useState<PapelPeca>(PAPEL_INICIAL);
  const [eixo, setEixo] = useState<Eixo>(EIXO_PADRAO[PAPEL_INICIAL]);
  const [medidas, setMedidas] = useState(() => medidasPadrao(EIXO_PADRAO[PAPEL_INICIAL]));
  const [nome, setNome] = useState(() => rotuloDoPapel(PAPEL_INICIAL));
  const [id, setId] = useState(() => idPadraoDeNome(rotuloDoPapel(PAPEL_INICIAL), idsDePecas(familia)));
  const [nomeTocado, setNomeTocado] = useState(false);
  const [idTocado, setIdTocado] = useState(false);
  const [espessura, setEspessura] = useState(() => espessuraPadrao(familia));
  const [origem, setOrigem] = useState<[string, string, string]>(['0', '0', '0']);
  const [erro, setErro] = useState<string | null>(null);

  const trocarPapel = (novo: PapelPeca): void => {
    const novoEixo = EIXO_PADRAO[novo];
    setPapel(novo);
    setEixo(novoEixo);
    setMedidas(medidasPadrao(novoEixo));
    const rotulo = rotuloDoPapel(novo);
    if (!nomeTocado) {
      setNome(rotulo);
      if (!idTocado) setId(idPadraoDeNome(rotulo, idsDePecas(familia)));
    }
  };

  const trocarNome = (valor: string): void => {
    setNome(valor);
    setNomeTocado(true);
    if (!idTocado) setId(idPadraoDeNome(valor, idsDePecas(familia)));
  };

  const trocarEixo = (novo: Eixo): void => {
    setEixo(novo);
    setMedidas(medidasPadrao(novo));
  };

  const criar = (): void => {
    const limpo = nome.trim() === '' ? rotuloDoPapel(papel) : nome.trim();
    const medidasAtuais = medidasPadrao(eixo);
    const peca: Peca = {
      id: id.trim(),
      nome: limpo,
      papel,
      eixo,
      origem: [origem[0].trim() || '0', origem[1].trim() || '0', origem[2].trim() || '0'],
      tamanho: [medidas.a.trim() || medidasAtuais.a, medidas.b.trim() || medidasAtuais.b],
      espessura: espessura.trim() || espessuraPadrao(familia),
    };
    const antes = idsDePecas(useFamilia.getState().familia());
    const motivo = useFamilia.getState().executar('Nova peça', (f) => adicionarPeca(f, peca));
    if (motivo !== null) {
      setErro(motivo);
      return;
    }
    useAvisoPeca.getState().limpar();
    const novo = idAdicionado(antes, idsDePecas(useFamilia.getState().familia()));
    if (novo !== null) useFamilia.getState().selecionarPeca(novo);
    onFechar();
  };

  const campoOrigem = (indice: 0 | 1 | 2, rotulo: string): ReactElement => (
    <div className="fam-row"><label htmlFor={`np-origem-${indice}`}>{rotulo}</label>
      <input
        id={`np-origem-${indice}`}
        className="fam-f mono"
        value={origem[indice]}
        onChange={(e) => {
          const novo: [string, string, string] = [origem[0], origem[1], origem[2]];
          novo[indice] = e.target.value;
          setOrigem(novo);
        }}
      />
    </div>
  );

  return (
    <>
      <div className="fam-row"><label htmlFor="np-papel">Papel</label>
        <select id="np-papel" className="fam-f" value={papel} onChange={(e) => trocarPapel(e.target.value as PapelPeca)}>
          {PAPEIS.map((p) => <option key={p} value={p}>{rotuloDoPapel(p)}</option>)}
        </select>
      </div>
      <div className="fam-row"><label htmlFor="np-nome">Nome</label>
        <input id="np-nome" className="fam-f" value={nome} onChange={(e) => trocarNome(e.target.value)} />
      </div>
      <div className="fam-row"><label htmlFor="np-id">Id</label>
        <input id="np-id" className="fam-f mono" value={id} onChange={(e) => { setId(e.target.value); setIdTocado(true); }} />
      </div>
      <div className="fam-row"><label htmlFor="np-eixo">Eixo da espessura</label>
        <select id="np-eixo" className="fam-f" value={eixo} onChange={(e) => trocarEixo(e.target.value as Eixo)}>
          <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
        </select>
      </div>
      <div className="fam-hint">{DICAS_EIXO[eixo]}</div>
      <div className="fam-row"><label htmlFor="np-tamanho-a">Tamanho a</label>
        <input id="np-tamanho-a" className="fam-f mono" value={medidas.a} onChange={(e) => setMedidas({ ...medidas, a: e.target.value })} />
      </div>
      <div className="fam-row"><label htmlFor="np-tamanho-b">Tamanho b</label>
        <input id="np-tamanho-b" className="fam-f mono" value={medidas.b} onChange={(e) => setMedidas({ ...medidas, b: e.target.value })} />
      </div>
      <div className="fam-row"><label htmlFor="np-espessura">Espessura</label>
        <input id="np-espessura" className="fam-f mono" value={espessura} onChange={(e) => setEspessura(e.target.value)} />
      </div>
      {campoOrigem(0, 'Origem X')}
      {campoOrigem(1, 'Origem Y')}
      {campoOrigem(2, 'Origem Z')}
      {erro !== null && <div className="fam-msg erro" role="alert">{erro}</div>}
      <div className="fam-pop-acoes">
        <button type="button" className="fam-bt" onClick={onFechar}>Cancelar</button>
        <button type="button" className="fam-bt pri" onClick={criar}>Criar</button>
      </div>
    </>
  );
}

export function FamiliaNovaPeca({ ancora, onFechar }: Props): ReactElement {
  return (
    <PopoverPeca ancora={ancora} titulo="Nova peça" onFechar={onFechar}>
      <FormularioNovaPeca onFechar={onFechar} />
    </PopoverPeca>
  );
}
