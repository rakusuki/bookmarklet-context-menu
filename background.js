const ROOT_MENU_ID = "bookmarklet-manager-root";
const STORE_KEY = "bookmarklets", SYNC_KEY = "syncSettings", SCHEMA_KEY = "schemaVersion";
const SCHEMA_VERSION = 4, LEGACY_FOLDER_KEY = "bookmarkFolderName";
const isBookmarklet = url => /^\s*javascript\s*:/i.test(String(url || ""));
const makeId = () => crypto.randomUUID();
let syncPromise = null, importing = false;
const defaults = () => ({enabled:true, rootFolderIds:[], defaultSaveFolderId:null, lastSyncAt:null, lastSyncCount:0});

async function state(){const d=await chrome.storage.local.get([STORE_KEY,SYNC_KEY,SCHEMA_KEY]);return{items:Array.isArray(d[STORE_KEY])?d[STORE_KEY]:[],sync:{...defaults(),...(d[SYNC_KEY]||{})},schemaVersion:Number(d[SCHEMA_KEY]||0)};}
async function node(id){try{return (await chrome.bookmarks.get(id))[0]||null;}catch{return null;}}
async function inRoots(folderId, roots){const set=new Set(roots||[]),seen=new Set();let id=folderId;while(id&&!seen.has(id)){if(set.has(id))return true;seen.add(id);id=(await node(id))?.parentId||null;}return false;}

async function migrate(){
 const d=await chrome.storage.local.get([STORE_KEY,SYNC_KEY,SCHEMA_KEY,LEGACY_FOLDER_KEY]); if(Number(d[SCHEMA_KEY]||0)>=SCHEMA_VERSION)return;
 const items=(Array.isArray(d[STORE_KEY])?d[STORE_KEY]:[]).map((x,i)=>({id:x.id||makeId(),title:x.title||"(untitled)",url:x.url||"",chromeBookmarkId:x.chromeBookmarkId||x.bookmarkId||null,sourceChromeBookmarkId:x.sourceChromeBookmarkId||null,order:Number.isFinite(x.order)?x.order:i,syncedAt:x.syncedAt||null}));
 const parents=new Set(); for(const x of items.filter(x=>x.chromeBookmarkId)){const n=await node(x.chromeBookmarkId);if(n?.parentId)parents.add(n.parentId);}
 let roots=[...parents], save=roots[0]||null;
 if(!roots.length&&d[LEGACY_FOLDER_KEY]){const ms=await chrome.bookmarks.search({title:d[LEGACY_FOLDER_KEY]});const f=ms.find(x=>!x.url);if(f){roots=[f.id];save=f.id;}}
 const sync={...defaults(),...(d[SYNC_KEY]||{})};if(!sync.rootFolderIds?.length)sync.rootFolderIds=roots;if(!sync.defaultSaveFolderId)sync.defaultSaveFolderId=save;
 await chrome.storage.local.set({[STORE_KEY]:items,[SYNC_KEY]:sync,[SCHEMA_KEY]:SCHEMA_VERSION});
}

async function normalize(s){
 const next={...defaults(),...s},valid=[];for(const id of [...new Set(next.rootFolderIds||[])]){const n=await node(id);if(n&&!n.url)valid.push(id);}
 const minimal=[];for(const id of valid){const n=await node(id);if(!(await inRoots(n?.parentId,valid.filter(x=>x!==id))))minimal.push(id);}next.rootFolderIds=minimal;
 if(next.defaultSaveFolderId){const f=await node(next.defaultSaveFolderId);if(!f||f.url||!(await inRoots(f.id,next.rootFolderIds)))next.defaultSaveFolderId=null;}return next;
}
async function collect(roots){const map=new Map(),walk=ns=>{for(const n of ns||[]){if(n.url&&isBookmarklet(n.url))map.set(n.id,n);if(n.children)walk(n.children);}};for(const id of roots||[]){try{walk(await chrome.bookmarks.getSubTree(id));}catch{}}return[...map.values()];}

