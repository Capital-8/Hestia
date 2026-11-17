# Pendências (28/10/2026): cotas, padrões do projeto, esquadrias

Lista que originou o plano. **Atualizada em 29/10/2026:** as seções A, B e C estão implementadas e integradas ao
`main` (`adb416ef`); D, E e F seguem como referência. Decisões do dono marcadas com **[decidido]**.

Estado final e gates: [`docs/integracao/cotas-2026-10-29.md`](integracao/cotas-2026-10-29.md). A branch de
trabalho `claude/fervent-newton-rfgz3y` foi arquivada com tag `archive/*`; o merge de integração foi `cab2d5fd`,
os gates `9e46c3ba` e o registro `181b75f5`. R03 foi corrigido em `65fd6bc2` e mergeado em `adb416ef`.

## A. Sistema único de cotas e referências — **feito**

Implementado de D0 a D11 e integrado: D0 `21568c29`, D1 `543bf803`, D2 `159d5c5f`, D3 `94e89669`, D4 parte 1
`c7a13dc4`, D5/D7/botão I `0b9dd41f`, D6/D8 parcial/D11 parcial `4ccd01c2`, D4 parte 3 `a185d696`, D9
`52550ff6`, **M5** `d91c6beb`, D10.1/D10.4/D10.5 `a8e3530b`, **M6** `3913e67a`, D10.2/D10.3 `dffc4982`.
D11: [`COMO-ADICIONAR-COTA.md`](plano-unidades-cotas/COMO-ADICIONAR-COTA.md) e decisão
[`0037`](decisoes/0037-cotas-dinamicas-e-referencias.md).

As decisões abaixo foram atendidas; ficam como registro.

**Decisões do dono**
- **[decidido]** Referências da cota: opção de **núcleo a núcleo**, **face a face** (face acabada) e **eixo**, configurável pelo usuário. Para a abertura (porta/janela): **vão livre**, **vão externo do batente** e **com alizar** (a "projeção da abertura"), mais **centro** como opcional.
- **[decidido]** Configuração no **projeto**, no menu de propriedades, em **"Padrões do projeto"**, com um botão ao estilo do "Editar níveis". Troca rápida na ferramenta e por clique na alça da cota.
- **[decidido]** Fazer **tudo de uma vez**, como ferramenta reaproveitável: incluir o controle numa ferramenta nova (ou esquecida) tem de ser rápido.
- **[decidido]** Ao **selecionar** parede, linha, porta, janela etc., reaparece a cota dinâmica; clicar no valor e digitar **reposiciona** o elemento. Elemento **hospedado não pode sair da parede**: alerta.
- **[decidido]** Estilo como o Revit (imagem do dono): linhas de chamada com tracinhos, texto azul editável, pontos de alça, ícone "I" para converter em cota permanente. Pesquisa do Revit pedida (R7, em andamento).

**Proposta técnica (implementada; mantida como registro)**
- `DimRef` com duas escolhas independentes por ponta: no elemento de referência (parede: eixo | face acabada | núcleo) e no elemento medido (abertura: centro | vão livre | vão externo | com alizar; parede/linha: eixo | faces).
- Módulo único de resolução de referências; cada tipo de elemento declara os pontos que oferece.
- Hoje existem **3 vocabulários**: `axis | face` (cotas temporárias, `openingPlacement.ts`), `externa | nucleo | eixo` e `centro | arestas` (`autoCotas.ts`), e nada nas ferramentas de parede e linha. Unificar e migrar `openingDimMode`.
- Componente único de cota temporária alimentado por provedores: abertura, parede (comprimento + distância aos vizinhos), linha, modo perímetro, eixos (grids), piso, laje, telhado, mover/copiar. O `OpeningTempDims` atual vira um provedor.
- Clicar na alça azul alterna a referência daquela ponta (eixo, face, núcleo), como no Revit.
- Conversão "I" para cota permanente, ligada ao `autoCotas` e ao `dimensionTool`.
- Validação de edição por cota: elemento hospedado que não cabe na parede gera alerta (barra de status e aviso na cota), sem sair da parede.
- Cuidados: desempenho, testes e goldens que dependem do símbolo antigo, desfazer/refazer, formato do valor (depende de B/unidades).

## B. Unidades do projeto — **feito**

Implementado e integrado (UNID): U1 `e0e48404`, U2 `c9392982`, U3 `a205f8d4`, U4 `7c255a28`, U5 `2d3d0740`,
U6 `5926d8af`, U7 `dd7bf0c7`; C0 `680bd5aa`, C1 `0f84094b`, C2 `e3158cea`, C3 `0085828d`, C4 `42c84038`,
C5 `cd723de1`, C6 `e50acb3c`, C7 `8765a9cd`; B1–B4 `6ad01c82`, B5 (atalho `UN`) `4d63e546`. Escopo entregue:
comprimento, área, ângulo e inclinação em m/cm/mm/ft-in, em `ProjectSettings`, com entrada por sufixo
(`parseQuantityText`), formatação por grandeza e a trava `check-units` (linha de base de 104 ocorrências
herdadas, só pode diminuir).

