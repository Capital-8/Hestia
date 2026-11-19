import type { ReactElement } from 'react';
import type { DialogKind } from '../../editor/state.ts';
import { BeamScheduleDialog } from './BeamScheduleDialog.tsx';
import { BeamTypeDialog } from './BeamTypeDialog.tsx';
import { CollabDialog } from './CollabDialog.tsx';
import { ColumnScheduleDialog } from './ColumnScheduleDialog.tsx';
import { ColumnTypeDialog } from './ColumnTypeDialog.tsx';
import { NorthArrowFamiliesDialog, RevisionCloudFamiliesDialog, SpotFamiliesDialog, TextFamiliesDialog } from './ExtraAnnotationFamilyDialogs.tsx';
import { LotFamiliesDialog, TerrainTextFamiliesDialog } from './TerrainLotFamilyDialogs.tsx';
import { TerrainTypeDialog } from './TerrainTypeDialog.tsx';
import { FootingScheduleDialog } from './FootingScheduleDialog.tsx';
import { FootingTypeDialog } from './FootingTypeDialog.tsx';
import { TagAllDialog } from './TagAllDialog.tsx';
import { TagFamiliesDialog } from './TagFamiliesDialog.tsx';

/** Diálogos das famílias de anotação (etiquetas, texto, cotas de nível e de coordenada, nuvem, norte) e da tríade estrutural. */
export function DialogoExtra({ kind, arg }: { kind: DialogKind; arg: string | null }): ReactElement | null {
  switch (kind) {
    case 'tagFamilies':
      return <TagFamiliesDialog />;
    case 'tagAll':
      return <TagAllDialog />;
    case 'textFamilies':
      return <TextFamiliesDialog />;
    case 'spotFamilies':
      return <SpotFamiliesDialog />;
    case 'revisionCloudFamilies':
      return <RevisionCloudFamiliesDialog />;
    case 'northArrowFamilies':
      return <NorthArrowFamiliesDialog />;
    case 'terrainTypes':
      return <TerrainTypeDialog />;
    case 'terrainContourFamilies':
      return <TerrainTextFamiliesDialog kind="contour" />;
    case 'terrainSpotFamilies':
      return <TerrainTextFamiliesDialog kind="spot" />;
    case 'lotFamilies':
      return <LotFamiliesDialog />;
    case 'columnType':
      return <ColumnTypeDialog typeId={arg ?? undefined} />;
    case 'beamType':
      return <BeamTypeDialog typeId={arg ?? undefined} />;
    case 'footingType':
      return <FootingTypeDialog typeId={arg ?? undefined} />;
    case 'columnSchedule':
      return <ColumnScheduleDialog />;
    case 'beamSchedule':
      return <BeamScheduleDialog />;
    case 'footingSchedule':
      return <FootingScheduleDialog />;
    case 'collab':
      return <CollabDialog />;
    default:
      return null;
  }
}
