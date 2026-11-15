/* Experimental EZ-2 2002 native-printer command compiler.
   Deliberately restricted to a *single*, unrotated ASCII text or CODE39
   object for hardware diagnosis. Old EZ-2 has no random X/Y positioning.
   Never silently substitute this for the verified full-height Gnn raster.
 */
(function(root){
  "use strict";
  const ESC=27, CR=13;
  function ascii(s) {
    if(!/^[\x20-\x7E]+$/.test(s)||s.includes("{")||s.includes("}")||s.includes("|"))
      throw Error("Штатный шрифт EZ-2: только безопасный ASCII (без кириллицы, фигурных скобок и управляющих символов).");
    return [...s].map(x=>x.charCodeAt(0));
  }
  function bytesFromStrings(...parts) {
    const result=[];
    for(const s of parts)result.push(...[...s].map(c=>c.charCodeAt(0)));
    return result;
  }
  function packet(label) {
    if(!label || Math.abs(label.heightMM-38)>0.01 || Math.abs(label.gapMM-2)>0.01)
      throw Error("Проверочный пакет рассчитан только на рулон высотой 38 мм + зазор 2 мм.");
    if(!Array.isArray(label.elements)||label.elements.length!==1)
      throw Error("Тест встроенных команд рассчитан на один блок. Остальные макеты печатайте проверенным растром.");
    const e=label.elements[0];
    if(e.rotation && e.rotation!==0)
      throw Error("Встроенные команды EZ-2 пока проверяются без поворота.");
    if(Math.abs(e.xMM)>0.01)
      throw Error("Установите блок у левого края (X=0). Для теста используется M01.");
    // Deliberately no attempts to convert Y into feed commands. The printer
    // determines the vertical position from its own font/barcode line height.
    if(e.yMM>4)
      throw Error("Для теста расположите блок вверху этикетки (Y не больше 4 мм).");
    let result=[ESC,70,48, ESC,113,48,52,48, ESC,77,48,49]; // F0 q040 M01
    let info="";
    if(e.kind==="text"){
      if(e.renderMode!=="device")
        throw Error("У текста выберите «Встроенный ASCII — тестовый режим».");
      const font=e.deviceFont||"A11";
      if(!/^A(?:[1-4][1-8]|0[0-4])$/.test(font))
        throw Error("Неподдерживаемый шрифт EZ-2: "+font);
      const chars=ascii(String(e.value||""));
      if(chars.length>32)
        throw Error("Не более 32 ASCII-символов в однострочном тесте.");
      result.push(ESC,66, ESC,...bytesFromStrings(font),...chars,CR,ESC,69,ESC,80,48,49);
      info="EZ-2 "+font+" ASCII";
    }else if(e.kind==="barcode"){
      if((e.barcodeType||"CODE39")!=="CODE39")
        throw Error("Первый тест штатного штрихкода — только Code 39; другие типы доступны растрово.");
      const str=String(e.value||"").toUpperCase();
      if(!root.EZ2Barcodes)throw Error("Генератор штрихкода не загружен");
      root.EZ2Barcodes.generate("CODE39",str);
      if(str.length>15)throw Error("Для первого теста максимум 15 символов Code 39");
      const data=ascii(str);
      // ?3 is the documented Code39 selector. ESC {data} renders readable;
      // ESC |data} omits the human-readable caption.
      result.push(ESC,63,51, ESC,66, ESC,65,49,49, ESC,
        e.showsHumanReadable===false?124:123,...data,125,CR, ESC,69,ESC,80,48,49);
      info="EZ-2 CODE39 "+(e.showsHumanReadable===false?"without":"with")+" caption";
    }else{
      throw Error("Встроенные команды тестируются только на тексте и Code 39.");
    }
    if(result.length>512)throw Error("Слишком длинный тестовый пакет");
    const buf=Uint8Array.from(result);
    let binary="";for(const x of buf)binary+=String.fromCharCode(x);
    return {base64:btoa(binary),size:buf.length,description:info,hex:[...buf].map(x=>x.toString(16).padStart(2,"0")).join(" ")};
  }
  root.EZ2Native={packet};
})(window);
