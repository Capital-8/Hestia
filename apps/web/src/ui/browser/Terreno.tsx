import type { ReactElement } from 'react';
import { areaDoLote } from '@hestia/engine';
import { formatQuantity, unitsOf } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { abrirImportTerreno } from '../../editor/terrenoImport.ts';
import { contarVerticesTerreno } from '../terrainPropsModel.ts';
import { editarTerrenoDoNavegador, excluirDoSitio, lotesDoProjeto, nomeDoNivel, regioesDoTerreno, selecionarNoSitio, terrenosDoProjeto } from './terrenoLista.ts';
import { Node } from './Tree.tsx';

/** Categoria "Terrenos" do Navegador de projeto: cada terreno com as suas regiões. Duplo clique seleciona; o menu edita, importa e exclui. */
export function TerrenosTree(): ReactElement {
  const { t } = useT();
  const p = useProject();
  return (
    <Node
      id="g:terrenos"
      label={t('ui_tn_br_terrenos')}
      icon="slope"
      group
      open
      empty={t('ui_tn_br_vazio')}
      menu={[{ label: t('ui_tn_br_importar'), run: abrirImportTerreno }]}
    >
      {terrenosDoProjeto(p).map((tn) => (
        <Node
          key={tn.id}
          id={`tn:${tn.id}`}
          label={tn.name}
          icon="slope"
          group={regioesDoTerreno(p, tn.id).length > 0}
          title={t('ui_tn_br_title', { level: nomeDoNivel(p, tn.levelId), n: contarVerticesTerreno(tn) })}
          onOpen={() => selecionarNoSitio(tn)}
          menu={[
            { label: t('cvn_br_select'), run: () => selecionarNoSitio(tn) },
            { label: t('ui_tn_p_editar'), run: () => editarTerrenoDoNavegador(p, tn) },
            { label: t('ui_tn_br_importar'), run: abrirImportTerreno },
            { label: t('cvn_br_delete'), run: () => excluirDoSitio(tn.id), danger: true, sep: true },
          ]}
        >
          {regioesDoTerreno(p, tn.id).map((r) => (
            <Node
              key={r.id}
              id={`tr:${r.id}`}
              label={r.name}
              icon="slope"
              title={t('ui_tn_br_title_regiao', { level: nomeDoNivel(p, r.levelId) })}
              onOpen={() => selecionarNoSitio(r)}
              menu={[
                { label: t('cvn_br_select'), run: () => selecionarNoSitio(r) },
                { label: t('cvn_br_delete'), run: () => excluirDoSitio(r.id), danger: true, sep: true },
              ]}
            />
          ))}
        </Node>
      ))}
    </Node>
  );
}

/** Categoria "Lotes" do Navegador de projeto. Duplo clique seleciona; o menu seleciona e exclui. */
export function LotesTree(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const units = unitsOf(p);
  return (
    <Node id="g:lotes" label={t('ui_tn_br_lotes')} icon="level" group open empty={t('ui_tn_br_vazio_lotes')}>
      {lotesDoProjeto(p).map((l) => (
        <Node
          key={l.id}
          id={`lt:${l.id}`}
          label={l.name}
          icon="level"
          title={t('ui_tn_br_title_lote', { level: nomeDoNivel(p, l.levelId), area: formatQuantity(units, 'area', areaDoLote(l.contorno)) })}
          onOpen={() => selecionarNoSitio(l)}
          menu={[
            { label: t('cvn_br_select'), run: () => selecionarNoSitio(l) },
            { label: t('cvn_br_delete'), run: () => excluirDoSitio(l.id), danger: true, sep: true },
          ]}
        />
      ))}
    </Node>
  );
}
