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
9. **Tom predefinido.** Toda categoria tem `tomPredefinidoDaCategoria` (tabela §4.2 ou fallback das disciplinas criadas); categoria de origem `geral` fica sempre `normal`. Uma categoria nova sem predefinição quebra o teste de completude.
10. **IFC importado.** Se o elemento entra como `Generic` com `sourceClass`, mapeie a classe em `IFC_CLASS_DISCIPLINE` (ou documente `geral`) e cubra a categoria em `categoriaDoElemento`.
11. **Disciplina do usuário.** Tudo o que aponta para uma disciplina (planta, `Level.discipline`, `View3DSettings.discipline`, perfil, origem de categoria e família) precisa voltar para Arquitetura quando ela for excluída, num passo de desfazer.
12. **Compatibilidade.** Todo campo novo é opcional; arquivo antigo abre com o predefinido e o esquema sobe com migração identidade quando o significado muda.
