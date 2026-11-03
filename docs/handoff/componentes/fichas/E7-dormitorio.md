# Ficha E7-dormitorio — famílias da biblioteca base: Dormitório e closet

Base: branch `feat/familias-interface` (tudo da E1 à E6 integrado).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A biblioteca base reúne famílias AUTORAIS (nenhum ativo de terceiros) para criar a maioria dos móveis. Cada família é um objeto `Familia` (veja `packages/model/src/familia/tipos.ts`) escrito à mão, com parâmetros, fórmulas, peças, ferragens, tipos e, quando couber, módulos aninhados. Modelos a seguir: `packages/model/src/familia/exemplos.ts` (`FAMILIA_ARMARIO`, bem comentado) e `packages/model/src/familia/biblioteca/gaveta.ts` (`FAMILIA_GAVETA`, módulo reutilizável que as bases aninham). Leia também `packages/model/src/familia/biblioteca/index.ts` (registro e `IDS_OBRIGATORIOS`), a convenção de peças em `packages/engine/src/componentes/pecas.ts` (eixos, tamanho, espessura, usinagens com `recorte`) e o julgamento em `packages/engine/src/componentes/biblioteca.test.ts` (aceite).

Convenções OBRIGATÓRIAS (o teste confere): medidas em mm; parâmetros `L`, `A`, `P` de instância; id de família `fam_*`; `descricao` com mais de 10 caracteres; pelo menos 2 tipos e `tipoPadrao`; chapas só do catálogo padrão (`packages/model/src/familia/catalogo.ts`: ids mdf6, mdf15, mdf18, mdf25, mdp15, mdp18, com a MESMA espessura em `esp`); fitas só de `fita_pvc` (ou outras do catálogo); ferragens só com id do catálogo (dobradica, corredica, puxador, pino, cavilha, pe, minifix); nenhuma peça abaixo do piso (z ≥ 0), nenhuma peça atravessando outra (volume de interseção ≤ 1e-9 m3), nenhum erro de resolução, em TODOS os tipos e nos valores mínimo e máximo de CADA parâmetro flexionável (por isso escolha `min` e `max` realistas, em que a construção ainda funciona, e use `clamp`/`max` nas fórmulas quando preciso). A família tem de abrir e salvar sem perda. `fam_gaveta` e `fam_armario_baixo` podem ser aninhados (use `aninhados` com `familiaId`, `valores` por fórmula, `origem` e `rotacao`).

## Faça
Escreva as famílias abaixo em `packages/model/src/familia/biblioteca/dormitorio.ts`, exportando a lista `DORMITORIO` (substitui o `[]` atual). Divida em arquivos de apoio com prefixo `dormitorio` (um por família ou por pequeno grupo) para nenhum arquivo passar de 420 linhas. Cada família com os ids `fam_*` listados:

| id | nome | construção |
|---|---|---|
| `fam_guarda_roupa_modulo` | Guarda-roupa (módulo) | Módulo alto (A padrão 2400, L 450 a 1200, P 600): laterais, base, topo, fundo, divisória central opcional (booleano), 2 prateleiras e 2 portas de abrir (`nPortas` 1 ou 2); barra de cabides como peça `bloco` fina. |
| `fam_guarda_roupa_conjunto` | Guarda-roupa (conjunto) | Aninha `fam_guarda_roupa_modulo` N vezes lado a lado (`repetir: nModulos`, 1 a 6, largura `larguraModulo` por módulo, origem em X `(i - 1) * larguraModulo`). L é derivado de `nModulos * larguraModulo`. |
| `fam_comoda` | Cômoda | Carcaça baixa (A padrão 900, L 1000, P 480) com 4 gavetas aninhadas (`fam_gaveta`) e tampo; rodapé de 80. |
| `fam_criado_mudo` | Criado-mudo | Pequeno (L 500, A 500, P 400): 1 gaveta aninhada e 1 nicho aberto, 4 pés (peças `bloco` de 40 × 40) ou rodapé; tampo. |
| `fam_cama_bau` | Cama com baú | Estrado de painéis (laterais, cabeceira, pé, tampa do baú em `painel`) e base; tipos solteiro (880 × 1880), casal (1380 × 1880) e queen (1580 × 1980) como L × P; altura A de 400. |
| `fam_painel_tv` | Painel de TV | Painel traseiro e 3 nichos com prateleiras e divisórias, largura `larguraTV` (padrão 1800), altura 1200; tipos 1800 e 2400. |

Dicas: comece copiando a estrutura de `exemplos.ts` e ajustando; rode `npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família fam_"` com frequência e corrija as mensagens (dizem qual peça atravessa qual e em qual valor); as fórmulas de posição devem usar parâmetros derivados (como `zBase`, `hCorpo`) para ficar legíveis; escolha `papel` coerente (`lateral`, `base`, `topo`, `travessa`, `prateleira`, `divisoria`, `fundo`, `porta`, `frente_gaveta`, `tampo`, `rodape`, `painel`, `bloco`).

## Arquivos permitidos
`packages/model/src/familia/biblioteca/dormitorio.ts` e novos `packages/model/src/familia/biblioteca/dormitorio*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `index.ts` e os arquivos dos outros grupos, `biblioteca.test.ts`, `gaveta.ts`, `exemplos.ts`, `tipos.ts`, `catalogo.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família "` verde para todas as suas famílias (o teste do registro só passa com os 4 grupos integrados), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Se uma regra do teste for impossível para uma família (por exemplo uma ferragem que não existe no catálogo), PARE e relate qual; não altere testes nem o catálogo.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras, listando por família o que implementou.
