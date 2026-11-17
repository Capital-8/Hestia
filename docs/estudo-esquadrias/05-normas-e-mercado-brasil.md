# 05 · Normas, mercado e prática de projeto de esquadrias no Brasil

Estudo A5 do projeto Hestia. Complementa `docs/aberturas/archicad/04-brasil-tipos-e-normas.md` (R4), que já cobre nomenclatura, NBR 15930-2, tipologias, NBR 11742, PBQP-H e medidas comerciais. Aqui não repito esse conteúdo: só complemento, corrijo ou deixo explícito o que continua sem confirmação.

Data da pesquisa: 2026-11-17.

## 0. Limites desta pesquisa (leia primeiro)

- **Texto de norma ABNT é pago.** Não li nenhuma norma ABNT completa. Tudo sobre NBR 15930, 10821, 9050, 6492, 15575, 7199, 14718 e 8545 vem de resumos, PDFs públicos de terceiros (prefeituras, universidades, CBIC) e snippets de busca.
- **O WebFetch ficou bloqueado nesta sessão.** Os hosts `cbic.org.br`, `caixa.gov.br`, `gov.br`, `prefeitura.pbh.gov.br`, `prefeitura-ds.pbh.gov.br`, `bombeiros.go.gov.br` e `arquivos.ufrrj.br` não resolveram (`getaddrinfo ENOTFOUND`). Nenhuma página foi aberta. Só usei o resultado da busca web, que devolve resumos gerados dos PDFs. Se quiser leitura direta, esses hosts precisam ser liberados nas configurações de rede da sessão.
- Nenhuma URL abaixo foi lida na íntegra por mim.
- Não consegui acessar o texto de **IT 11 / IT 08 do CBPMESP** (SP). Os requisitos de incêndio abaixo vêm de normas de outros estados e da NBR 11742, e não podem ser atribuídos ao CBPMESP.
- Não achei documento do **FDE** nem catálogo técnico com tabelas de medida máxima de **Technal, Atlântica, Pormade, Eucatex/Duratex, Sayerlack, Rio-Grandense, Atlas, Dimensional, Massaranduba ou Cristal**. Sasazaki só apareceu como listagem de varejo.

Marcações:

- **[VERIFICADO-RESUMO]**: confirmado em ao menos um resumo ou trecho de fonte pública, mas não no texto oficial.
- **[VERIFICADO-OFICIAL]**: mencionado em documento oficial/governamental via busca (ainda sem leitura integral).
- **[CONFLITO]**: fontes divergem.
- **[INFERIDO]**: dedução minha.
- **[NÃO ENCONTRADO]**: busquei e não achei.

## 1. Síntese do que muda para o Hestia

1. O **vão livre de 0,80 × 2,10 m** é requisito de acessibilidade e de programas públicos (MCMV). Vão livre não é vão de alvenaria nem medida de folha. O editor precisa calculá-lo, não só aceitá-lo. [VERIFICADO-RESUMO/OFICIAL]
2. **NBR 7199 mudou em 2025**: vidro de segurança passou a ser obrigatório em **qualquer porta**, em qualquer altura (antes só abaixo de 1,10 m do piso), e nas áreas envidraçadas a **até 60 cm** das bordas da porta. Aramado deixou de contar como vidro de segurança. [VERIFICADO-RESUMO, fonte CBIC e Abravidro via busca; texto da norma não lido]. Isso vira regra de validação (ver §8).
3. **Altura de maçaneta**: as fontes secundárias dão **0,80–1,10 m** para maçaneta/puxador (NBR 9050). Isso conflita com o 0,90–1,10 m que circula na prática. Usar 0,80–1,10 m como faixa permitida e 1,00 m como padrão de desenho. [CONFLITO, ver §3]
4. **Folga de assentamento não é regra de norma.** É regra de manual de fabricante e de composição SINAPI, e varia de 5 mm a 25 mm por lado conforme o sistema de fixação (§6). Modelar como parâmetro por sistema de assentamento, não como constante.
5. **Verga/contraverga**: o transpasse de 20 cm por lado (atribuído à NBR 8545) e o de 30 cm (prática e SINAPI) divergem, e o DNER usa 1/4 do vão. Tratar como parâmetro com default configurável e aviso de que o cálculo estrutural prevalece (§6). [CONFLITO]
6. O **quadro de esquadrias** não tem layout normativo de colunas. A NBR 6492 prevê o "quadro geral de esquadrias" e a codificação P1…Pn / J1…Jn, mas as colunas vêm de prática (§7).

## 2. Mapa das normas relevantes

Complementa a tabela do R4. Só entram itens novos ou com correção.

