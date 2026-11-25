import { useMemo, type ReactElement } from 'react';
import { diagnosticarRede, LIMITE_CURVAS_ENTRE_CAIXAS, type Diagnostico } from '@hestia/engine';
import type { ValidationIssue } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { goToIssue } from '../editor/goToIssue.ts';
import { useT, type Lang } from '../editor/i18n.ts';

/*
 * Painel "Verificar rede" (ficha C7): lista os diagnósticos de `diagnosticarRede` com um "Ir para" em cada um, que seleciona e
 * enquadra a instância (o mesmo caminho dos avisos, `goToIssue`). Não é montado na barra ainda: a montagem fica para a ficha
 * de interface (ver relatório da C7).
 */

type Tradutor = ReturnType<typeof useT>['t'];

/** Motivos fixos de `ligacoesCompativeis` (engine, português) para a chave de tradução. Outro texto cai em `rede_motivo_outro`. */
const CHAVE_MOTIVO: Record<string, 'rede_motivo_dominio' | 'rede_motivo_secao' | 'rede_motivo_bitola' | 'rede_motivo_direcao' | 'rede_motivo_fluxo'> = {
  'domínios incompatíveis': 'rede_motivo_dominio',
  'seções diferentes': 'rede_motivo_secao',
  'bitolas diferentes': 'rede_motivo_bitola',
  'ligações precisam apontar uma para a outra': 'rede_motivo_direcao',
  'fluxos incompatíveis': 'rede_motivo_fluxo',
};

/** Número com a casa decimal do idioma (uma casa). */
// units-ok: o diagnóstico sai em mm e % fixos (CONTRATO §3 e §7); o texto do painel já traz a unidade, sem conversão do projeto
const numero = (v: number | undefined, lang: Lang): string => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(v ?? 0);

/** Texto de um diagnóstico no idioma atual. */
export function textoDoDiagnostico(d: Diagnostico, t: Tradutor, lang: Lang, nomes: Readonly<Record<string, string>> = {}): string {
  const ligacao = d.ligacaoId ?? '';
  const circuito = nomes[d.circuitoId ?? ''] ?? d.circuitoId ?? '';
  switch (d.codigo) {
    case 'ligacao_aberta':
      return t('rede_aberta', { ligacao });
    case 'conexao_invalida':
      return t('rede_invalida');
    case 'conexao_afastada':
      return t('rede_afastada', { ligacao, mm: numero(d.valor, lang) });
    case 'incompativel':
      return t('rede_incompativel', { ligacao, motivo: t(CHAVE_MOTIVO[d.motivo ?? ''] ?? 'rede_motivo_outro') });
    case 'inclinacao_fora_limite':
      return t('rede_inclinacao', { pct: numero(d.valor, lang) });
    case 'rede_sem_saida':
      return t('rede_sem_saida', { n: d.valor ?? 0 });
    case 'curvas_entre_caixas':
      return t('rede_curvas', { n: numero(d.valor, lang), limite: LIMITE_CURVAS_ENTRE_CAIXAS });
    case 'circuito_sem_quadro':
      return t('rede_el_sem_quadro', { circuito });
    case 'ponto_sem_eletroduto':
      return t('rede_el_ponto_sem_eletroduto', { circuito });
    case 'dispositivo_sem_eletroduto':
      return t('rede_el_dispositivo_sem_eletroduto');
    case 'quadro_sem_posicao':
      return t('rede_el_quadro_posicoes', { n: d.valor ?? 0, limite: d.limite ?? 0 });
    case 'ponto_potencia_zero':
      return t('rede_el_potencia_zero', { circuito });
  }
}

/** Gravidade do diagnóstico: conexão quebrada ou incompatível é erro; o resto é aviso. */
export const gravidade = (d: Diagnostico): ValidationIssue['severity'] => (d.codigo === 'conexao_invalida' || d.codigo === 'incompativel' ? 'error' : 'warning');

/** Diagnóstico como aviso, para o `goToIssue` selecionar e enquadrar a instância. */
export const comoAviso = (d: Diagnostico, texto: string): ValidationIssue => ({ severity: gravidade(d), code: `rede-${d.codigo}`, message: texto, elementId: d.elementId });

export function RedeDiagnostico(): ReactElement {
  const { t, lang } = useT();
  const project = useProject();
  const itens = useMemo(() => {
    const nomes = Object.fromEntries(Object.values(project.circuitosEletricos ?? {}).map((c) => [c.id, c.nome]));
    return diagnosticarRede(project).map((d) => ({ d, texto: textoDoDiagnostico(d, t, lang, nomes) }));
  }, [project, t, lang]);

  if (itens.length === 0) return <p className="issues-ok">{t('rede_vazio')}</p>;
  return (
    <section className="issues-pop rede-diagnostico" aria-label={t('rede_secao')}>
      <h3>{t('rede_secao')}</h3>
      <p>{t('rede_contagem', { n: itens.length })}</p>
      <ul>
        {itens.map(({ d, texto }, i) => (
          <li key={`${d.codigo}-${d.elementId}-${d.ligacaoId ?? ''}-${i}`} className="issues-item">
            <span className="issues-msg">{texto}</span>
            <button type="button" className="chiplink" onClick={() => goToIssue(comoAviso(d, texto))} aria-label={t('rede_ir_aria', { msg: texto })}>
              {t('rede_ir')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
