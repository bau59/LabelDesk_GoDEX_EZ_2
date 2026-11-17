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
      // EZ-2/4 manual: A00=8×10, A01=8×10 bold, A02=8×20,
      // A03=8×30, A04=16×20 (2× horizontally and vertically).
      const native=[
        {widthDots:8,heightDots:10},
        {widthDots:8,heightDots:10,bold:true},
        {widthDots:8,heightDots:20,bold:true},
        {widthDots:8,heightDots:30,bold:true},
        {widthDots:16,heightDots:20,bold:true}
      ][Number(code.slice(-1))];
      return {code,...native};
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
  function printMargins(doc){
    const left=Number(doc.marginLeftMM??0),right=Number(doc.marginRightMM??0);
    if(!Number.isInteger(left)||!Number.isInteger(right)||
       left<0||right<0||left>15||right>15||left+right>=50)
      throw Error("Поля печати: от 0 до 15 мм слева и справа, суммарно менее 50 мм");
    return {left,right,width:PRINTABLE_DOTS/8-left-right};
  }
  function marginMM(e,lineWidth,fontWidth,usableWidth,leftMM){
    const x=Math.max(0,Number(e.xMM||0));
    const width=Math.min(Number(e.widthMM||55),usableWidth-x);
    let m=x+leftMM+1;
    const freeDots=Math.max(0,width*8-lineWidth*fontWidth);
    if(e.textAlignment==="center")m+=freeDots/16;
    if(e.textAlignment==="right")m+=freeDots/8;
    return Math.floor(m);
  }
  function barcodeConfig(e,maxWidth){
    if(!root.EZ2Barcodes)throw Error("Модуль штрихкодов отсутствует");
    const type=String(e.barcodeType||"CODE39").replace(/[^A-Za-z0-9]/g,"").toUpperCase();
    const bars=root.EZ2Barcodes.generate(type,e.value);
    if(type!=="CODE39"&&type!=="CODE128"&&type!=="EAN13"&&type!=="EAN8")
      throw Error("Встроенный штрихкод EZ-2 не подтверждён: "+type);
    if(/[{}|]/.test(bars.display))throw Error("Данные штрихкода содержат управляющие скобки EZ-2");
    if(type==="CODE128"&&/[^\x20-\x7e]/.test(bars.display))
      throw Error("Code128 в штатном режиме требует ASCII");
    const printWidth=Math.min(maxWidth,Number(e.widthMM||55));
    // At least a 2-dot module as in successful terminal tests 7–9.
    root.EZ2Barcodes.layout(type,bars.display,printWidth*8);
    return {bars,selector:type==="CODE39"?"3":type==="CODE128"?"1":"E"};
  }
  function frameLines(el,capacity){
    const style=el.frameStyle==="double"?"double":"single";
    const glyphs=style==="double"?
      {tl:"╔",tr:"╗",bl:"╚",br:"╝",h:"═",v:"║"}:
      {tl:"┌",tr:"┐",bl:"└",br:"┘",h:"─",v:"│"};
    const width=Number(el.frameChars??30);
    if(!Number.isInteger(width)||width<4||width>55||width>capacity)
      throw Error("Ширина рамки больше доступной области: "+width+" символов");
    const alignment=["left","center","right"].includes(el.textAlignment)?el.textAlignment:"left";
    const inner=width-4;
    const lines=wrapText(String(el.value??""),inner);
    const desired=Number(el.frameRows??0);
    if(!Number.isInteger(desired)||desired<0||desired>24)
      throw Error("Строк внутри рамки: от 0 (авто) до 24");
    const count=desired===0?Math.max(1,lines.length):desired;
    if(lines.length>count)
      throw Error("Текст не помещается в рамку: нужно "+lines.length+" строк, доступно "+count);
    if(count>24)throw Error("Рамка слишком высокая: более 24 строк");
    const place=line=>{
      const charCount=Array.from(line).length;
      const pad=inner-charCount;
      const before=alignment==="center"?Math.floor(pad/2):alignment==="right"?pad:0;
      return glyphs.v+" "+" ".repeat(before)+line+
        " ".repeat(pad-before)+" "+glyphs.v;
    };
    return [glyphs.tl+glyphs.h.repeat(width-2)+glyphs.tr,
      ...Array.from({length:count},(_,i)=>place(lines[i]||"")),
      glyphs.bl+glyphs.h.repeat(width-2)+glyphs.br];
  }
  function tableLines(el){
    const widths=String(el.tableWidths||"7,22,8").split(",").map(x=>Number(x.trim()));
    if(widths.length<2||widths.length>4||
       widths.some(n=>!Number.isInteger(n)||n<2||n>48))
      throw Error("Таблица: укажите 2–4 ширины колонок от 2 до 48 символов через запятую");
    const total=widths.reduce((a,b)=>a+b,0)+widths.length+1;
    if(total>55)throw Error("Таблица шире 55 мм: "+total+" символов A00");
    const source=String(el.value||"").split(/\r?\n/).filter(x=>x.trim()!=="");
    if(!source.length)throw Error("Добавьте строки таблицы");
    if(source.length>18)throw Error("Таблица: максимум 18 строк данных");
    const rows=source.map((line,i)=>{
      const cells=line.split("|").map(x=>x.trim());
      if(cells.length!==widths.length)
        throw Error("Строка таблицы "+(i+1)+": нужно "+widths.length+" колонки через |");
      return cells;
    });
    const glyph={horizontal:"─",vertical:"│",top:["┌","┬","┐"],
      mid:["├","┼","┤"],bottom:["└","┴","┘"]};
    const border=parts=>parts[0]+widths.map((w,i)=>glyph.horizontal.repeat(w)+
      (i===widths.length-1?parts[2]:parts[1])).join("");
    const content=cells=>{
      const wrapped=cells.map((cell,i)=>wrapText(cell,widths[i]));
      const count=Math.max(1,...wrapped.map(x=>x.length));
      return Array.from({length:count},(_,index)=>
        glyph.vertical+widths.map((w,i)=>{
          const value=wrapped[i][index]||"";
          return value+" ".repeat(w-Array.from(value).length)+glyph.vertical;
        }).join(""));
    };
    const out=[border(glyph.top)];
    for(let i=0;i<rows.length;i++){
      out.push(...content(rows[i]));
      if(i===0&&rows.length>1&&el.tableHeader!==false)out.push(border(glyph.mid));
    }
    out.push(border(glyph.bottom));
    return out;
  }
  function plan(doc, options={}){
    if(!doc || doc.printMode!=="text")throw Error("Этот макет не является строковым");
    if(Math.abs(Number(doc.heightMM)-38)>0.001||Math.abs(Number(doc.gapMM)-2)>0.001)
      throw Error("Штатный драйвер подтверждён для высоты 38 мм, зазора 2 мм");
    if(!Array.isArray(doc.elements)||doc.elements.length===0)
      throw Error("Шаблон без строк: нечего печатать");
    if(doc.elements.length>32)throw Error("Для штатного режима максимум 32 блока");
    const margins=printMargins(doc);
    const rows=[],issues=[];
    let barcode=null,usedDots=0;
    // Array order is the literal printer row order; X via Mnn, Y is
    // sequential CR, never absolute canvas coordinates.
    for(const el of doc.elements){
      if(el.rotation && Number(el.rotation)!==0)throw Error("Поворот строки невозможен в EZ-2");
      if(el.kind==="textTable"){
        const f=font("A00"); // Native box characters verified at A00 in G01/G02.
        const lines=tableLines(el);
        const x=Math.max(0,Number(el.xMM||0));
        const usableWidth=Math.min(55,margins.width-x);
        for(const line of lines){
          if(Array.from(line).length>usableWidth)
            throw Error("Таблица выходит за правую границу: "+line.length+" мм");
          cp866(line);
          const position=marginMM(el,Array.from(line).length,f.widthDots,
            margins.width,margins.left);
          rows.push({kind:"text",text:line,font:f,margin:position,
            element:el,reverse:false});
          usedDots+=f.heightDots;
        }
        continue;
      }
            if(el.kind==="textFrame"){
        const f=font(el.deviceFont||"A00");
        const x=Math.max(0,Number(el.xMM||0));
        if(x>=margins.width)throw Error("Рамка выходит за правую границу");
        const capacity=Math.floor(Math.min(55,Math.max(1,Number(el.widthMM||55)),
          margins.width-x)*8/f.widthDots);
        const lines=frameLines(el,capacity);
        for(const line of lines){
          cp866(line);
          const position=marginMM(el,Array.from(line).length,f.widthDots,margins.width,margins.left);
          rows.push({kind:"text",text:line,font:f,margin:position,element:el,reverse:el.reversePrint===true});
          usedDots+=f.heightDots;
        }
        continue;
      }
            if(el.kind==="barcode"){
        if(barcode)throw Error("Пока поддерживается один встроенный штрихкод на этикетке");
        if(el!==doc.elements[doc.elements.length-1])
          throw Error("Штрихкод в строковом режиме должен быть последним блоком");
        barcode=barcodeConfig(el,margins.width);
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
      if(x>=margins.width)throw Error("Блок за пределами области с отступами");
      const usableWidth=Math.min(requestedWidth,margins.width-x);
      const cellCapacity=Math.floor(usableWidth*8/f.widthDots);
      const value=el.kind==="line" ?
        (["─","═","█"].includes(el.lineSymbol)?el.lineSymbol:"─").repeat(
          Math.min(cellCapacity,Math.max(1,Math.min(54,Math.round(Number(el.lineChars)||54))))):
        String(el.prefix||"")+String(el.value??"");
      const lines=wrapText(value,cellCapacity);
      // Existing labels without fixedRows retain their legacy auto-height.
      // New fixed-height text fields reserve exactly N resident-font line slots,
      // independently of how much catalog data fits into the field.
      const fixed=el.kind==="text"&&el.fixedRows!==undefined&&el.fixedRows!==null;
      const limit=fixed?Number(el.fixedRows):lines.length;
      if(fixed&&(!Number.isInteger(limit)||limit<1||limit>20))
        throw Error("Высота текстового поля: от 1 до 20 строк");
      if(lines.length>limit){
        const label=String(el.fieldName||el.value||"Текст").slice(0,32);
        const message="Поле «"+label+"»: текст требует "+lines.length+
          " строк, доступно "+limit+". Увеличьте высоту поля, ширину или уменьшите шрифт.";
        if(!options.allowOverflowPreview)throw Error(message);
        issues.push({elementID:el.id,message});
      }
      const visible=lines.slice(0,limit);
      for(let i=0;i<limit;i++){
        // A space makes an empty reserved row a normal printable CR row.
        const line=i<visible.length&&visible[i]!==""?visible[i]:" ";
        cp866(line);
        const position=marginMM(el,Array.from(line).length,f.widthDots,margins.width,margins.left);
        if(position<1 || position>55)
          throw Error("Позиция Mnn за областью печати");
        if((position-1)*8+Array.from(line).length*f.widthDots>PRINTABLE_DOTS-margins.right*8)
          throw Error("Строка выходит за 55 мм печати: "+line);
        const reverse=el.reversePrint===true&&i<visible.length;
        rows.push({kind:"text",text:line,font:f,margin:position,element:el,
          reverse,inverseSpacingHandled:fixed&&el.reversePrint===true,
          reserved:fixed&&i>=visible.length});
        usedDots+=f.heightDots;
        if(fixed&&el.reversePrint===true){
          // Same total height for one or many inverted lines. ESC V already
          // ends with CR; the extra A00 row reserves its safe separation.
          rows.push({kind:"text",text:" ",font:font("A00"),margin:position,
            element:el,reverse:false,inverseSpacer:true,reserved:true});
          usedDots+=10;
        }
      }
    }
    // G02 physical sample: ESC V bar touches the following row with no gap.
    // A single native A00 blank row provides 1.25 mm vertical separation.
    for(let i=0;i<rows.length-1;i++){
      if(rows[i].reverse&&!rows[i].inverseSpacingHandled){
        rows.splice(i+1,0,{kind:"text",text:"",font:font("A00"),
          margin:rows[i].margin,element:rows[i].element,
          reverse:false,inverseSpacer:true});
        usedDots+=10;
        i++;
      }
    }
        if(usedDots>MAX_LAYOUT_DOTS)
      throw Error("Строки могут выйти за высоту 38 мм ("+usedDots+
        " точек). Уменьшите шрифт или сократите текст.");
    return {rows,usedDots,barcode,margins,issues};
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
        const start=1+layout.margins.left;
        if(lastMargin!==start)esc("M"+String(start).padStart(2,"0"));
        esc("A11");
        add(ESC,row.element.showsHumanReadable===false?124:123);
        add(...byteASCII(row.data));add(125,CR);
      }else{
        if(row.margin!==lastMargin){esc("M"+String(row.margin).padStart(2,"0"));lastMargin=row.margin;}
        if(row.font.code!==lastFont){esc(row.font.code);lastFont=row.font.code;}
        if(row.reverse)esc("V");
        add(...cp866(row.text),CR); // CR also ends ESC V inverse mode.
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
  root.EZ2Text={cp866,font,frameLines,plan,build,wrapText};
})(window);