| Norma | Assunto | O que consegui confirmar | Status |
|---|---|---|---|
| NBR 15930-1/-2 | Porta de madeira | Terminologia e dimensões já tratadas no R4. Não reverifiquei. | Ver R4 |
| NBR 10821 (partes 1 a 6) | Esquadrias para edificações | Parte 2 citada nas FADs do PBQP-H como 10821-2:2017; uma tabela de classificação do PBQP-H cita 10821-2:2023. Confirmar a edição vigente antes de citar no Hestia. | [CONFLITO] de edição |
| NBR 9050 (2015 + Emenda 1:2020) | Acessibilidade | Vários PDFs públicos são "9050:2015/Em1:2020". Citar como "NBR 9050:2020" é a convenção de mercado. | [VERIFICADO-RESUMO] |
| NBR 6492:2021 (2ª ed., 16/06/2021) | Documentação técnica de projetos arquitetônicos e urbanísticos | Título mudou em relação à edição de 1994. A edição de 1994 previa "quadro geral de esquadrias". Não consegui ler o texto de 2021. | Parcial |
| NBR 7199 (nova versão/emenda de 30/06/2025) | Vidros na construção civil | Segurança em portas em qualquer altura; zona de 60 cm ao lado da porta; aramado fora da categoria de segurança. | [VERIFICADO-RESUMO] |
| NBR 14718:2019 | Guarda-corpos | Altura mínima 1,10 m do piso acabado ao topo; mureta de 200–800 mm de altura pede mínimo de 900 mm. Cargas em N/m não confirmadas. | [VERIFICADO-RESUMO] |
| NBR 15575 (partes 1, 4, 5) | Desempenho | Ventilação e acústica de fachada dependem de zona bioclimática e classe de ruído. Não confirmei 7% de ventilação nem valores de D2m,nT,w. O R4 cita 7% da área de piso; ver §9. | [NÃO ENCONTRADO] aqui |
| NBR 8545 (1984) | Execução de alvenaria de tijolos/blocos cerâmicos | Atribuem-se a ela verga de 10 cm de altura mínima e transpasse de 20 cm. Não li o texto. | [CONFLITO] |
| NBR 8117 / NBR 14698 | Anodização de alumínio / vidro temperado | Só citadas indiretamente. | [NÃO ENCONTRADO] |
| NBR 13768, NBR 14207 | Pedido do briefing, "se relevantes" | Não pesquisei a fundo. Pela numeração, não são normas centrais de esquadria. Não afirmo o escopo. | [NÃO ENCONTRADO] |

## 3. Acessibilidade (NBR 9050)

Fontes: resumos e checklists públicos. O texto oficial é pago.

| Item | Valor | Status | Fonte |
|---|---|---|---|
| Vão livre de porta | **0,80 m (L) × 2,10 m (A)** | [VERIFICADO-RESUMO] | checklist federal (transferegov), guia de acessibilidade de Macaé |
| Tolerância no vão livre | −20 mm (já no R4) | Ver R4 | |
| Tipo de maçaneta | alavanca; **≥ 100 mm** de comprimento; afastada **≥ 40 mm** da face da porta; sem arestas | [VERIFICADO-RESUMO] | oHub, resumo de busca |
| Altura de maçaneta/puxador | **0,80 a 1,10 m** do piso acabado | [CONFLITO] com a prática 0,90–1,10 m. As fontes que consegui (cartilha RJ/SP, oHub) dizem 0,80–1,10. | |
| Puxador horizontal/vertical | diâmetro **25 a 45 mm**, afastamento **≥ 40 mm**, mesma faixa de altura | [VERIFICADO-RESUMO] | cartilha de acessibilidade RJ/SP |
| Puxador horizontal em sanitário | no lado oposto à abertura, à altura da maçaneta | [VERIFICADO-RESUMO] | oHub |
| Desnível/soleira | até **5 mm**: sem tratamento; **5 a 20 mm**: inclinação máxima **1:2 (50%)**; acima de 20 mm: tratar como degrau/rampa | [VERIFICADO-RESUMO], cartilha Unicamp via busca. Outro site usa 15 mm como barreira. | [CONFLITO] parcial |
| Rampa substituindo soleira com 1 degrau | comprimento ≥ 0,90 m, i < 12,5% | [VERIFICADO-RESUMO], checklist AGU | |
| Barra antipânico a 0,90 m | já no R4 (NBR 11742) | Ver R4 | |

Consequências para o modelo:

- Guardar `clearWidth` e `clearHeight` como valores **calculados** (vão acabado menos marco, folga, espessura de folha aberta a 90° quando relevante, e soleira), com regra `clearWidth >= 800` e `clearHeight >= 2100` (com a tolerância da norma como parâmetro).
- Em porta de giro, a folha aberta a 90° ocupa parte do vão; a verificação deve usar a largura entre a face do marco e a face da folha aberta. [INFERIDO]
- Atributo `thresholdStep` (mm) com faixas 0–5 / 5–20 / >20 para gerar aviso.

