# Paridade · Paredes (inclui aberturas hospedadas)

Legenda: `[x]` feito e testado · `[~]` parcial, com o que falta na própria linha · `[ ]` pendente · `[-]` fora de escopo, com o motivo na própria linha.
Itens marcados **(bloqueante)** precisam estar feitos antes de abrir o próximo elemento.
Fonte do comportamento: [docs/05](../05-REFERENCIA-REVIT-ARCHICAD.md). Item sem fonte lá vira `[?]` no 05 antes de ser codificado.

## A · Geometria
- [x] A1 Parede reta por dois pontos, encadeada, com medida digitada (a parede cortina entra aqui como família de parede, decisão 0056; ela não passa pelo resolvedor de camadas)
- [x] A2 Altura livre ou até um nível, com deslocamentos de base e topo
- [x] A3 Linha de localização (6 opções) e lado externo/invertido
- [x] A4 Parede em arco (centro/raio/ângulos e por três pontos) **(bloqueante)**
- [x] A5 Criar por retângulo (dois cantos). Pegar linhas e faces existentes entra quando houver linhas de detalhe e massas
- [-] A6 Parede inclinada: rara em residencial; exige um modelo 3D de eixo inclinado; reavaliar com massas conceituais
- [x] A7 Editar perfil superior (topo inclinado, empena, degraus) em parede reta **(bloqueante)**
- [-] A10 Contorno vertical livre (furos e laterais arbitrárias, como o croqui do Revit): o perfil superior (A7) cobre empena, inclinado e degraus; furos internos ficam para o editor de croqui da fase de famílias
- [-] A8 Parede em degraus (empilhada): coberta por duas paredes empilhadas (C15) e pelas faixas verticais (B6)
- [-] A9 Espessura variável de camada (afunilada): rara em residencial; reavaliar na fase de interoperabilidade

## B · Camadas
- [x] B1 Camadas com função, material e espessura; núcleo derivado
- [x] B2 Prioridade de junção por função
- [x] B3 Prioridade por camada editável na interface (substituição) **(bloqueante)**
- [x] B4 "Envolve" aplicado nas extremidades e nos vãos **(bloqueante)**
- [x] B5 Membrana de espessura zero tratada em planta, 3D e quantitativos
- [x] B6 Faixas verticais no tipo (rodapé, barra de azulejo, friso): revestimento por altura, em planta, 3D, corte e quantitativos **(bloqueante)**
- [-] B9 Editor gráfico de regiões na elevação: as faixas são editadas por tabela com presets; o arraste gráfico entra com a edição em vista de elevação (fase de documentação)
- [-] B7 Estender ou encurtar uma camada no topo/base: coberta pelas faixas verticais (B6) e pelo perfil superior (A7)
- [-] B8 Dividir face e pintar região: pertence à ferramenta Pintar, comum a todos os elementos (checklist transversal de acabamentos)

