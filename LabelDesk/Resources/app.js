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
    mediaWidthMM:58,mediaHeightMM:38,mediaGapMM:2,marginLeftMM:0,marginRightMM:0});
  const media=()=>EZ2Raster.mediaFromProfile(state.profile);
  const compatibility=doc=>EZ2Raster.compatibility(doc,media());
  const canPrint=doc=>compatibility(doc).ok && EZ2Raster.transportReady(media());
  // A newly created document follows the installed roll; old documents retain
  // their own dimensions and are never rewritten by a media-setting change.
  const newDocument=()=>({schemaVersion:1,id:uuid(),folderID:null,name:"Новая этикетка",
    widthMM:media().widthMM,heightMM:media().heightMM,gapMM:media().gapMM,
    printMode:"text",elements:[],updatedAt:stamp()});
  // Only explicitly marked line-layout documents use native CP866 commands.
  // Existing documents without printMode retain their proven raster behavior.
  const isTextDoc=doc=>doc?.printMode==="text";
  function withPrintMargins(doc){
    return {...doc,marginLeftMM:Number(state.profile.marginLeftMM||0),
      marginRightMM:Number(state.profile.marginRightMM||0)};
  }
  const encodeJob=(doc,copies=1)=>isTextDoc(doc)
    ?EZ2Text.build(withPrintMargins(doc),copies)
    :EZ2Raster.encode(doc,state.profile.rasterThreshold);

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

  const state={view:"dishes",templates:[],folders:[],jobs:[],profile:defaultProfile(),
    selectedID:null,selectedFolderID:null,current:null,quickValues:{},editorReady:false,
    dirty:false,running:false,stopRequested:false,ports:[],runtimePath:"",log:[],
    settingsSnapshot:{},folderFilter:"all",librarySearch:"",runtimeWarnings:[]};
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
  const dishesController=window.EZ2DishController?.create({
    state,native,uuid,clone,note,compatibility,media,encodeJob,renderQueue,
    openQueue:()=>selectView("queue"),openPrint:()=>selectView("print"),printQueuedIDs:ids=>printQueue(false,ids)
  })||null;
  let editorEditing=false,moveTemplateID=null;
  function keySame(a,b){return String(a||"").toLowerCase()===String(b||"").toLowerCase();}
  function findTemplate(id){return state.templates.find(t=>keySame(t.id,id));}
  function findFolder(id){return state.folders.find(f=>keySame(f.id,id));}
  function selectedFolder(){return findFolder(state.selectedFolderID);}
  function baseTemplate(){
    return state.current;
  }
  function isBase(_id){return false;} // Legacy folder base metadata is ignored.
  function confirmDiscard(){
    return !state.dirty || window.confirm("Текущий макет не сохранён. Отменить изменения?");
  }
  function visibleTemplates(){
    // Search is global; without a query, the selected folder filters the list.
    const query=state.librarySearch.trim().toLocaleLowerCase();
    return state.templates.filter(t=>{
      if(query&&!String(t.name||"").toLocaleLowerCase().includes(query))return false;
      if(state.folderFilter==="unfiled" && t.folderID)return false;
      if(state.folderFilter!=="all" && state.folderFilter!=="unfiled" &&
         !keySame(t.folderID,state.folderFilter))return false;
      return true;
    }).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru"));
  }
  function updateCounts(){
    $("pendingCount").textContent=state.jobs.filter(j=>j.state==="pending").length||"";
    $("templateCount").textContent=visibleTemplates().length;
    $("librarySummary").textContent=state.folders.length+" папок · "+state.templates.length+" шаблонов";
    $("portStatus").textContent=state.profile.portPath||"Порт не выбран";
  }
  function updateEditorWorkspace(){
    $("editorLibrary").hidden=editorEditing;
    $("editorWorkspace").hidden=!editorEditing;
  }
  function selectView(view){
    if(view==="quick")view="editor"; // Legacy form is not a separate screen.
    state.view=view;
    $("appRoot").classList?.toggle("show-context",view==="dishes"||view==="editor");
    $("topTitle").textContent={
      dishes:"Каталог",editor:"Редактор этикеток",queue:"Очередь печати",
      settings:"Настройки принтера",print:"Печать позиций"
    }[view]||"LabelDesk";
    $("newTemplate").hidden=view!=="editor"||!editorEditing;
    $("saveTemplate").hidden=view!=="editor"||!editorEditing;
    $("printEditorSample").hidden=view!=="editor"||!editorEditing;
    document.querySelectorAll("nav [data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    document.querySelectorAll("main .view").forEach(v=>v.classList.toggle("active",v.id===view+"View"));
    $("saveTemplate").disabled=view!=="editor";
    $("appRoot").classList?.toggle("show-dishes",view==="dishes");
    if(view==="dishes")dishesController?.render();
    if(view==="print")dishesController?.renderPrint();
    if(view==="editor"){
      updateEditorWorkspace();renderLibrary();
      if(editorEditing){syncEditor();renderEditorCompatibility();}
    }
    if(view==="quick")renderQuick();
    if(view==="queue")renderQueue();
    if(view==="settings")renderSettings();
  }
  function syncEditor(){
    if(state.editorReady && state.current){
      $("editorFrame").contentWindow.postMessage({
        source:"labeldesk-app",type:"load",
        document:clone(state.current),items:dishesController?.listItems?.()||[],media:{...media(),
          marginLeftMM:Number(state.profile.marginLeftMM||0),
          marginRightMM:Number(state.profile.marginRightMM||0)}
      },"*");
    }
  }
  function renderEditorCompatibility(){
    const doc=state.current;
    const check=compatibility(doc);
    const folder=findFolder(doc?.folderID);
    $("editorContext").textContent=doc?
      (folder?folder.name+"  /  ":"")+"Макет: "+doc.name+" · "+
      doc.widthMM+"×"+doc.heightMM+" мм · "+
      (isTextDoc(doc)?"Текст CP866 (порядок строк)":"Растр (точные координаты)")+
      (state.dirty?" · Не сохранён":" · Сохранён"):
      "Базовый макет не найден. Выберите шаблон или создайте новый.";
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
    else if(type==="openSettings"){selectView("settings");}
  });

  function renderLibrary(){
    updateCounts();
    const count=id=>state.templates.filter(t=>keySame(t.folderID,id)).length;
    const folderRow=(id,name,glyph,n)=>'<div class="folder-entry">'+
      '<button class="item '+(keySame(id,state.folderFilter)?'active':'')+
      '" data-folder="'+esc(id)+'"><span class="sidebar-row"><span class="glyph">'+glyph+
      '</span><span class="item-content">'+esc(name)+'</span><span class="count">'+n+
      '</span></span></button>'+
      (id==="all"||id==="unfiled"?'':'<div class="folder-row-actions">'+
        '<button title="Переименовать папку" data-folder-action="rename" data-folder-id="'+esc(id)+'">✎</button>'+
        '<button title="Удалить папку (шаблоны сохранятся)" data-folder-action="delete" data-folder-id="'+esc(id)+'">×</button></div>')+
      '</div>';
    $("folders").innerHTML=folderRow("all","Все шаблоны","▦",state.templates.length)+
      folderRow("unfiled","Без папки","□",count(null))+
      state.folders.slice().sort((a,b)=>a.name.localeCompare(b.name,"ru"))
        .map(f=>folderRow(f.id,f.name,"▣",count(f.id))).join("");
    const visible=visibleTemplates();
    $("templates").innerHTML=visible.length?visible.map(t=>{
      const check=compatibility(t),moving=keySame(moveTemplateID,t.id);
      const targets=[{id:"unfiled",name:"Без папки"},...state.folders];
      const caption=esc(t.widthMM)+" × "+esc(t.heightMM)+" мм · "+
        (t.printMode==="text"?"Текст CP866":"Растр")+" · "+
        esc(findFolder(t.folderID)?.name||"Без папки");
      return '<div class="template-record"><div class="record-main"><strong>'+
        esc(t.name)+'</strong><small>'+caption+'</small>'+
        (!check.ok?'<small class="media-incompatible">⚠ '+esc(check.reason)+'</small>':'')+
        '</div><div class="record-actions">'+
        '<button data-template="'+esc(t.id)+'" class="primary">Редактировать</button>'+
        '<button data-template-copy="'+esc(t.id)+'">Копировать</button>'+
        '<button data-template-move="'+esc(t.id)+'">Переместить</button>'+
        '<button data-template-remove="'+esc(t.id)+'" class="danger">Удалить</button></div>'+
        (moving?'<div class="record-folder-choices"><strong style="font-size:11px">В папку:</strong>'+
          targets.map(f=>'<button type="button" data-move-to="'+esc(f.id)+'" data-template-id="'+esc(t.id)+'"'+
          (keySame(t.folderID,f.id)||(f.id==="unfiled"&&!t.folderID)?' disabled class="selected"':'')+
          '>'+esc(f.name)+'</button>').join("")+'</div>':'')+
        '</div>';
    }).join(""):'<div class="print-empty">В папке нет этикеток. Нажмите «Новая этикетка».</div>';
    const folder=selectedFolder();
    $("folderDetail").textContent=folder?
      "Папка «"+folder.name+"» · "+count(folder.id)+" этикеток":"";
    $("templateDetail").innerHTML="";
  }
  function selectTemplate(id){
    const t=findTemplate(id);
    if(!t||!confirmDiscard())return;
    state.current=clone(t);
    editorEditing=true;moveTemplateID=null;
    state.selectedID=t.id;
    state.dirty=false;state.quickValues={};
    renderLibrary();
    selectView("editor");
    note("Открыт макет: "+t.name);
  }
  function selectFolder(id){
    const filter=id==="all"||id==="unfiled"?id:String(id);
    if(filter===state.folderFilter&&!editorEditing)return;
    if(editorEditing&&!confirmDiscard())return;
    const folder=findFolder(filter);
    if(filter!=="all"&&filter!=="unfiled"&&!folder)return;
    state.folderFilter=filter;
    state.selectedFolderID=folder?.id||null;
    moveTemplateID=null;editorEditing=false;
    renderLibrary();selectView("editor");
    note(folder?"Папка: "+folder.name:"Этикетки");
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
    editorEditing=true;moveTemplateID=null;
    doc.folderID=state.selectedFolderID||null;
    state.current=doc;
    state.selectedID=doc.id;
    state.quickValues={};state.dirty=true;
    renderLibrary();selectView("editor");
    note("Новый макет: размеры из настроек рулона");
  }
  async function duplicateCurrent(id){
    const original=findTemplate(id||state.selectedID)||state.current;
    if(!original){note("Выберите шаблон для копирования",true);return;}
    if(state.dirty && !confirmDiscard())return;
    const copy=clone(original);
    copy.id=uuid();
    copy.name=original.name+" — копия";
    copy.updatedAt=stamp();
    try{
      await saveTemplateDocument(copy);
      state.current=clone(copy);
      editorEditing=true;
      state.selectedID=copy.id;state.dirty=false;state.quickValues={};
      renderLibrary();selectView("editor");
      note("Копия сохранена: "+copy.name);
    }catch(e){note("Копия не создана: "+e.message,true);}
  }
  async function deleteCurrent(id){
    const doc=findTemplate(id||state.selectedID);
    if(!doc){note("Выберите сохранённый шаблон",true);return;}
    if(state.dirty&&!confirmDiscard())return;
    if(!window.confirm("Удалить шаблон «"+doc.name+"»? Это действие нельзя отменить."))return;
    try{
      await native("deleteTemplate",{id:doc.id});
      state.templates=state.templates.filter(t=>!keySame(t.id,doc.id));
      const next=visibleTemplates()[0]||state.templates[0];
      state.current=next?clone(next):newDocument();
      editorEditing=false;moveTemplateID=null;
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
      note("Папка с таким названием уже существует",true);return;
    }
    if(!confirmDiscard())return;
    const folder={id:uuid(),name,createdAt:stamp()};
    try{
      await saveFolderList([...state.folders,folder]);
      state.folderFilter=folder.id;state.selectedFolderID=folder.id;
      editorEditing=false;moveTemplateID=null;
      state.current=newDocument();state.current.folderID=folder.id;
      state.selectedID=state.current.id;state.dirty=false;state.quickValues={};
      renderLibrary();selectView("editor");
      note("Папка создана: "+name+". Добавьте в неё этикетку.");
    }catch(e){note("Не удалось создать папку: "+e.message,true);}
  }
  async function renameFolder(folderID){
    const folder=findFolder(folderID)||selectedFolder();if(!folder)return;
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
  async function moveSelected(destination,id){
    const doc=findTemplate(id||state.selectedID),target=destination||$("moveTarget")?.value;
    if(!doc||!target)return;
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
      editorEditing=false;moveTemplateID=null;
      state.selectedID=moved.id;state.dirty=false;state.quickValues={};
      renderLibrary();selectView("editor");
      note("Шаблон перемещён в "+(findFolder(folderID)?.name||"«Без папки»"));
    }catch(e){note("Не удалось переместить шаблон: "+e.message,true);}
  }
  async function deleteFolder(folderID){
    const folder=findFolder(folderID)||selectedFolder();
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
      editorEditing=false;moveTemplateID=null;
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
    return (template?.elements||[]).filter(e=>(e.kind==="text"||e.kind==="barcode")&&e.isVariable!==false).map(e=>{
      index++;
      return {id:e.id,name:e.fieldName?.trim()||(e.kind==="barcode"?"Штрихкод ":"Текст ")+index,value:String(e.value||"")};
    });
  }
  function filledDocument(){
    const template=baseTemplate();
    if(!template)throw Error("Нет шаблона");
    const doc=clone(template);
    for(const e of doc.elements){
      if((e.kind==="text"||e.kind==="barcode") && e.isVariable!==false &&
         Object.hasOwn(state.quickValues,e.id))e.value=state.quickValues[e.id];
    }
    return doc;
  }
  function renderQuick(){
    const base=baseTemplate();
    if(!base){
      $("quickTemplateName").textContent="Базовый шаблон не назначен";
      $("quickCompatibility").textContent="Выберите в боковой панели шаблон и нажмите «Назначить» в настройках папки.";
      $("quickFields").innerHTML="";
      $("batchField").innerHTML="";
      $("quickPreview").removeAttribute("src");
      $("previewError").textContent="";
      $("quickSize").textContent="";
      $("queueQuick").disabled=true;
      $("testNative").disabled=true;
      $("queueBatch").disabled=true;
      return;
    }
    $("quickTemplateName").textContent=base.name;
    const check=compatibility(base);
    $("quickCompatibility").textContent=check.ok?"":("⚠ Несовместим с рулоном. "+check.reason);
    $("queueQuick").disabled=!canPrint(base);
    $("testNative").disabled=!canPrint(base)||state.running;
    const fields=variableFields(base);
    $("queueBatch").disabled=!canPrint(base)||!fields.length;
    $("quickFields").innerHTML=fields.length?fields.map(f=>
      '<div class="field"><label for="fill-'+esc(f.id)+'">'+esc(f.name)+'</label>'+
      '<textarea rows="3" id="fill-'+esc(f.id)+'" data-field="'+esc(f.id)+'">'+
      esc(Object.hasOwn(state.quickValues,f.id)?state.quickValues[f.id]:f.value)+'</textarea></div>').join("")
      :'<p class="muted">В этом шаблоне нет переменных текстовых полей. Можно печатать его без заполнения.</p>';
    $("batchField").innerHTML=fields.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.name)+'</option>').join("");
    refreshPreview();
  }
  function refreshPreview(){
    try{
      const doc=filledDocument();
      // Compatibility prevents sending to hardware, not viewing/editing an
      // existing template. Keep the preview visible for mismatched stock.
      const canvas=EZ2Raster.draw(isTextDoc(doc)?withPrintMargins(doc):doc);
      $("quickPreview").src=canvas.toDataURL("image/png");
      const check=compatibility(doc);
      if(!check.ok || !EZ2Raster.transportReady(media())){
        $("previewError").textContent=check.ok ?
          "Для печати нужен рулон с зазором от 1 мм.":
          "Несовместим с рулоном. "+check.reason;
        $("quickSize").textContent="Предпросмотр доступен, передача в принтер заблокирована.";
        return;
      }
      if(isTextDoc(doc)){
        const plan=EZ2Text.plan(withPrintMargins(doc),{allowPlaceholders:true});
        $("quickSize").textContent="Текст CP866 · "+plan.rows.length+
          " печатных строк · порядок сверху вниз. Изображение — приблизительный эскиз.";
        try{
          EZ2Text.build(doc,1);
          $("queueQuick").disabled=false;
          $("queueBatch").disabled=!variableFields(doc).length;
          $("previewError").textContent="";
        }catch(err){
          $("queueQuick").disabled=true;
          $("queueBatch").disabled=true;
          $("previewError").textContent=err.message;
        }
      }else{
        const packet=EZ2Raster.encode(doc,state.profile.rasterThreshold);
        $("quickSize").textContent="Растровая печать · "+packet.widthBytes*8+
          " точек × "+packet.rows+" строк · "+packet.size+" байт";
        $("previewError").textContent="";
      }
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
      throw new Error("Для печати нужен зазор между этикетками от 1 мм.");
    }
    encodeJob(doc,n);
    const job={id:uuid(),document:clone(doc),copies:n,addedAt:stamp(),
      state:"pending",errorMessage:null};
    const jobs=[...state.jobs,job];
    await native("saveData",{key:"queue",json:JSON.stringify(jobs)});
    state.jobs=jobs;renderQueue();
    return job.id;
  }
  async function printEditorSample(){
    if(!editorEditing||!state.current){
      note("Сначала откройте этикетку в редакторе",true);return;
    }
    if(state.running){note("Принтер уже выполняет другое задание",true);return;}
    if(!state.profile.portPath){note("Укажите RS-232 порт в настройках",true);return;}

    // The test prints the exact *unsaved* editor text, including [VARIABLES].
    // Only the disposable print snapshot drops the food starter-pack guard;
    // saved template data and regular catalog/batch validation remain unchanged.
    const sample=clone(state.current);
    if(!Array.isArray(sample.elements)||!sample.elements.length){
      note("Макет пустой: добавьте текст или фигуру",true);return;
    }
    delete sample.starterPack;
    sample.name="Проба макета · "+String(sample.name||"Без названия");
    try{
      const check=compatibility(sample);
      if(!check.ok)throw Error("Не подходит установленный рулон: "+check.reason);
      if(!EZ2Raster.transportReady(media()))throw Error("Для печати нужен рулон с зазором от 1 мм");
      encodeJob(sample,1); // physical layout and CP866 character preflight
      if(!window.confirm("Напечатать 1 этикетку прямо из редактора?\n"+
        "Печатаются текущие надписи и [ПЕРЕМЕННЫЕ] как обычный текст.\n"+
        "Изменения шаблона НЕ сохраняются. Другие задания очереди не запускаются."))return;
      $("printEditorSample").disabled=true;
      const jobID=await queueDocument(sample,1);
      await printQueue(true,[jobID]);
      const job=state.jobs.find(j=>j.id===jobID);
      if(job?.state==="sent")note("Пробный макет передан в принтер. Проверьте наклейку.");
      else if(job?.state==="uncertain")note("Результат передачи неизвестен. Проверьте ленту.",true);
      else if(job?.state==="failed")note("Пробная печать: "+(job.errorMessage||"Ошибка"),true);
    }catch(error){
      note("Пробная печать: "+error.message,true);
    }finally{
      $("printEditorSample").disabled=false;
    }
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
        if(!EZ2Raster.transportReady(media()))throw new Error("Для печати нужен рулон с зазором от 1 мм.");
        encodeJob(doc,1);
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
        '<div class="muted" style="font-size:10px">'+
        (isTextDoc(job.document)?"Текст CP866":"Растр")+'</div>'+
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
      " Для датчика просвета необходим зазор между этикетками от 1 мм.":"";
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
  async function printQueue(one=false,onlyIDs=null){
    if(state.running)return;
    const wanted=onlyIDs?new Set(onlyIDs):null;
    const jobs=state.jobs.filter(j=>j.state==="pending" && canPrint(j.document) &&
      (!wanted||wanted.has(j.id)));
    if(!jobs.length){note("Нет совместимых заданий для выбранного рулона.",true);return;}
    if(!state.profile.portPath){note("Выберите RS-232 порт в настройках",true);return;}
    if(!one&&!window.confirm("Отправить "+jobs.length+" совместимых заданий? Несовместимые останутся в очереди."))return;
    if((media().heightMM!==38||media().gapMM!==2)&&!window.confirm(
      "Рулон "+media().heightMM+" мм + зазор "+media().gapMM+" мм пока не проверен физически. "+
      "Сначала напечатайте одну этикетку и проверьте позиционирование. Продолжить?"))return;
    state.running=true;state.stopRequested=false;renderQueue();
    for(const job of (one?jobs.slice(0,1):jobs)){
      if(state.stopRequested)break;
      let packet;
      const textMode=isTextDoc(job.document);
      try{packet=encodeJob(job.document,Number(job.copies));}
      catch(e){
        job.state="failed";job.errorMessage=e.message;
        await persistQueue();log("Ошибка компиляции: "+e.message);break;
      }
      job.state="sending";job.errorMessage=null;
      await persistQueue();renderQueue();
      log("Печать "+job.document.name+", копий "+job.copies+", режим "+
          (textMode?"ТЕКСТ CP866, "+packet.rows+" строк":"РАСТР G"+packet.widthBytes+" × "+packet.rows)+
          ", "+packet.size+" байт");
      try{
        const result=await native("printJob",{
          base64:packet.base64,
          textMode,
          copies:Number(job.copies),
          port:state.profile.portPath,
          pitchMM:EZ2Raster.labelPitch(media()),
          delay:Number(state.profile.labelIntervalSeconds)
        });
        job.state="sent";job.errorMessage=null;
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
  async function testNativeOnce(){
    if(state.running){note("Сначала завершите текущую передачу",true);return;}
    if(!state.profile.portPath){note("Выберите последовательный порт в настройках",true);return;}
    let test;
    try{
      const doc=filledDocument();
      if(!canPrint(doc))throw Error("Макет не подходит к установленному рулону");
      test=EZ2Native.packet(doc);
    }catch(error){
      note("Тест штатной печати: "+error.message,true);
      return;
    }
    if(!window.confirm("Эксперимент: отправить ОДНУ этикетку "+test.description+
        "? Без автоматической пустой этикетки. Не запускайте тираж до проверки положения ленты."))
      return;
    state.running=true;renderQueue();
    $("testNative").disabled=true;
    log("ЭКСПЕРИМЕНТ штатной печати: "+test.description+", "+test.size+" байт");
    try{
      const result=await native("printJob",{
        base64:test.base64,nativeTrial:true,copies:1,
        port:state.profile.portPath,pitchMM:EZ2Raster.labelPitch(media()),
        delay:Number(state.profile.labelIntervalSeconds)
      });
      log(result?.output||"Штатный тест передан в порт");
      note("Штатная команда передана. Проверьте фактическую этикетку до следующей печати.");
    }catch(error){
      log("НЕОПРЕДЕЛЁННЫЙ РЕЗУЛЬТАТ штатного теста: "+error.message);
      note("Печать не подтверждена: "+error.message,true);
    }finally{
      state.running=false;renderQueue();
      if(state.view==="quick")renderQuick();
    }
  }

  async function stopPrint(){
    if(!state.running)return;
    state.stopRequested=true;
    try{await native("cancelPrint");log("Запрошена остановка текущего задания.");}
    catch(e){log("Остановка: "+e.message);}
  }
  // All calibration sheets use the ordinary production encoders and queue.
  const diagView={group:"Все",search:"",limit:6,selected:null};
  function diagnostics(){
    return window.EZ2Diagnostics?.list?.()||[];
  }
  function filteredDiagnostics(){
    const needle=diagView.search.toLocaleLowerCase("ru");
    return diagnostics().filter(s=>
      (diagView.group==="Все"||s.group===diagView.group)&&
      (!needle||(s.title+" "+s.id+" "+s.description).toLocaleLowerCase("ru").includes(needle)));
  }
  function showDiagnostic(){
    const sample=diagnostics().find(d=>d.id===diagView.selected);
    $("diagSelected").hidden=!sample;
    if(!sample){$("diagPreview").removeAttribute("src");return;}
    $("diagTitle").textContent=sample.id+" · "+sample.title;
    $("diagDescription").textContent=sample.description;
    $("diagMode").textContent=sample.mode==="text"?"Штатный CP866":"Растр ESC G";
    try{
      const raw=window.EZ2Diagnostics.documentFor(sample.id);
      const doc=sample.mode==="text"?withPrintMargins(raw):raw;
      if(!canPrint(doc))throw Error("Тестовый рулон 58×38 / зазор 2 мм не совпадает с настройками принтера.");
      const packet=encodeJob(doc,1);
      if(packet.size>20000)throw Error("Диагностический пакет больше лимита транспорта");
      $("diagPreview").src=EZ2Raster.draw(doc).toDataURL("image/png");
      $("diagError").textContent="";
      $("diagQueue").disabled=false;
      $("diagPrint").disabled=!state.profile.portPath||state.running;
    }catch(error){
      $("diagPreview").removeAttribute("src");
      $("diagError").textContent=error.message;
      $("diagQueue").disabled=true;$("diagPrint").disabled=true;
    }
  }
  function renderDiagnostics(){
    const all=diagnostics(),filtered=filteredDiagnostics();
    $("diagCount").textContent=all.length+" образцов";
    const groups=["Все",...new Set(all.map(s=>s.group))];
    $("diagGroups").innerHTML=groups.map(group=>
      '<button type="button" data-diag-group="'+esc(group)+'" class="'+
      (diagView.group===group?'current':'')+'">'+esc(group)+'</button>').join("");
    $("diagItems").innerHTML=filtered.slice(0,diagView.limit).map(s=>
      '<button type="button" class="diag-row'+(diagView.selected===s.id?' current':'')+
      '" data-diag-id="'+esc(s.id)+'"><span><strong>'+esc(s.id)+' · '+
      esc(s.title)+'</strong><small>'+esc(s.description)+'</small></span>'+
      '<em>'+(s.mode==="text"?"CP866":"Растр")+'</em></button>').join("")||
      '<p class="muted">Образцы не найдены</p>';
    $("diagMore").hidden=filtered.length<=diagView.limit;
    showDiagnostic();
  }
  async function queueDiagnostic(id){
    const doc=window.EZ2Diagnostics.documentFor(id);
    return await queueDocument(doc,1);
  }
  async function handleDiagnosticPrint(direct){
    const id=diagView.selected;
    if(!id){note("Сначала выберите тестовую этикетку",true);return;}
    if(direct&&!window.confirm("Напечатать ОДНУ тестовую этикетку "+id+
      "? Убедитесь, что в принтере рулон 58×38 мм с зазором 2 мм."))return;
    try{
      if(direct&&!state.profile.portPath)throw Error("Порт RS-232 не выбран.");
      const jobID=await queueDiagnostic(id);
      note("Тест "+id+" добавлен в очередь · 1 этикетка");
      if(direct)await printQueue(true,[jobID]); // Never prints other pending jobs.
      else selectView("queue");
    }catch(error){note("Тест "+id+": "+error.message,true);}
  }
  function installNumberSteppers(){
    for(const input of document.querySelectorAll('input[type="number"]:not([data-ld-stepper])')){
      if(input.closest(".ld-stepper"))continue;
      input.dataset.ldStepper="1";
      const group=document.createElement("div");group.className="ld-stepper";
      const minus=document.createElement("button"),plus=document.createElement("button");
      for(const [button,label] of [[minus,"−"],[plus,"＋"]]){
        button.type="button";button.textContent=label;
        button.setAttribute("aria-label",label==="−"?"Уменьшить":"Увеличить");
      }
      input.parentNode.insertBefore(group,input);
      group.append(minus,input,plus);
      const adjust=dir=>{
        if(input.disabled||input.readOnly)return;
        const step=Number(input.step)||1;
        const lower=input.min===""?-Infinity:Number(input.min);
        const upper=input.max===""?Infinity:Number(input.max);
        const value=input.value===""?Number.isFinite(lower)?lower:0:Number(input.value);
        if(!Number.isFinite(value)||!Number.isFinite(step))return;
        const places=String(step).split(".")[1]?.length||0;
        const next=Math.max(lower,Math.min(upper,
          Number((value+step*dir).toFixed(Math.min(6,places)))));
        input.value=String(next);
        input.dispatchEvent(new Event("input",{bubbles:true}));
        input.dispatchEvent(new Event("change",{bubbles:true}));
      };
      minus.addEventListener("click",()=>adjust(-1));
      plus.addEventListener("click",()=>adjust(1));
    }
  }

  function renderSettings(){
    $("interval").value=state.profile.labelIntervalSeconds;
    $("threshold").value=state.profile.rasterThreshold;
    $("mediaWidth").value=media().widthMM;
    $("mediaHeight").value=media().heightMM;
    $("mediaGap").value=media().gapMM;
    $("marginLeft").value=Number(state.profile.marginLeftMM||0);
    $("marginRight").value=Number(state.profile.marginRightMM||0);
    $("mediaSupport").textContent=EZ2Raster.transportReady(media())?
      "ESC q"+String(EZ2Raster.labelPitch(media())).padStart(3,"0")+
      " (высота + зазор). Формат 38+2 мм проверен физически; другие форматы сначала проверьте на одной этикетке. Печать до 55 мм по ширине.":
      "Для рулона без зазора нужен другой режим датчика. Печать доступна при зазоре от 1 мм.";
    renderPorts();
    $("runtimePath").textContent=state.runtimePath;
    const modified=state.runtimeWarnings||[];
    $("runtimeWarning").textContent=modified.length?
      "Внимание: установленные ресурсы отличаются от этой версии: "+modified.join(", ")+
      ". Часть интерфейса или драйвера может работать по-старому.":"";
    $("restoreRuntime").hidden=!modified.length;
    renderDiagnostics();
  }
  function renderPorts(){
    const port=state.profile.portPath||"";
    const options=Array.from(new Set([port,...state.ports].filter(Boolean)));
    $("port").innerHTML='<option value="">Выберите порт</option>'+
      options.map(p=>'<option value="'+esc(p)+'">'+esc(p)+'</option>').join("");
    $("port").value=port;
    renderPortChoices();
  }
  function renderPortChoices(){
    const q=String($("portSearch").value||"").toLocaleLowerCase("ru");
    const current=$("port").value;
    const ports=Array.from($("port").options).map(o=>o.value).filter(Boolean);
    const shown=ports.filter(p=>p.toLocaleLowerCase("ru").includes(q)).slice(0,6);
    $("portChoices").innerHTML=shown.map(p=>
      '<button type="button" data-port-choice="'+esc(p)+'" class="'+
      (p===current?'selected':'')+'">'+esc(p)+'</button>').join("")+
      (!shown.length?'<span class="muted">Порты не найдены. Нажмите «Обновить».</span>':'');
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
    const left=Number($("marginLeft").value),right=Number($("marginRight").value);
    if(!Number.isFinite(left)||!Number.isFinite(right)||left<0||right<0||
       left>15||right>15||left+right>=50||
       !Number.isInteger(left)||!Number.isInteger(right)){
      note("Отступы: целые 0–15 мм, вместе менее 50 мм",true);return;
    }
    const configured={widthMM:Number($("mediaWidth").value),
      heightMM:Number($("mediaHeight").value),gapMM:Number($("mediaGap").value)};
    let checked;
    try{checked=EZ2Raster.validateMedia(configured);}
    catch(e){note(e.message,true);return;}
    if(state.running){note("Сначала завершите текущую передачу",true);return;}
    const profile={...state.profile,portPath:port,rasterThreshold:threshold,labelIntervalSeconds:delay,
      mediaWidthMM:checked.widthMM,mediaHeightMM:checked.heightMM,mediaGapMM:checked.gapMM,
      marginLeftMM:left,marginRightMM:right};
    try{
      const settings={...state.settingsSnapshot,profile};
      await native("saveData",{key:"settings",json:JSON.stringify(settings)});
      state.profile=profile;
      state.settingsSnapshot=settings;
      let printerInitError=null;
      if(port&&EZ2Raster.transportReady(checked)){
        try{
          const pitchMM=EZ2Raster.labelPitch(checked);
          await native("initPrinter",{port,pitchMM});
          log("Позиционирование при сохранении настроек: ESC q"+String(pitchMM).padStart(3,"0"));
        }catch(error){
          printerInitError=error.message;
          log("Ошибка инициализации принтера: "+printerInitError);
        }
      }
      renderLibrary();renderQueue();renderSettings();renderEditorCompatibility();
      syncEditor();
      note(printerInitError?"Настройки сохранены, но принтер не инициализирован: "+printerInitError:
        "Настройки сохранены: рулон "+checked.widthMM+"×"+checked.heightMM+" мм; отступы "+left+" / "+right+" мм",!!printerInitError);
    }catch(e){note(e.message,true);}
  }
  async function installFoodPresets(){
    const pack=window.EZ2FoodPresets;
    if(!pack || state.settingsSnapshot.foodPresetsPack===pack.version)return;
    const samples=pack.build();
    // Stable identifiers + a settings marker prevent duplicate import and
    // ensure never to overwrite a food sample edited by the user.
    for(const doc of samples.templates){
      if(state.templates.some(t=>keySame(t.id,doc.id)))continue;
      await native("saveTemplate",{document:JSON.stringify(doc)});
      state.templates.push(clone(doc));
    }
    const additions=samples.folders.filter(f=>
      !state.folders.some(existing=>keySame(existing.id,f.id)));
    if(additions.length){
      const folders=[...state.folders,...additions];
      await native("saveData",{key:"folders",json:JSON.stringify(folders)});
      state.folders=folders;
    }
    const settings={...state.settingsSnapshot,foodPresetsPack:pack.version};
    await native("saveData",{key:"settings",json:JSON.stringify(settings)});
    state.settingsSnapshot=settings;
  }
  async function bootstrap(){
    let printerInitError=null;
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
      if(state.profile.portPath&&EZ2Raster.transportReady(media())){
        try{
          const pitchMM=EZ2Raster.labelPitch(media());
          await native("initPrinter",{port:state.profile.portPath,pitchMM});
          log("При запуске отправлена ESC q"+String(pitchMM).padStart(3,"0")+
            ": подача по этикеткам");
        }catch(error){
          printerInitError=error.message;
          log("Ошибка инициализации принтера: "+printerInitError);
        }
      }
       dishesController?.bootstrap(info.items??info.dishes,info.itemFolders,info.printPresets);
      state.runtimePath=info.runtimePath||"";
    state.runtimeWarnings=Array.isArray(info.runtimeWarnings)?info.runtimeWarnings:[];
      const hadUserTemplates=state.templates.length>0;
      const originalFirst=state.templates.slice().sort((a,b)=>
        String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")))[0];
      try{await installFoodPresets();}
      catch(error){note("Готовые шаблоны не установлены: "+error.message,true);}
      state.templates.sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
      state.current=(hadUserTemplates&&originalFirst)?clone(originalFirst):
        (state.templates.find(t=>t.starterPack==="food-v1") ?
          clone(state.templates.find(t=>t.starterPack==="food-v1")):
          (state.templates.length?clone(state.templates[0]):newDocument()));
      state.selectedID=state.current.id;
      state.folderFilter="all";
      state.selectedFolderID=null;
      renderLibrary();renderQueue();renderSettings();syncEditor();
      await refreshPorts();
      selectView(dishesController?"dishes":"editor");
       note(printerInitError?"Принтер не инициализирован: "+printerInitError:
         "LabelDesk готов. Блюда сохраняются отдельно от макетов.",!!printerInitError);
    }catch(e){note("Не удалось загрузить данные: "+e.message,true);}
  }

  document.body.addEventListener("click",async ev=>{
    const view=ev.target.closest("[data-view]");
    if(view){
      if(view.dataset.view==="editor"){
        if(editorEditing&&!confirmDiscard())return;
        editorEditing=false;
      }
      selectView(view.dataset.view);return;
    }
    const folderAction=ev.target.closest("[data-folder-action]");
    if(folderAction){
      const id=folderAction.dataset.folderId;
      if(folderAction.dataset.folderAction==="rename")await renameFolder(id);
      else if(folderAction.dataset.folderAction==="delete")await deleteFolder(id);
      return;
    }
    const moveTo=ev.target.closest("[data-move-to]");
    if(moveTo){await moveSelected(moveTo.dataset.moveTo,moveTo.dataset.templateId);return;}
    const action=ev.target.closest("[data-library-action]");
    if(action){
      const command=action.dataset.libraryAction;
      if(command==="edit-base"){
        const folder=selectedFolder();
        const first=state.templates.find(t=>keySame(t.folderID,folder?.id));
        if(first)selectTemplate(first.id);
      }
      else if(command==="rename-folder")await renameFolder();
      else if(command==="delete-folder")await deleteFolder();
      else if(command==="edit-selected")selectTemplate(state.selectedID);
      else if(command==="duplicate-selected")await duplicateCurrent();
      else if(command==="move-selected")await moveSelected();
      else if(command==="delete-selected")await deleteCurrent();
      return;
    }
    const copyRow=ev.target.closest("[data-template-copy]");
    if(copyRow){await duplicateCurrent(copyRow.dataset.templateCopy);return;}
    const deleteRow=ev.target.closest("[data-template-remove]");
    if(deleteRow){await deleteCurrent(deleteRow.dataset.templateRemove);return;}
    const moveRow=ev.target.closest("[data-template-move]");
    if(moveRow){
      moveTemplateID=moveTemplateID===moveRow.dataset.templateMove?null:moveRow.dataset.templateMove;
      renderLibrary();return;
    }
    const t=ev.target.closest("[data-template]");
    if(t){selectTemplate(t.dataset.template);return;}
    const f=ev.target.closest("[data-folder]");
    if(f){selectFolder(f.dataset.folder);return;}
    const cancel=ev.target.closest("[data-cancel]");
    if(cancel){
      const j=state.jobs.find(j=>keySame(j.id,cancel.dataset.cancel));
      if(j){j.state="cancelled";await persistQueue();renderQueue();}
      return;
    }
    const retry=ev.target.closest("[data-retry]");
    if(retry){
      const j=state.jobs.find(j=>keySame(j.id,retry.dataset.retry));
      if(j&&window.confirm("Проверьте бумагу! Повтор может напечатать дубль. Продолжить?")){
        j.state="pending";j.errorMessage=null;await persistQueue();renderQueue();
      }
    }
  });
  $("catalogGoPrint").addEventListener("click",()=>selectView("print"));
  $("sendDishToPrint").addEventListener("click",()=>{
    if(dishesController?.selectCurrentForPrint())selectView("print");
  });
  $("printGoCatalog").addEventListener("click",()=>selectView("dishes"));
  $("saveTemplate").addEventListener("click",saveCurrent);
  $("printEditorSample").addEventListener("click",printEditorSample);
  $("newTemplate").addEventListener("click",makeCurrent);
  $("newTemplateMain").addEventListener("click",makeCurrent);
  $("backToTemplates").addEventListener("click",()=>{
    if(!confirmDiscard())return;
    editorEditing=false;moveTemplateID=null;state.dirty=false;selectView("editor");
  });
  $("addFolder").addEventListener("click",addFolder);
  $("templateSearch").addEventListener("input",ev=>{
    state.librarySearch=ev.target.value||"";
    renderLibrary();
  });
  $("quickReset").addEventListener("click",()=>{state.quickValues={};renderQuick();});
  $("queueQuick").addEventListener("click",addQuick);
  $("testNative").addEventListener("click",testNativeOnce);
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
  $("portSearch").addEventListener("input",renderPortChoices);
  $("portChoices").addEventListener("click",e=>{
    const button=e.target.closest("[data-port-choice]");
    if(!button)return;
    $("port").value=button.dataset.portChoice;renderPortChoices();
  });
  $("saveSettings").addEventListener("click",saveSettings);
  $("saveMarginSettings").addEventListener("click",saveSettings);
  $("openRuntime").addEventListener("click",()=>native("openRuntime").catch(e=>note(e.message,true)));
  $("makeBackup").addEventListener("click",async()=>{
    try{
      const path=await native("createBackup");
      $("backupStatus").textContent="Резервная копия создана: "+path;note("Данные сохранены");
    }catch(e){note("Резервная копия: "+e.message,true);}
  });
  $("openBackups").addEventListener("click",()=>native("openBackups").catch(e=>note(e.message,true)));
  $("restoreRuntime").addEventListener("click",async()=>{
    if(!window.confirm("Восстановить штатные файлы интерфейса и драйвера? Ваши изменения"+
      " останутся в истории Backups. Каталог и макеты не изменятся."))return;
    try{await native("restoreRuntime");window.location.reload();}
    catch(e){note("Не удалось восстановить интерфейс: "+e.message,true);}
  });
  $("diagGroups").addEventListener("click",event=>{
    const button=event.target.closest("[data-diag-group]");
    if(!button)return;
    diagView.group=button.dataset.diagGroup;diagView.limit=6;renderDiagnostics();
  });
  $("diagSearch").addEventListener("input",event=>{
    diagView.search=event.target.value||"";diagView.limit=6;renderDiagnostics();
  });
  $("diagItems").addEventListener("click",event=>{
    const button=event.target.closest("[data-diag-id]");
    if(!button)return;
    diagView.selected=button.dataset.diagId;renderDiagnostics();
  });
  $("diagMore").addEventListener("click",()=>{diagView.limit+=6;renderDiagnostics();});
  $("diagQueue").addEventListener("click",()=>handleDiagnosticPrint(false));
  $("diagPrint").addEventListener("click",()=>handleDiagnosticPrint(true));
  // Resizable and collapsible library. Does not touch printer geometry.
  let sidebarWidth=278;
  try{
    const old=Number(localStorage.getItem("labeldesk-sidebar-width"));
    if(Number.isFinite(old)&&old>=210&&old<=450)sidebarWidth=old;
  }catch(_){}
  function setSidebarWidth(width){
    sidebarWidth=Math.min(450,Math.max(210,Math.round(width)));
    $("appRoot").style?.setProperty?.("--sidebar-width",sidebarWidth+"px");
    try{localStorage.setItem("labeldesk-sidebar-width",String(sidebarWidth));}catch(_){}
  }
  setSidebarWidth(sidebarWidth);
  $("toggleSidebar").addEventListener("click",()=>
    $("appRoot").classList?.toggle("sidebar-collapsed"));
  $("sidebarResize").addEventListener("pointerdown",event=>{
    const x=event.clientX,start=sidebarWidth;
    const move=e=>setSidebarWidth(start+e.clientX-x);
    const up=()=>{
      window.removeEventListener?.("pointermove",move);
      window.removeEventListener?.("pointerup",up);
    };
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",up);
  });
  installNumberSteppers();
  if(typeof MutationObserver==="function"){
    const obs=new MutationObserver(()=>installNumberSteppers());
    obs.observe(document.getElementById("content"),{childList:true,subtree:true});
  }
  bootstrap();
})();
