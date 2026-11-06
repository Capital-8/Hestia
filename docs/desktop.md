# Casca desktop do Hestia (Tauri)

A pasta `desktop/` empacota o app web (`apps/web/dist`) numa janela nativa
Windows, com instalador NSIS e atualização automática pelo GitHub Releases.
Ela tem `package.json` e lockfile próprios: não mexe na instalação da raiz nem no CI principal.

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
3. O workflow `release-desktop` roda no Windows: confere se a tag bate com as versões
   (falha com mensagem clara se divergirem), gera o app web, empacota o instalador,
   assina os artefatos de atualização e publica o Release com o `latest.json`.
4. No mesmo Release sobem os arquivos do app web (`index.html`, os três workers e
   `geom_wasm.wasm`). É deles que o site (`hestia-web`) tira o conteúdo de `/app`, e a meta
   `hestia-version` do HTML é o que a verificação de publicação compara com a tag.

Para repetir uma publicação, rode manualmente em Actions > release-desktop > Run workflow
e escolha a tag existente no seletor. A execução manual só funciona com uma tag `vX.Y.Z`.

## Como funciona a atualização

Ao abrir, o app consulta em segundo plano
`https://github.com/engdennylsonsantos-cloud/Hestia/releases/latest/download/latest.json`.
Se houver versão mais nova, aparece um aviso recusável com três opções:

- **Atualizar** — baixa o instalador, confere a assinatura com a chave pública embutida
  no app, instala em modo passivo e reinicia;
- **Agora não** — adia o aviso só nesta sessão;
- **Não perguntar novamente** — grava a preferência e a versão recusada no
  `localStorage` (chaves `hestia.atualizacao.*`). Uma versão **maior** que a recusada
  volta a avisar uma vez; versões iguais ou menores ficam em silêncio.

A preferência pode ser religada no diálogo **Arquivo ▸ Sobre o Hestia** (também no
ícone **?** da barra de título). A verificação manual do Sobre funciona sempre, mesmo
com o aviso automático desligado. Se a rede falhar ou a verificação não passar, o erro
vai só para o log e o app abre normalmente, sem aviso.

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
  versão e pedir que os usuários reinstalem o instalador manualmente.

## Aviso do SmartScreen

O instalador não tem certificado de assinatura de código do Windows. Por isso o SmartScreen
pode exibir "O Windows protegeu o computador". Para continuar: "Mais informações" e
"Executar assim mesmo". A assinatura usada na atualização automática é a do Tauri
(chave descrita acima), não um certificado do Windows.

## Política de conteúdo (CSP)

Definida em `desktop/src-tauri/tauri.conf.json` (`app.security`). Além do mínimo pedido
(`wasm-unsafe-eval`, `blob:` em workers e imagens, `https:` em conexões), foram necessários
dois ajustes, comprovados no teste da janela:

- `style-src` aceita `https://fonts.googleapis.com` e `font-src` aceita `https://fonts.gstatic.com`,
  porque o `index.html` carrega as fontes IBM Plex do Google Fonts.
- `dangerousDisableAssetCspModification: ["style-src"]`: sem isso, o Tauri acrescenta um nonce
  ao `style-src`, o que faz o navegador ignorar o `'unsafe-inline'` e bloqueia os estilos
  inline do app. A proteção continua valendo: só estilos de `'self'`, `'unsafe-inline'` e do Google Fonts.
