import {usePlaybackStore,selectDisplaySong,selectDisplayLyrics,selectDisplayPlayerState} from '/src/stores/usePlaybackStore.ts';
import {bass,lowMid,mid,vocal,treble} from '/src/stores/motionSignals.ts';
// 低频传送当前行和音频能量；逐帧计算仍由 Folia 自己的 MotionValue 承担。
let timer,last='';
function publish(){const state=usePlaybackStore.getState(),song=selectDisplaySong(state),lyrics=selectDisplayLyrics(state),playing=selectDisplayPlayerState(state)==='PLAYING';const index=state.currentLineIndex;const payload={playing,title:song?.name||lyrics?.title||'',artist:song?.artists?.map(a=>a.name).join(' / ')||lyrics?.artist||'',lyric:lyrics?.lines?.[index]?.fullText||'',bands:[bass,lowMid,mid,vocal,treble].map(v=>Math.max(0,Math.min(1,v.get())))};const serialized=JSON.stringify(payload);if(last!==serialized){last=serialized;window.guaguaMusic?.publish(payload);}if(playing&&!timer)timer=setInterval(publish,125);else if(!playing&&timer){clearInterval(timer);timer=null;}}
const stop=usePlaybackStore.subscribe(publish);publish();window.addEventListener('pagehide',()=>{stop();clearInterval(timer);window.guaguaMusic?.publish({playing:false,title:'',lyric:'',bands:[]});},{once:true});
