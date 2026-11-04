# Gera as fichas da modelagem fluida (F1, F2, escolhas, orçamento, usinagens 3D, correções 2).
import os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fichas')
CAB = "Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash\n\n"
ACEITE_PADRAO = ("`npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, "
                 "`node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova.")
FIM = ("\n## Critério de parada\nTeste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.\n\n"
       "## Entrega\nCommits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).\n")


def f(nome, corpo):
    with open(os.path.join(D, nome + '.md'), 'w', encoding='utf-8') as arq:
        arq.write(corpo)


LER_ENC = ("Leia: `packages/engine/src/componentes/encaixeTipos.ts` (contrato e convenções: LEIA INTEIRO), o esqueleto do seu arquivo, "
           "`instancia.ts` (a mesma transformação local→mundo) e `docs/handoff/componentes/PLANO-MODELAGEM-FLUIDA.md` (F2). ")

PROIBIDO_ENC = "\n## Proibido\nQualquer outro arquivo, `crates/**`, `docs/**`, snapshots.\n"

f('F2-parede', "# Ficha F2-parede — encaixar o móvel na parede\n\n" + CAB + "## Contexto\n" + LER_ENC +
  "Implemente `encaixarNaParede` em `encaixeParede.ts` (substitua o `throw`; a assinatura e o comentário já estão lá). "
  "Use `retanguloNoMundo` de `encaixeColisao.ts` para conferir geometria nos testes.\n\n## Faça\n"
  "1. Implemente a função: acha, entre as faces com o centro do móvel do lado LIVRE (esquerda de a→b) e a projeção do ponto central do fundo caindo dentro do segmento (tolerância 1 mm), a de menor distância do fundo até a face; se `distancia > distanciaMax` devolve null. "
  "Gira o móvel para o fundo ficar paralelo à face com a frente para o lado livre: `rotation = atan2(−d.y, −d.x)` (d = direção unitária de a→b), normalizado para (−π, π]; "
  "encosta o fundo na face preservando a posição do CENTRO do móvel ao longo da face (a projeção do centro em d não muda). `mirrored` e `z` não mudam. O centro do móvel é o centro do retângulo local (min+max)/2.\n"
  "2. Testes em `encaixeParede.test.ts` (NOVO), todos numéricos, tolerância 1e-9:\n"
  "   - Face a=(0,0)→b=(4,0) (sólido em y<0, livre y>0); caixa min [0,0,0] max [0.8,0.56,0.72]; pose (2.0, 0.7, rotation 0.1, mirrored false, z 0): depois do encaixe os dois cantos de TRÁS (local y = 0.56) do `retanguloNoMundo` têm y = 0 (|y| < 1e-9), os da FRENTE têm y = 0.56, e o x do centro do retângulo é igual ao de antes do encaixe.\n"
  "   - Mesma situação com `mirrored: true`: continua encostado e `mirrored` continua true.\n"
  "   - Fundo a 0,5 m da face com o padrão (0,30): null; com `distanciaMax` 0,6: encaixa; `distancia` reportada é a de antes (≈ 0,5).\n"
  "   - Duas faces (uma em y=0 e outra em x=0 com o livre em x>0: escolha a orientação de a→b que deixa o livre à esquerda e confira): escolhe a mais próxima, `face` é o índice dela.\n"
  "   - Móvel com o centro no lado SÓLIDO da face é ignorado (null).\n"
  "   - Projeção fora do segmento (móvel além do fim da face) é ignorada.\n"
  "   - Idempotência: encaixar o resultado de novo devolve a mesma pose (tolerância 1e-9) e `distancia ≈ 0`.\n"
  "   - `z` preservado; rotação sempre em (−π, π].\n"
  "3. Gates: " + ACEITE_PADRAO + "\n\n## Arquivos permitidos\n`packages/engine/src/componentes/encaixeParede.ts`, `packages/engine/src/componentes/encaixeParede.test.ts` (NOVO).\n" + PROIBIDO_ENC + FIM)

