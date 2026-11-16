/* Saved dish -> independent printable template snapshot. No printer I/O. */
(function(root){
  "use strict";
  const aliases={
    name:["название","название блюда","наименование","продукт","блюдо","наименование продукта"],
    weightG:["масса","масса нетто","вес","вес нетто","масса г","вес г"],
    kcal:["калорийность","ккал","калории","энергетическая ценность"],
    protein:["белки","белок"],
    fat:["жиры","жир"],
    carbs:["углеводы"],
    ingredients:["состав","ингредиенты"],
    allergens:["аллергены"],
    manufacturer:["производитель","изготовитель"],
    address:["адрес","адрес производителя"],
    storage:["хранение","условия хранения","температура хранения","хранить"],
    producedAt:["изготовлено","дата изготовления","дата производства","упаковано","дата фасовки"],
    expiresAt:["годен до","срок годности","дата окончания срока годности","дата годности","употребить до"],
    shelfLifeHours:["срок хранения","срок годности часы","срок годности часов"],
    batchCode:["партия","номер партии","код партии"],
    barcode:["штрихкод","штрихкод код партии","код товара"]
  };
  const canonical=new Map();
  const normalize=s=>String(s||"").toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
  Object.entries(aliases).forEach(([key,names])=>names.forEach(name=>canonical.set(normalize(name),key)));
  function fieldKey(name){return canonical.get(normalize(name))||null;}
  function formatDate(raw) {
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
  function fill(template,dish,batch={}){
    if(!template||!Array.isArray(template.elements)||!dish)throw Error("Нет шаблона или блюда");
    const doc=JSON.parse(JSON.stringify(template));
    const producedAt=formatDate(batch.producedAt);
    const expiresAt=formatDate(batch.expiresAt||expiry(batch.producedAt,dish.shelfLifeHours));
    const values={...dish,producedAt,expiresAt,
      batchCode:String(batch.batchCode||""),barcode:String(dish.barcode||batch.batchCode||"")};
    for(const e of doc.elements){
      if(!["text","barcode"].includes(e.kind)||e.isVariable===false)continue;
      const key=fieldKey(e.fieldName);
      if(!key){
        if(/\[[^\]]+\]/.test(String(e.value||"")))
          throw Error("В шаблоне «"+template.name+"» неизвестное поле «"+(e.fieldName||"без имени")+"»");
        continue;
      }
      let value=String(values[key]??"").trim();
      if(key==="weightG"||key==="protein"||key==="fat"||key==="carbs"){
        if(value)value+= " г";
      }
      if(key==="shelfLifeHours"&&value)value+=" ч";
      if(!value)throw Error("Блюдо «"+dish.name+"»: заполните «"+e.fieldName+"»");
      e.value=value;
    }
    doc.name=dish.name+" · "+template.name;
    return doc;
  }
  root.EZ2Dishes={fieldKey,formatDate,expiry,fill};
})(typeof window!=="undefined"?window:globalThis);
