import {useState} from 'react';
import {useAuth} from '../api';import {useResource,go,ErrorNotice} from '../student/common';
import {AliasRoom,AliasCatalog} from './alias';import {WhoamiRoom,WhoamiCatalog} from './whoami';import {ImpostorRoom,ImpostorCatalog} from './impostor';
const registry={alias:{Room:AliasRoom,Catalog:AliasCatalog},whoami:{Room:WhoamiRoom,Catalog:WhoamiCatalog},impostor:{Room:ImpostorRoom,Catalog:ImpostorCatalog}};
const subscribe=(callback:()=>void)=>{window.addEventListener('rr-live',callback);return()=>window.removeEventListener('rr-live',callback);};
export function RemainingGamesPage({game,roomId}:{game:keyof typeof registry;roomId?:string}){
 const {user}=useAuth(),servers=useResource<{id:string;name:string}[]>('/servers?game='+game,true),[server,setServer]=useState('');const selected=server||servers.data?.[0]?.id||'',{Room,Catalog}=registry[game];
 if(roomId)return <Room roomId={roomId} currentUserId={user!.id} onExit={()=>go('games/'+game)} subscribe={subscribe}/>;
 return <><ErrorNotice text={servers.error}/><label>Ваш сервер <select value={selected} onChange={e=>setServer(e.target.value)}>{servers.data?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{selected?<Catalog key={selected} serverId={selected} onOpenRoom={id=>go('games/'+game+'/'+id)}/>:<p>Для игры вступите на сервер. <button onClick={()=>go('servers')}>Мои серверы</button></p>}</>;
}
