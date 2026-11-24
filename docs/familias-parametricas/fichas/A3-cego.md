# Ficha A3-cego — Teste cego dos perfis

Modelo: **Haiku 5.5** · Onda 1 · Depende de: A3 não precisa estar pronta (rodar depois contra ela) · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` (protocolo e portão) e `docs/familias-parametricas/CONTRATO.md` (semântica e números de aceitação). Vale o CONTRATO se algo aqui divergir dele.

## Contexto
Você NÃO pode ler `corposPerfil.ts` nem qualquer implementação de perfil. Só `docs/familias-parametricas/CONTRATO.md` §2.2 e `packages/engine/src/componentes/corposTipos.ts`.

## Faça
1. Escreva `corposPerfil.cego.test.ts` que importa `resolverPerfil` de `./corposPerfil.ts` (assinatura: `resolverPerfil(perfil, avaliar)` com `avaliar = (e) => Number(e)`) e verifica só pelo contrato: áreas exatas (N5, N6, L, T, U), orientação, quantidade de pontos do círculo com `segmentos` dado, simetria, perfil inválido devolve `ok: false`.
2. Casos que a especificação deixa ambíguos: escreva-os com `it.skip` e um comentário `AMBIGUIDADE:` descrevendo a dúvida.

## Aceitação
Arquivo escrito; o orquestrador roda contra a implementação do A3 e arbitra as ambiguidades.

## Arquivos permitidos
- `packages/engine/src/componentes/corposPerfil.cego.test.ts` (NOVO)

## Proibido
Qualquer arquivo fora da lista (os pontos de junção `index.ts`, `edicao.ts`, `validar.ts`, `i18n/areas/familias.ts` só aceitam linhas ADITIVAS), `crates/**` (salvo H3), `@hestia/geom`, `package.json`, testes existentes (só acrescentar), `docs/**` (salvo se listado).

## Parada
Contrato contraditório, teste que você acha errado, ou necessidade de mexer fora da lista: PARE, não improvise, e descreva no relatório.

## Entrega
Commits pequenos em português (`feat(familias): …`, `wip:` a cada marco) e o relatório de `REGRAS.md` §7 (última linha de cada comando de verificação).
