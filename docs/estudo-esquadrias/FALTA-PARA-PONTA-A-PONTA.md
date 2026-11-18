# O que falta para o vão com contorno ir de ponta a ponta

Data: 2026-11-18. Branch: `claude/lucid-bell-hwk4ln`. [V] = verificado por teste ou leitura; [I] = inferência. Fontes: docs 19 a 27 e `PLANO-ESTADO.md`.

## 1. O que já funciona (verificado com o Rust real, 18 testes e2e wasm)
Forma do vão no tipo (`OpeningType.shape`), furo por booleana 3D em Rust, 3D da parede, planta (hachura e símbolo do vão livre), quantitativo e quadro com área real, avisos de forma inválida e de norma em portas. Vão retangular dá os mesmos números de antes [V].

## 2. Limitações conhecidas (o que NÃO foi verificado ou não funciona)
- **Só parede reta e vertical, sem perfil de topo ou base.** Parede curva, inclinada ou com perfil volta ao furo retangular [V, doc 26]. Aviso `forma-vao-ignorada-na-parede`.
- **Não rodei o app no navegador** nem medi tempo ou CPU do furo no WASM [V].
- **Valores de norma vêm de resumos de busca**, nenhuma norma foi lida na íntegra (docs 16 e 20). 5 mm de soleira, 0,80 × 2,10 m, vidro seguro: conferir na norma vigente.
- **IFC e arco no visualizador:** o perfil em polilinha (cordas de 1 mm) nunca foi aberto em web-ifc nem IfcOpenShell [I].
- **Junção de paredes** com vão perto de canto: o prisma pós-junção é furado (doc 25), mas a paridade foi testada contra o cálculo por faixas, não contra `quantidades_paredes` pela `Cena` completa [V, doc 25 §6].
- **Retorno de acabamento:** não há retorno em canto; o arco abatido também reveste a soleira quando `soleira = 0`; vão que sai só em parte do envelope da camada faz a ABI recusar e a camada volta ao retangular [V, doc 27].
- **Contorno côncavo** é aceito se simples, mas quase não foi testado; limite de 4096 pontos por vão (escolha minha).
- **`furo_quant_parede` está validada em Rust mas o engine não a chama:** a área de face segue `volume / espessura` [V, doc 27].
- **Tamanho do WASM:** 3,70 MB (era 2,58). Teto em `scripts/verificar-wasm.mjs` subido para 4 MB por decisão minha, a confirmar com o dono. Alternativa em aberto: carregar o furo sob demanda.
- **Avisos de norma no painel:** a porta de 70 cm agora avisa vão livre menor que 0,80 m. Para desligar, tirar `...openingNormProjectIssues(p)` de `apps/web/src/editor/avisosCalculo.ts`.
- **Retorno só para vão com forma:** dar verga e soleira ao retorno do vão retangular mudaria números existentes (`2t(W-2t)` por vão); não foi feito.
- **Cliente falso e duplicação:** `furoWasm.ts` duplica helpers de `furoContorno.ts` (dívida pequena); ABI do prisma e do furo usam estado de saída compartilhado.

## 3. O que falta fazer (ordem sugerida)
1. **Vista de corte:** o vão com contorno ainda sai retangular. Usar `verticalCutProfile` e `cutHalfWidth` (`packages/engine/src/openingShapeViews.ts`, já testados, não ligados).
2. **Elevação:** idem, com `elevationOutline` (pronto, não ligado).
3. **DXF:** contorno do vão em planta, corte e elevação; polilinha ou arco (decidir entre cordas e `ARC`/bulge).
4. **IFC no export:** ligar `addOpeningProfile` (`packages/io/src/ifc/ifcOpeningProfile.ts`) a `addOpenings` em `ifcExport.ts`, com o vazio no peitoril e não em `roughBottomZ`; validar em visualizador. Depois: `IfcMember`/`IfcPlate` por peça, `*LiningProperties`, `Qto_*BaseQuantities` com área e perímetro reais.
5. **IFC no import:** hoje importa vão retangular com aviso de arco; mapear o contorno de volta para `OpeningShape`.
6. **Retorno em canto e em vão que toca o piso**; decisão do dono sobre verga e soleira no retorno retangular.
7. **Chamar `furo_quant_parede`** no quantitativo (área de face real).
8. **Parede curva e com perfil:** decidir se entram (furar a malha curva) ou continuam retangulares com aviso.
9. **Interface:** alças, catálogo com tipos em arco, ogival e círculo (nenhum dos 154 tipos tem forma), quadro de esquadrias, tradução dos códigos de `validateOpeningShape` (hoje sem texto em português), planta de esquadria com folha em arco (hoje segue o modelo retangular).
10. **Esquema da cena v20** (campo opcional de contorno) só se o Rust da cena precisar do vão com forma; hoje o contorno viaja pela ABI própria.
11. **Goldens visuais, desempenho no navegador, e a suíte completa** (nunca rodada nesta sessão).
12. **Redução do WASM** (carga sob demanda do furo).
13. **Catálogo e normas:** dimensões padrão de arco (nenhuma fonte coletada traz medida), norma vigente em mãos, CBIC e quadros executivos reais; liberar domínios bloqueados (cbic.org.br, buildingSMART, help.autodesk.com, help.graphisoft.com) para repetir a coleta.
14. **Objetos compostos** (janela de canto, bay/bow, portões, cobogó): decisão pendente (onda 5).
