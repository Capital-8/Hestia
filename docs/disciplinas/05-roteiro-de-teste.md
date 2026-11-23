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

## Adendo 3 — validação manual (disciplina da vista, disciplina pessoal, configurador, 3D/corte, colaborar, IFC)

As seções 11–16 abaixo validam o **Adendo 3** da decisão 0060 e completam o roteiro acima. Cada passo se marca
**OK / falhou / estranho** e se anota na coluna *Observação* o que a tela mostrou de diferente do esperado (nome de
botão, tom, cor), como na regra do cabeçalho.

## 11. Disciplina na vista (Propriedades)
| # | Passo | Esperado | Resultado | Observação |
|---|---|---|---|---|
| 11.1 | **Planta padrão**: abra as Propriedades da vista e troque a **Disciplina** para Estrutura | As paredes/portas ficam em meio-tom e pilares/vigas/sapatas/lajes normais (tabela §4.2); só essa planta muda | OK / falhou / estranho | |
| 11.2 | **Planta de disciplina**: a disciplina deixa de ser só leitura; troque e confira | Os tons recalculam para a nova disciplina; nome, anotações e as outras plantas não mudam. "**Restaurar predefinido**" volta a Arquitetura | OK / falhou / estranho | |
| 11.3 | **3D**: escolha a disciplina da vista 3D (ou "Todas") e confira na planta, no 3D e no corte | Meio-tom e oculto por categoria valem nas três vistas; "Restaurar predefinido" volta a "Todas" | OK / falhou / estranho | |
| 11.4 | **Desfazer** cada troca | Um passo de histórico por mudança; refazer reaplica | OK / falhou / estranho | |

## 12. Minha disciplina (pessoal)
| # | Passo | Esperado | Resultado | Observação |
|---|---|---|---|---|
| 12.1 | Na barra da vista, escolha **Minha disciplina** = Estrutura numa planta de Arquitetura | Você vê arquitetura em meio-tom; o campo "Disciplina" da vista **não** muda e o arquivo **não** muda | OK / falhou / estranho | |
| 12.2 | Troque em **planta, 3D e corte**; depois Elétrico e **Automática** | A pessoal vale nas três vistas e vence o tom da planta (precedência, adendo 3 decisão 4); em "Automática" a vista volta ao tom dela, sem resíduo de cache | OK / falhou / estranho | |
| 12.3 | **Salvar, fechar e reabrir** | A escolha pessoal não volta (é de sessão) e o projeto está intacto: serializar não grava "minha disciplina" | OK / falhou / estranho | |

## 13. Configurador
Entrada: "Configurar disciplinas" no menu do navegador de plantas ou o botão no diálogo de Visibilidade/Gráficos.

| # | Passo | Esperado | Resultado | Observação |
|---|---|---|---|---|
| 13.1 | Abra e veja a **matriz categoria × tom** de cada disciplina (ex.: Estrutura) | Categorias agrupadas pela disciplina de origem; sem perfil gravado aparece o predefinido; categoria de `geral` (terreno, CAD...) nunca recebe tom | OK / falhou / estranho | |
| 13.2 | Escolha Estrutura e mude Parede para **Oculto**; confira na planta de Estrutura; restaure | Só a disciplina selecionada muda; "Restaurar predefinido"/perfil volta ao normal | OK / falhou / estranho | |
| 13.3 | **Crie** a disciplina **Paisagismo** (nome e cor) e mude a origem da categoria "Terreno e lote" para ela | Aparece na lista, no campo "Disciplina" das vistas e em "Minha disciplina"; o remapeamento dá conteúdo a ela e move a categoria no agrupamento | OK / falhou / estranho | |
| 13.4 | **Renomeie** / mude cor | O rótulo atualiza em toda a interface | OK / falhou / estranho | |
| 13.5 | **Exclua** Paisagismo (com plantas/famílias/categorias usando-a) | Pede confirmação; as plantas e famílias **voltam para Arquitetura**, referências do nível/3D são limpas; nada quebra | OK / falhou / estranho | |
| 13.6 | **Desfazer** cada ação acima | Restaura tudo num passo só, sem perfil nem remapeamento órfão | OK / falhou / estranho | |
| 13.7 | Abra um **arquivo antigo** (sem perfis) | Abre igual; o configurador mostra só os predefinidos, sem gravar nada | OK / falhou / estranho | |

