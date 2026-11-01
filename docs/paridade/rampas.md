# Paridade · Rampas

Legenda: `[x]` feito e testado · `[ ]` pendente · `[-]` fora de escopo, com o motivo na própria linha.
Checklist complementar da decisão [0041](../decisoes/0041-escadas-e-rampas-por-nivel.md); as rampas não têm elemento
próprio em `docs/paridade/ORDEM.json`, então este arquivo não entra no portão de paridade. O restante da paridade de
rampas (formas, norma, representação) continua descrito em [docs/07-STATUS-V1](../07-STATUS-V1.md).

## A · Níveis e desnível (decisão 0041)
- [x] A1 Nível de topo guardado por id estável na criação (`opts.topLevelId ?? levelAbove(...)`) e fixado antes de mexer na estrutura de níveis; editar ou inserir nível não troca o topo automático da rampa
- [x] A2 Editar a cota de um nível reajusta as rampas afetadas na mesma transação (um Ctrl+Z) e informa na barra de status ("reajustada(s) à nova altura" / "sem altura válida" / "não pôde ser regenerada")
- [x] A3 Modo `slope`: mudar o nível (ou o desnível pelos deslocamentos) regenera o comprimento para manter a inclinação alvo (`regenRamp`)
- [x] A4 Modo `length`: o comprimento desenhado é mantido e a inclinação resultante muda; a resolução emite o aviso `ramp-slope-differs` com o valor alvo e o resultante
- [x] A5 Rampa inválida (topo não acima da base, `ramp-top-not-above`) continua no projeto e visível, com o aviso no painel; nada é apagado pela edição de nível
