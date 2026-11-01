from pathlib import Path
import shutil
root=Path('.')
for game in ['jeopardy','roulette']:
 for folder in ['server','shared','src','public']:
  shutil.copytree(root/'imports'/game/folder/'games'/game,root/folder/'games'/game,dirs_exist_ok=True)
 dest=root/'tests'/'games'/game;dest.mkdir(parents=True,exist_ok=True)
 source=root/'imports'/game/'tests'/'games'/game/'engine.test.ts'
 (dest/'engine.test.ts').write_text(source.read_text(encoding='utf-8').replace('../../../preview/demo-content.json',f'../../../server/games/{game}/initial-content.json'),encoding='utf-8')
 shutil.copyfile(root/'imports'/game/'preview/demo-content.json',root/'server'/'games'/game/'initial-content.json')
 p=root/'server'/'games'/game/'routes.ts';s=p.read_text(encoding='utf-8').replace('(...roles: string[])','(...roles: import("../../core").Role[])');p.write_text(s,encoding='utf-8')
p=root/'server/games/register.ts';p.write_text('''import { register as jeopardy } from './jeopardy';
import { register as roulette } from './roulette';
import { ContentSchema as jSchema } from '../../shared/games/jeopardy/types';
import { ContentSchema as rSchema } from '../../shared/games/roulette/types';
import jContent from './jeopardy/initial-content.json';
import rContent from './roulette/initial-content.json';
import type { RegisterContext } from './jeopardy/routes';
import type { Express } from 'express';
import { transaction } from '../storage';
export function registerExtraGames(app: Express, ctx: RegisterContext) {
 const games = [jeopardy(app, ctx), roulette(app, ctx)];
 transaction(ctx.db, () => {
  ctx.db.exec('CREATE TABLE IF NOT EXISTS rr_game_imports (id TEXT PRIMARY KEY)');
  for (const [name, content] of [['jeopardy',jSchema.parse(jContent)],['roulette',rSchema.parse(rContent)]] as const) {
   if (!ctx.db.prepare('SELECT id FROM rr_game_imports WHERE id=?').get(name+'-v1')) {
    ctx.db.prepare(`INSERT OR IGNORE INTO rr_${name}_content(id,revision,content) VALUES(?,?,?)`).run(content.id,content.revision,JSON.stringify(content));
    ctx.db.prepare('INSERT INTO rr_game_imports(id) VALUES(?)').run(name+'-v1');
   }
  }
 });
 return { tick:()=>games.forEach(g=>g.tick()), close:()=>games.forEach(g=>g.close()), nextDeadline:()=> {
 const ds=games.map(g=>g.nextDeadline()).filter((d):d is number=>d!==null); return ds.length?Math.min(...ds):null;
 }};
}
''',encoding='utf-8')
p=root/'server/app.ts';s=p.read_text(encoding='utf-8').replace("import { registerGameRoutes }", "import { registerExtraGames } from './games/register';\nimport { registerGameRoutes }");s=s.replace('const game = registerGameRoutes(app, ctx);','const game = registerGameRoutes(app, ctx);\n  const extraGames = registerExtraGames(app, ctx);').replace('game?.tick?.();','game?.tick?.();\n    extraGames.tick();').replace('game?.close?.();','game?.close?.();\n      extraGames.close();');p.write_text(s,encoding='utf-8')
p=root/'cloudflare/worker.ts';s=p.read_text(encoding='utf-8').replace("import { registerGameRoutes }", "import { registerExtraGames } from '../server/games/register';\nimport { registerGameRoutes }").replace('private game;', 'private game;\n  private extraGames;').replace('this.game = registerGameRoutes(app, context);','this.game = registerGameRoutes(app, context);\n    this.extraGames = registerExtraGames(app, context);').replace('this.game.tick();','this.game.tick();\n    this.extraGames.tick();').replace('if (row?.deadline) {\n      const deadline = Math.max(Date.now() + 100, Number(row.deadline));', 'const deadlines = [row?.deadline, this.extraGames.nextDeadline()].filter((d) => d != null).map(Number);\n    if (deadlines.length) {\n      const deadline = Math.max(Date.now() + 100, Math.min(...deadlines));');p.write_text(s,encoding='utf-8')
