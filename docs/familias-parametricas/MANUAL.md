# Manual: criador de famílias paramétricas (versão curta)

Nomes de botões e abas conferidos no código da interface (2026-11-24). Onde o passo passou em roteiro de navegador, isso está dito. Onde não foi conferido, está dito também.

## Onde fica

- **Editor de famílias:** botão *Editor de famílias* no app. Dentro dele, a faixa tem as abas *Criar*, *Inserir*, *Modificar*, *Vista* e *Gerenciar*.
- **Galeria de modelos:** no editor, o botão *+ Novo módulo…* abre a janela *Novo ▸ Família ▸ Escolha o modelo*. Escolha um modelo e clique em *Criar*.
- **Carregar no projeto:** depois de editar, use *Abrir e salvar* ou *Guardar em Meus modelos* e depois *Carregar no projeto*. A família passa a aparecer no projeto.
- **Colocar no projeto:** na aba *Inserir* do app, grupo *Tubulação*, fica o botão *Tubo*. Componentes gerais ficam em *Componente*, na aba *Arquitetura*.

## Criar um tubo

1. Abra o editor de famílias e clique em *+ Novo módulo…*.
2. Escolha **Tubo reto** e clique em *Criar*. A família tem os parâmetros **L** (comprimento) e **DN** (diâmetro nominal) e duas ligações, uma em cada ponta. Confirmado no roteiro `tests/e2e/familias-tubo.mjs`.
3. Guarde e carregue no projeto, como acima.

## Criar uma conexão

1. Na galeria, escolha **Conexão em curva** (cotovelo de 90° com raio R e uma ligação em cada ponta).
2. Ajuste as medidas pelos parâmetros e confira as ligações na aba *Criar*, no painel *Ligações*.
3. **Atenção:** a ferramenta *Tubo* só cria curvas e tês sozinha no tubo de esgoto da biblioteca. Uma família copiada do modelo não ganha essas conexões automáticas. O modelo não foi testado no navegador.

## Criar uma luminária

1. Na galeria, escolha **Luminária** (corpo retangular, símbolo em planta e ligação elétrica no topo).
2. Ajuste as medidas e o símbolo na aba *Criar*, em *Símbolo 2D*.
3. **Não conferido no navegador.** Não há roteiro para esse passo. O nome do modelo está no código. Na biblioteca há sete luminárias (plafon, painel LED, spot, pendente, arandela e linear), com valores a conferir.

## Criar uma caixa

1. Na galeria, escolha **Caixa com tampa** (paredes de espessura E, tampa, medidas L × P × A). Para uma caixa de inspeção pronta, escolha **Caixa de inspeção quadrada** na biblioteca de caixas.
2. Ajuste as cotas de entrada e saída pelos parâmetros e confira as ligações.
3. Para ver o corte com cotas, abra o painel *Detalhes* na aba *Criar* (ver "Ver o detalhe na prancha"). A fossa usa esse caminho (`fossa-corte-cotas.png`).
4. Confirmado no roteiro `tests/e2e/familias-caixa.mjs`, que carregou a caixa no projeto.

## Criar um perfil

1. Na galeria, escolha **Perfil metálico I** (altura A, largura P, alma tw, mesa tf e comprimento L). A biblioteca tem também os perfis I, U, L, T e tubulares, com a série marcada como genérica.
2. Confirmado no roteiro `tests/e2e/familias-perfil.mjs`, que copiou o *Perfil I* da galeria e o carregou no projeto.
3. A massa aparece no orçamento, na seção *Instalações e estrutura*, em kg (aço 7850 kg/m³).

## Desenhar uma rede de tubos

1. Na aba *Inserir*, grupo *Tubulação*, clique em *Tubo*.
2. Clique no ponto inicial e no ponto final. *Shift* trava no eixo. Digite um comprimento e confirme com *Enter*.
3. Cada trecho começa onde o anterior terminou. Para encerrar a sequência, use *Esc*.
4. As pontas encaixadas ficam conectadas. Para uma família de esgoto da biblioteca, as curvas e os tês aparecem sozinhos.
5. Confirmado no roteiro `tests/e2e/tubo.mjs` (três trechos em L, conexões nos dois lados, Esc e desfazer) e em `tests/e2e/familias-tubo.mjs` (`tubo-em-L.png`).

## Verificar rede

1. Na aba *Inserir*, grupo *Tubulação*, clique em *Verificar rede*.
2. A janela lista os avisos com o botão *Ir para*. Se não houver aviso, aparece *Rede sem avisos.*
3. Os avisos são:
   - **Ligação aberta:** a ponta não tem conexão nem tampão.
   - **Conexão inválida:** a outra ponta não confere.
   - **Ligação afastada:** a distância entre as pontas passa de 5 mm.
   - **Incompatível:** domínios, seções, bitolas, direções ou fluxos não casam.
   - **Declividade fora da faixa:** o valor de esgoto (1 a 5 % para DN até 100) é a conferir.
   - **Rede sem saída:** a rede não tem ponto de saída.
