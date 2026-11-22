# Roteiro de teste das plantas por disciplina

Para quem for abrir o app e validar a frente (ADR 0060). Nenhum passo abaixo foi executado no app por quem escreveu o
roteiro: tudo foi verificado só por testes automáticos, typecheck e lint. **Os nomes de menu foram tirados das
traduções do código e podem diferir um pouco na tela; anote o que for diferente.** Marque cada passo: OK / falhou / estranho.

## 0. Preparação
- Novo projeto a partir do modelo **"Teste de disciplinas (completo)"** (en: *Discipline Test (Full)*): dois pavimentos de 6 × 8 m,
  elementos de todas as categorias, componentes de cada disciplina, **8 plantas de disciplina** (4 por pavimento), cotas e
  textos de teste em plantas diferentes e uma prancha com as plantas de Estrutura e Elétrico do térreo.
- Salve o projeto logo no início (para o passo 9).

## 1. Navegador e abas
1. Cada pavimento lista a planta padrão e, abaixo, as de disciplina (Estrutura, Hidrossanitário, Elétrico, HVAC).
2. Clique em cada uma: abre numa aba com o nome e a disciplina; a ativa fica destacada; a padrão continua igual.
3. Trocar de pavimento pelo seletor de nível **mantém a disciplina** quando o destino tem planta dela. Abrir pelo navegador nunca reaplica essa regra.
4. Fechar a aba de uma planta de disciplina não fecha a padrão.

## 2. Criar, duplicar, renomear e excluir (botão direito no pavimento / na planta)
1. "Nova planta de disciplina" → uma disciplina: cria, ativa e dá nome único.
2. Duplicar, com e sem anotações. Renomear (nome repetido no mesmo pavimento deve ser recusado ou numerado). Excluir pede confirmação; excluir a ativa volta à padrão.
3. **Desfazer/Refazer** cada uma dessas ações: um passo só.

## 3. Tons (aba "Disciplinas" no diálogo de Visibilidade/Gráficos)
Esperado pela tabela do ADR (§4.2):

| Planta de ↓ / elemento → | Arquitetura | Estrutura | Hidrossanitário | Elétrico | HVAC |
|---|---|---|---|---|---|
| Arquitetura (padrão) | normal | normal | meio-tom | meio-tom | meio-tom |
| Estrutura | meio-tom | normal | oculto | oculto | oculto |
| Hidrossanitário | meio-tom | meio-tom | normal | oculto | oculto |
| Elétrico | meio-tom | meio-tom | oculto | normal | oculto |
| HVAC | meio-tom | meio-tom | oculto | oculto | normal |

1. Confira cada linha olhando a planta. Meio-tom = atenuado, por baixo do normal.
2. Mude o tom de uma disciplina numa planta; só essa planta muda. "Restaurar predefinido" volta. A planta **padrão** mostra os tons só para leitura.
3. **Meio-tom:** o cursor captura (snap) e dá para cotar a partir dele, mas **clicar ou arrastar uma caixa não seleciona** o elemento. **Oculto:** não captura nem seleciona.

## 4. Ocultar elemento e categoria (o seu defeito original) — planta **e** 3D
Faça nos dois: planta padrão e 3D.
1. Oculte o **telhado** (só ele). Depois oculte a **categoria Pilar**. Esperado: pilares somem; **paredes continuam**; o telhado segue oculto.
2. Categoria **Parede**: somem as paredes; **pilares continuam**.
3. Categoria **Viga** e **Sapata**: somem só elas; a **laje** continua. Categoria **Laje**: a laje some; vigas e sapatas continuam.
4. Categoria **Forro**: some só o forro; o **piso** continua. Categoria **Rampa**: some só a rampa; a **escada** continua.
5. Categorias de componentes (mobiliário, hidrossanitário, elétrico, mecânico): cada uma esconde só a sua.
6. Reexibir restaura tudo. Ocultar numa planta de disciplina **não** altera a padrão do mesmo pavimento.
7. **Esperado diferente do passado:** em arquivo antigo, quem tinha "Parede" oculta e via pilares sumirem agora os vê.

## 5. Anotações isoladas
1. Faça uma cota e um texto na planta de Estrutura: não aparecem na de Elétrico nem na padrão. E vice-versa.
2. Mover, Copiar e Colar anotações dentro de cada planta: ficam na planta onde estão.
3. Selecionar elementos do modelo (parede, pilar) funciona normalmente em qualquer planta de disciplina, respeitando o item 3.3.