Não achei requisitos específicos de porta de correr e sanfonada nos resultados (o R4 já os cita; não reconfirmei). [NÃO ENCONTRADO]

## 4. Incêndio e saídas de emergência

**Não obtive o texto da IT 11 nem da IT 08 do CBPMESP.** O que segue vem de normas técnicas de outros corpos de bombeiros, que adotam estrutura semelhante, e não pode ser atribuído a SP sem conferir.

| Item | Valor | Status | Fonte |
|---|---|---|---|
| Unidade de passagem | **0,55 m** | [VERIFICADO-OFICIAL] (IT 11/2019 SP citada em resumo; Paraná e Goiás idem) | NPT 011 PR, NT 11 GO, resumo da IT 11 SP |
| Largura de porta | regra à parte da unidade de passagem (item específico, "5.5.4.2" na NT 11 de Goiás); valor não obtido | [NÃO ENCONTRADO] | NT 11 GO |
| Porta que abre no sentido do fluxo de saída, a 90° | deve ficar em recesso para não reduzir a largura efetiva em mais de **0,1 m** | [VERIFICADO-OFICIAL] (NT 11/2014 GO, item 5.4.3.3, via busca) | |
| Corredor para menos de 20 pessoas | largura mínima **1,0 m** (GO) | [VERIFICADO-OFICIAL], não aplicar a SP sem conferir | |
| Porta corta-fogo de saída | atender NBR 11742 (citado em IT 08 MG e IT 09 RS) | [VERIFICADO-OFICIAL] | IT 08 MG, IT 09 RS |
| Largura mínima de 0,80 m em IT 08 MG | aparece uma menção "largura mínima de 80,0 cm" em contexto não confirmado | [NÃO ENCONTRADO] contexto | |

Ações para o editor:

- Campo `fireRating` na porta (nenhuma, P-30, PF-30, P-60, PF-60, P-90, P-120 conforme R4) e `escapeRoute: boolean`.
- Se `escapeRoute`, validar: largura efetiva ≥ valor da jurisdição (parâmetro por estado, default a definir após ler a IT 11), sentido de abertura = sentido de fuga (regra comum nas ITs; confirmar no texto de cada estado) e ausência de tranca no sentido de fuga (R4, NBR 11742).
- O **código de obras municipal** é outra camada (largura de porta em escolas, hospitais, hotéis). [NÃO ENCONTRADO]. Não pesquisei município por município.

## 5. Dimensões padronizadas: o que acrescento ao R4

O R4 já traz as tabelas de folha, vão e kit (NBR 15930-2, Sincol/Pormade) e as medidas comerciais de janela. O que acrescento:

- **MCMV (Portaria MCID 725/2023 e anteriores):** exige **vão livre 0,80 × 2,10 m em todas as portas**, inclusive externas, e área mínima de unidade de **40 m² (casa)** e **41,5 m² (apartamento)** segundo notícia de fev/2025. [VERIFICADO-OFICIAL via busca para a porta; [VERIFICADO-RESUMO] para a área]. Percentuais de ventilação e iluminação **não** foram lidos. Anexo II da Portaria 725/2023 é o lugar para conferir.
- Consequência: porta 80 × 210 de folha **não atende** vão livre de 0,80 m (a folha aberta e o marco reduzem). Para vão livre 0,80 é preciso folha de 90 cm em giro, ou ajuste do conjunto. [INFERIDO, a partir do conceito de vão livre da NBR 15930-1 e do R4]. É um ponto a validar com projetista, porque a prática de MCMV é tratar a porta de 80 cm de folha como atendendo; o texto dos programas diz "vão livre".
- **Janelas padrão PBQP-H (dimensões máximas de avaliação):** maxim-ar 1000 × 1000 mm (FAD), correr duas folhas com persiana integrada até 1,20 × 1,50 m (FAD nº 19), correr três folhas com veneziana (FAD 012 R01), correr duas folhas, uma fixa, 1,00 × 1,50 m (FAD 007 R01). Há também maxim-ar de 600 × 600 e 800 × 800 mm em exemplos de classificação. [VERIFICADO-OFICIAL via busca; já parcialmente no R4].
- **Sasazaki (varejo, Telhanorte):** correr 4 folhas 100 × 150 cm e 120 × 200 cm (linha Alumifort), profundidade de perfil de **6,4 cm** e **9,4 cm**; correr 2 folhas 100 × 100, 120 × 150, 100 × 150, 120 × 120 cm. [FABRICANTE/varejo, listagem]. Não é tabela de catálogo técnico. A linha "Suprema 25/30" não é Sasazaki (é M.A Esquadrias e Inovatta). [VERIFICADO]. Linhas Sasazaki confirmadas: Aluminium, Alumifort, Alumifit, AlumiSlim.
- **Facce Vitraux (maxim-ar residencial):** 0,60 × 0,60; 0,60 × 0,80; 0,80 × 0,60 m. [FABRICANTE via AECweb].
- **MGM (já no R4):** manual de alumínio 2020 (`cdn2.madeiramadeira.com.br/atributo/mgm-aluminio/874226-manual-aluminio202002-2.pdf`) traz folgas de assentamento (§6).
- **Hydro:** ferragem de giro em linhas 20/25/32 com limites de folha (R4). Boletim técnico nº 26 sobre perfil KP119 sem dados de vão. [NÃO ENCONTRADO] tabelas.
- Não achei dados verificáveis de Technal, Atlântica, Pormade, Eucatex/Duratex, Sayerlack, Rio-Grandense, Atlas, Dimensional, Massaranduba, Cristal. Para o Hestia, tratar como "catálogo de fabricante" que o usuário importa, não como tabela embutida.

