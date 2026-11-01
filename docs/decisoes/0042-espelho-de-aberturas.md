# Decisão 0042 — Espelho de aberturas hospedadas

Decidido em 2026-10-31. Fecha o caso de espelhar uma parede com portas e janelas hospedadas: a abertura deixa de
reinterpretar os flips por conta própria e passa a acompanhar a geometria refletida da parede. Complementa a
[0011](0011-escadas.md) na convenção de orientação local e a [0041](0041-escadas-e-rampas-por-nivel.md) no padrão de
documentar o antes/depois de uma transformação. Fontes: `packages/model/src/commands.ts` (`applyTransformCmd`,
`transformEach`), `packages/tools/src/edit.ts`, `packages/tools/src/transformTools.ts` e os exportadores IFC
(`packages/io`).

## 1 — Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **Espelhar a parede inverte `flipFacing` das aberturas hospedadas** — tanto no espelho in-place quanto no espelho com cópia — e **preserva `flipHand`**. `offset`, peitoril, altura e marca ficam intactos; `hostId` só muda na cópia (passa a apontar para a parede nova) | O espelho é uma reflexão da parede: a abertura é parte do conjunto e tem de sair refletida com ela, sem reinterpretação. `flipHand` é a mão da folha relativa ao eixo `a→b`; a reflexão preserva essa relação, então a mão não muda. `flipFacing` é o lado da face (normal local) e é justamente o que o espelho inverte: sem a inversão, a folha cai na face oposta |
| 2 | **O invariante de aceite é `flipHand' = flipHand` e `flipFacing' = !flipFacing`**, com centro, dobradiça e lado da folha refletidos em relação ao eixo do espelho | É a definição geométrica de imagem especular aplicada à abertura: o que estava à esquerda do eixo vai para a direita, e a face da parede em que a folha abre troca. Qualquer outra combinação produz uma abertura que não é o reflexo da original |
| 3 | **A regra vale igual para in-place e para cópia.** No in-place, `hostId` continua o mesmo; na cópia, o `hostId` é remapeado para a parede copiada e só isso muda além dos flips | Um único caminho de código (`applyTransformCmd`) evita que os dois modos divirjam — foi a divergência que produziu o defeito |
| 4 | **A abertura não é espelhada isoladamente nesta decisão.** A ferramenta de espelho sobre uma abertura sozinha continua encerrando sem mensagem | O espelho de abertura isolada depende de decidir o que fazer com o vínculo à parede (mover o `offset`? desvincular?), o que é um contrato próprio. Misturar os dois casos esconderia a regra da parede |
| 5 | **A pré-visualização das aberturas é regra própria**, na função `ghostOpenings` (não dentro de `ghostBands`) | O fantasma da prévia é desenho, não modelo; e `ghostBands` alimenta a âncora do colar (`pasteTool`), então misturar as duas coisas moveria a âncora. Separado, a prévia lê a mesma regra sem acoplar |
| 6 | **A cópia passa a ter a mesma operação IFC da original.** `IfcDoor`/`IfcWindow` só exportam `flipHand` como operação; como `flipHand` é preservado, original e cópia exportam a mesma operação, agora coerente com a geometria refletida | Antes, a cópia ganhava um flip extra de mão (`flipHand` invertido), deixando de ser imagem especular e exportando uma operação que não correspondia ao desenho |
| 7 | **Tudo o que é derivado da folha segue a folha:** a tabela de portas e janelas (o texto de sentido muda por instância), o alizar/peitoril (`sides: 'swing'` ou `'opposite'`) e os retornos do vão, e os cortes/elevações (tracejado/contínuo) | São leituras de `flipHand`/`flipFacing`; corrigido o modelo, elas acompanham sem regra nova. Se ficassem com o valor antigo, apontariam para o lado errado da parede refletida |

## 2 — Consequências

- **Parede espelhada com abertura:** centro, dobradiça e lado da folha saem refletidos; `flipHand` não muda;
  `flipFacing` inverte; `offset`, peitoril, altura e marca permanecem. Porta que abria para fora continua abrindo
  para fora depois do espelho.
- **Cópia:** a abertura copiada aponta para a parede copiada (`hostId` novo) e é o reflexo exato da original. Deixa
  de ganhar o flip extra de mão que a tornava uma "quase-cópia".
- **IFC (`IfcDoor`/`IfcWindow`):** a única operação exportada é `flipHand`; como ele é preservado, a cópia exporta a
  mesma operação da original — agora coerente com a geometria, em vez de contradizê-la.
- **Tabela de portas e janelas:** o texto de sentido (`flipHand`/`flipFacing`) muda com a instância; original e cópia
  aparecem com sentidos coerentes com o desenho.
- **Alizar/peitoril e retornos do vão:** `sides: 'swing' | 'opposite'` seguem a folha; o alizar acompanha o lado em
  que a porta abre, agora refletido.
- **Cortes e elevações:** o tracejado/contínuo segue a folha; a abertura refletida aparece com o mesmo tipo de linha
  que teria na parede original.
- **Nada muda** para aberturas em paredes não espelhadas, nem para `offset`/peitoril/altura em nenhum caso.

## 3 — Arquivos

- `packages/model/src/commands.ts` — `applyTransformCmd`: a regra de flips das aberturas hospedadas (in-place e
  cópia) mora aqui, junto do remapeamento de `hostId`.
- `packages/model/src/mirrorHosted.test.ts` — espelho in-place e com cópia: `flipHand` preservado, `flipFacing`
  invertido, `offset`/peitoril/altura/marca intactos, `hostId` só na cópia.
- `packages/tools/src/mirrorOpenings.test.ts` — ferramenta de espelho: invariante `flipHand' = flipHand` e
  `flipFacing' = !flipFacing`, com centro e dobradiça refletidos, in-place e com cópia.
- `packages/tools/src/ghostOpenings.test.ts` — prévia das aberturas (item separado): fantasmas refletidos.
- `packages/tools/src/edit.ts` e `packages/tools/src/transformTools.ts` — fantasmas da prévia que leem a orientação
  da abertura durante o espelho.
