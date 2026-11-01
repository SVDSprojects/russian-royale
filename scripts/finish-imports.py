from pathlib import Path
p=Path('src/games/GameRooms.tsx');s=p.read_text(encoding='utf-8').replace("const selected=", "const [mode,setMode]=useState('points'),[teamCount,setTeamCount]=useState(2);\n const selected=").replace('teamCount:2','teamCount').replace("mode:'points'",'mode');s=s.replace('<label>Название комнаты', '''{game==='roulette'?<label>Режим<select aria-label="Режим игры" value={mode} onChange={e=>setMode(e.target.value)}><option value="points">На очки</option><option value="elimination">На выбывание</option><option value="speed">На скорость</option></select></label>:<label>Команд<select aria-label="Число команд" value={teamCount} onChange={e=>setTeamCount(Number(e.target.value))}>{[2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label>}
 <label>Название комнаты''');p.write_text(s,encoding='utf-8')
p=Path('tests/e2e/platform.spec.ts');s=p.read_text(encoding='utf-8').replace("locator('.rr-game-card.upcoming')).toHaveCount(9)","locator('.rr-game-card.upcoming')).toHaveCount(7)");s+='''
for(const game of ['jeopardy','roulette']) test(game+' imported game lobby works inside the site',async({page})=>{
 await signup(page,'Новые игры');
 await api(page.context(),'/servers',{name:'Новый сервер',description:''});
 await page.goto('/#games/'+game);
 await page.getByRole('button',{name:'Создать партию',exact:true}).click();
 await expect(page.getByRole('button',{name:'Я готов',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Я готов',exact:true}).click();
 await expect(page.getByRole('button',{name:'Отменить готовность',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button',{name:'Отменить готовность',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await noOverflow(page);
 await page.screenshot({path:'artifacts/'+game+'-integrated-mobile.png',fullPage:true});
});
''';p.write_text(s,encoding='utf-8')
