# Paridade · Lotes

Legenda: `[x]` feito e testado · `[ ]` pendente · `[-]` fora de escopo, com o motivo na própria linha. Onde o ESTADO diz que a parte não foi conferida visualmente, a linha traz a nota "sem conferência visual".
Fonte: [docs/05](../05-REFERENCIA-REVIT-ARCHICAD.md) (Revit: linhas de propriedade por tabela de rumos e distâncias). Decisão em [docs/decisoes/0058](../decisoes/0058-terreno-e-lote.md). As fichas entre parênteses (P1, P3, X1...) vêm de [docs/terreno/ESTADO.md](../terreno/ESTADO.md).

## A · Modelo
- [x] A1 Lote como elemento (`kind: 'lot'`), com contorno e estilo próprio (M1, P2)
- [x] A2 Lados com papel (frente, lateral ou fundo) e recuo em cada lado (P1, P3)
- [x] A3 Limites por lote: taxa de ocupação, coeficiente de aproveitamento e permeabilidade mínima, digitados pelo usuário (P1, P3)
- [x] A4 Comandos `addLot`, `updateLot` e `setLotContorno`, com desfazer (M1)

## B · Geometria
- [x] B1 Área do lote e área edificável: o lote menos a faixa de recuo de cada lado; lado com recuo zero não gera faixa (P1)
- [x] B2 Projeção da edificação e área construída: união de pisos e lajes de todos os níveis, recortada pelo lote (P1)
- [x] B3 Taxa de ocupação e coeficiente de aproveitamento (P1, P4)
- [x] B4 Permeabilidade: área do lote menos a projeção e as regiões impermeáveis, sobre a área do lote (P1, P4)
- [ ] B5 Índices com massas: opção "incluir massas" por `massa_fatias`. Pendente: depende da P5, que é condicional à massa estar na branch.
- [x] B6 Rumos e distâncias: azimute a partir do norte verdadeiro e distância, convertidos no polígono (P1, P3). Nota: o sinal do norte foi decidido pelo fiscal (E4); o dono não respondeu.
- [x] B7 Erro de fechamento da tabela de rumos ao vivo, com a regra de aceite (P3)

## C · Ferramenta
- [x] C1 Desenhar o polígono pelo núcleo comum de desenho (P3)
- [x] C2 Por tabela de rumos e distâncias: ponto inicial, linhas e erro de fechamento (P3)
- [x] C3 Alças de vértice; mover um vértice mantém os lados (P3)
- [x] C4 Inserir vértice num lado duplica o papel e o recuo; remover vértice funde os dois lados e fica o primeiro (P3; `lotHandles.test.ts`).
- [x] C5 Seleção pelo contorno, sem selecionar pelo interior (P3)
- [x] C6 Mover, copiar, girar, espelhar, matriz, alinhar, apagar, copiar e colar, e colar entre pavimentos (P3). Nota: sem conferência visual.
- [-] C7 Aparar, estender, dividir e deslocar: não se aplicam, o lote é polígono fechado (contrato da P3)
- [-] C8 Mover no corte: o lote não aparece no corte (A.6; contrato da P3)

## D · Vistas
- [x] D1 Contorno do lote na planta, com estilo de lote (P2). Nota: sai tracejado longo, ver F5.
- [x] D2 Snap do lote na ferramenta de componentes (P2)
- [x] D3 Seleção por clique e por caixa (P2, P3)
- [x] D4 Área edificável desenhada tracejada na planta quando `mostrarEdificavel` está ligado (P2; testes de `plan/lote.test.ts` e `loteCamada.test.ts`).
- [ ] D5 Lote na prancha. Pendente: a X1 não cita o lote na prancha.

## E · Saídas e avisos
- [x] E1 Tabela "Índices do lote": área, área edificável, projeção, área construída, taxa de ocupação, coeficiente e permeabilidade, cada um com o limite e a marca "dentro" ou "excede"; CSV e atualização ao vivo (P4). Nota: sem conferência visual.
- [x] E2 Botão "Índices do lote" ativo na faixa (P4)
- [x] E3 Quatro avisos do lote no painel, com "Ir para": excede ocupação, excede coeficiente, abaixo da permeabilidade e edificação fora da área edificável (P4)
- [x] E4 Camadas DXF LOTE e LOTE_EDIFICAVEL na planta (X1)

## F · Fora de escopo e pendências
- [ ] F1 Envelope legal, com massa gerada pela área edificável e pelo gabarito (e "incluir massas" nos índices). Pendente: depende da massa conceitual, que não existe na branch; a P5 é condicional (ESTADO).
- [-] F2 Lote e regiões no IFC: fora da v1 (A.9; X1)
- [-] F3 Perfis de recuo por município: fora desta entrega (A.9); os recuos são digitados por lote (decisão 0058, D7)
- [-] F4 Cálculo do gabarito real da edificação: fora desta entrega (A.9)
- [ ] F5 Traço-dois-pontos no contorno do lote. Pendente: sai tracejado longo, porque `StrokeOp.dash` só aceita traço e vão (P2; decisão 0058, §3).
- [ ] F6 Textos frente, lateral e fundo em dicionário local pt e en (`render/plan/lote.ts`), no lugar das chaves `md_lt_lado_*` do i18n. Pendente: a edição de `packages/model/src/i18n.ts` foi negada ao agente (P2); o ESTADO manda mover para `md_lt_lado_*` na U1 ou na Q1.
- [ ] F7 Sinal do norte verdadeiro confirmado pelo dono. Pendente: foi decidido pelo fiscal (E4), o dono não respondeu; reverter se ele discordar.
- [x] F8 Verificação no navegador do lote: tabela de rumos com fechamento zero e primeiro lado a 120° (azimute 90 + norte 30, regra E4), recuos gravados, área edificável de 198 m² e a tabela de índices com 25,00 % (E2E, passos 7 e 8; `docs/terreno/evidencias/final/07-lote.png` e `08-indices.png`). Alças do lote e o lote na prancha não foram exercitados.

## G · Família do lote (frente anotar-familias-e-apagar)
- [x] G1 Família do lote (`settings.lotFamilies`): estilo, espessura e cor da linha de propriedade; fonte, altura, cor, negrito, itálico, unidade e casas do texto dos lados; mostrar o papel e a medida; `TypeSelector` e "Editar tipo" no painel do lote (E2E `anotar-familias.mjs`, passo 7)
- [x] G2 Traço-ponto (aproximado por traço curto, F5 segue pendente para o traço-dois-pontos exato)
