/* GoDEX EZ-2 diagnostics. Test labels use the same encoder as production.
 * One selected sample is enqueued at a time, never streamed directly to RS-232.
 * The test suite does not contain undocumented printer commands or media motion.
 */
(function(root){
  "use strict";
  const ID="EZ2"; const W=58,H=38,G=2;
  const text=(value,font="A00",extra={})=>({
    id:"T-"+Math.random().toString(36).slice(2),kind:"text",value,
    deviceFont:font,widthMM:55,heightMM:4,xMM:0,yMM:0,
    isVariable:false,textAlignment:"left",...extra
  });
  const raster=(kind,x,y,w,h,extra={})=>({
    id:"R-"+Math.random().toString(36).slice(2),kind,
    xMM:x,yMM:y,widthMM:w,heightMM:h,isVariable:false,...extra
  });
  const label=(id,title,mode,elements,group,description)=>({
    id,title,mode,group,description,
    document:{schemaVersion:1,id:"DIAG-"+id,name:"ТЕСТ "+id+" · "+title,
      widthMM:W,heightMM:H,gapMM:G,printMode:mode,
      elements,updatedAt:new Date(0).toISOString()}
  });
  function docs(){
    const pages=[];
    function append(id,title,mode,elements,group,description){
      pages.push(label(id,title,mode,elements,group,description));
    }
    // The printer's supported resident glyph mapping: ASCII, Cyrillic,
    // and the documented codepage box drawing variants. Control bytes 0..31
    // and 127 are deliberately never fed to a normal text line.
    const ascii=Array.from({length:95},(_,i)=>String.fromCharCode(i+32));
    const russian=Array.from({length:64},(_,i)=>
      String.fromCharCode(i<32?0x410+i:0x430+i-32)).concat(["Ё","ё","№"]);
    const frames=Array.from("│─┌┐└┘├┤┬┴┼█░▒▓║═╔╗╚╝╬");
    for(const [id,title,source,limit] of [
      ["C01","ASCII: 20-7E",ascii,22],
      ["C02","Кириллица CP866",russian,16],
      ["C03","Рамки и заливки",frames,11]
    ]){
      const lines=[text(id+" "+title)];
      for(let i=0;i<source.length;i+=limit){
        const chars=source.slice(i,i+limit);
        const first=root.EZ2Text.cp866(chars.join(""))[0];
        const last=root.EZ2Text.cp866(chars.join("")).at(-1);
        const range=first.toString(16).toUpperCase().padStart(2,"0")+"-"+
          last.toString(16).toUpperCase().padStart(2,"0");
        lines.push(text(range+" "+chars.join("")));
      }
      append(id,title,"text",lines,"Символы",
        "Строки с кодами первого/последнего байта. Сверяйте форму букв и символов.");
    }
    const codes=["A00","A01","A02","A03","A04"];
    for(let h=1;h<=4;h++)for(let v=1;v<=8;v++)codes.push("A"+h+v);
    // Greedy pagination based on the exact resident-font dot heights. Each
    // sample is annotated in A00, so even a huge A48 gets an readable ID.
    let elements=[],total=0,page=0;
    const flush=()=>{
      if(!elements.length)return;
      page++;
      const id="F"+String(page).padStart(2,"0");
      append(id,"Встроенные шрифты · "+page,"text",
        [text(id+" ШРИФТЫ - DOT/CODE"),...elements],
        "Шрифты","Перед каждой строкой указан код и размер знака в точках.");
      elements=[];total=10;
    };
    for(const code of codes){
      const f=root.EZ2Text.font(code);
      const capacity=Math.floor(440/f.widthDots);
      const sample=capacity>=5?"Ab12Ж":capacity>=3?"AbЖ":"Ж";
      const block=[text(code+" "+f.widthDots+"x"+f.heightDots+" dots"),
        text(sample,code)];
      const needed=10+f.heightDots;
      if(elements.length&&total+needed>236)flush();
      elements.push(...block);total+=needed;
    }
    flush();

    append("N01","Реверс ESC V","text",[
      text("N01 REVERSE: ESC V"),
      text("НОРМАЛЬНО A00","A00"),
      text("ИНВЕРСИЯ АБВ 123","A00",{reversePrint:true}),
      text("normal ABC 123","A01"),
      text("REVERSE 123","A01",{reversePrint:true})
    ],"Режимы","Проверьте чёрную плашку и последующую обычную строку.");

    for(const [id,title,format,value] of [
      ["B01","Code 128","CODE128","ABC123"],
      ["B02","Code 39","CODE39","ABC123"],
      ["B03","EAN-13","EAN13","460123456789"],
      ["B04","EAN-8","EAN8","1234567"]
    ]){
      append(id,title+" · штатный","text",[
        text(id+" "+title+" "+value),
        {id:"BAR-"+id,kind:"barcode",xMM:0,yMM:0,widthMM:55,heightMM:15,
          barcodeType:format,value,showsHumanReadable:true,isVariable:false}
      ],"Штрихкоды","Встроенная команда штрихкода. Проверьте цифровую строку и сканирование.");
    }

    const grid=[
      raster("text",1,0.5,53,3.2,{value:"R01 GRID: 8 dots = 1 mm",fontSize:7}),
      ...Array.from({length:6},(_,i)=>raster("line",2+i*10,5,0.125,27)),
      ...[5,15,25,32].map(y=>raster("line",2,y,50,0.125))
    ];
    append("R01","Миллиметровая сетка","raster",grid,"Геометрия",
      "Измерьте отступ слева до первой линии (2 мм) и шаг вертикальных линий (10 мм)."+
      " Высоты горизонтальных линий: 5, 15, 25, 32 мм.");

    append("R02","Рамки и толщина","raster",[
      raster("text",1,0.5,52,3.5,{value:"R02 RECT / FRAME",fontSize:7}),
      raster("framedText",2,6,25,17,{value:"РАМКА\nТЕКСТ",fontSize:9,
        framePaddingMM:1.5,frameBorderMM:0.25,textAlignment:"center",isBold:true}),
      raster("rectangle",30,6,22,17),
      raster("text",2,26,50,4,{value:"frame 25x17; rect 22x17",fontSize:7}),
      raster("line",3,32,15,0.125),
      raster("line",21,32,15,0.25),
      raster("line",39,32,12,0.5)
    ],"Геометрия","Измерьте внешние рамки 25×17 и 22×17 мм, нижние толщины 1/2/4 точки.");

    append("R03","Растровые кегли","raster",[
      raster("text",1,0.2,53,3.0,{value:"R03: RASTER FONT SIZE",fontSize:6}),
      ...[[6,4,3.5],[8,8,4.2],[10,13,5],[12,19,6],[16,26,8]].map(
        ([size,y,h])=>raster("text",2,y,50,h,
          {value:size+"pt · AbЖ 123",fontSize:size}))
    ],"Шрифты","Шрифты рендерятся WebKit; измерьте высоту строк 6/8/10/12/16 pt.");

    append("R04","Unicode / спецзнаки","raster",[
      raster("text",1,0.5,53,3.5,{value:"R04 UNICODE",fontSize:7}),
      raster("text",2,6,50,11,{value:"№ ° ± © ® €\nЁ ё Ω µ ÷ ×",fontSize:10}),
      raster("text",2,22,50,6,{value:"→ ← ↑ ↓ ◆ ★ ✓",fontSize:10})
    ],"Символы","Символы растра, которые не обязаны поддерживаться встроенным CP866.");

    for(const [id,title,format,value] of [
      ["R05","Растр Code 128","CODE128","ABC123"],
      ["R06","Растр Code 39","CODE39","ABC123"],
      ["R07","Растр EAN-13","EAN13","460123456789"],
      ["R08","Растр EAN-8","EAN8","1234567"]
    ]){
      append(id,title,"raster",[
        raster("text",1,0.5,52,3.5,{value:id+" "+title,fontSize:7}),
        raster("barcode",3,6,48,21,{value,barcodeType:format,showsHumanReadable:true}),
        raster("text",2,30,51,3.5,{value:format+" "+value,fontSize:7})
      ],"Штрихкоды","Растровый штрихкод, 48×21 мм; проверяйте высоту полос и читаемость.");
    }
    return pages;
  }
  let pages=null;
  function list(){
    if(!pages)pages=docs();
    return pages.map(({id,title,mode,group,description})=>({id,title,mode,group,description}));
  }
  function documentFor(id){
    if(!pages)pages=docs();
    const sample=pages.find(p=>p.id===id);
    if(!sample)throw Error("Неизвестный тест EZ-2: "+id);
    return JSON.parse(JSON.stringify(sample.document));
  }
  root.EZ2Diagnostics={list,documentFor};
})(window);
