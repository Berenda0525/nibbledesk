export async function audioToWav(blob){
 const context=new AudioContext();
 try{
  const source=await context.decodeAudioData(await blob.arrayBuffer());
  const offline=new OfflineAudioContext(1,Math.ceil(source.duration*16000),16000);
  const buffer=offline.createBufferSource();buffer.buffer=source;buffer.connect(offline.destination);buffer.start();
  const rendered=await offline.startRendering(),samples=rendered.getChannelData(0);
  const data=new ArrayBuffer(44+samples.length*2),view=new DataView(data);
  const label=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
  label(0,'RIFF');view.setUint32(4,36+samples.length*2,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,samples.length*2,true);
  let energy=0,peak=0;for(const value of samples){energy+=value*value;peak=Math.max(peak,Math.abs(value));}
  const rms=Math.sqrt(energy/Math.max(1,samples.length));
  const gain=rms>.0001&&rms<.05?Math.min(6,.05/rms,.95/Math.max(peak,.0001)):1;
  samples.forEach((v,i)=>{v*=gain;view.setInt16(44+i*2,Math.max(-1,Math.min(1,v))*(v<0?32768:32767),true);});
  const bytes=new Uint8Array(data);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
 }finally{await context.close();}
}

