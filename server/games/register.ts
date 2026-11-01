import {register as impostor,seedContent as seed_impostor} from './impostor';
import seedData_impostor from './impostor/content/pairs.seed.json';
import {register as whoami,seedContent as seed_whoami} from './whoami';
import seedData_whoami from './whoami/content/terms.seed.json';
import {register as alias,seedContent as seed_alias} from './alias';
import seedData_alias from './alias/content/cards.seed.json';
import {register as mafia,migrate as migrate_mafia} from './mafia';
import content_mafia from './mafia/initial-content.json';
import {register as broken_text,migrate as migrate_broken_text} from './broken-text';
import content_broken_text from './broken-text/initial-content.json';
import {register as bunker,migrate as migrate_bunker} from './bunker';
import content_bunker from './bunker/initial-content.json';
import { register as durak, migrate as migrateDurak, getNextDeadline } from './durak';
import { register as jeopardy } from './jeopardy';
import { register as roulette } from './roulette';
import { ContentSchema as jSchema } from '../../shared/games/jeopardy/types';
import { ContentSchema as rSchema } from '../../shared/games/roulette/types';
import jContent from './jeopardy/initial-content.json';
import rContent from './roulette/initial-content.json';
import type { RegisterContext } from './jeopardy/routes';
import type { Express } from 'express';
import { transaction } from '../storage';
export function registerExtraGames(app: Express, ctx: RegisterContext) {
 migrateDurak(ctx.db);
 const d = durak(app,ctx);
 migrate_bunker(ctx.db);
 ctx.db.prepare('INSERT OR IGNORE INTO rr_bunker_content VALUES(1,?)').run(JSON.stringify(content_bunker));
 migrate_broken_text(ctx.db);
 ctx.db.prepare('INSERT OR IGNORE INTO rr_broken_text_content VALUES(1,?)').run(JSON.stringify(content_broken_text));
 migrate_mafia(ctx.db);
 ctx.db.prepare('INSERT OR IGNORE INTO rr_mafia_content VALUES(1,?)').run(JSON.stringify(content_mafia));
 seed_alias(ctx.db,seedData_alias.items,'system-import',ctx.now(),true);
 const registration_alias=alias(app,ctx);
 seed_whoami(ctx.db,seedData_whoami.items,'system-import',ctx.now(),true);
 const registration_whoami=whoami(app,ctx);
 seed_impostor(ctx.db,seedData_impostor.items,'system-import',ctx.now(),true);
 const registration_impostor=impostor(app,ctx);
 const games = [{...registration_impostor,nextDeadline:registration_impostor.nextWakeAt},{...registration_whoami,nextDeadline:registration_whoami.nextWakeAt},{...registration_alias,nextDeadline:registration_alias.nextWakeAt},bunker(app,ctx),broken_text(app,ctx),mafia(app,ctx),jeopardy(app, ctx), roulette(app, ctx), {...d,nextDeadline:()=>getNextDeadline(ctx.db,ctx.now())}];
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
