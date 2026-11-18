# Ficha E7-cozinha — famílias da biblioteca base: Cozinha

Base: branch `feat/familias-interface` (tudo da E1 à E6 integrado).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A biblioteca base reúne famílias AUTORAIS (nenhum ativo de terceiros) para criar a maioria dos móveis. Cada família é um objeto `Familia` (veja `packages/model/src/familia/tipos.ts`) escrito à mão, com parâmetros, fórmulas, peças, ferragens, tipos e, quando couber, módulos aninhados. Modelos a seguir: `packages/model/src/familia/exemplos.ts` (`FAMILIA_ARMARIO`, bem comentado) e `packages/model/src/familia/biblioteca/gaveta.ts` (`FAMILIA_GAVETA`, módulo reutilizável que as bases aninham). Leia também `packages/model/src/familia/biblioteca/index.ts` (registro e `IDS_OBRIGATORIOS`), a convenção de peças em `packages/engine/src/componentes/pecas.ts` (eixos, tamanho, espessura, usinagens com `recorte`) e o julgamento em `packages/engine/src/componentes/biblioteca.test.ts` (aceite).

Convenções OBRIGATÓRIAS (o teste confere): medidas em mm; parâmetros `L`, `A`, `P` de instância; id de família `fam_*`; `descricao` com mais de 10 caracteres; pelo menos 2 tipos e `tipoPadrao`; chapas só do catálogo padrão (`packages/model/src/familia/catalogo.ts`: ids mdf6, mdf15, mdf18, mdf25, mdp15, mdp18, com a MESMA espessura em `esp`); fitas só de `fita_pvc` (ou outras do catálogo); ferragens só com id do catálogo (dobradica, corredica, puxador, pino, cavilha, pe, minifix); nenhuma peça abaixo do piso (z ≥ 0), nenhuma peça atravessando outra (volume de interseção ≤ 1e-9 m3), nenhum erro de resolução, em TODOS os tipos e nos valores mínimo e máximo de CADA parâmetro flexionável (por isso escolha `min` e `max` realistas, em que a construção ainda funciona, e use `clamp`/`max` nas fórmulas quando preciso). A família tem de abrir e salvar sem perda. `fam_gaveta` e `fam_armario_baixo` podem ser aninhados (use `aninhados` com `familiaId`, `valores` por fórmula, `origem` e `rotacao`).

## Faça
Escreva as famílias abaixo em `packages/model/src/familia/biblioteca/cozinha.ts`, exportando a lista `COZINHA` (substitui o `[]` atual). Divida em arquivos de apoio com prefixo `cozinha` (um por família ou por pequeno grupo) para nenhum arquivo passar de 420 linhas. Cada família com os ids `fam_*` listados:

| id | nome | construção |
|---|---|---|
| `fam_base_gavetas` | Base com gavetas | Carcaça (laterais, base, travessas, fundo, rodapé, tampo) e 3 gavetas empilhadas, cada uma um aninhado de `fam_gaveta` (valores L, A, P por fórmula; alturas por parâmetros que somam o vão). Tipos 60, 80 e 100 de largura. |
| `fam_base_pia` | Base de pia | Como o armário baixo (2 portas, sem prateleira) com o tampo recortado para a cuba: uma usinagem `recorte` na face do tampo, centrada, com parâmetros `cubaL` e `cubaP`. Tipos 80, 100 e 120. |
| `fam_base_cooktop` | Base de cooktop | Gavetão alto (aninhado `fam_gaveta` tipo alta) e vão livre; tampo com recorte de 560 × 490 centrado (parâmetros). Tipos 60 e 80. |
| `fam_aereo` | Armário aéreo | Aéreo com 1 ou 2 portas e N prateleiras; parâmetro `zFixacao` (altura do fundo do móvel em relação ao piso, padrão 1400), A padrão 700 e P 320; sem rodapé nem tampo. Tipos 40, 60 e 80. |
| `fam_aereo_basculante` | Aéreo basculante | Porta única basculante (altura menor, A padrão 400, P 320), 2 dobradiças de ferragem `dobradica` por porta, `zFixacao`. Tipos 60, 80 e 100. |
| `fam_torre_forno` | Torre de forno | Torre alta (A padrão 2100, L 600): vão do forno de altura `hForno` (padrão 600) com divisórias, gaveta ou porta embaixo e porta em cima; nicho do forno sem porta. Tipos 60 e 70. |
| `fam_paneleiro` | Paneleiro | Torre baixa de 4 gavetas altas (aninhados `fam_gaveta` tipo alta) com carcaça completa; A padrão 900, L 400. Tipos 40 e 50. |
| `fam_canto_l` | Canto em L | Duas alas formadas por aninhados de `fam_armario_baixo` (tipo com `tampo: "sem"` passado em `valores`), uma girada 90° (rotação `90`), mais UM tampo em L (peça com contorno poligonal) por cima. Parâmetros `ala1` e `ala2` (comprimentos das alas). |

Dicas: comece copiando a estrutura de `exemplos.ts` e ajustando; rode `npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família fam_"` com frequência e corrija as mensagens (dizem qual peça atravessa qual e em qual valor); as fórmulas de posição devem usar parâmetros derivados (como `zBase`, `hCorpo`) para ficar legíveis; escolha `papel` coerente (`lateral`, `base`, `topo`, `travessa`, `prateleira`, `divisoria`, `fundo`, `porta`, `frente_gaveta`, `tampo`, `rodape`, `painel`, `bloco`).

## Arquivos permitidos
`packages/model/src/familia/biblioteca/cozinha.ts` e novos `packages/model/src/familia/biblioteca/cozinha*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `index.ts` e os arquivos dos outros grupos, `biblioteca.test.ts`, `gaveta.ts`, `exemplos.ts`, `tipos.ts`, `catalogo.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família "` verde para todas as suas famílias (o teste do registro só passa com os 4 grupos integrados), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Se uma regra do teste for impossível para uma família (por exemplo uma ferragem que não existe no catálogo), PARE e relate qual; não altere testes nem o catálogo.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras, listando por família o que implementou.
