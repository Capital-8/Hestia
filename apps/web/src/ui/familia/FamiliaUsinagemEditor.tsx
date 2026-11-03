import { compilar, type FaceUsinagem, type Usinagem } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import {
  ROTULO_FACE,
  ROTULO_TIPO_USINAGEM,
  TIPOS_USINAGEM,
  ehBorda,
  facesDisponiveis,
  rotulosDaFace,
  type TipoUsinagem,
} from './familiaUsinagem.ts';
import './familiaCatalogo.css';

/** Editor inline de uma usinagem: id, tipo, face, posição, medidas, profundidade, quantidade e condição. */

interface Props {
  inicial: Usinagem;
  aoSalvar: (usinagem: Usinagem) => boolean;
  aoCancelar: () => void;
}

interface PropsFormula {
  id: string;
  valor: string;
  aoMudar: (texto: string) => void;
  ariaLabel: string;
  obrigatoria?: boolean;
}

function CampoFormulaUsinagem({ id, valor, aoMudar, ariaLabel, obrigatoria = false }: PropsFormula): ReactElement {
  const compilada = valor.trim() === '' ? null : compilar(valor);
  const erro = compilada !== null && 'erro' in compilada ? compilada.erro.message : undefined;
  const vazio = obrigatoria && valor.trim() === '';
  return (
    <div className="fam-usin-formula">
      <input
        id={id}
        className={`fam-f mono${erro !== undefined || vazio ? ' bad' : ''}`}
        value={valor}
        aria-label={ariaLabel}
        aria-invalid={erro !== undefined || vazio ? true : undefined}
        onChange={(e) => aoMudar(e.target.value)}
      />
      {erro !== undefined && <div className="fam-usin-erro">{erro}</div>}
      {erro === undefined && vazio && <div className="fam-usin-erro">Informe uma fórmula.</div>}
    </div>
  );
}

