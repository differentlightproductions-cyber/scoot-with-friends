import {DatabaseSync} from 'node:sqlite';
import {hash,verify,Algorithm} from '@node-rs/argon2';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {PARTS,defaultScooter,type ScooterLoadout} from '../src/data/scooterParts';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
export const ACCOUNT_POLICY={welcomeCredit:1500,starterPrice:900,sessionMs:86400000};
export class Accounts {
 db:DatabaseSync;
 constructor(path:string){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,username TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,recovery_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'player',credit INTEGER NOT NULL CHECK(credit>=0),stage TEXT NOT NULL,loadout TEXT,revision INTEGER NOT NULL DEFAULT 0,cart TEXT,ban_until INTEGER,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS ownership(account_id TEXT NOT NULL REFERENCES accounts(id),part_id TEXT NOT NULL,variant_id TEXT NOT NULL,PRIMARY KEY(account_id,part_id,variant_id));
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),event_key TEXT NOT NULL,amount INTEGER NOT NULL,reason TEXT NOT NULL,actor TEXT,created INTEGER NOT NULL,UNIQUE(account_id,event_key));
 PRAGMA user_version=1;`);}
 private atomic<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private row(id:string){const row=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id) as any;if(!row)throw Error('Account unavailable');if(row.ban_until&&(row.ban_until===-1||row.ban_until>Date.now()))throw Error('Online access restricted');return row;}
 get(id:string){const r=this.row(id);return {id:r.id,username:r.username,role:r.role,credit:r.credit,stage:r.stage,revision:r.revision,scooter:r.loadout?JSON.parse(r.loadout):null,cart:r.cart?JSON.parse(r.cart):null,owned:this.db.prepare('SELECT part_id,variant_id FROM ownership WHERE account_id=?').all(id)};}
 async register(username:string,password:string){const normalized=username.normalize('NFKC').trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(normalized)||normalized==='charizard495'||password.length<12||password.length>128)throw Error('Registration unavailable. Check username and password requirements.');
  const encoded=await hash(password,{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1}),recovery=secret(),id=randomUUID();
  this.atomic(()=>{this.db.prepare('INSERT INTO accounts(id,username,normalized,password_hash,recovery_hash,credit,stage,created) VALUES(?,?,?,?,?,?,?,?)').run(id,username.trim(),normalized,encoded,digest(recovery),ACCOUNT_POLICY.welcomeCredit,'building_starter',Date.now());this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,'welcome',ACCOUNT_POLICY.welcomeCredit,'Welcome Credit',null,Date.now());});return {account:this.get(id),recovery};
 }
 async login(username:string,password:string){const row=this.db.prepare('SELECT id,password_hash FROM accounts WHERE normalized=?').get(username.normalize('NFKC').trim().toLowerCase()) as any;if(!row||!await verify(row.password_hash,password))throw Error('Sign-in failed');this.row(row.id);const token=secret();this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),row.id,Date.now()+ACCOUNT_POLICY.sessionMs);return {account:this.get(row.id),token};}
 authenticate(token:string){const s=this.db.prepare('SELECT account_id FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),Date.now()) as any;if(!s)throw Error('Sign in again');return this.get(s.account_id);}
 logout(token:string){this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
 private validBuild(build:ScooterLoadout,starter=false){const defaults=defaultScooter();for(const slot of Object.keys(defaults) as (keyof ScooterLoadout)[]){const part=PARTS.find(p=>p.id===build?.[slot]?.partId),category=slot==='frontWheel'||slot==='rearWheel'?'wheels':slot;if(!part||part.category!==category||!part.variants.some(v=>v.id===build[slot].variantId)||(starter&&part.brandId!=='lazer'))throw Error('Invalid build');}return structuredClone(build);}
 saveCart(id:string,build:ScooterLoadout){this.row(id);const cart=this.validBuild(build,true);this.db.prepare('UPDATE accounts SET cart=? WHERE id=? AND stage=?').run(JSON.stringify(cart),id,'building_starter');return this.get(id);}
 checkout(id:string,key:string,build:ScooterLoadout){if(!/^[a-zA-Z0-9_-]{8,100}$/.test(key))throw Error('Invalid request');return this.atomic(()=>{const r=this.row(id);if(this.db.prepare('SELECT id FROM ledger WHERE account_id=? AND event_key=?').get(id,'starter:'+key))return this.get(id);if(r.stage!=='building_starter')throw Error('Starter already completed');const scooter=this.validBuild(build,true);if(r.credit<ACCOUNT_POLICY.starterPrice)throw Error('Insufficient Credit');
  for(const part of Object.values(scooter))this.db.prepare('INSERT OR IGNORE INTO ownership VALUES(?,?,?)').run(id,part.partId,part.variantId);
  this.db.prepare('UPDATE accounts SET credit=credit-?,loadout=?,revision=revision+1,stage=?,cart=NULL WHERE id=?').run(ACCOUNT_POLICY.starterPrice,JSON.stringify(scooter),'ready_to_ride',id);
  this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,'starter:'+key,-ACCOUNT_POLICY.starterPrice,'Complete Lazer starter with included hardware',null,Date.now());return this.get(id);
 });}
 equip(id:string,build:ScooterLoadout,revision:number){return this.atomic(()=>{const r=this.row(id);if(r.stage!=='ready_to_ride'||r.revision!==revision)throw Error('Setup changed. Reload and retry');const scooter=this.validBuild(build);for(const item of Object.values(scooter)){const part=PARTS.find(p=>p.id===item.partId)!;if(part.unlockType!=='free'&&!this.db.prepare('SELECT 1 FROM ownership WHERE account_id=? AND part_id=? AND variant_id=?').get(id,item.partId,item.variantId))throw Error('Part not owned');}this.db.prepare('UPDATE accounts SET loadout=?,revision=revision+1 WHERE id=?').run(JSON.stringify(scooter),id);return this.get(id);});}
 close(){this.db.close();}
}