## 14. 3D e corte
| # | Passo | Esperado | Resultado | Observação |
|---|---|---|---|---|
| 14.1 | Com Minha disciplina = Estrutura, olhe a **parede em meio-tom** no 3D | Desenhada esmaecida e **não seleciona** ao clique | OK / falhou / estranho | |
| 14.2 | Parede **oculta** no perfil | Some do 3D (sai da malha e do picking); nenhuma outra categoria some junto | OK / falhou / estranho | |
| 14.3 | Parede **normal** | Cor e seleção normais de novo | OK / falhou / estranho | |
| 14.4 | **Corte/elevação** com meio-tom e oculto | A parede em meio-tom continua desenhada, atenuada; a oculta some | OK / falhou / estranho | |
| 14.5 | **Snap e cota no meio-tom** (planta e corte) | O cursor continua capturando e a cota continua referenciando o elemento em meio-tom; clique e caixa **não** selecionam (regra §4.1) | OK / falhou / estranho | |
| 14.6 | Alterne Normal/Meio-tom/Oculto no configurador | As três vistas (planta, 3D, corte) acompanham sem recarregar o projeto | OK / falhou / estranho | |

## 15. Colaborar
| # | Passo | Esperado | Resultado | Observação |
|---|---|---|---|---|
| 15.1 | Duas sessões na mesma sala, cada uma com a sua **Minha disciplina** | Cada sessão vê os tons da própria disciplina; nada no projeto muda | OK / falhou / estranho | |
| 15.2 | Olhe o **cursor remoto** | Mostra "Nome · Disciplina" do outro; sem disciplina escolhida, só o nome; atualiza ao trocar, sem reconectar | OK / falhou / estranho | |
| 15.3 | Confira o projeto de **quem abre** | O projeto de quem abre **não muda** ao salvar/reabrir por causa do colaborar (a disciplina é presença, não dado) | OK / falhou / estranho | |
| 15.4 | Feche a sessão de uma | A outra continua com a própria disciplina | OK / falhou / estranho | |

## 16. IFC importado
| # | Passo | Esperado | Resultado | Observação |
|---|---|---|---|---|
| 16.1 | **Importe o arquivo de instalações de teste** (ou use o modelo "Teste de disciplinas (completo)", que já traz `g_ifc_pipe`/`g_ifc_duct`/`g_ifc_cable`) | Tubo cai em Hidrossanitário, duto em HVAC, cabo em Elétrico; proxy/classe desconhecida fica `geral` | OK / falhou / estranho | |
| 16.2 | Confira os tons nas plantas | Na planta de Estrutura eles somem/ficam em meio-tom pelo perfil; na disciplina própria, normais | OK / falhou / estranho | |
| 16.3 | Oculte a categoria `plumbingFixture` | Esconde **só** o tubo; `generic` (proxy) não sai junto, e o `generic` do proxy nunca recebe tom de disciplina | OK / falhou / estranho | |
| 16.4 | Repita no **3D** | O tom por categoria vale também no 3D (conserto F7b) | OK / falhou / estranho | |
| 16.5 | Importe um **IFC antigo**, sem essas classes | Continua entrando como antes: tudo `geral`/`generic`, nenhuma disciplina inventada | OK / falhou / estranho | |

## Como relatar
Para cada falha: passo, o que esperava, o que viu, uma captura e, se possível, o projeto salvo. Falhas de **tela** (feio, confuso) contam
tanto quanto as de comportamento, porque nenhuma tela foi vista por quem implementou.
