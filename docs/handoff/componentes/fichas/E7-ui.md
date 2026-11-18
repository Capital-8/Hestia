# Ficha E7-ui — Novo módulo pela biblioteca de verdade, abrir e salvar famílias, meus modelos

Base: branch `feat/familias-interface` (biblioteca com 30 famílias integrada).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A galeria "Novo módulo" (`FamiliaNovo.tsx` + `FamiliaModelos.tsx`) ainda mostra 21 desenhos de mentira sem ação, e "Abrir e salvar" (`FamiliaArquivo.tsx`) é uma casca. Agora existe a biblioteca base real em `@hestia/model`: `BIBLIOTECA_BASE` (30 famílias `Familia`), `familiaDaBiblioteca(id)`, e o arquivo `hestia-familia` (`exportarFamilias`, `serializar`, `lerArquivo`, `importarFamilias`). O store (`familiaStore.ts`) tem `novaFamilia(f)` (troca o documento e zera histórico, flex e seleção), `dialogo` e `set`. Leia antes: `FamiliaNovo.tsx`, `FamiliaModelos.tsx`, `FamiliaArquivo.tsx`, `FamiliaJanela.tsx`, `familiaStore.ts`, `familia.css`, `packages/model/src/familia/biblioteca/index.ts`, `arquivo.ts` e `packages/model/src/familia/tipos.ts` (campo `categoria`).

## Faça
1. **`FamiliaNovo.tsx`** (reescreva): diálogo largo. À esquerda uma árvore de categorias (`marcenaria`, `mobiliario`, `loucas`, `equipamento`, `generico`, mais "Meus modelos"; cada uma com a contagem; "Todas" no topo; use os rótulos em português Marcenaria, Mobiliário, Louças e metais, Equipamentos, Genéricos). No topo da área principal um campo de busca (filtra por nome e descrição, sem acento e sem diferenciar maiúscula). A galeria mostra um cartão por família com: miniatura em SVG da vista de frente, nome, descrição curta, e uma etiqueta "N tipos". Clicar num cartão seleciona; o botão "Criar" (e duplo clique) chama `novaFamilia` com uma CÓPIA PROFUNDA da família, nome `<nome> (nova)` e id único `fam_usuario_<n>` (n = primeiro livre entre as famílias que o usuário já abriu nesta sessão; guarde o contador em módulo), fecha o diálogo e deixa a primeira peça selecionada. Os aninhados da família copiada continuam apontando para `fam_gaveta` e `fam_armario_baixo` (a biblioteca base vale sempre como `biblioteca`); se ainda não houver um jeito disso no editor, relate no fim.
2. **Miniatura**: função pura em `familiaMiniatura.ts` (NOVO): `miniaturaDaFamilia(familia, largura = 150, altura = 78)` devolve `{ retangulos: Array<{ x, y, w, h, papel, vazio }>, largura, altura }` com a vista de FRENTE (X horizontal, Z vertical, em unidades do SVG, escala uniforme para caber com margem de 6, centrada), calculada com `resolverFamilia(familia, { biblioteca })` do tipo padrão, na ordem de desenho: peças mais ao fundo (maior `origem[1]`) primeiro. Peças vazias entram com `vazio: true`. Família que não resolve: retângulo único cinza. O componente do cartão só desenha os retângulos (cores das variáveis `--fam-corpo`, `--fam-porta`, `--fam-tampo`, `--fam-fundo`). Cache por id da família.
3. **`FamiliaArquivo.tsx`** (reescreva): diálogo com dois blocos. "Abrir": campo de arquivo (`.json`); lê com `lerArquivo(texto)` (erro vira mensagem vermelha `role="alert"`); lista as famílias encontradas (nome, nº de peças, nº de tipos) com botão "Abrir" por família (`novaFamilia`) e, se houver, a lista de `ignoradas` com o motivo. "Salvar": mostra o nome da família corrente e botões "Baixar arquivo" (`<id>.hestia-familia.json` com `serializar(exportarFamilias([familia]))`) e "Guardar em Meus modelos" (grava em `localStorage`, ver item 4).
4. **Meus modelos**: lógica pura em `meusModelos.ts` (NOVO), com testes em `meusModelos.test.ts` (NOVO): `lerMeusModelos(storage)`, `guardarModelo(storage, familia)` (substitui a de mesmo id; limite de 100 famílias, a mais antiga sai), `removerModelo(storage, id)`; o armazenamento é um objeto com `getItem` e `setItem` (injetado nos testes; no app use `window.localStorage` dentro de try/catch, chave `hestia.familia.meus`); dados corrompidos viram lista vazia sem lançar; cada item passa por `importarFamilias` ao ler (família inválida é descartada). A categoria "Meus modelos" da galeria lê esta lista e cada cartão tem um "×" que remove (com confirmação inline).
5. Apague `FamiliaModelos.tsx` e o que só ela usava se nada mais importar (confira com busca).
6. Testes de lógica pura (NOVOS) em `familiaMiniatura.test.ts` (retângulos dentro da caixa, ordem de desenho, escala uniforme, vazia, família quebrada) e `familiaNovo.test.ts` para `filtrarFamilias(lista, categoria, busca)` e `proximoIdDeUsuario(existentes)` (funções puras que você extrai).
7. Textos em português; medidas formatadas precisam de `// units-ok: <motivo>`; estilos em NOVO `familiaNovo.css`; nenhum arquivo passa de 420 linhas (divida em `FamiliaNovoCartao.tsx`, `FamiliaArquivoAbrir.tsx`…).

## Arquivos permitidos
`apps/web/src/ui/familia/FamiliaNovo.tsx`, `FamiliaArquivo.tsx`, `FamiliaModelos.tsx` (para apagar) e novos `apps/web/src/ui/familia/FamiliaNovo*.tsx`, `FamiliaArquivo*.tsx`, `familiaNovo*.ts`, `familiaNovo*.test.ts`, `familiaNovo*.css`, `familiaMiniatura*.ts`, `familiaMiniatura*.test.ts`, `meusModelos*.ts`, `meusModelos*.test.ts`.

## Proibido
Os demais arquivos de `apps/web/src/ui/familia/` (outras fichas trabalham neles: `FamiliaLista*.tsx`, `FamiliaCatalogo*.tsx`, `FamiliaUsinagem*.tsx`, `FamiliaFabricacao.tsx`, `FamiliaOpcoes.tsx`, `familiaStore.ts`, `familia.css`), `packages/**`, `crates/**`, `docs/**`.

## Aceite (o orquestrador roda)
`tsc`, `eslint --max-warnings 0` nos arquivos, `npx vitest run apps/web/src/ui/familia`, `node scripts/check-units.mjs`, `check-boundaries`; depois o orquestrador abre o editor, o diálogo Novo, e confere: as 30 famílias aparecem com miniatura, busca filtra, "Criar" abre a cômoda (ou outra) no editor com 3D e lista de peças; salvar em arquivo e abrir de volta; guardar em Meus modelos e vê-lo na galeria.

## Critério de parada
Se faltar algo em `@hestia/model` ou `@hestia/engine`, PARE e relate qual; não altere `packages/`.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
