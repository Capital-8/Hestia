# Ficha E7-geral — famílias da biblioteca base: Famílias básicas

Base: branch `feat/familias-interface` (tudo da E1 à E6 integrado).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A biblioteca base reúne famílias AUTORAIS (nenhum ativo de terceiros) para criar a maioria dos móveis. Cada família é um objeto `Familia` (veja `packages/model/src/familia/tipos.ts`) escrito à mão, com parâmetros, fórmulas, peças, ferragens, tipos e, quando couber, módulos aninhados. Modelos a seguir: `packages/model/src/familia/exemplos.ts` (`FAMILIA_ARMARIO`, bem comentado) e `packages/model/src/familia/biblioteca/gaveta.ts` (`FAMILIA_GAVETA`, módulo reutilizável que as bases aninham). Leia também `packages/model/src/familia/biblioteca/index.ts` (registro e `IDS_OBRIGATORIOS`), a convenção de peças em `packages/engine/src/componentes/pecas.ts` (eixos, tamanho, espessura, usinagens com `recorte`) e o julgamento em `packages/engine/src/componentes/biblioteca.test.ts` (aceite).

Convenções OBRIGATÓRIAS (o teste confere): medidas em mm; parâmetros `L`, `A`, `P` de instância; id de família `fam_*`; `descricao` com mais de 10 caracteres; pelo menos 2 tipos e `tipoPadrao`; chapas só do catálogo padrão (`packages/model/src/familia/catalogo.ts`: ids mdf6, mdf15, mdf18, mdf25, mdp15, mdp18, com a MESMA espessura em `esp`); fitas só de `fita_pvc` (ou outras do catálogo); ferragens só com id do catálogo (dobradica, corredica, puxador, pino, cavilha, pe, minifix); nenhuma peça abaixo do piso (z ≥ 0), nenhuma peça atravessando outra (volume de interseção ≤ 1e-9 m3), nenhum erro de resolução, em TODOS os tipos e nos valores mínimo e máximo de CADA parâmetro flexionável (por isso escolha `min` e `max` realistas, em que a construção ainda funciona, e use `clamp`/`max` nas fórmulas quando preciso). A família tem de abrir e salvar sem perda. `fam_gaveta` e `fam_armario_baixo` podem ser aninhados (use `aninhados` com `familiaId`, `valores` por fórmula, `origem` e `rotacao`).

## Faça
Escreva as famílias abaixo em `packages/model/src/familia/biblioteca/geral.ts`, exportando a lista `GERAL` (substitui o `[]` atual). Divida em arquivos de apoio com prefixo `geral` (um por família ou por pequeno grupo) para nenhum arquivo passar de 420 linhas. Cada família com os ids `fam_*` listados:

| id | nome | construção |
|---|---|---|
| `fam_modulo_branco` | Módulo em branco | Caixa de chapa mínima: 2 laterais, base, topo e fundo; L 600, A 600, P 400; chapa selecionável. Ponto de partida do usuário. |
| `fam_bloco_livre` | Bloco livre | UM bloco (papel `bloco`, eixo z, material livre) de L × P × A: mobília maciça simples; L 500, A 450, P 500. |
| `fam_mesa` | Mesa | Tampo e 4 pés (blocos, `espPe` padrão 60) com recuo `recuoPe`; tipos jantar (1600 × 900 × 740) e escritório (1200 × 600 × 740). |
| `fam_banco` | Banco | Assento e 4 pernas; L 400, A 450, P 350; tipos baixo (450) e alto (650). |
| `fam_prateleira` | Prateleira suspensa | Uma prateleira de chapa (papel `prateleira`) a `zFixacao` (padrão 1200) do piso; L 800, P 250, espessura 25 (chapa mdf25); tipos 600, 800 e 1000. |
| `fam_painel_ripado` | Painel ripado | Ripas verticais repetidas (`repetir`) com largura `larguraRipa` e vão `vaoRipa`, `n` calculado a partir de L; moldura opcional (booleano); A 2400. |

Dicas: comece copiando a estrutura de `exemplos.ts` e ajustando; rode `npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família fam_"` com frequência e corrija as mensagens (dizem qual peça atravessa qual e em qual valor); as fórmulas de posição devem usar parâmetros derivados (como `zBase`, `hCorpo`) para ficar legíveis; escolha `papel` coerente (`lateral`, `base`, `topo`, `travessa`, `prateleira`, `divisoria`, `fundo`, `porta`, `frente_gaveta`, `tampo`, `rodape`, `painel`, `bloco`).

## Arquivos permitidos
`packages/model/src/familia/biblioteca/geral.ts` e novos `packages/model/src/familia/biblioteca/geral*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `index.ts` e os arquivos dos outros grupos, `biblioteca.test.ts`, `gaveta.ts`, `exemplos.ts`, `tipos.ts`, `catalogo.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família "` verde para todas as suas famílias (o teste do registro só passa com os 4 grupos integrados), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Se uma regra do teste for impossível para uma família (por exemplo uma ferragem que não existe no catálogo), PARE e relate qual; não altere testes nem o catálogo.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras, listando por família o que implementou.
