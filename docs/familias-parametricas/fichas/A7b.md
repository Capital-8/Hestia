# Ficha A7b — Caixa e pegada do componente incluem corpos; símbolos no resolvedor

Modelo: **Haiku 5.5** · Onda 3 · Depende de: A7, D1 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` e `CONTRATO.md` (§2.3, §4). Vale o CONTRATO se algo aqui divergir.

## Contexto
`resolverFamilia` (A7) já devolve `corpos`, `ligacoes` e `caixaCorpos` (caixa envolvente dos corpos sólidos, em metros, no sistema da família). `caixaDoComponente` e `pegadaDoComponente` em `packages/engine/src/componentes/instancia.ts` ainda olham só as peças, então um componente feito só de corpos (um tubo) fica com caixa vazia (seleção, enquadrar e encaixe quebram). O resolvedor de símbolos (`resolverSimbolos`, D1) existe mas `resolverFamilia` não o chama.

## Faça
1. Em `instancia.ts`, faça `caixaDoComponente` unir a caixa das peças com `caixaCorpos` (quando houver); `pegadaDoComponente` inclui o retângulo (XY) da caixa dos corpos. Família sem corpos: resultado IDÊNTICO ao de hoje (teste com várias famílias da biblioteca).
2. Em `resolver.ts` chame `resolverSimbolos` e devolva `simbolos` (lista, vazia se não houver) em `ResolucaoFamilia` (campo opcional, como `corpos`). Erros viram `erros` com `onde = simbolos[id]...`.
3. Testes acrescentados (arquivos novos): componente de corpo cilíndrico tem caixa e pegada corretas (inclinado 90° depois que a matriz do componente é aplicada: use `matrizDoComponente`); família sem corpos inalterada; símbolo resolvido aparece em `simbolos`.

## Aceitação
Snapshot da biblioteca de A7 continua idêntico; os três testes novos verdes.

## Arquivos permitidos
- `packages/engine/src/componentes/instancia.ts`
- `packages/engine/src/componentes/resolver.ts`
- `packages/engine/src/componentes/pecas.ts` (só o tipo)
- `packages/engine/src/componentes/instanciaCorpos.test.ts` (NOVO)

## Proibido
Tudo fora da lista; `crates/**`; testes existentes (só acrescentar); `docs/**`. Não chame ferramentas fora do necessário à ficha (nada de criar sessões nem agendar tarefas).

## Parada
Contrato contraditório ou necessidade de mexer fora da lista: PARE e relate.

## Entrega
Commits pequenos em português e o relatório de `REGRAS.md` §7.
