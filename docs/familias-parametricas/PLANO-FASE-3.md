# Fase 3 — ícones do MEP, motor de rede inteligente e projeto elétrico

Registrado em 2026-11-25. **Este arquivo é o LEDGER**: quem acordar (outra sessão, um agendamento ou um subagente) lê este arquivo e o `ESTADO.md`, pega a primeira ficha `pendente` cujas dependências estão `integrada` e continua. Atualize o estado e o commit a cada ficha. Branch: `claude/lucid-euler-ddb7j6`.

Estados: `pendente` → `em curso (quem, desde quando)` → `integrada (commit)` ou `bloqueada (motivo)`.
Modelos: **H** = Haiku (mecânico, especificação fechada, verificação por teste ou captura), **S** = Sonnet (decisão de projeto). O orquestrador só coordena, integra e aplica o portão.

## Regras para todos
- Antes de mexer: ler `RETOMADA-LOCAL.md` §5 (armadilhas), `REGRAS.md` e a ficha.
- Cada ficha: arquivos permitidos e proibidos, portão = `npx tsc -p tsconfig.json --noEmit`, testes da área, `node scripts/check-boundaries.mjs`, `check-units.mjs`, `check-parity.mjs`.
- Não escrever de memória valor de norma ou de catálogo: dado editável marcado `CONFERIR`. Nenhuma família afirma conformidade com norma.
- Não alterar teste existente para "fazer passar": se ficou obsoleto por decisão, explicar e registrar no `ESTADO.md`.
- Pontos de junção (`biblioteca/index.ts`, `i18n/areas/*`, `ribbon/actions.ts`, `ribbon/model.ts`, `Icon.tsx`): só linhas aditivas, e conferir com `tsc`.
- Nada de `create_session`, nem abrir pull request, nem mexer em configuração. Push só em `claude/lucid-euler-ddb7j6`.
- Máximo de 3 agentes em paralelo (o limite de sessão é um só).

## A. Ícones do MEP (decisão do dono: um ícone próprio e coerente por ferramenta)
| Id | Modelo | Ficha | Depende | Estado |
|---|---|---|---|---|
| A1 | H | Auditar todo botão e ferramenta de MEP e listar o ícone atual, o arquivo e o que a ferramenta faz (tabela em `docs/familias-parametricas/icones/AUDITORIA.md`) | — | integrada (63 botões auditados, 45 de 48 com ícone compartilhado; `AUDITORIA.md`) |
| A2 | S | Ler `apps/web/src/ui/Icon.tsx`, escrever o guia de estilo (`icones/GUIA.md`: grade, traço, cores, convenções) e desenhar 4 ícones de referência: Tubo, Joelho, Verificar rede, Esgoto | — (roda junto com A1) | integrada (guia + 4 ícones; mepEsgoto precisa de glifo próprio: fica na A3c) |
| A3a | H | Ícones das ferramentas existentes: Tubos e conexões, Catálogo de tubos, Eletrodutos e dispositivos, Dutos e difusores, Perfis e chapas, Parafuso e chapa | A2 | integrada (4 de 5 bons; mepTubosConexoes lê como estante: refeito na A3b) |
| A3b | H | Ícones de peças: tê, junção, redução, luva, tampão, prumada; e REFAZER mepTubosConexoes | A3a | integrada (bons: redução, prumada, tubos e conexões; razoáveis: tê, luva; fracos: junção e tampão, corrigidos na A3c) |
| A3c | H | Ícones de sistema: esgoto (glifo refeito: sifão), água fria, elétrico, HVAC, estrutura; e corrigir mepJuncao e mepTampao | A3b | integrada (5 emblemas de sistema; esgoto = sifão em U com seta; junção e tampão corrigidos; fracos: mepEstrutura no tema escuro, mepLuva lembra haltere, leitura a 20 px não conferida) |
| A3d | H | (INTEGRADA 2026-11-25; fracos: tomada x interruptor parecidos a 32 px, eletrocalha com fios que somem, tecla do interruptor) Ícones da elétrica: eletroduto, eletrocalha, caixa, circuito, quadro, tomada, interruptor, luminária; e dos "em breve": aparelho sanitário, bandeja, tubo flexível, equipamento | A2 | pendente |
| A4 | H | (EM CURSO desde 2026-11-25) Registrar todos em `Icon.tsx`, trocar nas faixas e na Biblioteca, teste que reprova ícone MEP repetido ou ausente, captura de cada um em claro e escuro | A3a–A3d | pendente |
| A5 | S | Revisão visual de consistência (olhar as capturas, pedir correções) | A4 | pendente |

