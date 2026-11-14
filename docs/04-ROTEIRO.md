# 04 · Roteiro

Cada fase termina em algo **utilizável**. Pronto = testes passando + usado de verdade num mini-projeto.

## Fase 0 · Fundação
Monorepo, CI (lint, typecheck, testes, clippy), pacotes vazios com fronteiras, esquema versionado, comandos com
desfazer/refazer, canvas 2D em GPU com pan e zoom, detecção WebGPU/WebGL2.
**Pronto:** desenhar e desfazer uma linha; CI verde.

## Fase 1 · Núcleo da parede
Tipo de parede em camadas, parede reta e em arco, linha de localização, junções L/T/X por prioridade,
motor de inferência, contrato de ferramenta, painel de propriedades (instância + tipo), editor de tipo com seção.
**Pronto:** desenhar o perímetro de uma casa com paredes compostas; junções corretas; testes dourados.

## Fase 2 · Aberturas e edição
Porta e janela hospedadas, vão sem elemento, mover/copiar/girar/espelhar/alinhar/aparar/matriz/deslocar.
**Pronto:** planta completa de uma casa simples só com paredes e aberturas.

## Fase 3 · 3D e níveis
Vista 3D em GPU acompanhando o modelo, níveis, árvore de projeto, abas de vistas, cotas e texto.
**Pronto:** casa de dois níveis navegável em 2D e 3D, sem engasgos.

## Fase 4 · Ambiente, piso, forro
Ambiente por circuito fechado, pisos por três formas, forro, quadro de áreas, tabelas.
**Pronto:** quadro de áreas correto a partir do modelo.

## Fase 5 · Laje e telhado
Laje por croqui, telhado por contorno com inclinação por lado, anexar topo de parede ao telhado.
**Pronto:** casa com cobertura de duas e quatro águas.

## Fase 6 · Documentação
Corte e elevação, pranchas, escalas e pesos de linha, exportação PDF/DXF, quantitativos por camada.
**Pronto:** prancha impressa a partir do projeto.

## Fase 7 · Escada, estrutura, extras
Escada (trajetória e croqui), pilar/viga/sapata, guarda-corpo, cortina de vidro, lote e zoneamento.

## Fase 8 · Interoperabilidade e nuvem
IFC de entrada e saída, importador do Hestia 1, salvar na nuvem, link de compartilhamento.

## Plugins de integração (priorizado em 2026-11-07)
A decisão [0047](decisoes/0047-plugins-de-integracao.md) tira *plugins* de "Fora da v1": fundação de API, protocolo e gerenciador (Suplementos › Ferramentas externas) em `docs/plugins/`. Falta o plugin do renderizador Rust.

## Massa conceitual (concluída em 2026-11-14)
A decisão [0057](decisoes/0057-massa-conceitual.md) e o plano `docs/massa/PLANO.md` entregam o elemento `Mass` (pilha de seções, extrusão, mistura, loft, bulbo, torção e arranjo polar), com o kernel Rust, 3D, planta, corte, elevação, tabela, derivação de pisos e paredes por pavimento, IFC, DXF e prancha. Próxima frente prevista: **terreno e lote** (briefing em `docs/terreno/BRIEFING-PARA-PLANEJAR.md`).

## Fora da v1
Scripting, famílias paramétricas gerais, colaboração em tempo real, IA generativa de layout,
instalações (hidráulica/elétrica), renderização fotorrealista.

## Regra de passagem entre elementos

Um elemento só abre o próximo quando **pelo menos 95%** dos itens do seu checklist (`docs/paridade/`) estiverem resolvidos
(feitos, ou fora de escopo com motivo escrito) **e** todos os itens marcados *(bloqueante)* estiverem feitos.
A regra é verificada por `scripts/check-parity.mjs`, que roda no `npm run lint` e no CI: marcar "pisos" como
em andamento com "paredes" abaixo do limiar quebra o build. Ordem: paredes, pisos, lajes, telhados, escadas, ambientes.
`npm run parity` mostra o percentual de cada elemento.

## Critérios permanentes
- Nenhum arquivo acima de ~400 linhas.
- Toda função de modelo com teste; toda mudança de esquema com migração.
- Antes de cada fase: ler o documento do elemento correspondente e fechar as decisões em aberto.
