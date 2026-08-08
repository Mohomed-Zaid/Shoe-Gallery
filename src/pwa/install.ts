import { useEffect,useState } from 'react';
interface InstallPromptEvent extends Event { prompt():Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}> }
let promptEvent:InstallPromptEvent|null=null;const listeners=new Set<()=>void>();
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
if(typeof window!=='undefined'){window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event as InstallPromptEvent;listeners.forEach(fn=>fn())});window.addEventListener('appinstalled',()=>{promptEvent=null;listeners.forEach(fn=>fn())})}
export function usePWAInstall(){const[,refresh]=useState(0);useEffect(()=>{const fn=()=>refresh(v=>v+1);listeners.add(fn);return()=>{listeners.delete(fn)}},[]);return{canInstall:Boolean(promptEvent)&&!standalone(),isInstalled:standalone(),install:async()=>{if(!promptEvent)return false;await promptEvent.prompt();const result=await promptEvent.userChoice;if(result.outcome==='accepted')promptEvent=null;listeners.forEach(fn=>fn());return result.outcome==='accepted'}}}
