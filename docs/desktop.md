# Casca desktop do Hestia (Tauri)

A pasta `desktop/` empacota o app web (`apps/web/dist`) numa janela nativa para
**Windows** (instalador NSIS) e **Linux** (AppImage, `.deb` e `.rpm`), com atualização
automática pelo GitHub Releases. Ela tem `package.json` e lockfile próprios: não mexe na
instalação da raiz nem no CI principal.

## Como testar antes de publicar

O workflow [`build-desktop`](../.github/workflows/build-desktop.yml) gera os pacotes dos
dois sistemas **sem publicar Release**. Ele roda:

- automaticamente em todo push para uma branch que comece com `feat/desktop-linux`;
- manualmente em **Actions ▸ build-desktop ▸ Run workflow** (em qualquer branch em que o
  workflow já exista).

No fim da execução, baixe os artefatos em **Actions ▸ build-desktop ▸ (execução) ▸
Artifacts**: `hestia-windows-latest` (o `.exe`) e `hestia-ubuntu-22.04` (`.AppImage`,
`.deb`, `.rpm`, com os `.sig` do atualizador). Os artefatos ficam guardados por 14 dias.

Rodar no Linux:

```bash
chmod +x Hestia_*.AppImage            # AppImage baixado não vem com permissão de execução
./Hestia_*.AppImage                   # se o FUSE não estiver disponível: --appimage-extract-and-run

sudo apt install ./Hestia_*_amd64.deb # .deb (o apt instala as dependências: webkit2gtk-4.1, GTK3)
sudo dnf install ./Hestia-*.x86_64.rpm
```

Roteiro mínimo de teste por sistema (fazer em máquina real, não só no runner):

1. Abre e mostra a tela de projetos.
2. Escolher pasta, criar projeto, salvar com **Ctrl+S**, conferir `projeto.hestia.json`
   e o `.bak` na pasta.
3. Miniatura do card aparece e sobrevive a fechar/abrir (F5 e reabrir o app).
4. Abrir um IFC de teste e exportar IFC/DXF.
5. Vista 3D: órbita, zoom e seleção. É o ponto mais sensível no Linux — o WebKitGTK usa
   a GPU do sistema, e driver/WebGL2 variam entre distribuições.
6. **Arquivo ▸ Sobre o Hestia**: mostra a versão e a verificação de atualização não quebra
   (erro de rede só vai para o log).
7. Atalhos e diálogos nativos (abrir/salvar pasta) respondem.

## Como gerar uma versão

1. Suba a versão nos dois arquivos que o workflow confere:
   - `package.json` (raiz), campo `version`;
   - `desktop/src-tauri/tauri.conf.json`, campo `version`.
   Mantenha também iguais `desktop/package.json` e `desktop/src-tauri/Cargo.toml`
   (o workflow não confere esses dois).
2. Faça commit e crie a tag com o mesmo número, no formato `vX.Y.Z`:
   ```
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
3. O workflow `release-desktop` roda em matriz: `windows-latest` gera o `.exe` e
   `ubuntu-22.04` gera AppImage, `.deb` e `.rpm`. Cada job confere se a tag bate com as
   versões (falha com mensagem clara se divergirem), gera o app web, empacota, assina os
   artefatos de atualização e publica tudo no mesmo Release com o `latest.json`.
4. No mesmo Release sobem os arquivos do app web (`index.html`, os três workers e
   `geom_wasm.wasm`), publicados uma única vez, pelo job do Windows. É deles que o site
   (`hestia-web`) tira o conteúdo de `/app`, e a meta `hestia-version` do HTML é o que a
   verificação de publicação compara com a tag.

A matriz roda **em fila** (`max-parallel: 1`, ~20 min no total): o `latest.json` é um
arquivo único e cada job mescla a sua plataforma nele. Em paralelo, as duas leituras+
gravações podem se atropelar e perder a entrada da outra plataforma.

Para repetir uma publicação, rode manualmente em Actions ▸ release-desktop ▸ Run workflow
e escolha a tag existente no seletor. A execução manual só funciona com uma tag `vX.Y.Z`.

## Buildar localmente

No Linux (Ubuntu 22.04+, mesmas dependências do runner):

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf \
  build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev
npm ci
npm run build                    # gera apps/web/dist
cd desktop && npm ci && npx tauri build
```

Os pacotes saem em `desktop/src-tauri/target/release/bundle/` (`appimage/`, `deb/`,
`rpm/`; no Windows, `nsis/`). O alvo de cada sistema vem do `tauri.conf.json` (Windows,
NSIS) e do `tauri.linux.conf.json` (Linux, AppImage + deb + rpm), que o Tauri mescla
sozinho na plataforma certa.

O build é sempre nativo: não há cross-compile no projeto. Por isso a matriz do GitHub
Actions usa um runner de cada sistema, e o Linux é empacotado no **Ubuntu 22.04** — o
glibc dele (2.35) define a distribuição mínima suportada (Ubuntu 22.04+, Debian 12+,
Fedora 36+).

