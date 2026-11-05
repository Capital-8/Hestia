import type { ReactElement } from 'react';
import { useProject } from '../../editor/controller.ts';
import { fmtNum, useT, type Dict } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { cadDrawingsOf, cadLevelName, frameCad, removeCad, selectCad, setCadVisible } from '../../editor/cadActions.ts';
import { Node, type MenuItem } from './Tree.tsx';

/**
 * Nó "CAD importado" do Navegador de projeto: os desenhos DXF do projeto, com mostrar/ocultar, selecionar, enquadrar e
 * excluir no menu de contexto. Duplo clique abre a planta do nível e seleciona o desenho.
 */
export function CadTree(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const cads = cadDrawingsOf(p);
  const contar = (n: number, uma: keyof Dict, muitas: keyof Dict): string =>
    n === 1 ? t(uma, { n: fmtNum(n, 0, lang) }) : t(muitas, { n: fmtNum(n, 0, lang) });
  return (
    <Node
      id="g:cad"
      label={t('cvn_br_cad_imported')}
      icon="layers"
      group
      open
      empty={t('cvn_br_cad_empty')}
      menu={[
        { label: t('cvn_br_import_cad'), run: () => useUi.setState({ dialog: 'importCad', dialogArg: null }) },
        { label: t('cvn_br_manage_cad'), run: () => useUi.setState({ dialog: 'manageCad', dialogArg: null }) },
      ]}
    >
      {cads.map((c) => {
        const visivel = c.visible !== false;
        const menu: MenuItem[] = [
          { label: visivel ? t('cvn_br_hide') : t('cvn_br_show'), run: () => setCadVisible(c, !visivel) },
          { label: t('cvn_br_select'), run: () => selectCad(c) },
          { label: t('cvn_br_zoom_fit'), run: () => { selectCad(c); frameCad(c); } },
          { label: t('cvn_br_rename_cad'), run: () => useUi.setState({ dialog: 'manageCad', dialogArg: null }) },
          { label: t('cvn_br_delete'), run: () => removeCad(c), danger: true, sep: true },
        ];
        return (
          <Node
            key={c.id}
            id={`cad:${c.id}`}
            label={visivel ? c.name : t('cvn_br_cad_hidden', { name: c.name })}
            icon="layers"
            title={t('cvn_br_cad_title', {
              level: cadLevelName(p, c),
              layers: contar(c.layers.length, 'cvn_br_cad_layers_one', 'cvn_br_cad_layers_many'),
              paths: contar(c.paths.length, 'cvn_br_cad_paths_one', 'cvn_br_cad_paths_many'),
              texts: contar(c.texts.length, 'cvn_br_cad_texts_one', 'cvn_br_cad_texts_many'),
            })}
            onOpen={() => selectCad(c)}
            menu={menu}
          />
        );
      })}
    </Node>
  );
}
