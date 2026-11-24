import { excluirPrimitivo, pontosDoPrimitivo, substituirPrimitivo, type Familia, type Primitivo2D } from '@hestia/model';
import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import { comEscalar, comPonto, comVerticeNovo, literal, ROTULO_FERRAMENTA, semVertice, type CampoEscalar } from './familiaSimbolo.ts';

/*
 * Lista de primitivos do símbolo selecionado (ficha D3): um bloco por primitivo com os campos do tipo (X/Y dos pontos, raio,
 * ângulos, altura, texto), vértices da polilinha e excluir. Cada campo grava pelo modelo (`substituirPrimitivo`) e a recusa
 * aparece no próprio campo. Campo com fórmula não tem alça na tela, por isso o aviso.
 */

type Executar = (rotulo: string, receita: (f: Familia) => string | null) => string | null;

interface Props {
  simboloId: string;
  primitivos: Primitivo2D[];
  executar: Executar;
}

export function FamiliaSimboloPrimitivos({ simboloId, primitivos, executar }: Props): ReactElement {
  const { t } = useT();

  /** Campo X ou Y de um ponto do primitivo. */
  const campoPonto = (i: number, p: Primitivo2D, k: number, a: 0 | 1, rotulo: string): ReactElement | null => {
    const valor = pontosDoPrimitivo(p)[k]?.[a];
    if (valor === undefined) return null;
    return (
      <CampoCorpo
        key={`${i}:${k}:${a}:${valor}`}
        id={`fsp-${i}-${k}-${a}`}
        rotulo={rotulo}
        valor={valor}
        gravar={(texto) => executar('Editar ponto', (f) => substituirPrimitivo(f, simboloId, i, comPonto(p, k, a, texto)))}
      />
    );
  };

  /** Campo de texto do primitivo (raio, ângulos, altura, texto). */
  const campoEscalar = (i: number, p: Primitivo2D, campo: CampoEscalar, rotulo: string, valor: string | undefined, formula = true): ReactElement | null => {
    if (valor === undefined) return null;
    return (
      <CampoCorpo
        key={`${i}:${campo}:${valor}`}
        id={`fsp-${i}-${campo}`}
        rotulo={rotulo}
        valor={valor}
        formula={formula}
        gravar={(texto) => executar('Editar primitivo', (f) => substituirPrimitivo(f, simboloId, i, comEscalar(p, campo, texto)))}
      />
    );
  };

  const campos = (i: number, p: Primitivo2D): ReactElement[] => {
    switch (p.tipo) {
      case 'linha':
        return [
          <span key="de">{campoPonto(i, p, 0, 0, `${t('fam_sim_campo_de')} X`)}{campoPonto(i, p, 0, 1, `${t('fam_sim_campo_de')} Y`)}</span>,
          <span key="ate">{campoPonto(i, p, 1, 0, `${t('fam_sim_campo_ate')} X`)}{campoPonto(i, p, 1, 1, `${t('fam_sim_campo_ate')} Y`)}</span>,
        ];
      case 'circulo':
        return [
          <span key="c">{campoPonto(i, p, 0, 0, t('fam_sim_campo_x'))}{campoPonto(i, p, 0, 1, t('fam_sim_campo_y'))}</span>,
          <span key="r">{campoEscalar(i, p, 'raio', t('fam_sim_campo_raio'), p.raio)}</span>,
        ];
      case 'arco':
        return [
          <span key="c">{campoPonto(i, p, 0, 0, t('fam_sim_campo_x'))}{campoPonto(i, p, 0, 1, t('fam_sim_campo_y'))}</span>,
          <span key="r">{campoEscalar(i, p, 'raio', t('fam_sim_campo_raio'), p.raio)}</span>,
          <span key="a">{campoEscalar(i, p, 'deGraus', t('fam_sim_campo_ini'), p.deGraus)}{campoEscalar(i, p, 'ateGraus', t('fam_sim_campo_fim'), p.ateGraus)}</span>,
        ];
      case 'polilinha':
        return p.pontos.map((_, k) => (
          <span key={`v${k}`} className="fam-sim-vertice">
            <span className="fam-mut">{t('fam_sim_vertice', { n: k + 1 })}</span>
            {campoPonto(i, p, k, 0, t('fam_sim_campo_x'))}
            {campoPonto(i, p, k, 1, t('fam_sim_campo_y'))}
            <button type="button" className="fam-bt" onClick={() => {
              const novo = semVertice(p, k);
              if (novo !== null) executar('Remover vértice', (f) => substituirPrimitivo(f, simboloId, i, novo));
            }}>{t('fam_sim_vertice_excluir')}</button>
          </span>
        ));
      case 'texto':
        return [
          <span key="p">{campoPonto(i, p, 0, 0, t('fam_sim_campo_x'))}{campoPonto(i, p, 0, 1, t('fam_sim_campo_y'))}</span>,
          <span key="t">{campoEscalar(i, p, 'texto', t('fam_sim_campo_texto'), p.texto, false)}</span>,
          <span key="h">{campoEscalar(i, p, 'altura', t('fam_sim_campo_altura'), p.altura)}</span>,
        ];
    }
  };

  return (
    <>
      {primitivos.map((p, i) => {
        const comFormula = pontosDoPrimitivo(p).some((pt) => literal(pt[0]) === null || literal(pt[1]) === null);
        return (
          <div key={i} className="fam-grp fam-sim-prim">
            <div className="fam-gh">{t('fam_sim_prim_titulo', { n: i + 1, tipo: t(ROTULO_FERRAMENTA[p.tipo]) })}</div>
            {campos(i, p)}
            {comFormula && <div className="fam-hint">{t('fam_sim_prim_sem_alca')}</div>}
            {p.tipo === 'polilinha' && (
              <button type="button" className="fam-bt" onClick={() => {
                const novo = comVerticeNovo(p);
                if (novo !== null) executar('Novo vértice', (f) => substituirPrimitivo(f, simboloId, i, novo));
              }}>{t('fam_sim_vertice_novo')}</button>
            )}
            <button type="button" className="fam-bt" onClick={() => executar('Excluir primitivo', (f) => excluirPrimitivo(f, simboloId, i))}>
              {t('fam_sim_prim_excluir')}
            </button>
          </div>
        );
      })}
    </>
  );
}