f('F2-vizinho', "# Ficha F2-vizinho — colar no vizinho e guias de alinhamento\n\n" + CAB + "## Contexto\n" + LER_ENC +
  "Implemente `encaixarNoVizinho` e `guiasDeAlinhamento` em `encaixeVizinho.ts`. Use `retanguloNoMundo` de `encaixeColisao.ts`.\n\n## Faça\n"
  "1. `encaixarNoVizinho` conforme o comentário do esqueleto. Detalhe do encosto: trabalhe no sistema LOCAL DO VIZINHO (gire os pontos pelo inverso da rotação dele): depois de alinhar a rotação do móvel à do vizinho "
  "(a rotação resultante é a do vizinho mais k·90°, escolhido o k mais próximo da rotação atual do móvel; `mirrored` do móvel não muda), o móvel fica à direita ou à esquerda do vizinho; "
  "a lateral 'esquerda' do PRÓPRIO móvel é a de x local mínimo quando não espelhado e a de x local máximo quando espelhado (e vice-versa). Escolha o lado de menor distância entre laterais. "
  "Alinhe a frente: o y local mínimo da caixa do móvel coincide com o do vizinho no sistema do vizinho. Alinhar a rotação só quando a diferença ao múltiplo de 90° mais próximo for ≤ `anguloMax`; senão null.\n"
  "2. `guiasDeAlinhamento` conforme o esqueleto. Cada guia é um segmento na reta de alinhamento, estendido para cobrir as duas caixas (use os retângulos no mundo). "
  "`frente` = a linha da frente (y local mínimo) de cada móvel, `fundo` = y máximo, `esquerda`/`direita` = arestas de x local mínimo/máximo (ignore `mirrored` nas guias: use as arestas do retângulo no mundo), "
  "`centro-x`/`centro-y` = linhas pelo centro em cada eixo local. Só compara móveis com rotações paralelas (diferença múltipla de 90° dentro de 1e-6).\n"
  "3. Testes em `encaixeVizinho.test.ts` (NOVO), tolerância 1e-9:\n"
  "   - Vizinho A: pose (0,0,rot 0), caixa min [0,0,0] max [0.6,0.56,0.72]. Móvel B, mesma caixa, pose (0.63, 0.02, rot 0.05): encaixa com rotation 0, x 0.6, y 0, `lado` 'esquerda', `folga` 0, `vizinho` o id de A.\n"
  "   - B à esquerda de A (pose (−0.63, 0.02, rot −0.05)): x −0.6, `lado` 'direita'.\n"
  "   - B com `folga: 0.002`: afastado 2 mm.\n"
  "   - Distância entre laterais 0,2 (> 0,10 padrão): null; com `distanciaMax` 0,25: encaixa.\n"
  "   - Vizinho girado π/2 (pose (0,0,π/2)): B próximo de um dos lados dele, com rotação de B perto de π/2 (diferença 0,05): encaixa alinhando rotação a π/2 e frente alinhada.\n"
  "   - Diferença de 30° ao múltiplo de 90°: null.\n"
  "   - Vizinho em altura diferente sem sobreposição (z base 1,5 e altura 0,72 vs z 0): ignorado (null); com sobreposição em altura: considerado.\n"
  "   - Vários vizinhos: escolhe o de menor distância; empate: o de menor id.\n"
  "   - `guiasDeAlinhamento`: dois móveis com frentes na mesma linha (±0,005) geram uma guia 'frente' que cobre ambos; com ±0,02 (tolerância padrão 0,01) não geram; rotação não paralela (30°): nenhuma; ordem determinística; `com` é o id do outro.\n"
  "4. Gates: " + ACEITE_PADRAO + "\n\n## Arquivos permitidos\n`packages/engine/src/componentes/encaixeVizinho.ts`, `packages/engine/src/componentes/encaixeVizinho.test.ts` (NOVO).\n" + PROIBIDO_ENC + FIM)

