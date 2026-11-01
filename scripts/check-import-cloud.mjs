const base='http://127.0.0.1:4175';
const clients=[{cookie:''},{cookie:''}];
async function req(i,path,data){const r=await fetch(base+'/api'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(clients[i].cookie?{cookie:clients[i].cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});const c=r.headers.get('set-cookie');if(c)clients[i].cookie=c.split(';')[0];const out=await r.json();if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(out));return out;}
for(let i=0;i<2;i++) await req(i,'/auth/register',{email:`cloud-import-${Date.now()}-${i}@example.test`,username:`Облако ${i}`,password:crypto.randomUUID()});
const server=await req(0,'/servers',{name:'Проверка импорта',description:''});
const invite=await req(0,`/servers/${server.id}/invites`,{});await req(1,`/invites/${invite.token}/join`,{});
for(const game of ['jeopardy','roulette']){
const baseGame='/games/'+game;const packs=await req(0,baseGame+'/content');if(!packs.content.length)throw Error('No content');
const settings=game==='jeopardy'?{contentId:'demo',teamCount:2}:{contentId:'demo',mode:'points',durations:[5000,5000,5000]};
const room=await req(0,baseGame+'/rooms',{serverId:server.id,name:game,settings,commandId:crypto.randomUUID(),expectedVersion:0});
const path=baseGame+'/rooms/'+room.roomId;
await req(1,path+'/join',{commandId:crypto.randomUUID(),expectedVersion:room.version});
async function command(i,kind,extra={}) {const v=await req(i,path+'/view');return req(i,path+'/'+kind,{...extra,commandId:crypto.randomUUID(),expectedVersion:v.version});}
await command(0,'ready',{ready:true});await command(1,'ready',{ready:true});await command(0,'start');
await new Promise(r=>setTimeout(r,2500));const v=await req(0,path+'/view');if(v.view.contentSnapshot||v.view.reveal)throw Error('Secret data');console.log(game+' Cloudflare OK: '+v.view.phase);
}
