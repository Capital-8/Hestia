# Ficha E8-motor — componente colocado no projeto: resolução, malha no mundo, pegada em planta e caixa

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O projeto agora guarda famílias (`Project.componentFamilies`) e instâncias (`Component`: família, tipo, nível, x, y, z, rotação, espelhamento, valores). Falta o motor transformar a instância em geometria no mundo, para a vista 3D, a planta e a caixa. A geometria da família já sai de `resolverFamilia` e `malhaDasPecas` (em `packages/engine/src/componentes/`), em metros. Leia: `instancia.ts` (especificação completa em comentário: siga literalmente), `instancia.test.ts` (aceite), `packages/model/src/componentes.ts` e `types.ts` (`Component`; fórmula do mundo: `R(rotation) · E · local + (x, y)`, `E` espelha o X local quando `mirrored`), `resolver.ts`, `malha.ts`, `queries.ts` de `@hestia/model` (`levelElevation`) e `packages/geom/src/boolean.ts` (`union`).

## Faça
1. Implemente `resolverComponente`, `malhaDoComponente`, `pegadaDoComponente` e `caixaDoComponente` em `instancia.ts`, mantendo assinaturas e comentários.
2. Memória de `resolverComponente`: `WeakMap<object, Map<string, ResolucaoFamilia>>` com chave no objeto `p.componentFamilies` (quando ausente use um objeto fixo do módulo) e, dentro, a chave `familyId|typeId|JSON.stringify(values ordenados por nome)`. A mesma entrada devolve a MESMA referência.
3. `malhaDoComponente`: para cada vértice da malha local, `(x, y) → (cx + (±x)·cosθ − y·senθ, cy + (±x)·senθ + y·cosθ)` com o sinal de X trocado quando `mirrored`, e `z → nível + c.z + z`; as normais passam pela mesma parte linear (sem translação); com `mirrored` (determinante negativo) troque a ordem de dois índices de cada triângulo.
4. `pegadaDoComponente`: retângulos locais em planta transformados e unidos com `union`; devolva só anéis com área maior que 1e-9 m2.
5. Funções pequenas e puras; nenhum arquivo passa de 420 linhas (divida em `instanciaGeometria.ts` se precisar).

## Arquivos permitidos
`packages/engine/src/componentes/instancia.ts` e novos `packages/engine/src/componentes/instancia*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `instancia.test.ts`, `index.ts`, `resolver.ts`, `malha.ts` e `packages/model`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/instancia.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
