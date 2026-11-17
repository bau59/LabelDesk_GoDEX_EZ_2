/* Universal item catalog and batch UI. Original templates and transport are untouched. */
(function(root){
  "use strict";
  function create(api){
    const {state,native,uuid,clone,note,compatibility,media,encodeJob,renderQueue,openQueue,openPrint,printQueuedIDs}=api;
    const $=id=>document.getElementById(id);
    const esc=value=>String(value??"").replace(/[&<>"']/g,c=>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
    const fieldIDs={name:"dishName",kind:"itemKind",weightG:"dishWeight",kcal:"dishKcal",
      protein:"dishProtein",fat:"dishFat",carbs:"dishCarbs",
      ingredients:"dishIngredients",allergens:"dishAllergens",
      shelfLifeHours:"dishShelfLife",storage:"dishStorage",
      manufacturer:"dishManufacturer",address:"dishAddress",barcode:"dishBarcode"};
    let dishes=[],chosenID=null,draft=null,dirty=false,search="",formOpen=false;
    let folders=[],catalogFolderID="all",printFolderID="all",printSearch="",printLimit=6;
    let printPresets=[],repairPresetID=null,repairSearch="";
    const rowEdits={}; let detailFor=null;
    let selected=new Set(),copies={},templateOverrides={},previewID=null,formInitialized=false;
    let defaultTemplateID=null,pickerFor=null,templateQuery="",templateLimit=6,validationErrors={};
    const findDish=id=>dishes.find(d=>same(d.id,id));
    const findTemplate=id=>state.templates.find(t=>same(t.id,id));
    const validFolder=id=>folders.some(f=>same(f.id,id))?id:null;
    const inFolder=(d,id)=>id==="all"||
      (id==="unfiled"?!validFolder(d.folderID):same(d.folderID,id));
    const matches=(d,q)=>String(d.name||"").toLocaleLowerCase("ru").includes(q.toLocaleLowerCase("ru"));
    const byName=(a,b)=>String(a.name).localeCompare(String(b.name),"ru");
    const list=()=>dishes.filter(d=>inFolder(d,catalogFolderID)&&matches(d,search)).sort(byName);
    const printList=()=>dishes.filter(d=>inFolder(d,printFolderID)&&matches(d,printSearch)).sort(byName);
    const folderName=id=>folders.find(f=>same(f.id,id))?.name||"Без папки";
    const fresh=()=>({id:uuid(),kind:"product",
      folderID:validFolder(catalogFolderID),customFields:[],
      ...Object.fromEntries(Object.keys(fieldIDs).filter(k=>k!=="kind").map(k=>[k,""]))});
    const kindLabel=kind=>({food:"Блюдо",product:"Товар",other:"Данные"})[kind]||"Позиция";
    function renderCustomFields(){
      if(!Array.isArray(draft.customFields))draft.customFields=[];
      $("customFields").innerHTML=draft.customFields.length?draft.customFields.map((f,i)=>
        '<div class="custom-row"><input data-custom-name="'+i+'" value="'+esc(f.name||"")+
        '" placeholder="Имя поля в шаблоне" aria-label="Название поля">'+
        '<input data-custom-value="'+i+'" value="'+esc(f.value||"")+
        '" placeholder="Значение" aria-label="Значение поля">'+
        '<button type="button" data-custom-remove="'+i+'" aria-label="Удалить поле" title="Удалить поле">×</button></div>'
      ).join(""):'<p class="muted custom-empty">Добавьте поле, если стандартных недостаточно.</p>';
    }
    function editForm(){
      draft=draft||fresh();
      for(const [key,id] of Object.entries(fieldIDs))
        $(id).value=key==="kind"?(draft.kind||"food"):
          ($(id).type==="number"?String(draft[key]??"").replace(",","."):String(draft[key]??""));
      $("itemKindButtons").innerHTML=[["product","Товар"],["food","Блюдо"],["other","Данные"]]
        .map(([value,label])=>'<button type="button" data-kind-choice="'+value+'" class="'+
          ((draft.kind||"food")===value?'current':'')+'">'+label+'</button>').join("");
      renderCustomFields();
      renderFolderPicker();
      $("dishFormTitle").textContent=chosenID?"Карточка: "+(draft.name||"без названия"):"Новая позиция";
      $("dishFormHint").textContent=dirty?"Есть несохранённые изменения":"Поля независимы от шаблонов";
      $("deleteDish").disabled=!chosenID;formInitialized=true;
    }
    function folderChips(current,action){
      const options=[{id:"unfiled",name:"Без папки"},...folders.slice().sort(byName)];
      return options.map(f=>'<button type="button" data-'+action+'="'+esc(f.id)+
        '" class="'+((current==="unfiled"&&!f.id)||same(current,f.id)?'selected':'')+
        '">'+esc(f.name)+'</button>').join("");
    }
    function renderFolderPicker(){
      $("itemFolderPicker").innerHTML=folderChips(validFolder(draft?.folderID)||"unfiled","assign-item-folder");
    }
    function renderSidebar(){
      const count=id=>dishes.filter(d=>inFolder(d,id)).length;
      const entry=(id,name,n)=>{
        const chosen=same(catalogFolderID,id);
        const removable=id!=="all"&&id!=="unfiled";
        return '<div class="item-folder-entry'+(chosen?' active':'')+'">'+
          '<button type="button" data-catalog-folder="'+esc(id)+'"><span>▤ '+esc(name)+
          '</span><span class="folder-count">'+n+'</span></button>'+
          (removable?
            '<button type="button" class="folder-action" data-item-folder-rename="'+esc(id)+
            '" title="Переименовать папку">✎</button>'+
            '<button type="button" class="folder-action danger" data-item-folder-delete="'+esc(id)+
            '" title="Удалить папку, сохранив позиции">×</button>':'')+'</div>';
      };
      $("itemFolders").innerHTML=entry("all","Все позиции",dishes.length)+
        entry("unfiled","Без папки",count("unfiled"))+
        folders.slice().sort(byName).map(f=>entry(f.id,f.name,count(f.id))).join("");
      const visible=list();
      $("dishSummary").textContent=visible.length+" / "+dishes.length;
      $("dishList").innerHTML=visible.length?visible.map(d=>
        '<div class="catalog-record"><div class="record-main"><strong>'+esc(d.name)+'</strong>'+
        '<small>'+esc(kindLabel(d.kind||"food")+(d.weightG?" · "+d.weightG+" г":"")+
          (d.shelfLifeHours?" · "+d.shelfLifeHours+" ч":""))+
        ' · '+esc(folderName(d.folderID))+'</small></div><div class="record-actions">'+
        '<button type="button" data-dish-open="'+esc(d.id)+'">Редактировать</button>'+
        '<button type="button" data-dish-add="'+esc(d.id)+'" class="primary">'+
        (selected.has(d.id)?"В партии ✓":"＋ В печать")+'</button>'+
        '<button type="button" data-dish-remove="'+esc(d.id)+'" class="danger">Удалить</button>'+
        '</div></div>').join(""):
        '<div class="print-empty">'+(dishes.length?"В этой папке нет позиций":"Каталог пуст. Создайте первую позицию.")+'</div>';
      $("catalogRecords").hidden=formOpen;
      $("catalogEditor").hidden=!formOpen;
    }
    function renderPrintFilters(){
      const filter=(id,title)=>'<button type="button" data-print-folder="'+esc(id)+
        '" class="'+(same(printFolderID,id)?'selected':'')+'">'+esc(title)+'</button>';
      $("printFolderFilters").innerHTML=filter("all","Все · "+dishes.length)+
        filter("unfiled","Без папки")+
        folders.slice().sort(byName).map(f=>filter(f.id,f.name)).join("");
    }
    async function createFolder(){
      const name=window.prompt("Название папки каталога","Новая папка")?.trim();
      if(!name)return;
      if(name.length>60){note("Название папки: максимум 60 символов",true);return;}
      if(folders.some(f=>f.name.toLocaleLowerCase("ru")===name.toLocaleLowerCase("ru"))){
        note("Папка с таким названием уже существует",true);return;
      }
      const folder={id:uuid(),name};
      try{
        const next=[...folders,folder];
        await native("saveData",{key:"itemFolders",json:JSON.stringify(next)});
        folders=next;catalogFolderID=folder.id;
        if(!chosenID&&draft&&!dirty)draft.folderID=folder.id;
        renderSidebar();renderFolderPicker();renderPrintFilters();renderBatch();
        note("Папка создана: "+name);
      }catch(e){note("Не удалось создать папку: "+e.message,true);}
    }
    async function renameFolder(id){
      const folder=folders.find(f=>same(f.id,id));if(!folder)return;
      const name=window.prompt("Новое имя папки",folder.name)?.trim();
      if(!name||name===folder.name)return;
      if(name.length>60||folders.some(f=>!same(f.id,id)&&
        f.name.toLocaleLowerCase("ru")===name.toLocaleLowerCase("ru"))){
        note("Некорректное или повторяющееся имя папки",true);return;
      }
      const next=folders.map(f=>same(f.id,id)?{...f,name}:f);
      try{
        await native("saveData",{key:"itemFolders",json:JSON.stringify(next)});
        folders=next;renderSidebar();renderFolderPicker();renderPrintFilters();
        note("Папка переименована");
      }catch(e){note("Не удалось переименовать папку: "+e.message,true);}
    }
    async function deleteFolder(id){
      const folder=folders.find(f=>same(f.id,id));if(!folder)return;
      if(!window.confirm("Удалить папку «"+folder.name+"»? Позиции останутся в «Без папки»."))return;
      const old=dishes;
      const moved=dishes.map(d=>same(d.folderID,id)?{...d,folderID:null}:d);
      const next=folders.filter(f=>!same(f.id,id));
      try{
        await native("saveData",{key:"items",json:JSON.stringify(moved)});
        try{
          await native("saveData",{key:"itemFolders",json:JSON.stringify(next)});
        }catch(e){
          try{await native("saveData",{key:"items",json:JSON.stringify(old)});}
          catch(rollback){throw Error(e.message+"; не удалось восстановить позиции: "+rollback.message);}
          throw e;
        }
        dishes=moved;folders=next;
        if(same(catalogFolderID,id))catalogFolderID="unfiled";
        if(same(printFolderID,id))printFolderID="unfiled";
        if(draft&&same(draft.folderID,id))draft.folderID=null;
        renderSidebar();renderFolderPicker();renderPrintFilters();renderBatch();
        note("Папка удалена. Позиции сохранены без папки.");
      }catch(e){note("Не удалось удалить папку: "+e.message,true);}
    }
    function defaultTemplate(){
      return state.templates.find(t=>t.starterPack==="food-v1"&&compatibility(t).ok)||
        state.templates.find(t=>compatibility(t).ok)||state.templates[0];
    }
    function templateList(){
      return state.templates.slice().sort((a,b)=>
        a.name.localeCompare(b.name,"ru"));
    }
    function matchingTemplates(){
      return templateList().filter(t=>String(t.name||"").toLocaleLowerCase("ru")
        .includes(templateQuery.toLocaleLowerCase("ru")));
    }
    function templateCards(selectedID,dishID){
      const pinned=findTemplate(selectedID);
      const found=matchingTemplates();
      const visible=[...(pinned?[pinned]:[]),
        ...found.filter(t=>!same(t.id,selectedID)).slice(0,templateLimit)];
      return visible.map(t=>{
        const ok=compatibility(t).ok,chosen=same(selectedID,t.id);
        const action=dishID?' data-pick-template="'+esc(t.id)+'" data-dish-id="'+esc(dishID)+'"':
          ' data-pick-default="'+esc(t.id)+'"';
        return '<button type="button" class="template-chip'+(chosen?' selected':'')+
          (ok?'':' incompatible')+'"'+action+' title="'+esc(t.name)+'">'+
          '<span>'+esc(t.name)+'</span><small>'+esc(t.widthMM)+' × '+esc(t.heightMM)+
          ' мм'+(ok?'':' · рулон не подходит')+'</small></button>';
      }).join("");
    }
    const supplementalFields=[
      ["name","Название"],["weightG","Вес, г"],["ingredients","Состав"],
      ["allergens","Аллергены"],["kcal","Ккал / 100 г"],
      ["protein","Белки"],["fat","Жиры"],["carbs","Углеводы"],
      ["manufacturer","Производитель"],["address","Адрес"],
      ["storage","Условия хранения"],["shelfLifeHours","Срок годности, часы"],
      ["barcode","Штрихкод"]
    ];
    function rowEdit(d){
      if(!rowEdits[d.id])rowEdits[d.id]={values:{},extras:clone(d.customFields||[])};
      return rowEdits[d.id];
    }
    function editableRow(d){
      const edit=rowEdit(d);
      const fields=supplementalFields.map(([key,title])=>{
        const value=Object.hasOwn(edit.values,key)?edit.values[key]:String(d[key]??"");
        const control=["ingredients","allergens","address","storage"].includes(key)?
          '<textarea rows="2" data-row-value="'+esc(key)+'" data-dish-id="'+esc(d.id)+'">'+esc(value)+'</textarea>':
          '<input '+(["weightG","kcal","protein","fat","carbs","shelfLifeHours"].includes(key)?
             'type="number" min="0" step="0.1"':'type="text"')+
          ' value="'+esc(["weightG","kcal","protein","fat","carbs","shelfLifeHours"].includes(key)?
            String(value).replace(",","."):value)+'" data-row-value="'+esc(key)+
          '" data-dish-id="'+esc(d.id)+'">';
        return '<label>'+esc(title)+control+'</label>';
      }).join("");
      const extras=edit.extras.map((f,index)=>
        '<div class="custom-row"><input value="'+esc(f.name||"")+
        '" data-row-extra-name="'+index+'" data-dish-id="'+esc(d.id)+
        '" placeholder="Название поля"><input value="'+esc(f.value||"")+
        '" data-row-extra-value="'+index+'" data-dish-id="'+esc(d.id)+
        '" placeholder="Значение"><button data-row-extra-remove="'+index+
        '" data-dish-id="'+esc(d.id)+'" type="button" title="Убрать поле">×</button></div>').join("");
      return '<tr class="batch-edit-row"><td colspan="5"><div class="batch-edit-title">'+
        '<strong>Дополнить для печати: '+esc(d.name)+'</strong>'+
        '<button type="button" data-close-detail="'+esc(d.id)+'">Закрыть ×</button></div>'+
        '<p class="batch-edit-help">Изменения только для этой партии. Сохранённая позиция не изменяется.</p>'+
        '<div class="batch-override-grid">'+fields+'</div>'+
        '<p class="batch-edit-help">Дополнительные поля</p>'+
        '<div class="batch-custom-overrides">'+extras+'</div>'+
        '<div class="batch-edit-tools"><button type="button" data-row-extra-add="'+esc(d.id)+
        '">＋ Добавить поле</button><button type="button" data-reset-overrides="'+esc(d.id)+
        '">Сбросить дополнения</button></div></td></tr>';
    }
    function printableItem(d){
      const item=clone(d),edit=rowEdits[d.id];
      if(!edit)return item;
      Object.assign(item,edit.values);
      const normalized=new Set();
      const extras=[];
      for(const f of edit.extras){
        const name=String(f.name||"").trim(),value=String(f.value||"");
        if(!name){if(value.trim())throw Error("Позиция «"+d.name+"»: укажите имя дополнительного поля");continue;}
        const n=root.EZ2Dishes.normalize(name);
        if(normalized.has(n))throw Error("Позиция «"+d.name+"»: повторяется поле «"+name+"»");
        normalized.add(n);
        extras.push({id:f.id||uuid(),name,value});
      }
      item.customFields=extras;
      return item;
    }

    function missingInPreset(p){
      for(const it of p.items){
        if(!findDish(it.itemID))return {kind:"item",oldID:it.itemID,name:it.itemName||it.itemID};
        if(!findTemplate(it.templateID))return {kind:"template",oldID:it.templateID,
          name:it.templateName||it.templateID};
      }
      return null;
    }
    function repairOptions(p,missing){
      if(!missing)return "";
      const options=missing.kind==="item"?
        dishes.filter(d=>!p.items.some(it=>same(it.itemID,d.id))):
        templateList().filter(t=>compatibility(t).ok);
      const choices=options.filter(o=>String(o.name).toLocaleLowerCase("ru")
        .includes(repairSearch.toLocaleLowerCase("ru"))).slice(0,6);
      return '<div class="preset-repair"><strong>Нет '+(missing.kind==="item"?'позиции':'макета')+
        ': '+esc(missing.name)+'</strong><p class="muted">Выберите замену. Исходный пресет будет обновлён.</p>'+
        '<input type="search" data-repair-search="'+esc(p.id)+'" value="'+esc(repairSearch)+
        '" placeholder="Поиск замены…"><div class="preset-repair-options">'+
        (choices.length?choices.map(o=>
          '<button type="button" data-preset-replace="'+esc(o.id)+
          '" data-replace-kind="'+missing.kind+'" data-preset-id="'+esc(p.id)+'">'+
          esc(o.name)+'</button>').join(""):'<span class="muted">Замена не найдена</span>')+
        '</div></div>';
    }
    function renderPresets(){
      $("printPresets").innerHTML=printPresets.length?printPresets.slice().sort((a,b)=>
        String(a.name).localeCompare(String(b.name),"ru")).map(p=>{
        const missing=missingInPreset(p),broken=!!missing;
        return '<div class="print-preset"><div><strong>'+esc(p.name)+'</strong>'+
          '<small> · '+p.items.length+' позиций'+(broken?' · требуется замена':'')+'</small></div>'+
          '<div class="print-preset-actions">'+
          (broken?'<button type="button" data-preset-repair="'+esc(p.id)+
            '">Исправить</button>':
            '<button type="button" data-preset-load="'+esc(p.id)+'">Открыть</button>'+
            '<button type="button" data-preset-queue="'+esc(p.id)+'">В очередь →</button>'+
            '<button type="button" data-preset-print="'+esc(p.id)+'" class="primary">'+
              'Печатать…</button>')+
          '<button type="button" data-preset-delete="'+esc(p.id)+'" class="danger">Удалить</button></div>'+
          (repairPresetID===p.id?repairOptions(p,missing):'')+'</div>';
      }).join(""):'<p class="muted">Нет сохранённых партий. Соберите набор и нажмите «Сохранить».</p>';
    }
    async function repairPreset(presetID,kind,replacementID){
      const p=printPresets.find(x=>x.id===presetID),missing=p&&missingInPreset(p);
      if(!missing||missing.kind!==kind)return;
      const target=kind==="item"?findDish(replacementID):findTemplate(replacementID);
      if(!target)return;
      if(kind==="item"&&p.items.some(it=>same(it.itemID,replacementID))){
        note("Эта позиция уже есть в партии",true);return;
      }
      const updated=clone(p);
      const row=updated.items.find(it=>same(it[kind==="item"?"itemID":"templateID"],missing.oldID));
      if(!row)return;
      if(kind==="item"){row.itemID=target.id;row.itemName=target.name;}
      else {row.templateID=target.id;row.templateName=target.name;}
      updated.updatedAt=new Date().toISOString();
      try{
        await persistPresets(printPresets.map(x=>x.id===updated.id?updated:x));
        repairSearch="";repairPresetID=missingInPreset(updated)?updated.id:null;
        renderPresets();note("Пресет обновлён: "+p.name);
      }catch(e){note("Не удалось заменить элемент: "+e.message,true);}
    }
    async function persistPresets(next){
      await native("saveData",{key:"printPresets",json:JSON.stringify(next)});
      printPresets=next;renderPresets();
    }
    async function savePreset(){
      if(!selected.size){note("Сначала добавьте хотя бы одну позицию",true);return;}
      const suggested=$("batchName").value.trim()||
        ("Партия "+new Date().toLocaleDateString("ru-RU"));
      const name=window.prompt("Название пресета печати",suggested)?.trim();
      if(!name)return;
      if(name.length>100){note("Название пресета: максимум 100 символов",true);return;}
      const existing=printPresets.find(p=>p.name.toLocaleLowerCase("ru")===name.toLocaleLowerCase("ru"));
      if(existing&&!window.confirm("Заменить сохранённую партию «"+name+"»?"))return;
      const items=dishes.filter(d=>selected.has(d.id)).map(d=>({
        itemID:d.id,itemName:d.name,copies:copies[d.id]||1,
        templateID:templateOverrides[d.id]||defaultTemplateID,
        templateName:findTemplate(templateOverrides[d.id]||defaultTemplateID)?.name||"",
        overrides:rowEdits[d.id]?clone(rowEdits[d.id]):null
      }));
      if(items.some(it=>!findTemplate(it.templateID))){
        note("Нельзя сохранить партию: один из макетов не найден",true);return;
      }
      const now=new Date().toISOString();
      const preset={id:existing?.id||uuid(),name,items,
        defaultTemplateID,batchCode:$("batchCode").value.trim(),
        createdAt:existing?.createdAt||now,updatedAt:now};
      try{
        await persistPresets([...printPresets.filter(p=>p.id!==preset.id),preset]);
        note("Партия сохранена: "+name);
      }catch(e){note("Не удалось сохранить пресет: "+e.message,true);}
    }
    function loadPreset(id){
      const p=printPresets.find(x=>x.id===id);
      if(!p)return false;
      if(!Array.isArray(p.items)||!p.items.length){note("Пресет пуст",true);return false;}
      const bad=p.items.find(it=>!findDish(it.itemID)||!findTemplate(it.templateID));
      if(bad){
        note("Пресет «"+p.name+"» содержит удалённую позицию или шаблон. Исправьте каталог или создайте новый пресет.",true);
        return false;
      }
      const ids=new Set(p.items.map(it=>it.itemID));
      if(ids.size!==p.items.length){note("В пресете повторяются позиции",true);return false;}
      selected=ids;copies={};templateOverrides={};
      for(const key of Object.keys(rowEdits))delete rowEdits[key];
      for(const it of p.items){
        copies[it.itemID]=Math.max(1,Math.min(200,Math.round(Number(it.copies)||1)));
        templateOverrides[it.itemID]=it.templateID;
        if(it.overrides)rowEdits[it.itemID]=clone(it.overrides);
      }
      defaultTemplateID=findTemplate(p.defaultTemplateID)?.id||p.items[0].templateID;
      $("batchName").value=p.name;
      $("batchCode").value=p.batchCode||"";
      // Dates are deliberately fresh on every reuse, not frozen in the preset.
      $("batchProducedAt").value=localDateTime();
      $("batchExpiresAt").value="";
      pickerFor=null;detailFor=null;previewID=null;
      $("dishPreview").removeAttribute("src");
      renderBatch();renderSidebar();
      note("Партия открыта: "+p.name+". Дата обновлена.");
      return true;
    }
    async function deletePreset(id){
      const p=printPresets.find(x=>x.id===id);if(!p)return;
      if(!window.confirm("Удалить пресет «"+p.name+"»? Сохранённые позиции останутся."))return;
      try{
        await persistPresets(printPresets.filter(x=>x.id!==id));
        note("Пресет удалён: "+p.name);
      }catch(e){note("Не удалось удалить пресет: "+e.message,true);}
    }

    function renderBatch(){
      const unselected=printList().filter(d=>!selected.has(d.id));
      const candidates=unselected.slice(0,printLimit);
      const visible=dishes.filter(d=>selected.has(d.id)).sort(byName);
      $("printFoundCount").textContent=unselected.length+" доступно";
      $("printMore").hidden=unselected.length<=printLimit;
      renderPresets();
      if(!findTemplate(defaultTemplateID))defaultTemplateID=defaultTemplate()?.id||null;
      const defaultID=defaultTemplateID;
      renderPrintFilters();
      $("printCatalogResults").innerHTML=candidates.length?candidates.map(d=>
        '<div class="print-result"><div><strong>'+esc(d.name)+'</strong><small>'+
        esc(kindLabel(d.kind||"food")+' · '+folderName(d.folderID))+
        '</small></div><button type="button" data-add-print="'+esc(d.id)+'"'+
        '>＋ Добавить</button></div>').join(""):
        '<div class="print-empty">В этой папке ничего не найдено</div>';
      $("addVisibleToPrint").disabled=!candidates.length;
      $("dishBatchTemplate").innerHTML=templateCards(defaultID,null)||
        '<p class="muted">Создайте шаблон в редакторе</p>';
      $("dishBatchRows").innerHTML=visible.length?visible.map(d=>{
        const count=copies[d.id]||1;
        const id=templateOverrides[d.id]||defaultID;
        const label=findTemplate(id);
        const row='<tr><td><button type="button" data-remove-print="'+esc(d.id)+
          '" class="danger">Убрать</button></td>'+
          '<td><strong style="font-size:12px;margin:0">'+esc(d.name)+'</strong>'+
          '<small style="display:block;color:#7b899e">'+esc(kindLabel(d.kind||"food")+
            (d.weightG?" · "+d.weightG+" г":""))+' · '+esc(folderName(d.folderID))+'</small>'+
        (validationErrors[d.id]?'<small class="batch-validation-error">'+
          esc(validationErrors[d.id])+'</small>':'')+'</td>'+
          '<td><div class="copies-stepper">'+
          '<button type="button" data-copy-step="-1" data-dish-id="'+esc(d.id)+
          '" aria-label="Минус одна копия">−</button>'+
          '<input type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]*"'+
          ' value="'+esc(count)+'" data-dish-copies="'+esc(d.id)+'" aria-label="Копий">'+
          '<button type="button" data-copy-step="1" data-dish-id="'+esc(d.id)+
          '" aria-label="Плюс одна копия">+</button></div></td>'+
          '<td><button type="button" class="selected-template" data-open-template="'+esc(d.id)+
          '"><span>'+esc(label?.name||"Выбрать шаблон")+'</span><b>Изменить</b></button></td>'+
          '<td><div class="flex"><button type="button" data-open-detail="'+esc(d.id)+
          '">Дополнить</button><button data-dish-preview="'+esc(d.id)+'">Просмотр</button></div></td></tr>';
        let extra='';
        if(pickerFor===d.id){
          extra+='<tr class="template-pick-row"><td colspan="5"><div class="template-pick-header">'+
            '<strong>Шаблон для «'+esc(d.name)+'»</strong>'+
            '<button type="button" data-close-picker="'+esc(d.id)+'">Закрыть ×</button></div>'+
            '<div class="template-chip-list">'+templateCards(id,d.id)+'</div></td></tr>';
        }
        if(detailFor===d.id)extra+=editableRow(d);
        return row+extra;
      }).join(""):'<tr><td colspan="5"><div class="print-empty">Партия пока пуста. Добавьте позиции из каталога выше.</div></td></tr>';
      $("batchTemplateMore").hidden=matchingTemplates().length<=templateLimit+1;
            const count=selected.size,total=visible.reduce((n,d)=>n+(copies[d.id]||1),0);
      $("selectedDishCount").textContent=count+" позиций · "+total+" этикеток";
      $("printRowCount").textContent="("+count+")";
      $("printSelectedCount").textContent=count?String(count):"";
      $("dishBatchStatus").textContent=count?
        "В партии только выбранные позиции. Дополнения действуют однократно.":
        "Сначала добавьте нужные позиции. Ничего не выбрано по умолчанию.";
      $("queueDishes").disabled=!count||!state.templates.length||state.running;
    }
    function removeFromPrint(id){
      if(!selected.has(id))return;
      selected.delete(id);
      delete copies[id];delete rowEdits[id];delete templateOverrides[id];
      if(pickerFor===id)pickerFor=null;
      if(detailFor===id)detailFor=null;
      if(previewID===id){
        previewID=null;$("dishPreview").removeAttribute("src");
        $("dishPreviewError").textContent="";
        $("dishPreviewCaption").textContent="";
      }
      renderBatch();renderSidebar();
    }
    function render(){
      if(!formInitialized)editForm();
      renderSidebar();
      renderBatch();
    }
    function renderPrint(){renderBatch();}
    function newDish(){
      if(dirty&&!window.confirm("Карточка не сохранена. Отменить изменения?"))return;
      chosenID=null;draft=fresh();dirty=false;formOpen=true;editForm();renderSidebar();
      $("dishName").focus?.();
    }
    function openDish(id){
      const dish=findDish(id);if(!dish)return;
      if(dirty&&!window.confirm("Карточка не сохранена. Отменить изменения?"))return;
      chosenID=dish.id;draft=clone(dish);dirty=false;formOpen=true;editForm();renderSidebar();
    }
    function validateDish(dish,{allowMissingName=false}={}){
      dish.name=String(dish.name||"").trim();
      if(!dish.name&&!allowMissingName)throw Error("Укажите название позиции");
      if(dish.name.length>140)throw Error("Название слишком длинное (максимум 140)");
      if(!["food","product","other"].includes(dish.kind))dish.kind="product";
      const custom=Array.isArray(dish.customFields)?dish.customFields:[];
      if(custom.length>40)throw Error("Максимум 40 дополнительных полей");
      const seen=new Set();
      dish.customFields=custom.map(f=>({
        id:String(f.id||uuid()),name:String(f.name||"").trim(),value:String(f.value||"")
      })).filter(f=>f.name||f.value);
      for(const field of dish.customFields){
        if(!field.name)throw Error("Укажите название дополнительного поля");
        if(field.name.length>80)throw Error("Название поля — максимум 80 символов");
        if(field.value.length>5000)throw Error("Значение поля — максимум 5000 символов");
        const key=root.EZ2Dishes.normalize(field.name);
        if(!key||seen.has(key))throw Error("Повторяется поле «"+field.name+"»");
        seen.add(key);
      }
      for(const key of ["weightG","kcal","protein","fat","carbs","shelfLifeHours"]){
        const raw=String(dish[key]??"").trim();
        if(!raw)continue;
        const n=Number(raw.replace(",","."));
        if(!Number.isFinite(n)||n<0||n>100000||
          (key==="shelfLifeHours"&&(!n||n>87600)))throw Error("Некорректное число: "+key);
        dish[key]=String(n).replace(".",",");
      }
    }
    async function persistDishes(next){
      await native("saveData",{key:"items",json:JSON.stringify(next)});
      dishes=next;
    }
    async function saveDish(){
      const item=clone(draft||fresh());
      try{validateDish(item);}catch(e){note(e.message,true);return;}
      item.updatedAt=new Date().toISOString();
      try{
        await persistDishes(dishes.filter(d=>!same(d.id,item.id)).concat([item]));
        chosenID=null;draft=fresh();dirty=false;formOpen=false;
        editForm();renderSidebar();renderBatch();note("Позиция сохранена: "+item.name);
      }catch(e){note("Не удалось сохранить блюдо: "+e.message,true);}
    }
    async function deleteDish(recordID){
      const dish=findDish(typeof recordID==="string"?recordID:chosenID);if(!dish)return;
      if(!window.confirm("Удалить позицию «"+dish.name+"»? Задания в очереди останутся."))return;
      try{
        await persistDishes(dishes.filter(d=>!same(d.id,dish.id)));
        selected.delete(dish.id);delete copies[dish.id];delete templateOverrides[dish.id];delete rowEdits[dish.id];
        chosenID=null;draft=fresh();dirty=false;formOpen=false;editForm();render();
        note("Позиция удалена");
      }catch(e){note("Не удалось удалить блюдо: "+e.message,true);}
    }
    function batchData(){
      return {producedAt:$("batchProducedAt").value,expiresAt:$("batchExpiresAt").value,
        batchCode:$("batchCode").value.trim()};
    }
    function documentFor(dish,templateID){
      const template=findTemplate(templateID);
      if(!template)throw Error("Позиция «"+dish.name+"»: шаблон не найден");
      const doc=root.EZ2Dishes.fill(template,printableItem(dish),batchData());
      const check=compatibility(doc);
      if(!check.ok)throw Error("Позиция «"+dish.name+"»: "+check.reason);
      if(!root.EZ2Raster.transportReady(media()))
        throw Error("Установленный рулон пока не поддерживается печатью");
      return doc;
    }
    function previewDish(id){
      const dish=findDish(id);if(!dish)return;previewID=id;
      try{
        const doc=documentFor(dish,templateOverrides[id]||defaultTemplateID);
        encodeJob(doc,1);
        $("dishPreview").src=root.EZ2Raster.draw(doc).toDataURL("image/png");
        $("dishPreviewError").textContent="";
        $("dishPreviewCaption").textContent=dish.name+" · "+doc.widthMM+"×"+doc.heightMM+
          " мм · "+(doc.printMode==="text"?"Текст CP866 (эскиз)":"Растр");
      }catch(e){
        $("dishPreview").removeAttribute("src");
        $("dishPreviewError").textContent=e.message;
        $("dishPreviewCaption").textContent="Не готово к печати";
      }
    }
    function validateSelected(){
      const issues={};let checked=0;
      for(const dish of dishes.filter(d=>selected.has(d.id))){
        try{
          const count=Number(copies[dish.id]||1);
          if(!Number.isInteger(count)||count<1||count>200)
            throw Error("Копий: от 1 до 200");
          const doc=documentFor(dish,templateOverrides[dish.id]||defaultTemplateID);
          encodeJob(doc,count);checked++;
        }catch(e){issues[dish.id]=e.message;}
      }
      validationErrors=issues;
      renderBatch();
      const total=Object.keys(issues).length;
      note(total?"Найдены ошибки: "+total+". Исправьте выделенные позиции.":
        "Проверено позиций: "+checked+". Партия готова.",total>0);
      return !total;
    }
        async function queueSelected(){
      const active=dishes.filter(d=>selected.has(d.id));
      if(!active.length){note("Отметьте позиции",true);return;}
      const items=[];
      try{
        for(const dish of active){
          const count=Number(copies[dish.id]||1);
          if(!Number.isInteger(count)||count<1||count>200)
            throw Error("Позиция «"+dish.name+"»: копий от 1 до 200");
          const doc=documentFor(dish,templateOverrides[dish.id]||defaultTemplateID);
          encodeJob(doc,count); // validate before any queue writes
          const prefix=$("batchName").value.trim();
          if(prefix)doc.name=prefix+" · "+doc.name;
          items.push({id:uuid(),document:doc,copies:count,addedAt:new Date().toISOString(),
            state:"pending",errorMessage:null});
        }
        const jobs=state.jobs.concat(items);
        await native("saveData",{key:"queue",json:JSON.stringify(jobs)});
        state.jobs=jobs;renderQueue();renderBatch();
        note("В очередь добавлено "+items.length+" позиций, этикеток: "+
          items.reduce((sum,j)=>sum+j.copies,0));
        openQueue?.();
        return items.map(item=>item.id);
      }catch(e){$("dishBatchStatus").textContent=e.message;note(e.message,true);return null;}
    }
    function localDateTime(date=new Date()){
      const pad=n=>String(n).padStart(2,"0");
      return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+
        "T"+pad(date.getHours())+":"+pad(date.getMinutes());
    }
    function bootstrap(raw,savedFolders,savedPresets){
      printPresets=Array.isArray(savedPresets)?savedPresets.filter(p=>p&&p.id&&p.name&&Array.isArray(p.items)):[];
      folders=Array.isArray(savedFolders)?savedFolders.filter(f=>f&&f.id&&f.name):[];
      dishes=Array.isArray(raw)?raw.filter(d=>d&&d.id&&d.name)
        .map(d=>({...d,kind:d.kind||"food",
          customFields:Array.isArray(d.customFields)?d.customFields:[]})):[];
      chosenID=null;draft=fresh();formOpen=false;selected.clear();printLimit=6;
      dirty=false;formInitialized=false;validationErrors={};
      $("batchProducedAt").value=localDateTime();
      render();
    }
    // AI fills the existing draft only. Normal saveDish remains the single persistence path.
    root.EZ2AIFill?.mount({
      form:$("dishFields"),dialog:$("aiFillDialog"),
      getDraft:()=>draft,getItems:()=>dishes,
      getFolderName:()=>draft?.folderID?folderName(draft.folderID):"",
      apply:updated=>{
        draft=updated;dirty=true;editForm();
        $("dishFormHint").textContent="Есть несохранённые изменения";
      },
      validate:item=>validateDish(item,{allowMissingName:true}),
      uuid,clone,note
    });
    // Named buttons and delegated table events are independent from the legacy template UI.
    $("newDishMain").addEventListener("click",newDish);
    $("closeDishEditor").addEventListener("click",()=>{
      if(dirty&&!window.confirm("Отменить несохранённые изменения?"))return;
      formOpen=false;chosenID=null;draft=fresh();dirty=false;editForm();renderSidebar();
    });
    $("saveDish").addEventListener("click",saveDish);
    $("addItemFolder").addEventListener("click",createFolder);
    $("printSearch").addEventListener("input",e=>{
      printSearch=String(e.target.value||"").trim();printLimit=6;
      renderBatch();
    });
    $("itemFolderPicker").addEventListener("click",e=>{
      const button=e.target.closest("[data-assign-item-folder]");
      if(!button)return;
      const id=button.dataset.assignItemFolder;
      draft.folderID=id==="unfiled"?null:validFolder(id);
      dirty=true;renderFolderPicker();
      $("dishFormHint").textContent="Есть несохранённые изменения";
    });
    $("printFolderFilters").addEventListener("click",e=>{
      const button=e.target.closest("[data-print-folder]");
      if(!button)return;
      printFolderID=button.dataset.printFolder;printLimit=6;
      renderBatch();
    });
    $("addCustomField").addEventListener("click",()=>{
      if(!draft)draft=fresh();
      if(!Array.isArray(draft.customFields))draft.customFields=[];
      if(draft.customFields.length>=40){note("Максимум 40 полей",true);return;}
      draft.customFields.push({id:uuid(),name:"",value:""});
      dirty=true;renderCustomFields();
      $("dishFormHint").textContent="Есть несохранённые изменения";
    });
    $("customFields").addEventListener("input",e=>{
      const t=e.target;
      const nameIndex=t.dataset.customName, valueIndex=t.dataset.customValue;
      if(nameIndex!==undefined&&draft.customFields[Number(nameIndex)]){
        draft.customFields[Number(nameIndex)].name=t.value;
        dirty=true;
      }
      if(valueIndex!==undefined&&draft.customFields[Number(valueIndex)]){
        draft.customFields[Number(valueIndex)].value=t.value;
        dirty=true;
      }
      if(dirty)$("dishFormHint").textContent="Есть несохранённые изменения";
    });
    $("customFields").addEventListener("click",e=>{
      const target=e.target.closest("[data-custom-remove]");
      if(!target)return;
      const index=Number(target.dataset.customRemove);
      if(Number.isInteger(index)&&index>=0&&index<draft.customFields.length){
        draft.customFields.splice(index,1);
        dirty=true;renderCustomFields();
        $("dishFormHint").textContent="Есть несохранённые изменения";
      }
    });
    $("deleteDish").addEventListener("click",()=>deleteDish());
    $("dishSearch").addEventListener("input",e=>{search=e.target.value||"";renderSidebar();renderBatch();});
    $("dishFields").addEventListener("input",e=>{
      const key=e.target.dataset.dish;
      if(key&&Object.hasOwn(fieldIDs,key)){
        draft[key]=e.target.value;dirty=true;
        $("dishFormHint").textContent="Есть несохранённые изменения";
      }
    });
    $("batchTemplateSearch").addEventListener("input",e=>{
      templateQuery=String(e.target.value||"").trim();templateLimit=6;renderBatch();
    });
    $("batchTemplateMore").addEventListener("click",()=>{templateLimit+=6;renderBatch();});
    $("validateBatch").addEventListener("click",validateSelected);
    $("itemKindButtons").addEventListener("click",e=>{
      const button=e.target.closest("[data-kind-choice]");
      if(!button)return;
      const select=$("itemKind");select.value=button.dataset.kindChoice;
      select.dispatchEvent(new Event("input",{bubbles:true}));
      editForm();
    });
        $("dishBatchTemplate").addEventListener("click",e=>{
      const button=e.target.closest("[data-pick-default]");
      if(!button)return;
      defaultTemplateID=button.dataset.pickDefault;
      pickerFor=null;renderBatch();
      if(previewID)previewDish(previewID);
    });
    $("dishBatchRows").addEventListener("input",e=>{
      const el=e.target,id=el.dataset.dishId;
      if(!id)return;
      const dish=findDish(id);
      if(!dish)return;
      const edit=rowEdit(dish);
      if(el.dataset.rowValue!==undefined){
        edit.values[el.dataset.rowValue]=el.value;
      }else if(el.dataset.rowExtraName!==undefined){
        const f=edit.extras[Number(el.dataset.rowExtraName)];
        if(f)f.name=el.value;
      }else if(el.dataset.rowExtraValue!==undefined){
        const f=edit.extras[Number(el.dataset.rowExtraValue)];
        if(f)f.value=el.value;
      }
    });
    $("dishBatchRows").addEventListener("change",e=>{
      const target=e.target;
      if(target.dataset.dishCopies){
        const raw=String(target.value||"").trim();
        const n=Number(raw);
        if(/^\d+$/.test(raw)&&Number.isInteger(n)&&n>=1&&n<=200)
          copies[target.dataset.dishCopies]=n;
        else note("Копий должно быть от 1 до 200",true);
      }
      renderBatch();
    });
    $("savePrintPreset").addEventListener("click",savePreset);
    $("printPresets").addEventListener("click",async e=>{
      const load=e.target.closest("[data-preset-load]");
      if(load){loadPreset(load.dataset.presetLoad);return;}
      const queue=e.target.closest("[data-preset-queue]");
      if(queue){if(loadPreset(queue.dataset.presetQueue))await queueSelected();return;}
      const direct=e.target.closest("[data-preset-print]");
      if(direct){
        if(loadPreset(direct.dataset.presetPrint)){
          const ids=await queueSelected();
          if(ids?.length)await printQueuedIDs?.(ids);
        }
        return;
      }
      const fixing=e.target.closest("[data-preset-repair]");
      if(fixing){
        repairPresetID=repairPresetID===fixing.dataset.presetRepair?null:fixing.dataset.presetRepair;
        repairSearch="";renderPresets();return;
      }
      const swap=e.target.closest("[data-preset-replace]");
      if(swap){
        await repairPreset(swap.dataset.presetId,swap.dataset.replaceKind,swap.dataset.presetReplace);
        return;
      }
            const del=e.target.closest("[data-preset-delete]");
      if(del)await deletePreset(del.dataset.presetDelete);
    });
    $("printPresets").addEventListener("input",e=>{
      if(!e.target.matches?.("[data-repair-search]"))return;
      repairSearch=e.target.value||"";
      const start=e.target.selectionStart;
      renderPresets();
      const input=$("printPresets").querySelector?.("[data-repair-search]");
      if(input){input.focus?.();input.setSelectionRange?.(start,start);}
    });
        $("printMore").addEventListener("click",()=>{printLimit+=6;renderBatch();});
    $("printCatalogResults").addEventListener("click",e=>{
      const button=e.target.closest("[data-add-print]");
      if(!button||!findDish(button.dataset.addPrint))return;
      selected.add(button.dataset.addPrint);
      renderBatch();renderSidebar();
    });
    $("addVisibleToPrint").addEventListener("click",()=>{
      for(const d of printList().filter(d=>!selected.has(d.id)).slice(0,printLimit))selected.add(d.id);
      renderBatch();renderSidebar();
    });
        $("dishBatchRows").addEventListener("click",e=>{
      const removal=e.target.closest("[data-remove-print]");
      if(removal){removeFromPrint(removal.dataset.removePrint);return;}
      const target=e.target;
      const openDetail=target.closest("[data-open-detail]");
      if(openDetail){detailFor=detailFor===openDetail.dataset.openDetail?null:openDetail.dataset.openDetail;
        pickerFor=null;renderBatch();return;}
      const closeDetail=target.closest("[data-close-detail]");
      if(closeDetail){detailFor=null;renderBatch();return;}
      const addExtra=target.closest("[data-row-extra-add]");
      if(addExtra){
        const d=findDish(addExtra.dataset.rowExtraAdd);
        if(!d)return;
        const edit=rowEdit(d);
        if(edit.extras.length>=40){note("Максимум 40 дополнительных полей",true);return;}
        edit.extras.push({id:uuid(),name:"",value:""});
        renderBatch();return;
      }
      const removeExtra=target.closest("[data-row-extra-remove]");
      if(removeExtra){
        const id=removeExtra.dataset.dishId,d=findDish(id);
        if(!d)return;
        const edit=rowEdit(d),index=Number(removeExtra.dataset.rowExtraRemove);
        if(Number.isInteger(index)&&index>=0&&index<edit.extras.length){
          edit.extras.splice(index,1);renderBatch();
        }
        return;
      }
      const reset=target.closest("[data-reset-overrides]");
      if(reset){delete rowEdits[reset.dataset.resetOverrides];renderBatch();return;}
      const step=target.closest("[data-copy-step]");
      if(step){
        const id=step.dataset.dishId,delta=Number(step.dataset.copyStep);
        copies[id]=Math.max(1,Math.min(200,(copies[id]||1)+delta));
        renderBatch();return;
      }
      const open=target.closest("[data-open-template]");
      if(open){pickerFor=pickerFor===open.dataset.openTemplate?null:open.dataset.openTemplate;
        renderBatch();return;}
      const close=target.closest("[data-close-picker]");
      if(close){pickerFor=null;renderBatch();return;}
      const pick=target.closest("[data-pick-template]");
      if(pick){
        templateOverrides[pick.dataset.dishId]=pick.dataset.pickTemplate;
        pickerFor=null;renderBatch();
        if(previewID===pick.dataset.dishId)previewDish(previewID);
      }
    });
    $("clearDishSelection").addEventListener("click",()=>{
      for(const id of Array.from(selected))removeFromPrint(id);
      renderBatch();
    });
    $("queueDishes").addEventListener("click",queueSelected);
    for(const id of ["batchProducedAt","batchExpiresAt","batchCode"])
      $(id).addEventListener("change",()=>{if(previewID)previewDish(previewID);});
    document.body.addEventListener("click",e=>{
      const catalogFolder=e.target.closest("[data-catalog-folder]");
      if(catalogFolder){
        if(dirty&&!window.confirm("Отменить несохранённую карточку?"))return;
        catalogFolderID=catalogFolder.dataset.catalogFolder;
        formOpen=false;chosenID=null;draft=fresh();dirty=false;editForm();renderSidebar();return;
      }
      const rename=e.target.closest("[data-item-folder-rename]");
      if(rename){renameFolder(rename.dataset.itemFolderRename);return;}
      const remove=e.target.closest("[data-item-folder-delete]");
      if(remove){deleteFolder(remove.dataset.itemFolderDelete);return;}
      const add=e.target.closest("[data-dish-add]");
      if(add){
        const id=add.dataset.dishAdd;
        if(!findDish(id))return;
        selected.add(id);renderSidebar();renderBatch();openPrint?.();return;
      }
      const removeDish=e.target.closest("[data-dish-remove]");
      if(removeDish){deleteDish(removeDish.dataset.dishRemove);return;}
            const open=e.target.closest("[data-dish-open]");
      if(open){openDish(open.dataset.dishOpen);return;}
      const preview=e.target.closest("[data-dish-preview]");
      if(preview){previewDish(preview.dataset.dishPreview);}
    });
    function selectCurrentForPrint(){
      const item=findDish(chosenID);
      if(!item){note("Сначала сохраните позицию",true);return false;}
      if(dirty){note("Сначала сохраните изменения карточки",true);return false;}
      selected.add(item.id);
      renderBatch();
      return true;
    }
    return {bootstrap,render,renderPrint,selectCurrentForPrint,listItems:()=>clone(dishes)};
  }
  root.EZ2DishController={create};
})(typeof window!=="undefined"?window:globalThis);

/* AI-assisted catalog form fill via copy/paste. No network requests or persistence. */
(function(root){
  "use strict";
  const STORAGE_KEY="labeldesk-ai-fields-v1";
  const DEFAULT_KEYS=new Set(["name","weightG","kcal","protein","fat","carbs",
    "ingredients","allergens","shelfLifeHours","storage","manufacturer"]);
  const normalize=s=>String(s??"").trim().toLocaleLowerCase("ru-RU");
  const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
  const customID=name=>"custom:"+normalize(name);

  // The live form owns standard field names, labels, types and enum values.
  function discoverFields(form,draft,items){
    const fields=Array.from(form.querySelectorAll("[data-dish]")).map(el=>{
      const key=el.dataset.dish;
      const label=form.querySelector('label[for="'+el.id+'"]');
      const title=String(label?.textContent||key).trim().replace(/\s*\*\s*$/,"");
      const type=el.tagName==="SELECT"?"enum":el.type==="number"?"number":"string";
      const values=type==="enum"?Array.from(el.options).map(o=>({value:o.value,label:o.textContent.trim()})):[];
      return {id:key,key,title,type,required:!!el.required||/\*/.test(label?.textContent||""),
        values,min:el.min===""?null:Number(el.min),max:el.max===""?null:Number(el.max)};
    });
    const names=new Map();
    const add=f=>{
      if(!f||!String(f.name||"").trim())return;
      const name=String(f.name).trim(),id=customID(name);
      if(!names.has(id))names.set(id,{id,key:"customFields",name,title:name,
        type:"string",required:false,custom:true,values:[],min:null,max:5000});
    };
    for(const f of draft?.customFields||[])add(f);
    // A folder is not a category. Reuse only attribute names already recorded
    // in the currently selected folder, never invent a taxonomy.
    if(draft?.folderID){
      for(const item of items||[]){
        if(String(item.folderID||"")===String(draft.folderID))
          for(const f of item.customFields||[])add(f);
      }
    }
    return fields.concat(Array.from(names.values()));
  }

  function buildPrompt(fields,chosen,draft,folderName,includeCurrent){
    const selected=fields.filter(f=>chosen.has(f.id));
    if(!selected.length)throw Error("Выберите хотя бы одно поле");
    const standard=selected.filter(f=>!f.custom),custom=selected.filter(f=>f.custom);
    const schema={};
    for(const f of standard)schema[f.key]=null;
    if(custom.length)schema.customFields=custom.map(f=>({name:f.name,value:null}));
    const descriptions=standard.map(f=>{
      const allowed=f.type==="enum"?" Допустимые значения: "+
        f.values.map(x=>JSON.stringify(x.value)+" ("+x.label+")").join(", ")+".":"";
      const min=f.type==="number"&&f.min!==null?" Минимум: "+f.min+".":"";
      const max=f.type==="number"&&f.max!==null?" Максимум: "+f.max+".":"";
      const bound=f.key==="name"?" Максимум 140 символов.":"";
      return "- "+f.title+" — ключ "+JSON.stringify(f.key)+", тип "+f.type+
        (f.required?", обязательное поле":", необязательное поле")+". "+allowed+min+max+bound;
    });
    if(custom.length)descriptions.push("- customFields — массив объектов {name, value}. "+
      "Разрешены только имена: "+custom.map(f=>JSON.stringify(f.name)).join(", ")+
      ". value: строка или null, до 5000 символов.");
    const lines=[
      "Заполни карточку товара по приложенным фотографиям упаковки, скриншотам и/или тексту.",
      "Используй только подтверждённые сведения, различимые в исходных материалах.",
      "Название, состав и текстовые характеристики пиши на русском языке.",
      "Не придумывай производителя, штрихкод, сроки хранения, массу, КБЖУ и другие отсутствующие факты.",
      "Не создавай новые поля, имена характеристик, категории или значения справочников.",
      "Если значение неизвестно, поставь null. Все числа — JSON number, без единиц измерения.",
      "Ответ: только один валидный JSON-объект, без Markdown и пояснений.",
      "Не добавляй id, folderID, updatedAt или другие системные поля.",
      "Доступные поля и ограничения:",
      ...descriptions,
      "Форма результата (ключи и структура строго такие):",
      JSON.stringify(schema,null,2)
    ];
    if(folderName)lines.splice(1,0,"Контекст: папка каталога «"+folderName+
      "». Это группировка, а не справочник категорий.");
    if(includeCurrent){
      const current={};
      for(const f of standard)current[f.key]=draft?.[f.key]??null;
      if(custom.length)current.customFields=custom.map(f=>{
        const old=(draft?.customFields||[]).find(x=>normalize(x.name)===normalize(f.name));
        return {name:f.name,value:old?.value??null};
      });
      lines.push("Текущие значения для сверки (не считай их доказанными, если им противоречит источник):");
      lines.push(JSON.stringify(current,null,2));
    }
    return lines.join("\n");
  }

  function validateJSON(raw,fields,chosen,draft,clone,uuid,validate){
    const errors=[],warnings=[],standard=new Map(fields.filter(f=>!f.custom).map(f=>[f.key,f]));
    const allowed=new Map(fields.filter(f=>f.custom&&chosen.has(f.id)).map(f=>[f.id,f]));
    let data;
    try{data=JSON.parse(raw);}catch(e){
      return {errors:["JSON: "+e.message],warnings,candidate:null,changed:0};
    }
    if(!isObject(data))return {errors:["Корень JSON должен быть объектом"],warnings,candidate:null,changed:0};
    const candidate=clone(draft);
    candidate.customFields=Array.isArray(candidate.customFields)?candidate.customFields:[];
    let changed=0;
    for(const [key,value] of Object.entries(data)){
      if(key==="customFields"){
        if(!allowed.size){warnings.push("customFields: поля не выбраны — пропущено");continue;}
        if(value===null)continue;
        if(!Array.isArray(value)){errors.push("customFields: ожидается массив");continue;}
        const seen=new Set();
        for(let i=0;i<value.length;i++){
          const item=value[i],path="customFields["+i+"]";
          if(!isObject(item)){errors.push(path+": ожидается объект");continue;}
          for(const extra of Object.keys(item))
            if(extra!=="name"&&extra!=="value")warnings.push(path+"."+extra+": неизвестный ключ — пропущен");
          if(typeof item.name!=="string"||!item.name.trim()){
            errors.push(path+".name: нужна строка с именем поля");continue;
          }
          const id=customID(item.name);
          if(seen.has(id)){errors.push(path+".name: повторяется «"+item.name+"»");continue;}
          seen.add(id);
          const field=allowed.get(id);
          if(!field){warnings.push(path+".name: поле «"+item.name+"» не выбрано — пропущено");continue;}
          if(!Object.hasOwn(item,"value")){errors.push(path+".value: отсутствует ключ");continue;}
          if(item.value===null)continue;
          if(typeof item.value!=="string"){
            errors.push(path+".value: ожидается строка или null");continue;
          }
          if(item.value.length>5000){
            errors.push(path+".value: максимум 5000 символов");continue;
          }
          const old=candidate.customFields.find(x=>customID(x.name)===id);
          if(old)old.value=item.value;
          else candidate.customFields.push({id:uuid(),name:field.name,value:item.value});
          changed++;
        }
        continue;
      }
      const field=standard.get(key);
      if(!field){warnings.push(key+": неизвестный ключ — пропущен");continue;}
      if(!chosen.has(field.id)){warnings.push(key+": поле не выбрано — пропущено");continue;}
      if(value===null)continue;
      if(field.type==="number"){
        if(typeof value!=="number"||!Number.isFinite(value)){
          errors.push(key+": ожидается число или null");continue;
        }
        candidate[key]=String(value);
      }else if(typeof value!=="string"){
        errors.push(key+": ожидается строка или null");continue;
      }else if(field.type==="enum"&&!field.values.some(v=>v.value===value)){
        errors.push(key+": недопустимое значение «"+value+"»");continue;
      }else candidate[key]=value;
      changed++;
    }
    if(!errors.length){
      try{validate(clone(candidate));}
      catch(e){errors.push("Карточка: "+e.message);}
    }
    // All-null values and ignored keys are a valid no-op; never dirty the form.
    return {candidate:errors.length?null:candidate,errors,warnings,changed:errors.length?0:changed};
  }

  async function copyText(value){
    if(root.navigator?.clipboard?.writeText){
      try{await root.navigator.clipboard.writeText(value);return;}catch(_){}
    }
    const area=document.createElement("textarea");
    area.value=value;area.style.position="fixed";area.style.opacity="0";
    document.body.appendChild(area);area.focus();area.select();
    const copied=document.execCommand("copy");
    area.remove();
    if(!copied)throw Error("Не удалось скопировать. Выделите текст вручную.");
  }

  function mount(config){
    const {form,dialog,getDraft,getItems,getFolderName,apply,validate,uuid,clone,note}=config;
    const $=id=>document.getElementById(id);
    let fields=[],chosen=new Set(),lastErrors=[],lastJSON="";
    const readSelection=()=>{
      try{
        const raw=localStorage.getItem(STORAGE_KEY);
        if(raw!==null){
          const ids=JSON.parse(raw);
          if(Array.isArray(ids))return new Set(ids.filter(x=>typeof x==="string"));
        }
      }catch(_){}
      return new Set(fields.filter(f=>DEFAULT_KEYS.has(f.key)||f.custom&&
        (getDraft()?.customFields||[]).some(x=>customID(x.name)===f.id)).map(f=>f.id));
    };
    const saveSelection=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...chosen]));}catch(_){}};
    const showFeedback=(messages,ok=false)=>{
      const el=$("aiFillFeedback");
      el.textContent=messages.join("\n");el.classList.toggle("ok",ok);
      $("aiCopyErrors").disabled=!lastErrors.length;
    };
    const renderFields=()=>{
      $("aiFieldList").innerHTML=fields.map(f=>
        '<label class="ai-field"><input type="checkbox" data-ai-field="'+escapeHTML(f.id)+
        '" '+(chosen.has(f.id)?"checked":"")+'><span><strong>'+escapeHTML(f.title)+
        '</strong><small>'+escapeHTML(f.custom?"Свое поле · customFields":f.key+" · "+
        (f.type==="enum"?"список":f.type==="number"?"число":"текст")+
        (f.required?" · обязательное":""))+'</small></span></label>').join("");
      $("aiFieldCount").textContent="Выбрано: "+fields.filter(f=>chosen.has(f.id)).length;
    };
    const close=()=>{dialog.hidden=true;};
    $("openAIFill").addEventListener("click",()=>{
      fields=discoverFields(form,getDraft(),getItems());
      chosen=readSelection();
      dialog.hidden=false;lastErrors=[];lastJSON="";
      $("aiJSON").value="";$("aiIncludeCurrent").checked=false;
      showFeedback([]);renderFields();
    });
    $("aiClose").addEventListener("click",close);
    dialog.addEventListener("click",e=>{if(e.target===dialog)close();});
    dialog.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();close();}});
    $("aiFieldList").addEventListener("change",e=>{
      const id=e.target.dataset.aiField;
      if(!id)return;
      if(e.target.checked)chosen.add(id);else chosen.delete(id);
      saveSelection();renderFields();
    });
    $("aiSelectAll").addEventListener("click",()=>{
      chosen=new Set(fields.map(f=>f.id));saveSelection();renderFields();
    });
    $("aiResetSelection").addEventListener("click",()=>{
      chosen.clear();saveSelection();renderFields();
    });
    $("aiCopyPrompt").addEventListener("click",async()=>{
      try{
        const prompt=buildPrompt(fields,chosen,getDraft(),getFolderName(),
          $("aiIncludeCurrent").checked);
        await copyText(prompt);showFeedback(["Промпт скопирован"]);
      }catch(e){showFeedback([e.message]);}
    });
    $("aiValidate").addEventListener("click",()=>{
      lastJSON=$("aiJSON").value.trim();
      const result=validateJSON(lastJSON,fields,chosen,getDraft(),clone,uuid,validate);
      lastErrors=result.errors;
      if(result.errors.length){
        showFeedback(result.errors.concat(result.warnings.map(s=>"Предупреждение: "+s)));return;
      }
      if(!result.changed){
        showFeedback(["Нет значений для изменения. Карточка не изменена."].concat(
          result.warnings.map(s=>"Предупреждение: "+s)),true);return;
      }
      apply(result.candidate);
      showFeedback(["Заполнено полей: "+result.changed+". Товар не сохранён."].concat(
        result.warnings.map(s=>"Предупреждение: "+s)),true);
    });
    $("aiCopyErrors").addEventListener("click",async()=>{
      if(!lastErrors.length)return;
      const message="Исправь JSON для карточки товара. Сохрани все достоверные исходные сведения. "+
        "Не добавляй неразрешённые поля. Верни только исправленный JSON без Markdown.\n"+
        "Ошибки:\n"+lastErrors.map(x=>"- "+x).join("\n")+"\nИсходный JSON:\n"+lastJSON;
      try{await copyText(message);showFeedback(["Ошибки и JSON скопированы"].concat(lastErrors));}
      catch(e){showFeedback([e.message].concat(lastErrors));}
    });
  }

  root.EZ2AIFill={discoverFields,buildPrompt,validateJSON,mount};
})(typeof window!=="undefined"?window:globalThis);
