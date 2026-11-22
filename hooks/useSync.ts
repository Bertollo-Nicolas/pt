'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/lib/supabase';
import { mergeSyncedConfig } from '@/lib/sync-config';
const DEBOUNCE_MS=1500;
export function useSync(){
  const ready=useRef(false),loading=useRef(false),applying=useRef(false),dirty=useRef(false),sending=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pendingSince=useRef(0);
  const flushRef=useRef<(closing?:boolean)=>Promise<void>>(async()=>{});
  const [syncState,setSyncState]=useState<'loading'|'saving'|'synced'|'offline'>('loading');
  const flush=useCallback(async(closing=false)=>{
    if(!ready.current||!dirty.current||sending.current)return;
    sending.current=true;dirty.current=false;pendingSince.current=0;let success=false;
    const state=useAppStore.getState();
    const body=JSON.stringify({srs:state.srs,config:state.config,sessions:state.sessions,errors:state.errors,heatmap:state.heatmap});
    try{
      const response=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:closing&&new TextEncoder().encode(body).length<60000});
      if(!response.ok)throw new Error('Sync failed');
      success=true;setSyncState(dirty.current?'saving':'synced');
    }catch{dirty.current=true;setSyncState('offline');}
    finally{sending.current=false;if(success&&dirty.current&&!closing){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>void flushRef.current(),0);}}
  },[]);
  flushRef.current=flush;
  const schedule=useCallback(()=>{
    dirty.current=true;if(!ready.current)return;
    setSyncState('saving');if(timer.current)clearTimeout(timer.current);
    if(!pendingSince.current)pendingSince.current=Date.now();
    timer.current=setTimeout(()=>void flushRef.current(),Math.max(0,Math.min(DEBOUNCE_MS,5000-(Date.now()-pendingSince.current))));
  },[]);
  useEffect(()=>{
    const load=async()=>{
      if(loading.current||ready.current)return;
      loading.current=true;
      try{
        const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();
        if(!user){setSyncState('offline');return;}
        const response=await fetch('/api/sync');if(!response.ok)throw new Error('Load failed');
        const data=await response.json();
        applying.current=true;
        const state=useAppStore.getState();
        const config=mergeSyncedConfig(state.config,data.config??{});
        if(JSON.stringify(config)!==JSON.stringify(data.config??{}))dirty.current=true;
        useAppStore.setState({config,...(data.srs?{srs:data.srs}:{}),...(data.sessions?{sessions:data.sessions}:{}),...(data.errors?{errors:data.errors}:{}),...(data.heatmap?{heatmap:data.heatmap}:{})});
        state.rehydrateRmData();applying.current=false;
        const filesResponse=await fetch('/api/rm-files');if(!filesResponse.ok)throw new Error('Ranges failed');
        const files:{id:string;name:string}[]=await filesResponse.json();
        const names=new Set(files.map(file=>file.name));
        for(const name of Object.keys(useAppStore.getState().rmFiles))if(!names.has(name))useAppStore.getState().deleteRmFile(name);
        for(const file of files)if(!useAppStore.getState().rmFiles[file.name]){
          const result=await fetch('/api/rm-files/'+file.id);if(!result.ok)throw new Error('Range failed');
          const {content}=await result.json();useAppStore.getState().importRmFile(file.name,content);
        }
        ready.current=true;setSyncState('synced');if(dirty.current)schedule();
      }catch{setSyncState('offline');}
      finally{applying.current=false;loading.current=false;}
    };
    void load();
    const online=()=>{if(ready.current)void flushRef.current();else void load();};
    const hidden=()=>{if(document.visibilityState==='hidden')void flushRef.current(true);else if(ready.current&&dirty.current)void flushRef.current();};
    const closing=()=>void flushRef.current(true);
    window.addEventListener('online',online);window.addEventListener('pagehide',closing);document.addEventListener('visibilitychange',hidden);
    const unsubscribe=useAppStore.subscribe((state,previous)=>{
      if(!applying.current&&(state.srs!==previous.srs||state.config!==previous.config||state.sessions!==previous.sessions||state.errors!==previous.errors||state.heatmap!==previous.heatmap))schedule();
    });
    return()=>{unsubscribe();window.removeEventListener('online',online);window.removeEventListener('pagehide',closing);document.removeEventListener('visibilitychange',hidden);if(timer.current)clearTimeout(timer.current);void flushRef.current(true);};
  },[schedule]);
  const logout=useCallback(async()=>{await flushRef.current(true);await createClient().auth.signOut();window.location.href='/login';},[]);
  return {logout,syncState};
}