### 5.1 Alturas de peitoril e de testeira

- **NBR 15575-1**, via R4: peitoril ≤ 1,00 m e testeira ≤ 2,20 m para dormitórios e salas. Não reconfirmei nesta rodada. [NÃO ENCONTRADO] aqui.
- Em planta, material didático diz que janela com peitoril abaixo de 1,50 m é cortada pelo plano e desenhada em linha cheia; acima, tracejada. [FÓRUM/LOJA, não normativo].
- **Peitoril x guarda-corpo:** janela cujo peitoril fique abaixo de 1,10 m e com risco de queda deve ter proteção ou vidro de segurança. A altura de 1,10 m vem da NBR 14718:2019 (guarda-corpo) e da antiga regra da NBR 7199. [VERIFICADO-RESUMO]. A associação "janela com peitoril < 1,10 m = precisa de guarda-corpo" é regra de projeto comum; não vi o texto que a fixe. [INFERIDO]

## 6. Coordenação com alvenaria

### 6.1 Folga de assentamento (esquadria x vão)

Não há norma única. As fontes públicas dão valores diferentes conforme o sistema:

| Sistema | Folga | Fonte | Status |
|---|---|---|---|
| Espuma expansiva, sem contramarco | ~**2 cm por lado** | manual de alumínio MGM | [FABRICANTE] |
| Contramarco | **25 mm** nas laterais, embaixo e em cima | manual de alumínio MGM | [FABRICANTE] |
| Chumbamento com grapas | ~**0,5 cm por lado** | manual MGM | [FABRICANTE] |
| Contramarco, composição SINAPI | **1 cm** no topo e nas laterais | SINAPI via orcamentor | [VERIFICADO-RESUMO] |
| Contramarco, manual Hydro | **3 a 5 cm** no perímetro (por lado ou total, não ficou claro) | manual Hydro | [CONFLITO] |
| Especificação pública de alumínio | ~**2 cm** entre contramarco e vão | caderno de especificações (referência SINAPI/ORSE) | [VERIFICADO-RESUMO] |

Para o Hestia: `settingClearance` com defaults por sistema (grapa 5, SINAPI 10, espuma 20, contramarco MGM 25 mm), **por lado**, e vão bruto = esquadria + 2 × folga. [INFERIDO a partir das fontes]. O manual do fabricante prevalece sobre qualquer default.

### 6.2 Vergas e contravergas

| Regra | Valor | Fonte | Status |
|---|---|---|---|
| Altura mínima de verga | **10 cm** | atribuída à NBR 8545/1984 em artigo de divulgação | [NÃO CONFIRMADO no texto da norma] |
| Transpasse mínimo | **20 cm** por lado | NBR 8545/1984 (atribuição) e especificações públicas | [CONFLITO] |
| Transpasse prática/SINAPI | **30 cm** por lado (vergas pré-moldadas) e 45 cm em um exemplo de consumo | composições SINAPI via orcamentor | [VERIFICADO-RESUMO] |
| Transpasse DNER-ES 347/97 | **1/4 do vão** por lado, mínimo | especificação rodoviária que cita a NBR 8545 | [CONFLITO]; é rodoviária |
| Transpasse empírico | 30 a 40 cm | trabalho acadêmico (ABM) | [VERIFICADO-RESUMO] |
| Regra de bolso | vão 1,5 m → 30 cm; vão 2,0 m → 40 cm; altura = 10% do vão | guia de obras | [FÓRUM/LOJA] |
| Contraverga obrigatória | quando o vão passa de **0,50 m** | artigo ABM | [VERIFICADO-RESUMO] |