## C · Junções
- [x] C1 Canto em L com esquadria por camada
- [x] C2 T com ramal até a face da camada correspondente da parede que passa (docs/08 §5.7; antes ia até a linha de centro)
- [x] C3 Cruzamento em X sem duplicar área
- [x] C4 Paredes alinhadas contínuas, inclusive com espessuras diferentes
- [x] C5 "Não unir" no início e no fim
- [x] C6 Escolha do tipo de junção no canto (encosto e esquadria; o esquadro foi removido, 0010 #1) **(bloqueante)**
- [x] C7 Trocar a ordem de junção (qual parede domina)
- [x] C8 Botões de "Permitir junção" e "Limpar junção" na interface (propriedades da parede e ferramenta Junção)
- [x] C9 Nó de 3 ou mais paredes sem par colinear resolvido de forma exata **(bloqueante)** — `nodeOfWalls`: cortes retos no ponto do nó e pintor por prioridade, sem fresta quando nenhuma lacuna passa de 180°; a configuração de junção vale no canto externo (docs/08 §6.3; 0010 #3)
- [x] C10 Ângulos agudos e obtusos extremos sem artefato — retas: L e T de 45° a 135° nos dois tipos, encosto e esquadria (`juntasInvariantes.test.ts`); ângulos de parede curva dentro do domínio de C13 (fora dele, CV-2)
- [x] C11 Tolerância de junção configurável e por distância real **(bloqueante)**
- [x] C12 Tipos de espessuras muito diferentes verificados em casos dourados
- [x] C13 Junção com parede em arco **(bloqueante)** — L, T e correntes tangentes dentro do domínio suportado: raio ≥ 3 m e quina de 60° a 120° (23 testes em `curvas.test.ts`; corte plano pelas faces, 0010 #7; docs/08 §6.5). Fora desse domínio (R < 3 m, quina de 30° ou 150°) a junção é de melhor esforço: pode sobrar ponta de poucos centímetros ou anel extra (CV-2, docs/08 §6.5)
- [x] C14 Paredes sobrepostas detectadas, com aviso
- [x] C15 Parede empilhada sobre outra (níveis diferentes)
- [~] C16 Junção com pilar, viga e cortina de vidro: cortina feita (decisão 0056, fase 3, esquema v16, seção 110) — encosto reto no montante de borda com parede comum em L e em T (a cortina recua até a face da vizinha; a parede comum termina em corte reto no eixo, sem mudar o resultado do resolvedor de camadas), montante de canto entre cortinas de 30° a 150° com profundidades diferentes e continuidade quando colineares, e `noJoinStart/End` desligam a ponta; testes de propriedade e dourados de planta em `cortina_juncao_testes.rs`. Pilar e viga seguem pendentes (checklists próprios)
- [-] C17 Divisão automática ao cruzar: o Revit também não divide sozinho
- [x] C18 Quina em encosto pareia por face, em degraus, sem aviso nem lote de correção (docs/08 §5.7; decisão 0009 #11). O esquadro, que pareava do mesmo jeito, foi removido (0010 #1)
- [x] C19 Junção oblíqua em L e T (30° a 150°) sem triângulo vazio; 90° igual ao caso reto anterior (`obliquas.test.ts`; 0010 #2)

## D · Aberturas hospedadas
- [x] D1 Porta e janela hospedadas, recorte em todas as camadas
- [x] D2 Peças acima e abaixo do vão no 3D
- [x] D3 Retorno do acabamento no vão pelo tipo da parede e pela família da abertura **(bloqueante)**
- [x] D4 Abertura pura (vão sem elemento) e vão por croqui
- [-] D5 Vão em arco e outras formas não retangulares: dependem do editor de famílias/croqui (fase de famílias)
- [x] D6 Abertura em parede curva **(bloqueante)**
- [x] D7 Trocar a parede anfitriã de uma abertura
- [x] D8 Aviso quando o encurtamento da parede deixa a abertura sem espaço
- [x] D9 Símbolo de planta por família (basculante, correr, pivotante, dupla com bandeira)

## E · Conexões verticais
- [x] E1 Topo até nível mais deslocamento
- [x] E2 Anexar topo e base a laje, piso e telhado: base e topo anexados a piso e laje por trecho do eixo, só sobre o trecho coberto, com degrau na borda (0023 P9); controles "Base no piso" e "Topo no piso" nas Propriedades, um passo de desfazer; topo ao telhado (telhados C2). Evidência: `packages/engine/src/wallFloorProfile.test.ts`, `wallFloorIssues.test.ts`, `wallFloorSection.test.ts`, `packages/render/src/model3d/wallFloorSolids.test.ts`, `apps/web/src/editor/wallFloorActions.test.ts`; regressão visual `parede-base-piso-metade`.
- [x] E3 Parede cortada por piso e laje conforme as regras de junção (0023 F1, F1b, F3 regra B, F4): cada faixa da parede desenha só as partes que sobram da junção (`wallLayerBandsAfterJunction`, `wallBandPartsOf`), e quem desenha a parede como elemento usa `cutWallByJunction`/`cutLevelByJunction` sobre as mesmas partes. O corte e o 3D recortam a parede pela camada que vence e o volume bate com o quantitativo (`desenhoQuantitativo.test.ts`). Parede que atravessa o nível é cortada pela laje do pavimento de cima (F1b), e a junção entre níveis vale só entre parede e piso/laje. A planta não recorta na altura de corte padrão, por decisão de escopo (F2, 0023 §3). Testes: `junctionWall`, `junctionCrossLevel`, `junctionMatriz`, `sectionCota`, `wallJunction`, `wallJunctionSolids`; regressões `junc-corte-parede-embutida-piso`, `junc-parede-recortada-laje` e `junc-fachada-continua-laje`. Fora: camada com topo ou base inclinados (perfil P9) e parede curva (entra só pelo polígono).

## F · Edição
- [x] F1 Selecionar (clique, janela, alças), mover, copiar, girar, espelhar, matriz, deslocar, aparar ao canto, alinhar, medir
- [x] F2 Vizinhas acompanham ao mover e ao arrastar alças
- [x] F3 Dividir parede (ponto e com intervalo)
- [x] F4 Aparar e estender várias paredes de uma vez
- [x] F5 Editar o comprimento pela cota temporária
- [-] F6 Travar alinhamento e cotas que comandam: exige um solver de restrições; fora do escopo da v1, reavaliar na fase de documentação
- [x] F7 Copiar e colar entre níveis alinhado
- [x] F8 Espelhar usando uma parede como eixo
- [x] F9 Selecionar todas as instâncias do tipo e filtro por categoria

## G · Interface e propriedades
- [x] G1 Seletor de tipo, instância, editor de tipo com seção ao vivo, navegador de materiais
- [x] G2 Campos avançados de camada (prioridade e envolve) em "mais"; espessura variável fica fora (A9)
- [x] G3 Parâmetros de tipo adicionais (código, custo, desempenho térmico e acústico)
- [x] G4 Etiquetas (tags) de parede na planta
- [x] G5 Substituir um tipo em todas as instâncias e mostrar onde é usado
- [x] G6 Sobreposição visual de depuração de junção (mostrar prioridade e ordem)

## H · Vistas e documentação
- [x] H1 Planta em corte com hachura e detalhe por zoom
- [x] H2 Corte e elevação mostrando as camadas **(bloqueante)**
- [x] H3 Nível de detalhe grosseiro, médio e fino por vista
- [-] H4 Pesos de linha e estilos por categoria configuráveis: configuração global de estilos de objeto (fase de documentação)
- [-] H5 Cotas associativas de parede: pertencem à ferramenta de anotação (fase de documentação)

## I · Quantitativos
- [x] I1 Volume e área por camada e por material, sem dupla contagem nos cantos
- [x] I2 Tabela de paredes com colunas, filtros e totais **(bloqueante)**
- [x] I3 Exportação CSV

## J · Interoperabilidade
- [-] J1 IFC (IfcWall com camadas de material): fase de interoperabilidade (docs/03), depois de pisos, lajes e telhados para exportar o modelo inteiro de uma vez
- [x] J2 DXF da planta
- [-] J3 Importação do formato do Hestia 1: fase de interoperabilidade; exige exemplos de arquivos reais do Hestia 1

## K · Qualidade
- [x] K1 Casos dourados de área para L, T, X, alinhadas e aberturas
- [x] K2 Casos dourados de geometria (contornos) para cada junção, derivados da documentação **(bloqueante)**
- [x] K3 Testes de propriedade com paredes aleatórias: sem sobreposição, sem erro, resultado estável **(bloqueante)**
- [x] K4 Desempenho: 500 paredes em um único aglomerado (pior caso) resolvem em ~1,1 s a frio e ~0,7 s ao mover uma parede; casas reais têm aglomerados pequenos e usam o cache por aglomerado
- [x] K5 Validação do modelo (comprimento zero, tipo ausente, referência quebrada)
- [x] K6 Pesquisa das pendências do docs/05 §7 concluída e registrada
- [x] K7 Regressão visual por captura de tela dos casos de junção
