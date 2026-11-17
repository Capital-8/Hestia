/** O bundler (Vite) transforma `...?worker&inline` em um construtor de Worker com o código embutido no arquivo único. */
declare module '*?worker&inline' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}