Modelo sugerido: `lintel` e `sill` como elementos opcionais gerados com `bearing` (transpasse) e `height` editáveis, com default 30 cm e 10 cm e aviso "dimensionar pelo projeto estrutural". Em alvenaria estrutural (NBR 15961), verga é estrutural e o projeto prevalece; não achei regra de transpasse nessa norma. [NÃO ENCONTRADO]

### 6.3 Relação com o quadro de esquadrias

O R4 já define a cadeia vão bruto, vão acabado, marco, folha. A NBR 6492 manda cotar o vão acabado (R4, S22). Para esquadria metálica e de PVC, o quadro deve informar também o **tipo de fixação** (contramarco, grapa, espuma), porque a folga muda o vão bruto de obra.

## 7. Quadro de esquadrias e codificação

### 7.1 O que a norma diz (limitado)

- A NBR 6492 prevê **quadro geral de esquadrias** como lâmina do projeto executivo. A edição de 1994 trazia um exemplo "A-21 Quadro geral de esquadrias" (cópia em `professor.pucgoias.edu.br`). [VERIFICADO-RESUMO]. Se a edição de 2021 mantém exemplo, formato e colunas, **não consegui ler**.
- Codificação: **P1, P2… Pn** para portas e **J1, J2… Jn** para janelas, segundo trecho de norma citado em material de ensino. [VERIFICADO-RESUMO]. Material didático adiciona que o código deve estar no desenho de planta e elevação para casar com a tabela.
- **Cota de abertura**: R4 já traz "P = L × H" e "J = L × H / P" (largura × altura / peitoril). Não reconfirmei.
- **Plano de corte em planta**: 1,50 m. Duas questões de concurso se contradizem sobre se pode variar (uma diz "pode ser ajustado desde que indicado na planta", outra "sem variação"). [CONFLITO]. Tratar como parâmetro `cutPlaneHeight` com default 1,50 m.

### 7.2 Colunas típicas de um quadro executivo

**[INFERIDO]** a partir de memoriais, cadernos de encargos e quadros usados na prática, sem template normativo achado. Nenhuma fonte listou exatamente estas colunas.

| Coluna | Conteúdo | Observação para o Hestia |
|---|---|---|
| Código | P1, J1, PF1 (corta-fogo), B1 (basculante) etc. | Prefixo por categoria, número sequencial por tipo+dimensão+material. Parâmetro de política de numeração |
| Tipo / funcionamento | giro 1 folha, correr 2 folhas, maxim-ar, basculante, pivotante etc. | Enum alinhado a R4 |
| Largura × Altura | vão acabado ou dimensão nominal da esquadria | Marcar qual (R4 §2.2) |
| Peitoril | altura do peitoril (janelas) | Só janela e porta-balcão com guarda-corpo |
| Quantidade | contagem automática por código | Derivada do modelo |
| Material / perfil | madeira, alumínio (linha), PVC, aço, vidro temperado | Linha de perfil do fabricante, se houver |
| Acabamento / cor | anodizado natural, pintura eletrostática branca, verniz | |
| Vidro | tipo (liso, laminado, temperado, canelado, jateado) e espessura em mm | Verificar vidro de segurança em porta (NBR 7199) |
| Ferragens | dobradiças, fechadura, maçaneta, mola, fecho, cremona, trilho | Verificar altura de maçaneta (§3) |
| Sentido de abertura | direita/esquerda, interna/externa, referência ao observador | Definir convenção explicitamente: o mercado diverge |
| Resistência ao fogo | P-30, PF-60 etc. | Só quando houver |
| Desempenho | classe NBR 10821 (mínimo, intermediário, superior), acústico | Para fachada |
| Local / ambiente | onde se aplica | Opcional, útil para conferência |
| Observações | contramarco, persiana, tela, grade, bandeira, referência a detalhe | |

Dica prática: o quadro deve poder ser **gerado a partir do modelo** e filtrado/agrupado, com coluna "detalhe nº" apontando para a prancha de detalhes (NBR 6492 pede detalhes de lateral, verga, soleira e peitoril, via R4).

### 7.3 Representação gráfica

Coberto no R4 §3.6 e §7. Acrescento que **símbolo de elevação (triângulo/V) não é prescrição da NBR 6492**; é convenção de prática, como R4 já registra. Manter configurável.

## 8. Vidros e guarda-corpo