f('F2-colisao', "# Ficha F2-colisao — colisões entre móveis e com paredes\n\n" + CAB + "## Contexto\n" + LER_ENC +
  "Implemente `colisoes` em `encaixeColisao.ts`. A função `retanguloNoMundo` desse arquivo já está pronta: NÃO mude o comportamento dela.\n\n## Faça\n"
  "1. `colisoes` conforme o comentário do esqueleto: sobreposição em planta por teste de eixos separadores entre retângulos orientados (penetração > 1 mm em todos os eixos; encostar não conta) E sobreposição em altura "
  "(z base + caixa.min[2] até z base + caixa.max[2], penetração > 1 mm). Com paredes: algum canto do retângulo mais de 1 mm no lado sólido (direita de a→b) da face e com a projeção dentro do comprimento da face. "
  "Ordem: `moveis` por id, `paredes` por índice crescente; sem repetição; o próprio id ignorado.\n"
  "2. Testes em `encaixeColisao.test.ts` (NOVO; `retanguloNoMundo` também ganha testes: pose sem giro, girada 90°, espelhada), tolerância 1e-9:\n"
  "   - Dois móveis 0,6×0,56 com origens (0,0) e (0,3, 0,2) (sobrepõem): colide. Com origem (0,6, 0): encostados, não colide. (0,6005, 0): não. (0,598, 0): colide.\n"
  "   - Caixa girada 45° com o canto entrando na lateral do outro por 1 cm: colide; recuada 1 cm: não.\n"
  "   - Aéreo acima da base (z base 1,4, altura 0,7 sobre móvel de 0,72 a partir de 0): não colide; descendo o aéreo para z 0,6: colide.\n"
  "   - Mesmo id ignorado.\n"
  "   - Paredes: face a=(0,0)→b=(4,0) (sólido em y<0): móvel com um canto em y = −0,05 e x dentro de [0,4]: `paredes` = [0]; móvel todo em y ≥ 0: []; móvel fora do comprimento da face (x > 4,2): [].\n"
  "   - Ordem determinística com três móveis em ordem embaralhada.\n"
  "3. Gates: " + ACEITE_PADRAO + "\n\n## Arquivos permitidos\n`packages/engine/src/componentes/encaixeColisao.ts`, `packages/engine/src/componentes/encaixeColisao.test.ts` (NOVO).\n" + PROIBIDO_ENC + FIM)

