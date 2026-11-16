# Runtime web, segurança, decisões e pendências

## O que o navegador não pode
Instalar, descobrir ou **iniciar** aplicativos nativos. Por isso o usuário inicia o programa e o Hestia só conecta a
`ws://127.0.0.1`, `localhost` ou `[::1]` nas portas 1024 a 65535. `validateEndpoint` recusa qualquer outro host ou porta; o
manifesto não tem caminho de executável. Não há loja nem download automático.

## Limitações conhecidas
- **Safari e HTTPS:** pode bloquear `ws://` vindo de página HTTPS (conteúdo misto). No desktop (Tauri) a CSP foi aberta
  para `ws://127.0.0.1:*` e `ws://localhost:*`; no navegador depende da política dele.
- **Autenticação:** o protocolo 1.1 tem pareamento por token, **obrigatório** para processo externo ([07](07-pareamento-por-token.md)).
  Além dele o plugin **deve validar o cabeçalho `Origin`** e escutar apenas em loopback. O token fica no `localStorage`
  (menos seguro que o cofre do sistema; o desktop ainda não tem comando de cofre) e a tela avisa.
- **Geometria:** vem das malhas com faixas por elemento da cena 3D montada. Entidades instanciadas sem faixas e elementos de
  níveis ainda não montados saem com `mesh: null`; o material por triângulo sai `null` (usa-se `materialIds` do tipo).
  Texturas: contrato pronto, mas o Hestia ainda não as tem.
- **Escala:** geometria como números em JSON; adequado a protótipo. Quadros binários ou compactados ficam para a 1.x.
- **Câmera:** a órbita não emite eventos; há amostragem a cada 80 ms só com sessão assinante. A órbita é "olhar para o
  alvo": `up` e roll do plugin são descartados.
- As substituições entram no desfazer do projeto; o `projectUid` é criado no primeiro uso (marca o projeto como alterado).

## Pendências
O protocolo está validado contra um **processo Rust separado** por WebSocket real ([06](06-validacao-processo-rust.md)); o
processo ainda **não desenha**. Pendentes: geometria de um projeto real, transporte binário, texturas, Linux/macOS.
