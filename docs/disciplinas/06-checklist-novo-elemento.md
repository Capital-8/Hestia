# Checklist: incluir um elemento ou categoria novos no Hestia

Todo tipo de elemento, categoria gráfica ou família nova **entra numa disciplina** e **nunca quebra arquivo antigo**. Marque cada item no PR.

1. **Disciplina do tipo.** Novo `kind` em `Element`: classifique em `DISCIPLINE_OF_KIND` (`packages/model/src/discipline.ts`). O `tsc` falha enquanto faltar.
2. **Categoria gráfica.** Decida a categoria em `categoriaDoElemento` (`graphics.ts`). Categoria nova: acrescente em `GRAPHICS_CATEGORIES`, rótulos nos sete idiomas e uma entrada em `CATEGORY_REGISTRY` (`registroCategorias.ts`) com a disciplina de origem padrão. O `tsc` falha enquanto faltar.
3. **Estilo padrão sem mudança visual** para arquivos antigos (a categoria nova copia a de origem até o dono configurar).
4. **Família de biblioteca.** Família de instalações (hidrossanitário, elétrico, HVAC ou outra) declara `disciplina`; sem o campo vale Arquitetura. O teste de completude confere que todo valor declarado é válido e que as famílias de `disciplinasExemplo` declaram.
5. **Planta, 3D, corte, prancha e DXF** usam `categoriaDoElemento`; nenhum mapeamento por `kind` fora do modelo.
6. **Matriz de isolamento** (`apps/web/src/editor/isolamentoOcultar.test.ts`): acrescente o kind com o resultado esperado ESCRITO À MÃO. Ocultar a categoria nova não pode ocultar nenhuma outra.
7. **Arquivo antigo.** Campos novos opcionais; leitura com fallback; um teste abrindo um arquivo sem o campo.
8. **Configurador.** A categoria nova aparece sozinha; confira no app que aparece com o tom predefinido certo.

## Itens do Adendo 3 (perfis por disciplina, 2026-11-21)

9. **Registro e agrupamento obrigatórios.** Toda categoria nova entra em `CATEGORY_REGISTRY` (`packages/model/src/registroCategorias.ts`) e, por ele, em `categoriasPorDisciplina`: o `tsc` (o `Record<GraphicsCategory, …>` é total) e o teste de completude (`registroCategorias.test.ts`: registro = `GRAPHICS_CATEGORIES` sem faltas nem sobras) obrigam.
10. **Predefinido por disciplina.** Toda categoria tem tom predefinido em toda disciplina de trabalho via `tomPredefinidoDaCategoria` (origem da categoria × `presetTone`); a disciplina `geral` fica **sempre** `normal` — terreno, lote, CAD, genérico sem classe e anotações nunca recebem meio-tom/oculto por disciplina (teste literal em `registroCategorias.test.ts`).
11. **Genérico importado do IFC.** Todo `Generic` que entra por importação precisa de `sourceClass` reconhecida em `IFC_CLASS_DISCIPLINE` / `disciplineDaClasseIfc` (`packages/model/src/discipline.ts`) e da sua categoria coberta em `categoriaDoElemento` — classe nova de instalação sem mapeamento cai em `geral` e deve ser **documentada** como tal (ou ganha linha na tabela com teste em `ifcDisciplina.test.ts`).
12. **Disciplina criada nunca quebra arquivo.** Toda disciplina do usuário (`Project.disciplines`) e todo perfil/remapeamento (`disciplineProfiles`, `categoryDiscipline`, `Level.discipline`, `View3DSettings.discipline`) são **opcionais no arquivo**: ausente = predefinido; dado inválido é ignorado na leitura e preservado ao gravar (`disciplineProfileTolerancia.test.ts`); excluir a disciplina devolve plantas, famílias e vistas à origem (Arquitetura) **num passo de desfazer**; arquivo antigo abre e desenha igual, e o esquema só sobe de versão com migração identidade quando o significado de um campo muda.
