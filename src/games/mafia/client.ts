import type {Action,View} from '../../../shared/games/mafia/types';
export type Envelope={view:View;version:number;serverNow:number;roomId:string};
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{const res=await fetch('/api/games/mafia'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers}});const data=await res.json();if(!res.ok)throw new Error(data.error??'Ошибка запроса');return data as T;}
export function command(room:string,version:number,action:Action){const endpoint=action.type==='start'?'start':action.type==='ready'?'ready':'actions';return api<Envelope>(`/rooms/${room}/${endpoint}`,{method:'POST',body:JSON.stringify({commandId:crypto.randomUUID(),expectedVersion:version,...(action.type==='ready'?{ready:action.ready}:endpoint==='actions'?{action}:{})})});}
// Production: pass the callback into the host useLive notification subscription.
export const onLiveUpdate=(reload:()=>void)=>()=>reload();