export function FamiliaUsinagemEditor({ inicial, aoSalvar, aoCancelar }: Props): ReactElement {
  const [u, setU] = useState<Usinagem>(() => structuredClone(inicial));
  const [rotuloU, rotuloV] = rotulosDaFace(u.tipo, u.face);
  const passante = u.profundidade === 'passante';
  const profundidade = passante ? '' : u.profundidade;
  const tipoTravado = ehBorda(u.face);

  const trocar = (patch: Partial<Usinagem>): void => setU((atual) => ({ ...atual, ...patch }));

  const mudarPosicao = (indice: 0 | 1, valor: string): void => {
    setU((atual) => {
      const posicao: [string, string] = [atual.posicao[0] ?? '', atual.posicao[1] ?? ''];
      posicao[indice] = valor;
      return { ...atual, posicao };
    });
  };

  const trocarTipo = (tipo: TipoUsinagem): void => {
    setU((atual) => {
      if (tipo === 'furo') {
        return { ...atual, tipo, diametro: atual.diametro ?? '8', largura: undefined, comprimento: undefined };
      }
      const face: FaceUsinagem = ehBorda(atual.face) ? 'a' : atual.face;
      return { ...atual, tipo, face, largura: atual.largura ?? '50', comprimento: atual.comprimento ?? '20', diametro: undefined };
    });
  };

  const trocarFace = (face: FaceUsinagem): void => {
    setU((atual) => {
      if (ehBorda(face)) {
        return { ...atual, face, tipo: 'furo', diametro: atual.diametro ?? '8', largura: undefined, comprimento: undefined };
      }
      return { ...atual, face };
    });
  };

  const alternarPassante = (valor: boolean): void => {
    setU((atual) => ({
      ...atual,
      profundidade: valor ? 'passante' : (atual.profundidade === 'passante' ? '10' : atual.profundidade),
    }));
  };

  return (
    <div className="fam-usin-editor" role="dialog" aria-label="Editar usinagem">
      <div className="fam-usin-editor-titulo">Usinagem</div>
      <div className="fam-row"><label htmlFor="usin-id">Id</label>
        <input id="usin-id" className="fam-f mono" value={u.id} onChange={(e) => trocar({ id: e.target.value })} />
      </div>
      <div className="fam-row"><label htmlFor="usin-tipo">Tipo</label>
        <select
          id="usin-tipo"
          className="fam-f"
          value={u.tipo}
          disabled={tipoTravado}
          title={tipoTravado ? 'Em borda só cabe furo' : undefined}
          onChange={(e) => trocarTipo(e.target.value as TipoUsinagem)}
        >
          {TIPOS_USINAGEM.map((t) => <option key={t} value={t}>{ROTULO_TIPO_USINAGEM[t]}</option>)}
        </select>
      </div>
      <div className="fam-row"><label htmlFor="usin-face">Face</label>
        <select id="usin-face" className="fam-f" value={u.face} onChange={(e) => trocarFace(e.target.value as FaceUsinagem)}>
          {facesDisponiveis(u.tipo).map((f) => <option key={f} value={f}>{ROTULO_FACE[f]}</option>)}
        </select>
      </div>
      <div className="fam-row"><label htmlFor="usin-u">{rotuloU}</label>
        <CampoFormulaUsinagem id="usin-u" valor={u.posicao[0] ?? ''} aoMudar={(texto) => mudarPosicao(0, texto)} ariaLabel={`${rotuloU} da usinagem`} obrigatoria />
      </div>
      <div className="fam-row"><label htmlFor="usin-v">{rotuloV}</label>
        <CampoFormulaUsinagem id="usin-v" valor={u.posicao[1] ?? ''} aoMudar={(texto) => mudarPosicao(1, texto)} ariaLabel={`${rotuloV} da usinagem`} obrigatoria />
      </div>
      {u.tipo === 'furo' ? (
        <div className="fam-row"><label htmlFor="usin-diametro">Diâmetro</label>
          <CampoFormulaUsinagem id="usin-diametro" valor={u.diametro ?? ''} aoMudar={(texto) => trocar({ diametro: texto })} ariaLabel="Diâmetro do furo" obrigatoria />
        </div>
      ) : (
        <>
          <div className="fam-row"><label htmlFor="usin-largura">Largura</label>
            <CampoFormulaUsinagem id="usin-largura" valor={u.largura ?? ''} aoMudar={(texto) => trocar({ largura: texto })} ariaLabel="Largura do rasgo ou recorte" obrigatoria />
          </div>
          <div className="fam-row"><label htmlFor="usin-comprimento">Comprimento</label>
            <CampoFormulaUsinagem id="usin-comprimento" valor={u.comprimento ?? ''} aoMudar={(texto) => trocar({ comprimento: texto })} ariaLabel="Comprimento do rasgo ou recorte" obrigatoria />
          </div>
        </>
      )}
      <div className="fam-row"><label htmlFor="usin-prof">Profundidade</label>
        <div>
          <label className="fam-usin-passante">
            <input type="checkbox" checked={passante} onChange={(e) => alternarPassante(e.target.checked)} />
            Passante
          </label>
          {!passante && (
            <CampoFormulaUsinagem id="usin-prof" valor={profundidade} aoMudar={(texto) => trocar({ profundidade: texto })} ariaLabel="Profundidade da usinagem" obrigatoria />
          )}
        </div>
      </div>
      <div className="fam-row"><label htmlFor="usin-quantidade">Quantidade</label>
        <CampoFormulaUsinagem id="usin-quantidade" valor={u.quantidade ?? ''} aoMudar={(texto) => trocar({ quantidade: texto.trim() === '' ? undefined : texto })} ariaLabel="Quantidade de usinagens" />
      </div>
      <div className="fam-hint">Opcional; na quantidade, <code>i</code> e <code>n</code> ficam disponíveis.</div>
      <div className="fam-row"><label htmlFor="usin-quando">Existe se</label>
        <CampoFormulaUsinagem id="usin-quando" valor={u.quando ?? ''} aoMudar={(texto) => trocar({ quando: texto.trim() === '' ? undefined : texto })} ariaLabel="Condição de existência da usinagem" />
      </div>
      <div className="fam-usin-acoes-editor">
        <button className="fam-bt pri" onClick={() => aoSalvar(u)}>Salvar</button>
        <button className="fam-bt" onClick={aoCancelar}>Cancelar</button>
      </div>
      <div className="fam-hint">A borda aceita só furo. Cada alteração salva vira um passo de desfazer.</div>
    </div>
  );
}
