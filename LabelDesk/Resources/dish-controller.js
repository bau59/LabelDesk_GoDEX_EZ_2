/* Universal item catalog and batch UI. Original templates and transport are untouched. */
(function(root){
  "use strict";
  function create(api){
    const {state,native,uuid,clone,note,compatibility,media,encodeJob,renderQueue}=api;
    const $=id=>document.getElementById(id);
    const esc=value=>String(value??"").replace(/[&<>"']/g,c=>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
    const fieldIDs={name:"dishName",kind:"itemKind",weightG:"dishWeight",kcal:"dishKcal",
      protein:"dishProtein",fat:"dishFat",carbs:"dishCarbs",
      ingredients:"dishIngredients",allergens:"dishAllergens",
      shelfLifeHours:"dishShelfLife",storage:"dishStorage",
      manufacturer:"dishManufacturer",address:"dishAddress",barcode:"dishBarcode"};
    let dishes=[],chosenID=null,draft=null,dirty=false,search="";
    let folders=[],catalogFolderID="all",printFolderID="all",printSearch="";
    const rowEdits={}; let detailFor=null;
    let selected=new Set(),copies={},templateOverrides={},previewID=null,formInitialized=false;
    let defaultTemplateID=null,pickerFor=null;
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
        $(id).value=key==="kind"?(draft.kind||"food"):String(draft[key]??"");
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
        '<button class="dish-side-row'+(same(d.id,chosenID)?' active':'')+
        '" data-dish-open="'+esc(d.id)+'">'+esc(d.name)+
        '<small>'+esc(kindLabel(d.kind||"food")+(d.weightG?" · "+d.weightG+" г":""))+
        (d.shelfLifeHours?" · "+esc(d.shelfLifeHours)+" ч":"")+'</small></button>').join(""):
        '<p class="empty">'+(dishes.length?"В этой папке ничего нет":"Добавьте первую позицию")+'</p>';
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
    function templateCards(selectedID,dishID){
      return templateList().map(t=>{
        const ok=compatibility(t).ok;
        const chosen=same(selectedID,t.id);
        const action=dishID?' data-pick-template="'+esc(t.id)+'" data-dish-id="'+esc(dishID)+'"':
          ' data-pick-default="'+esc(t.id)+'"';
        return '<button type="button" class="template-chip'+(chosen?' selected':'')+
          (ok?'':' incompatible')+'"'+action+' title="'+esc(t.name)+'">'+
          '<span>'+esc(t.name)+'</span><small>'+esc(t.widthMM)+' × '+esc(t.heightMM)+
          ' мм'+(ok?'':' · рулон не подходит')+'</small></button>';
      }).join("");
    }
    function renderBatch(){
      const visible=list();
      if(!findTemplate(defaultTemplateID))defaultTemplateID=defaultTemplate()?.id||null;
      const defaultID=defaultTemplateID;
      $("dishBatchTemplate").innerHTML=templateCards(defaultID,null)||
        '<p class="muted">Создайте шаблон в редакторе</p>';
      $("dishBatchRows").innerHTML=visible.length?visible.map(d=>{
        const marked=selected.has(d.id),count=copies[d.id]||1;
        const id=templateOverrides[d.id]||defaultID;
        const label=findTemplate(id);
        const row='<tr><td><input type="checkbox" data-dish-select="'+esc(d.id)+'"'+
          (marked?' checked':'')+' aria-label="Выбрать '+esc(d.name)+'"></td>'+
          '<td><strong style="font-size:12px;margin:0">'+esc(d.name)+'</strong>'+
          '<small style="display:block;color:#7b899e">'+esc(kindLabel(d.kind||"food")+
            (d.weightG?" · "+d.weightG+" г":""))+'</small></td>'+
          '<td><div class="copies-stepper">'+
          '<button type="button" data-copy-step="-1" data-dish-id="'+esc(d.id)+
          '" aria-label="Минус одна копия">−</button>'+
          '<input type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]*"'+
          ' value="'+esc(count)+'" data-dish-copies="'+esc(d.id)+'" aria-label="Копий">'+
          '<button type="button" data-copy-step="1" data-dish-id="'+esc(d.id)+
          '" aria-label="Плюс одна копия">+</button></div></td>'+
          '<td><button type="button" class="selected-template" data-open-template="'+esc(d.id)+
          '"><span>'+esc(label?.name||"Выбрать шаблон")+'</span><b>Изменить</b></button></td>'+
          '<td><button data-dish-preview="'+esc(d.id)+'">Просмотр</button></td></tr>';
        if(pickerFor!==d.id)return row;
        return row+'<tr class="template-pick-row"><td colspan="5"><div class="template-pick-header">'+
          '<strong>Шаблон для «'+esc(d.name)+'»</strong>'+
          '<button type="button" data-close-picker="'+esc(d.id)+'">Закрыть ×</button></div>'+
          '<div class="template-chip-list">'+templateCards(id,d.id)+'</div></td></tr>';
      }).join(""):'<tr><td colspan="5" class="empty">'+
        (dishes.length?"Ничего не найдено":"Сначала сохраните позицию")+'</td></tr>';
      const count=selected.size,total=Array.from(selected).reduce((n,id)=>n+(copies[id]||1),0);
      $("selectedDishCount").textContent=count+" позиций · "+total+" этикеток";
      $("dishBatchStatus").textContent=count?
        "В очередь попадут отдельные снимки этикеток. Данные и шаблоны не изменяются.":
        "Отметьте позиции в таблице. Выбор сохраняется при поиске.";
      $("queueDishes").disabled=!count||!state.templates.length||state.running;
      $("selectAllDishes").checked=visible.length>0&&visible.every(d=>selected.has(d.id));
    }
    function render(){
      if(!formInitialized)editForm();
      renderSidebar();
      renderBatch();
    }
    function newDish(){
      if(dirty&&!window.confirm("Карточка не сохранена. Отменить изменения?"))return;
      chosenID=null;draft=fresh();dirty=false;editForm();renderSidebar();
      $("dishName").focus?.();
    }
    function openDish(id){
      const dish=findDish(id);if(!dish)return;
      if(dirty&&!window.confirm("Карточка не сохранена. Отменить изменения?"))return;
      chosenID=dish.id;draft=clone(dish);dirty=false;editForm();renderSidebar();
    }
    function validateDish(dish){
      dish.name=String(dish.name||"").trim();
      if(!dish.name)throw Error("Укажите название позиции");
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
        chosenID=item.id;draft=clone(item);dirty=false;selected.add(item.id);
        editForm();renderSidebar();renderBatch();note("Позиция сохранена: "+item.name);
      }catch(e){note("Не удалось сохранить блюдо: "+e.message,true);}
    }
    async function deleteDish(){
      const dish=findDish(chosenID);if(!dish)return;
      if(!window.confirm("Удалить позицию «"+dish.name+"»? Задания в очереди останутся."))return;
      try{
        await persistDishes(dishes.filter(d=>!same(d.id,dish.id)));
        selected.delete(dish.id);delete copies[dish.id];delete templateOverrides[dish.id];
        chosenID=null;draft=fresh();dirty=false;editForm();render();
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
      const doc=root.EZ2Dishes.fill(template,dish,batchData());
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
      }catch(e){$("dishBatchStatus").textContent=e.message;note(e.message,true);}
    }
    function localDateTime(date=new Date()){
      const pad=n=>String(n).padStart(2,"0");
      return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+
        "T"+pad(date.getHours())+":"+pad(date.getMinutes());
    }
    function bootstrap(raw){
      dishes=Array.isArray(raw)?raw.filter(d=>d&&d.id&&d.name)
        .map(d=>({...d,kind:d.kind||"food",
          customFields:Array.isArray(d.customFields)?d.customFields:[]})):[];
      chosenID=dishes[0]?.id||null;draft=chosenID?clone(dishes[0]):fresh();
      dirty=false;formInitialized=false;
      $("batchProducedAt").value=localDateTime();
      render();
    }
    // Named buttons and delegated table events are independent from the legacy template UI.
    for(const id of ["newDish","newDishMain"])$(id).addEventListener("click",newDish);
    $("saveDish").addEventListener("click",saveDish);
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
    $("deleteDish").addEventListener("click",deleteDish);
    $("dishSearch").addEventListener("input",e=>{search=e.target.value||"";renderSidebar();renderBatch();});
    $("dishFields").addEventListener("input",e=>{
      const key=e.target.dataset.dish;
      if(key&&Object.hasOwn(fieldIDs,key)){
        draft[key]=e.target.value;dirty=true;
        $("dishFormHint").textContent="Есть несохранённые изменения";
      }
    });
    $("dishBatchTemplate").addEventListener("click",e=>{
      const button=e.target.closest("[data-pick-default]");
      if(!button)return;
      defaultTemplateID=button.dataset.pickDefault;
      pickerFor=null;renderBatch();
      if(previewID)previewDish(previewID);
    });
    $("dishBatchRows").addEventListener("change",e=>{
      const target=e.target,id=target.dataset.dishSelect;
      if(id){if(target.checked)selected.add(id);else selected.delete(id);}
      if(target.dataset.dishCopies){
        const raw=String(target.value||"").trim();
        const n=Number(raw);
        if(/^\d+$/.test(raw)&&Number.isInteger(n)&&n>=1&&n<=200)
          copies[target.dataset.dishCopies]=n;
        else note("Копий должно быть от 1 до 200",true);
      }
      renderBatch();
    });
    $("dishBatchRows").addEventListener("click",e=>{
      const target=e.target;
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
    $("selectAllDishes").addEventListener("change",e=>{
      list().forEach(d=>{if(e.target.checked)selected.add(d.id);else selected.delete(d.id);});
      renderBatch();
    });
    $("clearDishSelection").addEventListener("click",()=>{selected.clear();renderBatch();});
    $("queueDishes").addEventListener("click",queueSelected);
    for(const id of ["batchProducedAt","batchExpiresAt","batchCode"])
      $(id).addEventListener("change",()=>{if(previewID)previewDish(previewID);});
    document.body.addEventListener("click",e=>{
      const open=e.target.closest("[data-dish-open]");
      if(open){openDish(open.dataset.dishOpen);return;}
      const preview=e.target.closest("[data-dish-preview]");
      if(preview){previewDish(preview.dataset.dishPreview);}
    });
    return {bootstrap,render};
  }
  root.EZ2DishController={create};
})(typeof window!=="undefined"?window:globalThis);