| Item | Valor | Status |
|---|---|---|
| Vidro de segurança em portas | obrigatório em **qualquer altura** (NBR 7199, emenda de 30/06/2025) | [VERIFICADO-RESUMO] (CBIC, via busca) |
| Vidro de segurança em áreas envidraçadas ao lado de porta | até **60 cm** das bordas da porta | [VERIFICADO-RESUMO] |
| Regra anterior | só abaixo de 1,10 m do piso | [VERIFICADO-RESUMO] |
| Vidro aramado | retirado da categoria de segurança | [VERIFICADO-RESUMO] (Abravidro, via busca) |
| Cobertura, marquise, claraboia | laminado de segurança recomendado em divulgação; conferir na norma | [FÓRUM/LOJA] |
| Guarda-corpo (NBR 14718:2019) | altura **1,10 m** (revisão elevou de 1,0 m); mureta 200–800 mm: mínimo 0,90 m | [VERIFICADO-RESUMO] (CBIC, Macaé PDF) |
| Vidro em guarda-corpo | temperado ou laminado de segurança (guia Abividro) | [VERIFICADO-RESUMO] |
| 0,8 kN/m | **não é** valor da NBR 14718 (vem de catálogo espanhol, CTE DB SE-AE) | [VERIFICADO]. Não usar |
| Espessura mínima por tabela da NBR 7199:2025 | não achei | [NÃO ENCONTRADO]. Ver Prática Recomendada PR 1010 (Abravidro, via CBIC) |
| Chapa 3 mm mínimo, fórmula de Herzogenrath | citado em cadernos de encargos baseados na versão de 1988 | [VERIFICADO-RESUMO], obsoleto |

Regra de validação proposta:

- `Door.glazing.safety = true` sempre que houver vidro em porta.
- Alerta para qualquer vidro a menos de 60 cm lateralmente de porta de vidro.
- Alerta para vidro não de segurança com borda inferior abaixo de 1,10 m do piso, como medida conservadora até ler a norma atual. [INFERIDO]

## 9. Desempenho (NBR 15575 e NBR 10821)

- Zona bioclimática e classe de ruído determinam o desempenho exigido de janela. O texto da NBR 15575 que pude ver (resumos) descreve **classes de ruído externo**: dormitório classe 1 abaixo de 60 dBA, classe 2 abaixo de 65 dBA. Os valores de D2m,nT,w por classe e a tabela de ventilação por zona não apareceram. [NÃO ENCONTRADO]. O R4 afirma 7% de área de piso (ZB 1–7), 12% (Norte) e 8% (Nordeste/Sudeste); não consegui reconfirmar nesta rodada. [Manter como "do R4, não reverificado"].
- Quando o código municipal exigir mais ventilação do que a norma, vale o maior. [VERIFICADO-RESUMO]
- Numeração da NBR 15575: fontes divergem sobre qual parte cobre fachada (parte 4 e 5, segundo ProAcústica; um slide do IPT identifica a parte 4 com vedações internas). Não citar "parte X" no Hestia sem conferir. [CONFLITO]
- NBR 10821-2: as FADs do PBQP-H exigem ensaio de permeabilidade ao ar, estanqueidade, resistência a cargas uniformes, e verificam camada anódica e selagem. Valores de camada anódica e espessura mínima de perfil não achados. [NÃO ENCONTRADO]

## 10. SINAPI, caderno de encargos, programas públicos

### 10.1 SINAPI

- Existe o **Caderno Técnico SINAPI de esquadrias de janelas** (Caixa): `https://www.caixa.gov.br/Downloads/sinapi-cadernos-tecnicos/SINAPI-CT-ESQUADRIAS-JANELAS.pdf`. Não consegui abrir (rede). Existe também o caderno de vergas, contravergas e fixação de alvenaria: `.../SINAPI-CT-VERGAS-CONTRAVERGAS-E-FIXACAO-DE-ALVENARIA.pdf`. [VERIFICADO que existem; não lidos].
- Composições encontradas (via orcamentor.com, **site de terceiros**, conferir na planilha oficial do mês e do estado):
  - **94571**: janela de alumínio de correr, 2 folhas, 120 × 120 cm, vidros inclusos, persiana integrada, batente 6 a 14 cm, parafuso e silicone.
  - **94570**: janela de alumínio de correr 1,20 × 1,20 m, 2 folhas de vidro, com guarnição; persiana não confirmada.
  - **105811**: correr 1,00 × 1,20 m com bandeira.
  - Insumo **44328**: janela integrada com veneziana, 120 × 120, 2 folhas.
  - 94562, 94569, 94572, 94573, 100663, 100665, 100669, 100670, 100672, 100924: também aparecem como composições de esquadria/janela (algumas de madeira); não verifiquei cada uma.
  - Composição de maxim-ar **90 × 110 cm (A × L)** com guarnição, que pode ser trocada por basculante de outro tamanho. [VERIFICADO-RESUMO]
- Porta de madeira 80 × 210 como kit: **não achei código** nos resultados. [NÃO ENCONTRADO]
- O SINAPI descreve dimensões em **altura × largura**, ordem oposta à de muitos catálogos. O R4 já alerta. No Hestia: sempre `width` e `height` separados.

### 10.2 Cadernos de encargos e especificações públicas