f('F2-fila', "# Ficha F2-fila — preencher vão, ajustar larguras e posicionar a fila\n\n" + CAB + "## Contexto\n" + LER_ENC +
  "Implemente `preencherVao`, `ajustarLarguras` e `posicoesDaFila` em `encaixeFila.ts`. Trabalhe internamente em inteiros de micrômetro (round(m × 1e6)) para não acumular erro de ponto flutuante e devolva metros arredondados a 1 µm.\n\n## Faça\n"
  "1. `preencherVao` conforme o comentário: busca exata por programação dinâmica ou enumeração limitada (no máximo 40 módulos; vão até 12 m); empates resolvidos pelo critério declarado e, por fim, lexicograficamente (determinismo). Painel sozinho (sem módulos) é permitido quando o vão cabe em [painelMin, painelMax].\n"
  "2. `ajustarLarguras` conforme o comentário (soma exatamente `total` em µm quando couber nos limites: o resto de µm vai para o primeiro flexível, depois o segundo etc.).\n"
  "3. `posicoesDaFila`: veja `PosicaoNaFila` em `encaixeTipos.ts` (leia com atenção: o x local corre no sentido de −d; origem local no ponto da linha a `inicio + largura` de `a`, deslocado `profundidade` à ESQUERDA de d).\n"
  "4. Testes em `encaixeFila.test.ts` (NOVO), tolerância 1e-9:\n"
  "   - `preencherVao(1.8, [0.6, 0.8])` = modulos [0.6, 0.6, 0.6], painel 0, sobra 0.\n"
  "   - `preencherVao(1.5, [0.6, 0.8])` = modulos [0.8, 0.6], painel 0.1, sobra 0.\n"
  "   - `preencherVao(0.1, [0.6])`: modulos [], painel 0.1, sobra 0.\n"
  "   - `preencherVao(0.01, [0.6])`: modulos [], painel 0, sobra 0.01.\n"
  "   - `preencherVao(0, [0.6])` e `preencherVao(1, [])`: casos de borda do comentário.\n"
  "   - Determinismo: mesma entrada 3 vezes, mesma saída; ordem das larguras de entrada embaralhada dá o mesmo resultado.\n"
  "   - `ajustarLarguras([0.6,0.6,0.6], [[0.4,0.8],[0.4,0.8],[0.4,0.8]], 2.0)`: soma exata 2.0 (em µm), cada uma entre 0.666666 e 0.666667.\n"
  "   - `ajustarLarguras([0.6,0.6,0.6], [[0.6,0.6],[0.4,1.0],[0.4,1.0]], 2.0)` = [0.6, 0.7, 0.7].\n"
  "   - Total além do máximo possível: todas no máximo; abaixo do mínimo: todas no mínimo.\n"
  "   - Um flexível que bate no limite repassa o excedente aos outros (limites [0.5,0.65] e [0.4,1.0], total 1.5 com larguras [0.6,0.6]: [0.65, 0.85]).\n"
  "   - `posicoesDaFila({0,0}, {4,0}, [0.6, 0.8], 0.56)`: índice 0: inicio 0, largura 0.6, pose x 0.6, y 0.56, rotation π, mirrored false; índice 1: inicio 0.6, largura 0.8, pose x 1.4, y 0.56. Confira também com `retanguloNoMundo` (de `encaixeColisao.ts`) que o fundo do móvel 0 fica em y = 0 e a frente em y = 0.56 e que x vai de 0 a 0.6.\n"
  "   - Linha na vertical a=(0,0)→b=(0,4) (livre à esquerda = x < 0): rotation por `atan2(−d.y, −d.x)`; confira pelo retângulo que o fundo fica em x = 0 e a frente em x = −profundidade.\n"
  "5. Gates: " + ACEITE_PADRAO + "\n\n## Arquivos permitidos\n`packages/engine/src/componentes/encaixeFila.ts`, `packages/engine/src/componentes/encaixeFila.test.ts` (NOVO).\n" + PROIBIDO_ENC + FIM)

