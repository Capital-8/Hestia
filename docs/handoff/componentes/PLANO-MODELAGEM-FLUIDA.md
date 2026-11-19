# Plano — modelagem fluida de módulos, "como o Promob" (rascunho de 2026-11-03)

Objetivo: montar um ambiente (cozinha, dormitório, closet) combinando módulos com poucos gestos, direto no 3D: arrastar da biblioteca, encaixar na parede e nos vizinhos, preencher o vão, e trocar portas, gavetas e medidas clicando no móvel.

**É possível?** Sim. O motor já resolve módulo, malha, pegada, caixa e custo. O que falta é uma camada nova, em quatro partes:
1. relações entre módulos (encaixe, fila, conjunto);
2. um solucionador de encaixe numérico, que também serve para a migração Rust;
3. manipulação direta no 3D;
4. escolhas internas do módulo (portas, gavetas, divisões) por clique.

O trabalho é grande, mas cabe em fatias verificáveis. A parte difícil é o encaixe (F2) e a interação 3D (F3). Ela depende de achar o que quebra no QA atual.

## Ponto de partida (verificado no código)
- A seleção no 3D só clica, sem arrastar (`docs/decisoes/0016-selecao-no-3d.md`; `clickSelect3d` em `apps/web/src/editor/state.ts:240`). Não existe arrastar elemento no 3D. É trabalho novo.
- Há picagem por raio no 3D (`packages/render/src/model3d/pick3d.ts`: `pickModelPoint` na linha 81, `pickElement` na 143), que serve de base para colocar e arrastar no 3D.
- A família já tem `hospedagem: 'nivel' | 'parede'` e `origem` (`packages/model/src/familia/tipos.ts:31-32`), mas nada usa "parede" para encaixar.
- O `Component` só guarda posição, giro, espelho e valores (`packages/model/src/types.ts:666`). Não há relação entre módulos.

## Fases

### F0 — Fechar o QA (agora)
Quatro testadores flash exercitam editor, fabricação, projeto e motor. Corrijo o que quebrar antes de construir em cima. Relatórios em `wt/qa/relatorios/`.

### F1 — Conectores e conjuntos (modelo)
- **Conectores na família** (`Familia.conectores`): faces de encaixe com `lado` (esq, dir, fundo, base, topo, frente), `etiqueta` (base, aéreo, torre, tampo, painel) e `compatível com`. São números em metros, sem geometria, como o Revit e o Promob fazem.
- **Fila** (`ComponentRun`, elemento novo): lista ordenada de módulos ao longo de uma linha-base, com a parede de apoio (opcional), a largura total e as folgas/tamanhos de enchimento. É a base de "cozinha em linha".
- **Conjunto** (`ComponentGroup`): módulos unidos que se movem, giram e copiam juntos. Tem regra de união: lateral compartilhada (remove uma lateral duplicada), alinhar topo, alinhar frente.
- Comandos e migração do esquema (24 → 25), com testes. **Eu faço o contrato; o flash faz comandos e testes.**

### F2 — Solucionador de encaixe (motor, numérico, pronto para Rust)
Funções puras em metros, em `packages/engine/src/componentes/encaixe*.ts`:
- `encaixarNaParede`: leva o fundo do módulo à face da parede mais próxima, alinha o giro e respeita rodapé e quina.
- `encaixarNoVizinho`: gruda lateral com lateral, alinha frente/topo/base e sugere a união.
- `guiasDeAlinhamento`: linhas de guia (frente, topo, centro) com tolerância em pixels convertida para metros.
- `colisao`: sobreposição entre caixas e com paredes; marca invalidez (vermelho), sem impedir arrastar.
- `preencherVao`: dada a largura livre entre duas paredes ou módulos, escolhe tipos do mesmo módulo e/ou um painel de enchimento para fechar a conta, com folga mínima.
- `resolverFila`: redistribui larguras quando o comprimento total muda.
**Eu escrevo o contrato e os testes de aceite; o flash implementa por funções pequenas; eu reviso a álgebra.** Cada função leva testes de propriedade (encaixar duas vezes dá o mesmo; colisão simétrica).