## Como funciona a atualização

Ao abrir, o app consulta em segundo plano
`https://github.com/engdennylsonsantos-cloud/Hestia/releases/latest/download/latest.json`.
O arquivo tem uma entrada por plataforma (`windows-x86_64`, `linux-x86_64` e as variantes
`-nsis`/`-appimage`); cada app lê só a sua. Se houver versão mais nova, aparece um aviso
recusável com três opções:

- **Atualizar** — baixa o pacote, confere a assinatura com a chave pública embutida no
  app, instala e reinicia;
- **Agora não** — adia o aviso só nesta sessão;
- **Não perguntar novamente** — grava a preferência e a versão recusada no
  `localStorage` (chaves `hestia.atualizacao.*`). Uma versão **maior** que a recusada
  volta a avisar uma vez; versões iguais ou menores ficam em silêncio.

A preferência pode ser religada no diálogo **Arquivo ▸ Sobre o Hestia** (também no
ícone **?** da barra de título). A verificação manual do Sobre funciona sempre, mesmo
com o aviso automático desligado. Se a rede falhar ou a verificação não passar, o erro
vai só para o log e o app abre normalmente, sem aviso.

No Linux, o Tauri só atualiza sozinho quem instalou o **AppImage** (é o AppImage em
execução que é substituído; ele precisa estar num caminho gravável e não pode estar
rodando de mídia somente leitura). Quem instalou por `.deb`/`.rpm` recebe a mesma
verificação de versão, mas a instalação do update é feita com o gerenciador de pacotes
baixando a versão nova do Release.

A versão exibida vem do `package.json` da raiz, injetada no bundle pelo Vite. As notas
da versão em execução ficam em `apps/web/src/editor/atualizacao/auto.ts`; as notas de
uma versão nova vêm do campo `notes` do `latest.json`.

### Notas da release

O workflow usa o arquivo `docs/releases/vX.Y.Z.md` como corpo da release quando ele
existe (é esse corpo que o `tauri-action` grava no `notes` do `latest.json`). Sem o
arquivo, usa um texto padrão. Crie o arquivo com as notas da versão antes de empurrar
a tag.

## Chave de assinatura

- A chave **privada** nunca vai para o repositório. Ela fica em dois lugares: como
  segredo do GitHub (`TAURI_SIGNING_PRIVATE_KEY`, com a senha em
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) e em backup guardado pelo dono, fora do repositório.
- A chave **pública** (`pubkey` em `tauri.conf.json`) pode ficar no repositório: ela só verifica.
- Se a chave privada se perder, os apps já instalados não aceitam novas versões assinadas
  por outra chave. Nesse caso é preciso gerar um novo par, trocar a `pubkey`, publicar uma
  versão e pedir que os usuários reinstalem o pacote manualmente.

## Avisos por sistema

**Windows** — o instalador não tem certificado de assinatura de código do Windows. Por
isso o SmartScreen pode exibir "O Windows protegeu o computador". Para continuar: "Mais
informações" e "Executar assim mesmo". A assinatura usada na atualização automática é a
do Tauri (chave descrita acima), não um certificado do Windows.

**Linux** — não há assinatura de código a pagar nem quarentena. O AppImage baixado pelo
navegador pode perder a permissão de execução (resolvido com `chmod +x`), e alguns
gerenciadores de arquivos pedem confirmação antes de abrir. O `.deb`/`.rpm` passa pelo
gerenciador de pacotes, que confia no arquivo baixado do próprio Release.

### Se o app fechar ao abrir (VM ou ambiente sem GPU)

Em máquina virtual, contêiner ou host sem aceleração gráfica, o WebKitGTK pode encerrar
logo na abertura — no log aparece `WebProcess didn't exit as expected after the UI process
connection was closed`. É limitação do renderizador por software, não do Hestia. Nesses
ambientes, rode com as variáveis abaixo (o 3D fica lento, mas a interface funciona):

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 \
  hestia-desktop
# AppImage:
WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 \
  ./Hestia_0.2.2_amd64.AppImage
```

Comprovado no teste da 0.2.2 em VM VirtualBox com Xubuntu 24.04.

## Política de conteúdo (CSP)

Definida em `desktop/src-tauri/tauri.conf.json` (`app.security`). Além do mínimo pedido
(`wasm-unsafe-eval`, `blob:` em workers e imagens, `https:` em conexões), foram necessários
dois ajustes, comprovados no teste da janela:

- `style-src` aceita `https://fonts.googleapis.com` e `font-src` aceita `https://fonts.gstatic.com`,
  porque o `index.html` carrega as fontes IBM Plex do Google Fonts.
- `dangerousDisableAssetCspModification: ["style-src"]`: sem isso, o Tauri acrescenta um nonce
  ao `style-src`, o que faz o navegador ignorar o `'unsafe-inline'` e bloqueia os estilos
  inline do app. A proteção continua valendo: só estilos de `'self'`, `'unsafe-inline'` e do Google Fonts.
