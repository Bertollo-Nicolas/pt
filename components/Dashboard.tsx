'use client';
import { useAppStore } from '@/store/appStore';
import { getRangeGroups } from '@/lib/range-options';
import { addDays, todayStr } from '@/lib/utils';
import { srsRequiresDrill } from '@/lib/srs';
import type { Mode, Session } from '@/lib/types';
import { Icon, type IconName } from './ui/Icon';
const sessionScore=(session:Session)=>{const count=(session.correct??0)+(session.wrong??0)+(session.imprecision??0);return session.score??(count?Math.round((session.correct??0)/count*100):null);};
export function Dashboard({onLibrary}:{onLibrary:()=>void}){
  const {rmData,sessions,srs,setMode,selectedTab,config}=useAppStore();
  const rangeCount=getRangeGroups(rmData).reduce((sum,group)=>sum+group.tabs.length,0);
  const today=todayStr(),due=Object.values(srs).filter(item=>item.nextReview<=today||srsRequiresDrill(item)).length;
  const week=Array.from({length:7},(_,index)=>{const date=addDays(today,index-6);return {date,count:sessions.filter(item=>item.date.slice(0,10)===date).length};});
  const scenarios=config.scenarioDrill?.scenarios.length??0;
  const scores=sessions.map(sessionScore).filter((value):value is number=>value!==null);
  const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
  const tools:{title:string;description:string;mode:Mode;icon:IconName;meta:string}[]=[
    {title:'Range builder',description:'Reconstruis ta range, puis compare chaque main.',mode:'grille',icon:'grid',meta:'MÉMORISER'},
    {title:'Flashcards',description:'Une main à la fois. Travaille tes réflexes de décision.',mode:'flash',icon:'flash',meta:'DÉCIDER'},
    {title:'Drills',description:'Joue tes scénarios du début à la fin, à ton rythme.',mode:'drill',icon:'roadmap',meta:'METTRE EN SITUATION'},
    {title:'Révisions',description:'Retrouve les ranges à revoir et consolide tes acquis.',mode:'srs',icon:'calendar',meta:'RETENIR'},
  ];
  return <div className="home-scroll"><div className="home-workspace"><header className="home-intro"><div><span className="overline">TON ESPACE D’ENTRAÎNEMENT</span><h1>Moins d’hésitation.<br/><span>Plus de maîtrise.</span></h1><p>Des ranges aux décisions. Choisis ce que tu veux travailler.</p></div><button className="home-library-link" onClick={onLibrary}><Icon name="folder" size={24}/><strong>Ta bibliothèque</strong><span>{rangeCount} range{rangeCount===1?'':'s'} disponible{rangeCount===1?'':'s'}</span><Icon name="chevron" size={16}/></button></header>
    <section className="home-tools" aria-label="Choisir un entraînement">{tools.map((tool,index)=><button key={tool.mode} onClick={()=>setMode(tool.mode)} className={tool.mode==='drill'?'home-tool is-featured':'home-tool'}><span className="home-tool-top"><Icon name={tool.icon} size={23}/><small>0{index+1}</small></span><span className="overline">{tool.meta}</span><h2>{tool.title}</h2><p>{tool.description}</p><span className="home-tool-bottom">{tool.mode==='drill'?scenarios+(scenarios===1?' scénario créé':' scénarios créés'):tool.mode==='srs'?due+(due===1?' range à réviser':' ranges à réviser'):'Commencer'}<Icon name="chevron" size={16}/></span></button>)}</section>
    <div className="home-bottom"><section className="home-history"><div className="home-section-title"><h2>Dernières sessions</h2>{selectedTab&&<button onClick={()=>setMode('flash')}>Reprendre {selectedTab.name} ↗</button>}</div>{sessions.length?<div className="home-session-list">{sessions.slice(-4).reverse().map((session,index)=><div key={session.id??index}><span className="home-session-icon"><Icon name={session.mode==='flash'?'flash':'grid'} size={17}/></span><span><b>{session.name}</b><small>{session.catName}</small></span><span>{session.mode==='flash'?'Flashcards':'Builder'}</span><strong>{sessionScore(session)===null?'—':sessionScore(session)+' %'}</strong><small>{session.date.slice(0,10).split('-').reverse().join('/')}</small></div>)}</div>:<div className="home-no-sessions"><Icon name="chart" size={24}/><div><h3>À toi de jouer.</h3><p>Les résultats de tes entraînements apparaîtront ici.</p></div><button onClick={()=>rangeCount?setMode('flash'):onLibrary()}>Commencer ↗</button></div>}</section>
    <aside className="home-activity"><div className="home-section-title"><h2>Cette semaine</h2><span>{week.reduce((sum,day)=>sum+day.count,0)} session{week.reduce((sum,day)=>sum+day.count,0)===1?'':'s'}</span></div><div className="home-week-bars">{week.map(day=><div key={day.date}><span style={{height:Math.max(3,day.count/Math.max(1,...week.map(item=>item.count))*64)}}/><small>{new Intl.DateTimeFormat('fr-FR',{weekday:'narrow'}).format(new Date(day.date+'T12:00:00'))}</small></div>)}</div><div className="home-activity-stats"><span>Précision moyenne<b>{avg===null?'—':avg+' %'}</b></span><span>Décisions en drill<b>{config.scenarioDrill?.total??0}</b></span></div></aside></div>
    <footer className="home-footer"><span>RANGE / TRAINING</span><span>Construire les réflexes. Une main après l’autre.</span></footer></div></div>;
}
