# Ficha F1-modelo — conjuntos e filas de componentes no projeto (comandos)

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O contrato já está em `packages/model/src/types.ts` (`ComponentGroup`, `RegraUniao`, `Component.groupId`, `Project.componentGroups`; esquema 25 e migração prontos). Faltam os COMANDOS e as regras de integridade. Leia: `packages/model/src/componentCommands.ts` (modelo de comandos: valida antes, lança `Error` em português), `componentes.ts`, `commands.ts` (como o comando de componente é ligado, `transformEach`, e o caminho que exclui elementos), `history.ts`, `componentes.test.ts` (estilo dos testes).

## Faça
1. Em `componentCommands.ts` acrescente ao `ComponentCommand`:
   - `upsertComponentGroup { group: ComponentGroup }`: valida (id e nome não vazios; `levelId` existe; `membros` sem repetição, com ≥ 1 componente existente, todos no `levelId` do grupo e nenhum já em OUTRO grupo; `linha`, se houver, com `a ≠ b`); grava o grupo e põe `groupId` em cada membro; membros que saíram da lista perdem o `groupId`.
   - `deleteComponentGroup { id }`: remove o grupo e apaga o `groupId` dos membros (os componentes ficam).
   - `moveComponentGroup { id, dx, dy }`: soma aos `x`/`y` de todos os membros e à `linha` (a e b).
   - `rotateComponentGroup { id, centro: Vec2, angulo }`: gira as posições dos membros em torno de `centro` e soma `angulo` à `rotation` de cada um (use `normalizarAngulo` de `componentes.ts`); gira a `linha` junto.
   Todos com rótulo em português em `componentCommandLabel` (Criar conjunto, Desfazer conjunto, Mover conjunto, Girar conjunto).
2. **Integridade**: ao excluir componentes pelo caminho normal de exclusão de elementos, eles saem de `membros`; grupo que fica com 0 membros é removido; grupo que fica com 1 membro continua. Componente com `groupId` de grupo inexistente é RECUSADO no `addComponent`/`updateComponent` (mensagem em português, via `componentIssue`). Helper `componentesDoGrupo(p, id): Component[]` em `componentes.ts`, na ordem de `membros`.
3. **Transformações padrão** (`commands.ts`, mover/girar/espelhar elementos já existentes): quando TODOS os membros de um grupo são transformados juntos, a `linha` acompanha (ponto a ponto, mesma transformação dos componentes); quando só PARTE dos membros é transformada, o grupo perde a `linha` (vira conjunto livre) mas continua com os membros. Siga o jeito de `transformEach`; mudanças mínimas.
4. **Cópia**: não faça nada (a ferramenta de colar cuida disso depois).
5. Testes em `componentGroups.test.ts` (NOVO): criar grupo com 3 membros (groupId nos 3; desfazer volta); recusar membro inexistente, de outro nível, já em outro grupo, repetido, `linha` com a = b, nome vazio; apagar grupo mantém componentes e limpa `groupId`; mover/girar conjunto (posições conferidas à mão: girar 90° em torno de (0,0) leva (1,0) a (0,1) e soma π/2 à rotação); excluir um membro tira do grupo; excluir todos remove o grupo; `groupId` inexistente recusado; mover TODOS os membros pelo comando de mover padrão leva a `linha` junto; mover só um membro tira a `linha`; projeto v24 sem grupos migra para 25 sem `componentGroups`.
6. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova. Mais `npx vitest run packages/model` verde SEM regressão.

## Arquivos permitidos
`packages/model/src/componentCommands.ts`, `packages/model/src/componentes.ts`, `packages/model/src/commands.ts` (mudanças mínimas), `packages/model/src/componentGroups.test.ts` (NOVO), `packages/model/src/index.ts` (só exports).

## Proibido
`types.ts`, `migrate.ts`, `familia/**`, testes existentes, `packages/engine/**`, `packages/render/**`, `packages/tools/**`, `apps/**`, `crates/**`, `docs/**`.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
