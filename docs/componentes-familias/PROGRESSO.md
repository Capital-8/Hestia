# Componentes e editor de famílias — progresso e o que falta

Situação em 2026-11-06. Decisão de arquitetura: `docs/decisoes/0049-componentes-e-editor-de-familias.md`.
Planos e fichas de execução: `docs/handoff/componentes/` (`ESTADO.md`, `PLANO-PROFISSIONAL.md`, `PLANO-EXECUCAO-MISTO.md`, `CALIBRACAO.md`, `QA-2026-11-03.md`).

Branch: `feat/familias-interface`. Nada foi integrado na `main`.

## O que já funciona (verificado)

**Modelo e motor**
- Família paramétrica: parâmetros com fórmulas, planos de referência, peças (eixo, origem, tamanho, espessura, `repetir`, `quando`, contorno, vazio, usinagens, fita, veio), aninhados, ferragens, tipos.
- Resolução em metros, arredondada a 1 µm, com malha, pegada, caixa, lista de peças, plano de corte com folga de serra, custo, CSV e DXF.
- Conjuntos e filas (`ComponentGroup`, esquema 25), dobradiças por altura da porta, lateral compartilhada no orçamento.
- Encaixe puro: parede, vizinho, colisão, preencher vão, posicionar fila. Com testes cegos (outro executor escreveu os testes só da especificação).

**Projeto**
- Colocar componente (planta e 3D), selecionar, mover, copiar, colar, excluir, girar e espelhar.
- Arrastar na planta e no 3D com encaixe na parede e nos vizinhos. Alt desliga o encaixe se for segurado durante o arrasto.
- Paleta Biblioteca (fecha e reabre; arrastar e soltar na planta e no 3D).
- Agrupar e desagrupar; mover, girar e colar conjunto inteiro.
- Montar fila (parede selecionada, módulos, preencher vão).
- Painel de propriedades da instância, menu de contexto, orçamento do projeto.
- Exportação: componente no DXF da planta e no IFC como `IFCFURNITURE`.

**Editor de famílias**
- Aba Criar completa; galeria com as 28 famílias; diálogos de parâmetros, tipos, catálogo, encaixe (conectores e escolhas), usinagens, módulo aninhado (criar, editar, excluir).
- Vista 3D com órbita, seleção, explodir, opacidade, corte e vistas.

## Problemas reportados e estado

| Relato | Estado |
|---|---|
| Biblioteca não fecha | Corrigido (`f17f256d`). Confirmado pelo usuário. |
| Abas Inserir, Modificar, Vista e Gerenciar do editor não funcionam | **Não corrigido.** São placeholders desabilitados no código (`FamiliaFaixa.tsx`, "Aba ainda sem painéis"). |
| Peças do criador não se movem com o mouse; faltam ferramentas de modificar e alinhar a outro elemento | **Não corrigido.** Não há captura de vértice, aresta ou face, nem ancoragem por fórmula. |
| Módulos não aparecem em cortes e elevações | **Não corrigido.** O código de corte não conhece componentes. |
| Sem texturas no 3D e sem como configurá-las | **Não corrigido.** `Material` só tem cor, brilho e opacidade; a malha não tem UV. |
| Criar um móvel é difícil (só existe o editor de peças, sem caixa e divisões) | **Não planejado ainda.** Proposta P0 (caixa, divisões, preenchimento por vão), aguardando aprovação. |

## Pendências conhecidas que não são de interface

- O aviso de peça que não coube no plano de corte (cama com baú, 4 peças fora da chapa) aparece no fim do plano e sem sugestão de ação. A ficha CORR-2 cobre isso e foi integrada, mas o aviso ainda precisa ser conferido no navegador.
- Sem `node_modules` nos worktrees de execução: os relatórios "verde" de executores antigos não valem; o portão do orquestrador é o que vale.

## Como continuar

1. Aprovar a proposta P0 (criar móvel por caixa e divisões) e a ordem: P0 antes do P3.
2. Ondas do plano misto: A (abas do editor, casca de cortes, contorno DXF; em paralelo), B (linguagem de referências, captura de pontos, UVs), C (ferramentas de modificar, render de textura), D (alinhar módulos, alças no 3D, escolha por clique, corte e elevação), E (QA e suíte completa).
3. Antes de cada ficha: `git worktree` novo a partir de `feat/familias-interface`, junção do `node_modules` (`mklink /J`), portão `docs/handoff/componentes/gate.mjs`, e roteiro no navegador para ficha de interface.
4. Servidor de teste: `cd apps/web && npx vite --port 5199 --host 127.0.0.1`.
5. Roteiros de navegador de referência: `wt/qa/*.mjs` (fora do repositório).

## Verificação na última integração
- `tsc`, `check-units` e `check-boundaries`: sem erro.
- Suíte combinada (7612 testes): 7596 verdes e 1 falha de timeout de 5 s em `openingCatalogoVistas.test.ts`, que passa isolado (não é deste trabalho).