## B. Motor de rede inteligente (as cinco situações do dono)
Contrato: um resolvedor PURO de nó recebe o encontro (trechos, bitolas, direções, cotas, tipo de tubulação) e devolve `solucao` (peças e recuos), `solucao com ajuste` (ex.: redução + joelho) ou `sem solucao` (motivo fixo). Roda em todo evento que muda a rede (traçar, trocar bitola, mover, mudar cota, apagar).
| Id | Modelo | Ficha | Depende | Estado |
|---|---|---|---|---|
| B1 | S | Resolvedor de nó (`engine/componentes/resolvedorNo.ts`) + testes; a ferramenta Tubo passa a usá-lo | — | integrada (`resolvedorNo.ts`, 22 casos; contrato `SolucaoNo` com `ok`/`direto`/`ajustada`/`sem_solucao`; `ajustada` reservado à B3; import circular com `conexoesAutomaticas.ts` a resolver na B2) |
| B2 | S | (EM CURSO desde 2026-11-25) (inclui separar `posicionarConexao` e os helpers geométricos num arquivo próprio para desfazer o import circular com `resolvedorNo.ts`) Viabilidade geométrica: comprimento mínimo do trecho depois dos recuos, distância mínima entre conexões vizinhas, folga da bolsa, declividade; bloqueia e devolve o motivo | B1 | em curso (orquestrador, 2026-11-25) |
| B3 | S | Troca de bitola de tubo já traçado: troca a peça se existe na nova bitola; senão procura redução; senão remove a conexão incompatível, deixa a ponta aberta e alerta; tudo num passo de desfazer | B1, B2 | pendente |
| B4 | S | Prumada: pontos de cotas diferentes viram trecho horizontal + vertical com joelhos (opções: subir primeiro, andar primeiro, diagonal só se o tipo permite o ângulo) | B1, B2 | pendente |
| B5 | H | Alertas visíveis: trecho bloqueado em vermelho com o motivo, ponta aberta marcada, mensagem que não some sozinha, "mudar a cota para permitir 45° ou 90°" calculando a menor mudança | B2 | pendente |
| B6 | H | Redução (bitola composta por código) e tampão automáticos nos tipos da Krona; teste de cobertura de pares de bitola | B1 | pendente |
| B7 | H | Miniaturas da Biblioteca por silhueta real da geometria, com a cor do material | — | pendente |
| B8 | H | Roteiros de navegador: troca de bitola, prumada, ângulo sem peça, conexão bloqueada | B3, B4, B5 | pendente |

## C. Projeto elétrico (hoje inexistente além das famílias)
Fabricante escolhido para os catálogos elétricos: **Krona** (Catálogo Técnico Linha Elétrica 2026, `https://www.krona.com.br/wp-content/uploads/2026/02/CATALOGO-TENICO-LINHA-ELETRICA-2026.pdf`; o domínio já está liberado na rede do ambiente).
| Id | Modelo | Ficha | Depende | Estado |
|---|---|---|---|---|
| C1 | H | Baixar o PDF, transcrever as tabelas dimensionais (eletroduto, curvas, luvas, caixas) para `catalogosMep/kronaEletrica.ts` com fonte, hash e `CONFERIR`; README com anomalias | — | integrada (22 tabelas, 71 linhas da Krona elétrica, p. 6 a 11; fora: quadros, caixas de passagem e proteção; 9 anomalias no README; extrator próprio) |
| C2 | H | Famílias elétricas Krona montadas do catálogo (eletroduto cortado, curva, luva, caixa) reaproveitando as receitas | C1 | integrada (9 famílias `fam_krona_eletrica_*`; ATENÇÃO: espessura 2 mm provisória CONFERIR porque o catálogo não traz; caixas com 4 entradas de 20 mm por suposição; IFCJUNCTIONBOX não existe no exportador; roscáveis, corrugado e curvas 135/180 ficaram de fora) |
| C3 | S | Tipos de eletroduto e a ferramenta Eletroduto (traço, curvas e luvas pelo resolvedor B1, caixas como nós, limite de curvas entre caixas) | B1, C2 | pendente |
| C4 | S | Circuitos, quadro e cargas: modelo (circuito, pontos, quadro), quadro de distribuição como família, cor por circuito | C3 | pendente |
| C5 | S | Cálculos editáveis (potência, corrente, seção, disjuntor, queda de tensão) com valores de norma como dado `CONFERIR`; Verificar rede elétrica (circuito sem quadro, caixa sem eletroduto, sobrecarga) | C4 | pendente |
| C6 | H | Abas e botões da elétrica (usando os ícones A3d), quantitativos por bitola, caixas e condutores por circuito | C4, A4 | pendente |
| C7 | H | Roteiros de navegador do projeto elétrico | C5, C6 | pendente |

## D. Pendências de antes
| Id | Modelo | Ficha | Depende | Estado |
|---|---|---|---|---|
| D1 | S | Planta pela geometria (Q1–Q3): tubo em duas linhas, curvas com contorno certo | — | pendente |
| D2 | S | Subtração real do ramal no tê e na junção (F-CSG) | — | pendente |
| D3 | H | Transcrever as peças que faltam nos catálogos da Krona (tê de inspeção, junção dupla e invertida, joelho com visita, curva de pé de coluna, anéis, válvula, terminal) e, onde a receita já serve, montar a família | — | pendente |
| D4 | H | Interface de conferência dos catálogos contra o PDF (lado a lado, marcar linha conferida) | — | em curso (orquestrador, 2026-11-25) |

## Ordem
1. A1, A2 e B1 em paralelo. 2. A3a–A3d (4 Haiku) e B2. 3. B3, B4, A4. 4. B5, B6, B7, A5, B8. 5. C1 desde o começo em paralelo com qualquer etapa; C2 a C7 depois de B1/A4. 6. D.

## Despertar
Agendamento recorrente nesta sessão (id `trig_019xHuuhHaw6SbS3tZb891af`, criado em 2026-11-25): 01:15, 06:15, 11:15, 16:15 e 21:15 (America/Sao_Paulo). Cada despertar: ler este ledger e o `ESTADO.md`, `git status`, continuar a primeira ficha pendente com dependências prontas, registrar o que fez e, com tudo `integrada` ou `bloqueada`, desligar o agendamento.
