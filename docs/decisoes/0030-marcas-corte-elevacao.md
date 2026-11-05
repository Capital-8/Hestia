# 0030 · Marcas de corte e elevação como anotações de primeira classe

Origem: pedido do dono (2026-10-23) para a marca de corte/elevação deixar de ser um desenho derivado do nome e passar a
ter identidade, propriedades, seleção, edição, prancha e exportação próprias. A opção escolhida foi a **A**: estender
`SectionView` em vez de criar um elemento separado.

## 1. Identidade sem migração

`SectionView` ganhou campos **opcionais**:

- `number`: identificação curta da marca (ex.: `A`);
- `title`: título completo para a prancha;
- `label`: texto da marca em planta;
- `mark`: aparência da marca;
- `refs`: extremidades presas a paredes;
- `role`: papel de uma elevação gerada automaticamente (`north`, `south`, `east`, `west`).

Nada disso exige `SCHEMA_VERSION` novo: arquivos antigos continuam válidos e usam os padrões do Hestia. O texto da
marca segue `label` → `number` → `name`; o título da prancha segue `title` → `name`.

As elevações automáticas usam `role` como identidade estável. Renomear “Norte” não cria outra elevação; vistas antigas
sem `role` ainda são encontradas pelo nome e recebem o papel na primeira geração.

## 2. Validação e comandos

`sectionViewIssue` recusa nome vazio, nome repetido, linha sem dois pontos distintos, profundidade inválida e estilo de
marca fora dos limites. `addView`, `updateView` e `deleteView` passam por essa validação; excluir uma vista também
remove, no mesmo passo de desfazer, os viewports da prancha que a mostravam. `validateProject` reporta vista inválida,
id/nome duplicado, referência de parede que sumiu (aviso) e viewport órfão.

## 3. Marca em papel

A geometria da marca é calculada em **mm de papel** (`sectionMarkGeometry`): seta padrão de 3 mm, texto de 2,5 mm,
traço-ponto `[4, 1, 0,3, 1]` mm e deslocamento do rótulo `{x: 0, y: 0}` mm. Por isso a marca tem o mesmo tamanho
relativo na tela, na prancha e no DXF. O corte usa traço-ponto; a elevação usa linha contínua. Visibilidade, cor e peso
seguem a categoria `annotation`.

Cada ponta ganha uma **bolha** (círculo) centrada na própria ponta da linha, seguindo a convenção usual de marca de
corte/elevação: a linha de corte passa pelo centro da bolha e a divide ao meio (o traço da marca começa na borda dela).
A bandeira de direção é um triângulo de 90° cuja **base é o diâmetro da bolha** (sobra para fora dos dois lados) e cujos
outros dois lados **tangenciam o círculo** e se encontram no vértice, do lado de visão; só o que fica fora do círculo é
preenchido (duas asas e a ponta). O raio mínimo acompanha a altura do texto (`textMm + 4,5 mm`) e cresce para caber os
dois textos: o número do corte em cima e o número da prancha onde ele está publicado embaixo (`-` quando a vista ainda
não está em nenhuma prancha, via `sectionSheetNumberOf`). `labelOffsetMm.y` (padrão 0) afasta a bolha da linha;
`labelOffsetMm.x` não tem mais efeito nesse desenho.

## 4. Seleção, propriedades e transformações

A marca pode ser clicada (linha, setas e rótulo) e entra na seleção por janela. O painel de propriedades edita
identidade, geometria, aparência e associação; a prancha também edita o título do viewport. Mover, copiar, girar,
espelhar e matriz incluem as vistas. Copiar cria id e nome novos, limpa `refs` e `role`; qualquer transformação solta as
referências de parede, porque a posição passa a ser livre. A ferramenta de corte associa automaticamente as extremidades
a paredes próximas.

## 5. Prancha e DXF

A legenda e o título da vista na prancha usam `title`/`name`; o PDF vetorial já desenha a planta com as marcas. O DXF
exporta hastes, setas e rótulos nas camadas `CORTES` e `ELEVACOES`, com a mesma geometria de papel.

## 6. Testes

Cobrem identidade e validação, referências que somem, geometria em papel, seleção por clique/janela, cópia e
transformação, cascata de viewport, DXF e o papel estável das elevações.