async function syncAll(){
 await migrate();let {items,sync}=await state();sync=await normalize(sync);
 if(!sync.enabled){await chrome.storage.local.set({[SYNC_KEY]:sync});await menus(items);return{count:items.filter(x=>x.chromeBookmarkId).length};}
 const chromeItems=await collect(sync.rootFolderIds), old=new Map(items.filter(x=>x.chromeBookmarkId).map(x=>[x.chromeBookmarkId,x])),manual=new Map(items.filter(x=>!x.chromeBookmarkId&&x.sourceChromeBookmarkId).map(x=>[x.sourceChromeBookmarkId,x]));
 const syncedIds=new Set(chromeItems.map(x=>x.id)),local=items.filter(x=>!x.chromeBookmarkId&&!syncedIds.has(x.sourceChromeBookmarkId));let max=items.reduce((m,x)=>Math.max(m,Number(x.order)||0),-1),now=Date.now();
 const linked=chromeItems.map(b=>{const x=old.get(b.id)||manual.get(b.id);return{id:x?.id||makeId(),title:b.title||"(untitled)",url:b.url,chromeBookmarkId:b.id,sourceChromeBookmarkId:null,order:Number.isFinite(x?.order)?x.order:++max,syncedAt:now};});
 const next=[...local,...linked].sort((a,b)=>(a.order||0)-(b.order||0));next.forEach((x,i)=>x.order=i);sync.lastSyncAt=now;sync.lastSyncCount=linked.length;
 await chrome.storage.local.set({[STORE_KEY]:next,[SYNC_KEY]:sync,[SCHEMA_KEY]:SCHEMA_VERSION});await menus(next);return{count:linked.length};
}
function requestSync(){if(syncPromise)return syncPromise;syncPromise=syncAll().catch(e=>{console.error("Bookmark sync failed",e);throw e;}).finally(()=>{syncPromise=null;});return syncPromise;}
async function menus(given){await chrome.contextMenus.removeAll();chrome.contextMenus.create({id:ROOT_MENU_ID,title:"Bookmarklets",contexts:["all"]});const xs=given||(await state()).items;if(!xs.length){chrome.contextMenus.create({id:"empty",parentId:ROOT_MENU_ID,title:"No bookmarklets registered",enabled:false,contexts:["all"]});return;}for(const x of [...xs].sort((a,b)=>(a.order||0)-(b.order||0)))chrome.contextMenus.create({id:`bm:${x.id}`,parentId:ROOT_MENU_ID,title:x.title||"(untitled)",contexts:["all"]});}

chrome.runtime.onInstalled.addListener(()=>requestSync());chrome.runtime.onStartup.addListener(()=>requestSync());chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((c,a)=>{if(a==="local"&&c[STORE_KEY]&&!syncPromise)menus();});
for(const ev of [chrome.bookmarks.onCreated,chrome.bookmarks.onChanged,chrome.bookmarks.onMoved,chrome.bookmarks.onRemoved])ev.addListener(()=>{if(!importing)requestSync();});
chrome.bookmarks.onImportBegan.addListener(()=>{importing=true;});chrome.bookmarks.onImportEnded.addListener(()=>{importing=false;requestSync();});
chrome.runtime.onMessage.addListener((m,_s,send)=>{(async()=>{
 if(m?.type==="SYNC_NOW")return requestSync();
 if(m?.type==="SAVE_SYNC_SETTINGS"){const s=await normalize({...defaults(),...(m.settings||{})});await chrome.storage.local.set({[SYNC_KEY]:s});return requestSync();}
 if(m?.type==="CREATE_SYNCED_BOOKMARK"){const s=await normalize((await state()).sync);if(!s.defaultSaveFolderId)throw new Error("新規保存先が設定されていません。");const n=await chrome.bookmarks.create({parentId:s.defaultSaveFolderId,title:m.title,url:m.url});await requestSync();return{bookmarkId:n.id};}
 if(m?.type==="UPDATE_SYNCED_BOOKMARK"){await chrome.bookmarks.update(m.bookmarkId,{title:m.title,url:m.url});await requestSync();return{ok:true};}
 if(m?.type==="DELETE_SYNCED_BOOKMARK"){await chrome.bookmarks.remove(m.bookmarkId);await requestSync();return{ok:true};}
 return null;
})().then(send).catch(e=>send({error:e.message||String(e)}));return true;});
chrome.contextMenus.onClicked.addListener(async(info,tab)=>{if(!tab?.id||!String(info.menuItemId).startsWith("bm:"))return;const x=(await state()).items.find(v=>v.id===String(info.menuItemId).slice(3));if(!x)return;try{await run(tab.id,x.url);}catch(e){console.error("Bookmarklet execution failed",e);}});
function strip(url){return String(url||"").replace(/^\s*javascript\s*:/i,"");}
async function run(tabId,url){if(!isBookmarklet(url))throw new Error("Not a javascript: bookmarklet");if(!chrome.userScripts?.execute)throw new Error("User Scripts are not enabled for this extension.");await chrome.userScripts.execute({target:{tabId},js:[{code:strip(url)}],world:"MAIN",injectImmediately:true});}
