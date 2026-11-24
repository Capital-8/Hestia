import {
  duplicarLigacao,
  editarLigacao,
  espelharLigacaoEmX,
  excluirLigacao,
  type DominioLigacao,
  type FluxoLigacao,
  type Ligacao,
  type Ponto3,
  type SecaoLigacao,
} from '@hestia/model';
import type { Familia } from '@hestia/model';
import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import type { ChaveI18n } from './familiaCorpo.ts';
import { useFamilia } from './familiaStore.ts';

/*
 * Formulário de UMA ligação (ficha C2): domínio, seção, nome, posição, direção (com atalhos ±X ±Y ±Z), medidas, fluxo,
 * propriedades chave/valor e `propagaParametro`. Cada gravação passa pelo modelo (`editarLigacao`); a recusa aparece no
 * campo ou no aviso da seção, como nos corpos.
 */

export const DOMINIOS_LIGACAO_UI: readonly DominioLigacao[] = [
  'agua_fria', 'agua_quente', 'esgoto', 'ventilacao', 'pluvial', 'gas', 'incendio', 'eletrica_forca', 'eletrica_dados',
  'eletroduto', 'eletrocalha', 'ar_insuflamento', 'ar_retorno', 'refrigerante', 'estrutural',
];

export const ROTULO_DOMINIO: Readonly<Record<DominioLigacao, ChaveI18n>> = {
  agua_fria: 'fam_lig_d_agua_fria',
  agua_quente: 'fam_lig_d_agua_quente',
  esgoto: 'fam_lig_d_esgoto',
  ventilacao: 'fam_lig_d_ventilacao',
  pluvial: 'fam_lig_d_pluvial',
  gas: 'fam_lig_d_gas',
  incendio: 'fam_lig_d_incendio',
  eletrica_forca: 'fam_lig_d_eletrica_forca',
  eletrica_dados: 'fam_lig_d_eletrica_dados',
  eletroduto: 'fam_lig_d_eletroduto',
  eletrocalha: 'fam_lig_d_eletrocalha',
  ar_insuflamento: 'fam_lig_d_ar_insuflamento',
  ar_retorno: 'fam_lig_d_ar_retorno',
  refrigerante: 'fam_lig_d_refrigerante',
  estrutural: 'fam_lig_d_estrutural',
};

export const SECOES_LIGACAO_UI: readonly SecaoLigacao[] = ['redonda', 'retangular'];
export const ROTULO_SECAO_LIGACAO: Readonly<Record<SecaoLigacao, ChaveI18n>> = {
  redonda: 'fam_lig_redonda',
  retangular: 'fam_lig_retangular',
};

export const FLUXOS_LIGACAO_UI: readonly FluxoLigacao[] = ['entrada', 'saida', 'ambos'];
export const ROTULO_FLUXO_LIGACAO: Readonly<Record<FluxoLigacao, ChaveI18n>> = {
  entrada: 'fam_lig_fluxo_entrada',
  saida: 'fam_lig_fluxo_saida',
  ambos: 'fam_lig_fluxo_ambos',
};

/** Atalhos de direção: o vetor literal, no sentido do eixo (o rótulo é o próprio eixo, não se traduz). */
export const ATALHOS_DIRECAO: ReadonlyArray<{ rotulo: string; vetor: Ponto3 }> = [
  { rotulo: '+X', vetor: ['1', '0', '0'] },
  { rotulo: '−X', vetor: ['-1', '0', '0'] },
  { rotulo: '+Y', vetor: ['0', '1', '0'] },
  { rotulo: '−Y', vetor: ['0', '-1', '0'] },
  { rotulo: '+Z', vetor: ['0', '0', '1'] },
  { rotulo: '−Z', vetor: ['0', '0', '-1'] },
];

/** Troca um eixo do vetor, devolvendo vetor novo (o original não muda). */
function comEixo(p: Ponto3, i: 0 | 1 | 2, texto: string): Ponto3 {
  const q: Ponto3 = [p[0], p[1], p[2]];
  q[i] = texto;
  return q;
}

