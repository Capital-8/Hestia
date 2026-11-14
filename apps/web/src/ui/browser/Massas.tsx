import type { ReactElement } from 'react';
import { isMass, type Id, type Mass, type Project } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { cmpTexto, useT } from '../../editor/i18n.ts';
import type { Lang } from '../../editor/i18n/tipos.ts';
import { abrirSecoesDaMassa } from '../../editor/massaLigacao.ts';
import { useUi } from '../../editor/state.ts';
import { alturaTotal } from '../massSecoesForm.ts';
import { useFormat } from '../useUnits.ts';
import { Node } from './Tree.tsx';

/** Categoria "Massas" do navegador: as instâncias do projeto, por nome (a massa não tem tipo, então não há família). */

/** Massas do projeto em ordem alfabética (empate: ordem de criação). */
export function massasDoProjeto(p: Project, lang: Lang = 'pt'): Mass[] {
  return Object.values(p.elements).filter(isMass).sort((a, b) => cmpTexto(a.name, b.name, lang) || a.order - b.order);
}

/** Um clique só seleciona a massa. */
export const selecionarMassa = (id: Id): void => useUi.setState({ selection: [id] });

/** Duplo clique ou "Propriedades": seleciona e abre a paleta de propriedades. */
export const abrirPropriedadesDaMassa = (id: Id): void => useUi.setState({ selection: [id], propsOpen: true });

/** Nós das massas dadas (um por instância). */
export function MassasNodes({ massas }: { massas: readonly Mass[] }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  return (
    <>
      {massas.map((m) => (
        <Node
          key={m.id}
          id={`ms:${m.id}`}
          label={m.name}
          icon="cube"
          title={t('ui_ms_br_title', { n: m.secoes.length, h: fmt('length', alturaTotal(m)) })}
          onSelect={() => selecionarMassa(m.id)}
          onOpen={() => abrirPropriedadesDaMassa(m.id)}
          menu={[
            { label: t('ui_ms_br_props'), run: () => abrirPropriedadesDaMassa(m.id) },
            { label: t('ui_ms_editar_secoes'), run: () => abrirSecoesDaMassa(m.id) },
          ]}
        />
      ))}
    </>
  );
}

/** Categoria "Massas" (no nível das demais categorias de elementos do navegador). Sem massas, mostra o texto de vazio. */
export function MassasCategory(): ReactElement {
  const { t, lang } = useT();
  const massas = massasDoProjeto(useProject(), lang);
  return (
    <Node id="cat:mass" label={t('ui_ms_br_cat')} group empty={t('ui_ms_br_empty')}>
      {massas.length ? <MassasNodes massas={massas} /> : undefined}
    </Node>
  );
}
