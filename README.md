# Hestia

BIM para arquitetura residencial, no navegador, construído do zero com GPU em primeiro lugar
(WebGPU, com queda para WebGL2/CPU) e núcleo geométrico separado da interface.

*BIM for residential architecture, in the browser, built from scratch with GPU-first rendering
(WebGPU, falling back to WebGL2/CPU) and a geometry core separate from the interface.*

## Baixar e usar · Download and use

| | |
|---|---|
| **Instalador para Windows** · *Windows installer* | [**Baixar a última versão · Download the latest release**](https://github.com/engdennylsonsantos-cloud/Hestia/releases/latest) (arquivo `Hestia_x.y.z_x64-setup.exe`) |
| **Direto no navegador** · *In the browser* | [www.hestiabim.com/app](https://www.hestiabim.com/app/) |
| **Site oficial** · *Website* | [www.hestiabim.com](https://www.hestiabim.com) |
| **Todas as versões** · *All versions* | [Releases](https://github.com/engdennylsonsantos-cloud/Hestia/releases) |

- **Atualização automática.** O programa instalado verifica novas versões ao abrir e pergunta se você quer atualizar;
  não é preciso baixar o instalador de novo. *The installed app checks for new versions on start and asks before updating.*
- **Aviso do Windows.** O instalador ainda não tem certificado de código, então o Windows pode mostrar
  "O Windows protegeu o computador" na primeira instalação: *Mais informações → Executar assim mesmo*.
  *Windows may show a SmartScreen warning on first install because the installer is not code-signed yet.*
- **Idiomas · Languages.** Interface em português e inglês (menu *Arquivo → Idioma*).
- **Arquivos.** Importa e exporta IFC, exporta DXF e PDF.
- Como gerar uma versão nova: [docs/desktop.md](docs/desktop.md).

## Documentos

| Arquivo | Conteúdo |
|---|---|
| [docs/01-ARQUITETURA.md](docs/01-ARQUITETURA.md) | Camadas, GPU/CPU, núcleo em Rust/WASM, modelo de dados, comandos, regras de código |
| [docs/02-MODELO-BIM.md](docs/02-MODELO-BIM.md) | Como cada elemento funciona: tipos, camadas, parede, piso, laje, telhado, aberturas, escada |
| [docs/03-INTERFACE.md](docs/03-INTERFACE.md) | Layout, árvore de projeto, painel de propriedades, 2D x 3D, vistas, ferramentas |
| [docs/04-ROTEIRO.md](docs/04-ROTEIRO.md) | Fases de construção, critério de pronto de cada uma, o que fica fora da v1 |
| [docs/05-REFERENCIA-REVIT-ARCHICAD.md](docs/05-REFERENCIA-REVIT-ARCHICAD.md) | Como Revit e ArchiCAD funcionam de verdade, com fontes. **Manda sobre os demais** |
| [docs/paridade/](docs/paridade/paredes.md) | Checklist de paridade por elemento e porta de qualidade (≥ 95% antes de abrir o próximo) |
| [docs/07-STATUS-V1.md](docs/07-STATUS-V1.md) | O que a versão de teste já faz, o que falta e o roteiro de teste |
| [docs/06-PROPRIEDADES-E-DIALOGOS.md](docs/06-PROPRIEDADES-E-DIALOGOS.md) | Escopos de configuração, barra de opções, painel, diálogo do tipo, camadas, materiais |

## Princípios

1. O modelo guarda só o que o usuário decidiu. Tudo que é resolvido é derivado e cacheado.
2. Toda mudança é um comando, com desfazer e refazer.
3. 2D e 3D são vistas do mesmo modelo, nunca modelos separados.
4. Tipo e instância: mudar o tipo muda todas as instâncias.
5. Camadas, junções e quantitativos nascem da mesma estrutura de dados.
6. Núcleo sem interface: roda em Node e em teste, sem navegador.

## Como rodar

```bash
npm install
npm run dev
npm run check
```

Veja [docs/07-STATUS-V1.md](docs/07-STATUS-V1.md) para o estado atual e o roteiro de teste.

## Licença e contribuições

MIT. Veja [LICENSE](LICENSE). As regras de contribuição, licenciamento e marca
estão em [CONTRIBUTING.md](CONTRIBUTING.md), [LICENSING.md](LICENSING.md) e
[NOTICE](NOTICE).

A `main` recebe mudanças por pull request. Rode `npm run check` antes de abrir o
PR. Para falar de segurança, use o canal privado descrito em
[SECURITY.md](SECURITY.md). O código de conduta está em
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); relatos são recebidos pelo formulário
privado indicado nele.