Levantamento original (mantido como registro): ~355 `toFixed(` em 107 arquivos, ~71 campos `unit="m"`, ~41
`unit="cm"`, ~60 `scale={100}`, ~100 ocorrências de "m²". DXF/IFC seguem formato de máquina (`// units-ok`).

## C. Correções pequenas — **feito** (S1–S5)

1. **Prévia de colocação com a porta real do tipo** — feito em `2369a314` (S2): a prévia usa o modelo único
   (`buildOpeningModel`/`openingPlanPathsAt` com cache por tipo e inversões); `symbolPreviewItems` foi apagada.
2. **Espaço e Tab não redesenham a prévia** — feito em `8cb2aca6` (S3): `lastPointer` + `move(lastPointer)`;
   `controller.ts` chama `tool.space()` e `bump()`.
3. **Alças de inversão da porta selecionada** — feito em `134bddf5` (S4); não reproduzido no navegador: os cliques
   alternam `flipHand`/`flipFacing` e o canvas muda. Testes de `nextOpeningFlip`/`openingGripPlacements` cobrem.
4. **Planta no modal de propriedades do tipo** — feito em `2a72d477` (S5); não reproduzido: a prévia já tinha
   batente/folha/arco. `StrokeOp` ganhou `role` e o SVG emite `data-role`, com testes em `previewViews.test.ts`.
5. **Batente com a espessura da parede** **[decidido]** — feito em `0047375d` (S1): padrão `frameDepthMode
   'wall'` (espessura acabada) com opção de núcleo, para portas e janelas; alizar e testes revistos.

## D. Esquadrias (composição): pendências conhecidas
- **Validar o alizar no 3D** pelo dono (recuo de 14 mm na face de abertura; alternativa: alizar colado ao batente aceitando a folha tocá-lo).
- **Maçanetas:** conferir de perto no 3D (só a elevação foi vista). Com a folha aberta a maçaneta passa a linha do vão em t (isenta no teste).
- **IFC:** cada vão sai como um só IFCDOOR/IFCWINDOW, com um sólido por peça (`SweptSolid`, com `IFCSTYLEDITEM`; o caminho de compatibilidade sem `parts` ainda grava um corpo único). Faltam `IfcMember`/`IfcPlate` por peça e `*LiningProperties`.
- **Bay, bow e janela de canto** (F8): exigem células não coplanares.
- **Vidro:** rebaixo, folga e baguete são estimativas "a validar"; aço e catálogos de fabricantes sem pesquisa; NBR 10821 e 7199 não lidas.
- **Ids de célula** com hífen podem colidir com ids internos da folha (baixo).
- **Documento B, lacunas L-5 a L-16** (folha em corte e elevação, planta sem alizar/soleira/verga, perfil de caixilho, DXF sem corte): não foram reconferidas após a `v3`.
- **Decisões do catálogo E4** (handoff §5): PF-90/120, tipos antigos P-01..P-03 coexistindo com os novos, peitoris escolhidos pelo agente.
- **Sentido no quadro de esquadrias** em porta de correr/janela, e a convenção "abre para fora".
- **Baselines de imagem** (`tests/e2e/baseline*`) não regravados; a regressão visual da CPU falha por diferença de ambiente (fontes/SO).
- Vidro de bandeira acima do plano de corte aparece como linha na planta (`addHighExtras`): convenção a confirmar.
- **Integração:** **feita** — `claude/fervent-newton-rfgz3y` foi mergeada no `main` em `cab2d5fd`, com gates
  `9e46c3ba` e registro `181b75f5`; R03 em `65fd6bc2`/`adb416ef`. A branch antiga está arquivada. Detalhes em
  [`docs/integracao/cotas-2026-10-29.md`](integracao/cotas-2026-10-29.md).

## E. Pesquisas
- R7 (concluída): `docs/aberturas/pesquisa-f0/R7-revit-cotas-temporarias.md`. Confirmado: cotas aparecem ao colocar e ao selecionar; medem até o perpendicular mais próximo; linhas de chamada podem ser movidas para trocar a referência; paredes: Centerlines | Faces | Core centerline | Core faces; portas e janelas: Centerlines | Openings; ajuste em Manage > Settings > Additional Settings > Temporary Dimensions; converter em permanente mantém a cota; porta fora da parede gera erro ("Can't cut instance ... out of wall"). Não confirmado: escopo (projeto ou usuário), digitar para mover, ícones, unidades.
- Pesquisas anteriores salvas em `docs/aberturas/pesquisa-f0/` (R1 a R6).

## F. Processo
- Economia: Haiku (esforço médio) para tarefas com padrão pronto; Sonnet (esforço médio) para modelo, motor e revisão.
- Worktrees de agentes devem começar com `git fetch origin claude/fervent-newton-rfgz3y` e `git checkout -B <branch> origin/claude/fervent-newton-rfgz3y`, depois `npm ci`.
- Estado e histórico da composição: `docs/aberturas/F-PROGRESSO.md`.
