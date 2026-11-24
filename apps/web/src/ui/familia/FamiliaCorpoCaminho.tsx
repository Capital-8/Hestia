import { adicionarPontoCaminho, definirRaio, moverPontoCaminho, removerPontoCaminho, type Caminho, type Ponto3 } from '@hestia/model';
import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import { executarCorpo, pontoComEixo, pontoDeslocado } from './familiaCorpo.ts';

/*
 * Tabela de pontos do caminho de uma varredura: x, y, z e o raio de curva do vértice interior. Cada célula grava sozinha
 * (Enter ou sair do campo) e a recusa do modelo aparece no campo. Reordenar = remover o ponto e reinseri-lo na posição
 * vizinha; a curva do vértice é preservada quando ele continua interior.
 */

interface Props {
  corpoId: string;
  caminho: Caminho;
}

export function FamiliaCorpoCaminho({ corpoId, caminho }: Props): ReactElement {
  const { t } = useT();
  const { pontos } = caminho;
  const n = pontos.length;
  const raios = caminho.raios ?? [];

  const adicionar = (): void => {
    const ultimo = pontos[n - 1];
    if (ultimo === undefined) return;
    executarCorpo('Adicionar ponto ao caminho', (f) => adicionarPontoCaminho(f, corpoId, pontoDeslocado(ultimo)));
  };

  return (
    <div className="fam-corpo-caminho">
      <div className="fam-gh">{t('fam_corpo_caminho')}</div>
      <table className="fam-corpo-tabela">
        <thead>
          <tr>
            <th>#</th>
            <th>x</th>
            <th>y</th>
            <th>z</th>
            <th>raio</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pontos.map((ponto, i) => (
            <LinhaPonto
              key={i}
              corpoId={corpoId}
              indice={i}
              ponto={ponto}
              total={n}
              raio={i >= 1 && i <= n - 2 ? raios[i - 1] ?? '0' : null}
            />
          ))}
        </tbody>
      </table>
      <div className="fam-corpo-acoes">
        <button type="button" className="fam-bt" onClick={adicionar} disabled={n >= 64}>{t('fam_corpo_ponto_adicionar')}</button>
      </div>
    </div>
  );
}

interface LinhaProps {
  corpoId: string;
  indice: number;
  ponto: Ponto3;
  total: number;
  /** Raio do vértice; `null` quando o ponto é ponta (não tem curva). */
  raio: string | null;
}

function LinhaPonto({ corpoId, indice, ponto, total, raio }: LinhaProps): ReactElement {
  const { t } = useT();
  const eixos: Array<0 | 1 | 2> = [0, 1, 2];

  const mover = (eixo: 0 | 1 | 2, texto: string): string | null =>
    executarCorpo('Mover ponto do caminho', (f) => moverPontoCaminho(f, corpoId, indice, pontoComEixo(ponto, eixo, texto)));

  const reordenar = (delta: number): void => {
    const alvo = indice + delta;
    const raioAntes = raio !== null && raio !== '0' ? raio : null;
    executarCorpo('Reordenar ponto do caminho', (f) => {
      const erro = removerPontoCaminho(f, corpoId, indice) ?? adicionarPontoCaminho(f, corpoId, ponto, alvo);
      if (erro !== null) return erro;
      if (raioAntes !== null && alvo >= 1 && alvo <= total - 2) return definirRaio(f, corpoId, alvo, raioAntes);
      return null;
    });
  };

  return (
    <tr>
      <td className="mono">{indice}</td>
      {eixos.map((eixo) => (
        <td key={eixo}>
          <CampoCorpo
            key={ponto[eixo]}
            id={`fcp-${corpoId}-${indice}-${eixo}`}
            rotulo={['x', 'y', 'z'][eixo] ?? ''}
            valor={ponto[eixo]}
            gravar={(texto) => mover(eixo, texto)}
            celula
          />
        </td>
      ))}
      <td>
        {raio === null ? <span className="fam-mut">—</span> : (
          <CampoCorpo
            key={raio}
            id={`fcp-${corpoId}-${indice}-raio`}
            rotulo="raio"
            valor={raio}
            gravar={(texto) => executarCorpo('Definir raio da curva', (f) => definirRaio(f, corpoId, indice, texto))}
            celula
          />
        )}
      </td>
      <td className="fam-corpo-linha-acoes">
        <button type="button" className="fam-bt" title={t('fam_corpo_ponto_subir')} disabled={indice === 0} onClick={() => reordenar(-1)}>↑</button>
        <button type="button" className="fam-bt" title={t('fam_corpo_ponto_descer')} disabled={indice >= total - 1} onClick={() => reordenar(1)}>↓</button>
        <button type="button" className="fam-bt" title={t('fam_corpo_ponto_remover')} disabled={total <= 2} onClick={() => executarCorpo('Remover ponto do caminho', (f) => removerPontoCaminho(f, corpoId, indice))}>×</button>
      </td>
    </tr>
  );
}
