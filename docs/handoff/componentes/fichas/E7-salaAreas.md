# Ficha E7-salaAreas — famílias da biblioteca base: Sala, escritório e áreas molhadas

Base: branch `feat/familias-interface` (tudo da E1 à E6 integrado).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A biblioteca base reúne famílias AUTORAIS (nenhum ativo de terceiros) para criar a maioria dos móveis. Cada família é um objeto `Familia` (veja `packages/model/src/familia/tipos.ts`) escrito à mão, com parâmetros, fórmulas, peças, ferragens, tipos e, quando couber, módulos aninhados. Modelos a seguir: `packages/model/src/familia/exemplos.ts` (`FAMILIA_ARMARIO`, bem comentado) e `packages/model/src/familia/biblioteca/gaveta.ts` (`FAMILIA_GAVETA`, módulo reutilizável que as bases aninham). Leia também `packages/model/src/familia/biblioteca/index.ts` (registro e `IDS_OBRIGATORIOS`), a convenção de peças em `packages/engine/src/componentes/pecas.ts` (eixos, tamanho, espessura, usinagens com `recorte`) e o julgamento em `packages/engine/src/componentes/biblioteca.test.ts` (aceite).

Convenções OBRIGATÓRIAS (o teste confere): medidas em mm; parâmetros `L`, `A`, `P` de instância; id de família `fam_*`; `descricao` com mais de 10 caracteres; pelo menos 2 tipos e `tipoPadrao`; chapas só do catálogo padrão (`packages/model/src/familia/catalogo.ts`: ids mdf6, mdf15, mdf18, mdf25, mdp15, mdp18, com a MESMA espessura em `esp`); fitas só de `fita_pvc` (ou outras do catálogo); ferragens só com id do catálogo (dobradica, corredica, puxador, pino, cavilha, pe, minifix); nenhuma peça abaixo do piso (z ≥ 0), nenhuma peça atravessando outra (volume de interseção ≤ 1e-9 m3), nenhum erro de resolução, em TODOS os tipos e nos valores mínimo e máximo de CADA parâmetro flexionável (por isso escolha `min` e `max` realistas, em que a construção ainda funciona, e use `clamp`/`max` nas fórmulas quando preciso). A família tem de abrir e salvar sem perda. `fam_gaveta` e `fam_armario_baixo` podem ser aninhados (use `aninhados` com `familiaId`, `valores` por fórmula, `origem` e `rotacao`).

## Faça
Escreva as famílias abaixo em `packages/model/src/familia/biblioteca/salaAreas.ts`, exportando a lista `SALA_AREAS` (substitui o `[]` atual). Divida em arquivos de apoio com prefixo `salaAreas` (um por família ou por pequeno grupo) para nenhum arquivo passar de 420 linhas. Cada família com os ids `fam_*` listados:

| id | nome | construção |
|---|---|---|
| `fam_rack` | Rack | Rack baixo (L 1800, A 500, P 400): 3 nichos abertos com divisórias, 2 portas nos nichos laterais, tampo, 4 pés (blocos) ou rodapé. |
| `fam_estante` | Estante | Estante aberta (L 800, A 1800, P 300): laterais, base, topo, fundo e `nPrat` prateleiras (1 a 8) distribuídas igualmente. |
| `fam_mesa_gaveteiro` | Mesa com gaveteiro | Tampo de 25 mm, painel lateral do lado oposto e um gaveteiro de 3 gavetas (aninhados `fam_gaveta`) no outro lado; L 1400, A 740, P 650. |
| `fam_gabinete_banheiro` | Gabinete de banheiro | Gabinete suspenso (`zFixacao` padrão 450), 2 portas, tampo com recorte da cuba (usinagem `recorte` centrada, parâmetros `cubaL` e `cubaP`), L 800, A 500, P 450. Tipos 60, 80 e 100. |
| `fam_armario_lavanderia` | Armário de lavanderia | Armário alto (A 1800, L 800, P 400): 2 portas, 3 prateleiras reguláveis, rodapé; tipos 60 e 80. |
| `fam_escrivaninha` | Escrivaninha | Tampo de 25 mm sobre 2 painéis laterais e uma prateleira de apoio; L 1200, A 740, P 600; tipos 1000, 1200 e 1500. |

Dicas: comece copiando a estrutura de `exemplos.ts` e ajustando; rode `npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família fam_"` com frequência e corrija as mensagens (dizem qual peça atravessa qual e em qual valor); as fórmulas de posição devem usar parâmetros derivados (como `zBase`, `hCorpo`) para ficar legíveis; escolha `papel` coerente (`lateral`, `base`, `topo`, `travessa`, `prateleira`, `divisoria`, `fundo`, `porta`, `frente_gaveta`, `tampo`, `rodape`, `painel`, `bloco`).

## Arquivos permitidos
`packages/model/src/familia/biblioteca/salaAreas.ts` e novos `packages/model/src/familia/biblioteca/salaAreas*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `index.ts` e os arquivos dos outros grupos, `biblioteca.test.ts`, `gaveta.ts`, `exemplos.ts`, `tipos.ts`, `catalogo.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/biblioteca.test.ts -t "família "` verde para todas as suas famílias (o teste do registro só passa com os 4 grupos integrados), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Se uma regra do teste for impossível para uma família (por exemplo uma ferragem que não existe no catálogo), PARE e relate qual; não altere testes nem o catálogo.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras, listando por família o que implementou.