f('F1-modelo', "# Ficha F1-modelo — conjuntos e filas de componentes no projeto (comandos)\n\n" + CAB +
  "## Contexto\nO contrato já está em `packages/model/src/types.ts` (`ComponentGroup`, `RegraUniao`, `Component.groupId`, `Project.componentGroups`; esquema 25 e migração prontos). Faltam os COMANDOS e as regras de integridade. "
  "Leia: `packages/model/src/componentCommands.ts` (modelo de comandos: valida antes, lança `Error` em português), `componentes.ts`, `commands.ts` (como o comando de componente é ligado, `transformEach`, e o caminho que exclui elementos), `history.ts`, `componentes.test.ts` (estilo dos testes).\n\n## Faça\n"
  "1. Em `componentCommands.ts` acrescente ao `ComponentCommand`:\n"
  "   - `upsertComponentGroup { group: ComponentGroup }`: valida (id e nome não vazios; `levelId` existe; `membros` sem repetição, com ≥ 1 componente existente, todos no `levelId` do grupo e nenhum já em OUTRO grupo; `linha`, se houver, com `a ≠ b`); grava o grupo e põe `groupId` em cada membro; membros que saíram da lista perdem o `groupId`.\n"
  "   - `deleteComponentGroup { id }`: remove o grupo e apaga o `groupId` dos membros (os componentes ficam).\n"
  "   - `moveComponentGroup { id, dx, dy }`: soma aos `x`/`y` de todos os membros e à `linha` (a e b).\n"
  "   - `rotateComponentGroup { id, centro: Vec2, angulo }`: gira as posições dos membros em torno de `centro` e soma `angulo` à `rotation` de cada um (use `normalizarAngulo` de `componentes.ts`); gira a `linha` junto.\n"
  "   Todos com rótulo em português em `componentCommandLabel` (Criar conjunto, Desfazer conjunto, Mover conjunto, Girar conjunto).\n"
  "2. **Integridade**: ao excluir componentes pelo caminho normal de exclusão de elementos, eles saem de `membros`; grupo que fica com 0 membros é removido; grupo que fica com 1 membro continua. Componente com `groupId` de grupo inexistente é RECUSADO no `addComponent`/`updateComponent` (mensagem em português, via `componentIssue`). Helper `componentesDoGrupo(p, id): Component[]` em `componentes.ts`, na ordem de `membros`.\n"
  "3. **Transformações padrão** (`commands.ts`, mover/girar/espelhar elementos já existentes): quando TODOS os membros de um grupo são transformados juntos, a `linha` acompanha (ponto a ponto, mesma transformação dos componentes); quando só PARTE dos membros é transformada, o grupo perde a `linha` (vira conjunto livre) mas continua com os membros. Siga o jeito de `transformEach`; mudanças mínimas.\n"
  "4. **Cópia**: não faça nada (a ferramenta de colar cuida disso depois).\n"
  "5. Testes em `componentGroups.test.ts` (NOVO): criar grupo com 3 membros (groupId nos 3; desfazer volta); recusar membro inexistente, de outro nível, já em outro grupo, repetido, `linha` com a = b, nome vazio; apagar grupo mantém componentes e limpa `groupId`; "
  "mover/girar conjunto (posições conferidas à mão: girar 90° em torno de (0,0) leva (1,0) a (0,1) e soma π/2 à rotação); excluir um membro tira do grupo; excluir todos remove o grupo; `groupId` inexistente recusado; mover TODOS os membros pelo comando de mover padrão leva a `linha` junto; mover só um membro tira a `linha`; projeto v24 sem grupos migra para 25 sem `componentGroups`.\n"
  "6. Gates: " + ACEITE_PADRAO + " Mais `npx vitest run packages/model` verde SEM regressão.\n\n"
  "## Arquivos permitidos\n`packages/model/src/componentCommands.ts`, `packages/model/src/componentes.ts`, `packages/model/src/commands.ts` (mudanças mínimas), `packages/model/src/componentGroups.test.ts` (NOVO), `packages/model/src/index.ts` (só exports).\n\n"
  "## Proibido\n`types.ts`, `migrate.ts`, `familia/**`, testes existentes, `packages/engine/**`, `packages/render/**`, `packages/tools/**`, `apps/**`, `crates/**`, `docs/**`.\n" + FIM)

f('ESC-modelo', "# Ficha ESC-modelo — conectores e escolhas na família: validação e edição\n\n" + CAB +
  "## Contexto\nO contrato está em `packages/model/src/familia/tipos.ts` (`Conector`, `LadoConector`, `Escolha`; `Familia.conectores?`, `Familia.escolhas?`). Faltam validação e operações de edição (puras, sobre o rascunho, retornam `null` em sucesso ou o motivo da recusa em português, como as de `edicaoPecas.ts` e `edicaoTipos.ts`). "
  "Leia `validar.ts` e `validarEstrutura.ts` (como se acrescentam problemas, `nivel`, `onde`), `edicao.ts`, `edicaoApoio.ts`, `edicaoParametros.ts` (`renomearParametro`: como as referências são atualizadas) e `edicao.test.ts`. Use `clonarSeguro` de `dependencias.ts` se precisar clonar dentro de edição.\n\n## Faça\n"
  "1. **Validação** (arquivo novo `validarEncaixe.ts`, chamado de `validar.ts` com uma linha): conectores com id único e não vazio, `lado` válido, `etiqueta` não vazia, `folga` (se houver) fórmula válida que só referencia parâmetros existentes (mesmo tratamento das outras fórmulas); "
  "escolhas com id único, `parametro` existente e de tipo `enum`, `booleano` ou `inteiro`, `zona` igual ao `grupo` de ao menos uma peça (erro se nenhuma peça tem essa zona). Problemas com `onde: 'conector:<id>'` / `'escolha:<id>'`.\n"
  "2. **Edição** (arquivo novo `edicaoEncaixe.ts`, exportado em `edicao.ts`): `adicionarConector(f, c)`, `editarConector(f, id, patch)`, `excluirConector(f, id)`, `adicionarEscolha(f, e)`, `editarEscolha(f, id, patch)`, `excluirEscolha(f, id)`. "
  "Recusam id duplicado/inexistente. Renomear um parâmetro (`renomearParametro`) deve atualizar `escolhas[].parametro` e as referências de `folga` dos conectores; excluir um parâmetro usado por uma escolha é RECUSADO (a mensagem cita a escolha).\n"
  "3. **Biblioteca**: NÃO mexa na biblioteca (é do orquestrador).\n"
  "4. Testes em `encaixe.test.ts` (NOVO, dentro de `packages/model/src/familia/`): cada validação com um caso que falha e um que passa; cada operação de edição (sucesso, recusas); renomear parâmetro acompanha escolhas e folga; excluir parâmetro em uso recusado; as operações funcionam por dentro de `HistoricoFamilia.exec` (rascunho do immer) com desfazer/refazer.\n"
  "5. Gates: " + ACEITE_PADRAO + " Mais `npx vitest run packages/model` verde SEM regressão.\n\n"
  "## Arquivos permitidos\n`packages/model/src/familia/validarEncaixe.ts` (NOVO), `packages/model/src/familia/edicaoEncaixe.ts` (NOVO), `packages/model/src/familia/validar.ts` (uma chamada), `packages/model/src/familia/edicao.ts` (exports), `packages/model/src/familia/edicaoParametros.ts` (só o necessário para renomear/excluir), `packages/model/src/familia/encaixe.test.ts` (NOVO).\n\n"
  "## Proibido\n`tipos.ts`, `biblioteca/**`, testes existentes, `packages/engine/**`, `apps/**`, `crates/**`, `docs/**`.\n" + FIM)

