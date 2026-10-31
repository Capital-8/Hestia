# Paridade · Escadas

Legenda: `[x]` feito e testado · `[ ]` pendente · `[-]` fora de escopo, com o motivo na própria linha.
Itens marcados **(bloqueante)** precisam estar feitos antes de abrir o próximo elemento (ambientes).
Fonte: [docs/escadas](../escadas/) (Revit 2026: Stair by Component e croqui; ArchiCAD 29: Stair Tool). Decisões em [docs/decisoes/0011](../decisoes/0011-escadas.md) e [0012](../decisoes/0012-escada-monolitica.md) (monolítica: face inferior, chegada, patamar).

## A · Geometria e croqui
- [x] A1 Croqui de lance: limites esquerdo e direito, linhas de espelho e caminhada opcional, com retas e arcos **(bloqueante)**
- [x] A2 Validação do croqui com as regras e mensagens do Revit (limites que se tocam, espelho que cruza, espelho sobre o limite, caminhada fora do 1º ao último espelho) **(bloqueante)**
- [x] A3 Degraus gerados do croqui livre, incluindo leque e degraus curvos; N espelhos dão N−1 degraus de altura uniforme **(bloqueante)**
- [x] A4 Patamar por croqui (laço fechado de retas e arcos) na cota do último espelho do lance anterior **(bloqueante)**
- [x] A5 Gerador de lance reto (início, direção, largura, nº de espelhos, piso pela regra 2e+p) **(bloqueante)**
- [x] A6 Geradores em L e em U com patamar automático (largura do lance)
- [x] A7 Gerador de leque (espelhos radiais; na ferramenta, forma "Com leque" = winder de 90°)
- [x] A8 Pegar linhas no croqui (Pick Lines): método "Pegar linhas" na barra sobre Limites, Espelhos ou Caminhada; o clique pega a parede (eixo, faces ou núcleo conforme a captura), a linha de outra escada ou a aresta de laje ou piso sob o cursor, com prévia do destaque e do resultado; "Deslocamento (m)" afasta a linha para o lado do cursor; arco de parede vira arco do croqui; "Corrente" pega a cadeia conectada de uma vez (Tab segue alternando linha e arco, então a corrente é a opção da barra); Delete e Ctrl+Z desfazem a última pegada e Ctrl+Y refaz; o erro de croqui continua sendo só o do validateRunSketch. Fora desta entrega: patamar não pega linhas e arcos de faces de parede não encadeiam em juntas com parede reta
- [x] A9 Distribuir N espelhos ao longo da caminhada (acelerador além do Revit)
- [x] A10 Editar o croqui da escada pronta e converter lance gerado em croqui **(bloqueante)**
- [x] A11 Edição por alças na planta (limites, espelhos, caminhada, patamar)

## B · Tipos e níveis
- [x] B1 Tipo de escada (espelho máx., piso mín., largura mín., estilo monolítico/piso e espelho, face inferior lisa ou escalonada no monolítico (0012), espessuras, nariz, patamar, folga de cabeça) **(bloqueante)**
- [x] B2 Editor de tipo de escada
- [x] B3 Duplicar, renomear, substituir e excluir tipo (bloqueado se em uso)
- [x] B4 Nível de base e de topo, deslocamentos e altura; altura do espelho = altura ÷ nº de espelhos; topo não acima da base é erro (`stair-top-not-above`) e a escada não gera geometria **(bloqueante)**

## C · Relação com o modelo e avisos
- [x] C1 Furo derivado na laje e no piso do nível de topo (recalcula ao mover a escada; abertura por escada: pé-direito livre, contorno completo ou sem abertura, folga lateral e furo retangular; decisão 0011 §6) **(bloqueante)**
- [x] C2 Avisos de norma (2e+p, espelho, piso médio, piso entre espelhos de um lance reto, patamar a cada 3,20 m, folga de cabeça) no painel de avisos com "Ir para"; contagem de espelhos diferente da desejada também é aviso (`stair-risers-count`)
- [x] C3 Aviso de largura do lance menor que a mínima do tipo; erro (bloqueia a geração da escada) de altura do espelho acima do máximo do tipo **(bloqueante)**
- [-] C4 Corrimão e guarda-corpo na escada: etapa própria "guarda-corpo" (decisão do dono, 2026-10-21)
- [-] C5 Apoios (stringer, carriage): fora da v1 (decisão 0011 #13)
- [-] C6 Escada de vários andares: fora desta etapa (decisão do dono)
- [-] C7 Exportação IFC (IfcStair, IfcStairFlight, patamar LANDING): Fase 8 do roteiro
- [x] C8 Norma do piso do leque: degraus do leque com piso ≥ 0,28 m a 0,55 m da borda interna (decisão 0011 §1 item 10). Aviso `stair-winder-tread` (mede a corda entre espelhos radiais a 0,55 m da borda interna; `stairIssues.test.ts`)

## D · Vistas
- [x] D1 Planta: degraus, seta de subida com texto, linha de corte, degraus acima do corte tracejados, numeração contínua dos degraus (o patamar não tem rótulo; decisão 0011 §7) **(bloqueante)**
- [x] D2 3D com degraus (monolítico e piso/espelho) e patamares; no monolítico, chegada e fundo liso ou escalonado (decisão 0012) **(bloqueante)**
- [x] D3 Corte e elevação com degraus **(bloqueante)**
- [x] D4 Subpavimento: escada do nível abaixo
- [x] D5 Exportação DXF

## E · Quantitativos
- [x] E1 Nº de espelhos, altura do espelho, piso médio, largura, área em planta, volume por tipo **(bloqueante)**
- [x] E2 Tabela de escadas com filtros, totais e CSV

## F · Edição
- [x] F1 Selecionar, mover, copiar, girar, espelhar **(bloqueante)**
- [x] F2 Painel de propriedades da escada (instância e tipo) **(bloqueante)**
- [x] F3 Colar alinhado entre níveis inclui escadas
- [x] F4 Ferramenta Escada no Ribbon, atalho e barra de opções com contador de espelhos ("Espelhos: N criados, M restantes", ou "M a mais") **(bloqueante)**
- [x] F5 Arestas do croqui em Deslocar/Dividir/Mover/Aparar (retas; formas livres pelas alças) e snap global de escada e rampa

## G · Qualidade
- [x] G1 Validação do modelo: erros de croqui deixam sem degraus só o lance afetado; altura do espelho acima do máximo e topo não acima da base são erro da escada; norma, largura do lance e folga de cabeça geram aviso **(bloqueante)**
- [x] G2 Painel de avisos com "Ir para"
- [x] G3 Casos dourados de alturas, nº de degraus, áreas e volumes **(bloqueante)**
- [x] G4 Testes de propriedade (degraus disjuntos, união = região entre espelhos, cotas crescentes, sem exceção)
- [x] G5 Migrações de arquivo 11 → 12, 12 → 13 e 13 → 14, com ida e volta (`packages/model/src/esquema.test.ts`); a 14 → 15 (intervalo de vista) é da decisão 0013
- [x] G6 Regressão visual por captura — `npm run test:visual` (após `npm run build`; ver `tests/e2e/README.md`) roda `escadas.mjs`, `vista-planta.mjs` e `escadas-closeup.mjs` e compara cada captura com `tests/e2e/baseline/` (`tests/e2e/visual.mjs`: um pixel conta como diferente quando um canal passa de 10% do valor; a captura falha acima de 0,5% de pixels diferentes; `UPDATE_BASELINE=1` regrava)
