/* LabelDesk interface. Everything editable in ~/Library/Application Support/LabelDesk/live/
   System WebKit + native file/Process bridge; no Node.js or Python at runtime. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const esc=x=>String(x??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const stamp=()=>new Date().toISOString();
  const uuid=()=> {
    if(crypto.randomUUID)return crypto.randomUUID().toUpperCase();
    const arr=new Uint8Array(16);crypto.getRandomValues(arr);
    arr[6]=(arr[6]&15)|64;arr[8]=(arr[8]&63)|128;
    const h=Array.from(arr,x=>x.toString(16).padStart(2,"0")).join("");
    return (h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20)).toUpperCase();
  };
  const defaultProfile=()=>({portPath:"",rasterThreshold:128,labelIntervalSeconds:1.5,
    mediaWidthMM:58,mediaHeightMM:38,mediaGapMM:2});
  const media=()=>EZ2Raster.mediaFromProfile(state.profile);
  const compatibility=doc=>EZ2Raster.compatibility(doc,media());
  const canPrint=doc=>compatibility(doc).ok && EZ2Raster.transportReady(media());
  // A newly created document follows the installed roll; old documents retain
  // their own dimensions and are never rewritten by a media-setting change.
  const newDocument=()=>({schemaVersion:1,id:uuid(),folderID:null,name:"Новая этикетка",
    widthMM:media().widthMM,heightMM:media().heightMM,gapMM:media().gapMM,
    elements:[],updatedAt:stamp()});

  let nextRequest=1;
  const requests=new Map();
  function native(action,data={}) {
    return new Promise((resolve,reject)=>{
      if(!window.webkit?.messageHandlers?.labelDesk){
        reject(new Error("Откройте LabelDesk в macOS: браузер не имеет доступа к принтеру."));
        return;
      }
      const id=nextRequest++;
      requests.set(id,{resolve,reject});
      window.webkit.messageHandlers.labelDesk.postMessage({id,action,data});
    });
  }
  window.labelDeskReceive=function(message) {
    const pending=requests.get(message.id);
    if(!pending)return;
    requests.delete(message.id);
    if(message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  };

  const state={view:"editor",templates:[],folders:[],jobs:[],profile:defaultProfile(),
    selectedID:null,selectedFolderID:null,current:null,quickValues:{},editorReady:false,
    dirty:false,running:false,stopRequested:false,ports:[],runtimePath:"",log:[],
    settingsSnapshot:{},folderFilter:"all",librarySearch:""};
  const note=(message,error=false)=>{
    $("notify").textContent=message;
    $("notify").style.color=error?"#b4333e":"";
  };
  const log=(message)=>{
    const line="["+new Date().toLocaleTimeString("ru-RU")+"] "+message;
    state.log.push(line);
    if(state.log.length>200)state.log.shift();
    $("printLog").textContent=state.log.join("\n");
  };
  function keySame(a,b){return String(a||"").toLowerCase()===String(b||"").toLowerCase();}
  function findTemplate(id){return state.templates.find(t=>keySame(t.id,id));}
  function findFolder(id){return state.folders.find(f=>keySame(f.id,id));}
  function selectedFolder(){return findFolder(state.selectedFolderID);}
  function baseTemplate(){
    const folder=selectedFolder();
    // Missing base must never silently print a different selected template.
    return folder ? (findTemplate(folder.baseTemplateID)||null) : state.current;
  }
  function isBase(id){return state.folders.some(f=>keySame(f.baseTemplateID,id));}
  function confirmDiscard(){
    return !state.dirty || window.confirm("Текущий макет не сохранён. Отменить изменения?");
  }
  function visibleTemplates(){
    return state.templates.filter(t=>{
      if(state.folderFilter==="unfiled" && t.folderID)return false;
      if(state.folderFilter!=="all" && state.folderFilter!=="unfiled" &&
         !keySame(t.folderID,state.folderFilter))return false;
      return t.name.toLocaleLowerCase().includes(state.librarySearch.toLocaleLowerCase());
    }).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru"));
  }
  function updateCounts(){
    $("pendingCount").textContent=state.jobs.filter(j=>j.state==="pending").length||"";
    $("templateCount").textContent=visibleTemplates().length;
    $("librarySummary").textContent=state.folders.length+" папок · "+state.templates.length+" шаблонов";
    $("portStatus").textContent=state.profile.portPath||"Порт не выбран";
  }
  function selectView(view){
    state.view=view;
    document.querySelectorAll("nav [data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    document.querySelectorAll("main .view").forEach(v=>v.classList.toggle("active",v.id===view+"View"));
    if(view==="editor"){syncEditor();renderEditorCompatibility();}
    if(view==="quick")renderQuick();
    if(view==="queue")renderQueue();
    if(view==="settings")renderSettings();
  }
  function syncEditor(){
    if(state.editorReady && state.current){
      $("editorFrame").contentWindow.postMessage({
        source:"labeldesk-app",type:"load",
        document:clone(state.current),media:media()
      },"*");
    }
  }
  function renderEditorCompatibility(){
    const doc=state.current;
    const check=compatibility(doc);
    $("editorCompatibility").textContent=check.ok ? "" :
      "Несовместим с установленным рулоном. " + check.reason +
      " Макет сохранится без изменения размеров.";
  }
  window.addEventListener("message",ev=>{
    if(ev.source!==$("editorFrame").contentWindow || ev.data?.source!=="labeldesk-editor")return;
    const {type,json}=ev.data;
    if(type==="ready"){
      state.editorReady=true;
      syncEditor();
    }else if(type==="document"){
      try{
        const doc=JSON.parse(json);
        if(doc?.elements?.length>150)throw Error("Слишком много слоёв");
        if(state.current && keySame(doc.id,state.current.id)){
          state.current=doc;state.dirty=true;
          renderEditorCompatibility();
          if(state.view==="quick")renderQuick();
        }
      }catch(e){note("Ошибка редактора: "+e.message,true);}
    }else if(type==="save"){saveCurrent();}
  });

  function renderLibrary(){
    updateCounts();
    const folderCount=id=>state.templates.filter(t=>keySame(t.folderID,id)).length;
    const folderRow=(id,title,glyph,count)=>'<button class="item '+
      (keySame(id,state.folderFilter)?'active':'')+'" data-folder="'+esc(id)+'">'+
      '<span class="sidebar-row"><span class="glyph">'+glyph+'</span><span class="item-content">'+
      esc(title)+'</span><span class="count">'+count+'</span></span></button>';
    $("folders").innerHTML=
      folderRow("all","Все шаблоны","▦",state.templates.length)+
      folderRow("unfiled","Без папки","□",folderCount(null))+
      state.folders.slice().sort((a,b)=>a.name.localeCompare(b.name,"ru")).map(f=>
        folderRow(f.id,f.name,"▣",folderCount(f.id))).join("");
    const visible=visibleTemplates();
    $("templates").innerHTML=visible.length?visible.map(t=>{
      const check=compatibility(t);
      const base=isBase(t.id);
      return '<button class="item '+(keySame(t.id,state.selectedID)?'active':'')+
        '" data-template="'+esc(t.id)+'" title="'+esc(check.ok?"Подходит к установленному рулону":check.reason)+'">'+
        '<span class="sidebar-row"><span class="glyph">'+(base?'★':'▤')+'</span>'+
        '<span class="item-content">'+esc(t.name)+
        '<small>'+esc(t.widthMM)+' × '+esc(t.heightMM)+' мм · зазор '+esc(t.gapMM)+' мм</small>'+
        (base?'<small>Базовый макет</small>':'')+
        (check.ok?'':'<small class="media-incompatible">⚠ Несовместим с рулоном</small>')+
        '</span></span></button>';
    }).join(""):'<p class="empty">Здесь пока нет шаблонов.</p>';
    const folder=selectedFolder();
    if(folder){
      const choices=state.templates.filter(t=>keySame(t.folderID,folder.id))
        .sort((a,b)=>a.name.localeCompare(b.name,"ru"));
      const base=findTemplate(folder.baseTemplateID);
      $("folderDetail").innerHTML='<h3>'+esc(folder.name)+'</h3>'+
        '<p>Базовый макет: '+(base?esc(base.name):'<span class="media-incompatible">не назначен</span>')+'</p>'+
        '<label for="baseChoice">Назначить базовый шаблон</label>'+
        '<select id="baseChoice">'+choices.map(t=>'<option value="'+esc(t.id)+'"'+
          (keySame(t.id,folder.baseTemplateID)?' selected':'')+'>'+esc(t.name)+'</option>').join("")+'</select>'+
        '<div class="actions"><button data-library-action="set-base" '+(!choices.length?'disabled':'')+
        '>Назначить</button><button data-library-action="fill-base" '+(!base?'disabled':'')+
        '>Заполнить</button><button data-library-action="edit-base" '+(!base?'disabled':'')+
        '>Изменить макет</button></div><div class="actions">'+
        '<button data-library-action="rename-folder">Переименовать</button>'+
        '<button data-library-action="delete-folder" class="danger">Удалить папку</button></div>';
    }else{
      $("folderDetail").innerHTML="";
    }
    const chosen=findTemplate(state.selectedID);
    if(chosen && visible.some(t=>keySame(t.id,chosen.id))){
      const targets=[{id:"unfiled",name:"Без папки"},...state.folders];
      $("templateDetail").innerHTML='<h3>Действия с шаблоном</h3><p>'+
        esc(chosen.name)+'</p><div class="actions">'+
        '<button data-library-action="edit-selected">Редактировать</button>'+
        '<button data-library-action="duplicate-selected">Создать копию</button></div>'+
        '<label for="moveTarget">Переместить в папку</label><select id="moveTarget">'+
        targets.map(f=>'<option value="'+esc(f.id)+'"'+
          (keySame(chosen.folderID,f.id)||(f.id==="unfiled"&&!chosen.folderID)?' selected':'')+
          '>'+esc(f.name)+'</option>').join("")+'</select>'+
        '<div class="actions"><button data-library-action="move-selected" '+
        (isBase(chosen.id)?'disabled title="Сначала назначьте другой базовый макет"':'')+
        '>Переместить</button>'+
        '<button data-library-action="delete-selected" class="danger" '+
        (isBase(chosen.id)?'disabled title="Сначала назначьте другой базовый макет"':'')+
        '>Удалить шаблон</button></div>';
    }else{
      $("templateDetail").innerHTML="";
    }
  }
  function selectTemplate(id){
    const t=findTemplate(id);
    if(!t||!confirmDiscard())return;
    state.current=clone(t);
    state.selectedID=t.id;
    state.dirty=false;state.quickValues={};
    renderLibrary();
    selectView("editor");
    note("Открыт макет: "+t.name);
  }
  function selectFolder(id){
    const filter=id==="all"||id==="unfiled"?id:String(id);
    if(filter===state.folderFilter)return;
    // Simply filtering the library must not destroy unsaved editor state.
    if(filter==="all"||filter==="unfiled"){
      state.folderFilter=filter;state.selectedFolderID=null;
      renderLibrary();if(state.view==="quick")renderQuick();
      return;
    }
    const folder=findFolder(filter);
    if(!folder||!confirmDiscard())return;
    state.folderFilter=folder.id;
    state.selectedFolderID=folder.id;
    const base=findTemplate(folder.baseTemplateID);
    state.current=base?clone(base):null;
    state.selectedID=base?.id||null;
    state.dirty=false;state.quickValues={};
    renderLibrary();
    selectView("quick");
    note("Папка: "+folder.name+(base?"":" · назначьте базовый макет"));
  }
  async function saveTemplateDocument(doc){
    await native("saveTemplate",{document:JSON.stringify(doc)});
    const index=state.templates.findIndex(t=>keySame(t.id,doc.id));
    if(index<0)state.templates.push(clone(doc));
    else state.templates[index]=clone(doc);
  }
  async function saveFolderList(folders){
    await native("saveData",{key:"folders",json:JSON.stringify(folders)});
    state.folders=folders;
  }
  async function saveCurrent(){
    if(!state.current){note("Сначала выберите или создайте макет",true);return false;}
    const saved=clone(state.current);
    saved.updatedAt=stamp();
    try{
      await saveTemplateDocument(saved);
      if(state.current && keySame(saved.id,state.current.id)){
        state.current=clone(saved);
        state.selectedID=saved.id;
        state.dirty=false;
      }
      renderLibrary();renderEditorCompatibility();
      note("Макет сохранён: "+saved.name);
      return true;
    }catch(e){note("Ошибка сохранения макета: "+e.message,true);return false;}
  }
  function makeCurrent(){
    if(!confirmDiscard())return;
    const doc=newDocument();
    doc.folderID=state.selectedFolderID||null;
    state.current=doc;
    state.selectedID=doc.id;
    state.quickValues={};state.dirty=true;
    renderLibrary();selectView("editor");
    note("Новый макет: размеры из настроек рулона");
  }
  async function duplicateCurrent(){
    const original=findTemplate(state.selectedID)||state.current;
    if(!original){note("Выберите шаблон для копирования",true);return;}
    if(state.dirty && !confirmDiscard())return;
    const copy=clone(original);
    copy.id=uuid();
    copy.name=original.name+" — копия";
    copy.updatedAt=stamp();
    try{
      await saveTemplateDocument(copy);
      state.current=clone(copy);
      state.selectedID=copy.id;state.dirty=false;state.quickValues={};
      renderLibrary();selectView("editor");
      note("Копия сохранена: "+copy.name);
    }catch(e){note("Копия не создана: "+e.message,true);}
  }
  async function deleteCurrent(){
    const doc=findTemplate(state.selectedID);
    if(!doc){note("Выберите сохранённый шаблон",true);return;}
    if(isBase(doc.id)){note("Этот шаблон базовый. Сначала назначьте другой базовый макет папки.",true);return;}
    if(state.dirty&&!confirmDiscard())return;
    if(!window.confirm("Удалить шаблон «"+doc.name+"»? Это действие нельзя отменить."))return;
    try{
      await native("deleteTemplate",{id:doc.id});
      state.templates=state.templates.filter(t=>!keySame(t.id,doc.id));
      const next=visibleTemplates()[0]||state.templates[0];
      state.current=next?clone(next):newDocument();
      state.selectedID=state.current.id;
      state.dirty=false;state.quickValues={};
      renderLibrary();selectView("editor");
      note("Шаблон удалён: "+doc.name);
    }catch(e){note("Не удалось удалить: "+e.message,true);}
  }
  async function addFolder(){
    const name=window.prompt("Название новой папки","Новая папка")?.trim();
    if(!name)return;
    if(name.length>60){note("Название папки — максимум 60 символов",true);return;}
    if(state.folders.some(f=>keySame(f.name,name))){
      note("Папка с таким названием уже есть",true);return;
    }
    if(state.dirty&&!window.confirm("Несохранённые изменения будут скопированы в базовый макет новой папки. Продолжить?"))return;
    const source=state.current||newDocument();
    const folderID=uuid(),base=clone(source);
    base.id=uuid();base.folderID=folderID;base.name="Базовый макет";
    base.updatedAt=stamp();
    const folder={id:folderID,name,baseTemplateID:base.id,createdAt:stamp()};
    let baseCreated=false;
    try{
      // Original source remains where it was. The new folder gets its own copy.
      await native("saveTemplate",{document:JSON.stringify(base)});
      baseCreated=true;
      await saveFolderList([...state.folders,folder]);
      state.templates.push(clone(base));
      state.folderFilter=folderID;state.selectedFolderID=folderID;
      state.current=clone(base);state.selectedID=base.id;
      state.dirty=false;state.quickValues={};
      renderLibrary();selectView("quick");
      note("Создана папка «"+name+"» с независимым базовым шаблоном");
    }catch(e){
      if(baseCreated){
        try{await native("deleteTemplate",{id:base.id});}
        catch(rollback){note("Ошибка отката базового макета: "+rollback.message,true);}
      }
      note("Не удалось создать папку: "+e.message,true);
    }
  }
  async function renameFolder(){
    const folder=selectedFolder();if(!folder)return;
    const name=window.prompt("Новое название папки",folder.name)?.trim();
    if(!name||name===folder.name)return;
    if(name.length>60 || state.folders.some(f=>!keySame(f.id,folder.id)&&keySame(f.name,name))){
      note("Название пустое, слишком длинное или уже используется.",true);return;
    }
    try{
      await saveFolderList(state.folders.map(f=>keySame(f.id,folder.id)?{...f,name}:f));
      renderLibrary();note("Папка переименована");
    }catch(e){note("Папка не переименована: "+e.message,true);}
  }
  async function assignBase(){
    const folder=selectedFolder(),id=$("baseChoice")?.value;
    const doc=findTemplate(id);
    if(!folder||!doc){note("Выберите шаблон в папке",true);return;}
    if(!keySame(doc.folderID,folder.id)){
      note("Базовым можно назначить только шаблон из этой папки",true);return;
    }
    if(state.dirty&&!confirmDiscard())return;
    try{
      await saveFolderList(state.folders.map(f=>
        keySame(f.id,folder.id)?{...f,baseTemplateID:doc.id}:f));
      state.current=clone(doc);
      state.selectedID=doc.id;state.dirty=false;state.quickValues={};
      renderLibrary();selectView("quick");
      note("Базовый макет папки «"+folder.name+"»: "+doc.name);
    }catch(e){note("Не удалось назначить базовый макет: "+e.message,true);}
  }
  async function moveSelected(){
    const doc=findTemplate(state.selectedID),target=$("moveTarget")?.value;
    if(!doc||!target)return;
    if(isBase(doc.id)){note("Сначала переназначьте базовый шаблон папки",true);return;}
    const folderID=target==="unfiled"?null:findFolder(target)?.id;
    if(target!=="unfiled"&&!folderID){note("Папка назначения не найдена",true);return;}
    if(keySame(doc.folderID,folderID))return;
    if(state.dirty&&!confirmDiscard())return;
    const moved={...clone(doc),folderID,updatedAt:stamp()};
    try{
      await saveTemplateDocument(moved);
      state.folderFilter=folderID||"unfiled";
      state.selectedFolderID=folderID;
      state.current=clone(moved);
      state.selectedID=moved.id;state.dirty=false;state.quickValues={};
      renderLibrary();selectView("editor");
      note("Шаблон перемещён в "+(findFolder(folderID)?.name||"«Без папки»"));
    }catch(e){note("Не удалось переместить шаблон: "+e.message,true);}
  }
  async function deleteFolder(){
    const folder=selectedFolder();
    if(!folder)return;
    if(state.dirty&&!confirmDiscard())return;
    if(!window.confirm("Удалить папку «"+folder.name+"»? Все её шаблоны останутся в разделе «Без папки»."))return;
    const members=state.templates.filter(t=>keySame(t.folderID,folder.id));
    const moved=[];
    try{
      for(const doc of members){
        const orphan={...clone(doc),folderID:null,updatedAt:stamp()};
        await native("saveTemplate",{document:JSON.stringify(orphan)});
        moved.push(clone(doc));
      }
      await saveFolderList(state.folders.filter(f=>!keySame(f.id,folder.id)));
      for(const old of members){
        const idx=state.templates.findIndex(t=>keySame(t.id,old.id));
        if(idx>=0)state.templates[idx]={...clone(old),folderID:null,updatedAt:stamp()};
      }
      state.folderFilter="unfiled";state.selectedFolderID=null;
      const next=members[0]||state.templates[0];
      state.current=next?clone(findTemplate(next.id)):newDocument();
      state.selectedID=state.current.id;state.dirty=false;state.quickValues={};
      renderLibrary();selectView("editor");
      note("Папка удалена. Шаблоны сохранены в «Без папки».");
    }catch(e){
      let rollbackErrors=[];
      for(const previous of moved){
        try{await native("saveTemplate",{document:JSON.stringify(previous)});}
        catch(error){rollbackErrors.push(error.message);}
      }
      note("Удаление отменено: "+e.message+
        (rollbackErrors.length?"; не удалось восстановить часть файлов: "+rollbackErrors.join(", "):""),true);
    }
  }
  function variableFields(template){
    let index=0;
    return (template?.elements||[]).filter(e=>e.kind==="text"&&e.isVariable!==false).map(e=>{
      index++;
      return {id:e.id,name:e.fieldName?.trim()||"Текст "+index,value:String(e.value||"")};
    });
  }
  function filledDocument(){
    const template=baseTemplate();
    if(!template)throw Error("Нет шаблона");
    const doc=clone(template);
    for(const e of doc.elements){
      if(e.kind==="text" && e.isVariable!==false &&
         Object.hasOwn(state.quickValues,e.id))e.value=state.quickValues[e.id];
    }
    return doc;
  }
  function renderQuick(){
    const base=baseTemplate();if(!base)return;
    $("quickTemplateName").textContent=base.name;
    const check=compatibility(base);
    $("quickCompatibility").textContent=check.ok?"":("⚠ Несовместим с рулоном. "+check.reason);
    $("queueQuick").disabled=!canPrint(base);
    $("queueBatch").disabled=!canPrint(base);
    const fields=variableFields(base);
    $("quickFields").innerHTML=fields.length?fields.map(f=>
      '<div class="field"><label for="fill-'+esc(f.id)+'">'+esc(f.name)+'</label>'+
      '<textarea rows="3" id="fill-'+esc(f.id)+'" data-field="'+esc(f.id)+'">'+
      esc(Object.hasOwn(state.quickValues,f.id)?state.quickValues[f.id]:f.value)+'</textarea></div>').join("")
      :'<p class="muted">В этом шаблоне нет переменных текстовых полей.</p>';
    $("batchField").innerHTML=fields.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join("");
    refreshPreview();
  }
  function refreshPreview(){
    try{
      const doc=filledDocument();
      // Compatibility prevents sending to hardware, not viewing/editing an
      // existing template. Keep the preview visible for mismatched stock.
      const canvas=EZ2Raster.draw(doc);
      $("quickPreview").src=canvas.toDataURL("image/png");
      const check=compatibility(doc);
      if(!check.ok || !EZ2Raster.transportReady(media())){
        $("previewError").textContent=check.ok ?
          "Печать этого размера рулона пока не поддерживается драйвером.":
          "Несовместим с рулоном. "+check.reason;
        $("quickSize").textContent="Предпросмотр доступен, передача в принтер заблокирована.";
        return;
      }
      const packet=EZ2Raster.encode(doc,state.profile.rasterThreshold);
      $("quickSize").textContent=packet.widthBytes*8+" точек × "+packet.rows+" строк · "+packet.size+" байт в порт";
      $("previewError").textContent="";
    }catch(e){
      $("previewError").textContent=e.message;
      $("quickSize").textContent="Печать этого макета заблокирована.";
    }
  }
  async function persistQueue(){
    await native("saveData",{key:"queue",json:JSON.stringify(state.jobs)});
    updateCounts();
  }
  async function queueDocument(doc,copies){
    const n=Number(copies);
    if(!Number.isInteger(n)||n<1||n>200)throw Error("Количество копий: 1–200.");
    // Validate physical media compatibility BEFORE raster encoding and queueing.
    const check=compatibility(doc);
    if(!check.ok)throw new Error("Несовместим с рулоном. "+check.reason);
    if(!EZ2Raster.transportReady(media())){
      throw new Error("Этот размер рулона ещё не поддерживается транспортом. Измените настройки перед печатью.");
    }
    EZ2Raster.encode(doc,state.profile.rasterThreshold);
    state.jobs.push({id:uuid(),document:clone(doc),copies:n,addedAt:stamp(),
      state:"pending",errorMessage:null});
    await persistQueue();renderQueue();
  }
  async function addQuick(){
    try{
      await queueDocument(filledDocument(),$("quickCopies").value);
      note("Задание добавлено в очередь");
    }catch(e){note(e.message,true);}
  }
  async function addBatch(){
    const field=$("batchField").value;
    const values=$("batchValues").value.split(/\r?\n/).filter(x=>x.length>0);
    if(!field || !values.length){note("Выберите поле и укажите строки",true);return;}
    if(values.length>200){note("Максимум 200 строк",true);return;}
    const toAdd=[];
    try{
      for(const value of values){
        const doc=filledDocument();
        const el=doc.elements.find(e=>keySame(e.id,field));
        if(!el)throw Error("Поле не найдено");
        el.value=value;
        const check=compatibility(doc);
        if(!check.ok)throw new Error("Несовместим с рулоном. "+check.reason);
        if(!EZ2Raster.transportReady(media()))throw new Error("Размер рулона пока не поддерживается печатью.");
        EZ2Raster.encode(doc,state.profile.rasterThreshold);
        toAdd.push({id:uuid(),document:doc,copies:1,addedAt:stamp(),
          state:"pending",errorMessage:null});
      }
      state.jobs.push(...toAdd);await persistQueue();renderQueue();
      note("Добавлено строк: "+toAdd.length);
    }catch(e){note(e.message,true);}
  }

  const stateName={pending:"Ожидает",sending:"Передаётся",sent:"Передано в порт",
    failed:"Ошибка данных",uncertain:"Результат неизвестен",cancelled:"Отменено"};
  function renderQueue(){
    updateCounts();
    const active=state.jobs;
    $("queueRows").innerHTML=active.length?active.map(job=>{
      const check=compatibility(job.document);
      return '<tr><td>'+esc(job.document?.name||"Этикетка")+
      '<div class="muted" style="font-size:10px">'+esc(String(job.id).slice(0,8))+'</div></td>'+
      '<td>'+esc(job.copies)+'</td><td>'+esc(stateName[job.state]||job.state)+
      (!check.ok?'<div class="media-incompatible">⚠ Несовместим: '+esc(check.reason)+'</div>':'')+
      (job.errorMessage?'<div class="error" style="font-size:11px">'+esc(job.errorMessage)+'</div>':'')+
      '</td><td>'+
      (job.state==="pending"?'<button data-cancel="'+esc(job.id)+'">Убрать</button>':
       ["failed","uncertain"].includes(job.state)?'<button data-retry="'+esc(job.id)+'">Повторить…</button>':"")+
      '</td></tr>';
    }).join(""):'<tr><td colspan="4" class="empty">Заданий нет</td></tr>';
    const printable=active.filter(j=>j.state==="pending" && canPrint(j.document));
    const incompatible=active.filter(j=>j.state==="pending" && !compatibility(j.document).ok);
    const supported=EZ2Raster.transportReady(media());
    const incompatibleMessage=incompatible.length?
      "Несовместимых заданий: "+incompatible.length+". Они останутся в очереди, их размеры не изменяются.":"";
    const transportMessage=!supported?
      " Выбранный рулон не поддерживается текущими командами печати (подтверждено только 38 мм + 2 мм).":"";
    $("queueCompatibility").textContent=incompatibleMessage+transportMessage;
    $("printState").textContent=state.running?
      "Идёт передача. Не закрывайте приложение и не отключайте RS-232.":
      supported?"Готово к передаче":"Печать заблокирована для выбранной высоты/зазора рулона.";
    $("printOne").disabled=state.running||!printable.length||!state.profile.portPath;
    $("printAll").disabled=$("printOne").disabled;
    $("stopPrinting").disabled=!state.running;
    $("clearFinished").disabled=state.running||!active.some(j=>["sent","cancelled"].includes(j.state));
    $("printLog").textContent=state.log.join("\n");
  }
  async function printQueue(one=false){
    if(state.running)return;
    const jobs=state.jobs.filter(j=>j.state==="pending" && canPrint(j.document));
    if(!jobs.length){note("Нет совместимых заданий для выбранного рулона.",true);return;}
    if(!state.profile.portPath){note("Выберите RS-232 порт в настройках",true);return;}
    if(!one&&!window.confirm("Отправить "+jobs.length+" совместимых заданий? Несовместимые останутся в очереди."))return;
    state.running=true;state.stopRequested=false;renderQueue();
    let first=true;
    for(const job of (one?jobs.slice(0,1):jobs)){
      if(state.stopRequested)break;
      let raster;
      try{raster=EZ2Raster.encode(job.document,state.profile.rasterThreshold);}
      catch(e){
        job.state="failed";job.errorMessage=e.message;
        await persistQueue();log("Ошибка растра: "+e.message);break;
      }
      job.state="sending";job.errorMessage=null;
      await persistQueue();renderQueue();
      log("Печать "+job.document.name+", копий "+job.copies+", G"+raster.widthBytes+
          " × "+raster.rows+", "+raster.size+" байт");
      try{
        const result=await native("printJob",{
          base64:raster.base64,
          copies:Number(job.copies),
          first,
          port:state.profile.portPath,
          delay:Number(state.profile.labelIntervalSeconds)
        });
        first=false;job.state="sent";job.errorMessage=null;
        log(result?.output||"В порт передано; физическая печать не подтверждена");
      }catch(e){
        job.state="uncertain";job.errorMessage=e.message;
        log("ОШИБКА. Положение ленты неизвестно: "+e.message);
        note("Передача прервана. Проверьте бумагу перед повтором.",true);
        await persistQueue();break;
      }
      await persistQueue();renderQueue();
    }
    state.running=false;state.stopRequested=false;
    await persistQueue();renderQueue();
  }
  async function stopPrint(){
    if(!state.running)return;
    state.stopRequested=true;
    try{await native("cancelPrint");log("Запрошена остановка текущего задания.");}
    catch(e){log("Остановка: "+e.message);}
  }
  function renderSettings(){
    $("interval").value=state.profile.labelIntervalSeconds;
    $("threshold").value=state.profile.rasterThreshold;
    $("mediaWidth").value=media().widthMM;
    $("mediaHeight").value=media().heightMM;
    $("mediaGap").value=media().gapMM;
    $("mediaSupport").textContent=EZ2Raster.transportReady(media())?
      "Транспорт для высоты 38 мм и зазора 2 мм уже проверен. Печать до 55 мм по ширине.":
      "Внимание: транспорт печати пока подтверждён только для высоты 38 мм и зазора 2 мм. Другие рулоны можно указать и подготовить шаблоны, но печать будет заблокирована.";
    renderPorts();
    $("runtimePath").textContent=state.runtimePath;
  }
  function renderPorts(){
    const port=state.profile.portPath||"";
    const options=Array.from(new Set([port,...state.ports].filter(Boolean)));
    $("port").innerHTML='<option value="">Выберите порт</option>'+
      options.map(p=>'<option value="'+esc(p)+'">'+esc(p)+'</option>').join("");
    $("port").value=port;
  }
  async function refreshPorts(){
    try{state.ports=(await native("ports"))||[];renderPorts();}
    catch(e){note(e.message,true);}
  }
  async function saveSettings(){
    const port=$("port").value;
    const delay=Number($("interval").value), threshold=Number($("threshold").value);
    if(!Number.isFinite(delay)||delay<0.2||delay>10 ||
       !Number.isInteger(threshold)||threshold<64||threshold>192){
      note("Интервал 0,2–10 с; порог 64–192",true);return;
    }
    const configured={widthMM:Number($("mediaWidth").value),
      heightMM:Number($("mediaHeight").value),gapMM:Number($("mediaGap").value)};
    let checked;
    try{checked=EZ2Raster.validateMedia(configured);}
    catch(e){note(e.message,true);return;}
    if(state.running){note("Сначала завершите текущую передачу",true);return;}
    const profile={...state.profile,portPath:port,rasterThreshold:threshold,labelIntervalSeconds:delay,
      mediaWidthMM:checked.widthMM,mediaHeightMM:checked.heightMM,mediaGapMM:checked.gapMM};
    try{
      const settings={...state.settingsSnapshot,profile};
      await native("saveData",{key:"settings",json:JSON.stringify(settings)});
      state.profile=profile;
      state.settingsSnapshot=settings;
      renderLibrary();renderQueue();renderSettings();renderEditorCompatibility();
      syncEditor();
      note("Рулон сохранён: "+checked.widthMM+"×"+checked.heightMM+" мм, зазор "+checked.gapMM+" мм");
    }catch(e){note(e.message,true);}
  }
  async function bootstrap(){
    try {
      const info=await native("loadAll");
      state.templates=Array.isArray(info.templates)?info.templates:[];
      state.folders=Array.isArray(info.folders)?info.folders:[];
      state.jobs=(Array.isArray(info.queue)?info.queue:[]).map(j=>{
        if(j.state==="sending")return {...j,state:"uncertain",errorMessage:"Приложение было закрыто при передаче. Проверьте бумагу."};
        return j;
      });
      state.profile={...defaultProfile(),...(info.settings?.profile||{})};
      state.settingsSnapshot=info.settings||{schemaVersion:1,snapToGrid:true};
      state.runtimePath=info.runtimePath||"";
      state.current=state.templates.length?clone(state.templates[0]):newDocument();
      state.selectedID=state.current.id;
      state.selectedFolderID=state.current.folderID||null;
      renderLibrary();renderQueue();renderSettings();syncEditor();
      await refreshPorts();
      selectView("editor");note("LabelDesk готов. Драйвер редактируется без пересборки.");
    }catch(e){note("Не удалось загрузить данные: "+e.message,true);}
  }

  document.body.addEventListener("click",async ev=>{
    const view=ev.target.closest("[data-view]");if(view){selectView(view.dataset.view);return;}
    const t=ev.target.closest("[data-template]");if(t){selectTemplate(t.dataset.template);return;}
    const f=ev.target.closest("[data-folder]");
    if(f){
      state.selectedFolderID=f.dataset.folder||null;
      const folder=selectedFolder();
      if(folder?.baseTemplateID){const t=findTemplate(folder.baseTemplateID);if(t){
        state.current=clone(t);state.selectedID=t.id;state.quickValues={};state.dirty=false;syncEditor();
      }}
      renderLibrary();if(state.view==="quick")renderQuick();return;
    }
    const cancel=ev.target.closest("[data-cancel]");
    if(cancel){const j=state.jobs.find(j=>keySame(j.id,cancel.dataset.cancel));if(j){j.state="cancelled";await persistQueue();renderQueue();}return;}
    const retry=ev.target.closest("[data-retry]");
    if(retry){
      const j=state.jobs.find(j=>keySame(j.id,retry.dataset.retry));
      if(j&&window.confirm("Проверьте бумагу! Повтор может напечатать дубль. Продолжить?")){
        j.state="pending";j.errorMessage=null;await persistQueue();renderQueue();
      }return;
    }
  });
  $("saveTemplate").addEventListener("click",saveCurrent);
  $("newTemplate").addEventListener("click",makeCurrent);
  $("duplicateTemplate").addEventListener("click",duplicateCurrent);
  $("deleteTemplate").addEventListener("click",deleteCurrent);
  $("addFolder").addEventListener("click",addFolder);
  $("quickReset").addEventListener("click",()=>{state.quickValues={};renderQuick();});
  $("queueQuick").addEventListener("click",addQuick);
  $("queueBatch").addEventListener("click",addBatch);
  $("quickFields").addEventListener("input",ev=>{
    const id=ev.target.dataset.field;
    if(id){state.quickValues[id]=ev.target.value;refreshPreview();}
  });
  $("printOne").addEventListener("click",()=>printQueue(true));
  $("printAll").addEventListener("click",()=>printQueue(false));
  $("stopPrinting").addEventListener("click",stopPrint);
  $("clearFinished").addEventListener("click",async()=>{
    state.jobs=state.jobs.filter(j=>!["sent","cancelled"].includes(j.state));
    await persistQueue();renderQueue();
  });
  $("clearLog").addEventListener("click",()=>{state.log=[];renderQueue();});
  $("refreshPorts").addEventListener("click",refreshPorts);
  $("saveSettings").addEventListener("click",saveSettings);
  $("openRuntime").addEventListener("click",()=>native("openRuntime").catch(e=>note(e.message,true)));
  bootstrap();
})();
