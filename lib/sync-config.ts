import type { AppConfig } from './types';
/** Remote preferences are authoritative, except newer local workspace checkpoints. */
export function mergeSyncedConfig(local:Partial<AppConfig>,remote:Partial<AppConfig>):Partial<AppConfig>{
  const merged={...local,...remote};
  for(const key of ['workspaceNavigation','drillWorkspace','scenarioDrill'] as const){
    const localValue=local[key],remoteValue=remote[key];
    if(localValue&&(!remoteValue||(localValue.updatedAt??0)>(remoteValue.updatedAt??0)))Object.assign(merged,{[key]:localValue});
  }
  return merged;
}
