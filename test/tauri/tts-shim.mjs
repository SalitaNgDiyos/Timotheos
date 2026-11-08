/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Android speech shim, run with: node test/tauri/tts-shim.mjs (from the project folder)
import { build } from 'esbuild'; import fs from 'fs';
const stub = { name:'stub', setup(b){ b.onResolve({filter:/^@tauri-apps\/api\/(core|event)$/},a=>({path:a.path,namespace:'stub'})); b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path.endsWith('core')?'export const invoke=(...a)=>globalThis.__invoke(...a);':'export const listen=(n,f)=>{(globalThis.__ev[n]=globalThis.__ev[n]||[]).push(f);return Promise.resolve(()=>{});};',loader:'js'})); } };
await build({ entryPoints:['/home/claude/timotheos/tauri-shim/tts.js'], bundle:true, format:'esm', outfile:'/tmp/shimtest/out.mjs', plugins:[stub], logLevel:'silent' });
globalThis.window = globalThis; globalThis.__ev = {}; const calls=[];
globalThis.__invoke = async (cmd,args)=>{ calls.push([cmd,args]); if(cmd==='plugin:tts|is_initialized') return {initialized:true,voiceCount:2}; if(cmd==='plugin:tts|get_voices') return {voices:[{id:'v1',name:'English US',language:'en_US'},{id:'v2',name:'Filipino',language:'fil-PH'}]}; if(cmd==='plugin:tts|speak') return {success:true}; return {}; };
const { installAndroidSpeech } = await import('/tmp/shimtest/out.mjs'); installAndroidSpeech();
const sl=ms=>new Promise(r=>setTimeout(r,ms)); const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
let vc=0; speechSynthesis.addEventListener('voiceschanged',()=>vc++); await sl(700);
ok(speechSynthesis.getVoices().length===2&&vc>=1,'voices are listed and voiceschanged fires: '+JSON.stringify(speechSynthesis.getVoices()[0]));
const emit=(n,p)=>(__ev['tts://'+n]||[]).forEach(f=>f({payload:p}));
const u=new SpeechSynthesisUtterance('Hello'); u.voice=speechSynthesis.getVoices()[0]; u.rate=1.5; u.pitch=1.2; u.volume=.4; let ended=0; u.onend=()=>ended++;
speechSynthesis.speak(u); await sl(20); const sp=calls.filter(c=>c[0]==='plugin:tts|speak').pop()[1].payload;
ok(sp.text==='Hello'&&sp.voiceId==='v1'&&sp.rate===1.5&&sp.pitch===1.2&&sp.volume===.4&&sp.queueMode==='flush','speak passes text, voice, rate, pitch, volume');
emit('speech:start',{id:'a1'}); emit('speech:finish',{id:'zz'}); await sl(10); ok(ended===0,'a finish event of another utterance is ignored');
emit('speech:finish',{id:'a1'}); await sl(10); ok(ended===1,'finish → onend');
const u2=new SpeechSynthesisUtterance('Two'); let e2=0; u2.onend=()=>e2++; speechSynthesis.speak(u2); await sl(10); emit('speech:start',{id:'b1'}); speechSynthesis.cancel(); await sl(20);
ok(e2===1&&calls.some(c=>c[0]==='plugin:tts|stop'),'cancel stops the engine and ends the utterance'); emit('speech:cancel',{id:'b1'}); await sl(10); ok(e2===1,'the late cancel event does not end it twice');
const u3=new SpeechSynthesisUtterance('Three'); let er=0; u3.onerror=()=>er++; speechSynthesis.speak(u3); await sl(10); emit('speech:start',{id:'c1'}); emit('speech:error',{id:'c1',error:'x'}); await sl(10); ok(er===1,'error → onerror');
console.log(out.join('\n')); process.exit(0);
