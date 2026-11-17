// Declarações mínimas dos módulos de exemplos do three usados na prévia de material
// (o pacote de tipos instalado não inclui esses arquivos).
declare module 'three/examples/jsm/geometries/RoundedBoxGeometry.js' {
  import { BufferGeometry } from 'three';
  export class RoundedBoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number, segments?: number, radius?: number);
  }
}
declare module 'three/examples/jsm/environments/RoomEnvironment.js' {
  import { Scene } from 'three';
  export class RoomEnvironment extends Scene {
    constructor(renderer?: unknown);
  }
}
