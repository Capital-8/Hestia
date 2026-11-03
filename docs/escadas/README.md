# Escadas · material de referência (pesquisa, sem implementação)

Nenhuma ferramenta de escada foi criada ainda. Este diretório reúne o material para definir o comportamento (Revit e ArchiCAD)
antes de abrir o elemento (ver `docs/04-ROTEIRO.md` e `docs/paridade/ORDEM.json`: telhados precisam fechar o item bloqueante A5).

| Arquivo | Conteúdo | Limitação |
|---|---|---|
| `A-revit-componente.md` | Revit, escada por componente (tipos de lance, regras, patamares, apoios, corrimão) | só trechos de busca (help.autodesk.com bloqueado) |
| `B-revit-croqui.md` | Revit, escada por croqui (Boundary, Riser, Stair Path, conversão) | idem |
| `C-archicad.md` | ArchiCAD, Stair Tool | só trechos de busca (help.graphisoft.com bloqueado) |
| `D-normas-ifc.md` | NBR 9050/9077, Blondel, IFC (IfcStair, IfcStairFlight) | fontes secundárias |
| `E-mapa-codigo.md` | o que do projeto atual se reaproveita e onde a escada entra | confiável (leitura do código) |
| `PROMPT-pesquisa-externa.md` (removido; ver histórico do git) | prompt para um agente com acesso à web confirmar os pontos `[?]` | — |
| `RELATORIO-pesquisa-externa.md` | **resultado** do prompt acima (2026-10-20): 78 IDs com citação literal, URL, versão e categoria | hosts oficiais abriram nesta sessão; IFC4.3 lido pelo repositório-fonte (os sites do buildingSMART devolvem 403) |

Os itens marcados `[?]` ou `[SECUNDÁRIO]` não devem virar regra sem confirmação em fonte primária.
