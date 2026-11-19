# Ficha F3-biblioteca — paleta de móveis para arrastar e soltar na planta e no 3D

Base: `feat/familias-interface` (com F3-arrasto3d, CONJ-ui e CONECT-biblioteca integrados).   Nível 3

## Contexto
Hoje o usuário escolhe a família na barra de opções da ferramenta Componente e clica. O Promob tem uma paleta de módulos: o usuário arrasta o móvel da paleta para dentro da cena. Esta ficha cria a paleta e o "soltar" na planta e no 3D. Reaproveite o que existe: miniaturas e filtros da galeria (`apps/web/src/ui/familia/familiaMiniatura.ts`, `FamiliaNovoCartao.tsx`, `familiaNovo.ts`: `CATEGORIAS`, `filtrarFamilias`, `normalizarTexto`), carregar a família no projeto com as dependências (`aplicarEscolhaDeFamilia` em `ui/ComponentOptionsBar.tsx` e `faltantes` em `ui/familia/carregarNoProjeto.ts`), o encaixe do arrasto (`posarArrastado`, `corposDoNivel`, `facesDasParedes`, `caixaLocalDoComponente` de `@hestia/engine`), o plano horizontal do 3D (`apps/web/src/ui/viewport/planoHorizontal.ts`) e a conversão de pontos da planta (`screenToWorld` de `@hestia/render`, usado em `ViewportCanvas.tsx`). Leia também `ui/ribbon/{actions,model,tabsMain}.ts` e `ui/ViewportCanvas.tsx` (onde o canvas recebe eventos).

## Faça
1. **Paleta** (`apps/web/src/ui/PaletaMoveis.tsx` NOVO + `paletaMoveis.css`): janela flutuante (ou painel recolhível ancorado à esquerda do canvas, o que for mais simples de montar sem mexer no layout existente: prefira janela flutuante com `position: fixed` arrastável pelo título) aberta por um botão do ribbon "Biblioteca" (ação nova `componentLibrary` em `ribbon/{actions,model,tabsMain}.ts`, ao lado de Componente). Conteúdo: busca por nome, abas de categoria (as de `CATEGORIAS`), grade de cartões com a miniatura e o nome de cada família da biblioteca base e das do projeto (do projeto marcadas). Cada cartão é `draggable` e leva no `dataTransfer` (tipo `application/x-hestia-familia`) o id da família; um CLIQUE no cartão faz o mesmo que escolher a família na ferramenta Componente e ativa a ferramenta (colocar por clique continua funcionando).
2. **Soltar no canvas** (lógica pura em `apps/web/src/editor/soltarFamilia.ts` NOVO, ligação mínima em `ViewportCanvas.tsx` com `onDragOver` (aceita o tipo acima e mostra o cursor `copy`) e `onDrop`): converte o ponto do mouse em ponto do mundo (planta: `screenToWorld`; 3D: `pontoNoPlanoHorizontal` no plano z = elevação do nível; sem ponto, ignora), carrega a família no projeto se faltar (com as dependências, num passo só), cria o componente (id novo, nível atual, tipo padrão da família, `rotation` 0) no ponto e aplica `posarArrastado` (parede e vizinho) para a pose final; `addComponent` + seleção do novo componente numa transação (um passo de desfazer). Se o nível ativo não existe ou a família é inválida, mostra a mensagem na barra de status e não cria nada. Soltar sobre o painel (fora do canvas) não faz nada.
3. **Testes** (`soltarFamilia.test.ts` NOVO): ponto no vazio cria o componente na posição; ponto perto de parede encaixa (use faces simuladas pela função injetável `deps`, como em `arrasto3d.ts`); família da biblioteca com dependência (`fam_comoda`) carrega a `fam_gaveta`; nível inexistente não cria; desfazer remove componente e famílias carregadas num passo. Teste da lógica de filtro da paleta (função pura em `paletaMoveis.ts`): categoria, busca sem acento, famílias do projeto marcadas.
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run apps/web` sem regressão. Nada acima de 420 linhas nos arquivos novos (o `ViewportCanvas.tsx` não pode crescer mais que ~15 linhas); textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/{PaletaMoveis.tsx, paletaMoveis.ts, paletaMoveis.test.ts, paletaMoveis.css}` (NOVOS), `apps/web/src/editor/{soltarFamilia.ts, soltarFamilia.test.ts}` (NOVOS), `apps/web/src/ui/ViewportCanvas.tsx` (mínimo), `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}`, `apps/web/src/App.tsx` (uma linha para montar a paleta, se for o padrão das janelas).

## Proibido
`packages/**`, `crates/**`, `docs/**`, `ui/familia/**` (só leitura; reutilize exportando de lá o que precisar SEM editar: se algo não estiver exportado, copie a lógica mínima), testes existentes, snapshots.

## Critério de parada
Se `ViewportCanvas.tsx` não aceitar os eventos de arrastar e soltar sem mudar o comportamento atual do mouse: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
