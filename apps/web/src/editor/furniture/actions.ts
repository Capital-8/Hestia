import { setFurnitureToPlace } from '@hestia/tools';
import type { FurnitureAsset, Id } from '@hestia/model';
import { editor } from '../controller.ts';
import { useUi } from '../state.ts';

/** Grava o bloco no projeto (uma entrada de desfazer). */
export function addAssetToProject(asset: FurnitureAsset): void {
  editor.store.exec({ type: 'addFurnitureAsset', asset });
  useUi.setState({ status: { key: 'fur_added', args: { name: asset.name } } });
}

/** Liga a ferramenta de colocar para o bloco: vários cliques seguidos, Esc termina. */
export function startPlacing(assetId: Id): void {
  setFurnitureToPlace(assetId);
  useUi.setState({ dialog: null, dialogArg: null });
  editor.setTool('furniture');
}

/** Exclui um bloco sem uso (o comando recusa se houver cópias). Devolve true se excluiu. */
export function deleteUnusedAsset(assetId: Id): boolean {
  try {
    editor.store.exec({ type: 'deleteFurnitureAsset', id: assetId });
    useUi.setState({ status: { key: 'fur_block_deleted' } });
    return true;
  } catch {
    useUi.setState({ status: { key: 'fur_block_in_use' } });
    return false;
  }
}