### F3 — Interação direta no 3D e na planta
- **Colocar no 3D**: clicar com a ferramenta Componente sobre piso ou parede, com a prévia encaixando (F2) em tempo real.
- **Arrastar no 3D**: arrastar o módulo no plano do piso, ou em plano vertical quando a hospedagem é parede. Isso exige tirar a regra "3D sem arrasto" só para componentes, por um modo de arrasto próprio no `ViewportCanvas.tsx` (hoje com 1027 linhas, então vai em arquivo novo).
- **Alças** (rótulo no móvel selecionado): largura, altura e profundidade arrastáveis, que gravam em `values`. As cotas viram campos editáveis no local (clicar no número e digitar).
- **Girar e espelhar** por alça e por R/M.
- **Menu de contexto** no móvel: trocar tipo, espelhar, duplicar na fila, separar do conjunto, excluir.
- **Biblioteca lateral** arrastável (com miniaturas que já existem), com busca e categorias, e soltar na planta ou no 3D.
- Prévia fantasma e guias visíveis; desfazer em um passo por gesto.

### F4 — Composição interna por clique
- **Escolhas do módulo** (`Familia.escolhas`): grupos nomeados com opções (porta lisa, vidro, duas portas, gaveta alta, nicho), ligados a `quando` das peças e ferragens. Já existe `quando`; falta o conceito de escolha e a interface.
- Clicar em uma zona do móvel no 3D abre o seletor de opções; a troca é imediata.
- Divisões internas ajustáveis (prateleiras, gavetas) por alças verticais.

### F5 — Montagem rápida
- **Cozinha em linha** e **canto em L**: escolher a parede (ou duas), escolher módulos da biblioteca em sequência e a fila se monta, fecha o vão e coloca o canto.
- **Aéreos alinhados** com os de baixo, **torre** e **tampo contínuo** sobre bancada.
- **Modelos de ambiente**: salvar a fila/conjunto como "Meu conjunto" para reutilizar.

### F6 — Ferragens e fabricação ligadas ao conjunto
- Regras de ferragem automáticas (dobradiças por altura da porta, corrediças por profundidade, puxadores por frente) e furação correspondente.
- Lista de peças, plano de corte e custo do **projeto inteiro** (todos os módulos), com agrupamento por ambiente e por chapa.
- Remoção de peças duplicadas na união (lateral compartilhada) refletida na lista e no corte.

### F7 — Rust/WASM
Passar o solucionador (F2) e a resolução de peças para o kernel quando a fatia C do kernel existir. A verificação é a mesma suíte, com paridade TS ↔ Rust.

## Ordem, dependências e quem faz
| Fase | Depende de | Quem | Marco verificável |
|---|---|---|---|
| F0 | — | testadores flash; correções por flash/eu | relatórios de QA sem falhas graves |
| F1 | F0 | eu (contrato), flash (comandos, testes) | fila e conjunto no projeto, com desfazer |
| F2 | F1 | eu (contrato, revisão), flash (funções) | testes de propriedade do encaixe |
| F3 | F2 | flash (UI), eu (modo de arrasto no 3D) | arrastar e encaixar no 3D, medido no navegador |
| F4 | F1 | flash | trocar porta/gaveta clicando |
| F5 | F2, F3, F4 | flash, eu reviso | cozinha em linha em 5 cliques |
| F6 | F5 | flash | lista e orçamento do projeto |
| F7 | F2 e kernel fatia C | a definir | paridade TS ↔ Rust |

## Riscos
- **Arrasto no 3D** pode conflitar com órbita, painel e seleção atuais. Mitigação: modo próprio, ativado só sobre componente selecionado, com testes de regressão da seleção 3D (`pick3d.test.ts`).
- **Desempenho** do 3D com muitos módulos (cozinha completa são 30 a 60 módulos). O QA Q4 mede 100 componentes; se for lento, F3 começa por instanciar malhas iguais.
- **Encaixe em parede curva ou com abertura** (janela, porta): v1 só em parede reta e avisa sobre aberturas.
- **Escopo**: F1 e F2 sozinhas já mudam a experiência; F3 a F6 são incrementos. Posso entregar F1+F2+F3 antes de começar F4.

## Como validar (cada fase)
Gates próprios (tsc, eslint, units, boundaries, testes), revisão do diff por mim e roteiro de navegador com os testadores flash, como no QA atual.
