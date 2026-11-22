'use client';
import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { modePath, navigateWorkspace, parseWorkspacePath } from '@/lib/workspace-navigation';

export function useWorkspaceNavigation(){
  useEffect(()=>{
    let applying=false,userNavigated=false;
    const remember=(path:string)=>{
      const state=useAppStore.getState();
      if(state.config.workspaceNavigation?.path!==path)state.saveConfig({workspaceNavigation:{path,updatedAt:Date.now()}});
    };
    const apply=()=>{
      const route=parseWorkspacePath(window.location.pathname+window.location.search);
      if(!route)return;
      applying=true;
      const store=useAppStore.getState();
      useAppStore.setState({workspacePath:route.path,currentMode:route.mode});
      if(route.catId&&route.tabId){
        if(store.lastSpot?.catId!==route.catId||store.lastSpot?.tabId!==route.tabId)useAppStore.setState({lastSpot:{catId:route.catId,tabId:route.tabId}});
        if(!store.rmData?.categories[route.catId]?.tabs?.[route.tabId])useAppStore.setState({selectedTab:null,selectedTabKey:null});
        useAppStore.getState().selectTab(route.catId,route.tabId);
      }
      if(route.path!=='/'||store.config.workspaceNavigation)remember(route.path);applying=false;
    };
    const local=useAppStore.getState().config.workspaceNavigation;
    if(window.location.pathname==='/'&&local&&parseWorkspacePath(local.path))window.history.replaceState(window.history.state,'',local.path);
    apply();
    const event=()=>{userNavigated=true;apply();};
    window.addEventListener('popstate',event);window.addEventListener('range:navigate',event);
    const unsubscribe=useAppStore.subscribe((state,previous)=>{
      if(applying)return;
      if(state.currentMode!==previous.currentMode){userNavigated=true;navigateWorkspace(modePath(state.currentMode,state.lastSpot));}
      else if((state.currentMode==='flash'||state.currentMode==='grille')&&state.lastSpot!==previous.lastSpot){userNavigated=true;navigateWorkspace(modePath(state.currentMode,state.lastSpot));}
      else if(!userNavigated&&window.location.pathname==='/'&&state.config.workspaceNavigation!==previous.config.workspaceNavigation){
        const restored=state.config.workspaceNavigation?.path;
        if(restored&&restored!=='/'&&parseWorkspacePath(restored))navigateWorkspace(restored,true);
      }
    });
    return()=>{unsubscribe();window.removeEventListener('popstate',event);window.removeEventListener('range:navigate',event);};
  },[]);
}
