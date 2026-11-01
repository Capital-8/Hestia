# Decisão 0044 — Parede em cima de parede

Decidido em 2026-10-31. Fecha o caso de criar ou transformar uma parede para o mesmo eixo de outra no mesmo nível: a
operação é **recusada com mensagem** e nada muda. Complementa o aviso C14 da validação (que continua valendo para
projetos antigos) e a [0042](0042-espelho-de-aberturas.md) no uso do espelho. Fontes: `packages/model/src/wallOverlap.ts`,
`packages/tools/src/wallOverlapGuard.ts`, `packages/tools/src/wallTool.ts` e `packages/tools/src/transformTools.ts`.

## 1 — Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Bloquear, não só avisar.** A ferramenta Parede recusa criar uma parede cujo eixo caia sobre o de outra já existente; as ferramentas do Modificar (Mover/Copiar, Rotacionar, Espelhar in-place e com cópia) recusam a operação que deixaria uma parede em cima de outra. A barra de status diz o motivo e a operação não é aplicada | O C14 avisa depois do fato, e sobreposição é sempre defeito de desenho (junções e quantitativos contam duas vezes). O retorno tem de vir no gesto, quando o usuário ainda pode corrigir a direção |
| 2 | **Mesmo critério do C14** (`wallOverlap`): eixos colineares a menos de 1°, lateral menor que 1 cm no meio do trecho e trecho em comum acima de 5 cm, no mesmo nível; só os eixos (a curvatura `sag` não entra) | Um único critério no editor e na validação: o que o C14 acusa é exatamente o que o bloqueio recusa, sem regra "quase" |
| 3 | **Só o que a operação cria conta.** Um par que já se sobrepunha antes da operação continua valendo; o bloqueio olha a sobreposição nova | Senão um projeto antigo (que já tem o aviso C14) ficaria travado para edição. Limpar o passado é decisão do usuário (apagar e redesenhar), não efeito colateral de mover outra parede |
| 4 | **Cópia é parede nova:** mover/girar/espelhar com cópia não pode pousar em cima de nenhuma parede, inclusive a de origem | A cópia no mesmo eixo da original é a "quase-cópia" que gerou o defeito; o vínculo de host (`hostId`) não muda o critério |
| 5 | **Escopo:** ferramenta Parede (reta, arco e retângulo; no retângulo, um lado em cima recusa os quatro), Mover/Copiar, Rotacionar, Espelhar, Colar, Matriz (linear e radial) e as setas do Selecionar. Ficam de fora Alinhar, Deslocar e Parede paralela: são operações que existem para tornar paredes colineares/paralelas (alinhar uma parede com outra pode terminar exatamente em cima dela — é o pedido do usuário). A Matriz radial, que antes só avisava "ficou sobre um elemento existente", passa a recusar antes de copiar — o aviso antigo deixa de ocorrer | O bloqueio cobre o gesto genérico, mas não pode impedir a operação cujo contrato é alinhar/deslocar por distância. Onde o resultado é, por construção, paralelo deslocado, não há sobreposição a bloquear |
| 6 | **A recusa é um alerta modal com OK** (além da mensagem na barra de status), no formato `Não é possível: a parede ficaria em cima da parede "X" (N cm no mesmo nível). Nada foi alterado.` A prévia continua desenhando o fantasma normal | O bloqueio só na barra de status passa despercebido: o usuário tenta de novo e conclui que "não funciona". O OK garante que o motivo foi visto — e o alerta não pede decisão, porque a operação já foi recusada |
| 7 | **A parede em conflito é realçada em amarelo** na vista ativa enquanto o alerta está aberto: preenchimento translúcido (0,32) e contorno de 2,5 px na planta e no corte/elevação (camada de hover, com chave própria, sem refazer a geometria) e uma sobreposição própria no 3D. O realce some ao fechar o alerta (OK, Esc ou clique fora) | O texto diz "em cima da parede X", mas não basta: o usuário precisa achar X na vista em que está trabalhando. O amarelo é a mesma cor do alerta nas três vistas (planta, corte/elevação e 3D), independente do tema |

## 2 — Consequências

- **Ferramenta Parede:** desenhar sobre uma parede existente no mesmo eixo não cria nada e explica o motivo; a parede
  anterior fica intacta. Retângulo com um lado em cima de outra parede é recusado inteiro — não sai retângulo pela
  metade. Paredes em níveis diferentes, encostadas pelas pontas ou paralelas deslocadas continuam normais.
- **Retângulo:** um lado em cima de outra parede recusa os quatro lados, nada é criado e o primeiro canto continua
  valendo para o usuário escolher outro canto oposto.
- **Mover/Copiar, Rotacionar, Espelhar:** a operação inteira é recusada (paredes, vistas e anotações da mesma
  transação) e o gesto pode ser refeito. Espelhar uma parede em torno de um eixo que manda o reflexo para cima de
  outra parede deixa de funcionar; espelhar em torno da própria face continua valendo (o eixo refletido fica a uma
  espessura de distância, fora do critério).