f('ORC', "# Ficha ORC — orçamento e lista consolidada do projeto inteiro\n\n" + CAB +
  "## Contexto\nHoje a lista de peças, o plano de corte e o custo são POR MÓVEL (editor de famílias). Falta o agregado do projeto: todos os componentes colocados, somados. "
  "Leia: `packages/engine/src/componentes/{instancia.ts (`resolverComponente`), listaPecas*.ts (`listaDePecas`, `resumirLista`, `custoEstimado`, `listaPecasCsv`), planoCorte*.ts (`planoDeCorte`, `pecasParaCorte`)}`, `packages/model/src/familia/catalogo*.ts`, "
  "`apps/web/src/ui/familia/FamiliaLista*.tsx` (como a interface mostra lista/corte/custo; reaproveite componentes e CSS), `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}` e `ui/familia/FamiliaJanela.tsx` (janela modal).\n\n## Faça\n"
  "1. **Motor** (arquivo NOVO `packages/engine/src/componentes/orcamento.ts`, exportado em `index.ts`): `orcamentoDoProjeto(p: Project, opcoes?: { catalogo?: Catalogo; nivel?: Id }): OrcamentoProjeto` puro: percorre os componentes (do nível dado ou de todos), resolve cada um (`resolverComponente`), e devolve "
  "`{ moveis: Array<{ familiaId, tipoId, nome, quantidade, ids: Id[], pecas: number, custo: number }>, linhas: LinhaLista[] (todas as peças consolidadas por chapa, espessura, medidas, veio e fita, quantidades somadas), resumo: ResumoLista, custo: CustoEstimado, ferragens: Array<{ id, nome, quantidade }>, avisos: string[] }`. "
  "Componentes com erro de resolução entram em `avisos` (com o id e a mensagem) e NÃO derrubam o resto. Móveis iguais (mesma família, tipo e valores) são agrupados com `quantidade`. Determinístico (ordem por nome e depois id). Sem componentes: tudo vazio e `avisos` vazio.\n"
  "2. **Testes** (`orcamento.test.ts`, NOVO): projeto com 0 componentes; com 3 do mesmo armário (agrupados, quantidade 3, peças = 3× as de um); com 2 famílias diferentes; um componente com família ausente vira aviso e os outros continuam; filtro por nível; as quantidades consolidadas somam as de cada móvel; o custo total é a soma (tolerância 1e-6); determinismo; CSV (`listaPecasCsv(linhas)`) com cabeçalho.\n"
  "3. **Interface**: janela \"Orçamento do projeto\" (`apps/web/src/ui/OrcamentoProjeto.tsx` NOVO + CSS próprio), aberta por uma ação nova `componentBudget` do ribbon (um botão pequeno ao lado de Componente e Editor de famílias; mudanças mínimas em `ribbon/{actions,model,tabsMain}.ts`). "
  "Abas: Resumo (móveis, quantidades, custo), Peças (lista consolidada com totais), Plano de corte (use `planoDeCorte` por chapa; reaproveite `FamiliaListaCorte` se der), Ferragens. Botões Baixar CSV e Copiar CSV. Sem componentes: mensagem \"Nenhum componente no projeto\". Teste da parte lógica da janela (funções puras em `orcamentoProjeto.ts` ao lado).\n"
  "4. Gates: " + ACEITE_PADRAO + " Mais `npx vitest run packages/engine/src/componentes apps/web` sem regressão.\n\n"
  "## Arquivos permitidos\n`packages/engine/src/componentes/orcamento.ts` (NOVO), `orcamento.test.ts` (NOVO), `packages/engine/src/componentes/index.ts` (uma linha), `apps/web/src/ui/OrcamentoProjeto*` (NOVOS), `apps/web/src/ui/orcamentoProjeto*` (NOVOS), `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}` (mínimo), `apps/web/src/App.tsx` (uma linha para montar a janela, se for o padrão das outras).\n\n"
  "## Proibido\n`packages/model/**`, `packages/tools/**`, `packages/render/**`, `crates/**`, `docs/**`, testes existentes, snapshots.\n" + FIM)

