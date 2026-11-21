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
