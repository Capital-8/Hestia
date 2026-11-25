import { ALTURA_PADRAO, LADOS_PADRAO, type ModoMassa, type ToolOptions } from '@hestia/tools';
import { useUi } from '../../editor/state.ts';
import { MASSA_NA_FAIXA } from './massaNaFaixa.ts';
import { act, panel, soon, soonS, split, stack, t, tool, type RibbonItem, type RibbonPanel, type RibbonTab, type RibbonTabId, type Txt } from './model.ts';

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

/** Base da aba Suplementos: o renderizador e demais processos externos continuam acessíveis por aqui. */
export const SUPLEMENTOS_TAB: RibbonTab = tab('suplementos', t('Suplementos', 'Add-Ins'), panel('sup-externas', t('Ferramentas externas', 'External Tools'), act('externalTools')));

export const TABS_SOON: RibbonTab[] = [
  tab('aco', t('Aço', 'Steel'),
    panel('aco-conexoes', t('Conexões', 'Connections'), soon(t('Conexão', 'Connection')), act('familiasEstrutura', 'large'), soon(t('Ancoragem', 'Anchor'))),
    panel('aco-elementos', t('Elementos de aço', 'Steel Elements'), act('familiasEstrutura', 'large', t('Parafuso e chapa', 'Bolt & plate')), soon(t('Solda', 'Weld')), soon(t('Pino', 'Stud'))),
    panel('aco-modificar', t('Modificar', 'Modify'), stack(soonS(t('Entalhe', 'Cope'), 'soon'), soonS(t('Corte', 'Cut'), 'cut'), soonS(t('Chanfro', 'Chamfer'), 'soon'))),
  ),
  tab('premoldado', t('Pré-moldado', 'Precast'),
    p('pre-pecas', t('Peças', 'Parts'), [t('Painel', 'Panel')], [t('Pilar', 'Column'), 'column'], [t('Viga', 'Beam'), 'beam']),
    p('pre-divisao', t('Divisão', 'Divide'), [t('Dividir peça', 'Divide Part')], [t('Juntas', 'Joints')]),
  ),
  tab('sistemas', t('Sistemas', 'Systems'),
    // Cada painel lê a tabela de destinos (J1): o que a pessoa classifica no editor de famílias aparece aqui sozinho.
    panel('sis-hidraulica', t('Hidráulica e tubulação', 'Plumbing & Piping'),
      tool('tubo', 'large', { label: t('Tubo', 'Pipe'), icon: 'mepTubo' }),
      act('familiasHidro', 'large'),
      act('verificarRede', 'large', t('Verificar rede', 'Check network')),
      act('catalogoMep', 'large'),
      soon(t('Aparelho sanitário', 'Fixture'), 'mepAparelhoSanitario')),
    panel('sis-eletrico', t('Elétrico', 'Electrical'), tool('eletroduto', 'large', { label: t('Eletroduto', 'Conduit'), icon: 'mepEletroduto' }), act('familiasEletrico', 'large'), act('circuitos', 'large'), act('verificarRede', 'large'), act('quantitativosEletricos', 'large'), soon(t('Bandeja', 'Cable Tray'), 'mepBandeja')),
    panel('sis-hvac', t('HVAC', 'HVAC'), act('familiasHvac', 'large'), soon(t('Tubo flexível', 'Flex Duct'), 'mepTuboFlexivel')),
    panel('sis-mecanico', t('Mecânico', 'Mechanical'), soon(t('Equipamento', 'Equipment'), 'mepEquipamento'), tool('component', 'large', { label: t('Componente', 'Component'), icon: 'component' })),
  ),
  tab('analisar', t('Analisar', 'Analyze'),
    p('ana-espacos', t('Espaços e zonas', 'Spaces & Zones'), [t('Espaço', 'Space')], [t('Zona', 'Zone')]),
    p('ana-relatorios', t('Relatórios e tabelas', 'Reports & Schedules'), [t('Relatório de carga', 'Load Report')], [t('Tabela de carga', 'Load Schedule')]),
    p('ana-energia', t('Energia', 'Energy'), [t('Otimização de energia', 'Energy Optimization')]),
    p('ana-verificacao', t('Verificação', 'Check'), [t('Verificar sistemas', 'Check Systems')]),
  ),
  tab('massa', t('Massa e terreno', 'Massing & Site'),
    panel('mas-massa', t('Modelo de massa', 'Conceptual Mass'),
      ...(MASSA_NA_FAIXA
        ? [
            tool('mass', 'large', { label: t('Massa', 'Mass'), icon: 'mass' }),
            modoMassa('extrusao', t('Extrusão', 'Extrusion'), 'massExtrude'),
            modoMassa('mistura', t('Mistura', 'Blend'), 'massBlend'),
            modoMassa('loft', t('Loft', 'Loft'), 'massLoft'),
            modoMassa('bulbo', t('Bulbo', 'Bulb'), 'massBulb'),
            act('showMass'),
          ]
        : [
            soon(t('Massa', 'Mass'), 'mass'),
            soonS(t('Extrusão', 'Extrusion'), 'massExtrude'),
            soonS(t('Mistura', 'Blend'), 'massBlend'),
            soonS(t('Loft', 'Loft'), 'massLoft'),
            soonS(t('Bulbo', 'Bulb'), 'massBulb'),
            soon(t('Mostrar massa', 'Show Mass'), 'massShow'),
          ]),
      soon(t('Massa no local', 'In-Place Mass'), 'massInPlace'),
      soon(t('Colocar massa', 'Place Mass'), 'massPlace'),
    ),
    panel('mas-por-massa', t('Modelo por massa', 'Model by Face'), ...(MASSA_NA_FAIXA ? [act('pisosDaMassa'), act('paredesDaMassa')] : [soon(t('Pisos da massa', 'Floors from Mass'), 'massFloors'), soon(t('Paredes da massa', 'Walls from Mass'), 'massWalls')]), soon(t('Telhado por face', 'Roof by Face'), 'massRoofFace'), soon(t('Parede por face', 'Wall by Face'), 'massWallFace'), soon(t('Forro por face', 'Ceiling by Face'), 'massCeilFace'), soon(t('Piso por face', 'Floor by Face'), 'massFloorFace')),
    // Terreno, lote e análise (frente do terreno): Topografia e Editar terreno, Rótulo de curva e Cota de ponto já funcionam; o resto é das fichas T3, P3 a P5 e U2.
    panel('mas-terreno', t('Terreno', 'Site Modeling'),
      split(tool('terrain', 'large', { label: t('Topografia', 'Toposurface'), icon: 'terrTopo' }), [act('terrenoPontos', 'small'), act('terrenoCurvas', 'small'), act('importTerreno', 'small')], t('Topografia', 'Toposurface')),
      act('editTerreno'),
      // Região de terreno (ficha T3): UM ToolId (`terrainRegion`) com três predefinições; a "Região de terreno" do menu abre a ferramenta e o papel se escolhe na barra de opções.
      split(act('regiaoSubdivisao'), [tool('terrainRegion', 'small', { label: t('Região de terreno', 'Terrain Region'), icon: 'terrRegion' })], t('Subdivisão', 'Subregion')),
      split(act('regiaoPlataforma'), [act('regiaoPlataformaElemento')], t('Plataforma', 'Building Pad')),
      act('regiaoNivelada'),
      soon(t('Componente de terreno', 'Site Component'), 'terrSiteComp')),
    // Linhas de propriedade (ficha P3): a ferramenta `lot` (Desenhar) e o diálogo Por tabela…; Índices do lote (ficha P4) abre a tabela; Envelope legal (P5) segue `soon`.
    panel('mas-lote', t('Lote', 'Lot'), split(tool('lot', 'large', { label: t('Linhas de propriedade', 'Property Line'), icon: 'lotLines' }), [act('loteDesenhar', 'small'), act('lotePorTabela', 'small')], t('Linhas de propriedade', 'Property Line')), act('indicesLote'), soon(t('Envelope legal', 'Legal Envelope'), 'lotEnvelope')),
    panel('mas-analise', t('Análise do terreno', 'Site Analysis'),
      act('corteAterro'),
      act('mapaCorteAterro'),
      tool('terrainLabel', 'large', { label: t('Rótulo de curva', 'Contour Label'), icon: 'terrContourLabel' }),
      tool('terrainSpot', 'large', { label: t('Cota de ponto', 'Spot Elevation'), icon: 'terrSpot' })),
  ),
  tab('colaborar', t('Colaborar', 'Collaborate'),
    panel('col-comunicar', t('Comunicar', 'Communicate'),
      act('collabSession', 'large', t('Colaborar', 'Collaborate')),
      act('collabShare', 'large', t('Compartilhar link', 'Share Link')),
      act('collabJoin', 'large', t('Entrar na sessão', 'Join Session')),
      act('collabPeers', 'large', t('Participantes', 'Participants')),
    ),
    panel('col-sincronizar', t('Sincronizar', 'Synchronize'),
      act('collabSync', 'large', t('Sincronizar', 'Synchronize')),
      act('collabActivity', 'large', t('Histórico da sessão', 'Session History')),
    ),
    panel('col-gerenciar', t('Gerenciar colaboração', 'Manage Collaboration'),
      act('collabWorksets', 'large', t('Conjuntos de trabalho', 'Worksets')),
      soon(t('Opções de design', 'Design Options'), 'designOptions'),
    ),
    p('col-coordenar', t('Coordenar', 'Coordinate'), [t('Copiar/monitorar', 'Copy/Monitor')], [t('Verificar interferências', 'Interference Check')]),
  ),
  // Aba Suplementos: parte FIXA (gerenciador de plugins de integração, docs/plugins) + painéis contribuídos por manifestos
  // (ADR 0057). Os painéis dos suplementos ativos entram em tempo de execução via `withPluginPanels` (`pluginRibbon.ts`);
  // sem nenhum suplemento ativa, a aba é só "Ferramentas externas", como antes.
  SUPLEMENTOS_TAB,
];
