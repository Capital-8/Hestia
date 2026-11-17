---
trigger: always_on
---

# Contrato Obrigatório de Cidadania de Elementos BIM (Regras 1–12)

Sempre que criar um novo tipo de elemento (`Element['kind']`), família paramétrica ou ferramenta de modelagem/edição no Hestia, cumpra e verifique todas as 12 regras documentadas em `docs/contratos/familias-e-ferramentas.md`:

1. **Núcleo comum de desenho (`desenhoPolilinha.ts` / `perimeterTool.ts`)**: ferramentas lineares ou por polilinha/contorno estendem o núcleo comum (snaps, Orto/Polar, rastreios, comprimento digitado, cota dinâmica) em vez de duplicar lógica.
2. **Painel de propriedades (`*Properties.tsx`)**: abre sempre com `TypeSelector` + botão "Editar tipo" (`onEdit`).
3. **Modificação universal (`contratoModificacao.test.ts`)**: mover, copiar, girar, espelhar, matriz, alinhar, deslocar, aparar/estender, dividir, apagar, copiar/colar entre níveis, corte/elevação e extensão do modelo (`extensaoDoModelo.ts`).
4. **Modal de tipo (`FamilyTypeDialog` / `familia/`)**: usa o esqueleto comum de grade `--fam-l` / `--fam-l2` / `NumField`.
5. **Sem lixo de build ou temporários**: artefatos/targets fora do worktree (`tests/contratoLixo.test.ts`).
6. **Snaps e apoio de cota associativa (`contratoSnaps.test.ts`)**: `infer` + chaves estáveis em `apoioDeSnap` / `dimensionRefs`.
7. **Seleção e visibilidade multi-vista (Planta, Corte/Elevação e 3D)**: suporte em `selectedTypeId`, `idsOfType(p, levelId | null, typeId)`, `categoriaDoElemento` (`viewVisibility.ts`), `OWNER_FIELDS` (`section/pick.ts`), `PASTE_ORDER`/`Counts` (`transfer.ts`), `TIPOS_COM_FERRAMENTA` (`contextMenu.ts`) e `"Selecionar todas as instâncias → Visíveis na vista"` disponível em `plan`, `section` e `3d`.
8. **Cotas temporárias (`TempDim`) e editáveis ao selecionar**: `DimProvider` registrado em `packages/tools/src/dims/registry.ts` medindo vizinhos e eixos (`Grid`), editável via `driven.ts` e exposto em `elementRing` (`dimensionRefs.ts`).
9. **Alinhar (`AL`) seguro e finito**: seleção de feições por distância a segmento finito (`segmentDistance`), bloqueio de auto-referência (`t.ownerId === ref.ownerId`) em `alignTool.ts`, suporte a pontas móveis (`pontaParede`, `pontaViga`) e propagação de vínculos no modelo (`structuralCommands.ts`).
10. **Galeria de formas compartilhada (`.pm-galbox`)**: ferramentas com modos de traçado geométrico (linha, arco, retângulo...) reutilizam `DrawGalleryPanel.tsx` / `PerimeterRibbonPanels.tsx` na aba contextual.
11. **Navegador de Projeto completo (`<TypeRow />`)**: famílias listadas em `Families.tsx` usam `<TypeRow />` e `typeActions.ts` (Usar para desenhar, Selecionar todas as instâncias, Onde é usado, Substituir tipo, Duplicar, Renomear, Excluir).
12. **Fidelidade de perfil em 3D, Corte/Elevação, Planta e IFC**: seções `i-section`, `t-section` etc. usam o anel/partes reais em `structuralSolids.ts` (3D), `sectionStructural.ts` (`unionClipper` + projeções `beyond`), `plan/structural.ts` (linhas internas tracejadas em detalhe médio/alto) e `ifcStructural.ts` (IFC).

**Testes-guarda obrigatórios:** `contratoFerramentas.test.ts`, `contratoModificacao.test.ts`, `contratoSnaps.test.ts`, `contratoPaineisFamilia.test.ts`, `contratoModaisFamilia.test.ts`, `contratoCidadaniaBim.test.ts`.
