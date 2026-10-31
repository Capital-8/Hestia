# 0042 — Interface responsiva para tablet e celular

## Contexto

A interface foi desenhada para desktop (mouse, janela larga): faixa de 84 px, abas de 22 px, painéis laterais
fixos, popups pequenos e diálogos de até 1240 px. Em telas de 360–430 px a barra de título transbordava, os
painéis viravam colunas que esmagavam o desenho e tabelas empurravam o diálogo inteiro para fora da tela.

## Decisão

Uma camada responsiva **sem mudar o desktop com mouse**. Entram apenas por largura, altura ou ponteiro grosso:

| Faixa | Comportamento |
|---|---|
| > 1024 px (mouse) | Layout original. |
| ≤ 1024 px e `pointer: coarse` | Alvos de toque maiores: barra de 38 px, faixa de 96 px, botões de 28–32 px, linhas de menu de 40–44 px. |
| ≤ 900 px | Propriedades e Navegador viram **gavetas** sobre o desenho, com fundo escurecido clicável. Ao abrir uma vista, as gavetas fecham. |
| ≤ 700 px | Barra de título sem o nome da vista (continua no menu Arquivo/abas); busca vira lupa que expande ao focar; menu Arquivo em uma coluna com seções em faixa; diálogos em tela cheia; faixa começa recolhida; popups viram folha na base. |
| ≤ 600 px | Abas de vista com rótulo elíptico e menu de excedentes em folha; barra de status em duas linhas com o grupo Orto/Polar rolável; tabelas largas rolam dentro da própria tabela; camadas de parede/piso/laje/forro/telhado viram cartões; Unidades vira formulário em blocos. |

### Faixa recolhível

O botão `▾/▴` no fim da linha de abas recolhe o corpo da faixa (padrão no celular: largura ≤ 700 px ou altura
≤ 500 px). Tocar numa aba expande a faixa. A escolha fica em `hestia.ribbonMin`.

### Nenhum comando perdido

- O acesso rápido da barra de título usa o mesmo `FitRow` da faixa: o que não cabe vai para `»`.
- A linha de abas e a barra de controle da vista já usavam `FitRow`; os popups agora rolam por dentro e, no
  celular, abrem como folha na base.
- O menu Arquivo mantém os 9 itens; no celular eles quebram em linhas em vez de sair da tela.
- Diálogos de tipo mantêm todas as abas e campos; a lista lateral de componentes vira um `select` nativo no
  celular.
- Tabelas que não cabem rolam dentro de si (não empurram o corpo do diálogo).

## Arquivos principais

- `apps/web/src/ui/useNarrow.ts` — hook reativo de largura (`matchMedia` + `useSyncExternalStore`) e leitura
  pontual para ações fora do React.
- `apps/web/src/editor/state.ts` — `ribbonMin`, persistência e fechamento das gavetas ao trocar de vista.
- `apps/web/src/ui/TitleBar.tsx` — acesso rápido em `FitRow`.
- `apps/web/src/ui/Ribbon.tsx` — faixa recolhível e aba que expande.
- `apps/web/src/ui/InfoCenter.tsx` — busca focável pelo contêiner (lupa no celular).
- `apps/web/src/ui/Dock.tsx`, `dock.css`, `App.tsx` — gaveta com scrim e largura limitada.
- `apps/web/src/ui/ViewTabs.tsx` — rótulo elíptico e largura reativa.
- `apps/web/src/ui/dialogs/*` — cabeçalho de tipo, unidades, DXF, materiais, CAD, abertura, camadas.
- `apps/web/src/styles.css` e `ribbon.css` — blocos no fim de cada arquivo (não alteram as regras de desktop).

## Verificação

`npm run test:responsivo` abre o app em Chrome com Playwright em 360×640, 390×844, 844×390, 768×1024,
1024×768 e 1280×800 (toque emulados nos menores) e verifica:

- sem rolagem horizontal da página e sem transbordo da barra de título;
- os 9 itens do menu Arquivo visíveis e alcançáveis;
- gaveta com scrim, largura ≤ 86vw e fechamento ao tocar fora;
- faixa recolhida no celular e expansão ao tocar na aba; popups dentro da tela;
- 32 diálogos (todos os tipos + tabelas, unidades, materiais, DXF, CAD, atalhos, publicar…) dentro da tela,
  com rodapé visível e sem rolagem horizontal do corpo;
- alvos de toque ≥ 28 px nas barras e ≥ 40 px nos menus;
- screenshots em `test-results/responsivo/<tag>/` para revisão visual.

O desktop é o controle: 1280×800 continua com faixa de 84 px, barras de 26 px e painéis lado a lado.

## Limites conhecidos

- A emulação do Chrome não reproduz `env(safe-area-inset-*)` do iOS nem a barra de URL dinâmica; o CSS já usa
  `safe-area-inset` e `dvh`, mas a aceitação final pede um aparelho real.
- O menu de contexto do desenho continua no clique direito; o gesto de toque prolongado não foi incluído nesta
  decisão.
- Tabelas muito largas (quantitativos, categorias de ambiente) ainda rolam na horizontal dentro do diálogo;
  é functional, mas um layout em cartões para elas fica como próximo passo.
