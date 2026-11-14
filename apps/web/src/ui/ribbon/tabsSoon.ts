import { ALTURA_PADRAO, LADOS_PADRAO, type ModoMassa, type ToolOptions } from '@hestia/tools';
import { useUi } from '../../editor/state.ts';
import { act, panel, soon, soonS, stack, t, tool, type RibbonItem, type RibbonPanel, type RibbonTab, type RibbonTabId, type Txt } from './model.ts';

/**
 * Abas do Revit que o Hestia ainda não tem por inteiro. Existem para manter a sequência e o roteiro: o que ainda não
 * existe é `soon` (esmaecido, tooltip "ainda não disponível"); quando uma ferramenta nascer, troque o `soon` pela
 * ferramenta. Já têm botões reais: Massa e terreno (ferramenta Massa, os quatro modos, "Mostrar massa" e "Pisos da massa"), alguns
 * botões que reaproveitam ferramentas do Arquitetura (parede, laje, nível, grade...) e Suplementos (ferramentas
 * externas). Os nomes de painel destas abas são aproximados; confira com o Revit antes de implementar.
 */

const tab = (id: RibbonTabId, label: Txt, ...panels: RibbonPanel[]): RibbonTab => ({ id, label, panels });
const p = (id: string, title: Txt, ...names: Array<[Txt, string?]>): RibbonPanel =>
  panel(id, title, ...names.map(([n, icon]) => soon(n, icon)));

/**
 * Botão de modo da massa (ficha T1a, E11): liga a ferramenta `mass` já no modo, pelo mesmo `kind: 'option'` dos modos
 * do telhado. O patch grava SÓ o modo e preserva o perfil, a altura e os lados que o usuário escolheu na barra de
 * opções (ficha U1): `mass` é um getter, lido na hora do clique (o clique espalha o patch sobre as opções atuais),
 * e sem escolha anterior valem os padrões (círculo, 9 m, 6 lados).
 */
const modoMassa = (modo: ModoMassa, label: Txt, icon: string): RibbonItem => ({
  kind: 'option',
  label,
  icon,
  size: 'small',
  test: (o) => (o.mass?.modo ?? 'extrusao') === modo,
  patch: {
    get mass(): NonNullable<ToolOptions['mass']> {
      const atual = useUi.getState().options.mass;
      return { perfil: 'circulo', altura: ALTURA_PADRAO, lados: LADOS_PADRAO, ...atual, modo };
    },
  },
  restart: 'mass',
});