## 6. Prancha
1. Abra a prancha de teste: tem as plantas de Estrutura e Elétrico do térreo.
2. Insira uma outra planta de disciplina (arrastar do navegador): escala natural dela, anotações dela.
3. Exclua uma planta usada na prancha: o viewport some sem quebrar a prancha. Abra uma prancha antiga (se tiver): igual a antes.

## 7. Exportação
1. **DXF** de uma planta de disciplina e do lote (aparecem alvos de planta de disciplina): contornos de parede só dentro do corte, sem clusters meio ocultos, anotações da planta.
2. **PDF** da prancha.
3. **IFC**: exporte e reimporte; as plantas de disciplina voltam (nome, disciplina, tons, ocultação).

## 8. Conteúdo de teste
Confira os componentes de exemplo na Biblioteca (vaso, lavatório, ralo, tomada, interruptor, luminária, quadro, difusor, split): aparecem na
planta e no 3D e **mudam de tom conforme a planta** (ex.: tomada some na planta de Estrutura, meio-tom na de Arquitetura).

## 9. Salvar e reabrir
Feche e reabra o projeto: plantas, tons, anotações e prancha iguais. Abra também um **projeto antigo** (de antes desta frente): abre igual, sem erro.

## 10. Idioma
O idioma automático está em outra branch (`feat/idioma-automatico`), **não** nesta. Não é testado aqui.

## 11. Disciplina na vista (Propriedades)
1. Planta padrão: abra as Propriedades da vista e troque a **Disciplina** para Estrutura. As paredes ficam em meio-tom, pilares/vigas/sapatas normais; as mesmas regras valem no 3D e no corte.
2. Planta de disciplina: a disciplina deixa de ser só leitura; troque e confira que os tons recalculam. "Restaurar predefinido" volta a Arquitetura.
3. 3D: escolha a disciplina da vista 3D (ou "Todas"). Confira o meio-tom e o oculto por categoria.
4. **Desfazer** cada troca: um passo só.

## 12. Minha disciplina (pessoal)
1. Na barra da vista, escolha **Minha disciplina** = Estrutura numa planta de Arquitetura. Você vê arquitetura em meio-tom; o arquivo **não** muda.
2. Troque para Elétrico e depois para Automática. A vista volta ao tom da planta.
3. Salve, feche e reabra: a escolha pessoal não volta (é de sessão) e o projeto está intacto.

## 13. Configurador de disciplinas
1. Abra **Configurar disciplinas** (aba de tons da Visibilidade ou menu do navegador).
2. Escolha Estrutura e mude Parede para **Oculto**; confira na planta de Estrutura. "Restaurar predefinido" desfaz.
3. Crie a disciplina **Paisagismo** (nome e cor), mude a origem da categoria "Terreno e lote" para ela e confira o agrupamento.
4. Exclua Paisagismo: as plantas/famílias dela voltam para Arquitetura; **Desfazer** restaura tudo num passo.
5. Arquivo antigo (sem perfis): abre igual; o configurador mostra os predefinidos.

## 14. 3D e corte
1. Com Minha disciplina = Estrutura, no 3D as paredes ficam esmaecidas e **não selecionam**; o oculto some e não captura snap.
2. No corte, a parede em meio-tom continua desenhada, atenuada; a oculta some.
3. Alterne Normal/Meio-tom/Oculto no configurador e confira as três vistas (planta, 3D, corte).

## 15. Colaborar
1. Duas sessões na mesma sala, cada uma com a sua **Minha disciplina**.
2. O cursor remoto mostra "Nome · Disciplina"; o projeto de quem abre não muda de disciplina.
3. Feche a sessão de uma: a outra continua com a própria disciplina.

## 16. IFC importado
1. Importe o arquivo de instalações de teste (ou use o modelo "Teste de disciplinas (completo)"): tubo, duto e cabo aparecem em Hidrossanitário, HVAC e Elétrico.
2. Ocultar a categoria `plumbingFixture` esconde só o tubo; `generic` não o esconde.
3. Um IFC antigo sem essas classes continua entrando como antes.

## Como relatar
Para cada falha: passo, o que esperava, o que viu, uma captura e, se possível, o projeto salvo. Falhas de **tela** (feio, confuso) contam
tanto quanto as de comportamento, porque nenhuma tela foi vista por quem implementou.
