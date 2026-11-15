/* Example food-container labels. Installed once into normal user JSON files,
 * with stable UUIDs and no overwriting an existing document. Illustration
 * only: user must supply real composition, nutrition, shelf life and producer.
 */
(function(root){
  "use strict";
  const media={widthMM:58,heightMM:38,gapMM:2};
  const seed="A2B00D00-7F11-4001-8000-";
  const id=n=>seed+String(n).padStart(12,"0");
  const now="2026-11-16T00:00:00.000Z";
  const row=(identifier,fieldName,prefix,value,fontCode="A00",fixed=false)=>{
    const fontHeight=fontCode==="A11"?3.5:fontCode==="A12"?7:fontCode==="A02"?2.5:1.5;
    return {id:id(identifier),kind:"text",xMM:0,yMM:0,widthMM:55,heightMM:fontHeight,
      rotation:0,isBold:false,renderMode:"device",deviceFont:fontCode,
      textAlignment:"left",isVariable:!fixed,fieldName:fieldName||"",
      prefix:prefix||"",value:value||"",showsHumanReadable:false,fontSize:fontCode==="A11"?11:7};
  };
  const barcode=(identifier,fieldName,value,type="CODE128")=>({
    id:id(identifier),kind:"barcode",xMM:0,yMM:0,widthMM:55,heightMM:12,
    barcodeType:type,value,showsHumanReadable:true,rotation:0,
    isVariable:true,fieldName
  });
  const specimens=[
    {num:1,folder:"Еда · Состав",name:"Контейнер — состав и аллергены",rows:[
      row(101,"Название блюда","","[НАЗВАНИЕ]","A11"),
      row(102,"Состав","Состав: ","[ИНГРЕДИЕНТЫ]"),
      row(103,"Аллергены","Аллергены: ","[АЛЛЕРГЕНЫ]"),
      row(104,"Масса нетто","Масса: ","[МАССА] г"),
      row(105,"Изготовлено","Изг.: ","[ДД.ММ.ГГ ЧЧ:ММ]"),
      row(106,"Годен до","Годен до: ","[ДД.ММ.ГГ ЧЧ:ММ]"),
      row(107,"Хранение","Хранить: ","[ТЕМПЕРАТУРА]"),
      row(108,"Партия","Партия: ","[НОМЕР]"),
      row(109,"Производитель","Произв.: ","[ОРГАНИЗАЦИЯ]"),
      row(110,"Адрес","Адрес: ","[АДРЕС]")
    ]},
    {num:2,folder:"Еда · КБЖУ",name:"Контейнер — пищевая ценность",rows:[
      row(201,"Название блюда","","[НАЗВАНИЕ]","A11"),
      row(202,null,"КБЖУ на 100 г:","", "A00",true),
      row(203,"Калорийность","Ккал: ","[ККАЛ]"),
      row(204,"Белки","Белки: ","[БЕЛКИ] г"),
      row(205,"Жиры","Жиры: ","[ЖИРЫ] г"),
      row(206,"Углеводы","Углеводы: ","[УГЛЕВОДЫ] г"),
      row(207,"Масса нетто","Масса нетто: ","[МАССА] г"),
      row(208,"Состав","Состав: ","[ИНГРЕДИЕНТЫ]"),
      row(209,"Аллергены","Аллергены: ","[АЛЛЕРГЕНЫ]"),
      row(210,"Изготовлено","Изг.: ","[ДАТА]"),
      row(211,"Годен до","Годен: ","[ДАТА]"),
      row(212,"Производитель","Произв.: ","[НАЗВАНИЕ]")
    ]},
    {num:3,folder:"Еда · Фасовка",name:"Быстрая маркировка и сроки",rows:[
      row(301,"Название блюда","","[НАЗВАНИЕ]","A11"),
      row(302,"Масса нетто","Масса: ","[МАССА] г","A02"),
      row(303,"Дата изготовления","Изг.: ","[ДД.ММ.ГГ ЧЧ:ММ]"),
      row(304,"Срок годности","Годен до: ","[ДД.ММ.ГГ ЧЧ:ММ]"),
      row(305,"Условия хранения","Хранить: ","[УСЛОВИЯ]"),
      row(306,"Номер партии","Партия: ","[НОМЕР]"),
      row(307,"Состав","Состав: ","[ИНГРЕДИЕНТЫ]"),
      row(308,"Аллергены","Аллергены: ","[АЛЛЕРГЕНЫ]"),
      row(309,"Производитель","Произв.: ","[НАЗВАНИЕ]")
    ]},
    {num:4,folder:"Еда · Партия и ШК",name:"Контейнер — учётный штрихкод",rows:[
      row(401,"Название блюда","","[НАЗВАНИЕ]","A11"),
      row(402,"Масса нетто","Масса: ","[МАССА] г"),
      row(403,"Изготовлено","Изг.: ","[ДАТА]"),
      row(404,"Годен до","Годен: ","[ДАТА]"),
      row(405,"Партия","Партия: ","[НОМЕР]"),
      row(406,"Производитель","Произв.: ","[НАЗВАНИЕ]"),
      barcode(407,"Штрихкод / код партии","1234567890","CODE128")
    ]}
  ];
  function build(){
    const folders=[],templates=[];
    for(const spec of specimens){
      const folderID=id(1000+spec.num),documentID=id(2000+spec.num);
      let y=0;
      const elements=spec.rows.map(input=>{
        const item=JSON.parse(JSON.stringify(input));
        item.yMM=Math.round(y*8)/8;
        y+=item.heightMM+0.25;
        return item;
      });
      templates.push({
        id:documentID,folderID,name:spec.name,
        schemaVersion:1,printMode:"text",starterPack:"food-v1",
        ...media,elements,updatedAt:now
      });
      folders.push({
        id:folderID,name:spec.folder,baseTemplateID:documentID,createdAt:now
      });
    }
    return {folders,templates};
  }
  root.EZ2FoodPresets={version:"food-v1",build};
})(window);