- **Matriz (linear e radial):** se qualquer cópia cairia em cima de uma parede, nenhuma cópia é criada.
- **Colar:** colar em cima da parede de origem (ou de outra existente) é recusado; colar livre funciona igual.
- **Setas do Selecionar:** mover a parede com o teclado até uma posição em cima de outra é recusado, com a mesma
  mensagem.
- **Alinhar, Deslocar e Parede paralela** seguem o contrato próprio: alinhar pode deixar paredes colineares de
  propósito, e deslocar/paralela criam a outra parede a uma distância.
- **Projeto antigo com sobreposição:** mover uma das paredes sobrepostas não bloqueia enquanto o par continuar
  sobreposto; transformações que não criem pares novos seguem liberadas.
- **Validação:** o aviso `wall-overlap` (C14) continua como está e passa a ser raro em projetos novos.
- **Aviso:** toda recusa abre o alerta "Aviso" com um único botão OK; confirmar só fecha o alerta — a operação já foi
  recusada e o projeto não mudou.
- **Realce:** enquanto o alerta está aberto, a parede que impede a operação fica amarela na vista ativa — planta, corte
  ou elevação e 3D. Fechar o alerta tira o amarelo.
- **Nada muda** para pisos, lajes, telhados, escadas, vistas e aberturas: o bloqueio olha só pares de paredes.

## 3 — Arquivos

- `packages/model/src/wallOverlap.ts` — critério do C14 (`wallOverlap`) e `wallConflict`, a primeira parede por baixo
  de uma candidata (mesmo nível, com `ignore` para o conjunto em transformação).
- `packages/model/src/validate.ts` — `elementLabel`, o nome do elemento nas mensagens (mesma forma dos avisos).
- `packages/model/src/index.ts` — exporta o critério e o conflito para as ferramentas.
- `packages/tools/src/wallOverlapGuard.ts` — o bloqueio: `moveOverlap` (sobreposição nova ao mover/girar/espelhar),
  `copyOverlap` (cópia é parede nova), `copiesOverlap` (lote de cópias: Matriz e Colar) e as recusas com mensagem.
- `packages/tools/src/wallTool.ts` — Parede reta, em arco e retângulo: a parede é montada antes de entrar no projeto e
  a criação é recusada quando conflita; no retângulo os quatro lados são conferidos antes da transação.
- `packages/tools/src/transformTools.ts` — Mover/Copiar, Rotacionar e Espelhar recusam antes da transação, com a
  mensagem única (as vistas e anotações do mesmo gesto também não são aplicadas); a recusa limpa o gesto pela metade
  (ponto-base, centro, eixo).
- `packages/tools/src/pasteTool.ts` — Colar recusa quando algum elemento colado cai em cima de parede (inclusive a
  de origem); `packages/tools/src/arrayTool.ts` e `arrayRadial.ts` — Matriz linear e radial recusam o lote inteiro.
- `packages/tools/src/selectTool.ts` — as setas do Selecionar recusam antes de mover.
- `packages/tools/src/types.ts` — `ToolEnv.alert`: o alerta modal que a interface exige confirmar (os testes capturam).
- `apps/web/src/editor/alertaPrompt.ts` e `apps/web/src/ui/dialogs/AlertaDialog.tsx` — o alerta "Aviso" com OK;
  `apps/web/src/editor/controller.ts` liga `ToolEnv.alert` a ele e `apps/web/src/editor/state.ts` registra o diálogo e a
  parede em conflito (`avisoParede`).
- `packages/render/src/aviso.ts` — a cor do realce (`#eab308`) e a opacidade do preenchimento, iguais nas três vistas.
- `packages/render/src/plan/planOverlay.ts` — o aviso entra na camada de hover da planta (preenchimento 0,32 e
  contorno 2,5 px); `plan/planFrame.ts` põe o aviso na chave do hover.
- `packages/render/src/section/build.ts` e `section/frame.ts` — o mesmo amarelo no corte/elevação, com o aviso na
  chave do quadro.
- `packages/render/src/model3d/scene3d.ts` e `realceDaCena3d.ts` — ranhura de realce própria no 3D, em amarelo.
- `packages/model/src/wallOverlap.test.ts` — o critério: eixos coincidentes, trecho parcial, limite de 5 cm, sentidos
  opostos, lateral de 1 cm, 1° e 2°, `sag` fora da conta, comprimento zero e `wallConflict` (mesmo nível, `ignore`).
- `packages/tools/src/wallOverlap.test.ts` — o bloqueio nas ferramentas: Parede, retângulo, espelhar in-place e com
  cópia, mover e copiar; a exceção do par que já se sobrepunha; e os caminhos livres continuando a funcionar.