export const TABS_SOON: RibbonTab[] = [
  tab('estrutura', t('Estrutura', 'Structure'),
    p('est-conexao', t('Conexão', 'Connection'), [t('Conexão', 'Connection')]),
    panel('est-estrutura', t('Estrutura', 'Structure'), soon(t('Pilar', 'Column'), 'column'), soon(t('Viga', 'Beam'), 'beam'), soon(t('Contraventamento', 'Brace'), 'soon'), stack(soonS(t('Sistema de vigas', 'Beam System'), 'beam'), soonS(t('Treliça', 'Truss'), 'soon'), soonS(t('Emenda', 'Splice'), 'soon'))),
    p('est-fundacao', t('Fundação', 'Foundation'), [t('Parede', 'Wall'), 'wall'], [t('Isolada', 'Isolated'), 'soon'], [t('Laje', 'Slab'), 'slab']),
    panel('est-reforco', t('Reforço', 'Reinforcement'), soon(t('Armadura', 'Rebar'), 'soon'), stack(soonS(t('Cobrimento', 'Cover'), 'soon'), soonS(t('Área', 'Area'), 'soon'), soonS(t('Malha', 'Fabric'), 'soon'))),
    p('est-analitico', t('Modelo analítico', 'Analytical Model'), [t('Cargas', 'Loads')], [t('Condições de contorno', 'Boundary Conditions')]),
    p('est-referencia', t('Referência', 'Datum'), [t('Nível', 'Level'), 'level'], [t('Grade', 'Grid'), 'grid']),
  ),
  tab('aco', t('Aço', 'Steel'),
    p('aco-conexoes', t('Conexões', 'Connections'), [t('Conexão', 'Connection')], [t('Chapa', 'Plate')], [t('Ancoragem', 'Anchor')]),
    p('aco-elementos', t('Elementos de aço', 'Steel Elements'), [t('Parafuso', 'Bolt')], [t('Solda', 'Weld')], [t('Pino', 'Stud')]),
    panel('aco-modificar', t('Modificar', 'Modify'), stack(soonS(t('Entalhe', 'Cope'), 'soon'), soonS(t('Corte', 'Cut'), 'cut'), soonS(t('Chanfro', 'Chamfer'), 'soon'))),
  ),
  tab('premoldado', t('Pré-moldado', 'Precast'),
    p('pre-pecas', t('Peças', 'Parts'), [t('Painel', 'Panel')], [t('Pilar', 'Column'), 'column'], [t('Viga', 'Beam'), 'beam']),
    p('pre-divisao', t('Divisão', 'Divide'), [t('Dividir peça', 'Divide Part')], [t('Juntas', 'Joints')]),
  ),
  tab('sistemas', t('Sistemas', 'Systems'),
    p('sis-hvac', t('HVAC', 'HVAC'), [t('Duto', 'Duct')], [t('Tubo flexível', 'Flex Duct')], [t('Difusor', 'Air Terminal')]),
    p('sis-mecanico', t('Mecânico', 'Mechanical'), [t('Equipamento', 'Equipment')], [t('Componente', 'Component'), 'component']),
    p('sis-hidraulica', t('Hidráulica e tubulação', 'Plumbing & Piping'), [t('Tubo', 'Pipe')], [t('Conexão', 'Fitting')], [t('Aparelho sanitário', 'Fixture')]),
    p('sis-eletrico', t('Elétrico', 'Electrical'), [t('Eletroduto', 'Conduit')], [t('Bandeja', 'Cable Tray')], [t('Luminária', 'Lighting')]),
  ),
  tab('analisar', t('Analisar', 'Analyze'),
    p('ana-espacos', t('Espaços e zonas', 'Spaces & Zones'), [t('Espaço', 'Space')], [t('Zona', 'Zone')]),
    p('ana-relatorios', t('Relatórios e tabelas', 'Reports & Schedules'), [t('Relatório de carga', 'Load Report')], [t('Tabela de carga', 'Load Schedule')]),
    p('ana-energia', t('Energia', 'Energy'), [t('Otimização de energia', 'Energy Optimization')]),
    p('ana-verificacao', t('Verificação', 'Check'), [t('Verificar sistemas', 'Check Systems')]),
  ),
  tab('massa', t('Massa e terreno', 'Massing & Site'),
    panel('mas-massa', t('Modelo de massa', 'Conceptual Mass'),
      tool('mass', 'large', { label: t('Massa', 'Mass'), icon: 'roof' }),
      modoMassa('extrusao', t('Extrusão', 'Extrusion'), 'roofextrusion'),
      modoMassa('mistura', t('Mistura', 'Blend'), 'attachroof'),
      modoMassa('loft', t('Loft', 'Loft'), 'roofarrow'),
      modoMassa('bulbo', t('Bulbo', 'Bulb'), 'slope'),
      act('showMass'),
      soon(t('Massa no local', 'In-Place Mass')),
      soon(t('Colocar massa', 'Place Mass')),
    ),
    panel('mas-por-massa', t('Modelo por massa', 'Model by Face'), act('pisosDaMassa'), act('paredesDaMassa'), soon(t('Telhado por face', 'Roof by Face'), 'roof'), soon(t('Parede por face', 'Wall by Face'), 'wall'), soon(t('Forro por face', 'Ceiling by Face'), 'ceiling'), soon(t('Piso por face', 'Floor by Face'), 'floor')),
    p('mas-terreno', t('Terreno', 'Site Modeling'), [t('Topografia', 'Toposurface')], [t('Subdivisão', 'Subregion')], [t('Plataforma', 'Building Pad')], [t('Componente de terreno', 'Site Component')], [t('Linhas de propriedade', 'Property Line')]),
  ),
  tab('colaborar', t('Colaborar', 'Collaborate'),
    p('col-comunicar', t('Comunicar', 'Communicate'), [t('Colaborar', 'Collaborate')]),
    p('col-sincronizar', t('Sincronizar', 'Synchronize'), [t('Sincronizar', 'Synchronize')]),
    p('col-gerenciar', t('Gerenciar colaboração', 'Manage Collaboration'), [t('Conjuntos de trabalho', 'Worksets')], [t('Opções de design', 'Design Options')]),
    p('col-coordenar', t('Coordenar', 'Coordinate'), [t('Copiar/monitorar', 'Copy/Monitor')], [t('Verificar interferências', 'Interference Check')]),
  ),
  // Única entrada habilitada de Suplementos: gerenciador de plugins de integração (docs/plugins).
  tab('suplementos', t('Suplementos', 'Add-Ins'), panel('sup-externas', t('Ferramentas externas', 'External Tools'), act('externalTools'))),
];
