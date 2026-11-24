# Ficha F1b — Famílias MEP disponíveis no app (biblioteca, paleta e ferramenta Tubo)

Modelo: **Haiku 5.5** · Onda 6 · Depende de: F1, C5, C6 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` e `CONTRATO.md` (§6). Vale o CONTRATO se algo aqui divergir.

## Contexto
A F1 criou as famílias de esgoto (`TUBULACAO_ESGOTO`, ids `fam_tubo_esgoto`, `fam_esgoto_*`) mas as deixou FORA de `BIBLIOTECA_BASE` porque o teste de conectores de móveis (`conectores.test.ts`) e o snapshot de A7 exigem que toda família da base seja de móvel. A ferramenta Tubo (C5/C6) procura a família no projeto (`project.componentFamilies`) e, sem ela, avisa. Falta o usuário poder escolher essas famílias e a ferramenta carregá-las sozinha.

## Faça
1. Em `biblioteca/index.ts`: crie `BIBLIOTECA_MEP: readonly Familia[] = [...TUBULACAO_ESGOTO]` (separada de `BIBLIOTECA_BASE`; não altere BIBLIOTECA_BASE nem os testes de conectores) e faça `familiaDaBiblioteca(id)` procurar nas duas listas. Teste novo: todas as famílias MEP validam (`validarFamilia` sem erro) e resolvem sem erros no motor para todos os tipos.
2. Na paleta/galeria que lista famílias para carregar no projeto (`apps/web/src/ui/paletaMoveis.ts`, `FamiliaNovo.tsx`, `carregarNoProjeto.ts`): inclua as famílias MEP, agrupadas por disciplina (use `DISCIPLINA_DA_CATEGORIA` de `categorias.ts`), sem alterar a ordem nem o conteúdo atual dos móveis (os testes existentes devem continuar verdes; se algum teste de contagem quebrar, relate em vez de alterá-lo).
3. Na ferramenta Tubo (`packages/tools/src/tuboTool.ts`): quando a família escolhida (ou a padrão do domínio) não está no projeto mas existe em `familiaDaBiblioteca`, carregue-a no projeto na MESMA transação do primeiro trecho (comando `upsertFamily` já existente; as conexões do domínio — `CONEXOES_POR_DOMINIO` — também). `FAMILIA_TUBO_PADRAO` passa a ser `fam_tubo_esgoto`. Testes acrescentados em `tuboTool.test.ts`.


## Aceitação
Desenhar um trecho num projeto vazio cria o tubo real (`fam_tubo_esgoto`) e as conexões ficam disponíveis; testes de móveis inalterados e verdes.

## Arquivos permitidos
- `packages/model/src/familia/biblioteca/index.ts`
- `packages/model/src/familia/biblioteca/bibliotecaMep.test.ts (NOVO)`
- `apps/web/src/ui/paletaMoveis.ts`
- `apps/web/src/ui/familia/FamiliaNovo.tsx`
- `apps/web/src/ui/familia/carregarNoProjeto.ts`
- `apps/web/src/ui/familia/familiaNovo.ts`
- `packages/tools/src/tuboTool.ts`
- `packages/tools/src/tuboTool.test.ts (só ACRESCENTAR)`

## Proibido
Tudo fora da lista; `crates/**`; testes existentes (só acrescentar); `docs/**`. Não chame ferramentas fora da ficha (nada de criar sessões, listar ou agendar tarefas, interromper sessões).

## Parada
Contrato contraditório ou necessidade de mexer fora da lista: PARE e relate.

## Entrega
Commits pequenos em português e o relatório de `REGRAS.md` §7.
