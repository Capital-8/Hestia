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

Para repetir uma publicação, rode manualmente em Actions > release-desktop > Run workflow
e escolha a tag existente no seletor. A execução manual só funciona com uma tag `vX.Y.Z`.

## Como funciona a atualização

Ao abrir, o app consulta em segundo plano
`https://github.com/engdennylsonsantos-cloud/Hestia/releases/latest/download/latest.json`.
Se houver versão mais nova, pergunta "Atualizar agora?" (Atualizar / Depois).
Ao aceitar, baixa o instalador, confere a assinatura com a chave pública embutida
no app, instala em modo passivo e reinicia. Se a rede falhar ou a verificação não passar,
o erro vai só para o log e o app abre normalmente, sem aviso.

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