4. Confirmado no roteiro `tests/e2e/familias-tubo.mjs`, passo 4 (`tubo-verificar-rede.png`).

## Painel MEP da instância

Selecione uma instância no projeto. O painel mostra:

- **Inclinação (°)**, com o giro.
- **Conexões:** cada ligação aparece como *Livre* ou *Conectada a…*. Os botões *Ver vizinho* e *Desconectar* estão disponíveis.
- **Sistema** e **Verificações**.
- O painel mostra as verificações, mas não bloqueia a inserção quando há erro.

Captura: `caixa-painel-mep.png`.

## Ver o detalhe na prancha

1. No editor, abra o painel *Detalhes* (aba *Criar*) e escolha o detalhe, por exemplo o corte da fossa.
2. Confira as cotas. Elas seguem o parâmetro; editar a cota edita o parâmetro.
3. Clique em *Inserir no projeto*. O detalhe vai para a prancha ativa, ou para uma prancha nova. O botão só fica ativo quando há uma instância da família no projeto.
4. Se a instância for apagada, o detalhe da prancha mostra *Detalhe inexistente*.
5. Capturas: `caixa-na-planta.png` (a caixa na planta) e `fossa-corte-cotas.png` (corte da fossa com cotas). Nenhuma delas mostra a prancha: o roteiro `familias-prancha.mjs` não foi escrito.

## Orçamento de instalações

Na aba *Arquitetura*, clique em *Orçamento* e abra a aba *Instalações e estrutura*. Ela mostra tubos em metros por DN, conexões, reservatórios em litros, perfis em quilos e eletrodutos. Captura: `tubo-orcamento-m-dn.png`.

## Exportar IFC

- Cada categoria vira uma classe IFC: tubos (`IFCPIPESEGMENT`), conexões (`IFCPIPEFITTING`), reservatórios (`IFCTANK`), perfis (`IFCMEMBER`), entre outras. As ligações viram portas (`IfcDistributionPort`).
- Arquivo de exemplo: `evidencias/Projeto-sem-titulo.ifc` (gerado pelo roteiro de referência; `IFCMEMBER` confirmado).
- Para exportar: menu **Arquivo** → cartão **IFC** (`FileMenu.tsx` chama `exportIfc`); o roteiro `tests/e2e/familias-perfil.mjs` exportou o arquivo por esse caminho.

## O que ainda não existe

Esta seção segue o `ESTADO.md`, com o que foi conferido nesta revisão.

- **Valores de norma e de catálogo.** Espessuras, Lf, raios, volume mínimo de caixa, declividade de esgoto, parâmetros de fossa (NBR 7229 e 13969), taxa de infiltração e séries de perfis estão marcados **CONFERIR**. Nenhuma família afirma atender à norma. Quem usa precisa conferir antes.
- **Conexões automáticas.** Só existem para o tubo de esgoto da biblioteca. Uma família criada do zero não ganha curva nem tê sozinha.
- **Tê.** Não foi desenhado no roteiro de navegador.
- **Vazios.** Não há subtração real. Um tê ou junção não fura o tubo principal. Uma caixa vazada não é selecionada ao clicar no centro dela. O recurso opcional de subtração (F-CSG) está pendente.
- **Redução e transição.** A redução é sólida. A transição não tem furos.
- **Inclinação 3D.** Peças na planta continuam em 2D e não acompanham a inclinação. Os corpos acompanham.
- **Corte.** Corpos e ligações não são selecionáveis no corte. O símbolo que substitui a geometria não funciona no corte.
- **Seleção.** Não há seleção de ligação por clique no 3D. A seleção do editor, entre o 3D e a lista de corpos, só funciona pela lista.
- **Símbolos.** Não há tracejado nem estilo por categoria.
- **Botões do editor.** Mover, girar e alinhar com o mouse, captura de pontos, usinagem, DXF, plano de referência, materiais, unidades, arame, isolar, planos e enquadrar aparecem desabilitados, com o motivo.
- **Ferramenta Tubo.** Não tem atalho de teclado. As mensagens estão fixas em português.
- **Famílias que não existem:** eletroduto flexível e quadro de distribuição.
- **Textos.** As categorias novas estão só em português. As traduções em espanhol, alemão, francês, italiano e polonês não passaram por revisão de falante nativo.
- **Sem roteiro de navegador:** luminária, conexão em curva, caixa como modelo, prancha e a aba *Verificar rede* isolada.
- **IFC legado.** Famílias de exemplo (vaso, lavatório, ralo, tomada, interruptor, luminária, difusor e quadro) agora têm classe IFC explícita. Projetos que as usam exportam classes diferentes do que exportavam antes. Ordem dos atributos de `IfcDistributionPort` e sentido SINK/SOURCE estão a conferir. Não houve validação em leitor IFC externo.
- **Pendências opcionais:** espelho em Rust das malhas (H3) e subtração real de vazios (F-CSG), ambos pendentes.
