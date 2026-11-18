# Ficha E6-dxf — DXF das peças para a máquina e o marceneiro

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Cada peça precisa sair em DXF com o contorno, os furos (faces a e b), os rasgos e os recortes, em camadas separadas, em milímetros. O Hestia já tem um escritor DXF R2000 que o AutoCAD abre e um verificador estrutural. Leia: `packages/io/src/dxfPecas.ts` (especificação completa em comentário: siga literalmente), `dxfPecas.test.ts` (aceite), `packages/io/src/dxfDoc.ts` (`DxfDoc`, `writeDxf2000`: reaproveite, não escreva outro escritor), `packages/io/src/dxfCheck.ts` (`dxfProblems2000`, o juiz estrutural) e, para o estilo, `packages/io/src/dxfGeneric.ts`.

## Faça
1. Implemente `dxfDasPecas` em `dxfPecas.ts` montando um `DxfDoc` (coordenadas em METROS, `units: 'mm'`) com as camadas e entidades da especificação, e devolvendo `writeDxf2000(doc)`.
2. Use `kind: 'polyline'` com `closed: true` para contornos, furos, rasgos e recortes e `kind: 'text'` (centrado) para o nome. Sem CIRCLE nem ARC (o verificador não os aceita).
3. Furo = polígono regular de `segmentosDoFuro` vértices (mínimo 8), com o primeiro vértice em ângulo 0 (à direita do centro) e sentido anti-horário.
4. Largura da peça na folha: `tamanho[0]`, ou a extensão em u da caixa do contorno quando há contorno (`caixaDoContorno` de `@hestia/engine`).
5. Sem usar `any`; arquivo com no máximo 420 linhas (divida em `dxfPecasGeometria.ts` se precisar).

## Arquivos permitidos
`packages/io/src/dxfPecas.ts` e novos `packages/io/src/dxfPecas*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `dxfPecas.test.ts`, `dxfDoc.ts`, `dxfCheck.ts`, `index.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/io/src/dxfPecas.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
