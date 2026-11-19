# Ficha CONECT-biblioteca — conectores nas 28 famílias da biblioteca

Base: `feat/familias-interface`.   Nível 1 (mecânico)

## Contexto
`Familia.conectores?: Conector[]` já existe em `packages/model/src/familia/tipos.ts` (tipo `Conector`, `LadoConector`). Falta preencher a biblioteca base (`packages/model/src/familia/biblioteca/`). É trabalho repetitivo e regrado: siga a tabela abaixo sem inventar.

## Regra
Cada família ganha 3 conectores, na ordem: `esquerda`, `direita`, `fundo`:
- `{ id: 'cesq', nome: 'Lateral esquerda', lado: 'esquerda', etiqueta: E, aceita: [E, 'painel'] }`
- `{ id: 'cdir', nome: 'Lateral direita', lado: 'direita', etiqueta: E, aceita: [E, 'painel'] }`
- `{ id: 'cfundo', nome: 'Fundo', lado: 'fundo', etiqueta: E, aceita: ['parede'] }`
onde `E` (a etiqueta) vem de `IDS_OBRIGATORIOS` em `biblioteca/index.ts` e da tabela:
- `base`: fam_base_gavetas, fam_base_pia, fam_base_cooktop, fam_canto_l, fam_armario_baixo (é o `FAMILIA_ARMARIO` de `exemplos.ts`: acrescente lá), fam_armario_lavanderia, fam_gabinete_banheiro
- `aereo`: fam_aereo, fam_aereo_basculante
- `torre`: fam_torre_forno, fam_paneleiro, fam_guarda_roupa_modulo, fam_guarda_roupa_conjunto, fam_estante
- `movel`: fam_comoda, fam_criado_mudo, fam_cama_bau, fam_rack, fam_mesa_gaveteiro, fam_escrivaninha, fam_mesa, fam_banco
- `painel`: fam_painel_tv, fam_painel_ripado, fam_prateleira
- `modulo`: fam_modulo_branco, fam_bloco_livre
- `peca`: fam_gaveta (módulo de apoio: só `cesq` e `cdir`, sem fundo)
Se alguma família da biblioteca não estiver nessa lista, PARE e relate o id.

## Faça
1. Acrescente `conectores` em cada família (um helper local `conectoresDe(etiqueta)` em arquivo novo `biblioteca/conectores.ts`, usado pelos arquivos das famílias com uma linha cada: `conectores: conectoresDe('base')`).
2. Teste novo `biblioteca/conectores.test.ts`: todas as famílias de `BIBLIOTECA_BASE` e `FAMILIA_ARMARIO` têm conectores com ids únicos por família e as etiquetas da tabela; a gaveta tem 2; as demais 3; `validarFamilia` de cada uma continua sem erros novos (compare com o número de erros de antes: deve ser 0 erros); `aceita` do fundo é `['parede']`.
3. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/model packages/engine/src/componentes` sem regressão. Textos em português.

## Arquivos permitidos
`packages/model/src/familia/biblioteca/*.ts` (só para acrescentar `conectores`), `packages/model/src/familia/exemplos.ts` (só `conectores` do armário), `packages/model/src/familia/biblioteca/conectores.test.ts` (NOVO).

## Proibido
`tipos.ts`, qualquer lógica de peças, parâmetros e fórmulas, testes existentes, `packages/engine/**`, `apps/**`, `crates/**`, `docs/**`.

## Critério de parada
Teste existente que quebre por causa dos conectores: PARE e relate.

## Entrega
Commits pequenos e o relatório pedido nas regras.
