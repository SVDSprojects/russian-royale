import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';

for (const game of ['jeopardy','roulette']) it(`${game} integrates with real accounts, membership, deadlines and durable results`, async()=>{
 let clock=Date.now(); const app=createApp({dbPath:':memory:',testMode:true,now:()=>clock});
 try {
 const players=[request.agent(app.app),request.agent(app.app),request.agent(app.app)];
 for(const [i,p] of players.entries()) await p.post('/api/auth/register').send({email:`${i}@${game}.test`,username:`Игрок ${i}`,password:'Import-test-password!'}).expect(201);
 const server=(await players[0].post('/api/servers').send({name:'Игровой сервер',description:''}).expect(200)).body;
 const invite=(await players[0].post(`/api/servers/${server.id}/invites`).send({}).expect(200)).body;
 await players[1].post(`/api/invites/${invite.token}/join`).send({}).expect(200);
 const base=`/api/games/${game}`;
 const settings=game==='jeopardy'?{contentId:'demo',teamCount:2}:{contentId:'demo',mode:'points',durations:[5000,5000,5000]};
 const created=(await players[0].post(base+'/rooms').send({serverId:server.id,name:'Партия',settings,commandId:randomUUID(),expectedVersion:0}).expect(200)).body;
 const path=base+'/rooms/'+created.roomId;
 await players[2].get(path+'/view').expect(404);
 await players[0].get(base+'/admin/content').expect(403);
 await players[1].post(path+'/join').send({commandId:randomUUID(),expectedVersion:created.version}).expect(200);
 async function command(i:number,kind:string,extra={}) {
  const v=(await players[i].get(path+'/view').expect(200)).body;
  return (await players[i].post(path+'/'+kind).send({...extra,commandId:randomUUID(),expectedVersion:v.version}).expect(200)).body;
 }
 await command(0,'ready',{ready:true});await command(1,'ready',{ready:true});
 let v=await command(0,'start');
 expect(v.view.contentSnapshot).toBeUndefined();expect(v.view.reveal).toBeNull();
 for(let step=0;step<400 && v.view.phase!=='finished';step++) {
  clock+=5000;
  // Real connected clients keep their presence while deadlines advance.
  v=(await players[0].get(path+'/view').expect(200)).body;
  await players[1].get(path+'/view').expect(200);
  app.tick();
 }
 expect(v.view.phase).toBe('finished');
 expect(app.db.prepare(`SELECT count(*) n FROM rr_${game}_results`).get().n).toBe(1);
 app.tick();expect(app.db.prepare(`SELECT count(*) n FROM rr_${game}_results`).get().n).toBe(1);
 const again=await command(0,'rematch');expect(again.view.phase).toBe('lobby');
 expect(again.view.sessionId).not.toBe(v.view.sessionId);
 }finally{app.close();}
});
