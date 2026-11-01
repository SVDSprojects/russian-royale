import {z} from 'zod';
export const SettingsSchema=z.object({night:z.number().int().min(10).max(180).default(60),discussion:z.number().int().min(10).max(180).default(90),voting:z.number().int().min(10).max(120).default(30),mafia:z.number().int().min(1).max(4).optional(),doctors:z.number().int().min(0).max(2).default(1),detectives:z.number().int().min(0).max(2).default(1),seats:z.number().int().min(1).max(15).optional(),mode:z.enum(['solo','speed']).default('solo')}).strict();
export type Settings=z.infer<typeof SettingsSchema>;
export const TaskSchema=z.object({id:z.string().max(80),ruleId:z.string().max(100),prompt:z.string().max(2000),options:z.array(z.string().max(200)).max(10),acceptedAnswers:z.array(z.string().max(500)).min(1),explanation:z.string().max(2000),difficulty:z.number().int().min(1).max(3),revision:z.number().int().positive(),status:z.enum(['draft','published'])}).strict();
export const TextSchema=z.object({id:z.string(),title:z.string().max(200),tokens:z.array(z.object({id:z.string().max(80),text:z.string().max(1000)}).strict()).min(1).max(2000),errorMap:z.record(z.string(),z.object({allowedReplacements:z.array(z.string().max(1000)).min(1),explanation:z.string(),ruleId:z.string()}).strict()),status:z.enum(['draft','published'])}).strict().superRefine((t,c)=>{const ids=t.tokens.map(x=>x.id);if(new Set(ids).size!==ids.length)c.addIssue({code:'custom',message:'Повтор ID токена'});for(const [id,e]of Object.entries(t.errorMap)){const tok=t.tokens.find(x=>x.id===id);if(!tok||e.allowedReplacements.includes(tok.text))c.addIssue({code:'custom',message:'Неверная карта исправлений'});}});
export const ContentSchema=z.object({tasks:z.array(TaskSchema).max(1000),texts:z.array(TextSchema).max(100),cards:z.array(z.object({id:z.string(),type:z.number().int().min(0).max(5),text:z.string().max(500)}).strict()).max(1000),scenarios:z.array(z.string().max(2000)).max(100)}).strict();
export type Content=z.infer<typeof ContentSchema>;
export const ActionSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('start')}).strict(),z.object({type:z.literal('ready'),ready:z.boolean()}).strict(),
 z.object({type:z.literal('vote'),target:z.string().max(80).nullable()}).strict(),
 z.object({type:z.literal('night'),target:z.string().max(80),answer:z.string().max(500).optional()}).strict(),
 z.object({type:z.literal('reveal'),index:z.number().int().min(0).max(5)}).strict(),
 z.object({type:z.literal('answer'),answer:z.string().max(500)}).strict(),
 z.object({type:z.literal('edit'),token:z.string().max(80),replacement:z.string().max(1000)}).strict(),
 z.object({type:z.literal('submit')}).strict(),z.object({type:z.literal('chat'),text:z.string().trim().min(1).max(300)}).strict()
]);
export type Action=z.infer<typeof ActionSchema>;
export type Context={nowMs:number;randomInt:(maxExclusive:number)=>number};
export type Player={id:string;username:string;ready:boolean;alive:boolean;role:string;cards:string[];open:number[];tokens:number;earned:number;hintUsed:boolean;lastHeal:string|null;score:number};
export type Result={sessionId:string;winnerUserIds:string[];scores:{userId:string;score:number}[];outcome:'win'|'draw'|'cancelled'};
export type State={sessionId:string;hostId:string;settings:Settings;contentSnapshot:Content;participants:Player[];phase:string;deadline:number|null;round:number;votes:Record<string,string|null>;moves:Record<string,{target:string;answer?:string}>;drafts:Record<string,Record<string,string>>;submitted:Record<string,number>;privateNotes:Record<string,string[]>;log:string[];chat:{userId:string;text:string;dead:boolean}[];tie:string[];result:Result|null;scenario:string};
export type View={sessionId:string;hostId:string;phase:string;deadline:number|null;round:number;participants:{id:string;username:string;ready:boolean;alive:boolean;role?:string;cards:{index:number;text:string}[];score:number}[];self:{role:string;allies:string[];notes:string[];tokens:number;cards:string[];submitted:boolean};task:{prompt:string;options:string[]}|null;text:{title:string;tokens:{id:string;text:string}[];errorMap?:Content['texts'][number]['errorMap']}|null;draft:Record<string,string>;log:string[];chat:State['chat'];result:Result|null;scenario:string};
export type Input={sessionId:string;hostId:string;participants:{id:string;username:string}[];settings:Settings;contentSnapshot:Content;ctx:Context};
export type Props={view:View;currentUserId:string;send:(action:Action)=>Promise<void>;connection:'online'|'reconnecting'|'offline';serverNowMs:number;onExit:()=>void};
export class GameError extends Error{constructor(public status:number,message:string){super(message);}}
export function check(ok:unknown,message='Действие сейчас недоступно'):asserts ok{if(!ok)throw new GameError(422,message);}