f('USIN3D', "# Ficha USIN3D — mostrar as usinagens no 3D do editor\n\n" + CAB +
  "## Contexto\nO 3D do editor de famílias não mostra furos, rasgos e recortes (o QA reportou: acrescentar usinagem não muda o sólido). O motor já entrega `PecaResolvida.usinagens` (veja `packages/engine/src/componentes/pecas.ts`, `colunasUsinagem.ts`, `FACES`, `TIPOS_USINAGEM`). "
  "Para o 3D, NÃO faça booleana de malha: desenhe MARCADORES sobre a peça. Leia `packages/render/src/familia/{visualizador.ts,visualizadorApoio*.ts,logica.ts}` e os testes vizinhos.\n\n## Faça\n"
  "1. Marcadores: para cada usinagem de cada peça, um objeto three.js filho do mesh da peça (assim acompanha a explosão): `furo` = disco escuro fino (cilindro de altura ~0,5 mm) no diâmetro e posição da usinagem sobre a face indicada, com a normal da face; `rasgo`/`canal` = caixa fina escura do comprimento, largura e posição; "
  "`recorte`/demais = caixa escura aproximada pela caixa da usinagem; furo passante também aparece na face oposta. Cor escura (0x222222) com leve transparência, `polygonOffset` para não piscar (z-fighting) sobre a face. "
  "Posição e orientação vêm de uma função PURA nova `marcadoresDaPeca(peca): Marcador[]` (em arquivo novo `usinagensMarcadores.ts`, sem three.js, só números em metros e vetores) que o visualizador transforma em objetos. Use só os tipos e faces que existem em `pecas.ts` e ignore tipos desconhecidos sem lançar.\n"
  "2. Visibilidade: ligue por padrão; some quando `detalhe` do visualizador for o mais simples (veja como `pecaVisivel` e o nível de detalhe funcionam). Ao selecionar a peça, os marcadores dela continuam visíveis.\n"
  "3. Testes (`usinagensMarcadores.test.ts`, NOVO): peça com furo Ø20 na face 'a' em (0,2; 0,2): um marcador de disco com raio 0,01, centro na face (coordenada de profundidade = a face 'a' da peça, calculada à mão no eixo da espessura), normal para fora; face oposta 'b' fica na outra face; furo passante gera 2 marcadores; rasgo gera caixa com as dimensões certas; peça sem usinagens: lista vazia; tipo desconhecido ignorado; valores em metros.\n"
  "4. Gates: " + ACEITE_PADRAO + " Mais `npx vitest run packages/render/src/familia` sem regressão.\n\n"
  "## Arquivos permitidos\n`packages/render/src/familia/usinagensMarcadores.ts` (NOVO), `usinagensMarcadores.test.ts` (NOVO), `visualizador*.ts` e `logica.ts` (mudanças mínimas para plugar os marcadores), `packages/render/src/index.ts` (uma linha se precisar).\n\n"
  "## Proibido\n`packages/engine/**`, `packages/model/**`, `packages/tools/**`, `apps/**`, `crates/**`, `docs/**`, testes existentes, snapshots.\n" + FIM)

