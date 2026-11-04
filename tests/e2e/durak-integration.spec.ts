import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('durak joins real server accounts and starts a persistent party',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext({viewport:{width:390,height:844}});
 async function post(c:typeof a,path:string,data={}){const r=await c.request.post('http://127.0.0.1:4173/api'+path,{data});expect(r.ok(),await r.text()).toBeTruthy();return r.json();}
 try{
 for(const c of [a,b])await post(c,'/auth/register',{username:'Карточный игрок',email:randomUUID()+'@durak.test',password:'Browser-test-password-2026!'});
 for(const c of [a,b]){const r=await c.request.get('http://127.0.0.1:4173/api/servers');expect(r.ok()).toBeTruthy();}
 const roomName='Карточная партия '+randomUUID();const p=await a.newPage(),q=await b.newPage();await p.goto('http://127.0.0.1:4173/#games/durak');await p.getByLabel('Название комнаты').fill(roomName);await p.getByRole('button',{name:'Создать комнату',exact:true}).click();await expect(p.getByRole('button',{name:'Я готов',exact:true})).toBeVisible();
 await q.goto('http://127.0.0.1:4173/#games/durak');await q.getByRole('article').filter({hasText:roomName}).getByRole('button',{name:'Присоединиться',exact:true}).click();await q.getByRole('button',{name:'Я готов',exact:true}).click();await expect(p.getByText('Карточный игрок').first()).toBeVisible();await p.waitForTimeout(800);await p.getByRole('button',{name:'Я готов',exact:true}).click();await expect(p.getByRole('button',{name:'Начать партию'})).toBeEnabled();await p.getByRole('button',{name:'Начать партию'}).click();await expect(p.getByRole('button',{name:'Начать партию'})).toHaveCount(0);await q.reload();await expect(q.locator('.rr-game-durak')).toBeVisible();await expect(q.getByRole('button',{name:'Я готов',exact:true})).toHaveCount(0);await q.screenshot({path:'artifacts/durak-mobile.png',fullPage:true});
 }finally{await a.close();await b.close();}
});
