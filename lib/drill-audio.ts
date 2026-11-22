export type DrillSound='chips'|'ten'|'five';
const FILES:Record<DrillSound,string>={chips:'/audio/drill-chips.wav',ten:'/audio/drill-warning.wav',five:'/audio/drill-critical.mp3'};
/** Shared audio bus: decode once, unlock from a gesture, coalesce simultaneous tables. */
export class DrillAudio {
  private context:AudioContext|null=null;
  private buffers=new Map<DrillSound,Promise<AudioBuffer|null>>();
  private sources=new Map<AudioBufferSourceNode,DrillSound>();
  private last=new Map<DrillSound,number>();
  private generation=0;
  private enabled=true;
  constructor(private factory:()=>AudioContext=()=>new AudioContext(),private fetcher:typeof fetch=(...args)=>fetch(...args)){}
  async prime(enabled=true){
    this.setEnabled(enabled);if(!enabled)return;
    try{
      if(!this.context)this.context=this.factory();
      await this.context.resume();
      for(const kind of Object.keys(FILES) as DrillSound[])this.buffer(kind);
    }catch{/* Visual alerts and training remain available if audio is blocked. */}
  }
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.stop();}
  stop(){this.generation++;for(const source of this.sources.keys()){try{source.stop();}catch{/* Already ended. */}}this.sources.clear();this.last.clear();}
  private buffer(kind:DrillSound){
    if(!this.buffers.has(kind))this.buffers.set(kind,(async()=>{
      try{const result=await this.fetcher(FILES[kind]);if(!result.ok)return null;return await this.context!.decodeAudioData(await result.arrayBuffer());}catch{return null;}
    })());
    return this.buffers.get(kind)!;
  }
  async play(kind:DrillSound){
    const context=this.context;if(!this.enabled||!context||context.state!=='running')return;
    const now=context.currentTime,previous=this.last.get(kind);
    if(previous!==undefined&&now-previous<(kind==='chips'?.09:.5))return;
    this.last.set(kind,now);const generation=this.generation,buffer=await this.buffer(kind);
    if(!buffer||!this.enabled||generation!==this.generation||context.state!=='running')return;
    if(kind==='five')for(const [source,sound]of this.sources)if(sound==='ten'){try{source.stop();}catch{/* Already ended. */}this.sources.delete(source);}
    const count=kind==='ten'?2:1;
    for(let index=0;index<count;index++){
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=kind==='chips'?.45:.75;
      source.connect(gain);gain.connect(context.destination);this.sources.set(source,kind);
      source.onended=()=>{source.disconnect();gain.disconnect();this.sources.delete(source);};
      source.start(context.currentTime+index*(buffer.duration+.08));
    }
  }
}
export const drillAudio=new DrillAudio();
