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
    let selected=new Set(),copies={},templateOverrides={},previewID=null,formInitialized=false;
    const findDish=id=>dishes.find(d=>same(d.id,id));
    const findTemplate=id=>state.templates.find(t=>same(t.id,id));
    const list=()=>dishes.filter(d=>!search||
      String(d.name||"").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")))
      .sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru"));
    const fresh=()=>({id:uuid(),kind:"product",customFields:[],
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
      $("dishFormTitle").textContent=chosenID?"Карточка: "+(draft.name||"без названия"):"Новая позиция";
      $("dishFormHint").textContent=dirty?"Есть несохранённые изменения":"Поля независимы от шаблонов";
      $("deleteDish").disabled=!chosenID;formInitialized=true;
    }
    function renderSidebar(){
      $("dishSummary").textContent=dishes.length+" записей";
      $("dishList").innerHTML=list().length?list().map(d=>
        '<button class="dish-side-row'+(same(d.id,chosenID)?' active':'')+
        '" data-dish-open="'+esc(d.id)+'">'+esc(d.name)+
        '<small>'+esc(kindLabel(d.kind||"food")+(d.weightG?" · "+d.weightG+" г":""))+
        (d.shelfLifeHours?" · "+esc(d.shelfLifeHours)+" ч":"")+'</small></button>').join(""):
        '<p class="empty">'+(dishes.length?"Ничего не найдено":"Добавьте первую позицию")+'</p>';
    }
    function templateOptions(selectedID){
      return state.templates.slice().sort((a,b)=>a.name.localeCompare(b.name,"ru")).map(t=>
        '<option value="'+esc(t.id)+'"'+(same(selectedID,t.id)?' selected':'')+'>'+
        esc(t.name)+" · "+esc(t.widthMM)+"×"+esc(t.heightMM)+
        (compatibility(t).ok?"":" ⚠ рулон")+'</option>').join("");
    }
    function defaultTemplate(){
      return state.templates.find(t=>t.starterPack==="food-v1"&&compatibility(t).ok)||
        state.templates.find(t=>compatibility(t).ok)||state.templates[0];
    }
    function renderBatch(){
      const visible=list(),defaultID=$("dishBatchTemplate").value;
      $("dishBatchRows").innerHTML=visible.length?visible.map(d=>{
        const marked=selected.has(d.id),count=copies[d.id]||1;
        return '<tr><td><input type="checkbox" data-dish-select="'+esc(d.id)+'"'+
          (marked?' checked':'')+' aria-label="Выбрать '+esc(d.name)+'"></td>'+
          '<td><strong style="font-size:12px;margin:0">'+esc(d.name)+'</strong>'+
          '<small style="display:block;color:#7b899e">'+esc(kindLabel(d.kind||"food")+(d.weightG?" · "+d.weightG+" г":""))+'</small></td>'+
          '<td><input type="number" min="1" max="200" value="'+esc(count)+
          '" data-dish-copies="'+esc(d.id)+'"></td>'+
          '<td><select data-dish-template="'+esc(d.id)+'">'+
          templateOptions(templateOverrides[d.id]||defaultID)+'</select></td>'+
          '<td><button data-dish-preview="'+esc(d.id)+'">Просмотр</button></td></tr>';
      }).join(""):'<tr><td colspan="5" class="empty">'+
        (dishes.length?"Ничего не найдено":"Сначала сохраните позицию")+'</td></tr>';
      const number=selected.size,total=Array.from(selected).reduce((n,id)=>n+(copies[id]||1),0);
      $("selectedDishCount").textContent=number+" позиций · "+total+" этикеток";
      $("dishBatchStatus").textContent=number?
        "В очередь попадут отдельные снимки макетов. Карточки и шаблоны не изменяются.":
        "Отметьте позиции в таблице. Выбор сохраняется при поиске.";
      $("queueDishes").disabled=!number||!state.templates.length||state.running;
      $("selectAllDishes").checked=visible.length>0&&visible.every(d=>selected.has(d.id));
    }
    function render(){
      if(!formInitialized)editForm();
      renderSidebar();
      const ddl=$("dishBatchTemplate"),chosen=ddl.value||defaultTemplate()?.id||"";
      ddl.innerHTML='<option value="">Выберите шаблон</option>'+templateOptions(chosen);
      ddl.value=findTemplate(chosen)?chosen:(defaultTemplate()?.id||"");
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
        const doc=documentFor(dish,templateOverrides[id]||$("dishBatchTemplate").value);
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
          const doc=documentFor(dish,templateOverrides[dish.id]||$("dishBatchTemplate").value);
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
    $("dishBatchTemplate").addEventListener("change",()=>{renderBatch();if(previewID)previewDish(previewID);});
    $("dishBatchRows").addEventListener("change",e=>{
      const target=e.target,id=target.dataset.dishSelect;
      if(id){if(target.checked)selected.add(id);else selected.delete(id);}
      if(target.dataset.dishCopies){
        const n=Number(target.value);
        if(Number.isInteger(n)&&n>=1&&n<=200)copies[target.dataset.dishCopies]=n;
        else note("Копий от 1 до 200",true);
      }
      if(target.dataset.dishTemplate)templateOverrides[target.dataset.dishTemplate]=target.value;
      renderBatch();if(previewID)previewDish(previewID);
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
