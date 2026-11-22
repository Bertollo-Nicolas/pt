const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {parseWorkspacePath,modePath}=require('../lib/workspace-navigation.ts');
const {mergeSyncedConfig}=require('../lib/sync-config.ts');
const {validCheckpoint}=require('../lib/scenario-workspace.ts');
for(const [mode,path]of Object.entries({home:'/',flash:'/flashcards',grille:'/builder',srs:'/revisions',drill:'/drills'})){
 assert.equal(modePath(mode),path);assert.equal(parseWorkspacePath(path).mode,mode);
}
assert.equal(parseWorkspacePath('/drills/scenarios/new').editorId,'new');
assert.equal(parseWorkspacePath('/drills/scenarios/uuid-123').editorId,'uuid-123');
assert.equal(parseWorkspacePath('/drills/session/uuid-123').sessionId,'uuid-123');
const spot={catId:'spin/HU & SB',tabId:'15 bb'};
const builder=modePath('grille',spot);assert.equal(parseWorkspacePath(builder).catId,spot.catId);assert.equal(parseWorkspacePath(builder).tabId,spot.tabId);
for(const unsafe of ['https://evil.test','//evil.test','/\\evil.test','/removed','/drills/session/a/b','/drills/scenarios/../anything'])assert.equal(parseWorkspacePath(unsafe),null,unsafe);
assert.equal(parseWorkspacePath('/drills?next=https://evil.test').path,'/drills');
const checkpoint={session:{id:'session-1',length:10,allocated:1,completed:0,scenarios:[],attempts:[],done:false,tables:[{id:'table-1',hand:'AKs',cards:[{rank:'A',suit:'♠'},{rank:'K',suit:'♠'}],cursor:0,phase:'feedback',chosen:'limp',correct:true,scenario:{steps:[{actor:'SB',action:'limp',amount:0}]}}]},paused:false};
assert.equal(validCheckpoint(checkpoint),true);assert.equal(validCheckpoint(null),false);
assert.equal(validCheckpoint({...checkpoint,session:{...checkpoint.session,tables:[{...checkpoint.session.tables[0],cursor:2}]}}),false);
assert.deepEqual(JSON.parse(JSON.stringify(checkpoint)),checkpoint,'Exact hand, suits and feedback phase survive serialization');
const local={threshold:90,workspaceNavigation:{path:'/drills/session/session-1',updatedAt:30},drillWorkspace:{updatedAt:30,checkpoint},scenarioDrill:{updatedAt:30,total:7,correct:6,scenarios:[],attempts:[]}};
const remote={threshold:80,workspaceNavigation:{path:'/',updatedAt:20},drillWorkspace:{updatedAt:20,checkpoint:null},scenarioDrill:{updatedAt:20,total:6,correct:5,scenarios:[],attempts:[]}};
const merged=mergeSyncedConfig(local,remote);
assert.equal(merged.threshold,80);assert.equal(merged.workspaceNavigation,local.workspaceNavigation);assert.equal(merged.drillWorkspace,local.drillWorkspace);assert.equal(merged.scenarioDrill,local.scenarioDrill);
const newer=mergeSyncedConfig(local,{...remote,drillWorkspace:{updatedAt:40,checkpoint:null}});assert.equal(newer.drillWorkspace.checkpoint,null,'A newer remote completion wins over an old local session');
assert.equal(mergeSyncedConfig(local,{}).scenarioDrill,local.scenarioDrill,'Missing remote data does not erase local progress');
const {saveUserData}=require('../lib/db.ts');
(async()=>{
 const error={message:'database refused write'};
 const fake={from:()=>({upsert:async()=>({error})})};
 await assert.rejects(saveUserData(fake,'user',{config:local}),value=>value===error,'DB errors must reach the API rather than report a false success');
 let saved;
 await saveUserData({from:()=>({upsert:async(row)=>{saved=row;return {error:null};}})},'user',{config:local});
 assert.equal(saved.user_id,'user');assert.equal(saved.config,local);
 console.log('Workspace: real routes, safe login return, range query, exact checkpoint serialization, newest local/remote config merge and DB error propagation passed.');
})().catch(error=>{console.error(error);process.exit(1);});
