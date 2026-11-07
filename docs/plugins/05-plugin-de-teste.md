# Plugin de teste

`TestPlugin` (`packages/plugin-api/src/testkit.ts`) é a implementação de referência do **lado do plugin**, em TypeScript, e
a contraparte dos testes. Não é o renderizador.

```ts
import { TestPlugin, createMemoryPair } from '@hestia/plugin-api';
const [hostSide, pluginSide] = createMemoryPair();   // hostSide vai para HostSession/PluginHost
const plugin = new TestPlugin(pluginSide, {
  manifest: { id: 'dev.exemplo.meu', name: 'Meu plugin', version: '0.1.0', hestiaApi: '1.0', kind: 'analysis', capabilities: ['scene.read'] },
});
plugin.hello();
```

Em **outra linguagem**: abra um servidor WebSocket em loopback; ao aceitar a conexão envie `hello` (ver 02); responda
`ack` a cada mensagem com `seq`; responda `ping`; aplique `scene.delta` conferindo `baseRevision` (senão `scene.resync`);
nunca reenvie `camera.update` com `origin` `hestia` como `camera.set`.

## Testes
```
npx vitest run packages/plugin-api apps/web/src/plugins
```
Cobrem: abertura pela aba Suplementos; negociação e estados (ausente, conectado, incompatível por protocolo, por API e por
tipo); snapshot e deltas de objetos e materiais; câmera nos dois sentidos sem eco; queda, reconexão e heartbeat;
substituição persistida sem alterar a origem; permissão negada; recusa de imagem; endereço só loopback.
