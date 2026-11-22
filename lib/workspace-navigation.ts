import type { Mode } from './types';

export const WORKSPACE_ROUTES = {home:'/',flash:'/flashcards',grille:'/builder',srs:'/revisions',drill:'/drills'} as const;
export type WorkspaceMode = keyof typeof WORKSPACE_ROUTES;
export interface WorkspaceRoute { mode:WorkspaceMode; path:string; catId?:string; tabId?:string; editorId?:string; sessionId?:string }
export function parseWorkspacePath(input:string):WorkspaceRoute|null {
  if(!input.startsWith('/')||input.startsWith('//')||input.includes('\\')) return null;
  let url:URL;try{url=new URL(input,'https://range.local');}catch{return null;}
  const pathname=url.pathname.replace(/\/$/,'')||'/';
  const found=Object.entries(WORKSPACE_ROUTES).find(([,path])=>path===pathname);
  const editor=pathname.match(/^\/drills\/scenarios\/([a-zA-Z0-9_-]+)$/);
  const session=pathname.match(/^\/drills\/session\/([a-zA-Z0-9_-]+)$/);
  if(!found&&!editor&&!session)return null;
  const mode=(found?.[0]??'drill') as WorkspaceMode;
  const catId=url.searchParams.get('cat')||undefined,tabId=url.searchParams.get('tab')||undefined;
  const search=new URLSearchParams();
  if(catId&&tabId){search.set('cat',catId);search.set('tab',tabId);}
  return {mode,path:pathname+(search.size?'?'+search.toString():''),...(catId&&tabId?{catId,tabId}:{}),...(editor?{editorId:editor[1]}:{}),...(session?{sessionId:session[1]}:{})};
}
export function modePath(mode:Mode,spot?:{catId:string;tabId:string}|null) {
  const base=WORKSPACE_ROUTES[mode as WorkspaceMode]??'/';
  if(spot&&(mode==='flash'||mode==='grille'))return base+'?'+new URLSearchParams({cat:spot.catId,tab:spot.tabId});
  return base;
}
/** Native history keeps the workspace mounted, while every URL also has a server route. */
export function navigateWorkspace(path:string,replace=false) {
  const route=parseWorkspacePath(path);if(!route||typeof window==='undefined')return;
  const current=window.location.pathname+window.location.search;
  if(current!==route.path)window.history[replace?'replaceState':'pushState'](window.history.state,'',route.path);
  window.dispatchEvent(new Event('range:navigate'));
}
