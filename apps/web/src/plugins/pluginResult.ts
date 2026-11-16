import { create } from 'zustand';
import type { HandlerResult } from './supRuntime.ts';

/** Último resultado de handler a mostrar no diálogo `pluginResult` (um de cada vez; o novo substitui o anterior). */
export const usePluginResult = create<{ result: HandlerResult | null }>(() => ({ result: null }));

export const setPluginResult = (result: HandlerResult | null): void => usePluginResult.setState({ result });
