import type { ProviderBundle } from './index'; import { unavailableProvider } from './index';
export async function loadProvider():Promise<ProviderBundle>{return unavailableProvider();}
