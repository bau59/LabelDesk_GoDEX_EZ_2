/* Universal saved item -> printable template snapshot. Never changes source data. */
(function(root){
  "use strict";
  const aliases={
    name:["название","название блюда","название товара","наименование","наименование товара","наименование продукта","товар","продукт","блюдо"],
    weightG:["масса","масса нетто","масса г","вес","вес нетто","вес г"],
    kcal:["ккал","калории","калорийность","энергетическая ценность"],
    protein:["белки","белок"],fat:["жиры","жир"],carbs:["углеводы"],
    ingredients:["состав","ингредиенты"],allergens:["аллергены"],
    manufacturer:["производитель","изготовитель","организация"],
    address:["адрес","адрес производителя","адрес изготовителя"],
    storage:["хранение","условия хранения","температура хранения","хранить"],
    producedAt:["изготовлено","дата изготовления","дата производства","упаковано","дата фасовки"],
    expiresAt:["годен до","срок годности","дата годности","дата окончания срока годности","употребить до"],
    shelfLifeHours:["срок хранения","срок годности часы","срок годности часов"],
    batchCode:["партия","номер партии","код партии"],barcode:["штрихкод","штрихкод код партии","код товара"]
  };
  const normalize=s=>String(s??"").toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
  const canonical=new Map();
  for(const [key,names] of Object.entries(aliases))
    for(const name of names)canonical.set(normalize(name),key);
  function fieldKey(name){return canonical.get(normalize(name))||null;}
  function formatDate(raw){
    const value=String(raw||"").trim();
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))return "";
    const dt=new Date(value);
    if(!Number.isFinite(dt.getTime()))return "";
    const pad=n=>String(n).padStart(2,"0");
    if(dt.getFullYear()!==Number(value.slice(0,4))||dt.getMonth()+1!==Number(value.slice(5,7))||
       dt.getDate()!==Number(value.slice(8,10))||dt.getHours()!==Number(value.slice(11,13))||
       dt.getMinutes()!==Number(value.slice(14,16)))return "";
    return pad(dt.getDate())+"."+pad(dt.getMonth()+1)+"."+dt.getFullYear()+
      " "+pad(dt.getHours())+":"+pad(dt.getMinutes());
  }
  function expiry(producedAt,hours){
    const num=Number(String(hours??"").replace(",","."));
    if(!String(hours??"").trim()||!Number.isFinite(num)||num<=0||num>87600)return "";
    if(!formatDate(producedAt))return "";
    const dt=new Date(producedAt);
    dt.setTime(dt.getTime()+num*3600000);
    const pad=n=>String(n).padStart(2,"0");
    return [dt.getFullYear(),pad(dt.getMonth()+1),pad(dt.getDate())].join("-")+"T"+
      pad(dt.getHours())+":"+pad(dt.getMinutes());
  }
  function valueFor(item,fieldName,batch={}){
    const match=normalize(fieldName);
    if(!match)return null;
    // Explicit custom values take precedence over built-in aliases.
    const custom=Array.isArray(item.customFields)?item.customFields:[];
    const entry=custom.find(field=>normalize(field?.name)===match);
    if(entry)return String(entry.value??"");
    const key=fieldKey(fieldName);
    if(!key)return null;
    const producedAt=formatDate(batch.producedAt||item.producedAt);
    const expiresAt=formatDate(batch.expiresAt||
      expiry(batch.producedAt||item.producedAt,item.shelfLifeHours)||item.expiresAt);
    const values={...item,producedAt,expiresAt,
      batchCode:String(batch.batchCode||item.batchCode||""),
      barcode:String(item.barcode||batch.batchCode||"")};
    let value=String(values[key]??"").trim();
    if(value&&["weightG","protein","fat","carbs"].includes(key))value+=" г";
    if(value&&key==="shelfLifeHours")value+=" ч";
    return value;
  }
  function fill(template,item,batch={}){
    if(!template||!Array.isArray(template.elements)||!item)
      throw Error("Не найден шаблон или позиция каталога");
    const doc=JSON.parse(JSON.stringify(template));
    const elements=[];
    let printableCount=0;
    for(const element of doc.elements){
      if(!["text","barcode","textFrame","framedText"].includes(element.kind)||element.isVariable===false){
        elements.push(element);printableCount++;continue;
      }
      // An unnamed literal variable stays as authored for backward compatibility.
      const fieldName=String(element.fieldName||"").trim();
      if(!fieldName){
        if(!/\[[^\]]+\]/.test(String(element.value||""))){
          elements.push(element);printableCount++;
        }
        continue;
      }
      const value=valueFor(item,fieldName,batch);
      // An absent variable never prints its prefix or placeholder. When a
      // text field has a fixed height, preserve its EMPTY row slots so later
      // fields keep the same position for every item in the print batch.
      if(value===null||!String(value).trim()){
        if(element.kind==="text"&&Number.isInteger(element.fixedRows)&&
           element.fixedRows>=1&&element.fixedRows<=20){
          element.prefix="";
          element.value="";
          element.isVariable=false;
          elements.push(element);
        }
        continue;
      }
      element.value=value;
      elements.push(element);printableCount++;
    }
    doc.elements=elements;
    if(!printableCount)throw Error("Для позиции «"+item.name+"» нет заполненных полей в этом шаблоне");
    doc.name=String(item.name||"Позиция")+" · "+String(template.name||"Шаблон");
    return doc;
  }
  root.EZ2Dishes={fieldKey,normalize,formatDate,expiry,valueFor,fill};
})(typeof window!=="undefined"?window:globalThis);
