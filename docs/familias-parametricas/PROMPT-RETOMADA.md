# Prompt para outro agente continuar o trabalho

Cole o bloco abaixo numa sessão nova (outra conta ou outra máquina) e preencha a linha "Tarefa desta sessão".

```
Você vai continuar o desenvolvimento do "criador de famílias paramétricas" do Hestia (BIM em TypeScript/React, kernel em Rust/WASM). O trabalho está no repositório GitHub engdennylsonsantos-cloud/hestia, na branch claude/lucid-euler-ddb7j6. Tudo o que foi feito até agora e o que falta está documentado nessa branch; não dependa de nada que não esteja no repositório.

1) Antes de qualquer coisa:
   git fetch origin claude/lucid-euler-ddb7j6 && git checkout claude/lucid-euler-ddb7j6
   npm ci --ignore-scripts      (Node 22; não precisa de cargo)

2) Leia, nesta ordem (tudo em docs/):
   - docs/familias-parametricas/RETOMADA-LOCAL.md   (como rodar, verificar, armadilhas já encontradas)
   - docs/decisoes/0061-criador-de-familias-parametricas.md
   - docs/familias-parametricas/ESTADO.md           (o que foi feito ficha a ficha + registro de decisões; leia inteiro)
   - docs/familias-parametricas/PLANO-FASE-2.md     (o que vem agora; já aprovado pelo dono, ainda NÃO iniciado)
   - docs/familias-parametricas/CONTRATO.md e MANUAL.md
   - docs/familias-parametricas/REGRAS.md           (regras de código)

3) Estado em uma frase: a fase 1 (corpos paramétricos, ligações MEP, símbolos 2D, detalhes, ferramenta Tubo, biblioteca de esgoto/água fria/caixas/fossas/elétrica/luminárias/perfis/HVAC, IFC, quantitativos, editor, roteiros de navegador) está integrada e verde; a fase 2 está só planejada.

4) Tarefa desta sessão: <PREENCHA, por exemplo: "executar N1 (medir o desempenho do pan/zoom com um projeto de ~200 trechos) e escrever as fichas N2..N5 conforme a medição">

5) Regras:
   - Não comece itens da fase 2 que o dono não pediu nesta sessão. A ordem sugerida está no fim do PLANO-FASE-2.md.
   - Antes de mexer, rode a verificação do item 3 do RETOMADA-LOCAL.md para ter a linha de base (a suíte completa NÃO tem resultado registrado: rode-a uma vez).
   - Cada item: crie a ficha (modelo em docs/familias-parametricas/fichas/), implemente, rode tsc + testes da área + check-boundaries/units/parity, atualize ESTADO.md (estado, commit, decisões) e faça commit + push na branch (ou numa branch nova criada a partir dela, se o dono preferir). Não abra pull request sem o dono pedir.
   - Não escreva de memória valores de norma ou de catálogo de fabricante (espessuras, bolsas, bitolas): use dado editável marcado CONFERIR e diga no relatório. Nenhuma família pode afirmar que atende à norma.
   - Não altere testes existentes para "fazer passar": se um teste ficou obsoleto por decisão, explique e registre no ESTADO.md.
   - Respeite as armadilhas do RETOMADA-LOCAL.md §5 (junções de index.ts, i18n em sete línguas, testes-guarda, subida de esquema, IFC legado).
   - Relate com honestidade o que NÃO foi verificado.
```
