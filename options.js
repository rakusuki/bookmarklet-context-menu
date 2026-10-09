const STORE_KEY="bookmarklets",SYNC_KEY="syncSettings",$=id=>document.getElementById(id);
const isBookmarklet=url=>/^\s*javascript\s*:/i.test(String(url||"")),makeId=()=>crypto.randomUUID();
let items=[],chromeBookmarklets=[],folders=[],sync={enabled:true,rootFolderIds:[],defaultSaveFolderId:null,lastSyncAt:null,lastSyncCount:0};
init();
chrome.storage.onChanged.addListener((c,a)=>{if(a!=="local")return;if(c[STORE_KEY])items=Array.isArray(c[STORE_KEY].newValue)?c[STORE_KEY].newValue:[];if(c[SYNC_KEY])sync={...sync,...c[SYNC_KEY].newValue};render();renderSync();renderChrome();});
async function init(){const d=await chrome.storage.local.get([STORE_KEY,SYNC_KEY]);items=Array.isArray(d[STORE_KEY])?d[STORE_KEY]:[];sync={...sync,...(d[SYNC_KEY]||{})};bind();await checkUserScriptsAvailability();await loadTree();render();renderSync();renderChrome();}
function bind(){$("save").onclick=saveItem;$("cancel").onclick=resetForm;$("search").oninput=render;$("chromeSearch").oninput=renderChrome;$("chromeSearchTarget").onchange=renderChrome;$("loadChrome").onclick=async()=>{await loadTree();renderSync();renderChrome();};$("addSyncRoot").onclick=addRoot;$("saveSyncSettings").onclick=saveSettings;$("syncNow").onclick=syncNow;$("export").onclick=exportJson;$("import").onchange=importJson;}
async function send(m){const r=await chrome.runtime.sendMessage(m);if(r?.error)throw new Error(r.error);return r;}
async function checkUserScriptsAvailability(){
 const warning=$("userScriptsWarning"),ready=$("userScriptsReady");
 try{
  if(!chrome.userScripts?.getScripts)throw new Error("userScripts API unavailable");
  await chrome.userScripts.getScripts();
  warning.hidden=true;
  ready.hidden=false;
 }catch(e){
  console.warn("User Scripts are not enabled for this extension.",e);
  ready.hidden=true;
  warning.hidden=false;
 }
}
function button(text,fn,disabled=false,cls="secondary"){const b=document.createElement("button");b.textContent=text;b.className=cls;b.disabled=disabled;b.onclick=fn;return b;}
async function persist(){items.forEach((x,i)=>x.order=i);await chrome.storage.local.set({[STORE_KEY]:items});render();}
async function saveItem(){const title=$("title").value.trim(),url=$("url").value.trim(),id=$("editId").value;if(!title||!isBookmarklet(url)){alert("名前と javascript: で始まるURLを入力してください。");return;}try{if(id){const x=items.find(v=>v.id===id);if(!x)return;if(x.chromeBookmarkId)await send({type:"UPDATE_SYNCED_BOOKMARK",bookmarkId:x.chromeBookmarkId,title,url});else{x.title=title;x.url=url;await persist();}}else if($("saveToChrome").checked){await send({type:"CREATE_SYNCED_BOOKMARK",title,url});}else{items.push({id:makeId(),title,url,chromeBookmarkId:null,order:items.length,syncedAt:null});await persist();}resetForm();}catch(e){alert(e.message);}}
function resetForm(){$("editId").value="";$("title").value="";$("url").value="";$("cancel").hidden=true;$("save").textContent="保存";}
let draggedId=null;
function render(){
 const q=$("search").value.trim().toLowerCase(),box=$("items");
 box.textContent="";
 const list=items.filter(x=>!q||x.title.toLowerCase().includes(q)||x.url.toLowerCase().includes(q));
 if(!list.length){box.innerHTML='<div class="empty">該当する登録はありません。</div>';return;}
 for(const x of list){
  const el=document.createElement("div");el.className="item";el.dataset.bookmarkletId=x.id;
  const handle=document.createElement("span");handle.className="drag-handle";handle.textContent="☰";handle.title="ドラッグして並び替え";handle.draggable=!q;
  handle.setAttribute("aria-label","並び替えハンドル");
  const info=document.createElement("div");
  info.innerHTML='<div class="item-title"></div><div class="item-url"></div>';
  info.children[0].textContent=x.title+(x.chromeBookmarkId?"  [Chrome同期]":"  [ローカル]");
  info.children[1].textContent=x.url;
  const act=document.createElement("div");act.className="actions";
  act.append(button("編集",()=>edit(x.id)),button("削除",()=>removeItem(x.id),false,"danger"));
  el.append(handle,info,act);box.append(el);
  handle.addEventListener("dragstart",e=>{
   draggedId=x.id;el.classList.add("dragging");
   e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",x.id);
  });
  handle.addEventListener("dragend",()=>{draggedId=null;clearDragStyles();});
  el.addEventListener("dragover",e=>{
   if(!draggedId||draggedId===x.id||q)return;
   e.preventDefault();e.dataTransfer.dropEffect="move";
   clearDropTargets();el.classList.add("drop-target");
  });
  el.addEventListener("dragleave",e=>{if(!el.contains(e.relatedTarget))el.classList.remove("drop-target");});
  el.addEventListener("drop",async e=>{
   if(!draggedId||q)return;
   e.preventDefault();const source=draggedId;draggedId=null;clearDragStyles();
   if(source===x.id)return;
   const from=items.findIndex(v=>v.id===source),to=items.findIndex(v=>v.id===x.id);
   if(from<0||to<0)return;
   const [moved]=items.splice(from,1);items.splice(to,0,moved);
   await persist();
  });
 }
}
function clearDropTargets(){document.querySelectorAll("#items .drop-target").forEach(el=>el.classList.remove("drop-target"));}
function clearDragStyles(){clearDropTargets();document.querySelectorAll("#items .dragging").forEach(el=>el.classList.remove("dragging"));}
function edit(id){const x=items.find(v=>v.id===id);if(!x)return;$("editId").value=x.id;$("title").value=x.title;$("url").value=x.url;$("cancel").hidden=false;$("save").textContent="更新";scrollTo({top:0,behavior:"smooth"});}
async function removeItem(id){const x=items.find(v=>v.id===id);if(!x||!confirm(`「${x.title}」を削除しますか？`))return;try{if(x.chromeBookmarkId){if(!confirm("同期済み項目のためChromeブックマーク側からも削除します。続行しますか？"))return;await send({type:"DELETE_SYNCED_BOOKMARK",bookmarkId:x.chromeBookmarkId});}else{items=items.filter(v=>v.id!==id);await persist();}}catch(e){alert(e.message);}}
async function loadTree(){const tree=await chrome.bookmarks.getTree();folders=[];chromeBookmarklets=[];const walk=(nodes,path=[])=>{for(const n of nodes){const p=[...path,n.title||"(root)"];if(!n.url)folders.push({id:n.id,path:p.join(" / "),parentId:n.parentId});if(n.url&&isBookmarklet(n.url))chromeBookmarklets.push(n);if(n.children)walk(n.children,p);}};walk(tree);}
function optionList(select,filter=()=>true){select.textContent="";for(const f of folders.filter(filter)){const o=document.createElement("option");o.value=f.id;o.textContent=f.path;select.append(o);}}
function isDescendantLocal(id,roots){const byId=new Map(folders.map(f=>[f.id,f]));let cur=id,seen=new Set();while(cur&&!seen.has(cur)){if(roots.includes(cur))return true;seen.add(cur);cur=byId.get(cur)?.parentId;}return false;}
function renderSync(){$("syncEnabled").checked=!!sync.enabled;const box=$("syncRoots");box.textContent="";for(const id of sync.rootFolderIds||[]){const f=folders.find(x=>x.id===id),el=document.createElement("div");el.className="item";const info=document.createElement("div");info.textContent=f?.path||`削除済みフォルダ (${id})`;el.append(info,button("解除",async()=>{sync.rootFolderIds=sync.rootFolderIds.filter(x=>x!==id);if(sync.defaultSaveFolderId&&!isDescendantLocal(sync.defaultSaveFolderId,sync.rootFolderIds))sync.defaultSaveFolderId=null;await saveSettings();},false,"danger"));box.append(el);}if(!box.children.length)box.innerHTML='<div class="empty">同期対象フォルダがありません。</div>';optionList($("rootFolderSelect"),f=>f.parentId);optionList($("saveFolderSelect"),f=>f.parentId&&isDescendantLocal(f.id,sync.rootFolderIds||[]));if(sync.defaultSaveFolderId)$("saveFolderSelect").value=sync.defaultSaveFolderId;$("syncStatus").textContent=`同期 ${sync.lastSyncCount||0}件 / 最終同期 ${sync.lastSyncAt?new Date(sync.lastSyncAt).toLocaleString():"未実行"}`;}
async function addRoot(){const id=$("rootFolderSelect").value;if(!id)return;if(isDescendantLocal(id,sync.rootFolderIds||[])){alert("このフォルダは既存の同期対象配下です。");return;}sync.rootFolderIds=(sync.rootFolderIds||[]).filter(old=>!isDescendantLocal(old,[id]));sync.rootFolderIds.push(id);renderSync();}
async function saveSettings(){sync.enabled=$("syncEnabled").checked;sync.defaultSaveFolderId=$("saveFolderSelect").value||null;try{await send({type:"SAVE_SYNC_SETTINGS",settings:sync});await loadTree();}catch(e){alert(e.message);}}
async function syncNow(){try{await send({type:"SYNC_NOW"});await loadTree();}catch(e){alert(e.message);}}
async function addChromeBookmarklet(bookmark){
 if(items.some(x=>x.chromeBookmarkId===bookmark.id||x.sourceChromeBookmarkId===bookmark.id)){alert("このBookmarkletはすでに登録されています。");return;}
 try{
  const result=await send({type:"MANUAL_IMPORT_BOOKMARK",bookmarkId:bookmark.id});
  const d=await chrome.storage.local.get(STORE_KEY);
  items=Array.isArray(d[STORE_KEY])?d[STORE_KEY]:[];
  const registered=items.some(x=>x.chromeBookmarkId===bookmark.id||x.sourceChromeBookmarkId===bookmark.id);
  if(!registered)throw new Error("追加処理後の登録状態を確認できませんでした。");
  render();
  renderChrome();
 }catch(e){
  console.error("Manual bookmark import failed",e);
  alert(`Bookmarkletの追加に失敗しました。\n${e.message||e}`);
 }
}
function renderChrome(){const q=$("chromeSearch").value.trim().toLowerCase(),target=$("chromeSearchTarget").value,box=$("chromeBookmarks");box.textContent="";const linked=new Set(items.map(x=>x.chromeBookmarkId).filter(Boolean)),manual=new Set(items.map(x=>x.sourceChromeBookmarkId).filter(Boolean)),list=chromeBookmarklets.filter(x=>{if(!q)return true;const t=(x.title||"").toLowerCase(),u=(x.url||"").toLowerCase();return target==="title"?t.includes(q):target==="url"?u.includes(q):t.includes(q)||u.includes(q);});if(!list.length){box.innerHTML='<div class="empty">Bookmarklet形式のChromeブックマークがありません。</div>';return;}for(const x of list){const el=document.createElement("div");el.className="item";const info=document.createElement("div");info.innerHTML='<div class="item-title"></div><div class="item-url"></div>';info.children[0].textContent=x.title;info.children[1].textContent=x.url;const act=document.createElement("div");act.className="actions";if(linked.has(x.id)){const status=document.createElement("span");status.className="note small";status.textContent="同期済み";act.append(status);}else if(manual.has(x.id)){const status=document.createElement("span");status.className="note small";status.textContent="追加済み";act.append(status);}else{act.append(button("追加",()=>addChromeBookmarklet(x),false,"secondary"));}el.append(info,act);box.append(el);}}
function exportJson(){const blob=new Blob([JSON.stringify({version:4,exportedAt:new Date().toISOString(),items:items.map(({title,url})=>({title,url}))},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`bookmarklets-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function importJson(e){try{const f=e.target.files?.[0];if(!f)return;const d=JSON.parse(await f.text()),src=Array.isArray(d)?d:d.items;if(!Array.isArray(src))throw new Error();const incoming=src.filter(x=>x&&typeof x.title==="string"&&isBookmarklet(x.url)).map((x,i)=>({id:makeId(),title:x.title,url:x.url,chromeBookmarkId:null,order:items.length+i,syncedAt:null}));if(!incoming.length)throw new Error();items.push(...incoming);await persist();alert(`${incoming.length}件インポートしました。`);}catch{alert("有効なエクスポートJSONではありません。");}finally{e.target.value="";}}