- **SUDECAP/PBH, capítulos 12 (esquadrias) e 13**: esquadrias seguem o projeto executivo e seus detalhes quanto a dimensionamento, funcionamento, localização e instalação. Não consegui ler os capítulos. [VERIFICADO-RESUMO]
- **DER-ES, caderno de especificações** `0717 esquadrias metálicas` e `0801 vidros para esquadrias`; **ORSE/Sergipe**, fichas ES00113 a ES00121: especificações de esquadrias e vidros. Conferi só que existem. [VERIFICADO que existem]
- **DNIT/DNER**: ES 347/97 (alvenaria com vergas) e ES 353/97 citados em resultados. Rodoviário, uso limitado.
- **CBIC, Guia de Esquadrias para Edificações (2017)**: `https://cbic.org.br/wp-content/uploads/2017/11/Guia_de_Esquadrias_para_Edificacoes_2017.pdf`. Não lido. É o melhor candidato a fonte livre para folgas, tolerâncias e especificação. Recomendo leitura direta quando a rede permitir.
- **FDE (escolas de SP)**: citado como "Catálogo Técnico de Serviços" (2013) em referência da DER-ES. Conteúdo não obtido. [NÃO ENCONTRADO]. Uma especificação de escola encontrada usa **basculante de alumínio** na maioria das janelas, por controle de ventilação e segurança, e porta de madeira pintada ou alumínio. Não é do FDE. [FÓRUM/LOJA]
- Contrato-tipo: porta 90 × 210 com batente de madeira 15 × 3 cm lixado e pintado. Genérico. [FÓRUM/LOJA]
- **MCMV**: Portaria MCID 725/2023 (Anexo II, especificações de projeto), versão compilada de abril de 2024 e Portaria MCidades 318/2014; vão livre 0,80 × 2,10 m (§5). Percentuais de janela não lidos.

## 11. Lacunas e o que ler a seguir

Em ordem de valor para o Hestia:

1. **NBR 9050 completa** (PDFs não oficiais circulam em sites de prefeituras e de universidades; não usei por incerteza de edição). Confirmar: altura de maçaneta, soleira, porta de correr, vão em porta de duas folhas.
2. **IT 11 e IT 08 do CBPMESP** (site oficial do Corpo de Bombeiros de SP): largura de porta, sentido de abertura, corta-fogo.
3. **CBIC, Guia de Esquadrias 2017** e **SINAPI CT esquadrias**: folgas, tolerâncias, composições.
4. **NBR 7199:2025** (ou a PR 1010 da Abravidro): espessuras e regra exata de segurança.
5. **NBR 6492:2021** texto integral: formato do quadro de esquadrias, símbolos e plano de corte.
6. **Catálogos técnicos** dos fabricantes (Sasazaki por linha, Technal, Atlântica, Pormade etc.), com tabela de dimensão máxima por tipologia e espessura de vidro.
7. **Portaria MCID 725/2023, Anexo II**: ventilação e iluminação.

## 12. Fontes (URLs)

Todas aparecem em resultados de busca; **nenhuma foi aberta por mim** (rede bloqueada para leitura direta). O status [VERIFICADO-RESUMO] significa que o resumo da busca confirmou o dado, não que li o documento.

Acessibilidade e NBR 9050
- https://base.ohub.com.br/facilities/conformidade-e-seguranca-predial/acessibilidade-nbr-9050/artigos/portas-macanetas-e-ferragens-acessiveis-requisitos-da-nbr-9050
- https://depi.unicamp.br/wp-content/uploads/sites/59/2022/01/acessibilidade-nbr9050.pdf
- https://www.macae.rj.gov.br/midia/uploads/file/Acessibilidade-orienta%C3%A7%C3%B5es-revisado-2017.pdf
- https://www.gov.br/transferegov/pt-br/legislacao/arquivos/anexo_i_in02_acessibilidade_atualizado-pela-in-18-de-2023p.pdf
- https://jus.com.br/artigos/63206/acessibilidade-nas-cidades-do-rio-de-janeiro-e-sao-paulo/2
- https://www.canoas.rs.gov.br/wp-content/uploads/2020/07/norma-abnt-NBR-9050-2015-emenda-1-2020.pdf (cópia não oficial; não usada)

Representação e quadro (NBR 6492)
- https://professor.pucgoias.edu.br/SiteDocente/admin/arquivosUpload/17702/material/NBR%206492%20editada.pdf (edição de 1994, material didático)
- https://arquivos.ufrrj.br/arquivos/2021103028882828758439fd707c0a63a/NBR_6492_2021.pdf (cópia de 2021; não abri)
- https://wiki.ifsc.edu.br/images/9/93/ARU_PB_01-Apostila_de_Planta_Baixa_Introducao_ao_Desenho_Tecnico.pdf

