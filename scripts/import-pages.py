from pathlib import Path
for g in ['jeopardy','roulette']:
 p=Path(f'src/games/{g}/Page.tsx')
 p.write_text(f'''import {{ useEffect }} from 'react';
import {{ useRoom }} from './live';
import {{ Game }} from './Game';
import {{ Lobby }} from './Lobby';
import {{ useAuth }} from '../../api';
import {{ ErrorNotice, Loading, go }} from '../../student/common';
function useHostLive(refresh:()=>void) {{
 useEffect(()=>{{window.addEventListener('rr-live',refresh);return ()=>window.removeEventListener('rr-live',refresh);}},[refresh]);
}}
export function Page({{ roomId }}:{{roomId:string}}) {{
 const {{user}}=useAuth(); const {{data,connection,error,client}}=useRoom(roomId,useHostLive);
 if(!data || !user) return <><ErrorNotice text={{error}}/><Loading/></>;
 const props={{view:data.view,currentUserId:user.id,send:client.send,connection,serverNowMs:data.serverNow,onExit:()=>go('games/{g}')}};
 return <><ErrorNotice text={{error}}/>{{data.view.phase==='lobby'?<Lobby {{...props}}/>:<Game {{...props}}/>}}</>;
}}
''',encoding='utf-8')