/** Primeiro nome de propriedade `propN` livre dentro do mapa. */
function chaveLivre(props: Record<string, string>): string {
  let n = 1;
  while (`prop${n}` in props) n++;
  return `prop${n}`;
}

interface Props {
  ligacao: Ligacao;
  /** Recusa (ou `null`) da última ação de seção (espelhar, duplicar, excluir, troca de seção). */
  aoErro: (motivo: string | null) => void;
  /** A ligação foi excluída: quem chama tira a seleção. */
  aoExcluir: () => void;
}

export function FamiliaLigacoesForm({ ligacao, aoErro, aoExcluir }: Props): ReactElement {
  const { t } = useT();
  const id = ligacao.id;
  const props: Record<string, string> = ligacao.propriedades ?? {};

  const executar = (rotulo: string, receita: (f: Familia) => string | null): string | null =>
    useFamilia.getState().executar(rotulo, receita);
  const aplicar = (rotulo: string, patch: Partial<Omit<Ligacao, 'id'>>): string | null =>
    executar(rotulo, (f) => editarLigacao(f, id, patch));

  const trocarSecao = (secao: SecaoLigacao): void => {
    if (secao === ligacao.secao) return;
    aoErro(
      secao === 'redonda'
        ? aplicar('Trocar seção', { secao, diametro: ligacao.diametro ?? '20', largura: undefined, altura: undefined })
        : aplicar('Trocar seção', { secao, largura: ligacao.largura ?? '100', altura: ligacao.altura ?? '50', diametro: undefined }),
    );
  };

  const alterarProps = (nova: Record<string, string>): string | null =>
    aplicar('Editar propriedades', { propriedades: Object.keys(nova).length === 0 ? undefined : nova });

  const excluir = (): void => {
    const motivo = executar('Excluir ligação', (f) => excluirLigacao(f, id));
    if (motivo === null) aoExcluir();
    else aoErro(motivo);
  };

  const eixos = [0, 1, 2] as const;
  const rotuloEixo = ['X', 'Y', 'Z'] as const;

  return (
    <div className="fam-lig-form">
      <div className="fam-grp">
        <div className="fam-gh">{ligacao.nome}</div>
        <CampoCorpo key={`nome:${ligacao.nome}`} id={`fln-${id}-nome`} rotulo={t('fam_lig_nome')} valor={ligacao.nome} formula={false} gravar={(texto) => aplicar('Renomear ligação', { nome: texto })} />
        <div className="fam-row"><label htmlFor={`fln-${id}-dominio`}>{t('fam_lig_escolha_dominio')}</label>
          <select id={`fln-${id}-dominio`} className="fam-f" value={ligacao.dominio} onChange={(e) => aoErro(aplicar('Trocar domínio', { dominio: e.target.value as DominioLigacao }))}>
            {DOMINIOS_LIGACAO_UI.map((d) => <option key={d} value={d}>{t(ROTULO_DOMINIO[d])}</option>)}
          </select>
        </div>
        <div className="fam-row"><label htmlFor={`fln-${id}-secao`}>{t('fam_lig_secao_campo')}</label>
          <select id={`fln-${id}-secao`} className="fam-f" value={ligacao.secao} onChange={(e) => trocarSecao(e.target.value as SecaoLigacao)}>
            {SECOES_LIGACAO_UI.map((s) => <option key={s} value={s}>{t(ROTULO_SECAO_LIGACAO[s])}</option>)}
          </select>
        </div>
        <div className="fam-row"><label htmlFor={`fln-${id}-fluxo`}>{t('fam_lig_fluxo')}</label>
          <select id={`fln-${id}-fluxo`} className="fam-f" value={ligacao.fluxo} onChange={(e) => aoErro(aplicar('Trocar fluxo', { fluxo: e.target.value as FluxoLigacao }))}>
            {FLUXOS_LIGACAO_UI.map((f) => <option key={f} value={f}>{t(ROTULO_FLUXO_LIGACAO[f])}</option>)}
          </select>
        </div>
      </div>

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_lig_posicao')}</div>
        {eixos.map((i) => (
          <CampoCorpo key={`pos${i}:${ligacao.posicao[i]}`} id={`fln-${id}-pos-${i}`} rotulo={rotuloEixo[i]} valor={ligacao.posicao[i]} gravar={(texto) => aplicar('Editar posição', { posicao: comEixo(ligacao.posicao, i, texto) })} />
        ))}
        <div className="fam-gh">{t('fam_lig_direcao')}</div>
        <div className="fam-hint">{t('fam_lig_direcao_dica')}</div>
        <div className="fam-corpo-marcas">
          {ATALHOS_DIRECAO.map((a) => (
            <button key={a.rotulo} type="button" className="fam-bt" onClick={() => aoErro(aplicar('Editar direção', { direcao: a.vetor }))}>{a.rotulo}</button>
          ))}
        </div>
        {eixos.map((i) => (
          <CampoCorpo key={`dir${i}:${ligacao.direcao[i]}`} id={`fln-${id}-dir-${i}`} rotulo={rotuloEixo[i]} valor={ligacao.direcao[i]} gravar={(texto) => aplicar('Editar direção', { direcao: comEixo(ligacao.direcao, i, texto) })} />
        ))}
      </div>

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_lig_secao_campo')}</div>
        {ligacao.secao === 'redonda' ? (
          <CampoCorpo key={`diam:${ligacao.diametro ?? ''}`} id={`fln-${id}-diametro`} rotulo={t('fam_lig_diametro')} valor={ligacao.diametro ?? ''} gravar={(texto) => aplicar('Editar diâmetro', { diametro: texto })} />
        ) : (
          <>
            <CampoCorpo key={`larg:${ligacao.largura ?? ''}`} id={`fln-${id}-largura`} rotulo={t('fam_lig_largura')} valor={ligacao.largura ?? ''} gravar={(texto) => aplicar('Editar largura', { largura: texto })} />
            <CampoCorpo key={`alt:${ligacao.altura ?? ''}`} id={`fln-${id}-altura`} rotulo={t('fam_lig_altura')} valor={ligacao.altura ?? ''} gravar={(texto) => aplicar('Editar altura', { altura: texto })} />
          </>
        )}
      </div>

      <div className="fam-grp">
        <div className="fam-gh">{t('fam_lig_propriedades')}</div>
        {Object.entries(props).map(([chave, valor]) => (
          <CampoCorpo
            key={`prop:${chave}:${valor}`}
            id={`fln-${id}-prop-${chave}`}
            rotulo={chave}
            valor={valor}
            gravar={(texto) => alterarProps({ ...props, [chave]: texto })}
          />
        ))}
        <div className="fam-corpo-acoes">
          <button type="button" className="fam-bt" onClick={() => aoErro(alterarProps({ ...props, [chaveLivre(props)]: '0' }))}>{t('fam_lig_prop_adicionar')}</button>
        </div>
      </div>

      <div className="fam-grp">
        <CampoCorpo key={`propaga:${ligacao.propagaParametro ?? ''}`} id={`fln-${id}-propaga`} rotulo={t('fam_lig_propaga')} valor={ligacao.propagaParametro ?? ''} opcional formula={false} gravar={(texto) => aplicar('Editar propagação', { propagaParametro: texto.trim() === '' ? undefined : texto.trim() })} />
        <div className="fam-hint">{t('fam_lig_propaga_dica')}</div>
      </div>

      <div className="fam-grp">
        <div className="fam-corpo-acoes">
          <button type="button" className="fam-bt" onClick={() => aoErro(executar('Espelhar ligação', (f) => espelharLigacaoEmX(f, id)))}>{t('fam_lig_espelhar')}</button>
          <button type="button" className="fam-bt" onClick={() => aoErro(executar('Duplicar ligação', (f) => duplicarLigacao(f, id)))}>{t('fam_lig_duplicar')}</button>
          <button type="button" className="fam-bt" onClick={excluir}>{t('fam_lig_excluir')}</button>
        </div>
      </div>
    </div>
  );
}