Vidro e guarda-corpo
- https://cbic.org.br/a-nova-abnt-nbr-7199-maior-seguranca-no-uso-de-vidros-na-construcao-civil/
- https://cbic.org.br/inovacao/2025/07/07/a-nova-abnt-nbr-7199-maior-seguranca-no-uso-de-vidros-na-construcao-civil/
- https://cbic.org.br/wp-content/uploads/2021/06/cn-2o-projeto-abnt-pr-1010.pdf
- https://cbic.org.br/?p=40590 (revisão da NBR 14718)
- https://www.macae.rj.gov.br/midia/uploads/NBR%2014718_Guarda-Corpos_Edificacoes.pdf
- https://mkt-smart.s3.us-east-1.amazonaws.com/BIBLIOTECA_TECNICA_SITE/09-ESQUADRIAS_DE_PVC/guia-de-seguranca-nas-edificacoes-abividro.pdf

Alvenaria, vergas, assentamento
- https://www.caixa.gov.br/Downloads/sinapi-cadernos-tecnicos/SINAPI-CT-VERGAS-CONTRAVERGAS-E-FIXACAO-DE-ALVENARIA.pdf
- https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/ipr/coletanea-de-normas/coletanea-de-normas/especificacao-de-servico-es/dner-es347-97.pdf
- https://abmproceedings.com.br/en/article/download-pdf/vergas-e-contravergas-em-alvenaria
- https://cdn2.madeiramadeira.com.br/atributo/mgm-aluminio/874226-manual-aluminio202002-2.pdf
- https://www.hydro.com:443/contentassets/870e8bb6de424717af5c4836ea81a0dc/manual-instalacao-contramarco.pdf
- https://orcamentor.com/composicao/100665/ (SINAPI via terceiro)

SINAPI, cadernos e programas públicos
- https://www.caixa.gov.br/Downloads/sinapi-cadernos-tecnicos/SINAPI-CT-ESQUADRIAS-JANELAS.pdf
- https://orcamentor.com/composicao/94571/ , https://orcamentor.com/composicao/94570/ , https://orcamentor.com/composicao/105811/
- https://cbic.org.br/wp-content/uploads/2017/11/Guia_de_Esquadrias_para_Edificacoes_2017.pdf
- https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/sudecap/normas-padroes/VA-CADERNO/Capitulo12/CAP12-19-09-20.pdf
- https://der.es.gov.br/media/Documentos/Tabela%20Referencial%20de%20Pre%C3%A7o/Referencial%20de%20Edifica%C3%A7%C3%B5es/CADERNO_ESPECIFICACOES/0717-esquadrias-metalicas-esquadrias-metalicas-m2-v2.pdf
- https://orse.cehop.se.gov.br/esp/ES00114.pdf
- https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/arquivos-1/ANEXOIPortariaMCidadesn.725de15dejunhode2023.pdf
- https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/arquivos-1/20240405_Portaria_MCID_725_Especificacoes_MCMV_FAReFDS_COMPILADA.pdf
- https://antigo.mdr.gov.br/images/stories/ArquivosSNH/ArquivosPDF/Especificacoes/especificacoes_casa_port168.pdf

PBQP-H
- https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/04/FAD-No-19-2.pdf
- https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/09/FAD-012-R01.pdf
- https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/09/FAD-007-R01.pdf
- https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/09/Classificacao-Empresas_RS025.pdf

Incêndio
- https://www.bombeiros.go.gov.br/wp-content/uploads/2021/04/NT-11_2021-Saidas-de-Emergencia.pdf
- https://www.bombeiros.go.gov.br/wp-content/uploads/2014/10/nt-11_2014-saidas-de-emergencia.pdf
- https://www.bombeiros.pr.gov.br/sites/bombeiros/arquivos_restritos/files/documento/2023-02/npt11_0.pdf
- https://bombeiros.mg.gov.br/storage/files/shares/intrucoestecnicas/IT_08_2a_Ed_portaria_70.pdf
- https://www.bombeiros.rs.gov.br/upload/arquivos/202503/25170826-it-09-25-compartimentacao-horizontal-e-compartimentacao-vertical.pdf

Fabricantes e desempenho
- https://www.telhanorte.com.br/sasazaki (listagens de varejo)
- https://www.aecweb.com.br/produto/linha-alumifort/16622 e https://www.aecweb.com.br/produto/linha-suprema-inovatta-brasil/5317
- https://www.aecweb.com.br/produto/vitraux-maxim-ar/35765
- https://hydro.com/globalassets/03-about-aluminium/bt-26-r0.pdf
- https://labeee.ufsc.br/sites/default/files/publicacoes/notas_tecnicas/NT_15575_FINAL.pdf
- https://edisciplinas.usp.br/pluginfile.php/4467361/mod_resource/content/0/ProAcustica-ManualClasseRuido-Mai2017.pdf
