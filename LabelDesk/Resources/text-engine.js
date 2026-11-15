/* GoDEX EZ-2 (2002) buffered line-mode printer: CP866 resident fonts,
 * native barcode and deterministic line layout. No invented XY commands.
 * This module never touches the physical serial port.
 */
(function(root) {
  "use strict";
  const ESC=27, CR=13, LF=10;
  const PRINTABLE_DOTS=440; // verified 55-mm width at 203dpi
  const MAX_LAYOUT_DOTS=256; // reserve headroom inside observed 38-mm pitch
  const BOX=Object.freeze({
    "│":179,"─":196,"┌":218,"┐":191,"└":192,"┘":217,
    "├":195,"┤":180,"┬":194,"┴":193,"┼":197,"█":219,
    "░":176,"▒":177,"▓":178,"║":186,"═":205,"╔":201,
    "╗":187,"╚":200,"╝":188,"╬":206
  });
  function charByte(ch){
    const n=ch.codePointAt(0);
    if(n>=32 && n<=126)return n;
    if(n>=0x410 && n<=0x42f)return n-0x410+0x80; // А..Я
    if(n>=0x430 && n<=0x43f)return n-0x430+0xa0; // а..п
    if(n>=0x440 && n<=0x44f)return n-0x440+0xe0; // р..я
    if(n===0x401)return 0xf0; // Ё
    if(n===0x451)return 0xf1; // ё
    if(n===0x2116)return 0xfc; // №
    if(Object.hasOwn(BOX,ch))return BOX[ch];
    throw Error("Не поддерживается встроенным шрифтом CP866: «"+ch+"». Выберите растровую печать.");
  }
  function cp866(text){
    return Array.from(String(text??"")).map(charByte);
  }
  function font(fontCode){
    const code=String(fontCode||"A00");
    if(/^A0[0-4]$/.test(code)){
      const n=Number(code.slice(-1));
      return {code,widthDots:8,heightDots:n===0?10:n*10};
    }
    if(/^A[1-4][1-8]$/.test(code))
      return {code,widthDots:Number(code[1])*16,heightDots:Number(code[2])*26};
    throw Error("Неизвестный встроенный размер EZ-2: "+code);
  }
  function byteASCII(s){
    return Array.from(String(s)).map(ch=>{
      const b=ch.charCodeAt(0);
      if(b<32||b>126)throw Error("Недопустимый ASCII в команде EZ-2");
      return b;
    });
  }
  function wrapText(s,capacity){
    if(!Number.isInteger(capacity)||capacity<1)throw Error("Слишком крупный шрифт для ширины этикетки");
    const lines=[];
    for(const raw of String(s??"").split(/\r?\n/)){
      if(raw===""){lines.push("");continue;}
      let remainder=raw.trimEnd();
      while(Array.from(remainder).length>capacity){
        const chars=Array.from(remainder);
        const limit=chars.slice(0,capacity).join("");
        const k=limit.lastIndexOf(" ");
        const length=k>=Math.floor(capacity/3) ? k:capacity;
        lines.push(chars.slice(0,length).join("").trimEnd());
        remainder=chars.slice(length).join("").trimStart();
      }
      lines.push(remainder);
    }
    return lines;
  }
  function marginMM(e,lineWidth,fontWidth,labelWidth=55){
    const x=Math.max(0,Number(e.xMM||0));
    const width=Math.min(55,Number(e.widthMM||labelWidth));
    let m=x+1;
    const freeDots=Math.max(0,width*8-lineWidth*fontWidth);
    if(e.textAlignment==="center")m+=freeDots/16;
    if(e.textAlignment==="right")m+=freeDots/8;
    return Math.floor(m);
  }
  function barcodeConfig(e){
    if(!root.EZ2Barcodes)throw Error("Модуль штрихкодов отсутствует");
    const type=String(e.barcodeType||"CODE39").replace(/[^A-Za-z0-9]/g,"").toUpperCase();
    const bars=root.EZ2Barcodes.generate(type,e.value);
    if(type!=="CODE39"&&type!=="CODE128"&&type!=="EAN13"&&type!=="EAN8")
      throw Error("Встроенный штрихкод EZ-2 не подтверждён: "+type);
    if(/[{}|]/.test(bars.display))throw Error("Данные штрихкода содержат управляющие скобки EZ-2");
    if(type==="CODE128"&&/[^\x20-\x7e]/.test(bars.display))
      throw Error("Code128 в штатном режиме требует ASCII");
    const printWidth=Math.min(55,Number(e.widthMM||55));
    // At least a 2-dot module as in successful terminal tests 7–9.
    root.EZ2Barcodes.layout(type,bars.display,printWidth*8);
    return {bars,selector:type==="CODE39"?"3":type==="CODE128"?"1":"E"};
  }
  function plan(doc, options={}){
    if(!doc || doc.printMode!=="text")throw Error("Этот макет не является строковым");
    if(Math.abs(Number(doc.heightMM)-38)>0.001||Math.abs(Number(doc.gapMM)-2)>0.001)
      throw Error("Штатный драйвер подтверждён для высоты 38 мм, зазора 2 мм");
    if(!Array.isArray(doc.elements)||doc.elements.length===0)
      throw Error("Шаблон без строк: нечего печатать");
    if(doc.elements.length>32)throw Error("Для штатного режима максимум 32 блока");
    const rows=[];
    let barcode=null,usedDots=0;
    // Array order is the literal printer row order; X via Mnn, Y is
    // sequential CR, never absolute canvas coordinates.
    for(const el of doc.elements){
      if(el.rotation && Number(el.rotation)!==0)throw Error("Поворот строки невозможен в EZ-2");
      if(el.kind==="barcode"){
        if(barcode)throw Error("Пока поддерживается один встроенный штрихкод на этикетке");
        if(el!==doc.elements[doc.elements.length-1])
          throw Error("Штрихкод в строковом режиме должен быть последним блоком");
        barcode=barcodeConfig(el);
        usedDots+=120; // conservative budget for unverified native barcode height
        rows.push({kind:"barcode",data:barcode.bars.display,barcode,element:el});
        continue;
      }
      if(el.kind!=="text" && el.kind!=="line")
        throw Error("Форма «"+el.kind+"» требует растровой печати");
      if(doc.starterPack==="food-v1" && !options.allowPlaceholders &&
          /\[[^\]]+\]/.test(String(el.value??"")))
        throw Error("Заполните поле «"+(el.fieldName||"Строка")+"» перед печатью");
      const code=el.kind==="line"?"A00":(el.deviceFont||"A00");
      const f=font(code);
      const requestedWidth=Math.min(55,Math.max(1,Number(el.widthMM||55)));
      const x=Math.max(0,Number(el.xMM||0));
      if(x+requestedWidth>Number(doc.widthMM)+0.001||x>=55)
        throw Error("Текстовый блок выходит за установленную ширину этикетки");
      const cellCapacity=Math.floor(Math.min(requestedWidth,55-x)*8/f.widthDots);
      const value=el.kind==="line" ? "─".repeat(Math.min(cellCapacity,54)):
        String(el.prefix||"")+String(el.value??"");
      const lines=wrapText(value,cellCapacity);
      for(const line of lines){
        // Probe code points before sending anything to the port.
        cp866(line);
        const position=marginMM(el,Array.from(line).length,f.widthDots);
        if(position<1 || position>55)
          throw Error("Позиция Mnn за областью печати");
        if((position-1)*8+Array.from(line).length*f.widthDots>PRINTABLE_DOTS)
          throw Error("Строка выходит за 55 мм печати: "+line);
        rows.push({kind:"text",text:line,font:f,margin:position,element:el});
        usedDots+=f.heightDots;
      }
    }
    if(usedDots>MAX_LAYOUT_DOTS)
      throw Error("Строки могут выйти за высоту 38 мм ("+usedDots+
        " точек). Уменьшите шрифт или сократите текст.");
    return {rows,usedDots,barcode};
  }
  function build(doc,copies=1){
    const n=Number(copies);
    if(!Number.isInteger(n)||n<1||n>200)throw Error("Копий: от 1 до 200");
    const layout=plan(doc);
    const out=[];
    const add=(...b)=>out.push(...b);
    const esc=s=>add(ESC,...byteASCII(s));
    esc("F0");esc("q040");esc("M01");
    if(layout.barcode){
      esc("?"+layout.barcode.selector);
      esc("X2");
    }
    esc("B");
    let lastFont=null,lastMargin=null;
    for(const row of layout.rows){
      if(row.kind==="barcode"){
        if(lastMargin!==1)esc("M01");
        esc("A11");
        add(ESC,row.element.showsHumanReadable===false?124:123);
        add(...byteASCII(row.data));add(125,CR);
      }else{
        if(row.margin!==lastMargin){esc("M"+String(row.margin).padStart(2,"0"));lastMargin=row.margin;}
        if(row.font.code!==lastFont){esc(row.font.code);lastFont=row.font.code;}
        add(...cp866(row.text),CR);
      }
    }
    esc("E");
    if(n<=99)esc("P"+String(n).padStart(2,"0"));
    else {esc("p"+String(n).padStart(3,"0"));add(CR,LF);}
    if(out.length>8192)throw Error("Превышен безопасный размер буфера 8 КБ");
    const bytes=Uint8Array.from(out);
    let binary="";
    for(let i=0;i<bytes.length;i+=2048)
      binary+=String.fromCharCode(...bytes.subarray(i,i+2048));
    return {base64:btoa(binary),size:bytes.length,copies:n,
      rows:layout.rows.length,usedDots:layout.usedDots,mode:"text",
      description:"Штатные строки CP866 + "+(layout.barcode?"штрихкод":"текст")};
  }
  root.EZ2Text={cp866,font,plan,build,wrapText};
})(window);
