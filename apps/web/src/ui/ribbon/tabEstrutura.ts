import { act, panel, soon, soonS, stack, t, tool, type RibbonTab } from './model.ts';

export const TAB_ESTRUTURA: RibbonTab = {
  id: 'estrutura',
  label: t('Estrutura', 'Structure'),
  panels: [
    panel(
      'est-estrutura',
      t('Estrutura', 'Structure'),
      tool('beam', 'large', { label: t('Viga', 'Beam'), icon: 'beam' }),
      soon(t('Parede estrutural', 'Structural Wall'), 'wall'),
      tool('column', 'large', { label: t('Pilar', 'Column'), icon: 'column' }),
      soon(t('Piso estrutural', 'Structural Floor'), 'slab'),
      soon(t('Treliça', 'Truss'), 'truss'),
      soon(t('Contraventamento', 'Brace'), 'brace'),
      soon(t('Sistema de vigas', 'Beam System'), 'beamsystem'),
    ),
    panel(
      'est-fundacao',
      t('Fundação', 'Foundation'),
      tool('footing', 'large', { label: t('Isolada', 'Isolated'), icon: 'footing' }),
      soon(t('Parede', 'Wall'), 'wall'),
      soon(t('Laje', 'Slab'), 'floor'),
    ),
    panel(
      'est-conexao',
      t('Conexão', 'Connection'),
      soon(t('Ligação', 'Connection'), 'connection'),
    ),
    panel(
      'est-armadura',
      t('Armadura', 'Reinforcement'),
      soon(t('Vergalhão', 'Rebar'), 'rebar'),
      stack(
        soonS(t('Área', 'Area'), 'soon'),
        soonS(t('Caminho', 'Path'), 'soon'),
        soonS(t('Cobrimento', 'Cover'), 'soon'),
      ),
    ),
    panel(
      'est-modelo',
      t('Modelo', 'Model'),
      soon(t('Componente', 'Component'), 'component'),
      stack(
        soonS(t('Texto do modelo', 'Model Text'), 'text'),
        soonS(t('Linha do modelo', 'Model Line'), 'detailLine'),
        soonS(t('Grupo de modelos', 'Model Group'), 'layers'),
      ),
    ),
    panel(
      'est-abertura',
      t('Abertura', 'Opening'),
      soon(t('Shaft', 'Shaft'), 'shaft'),
      stack(
        soonS(t('Por face', 'By Face'), 'opening'),
        soonS(t('Parede', 'Wall'), 'opening'),
        soonS(t('Vertical', 'Vertical'), 'opening'),
      ),
    ),
    panel(
      'est-referencia',
      t('Referência', 'Datum'),
      act('levelTool', 'large', t('Nível', 'Level')),
      tool('grid', 'large', { label: t('Eixo', 'Grid'), icon: 'grid' }),
    ),
  ],
};