f('CORR-2', "# Ficha CORR-2 — controles que faltam na paleta de peças e aviso do plano de corte\n\n" + CAB +
  "## Contexto\nO QA achou: (a) na paleta de Nova peça, \"Módulo aninhado\" tem selo \"novo\" e não cria nada; \"Contorno poligonal\" e \"peça vazia\" não têm controle na interface; (b) o plano de corte da Cama com baú deixa 4 peças de fora (\"Não couberam\") sem destaque nem sugestão. "
  "Leia `docs/handoff/componentes/QA-2026-11-03.md`, `apps/web/src/ui/familia/FamiliaNovaPeca.tsx`, `FamiliaPeca*.tsx`, `familiaPecaAviso.ts`, `FamiliaListaCorte.tsx`, `familiaLista.ts`, `packages/model/src/familia/{tipos.ts (Peca.contorno, Peca.vazio, Aninhado), edicaoPecas.ts, edicao.ts}` e `packages/engine/src/componentes/planoCorte*.ts`.\n\n## Faça\n"
  "1. **Peça vazia**: caixa \"Vazio (subtrai dos sólidos)\" no painel da peça (`peca.vazio`), com desfazer.\n"
  "2. **Contorno poligonal**: editor simples no painel da peça: lista de vértices (x, y como o tipo `Contorno` permite), adicionar/remover/reordenar vértices, \"Remover contorno\" (volta ao retângulo); valida mínimo 3 vértices e recusa com motivo. A malha 3D e o motor já suportam contorno.\n"
  "3. **Módulo aninhado**: na paleta de Nova peça, \"Módulo aninhado\" abre um diálogo com a lista de famílias da biblioteca (`BIBLIOTECA_BASE` + as do projeto, exceto a própria), campo de nome, tipo da família, origem (x, y, z como fórmulas) e rotação (0, 90, 180, 270); cria o `Aninhado` com `valores` vazios. "
  "Remova o selo \"novo\" dos três itens quando funcionarem. Se `edicaoPecas`/`edicao.ts` não tiver operação para aninhado (procure `adicionarAninhado`), PARE e relate (o modelo é do orquestrador).\n"
  "4. **Plano de corte**: peças que \"não couberam\" aparecem em destaque NO TOPO do plano (cor de aviso, lista com nome, medida e motivo) e com uma dica: \"Troque a chapa ou reduza o refilo/permita girar a peça\" (texto adaptado ao motivo quando o veio travar a rotação). Função pura de texto em arquivo novo e testada.\n"
  "5. Testes de lógica (puros) para cada item que tiver lógica nova; `npx vitest run apps/web` sem regressão.\n"
  "6. Gates: " + ACEITE_PADRAO + "\n\n"
  "## Arquivos permitidos\n`apps/web/src/ui/familia/{FamiliaNovaPeca.tsx, FamiliaPeca*.tsx, FamiliaListaCorte.tsx, familiaPecaAviso.ts, familiaLista.ts}`, novos `apps/web/src/ui/familia/familia{Contorno,Aninhado,Corte}*.ts[x]` e CSS novo, testes novos ao lado.\n\n"
  "## Proibido\n`packages/**`, `crates/**`, `docs/**`, `FamiliaUsinagem*`, `FamiliaTipos.tsx`, `FamiliaCatalogo*`, `FamiliaParametros*` (são da CORR-1), testes existentes, snapshots.\n" + FIM)

print('fichas geradas')
