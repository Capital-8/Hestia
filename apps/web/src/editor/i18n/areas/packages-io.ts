/**
 * Shard de dicionário: packages-io. O dicionário `io_` vive no pacote (fonte única)
 * e o app o espelha aqui para entrar em `PT_ALL`/`EN_ALL`.
 */
import { PT_IO_PACKAGE, EN_IO_PACKAGE } from '@hestia/io';

export const PT_PACKAGES_IO = PT_IO_PACKAGE;
export const EN_PACKAGES_IO: Record<keyof typeof PT_PACKAGES_IO, string> = EN_IO_PACKAGE;
