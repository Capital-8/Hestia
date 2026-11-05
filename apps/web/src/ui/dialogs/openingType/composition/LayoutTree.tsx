import type { ReactElement } from 'react';
import { dividerWidth, type CellSize, type CompositionNode, type OpeningComposition, type ResolvedUnits } from '@hestia/model';
import { useT } from '../../../../editor/i18n.ts';
import { useUnits } from '../../../useUnits.ts';
import { medidasCelulas, metrosTexto, ROTULO_CONTEUDO } from './compositionControls.ts';

/*
 * Árvore de módulos da composição: divisões (colunas ou linhas, com o divisor) e células. Cada célula mostra a luz
 * resolvida no eixo da divisão (largura nas colunas, altura nas linhas); sem medidas (composição com erro), mostra a regra.
 */

interface Props {
  c: OpeningComposition;
  selected: string | null;
  onSelect: (id: string) => void;
}

interface NodoProps extends Omit<Props, 'c'> {
  node: CompositionNode;
  /** Tamanho do nó na divisão pai (ausente na raiz). */
  size?: CellSize;
  /** Eixo da divisão pai (ausente na raiz). */
  eixo?: 'cols' | 'rows';
  medidas: ReturnType<typeof medidasCelulas>;
  units: ResolvedUnits;
}

function Nodo({ node, size, eixo, selected, onSelect, medidas, units }: NodoProps): ReactElement {
  const { t } = useT();
  if (node.kind === 'split') {
    const titulo = t(node.axis === 'cols' ? 'dlo_tree_axis_cols' : 'dlo_tree_axis_rows');
    return (
      <li>
        <span className="hint">{t('dlo_tree_split', { axis: titulo, measure: metrosTexto(units, dividerWidth(node)) })}</span>
        <ul className="op-tree">
          {node.children.map((ch) => (
            <Nodo key={ch.node.id} node={ch.node} size={ch.size} eixo={node.axis} selected={selected} onSelect={onSelect} medidas={medidas} units={units} />
          ))}
        </ul>
      </li>
    );
  }

  const m = medidas?.get(node.id);
  let medida: string;
  if (m) {
    const luz = m.luz;
    medida = eixo === 'rows' ? `${metrosTexto(units, luz.z1 - luz.z0)}` : eixo === 'cols' ? `${metrosTexto(units, luz.t1 - luz.t0)}` : `${metrosTexto(units, luz.t1 - luz.t0)} × ${metrosTexto(units, luz.z1 - luz.z0)}`;
  } else {
    medida = size?.mode === 'fixed' ? `${metrosTexto(units, size.value)}` : '';
  }
  const preenche = size?.mode === 'fill' ? t('dlo_tree_fill') : '';
  const ativo = selected === node.id;
  return (
    <li>
      <button type="button" className={`btn small${ativo ? ' on' : ''}`} aria-pressed={ativo} onClick={() => onSelect(node.id)}>
        {t(ROTULO_CONTEUDO[node.content.kind])} {medida}
        {preenche}
      </button>
    </li>
  );
}

export function LayoutTree({ c, selected, onSelect }: Props): ReactElement {
  const units = useUnits();
  const medidas = medidasCelulas(c);
  return (
    <ul className="op-tree">
      <Nodo node={c.layout} selected={selected} onSelect={onSelect} medidas={medidas} units={units} />
    </ul>
  );
}
