import { useEffect, useState, type ReactElement } from 'react';
import { bitolasDoTubo, TIPOS_TUBULACAO, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { FAMILIA_ELETRODUTO, FAMILIA_TUBO_PADRAO, opcoesEletroduto, opcoesTubo, type ModoCota } from '@hestia/tools';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row } from './fields.tsx';

/** Diâmetros nominais (mm) oferecidos no painel; o DN fica em `opcoesTubo`, lido pela ferramenta a cada clique. */
const DN_COMUNS = [32, 40, 50, 75, 100, 150, 200];

/** Modos de mudança de cota (ficha B4); rótulos fixos em português, como o painel de material do corpo. */
const MODOS_COTA: ReadonlyArray<{ id: ModoCota; nome: string }> = [{ id: 'subir_primeiro', nome: 'Subir primeiro' }, { id: 'andar_primeiro', nome: 'Andar primeiro' }, { id: 'diagonal', nome: 'Diagonal' }];

/**
 * Painel de colocação da ferramenta Tubo (ficha C5): família de tubo, DN e altura (z) dos pontos clicados. Com `eletrico` serve à
 * ferramenta Eletroduto (ficha C3): só os tipos elétricos, bitolas do catálogo e as opções próprias (`opcoesEletroduto`); o título
 * vai em português fixo, como o seletor de mudança de cota.
 */
export function TuboProperties({ eletrico = false }: { eletrico?: boolean } = {}): ReactElement {
  const { t } = useT();
  const p = useProject();
  const escolhidaTubo = useUi((s) => s.options.componentFamilyId);
  const opc = eletrico ? opcoesEletroduto : opcoesTubo;
  const escolhida = eletrico ? opcoesEletroduto.familiaId : escolhidaTubo;
  // `opcoesTubo` é um objeto simples (a ferramenta não é React): o estado local só força o redesenho depois de cada edição.
  const [, redesenhar] = useState(0);
  // Famílias elétricas só aparecem no painel do Eletroduto, nunca na lista do Tubo (e vice-versa).
  const doProjeto = Object.values(p.componentFamilies ?? {}).filter((f) => (f.ligacoes?.length ?? 0) >= 2 && (tipoDaFamiliaDeTubo(f.id)?.dominio === 'eletroduto') === eletrico && (!eletrico || tipoDaFamiliaDeTubo(f.id) !== undefined));
  // Tipos de tubulação da biblioteca (Krona): aparecem mesmo antes de a família entrar no projeto (ela entra com o primeiro trecho).
  const daBiblioteca = TIPOS_TUBULACAO.filter((tp) => (tp.dominio === 'eletroduto') === eletrico && !doProjeto.some((f) => f.id === tp.regras.tubo)).map((tp) => ({ id: tp.regras.tubo, nome: tp.rotulo }));
  const familias = [...doProjeto.map((f) => ({ id: f.id, nome: tipoDaFamiliaDeTubo(f.id)?.rotulo ?? f.nome })), ...daBiblioteca];
  const atual = escolhida ?? (eletrico ? FAMILIA_ELETRODUTO : FAMILIA_TUBO_PADRAO);
  const bitolas = bitolasDoTubo(atual);
  const base = bitolas ?? DN_COMUNS;
  const dns = base.includes(opc.dn) ? base : [...base, opc.dn].sort((a, b) => a - b);
  // Projeto sem nenhum tubo e sem escolha: o tipo padrão passa a ser o esgoto da Krona (o genérico segue na lista).
  useEffect(() => {
    if (!eletrico && escolhida === undefined && doProjeto.length === 0) useUi.setState((s) => ({ options: { ...s.options, componentFamilyId: 'fam_krona_esgoto_tubo_corte', componentTypeId: null } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const trocarTipo = (id: string): void => {
    const lista = bitolasDoTubo(id);
    // A bitola atual pode não existir no tipo novo (ex.: DN 63 na Krona): vai para 100 ou para a primeira da lista.
    if (lista && !lista.includes(opc.dn)) opc.dn = lista.includes(100) ? 100 : (lista[0] ?? opc.dn);
    if (eletrico) opcoesEletroduto.familiaId = id;
    else useUi.setState((s) => ({ options: { ...s.options, componentFamilyId: id, componentTypeId: null } }));
    redesenhar((n) => n + 1);
  };
  return (
    <Group title={eletrico ? 'Eletroduto' : t('tubo_grupo')}>
      {familias.length === 0 ? <p className="hint">{t('tubo_sem_familia')}</p> : null}
      <Row label={t('tubo_familia')} htmlFor="place-tubo-familia">
        <select id="place-tubo-familia" className="select" value={atual} onChange={(e) => trocarTipo(e.target.value)}>
          {familias.some((f) => f.id === atual) ? null : <option value={atual}>{atual}</option>}
          {familias.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </Row>
      <Row label={t('tubo_dn')} htmlFor="place-tubo-dn">
        <select id="place-tubo-dn" className="select" value={opc.dn} onChange={(e) => { opc.dn = Number(e.target.value); redesenhar((n) => n + 1); }}>
          {dns.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Row>
      <Row label={t('mi_declividade')} htmlFor="place-tubo-decl">
        <NumField id="place-tubo-decl" value={opc.declividade} suffix="%" decimals={2} onCommit={(v) => { opc.declividade = v; redesenhar((n) => n + 1); }} />
      </Row>
      <Row label={t('tubo_altura')} htmlFor="place-tubo-z">
        <NumField id="place-tubo-z" quantity="length" value={opc.z} onCommit={(v) => { opc.z = v; redesenhar((n) => n + 1); }} />
      </Row>
      <Row label="Mudança de cota" htmlFor="place-tubo-modocota">
        <select id="place-tubo-modocota" className="select" value={opc.modoCota} onChange={(e) => { opc.modoCota = e.target.value as ModoCota; redesenhar((n) => n + 1); }}>
          {MODOS_COTA.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Row>
    </Group>
  );
}
