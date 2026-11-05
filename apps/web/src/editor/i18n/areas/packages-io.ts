/**
 * Shard de dicionário: packages-io. O dicionário `io_` vive no pacote (fonte única)
 * e o app o espelha aqui para entrar em `PT_ALL`/`EN_ALL`.
 */
import {
  PT_IO_PACKAGE,
  EN_IO_PACKAGE,
  ES_IO_PACKAGE,
  DE_IO_PACKAGE,
  FR_IO_PACKAGE,
  IT_IO_PACKAGE,
  PL_IO_PACKAGE,
} from '@hestia/io';

export const PT_PACKAGES_IO = PT_IO_PACKAGE;
export const EN_PACKAGES_IO: Record<keyof typeof PT_PACKAGES_IO, string> = EN_IO_PACKAGE;
export const ES_PACKAGES_IO: Record<keyof typeof PT_PACKAGES_IO, string> = ES_IO_PACKAGE;
export const DE_PACKAGES_IO: Record<keyof typeof PT_PACKAGES_IO, string> = DE_IO_PACKAGE;
export const FR_PACKAGES_IO: Record<keyof typeof PT_PACKAGES_IO, string> = FR_IO_PACKAGE;
export const IT_PACKAGES_IO: Record<keyof typeof PT_PACKAGES_IO, string> = IT_IO_PACKAGE;
export const PL_PACKAGES_IO: Record<keyof typeof PT_PACKAGES_IO, string> = PL_IO_PACKAGE;
