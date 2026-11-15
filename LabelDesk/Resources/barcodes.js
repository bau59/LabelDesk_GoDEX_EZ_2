/* EZ-2 barcode generator shared by editor and raster encoder.
 * No runtime dependencies. EAN checksums and Code128 weighted checksum are
 * calculated here, never accepted silently when a supplied digit is wrong.
 */
(function(root){
  "use strict";
  const CODE39={
    "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw",
    "5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
    "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn",
    "F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
    "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn",
    "P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
    "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn",
    "Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn",
    "$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"
  };
  // Code 128 symbol widths 0..106, including 7-element stop symbol 106.
  const WIDTHS=[
    "212222","222122","222221","121223","121322","131222","122213","122312","132212",
    "221213","221312","231212","112232","122132","122231","113222","123122","123221",
    "223211","221132","221231","213212","223112","312131","311222","321122","321221",
    "312212","322112","322211","212123","212321","232121","111323","131123","131321",
    "112313","132113","132311","211313","231113","231311","112133","112331","132131",
    "113123","113321","133121","313121","211331","231131","213113","213311","213131",
    "311123","311321","331121","312113","312311","332111","314111","221411","431111",
    "111224","111422","121124","121421","141122","141221","112214","112412","122114",
    "122411","142112","142211","241211","221114","413111","241112","134111","111242",
    "121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311",
    "113141","114131","311141","411131","211412","211214","211232","2331112"
  ];
  const EAN_L=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
  const EAN_G=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
  const EAN_R=["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
  const PARITY13=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
  function requireValue(value,type){
    const text=String(value??"").trim();
    if(!text)throw Error(type+": укажите значение штрихкода");
    return text;
  }
  function checksumEAN(digits) {
    let sum=0;
    for(let i=digits.length-1,weight=3;i>=0;i--,weight=weight===3?1:3)
      sum+=Number(digits[i])*weight;
    return String((10-sum%10)%10);
  }
  function asRuns(bits){
    if(!bits.length)return [];
    const runs=[];let char=bits[0],length=0;
    for(const b of bits){if(b!==char){runs.push({bar:char==="1",units:length});char=b;length=0;}length++;}
    runs.push({bar:char==="1",units:length});
    return runs;
  }
  function fromEAN(value,size){
    const type="EAN-"+size;
    const text=requireValue(value,type);
    if(!/^\d+$/.test(text) || ![size-1,size].includes(text.length))
      throw Error(type+": требуется "+(size-1)+" или "+size+" цифр");
    const data=text.slice(0,size-1);
    const check=checksumEAN(data);
    if(text.length===size && text[size-1]!==check)
      throw Error(type+": неверная контрольная цифра; ожидается "+check);
    const digits=data+check;
    let bits="101";
    if(size===13){
      const parity=PARITY13[Number(digits[0])];
      for(let i=1;i<7;i++)bits+=(parity[i-1]==="L"?EAN_L:EAN_G)[Number(digits[i])];
      bits+="01010";
      for(let i=7;i<13;i++)bits+=EAN_R[Number(digits[i])];
    }else{
      for(let i=0;i<4;i++)bits+=EAN_L[Number(digits[i])];
      bits+="01010";
      for(let i=4;i<8;i++)bits+=EAN_R[Number(digits[i])];
    }
    bits+="101";
    return {type,display:digits,bits,moduleCount:bits.length,checksum:check};
  }
  function from39(value){
    const text=requireValue(value,"Code 39").toUpperCase();
    if(text.length>35 || Array.from(text).some(c=>!CODE39[c]||c==="*"))
      throw Error("Code 39: максимум 35 символов A–Z, 0–9, пробел, - . $ / + %");
    let bits="",chars="*"+text+"*";
    for(let k=0;k<chars.length;k++){
      const pattern=CODE39[chars[k]];
      for(let i=0;i<9;i++)bits+=(i%2===0?"1":"0").repeat(pattern[i]==="w"?3:1);
      if(k!==chars.length-1)bits+="0";
    }
    return {type:"CODE39",display:text,bits,moduleCount:bits.length};
  }
  function from128(value){
    const text=requireValue(value,"Code 128");
    if(text.length>40||Array.from(text).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>126))
      throw Error("Code 128: максимум 40 печатных ASCII-символов");
    const digits=/^\d+$/.test(text)&&text.length%2===0;
    const symbol=[digits?105:104]; // START C or START B
    if(digits){
      for(let i=0;i<text.length;i+=2)symbol.push(Number(text.slice(i,i+2)));
    }else{
      for(const ch of text)symbol.push(ch.charCodeAt(0)-32);
    }
    let sum=symbol[0];
    for(let i=1;i<symbol.length;i++)sum+=symbol[i]*i;
    const check=sum%103;
    symbol.push(check,106);
    let bits="";
    for(const index of symbol) {
      const pattern=WIDTHS[index];
      if(!pattern)throw Error("Code 128: неизвестный символ "+index);
      for(let i=0;i<pattern.length;i++)bits+=(i%2===0?"1":"0").repeat(Number(pattern[i]));
    }
    return {type:"CODE128",display:text,bits,moduleCount:bits.length,
      checksum:check,subset:digits?"C":"B"};
  }
  function generate(type,value){
    const normalized=String(type||"CODE39").toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(normalized==="CODE39")return from39(value);
    if(normalized==="CODE128")return from128(value);
    if(normalized==="EAN13")return fromEAN(value,13);
    if(normalized==="EAN8")return fromEAN(value,8);
    throw Error("Неподдерживаемый тип штрихкода: "+type);
  }
  function layout(type,value,widthDots,quietModules=10){
    const result=generate(type,value);
    const available=Math.floor(widthDots);
    const modules=result.moduleCount+quietModules*2;
    const moduleDots=Math.floor(available/modules);
    if(moduleDots<2){
      throw Error(result.type+": недостаточно ширины для сканирования (нужно минимум "+
        (modules*2/8).toFixed(1)+" мм при 203 dpi)");
    }
    const offset=Math.floor((available-result.moduleCount*moduleDots)/2);
    return {...result,moduleDots,offset,widthDots:available};
  }
  function draw(ctx,item,x,y,w,h){
    const readable=item.showsHumanReadable!==false;
    const result=layout(item.barcodeType||"CODE39",item.value,w);
    const caption=readable?Math.min(17,Math.max(10,h*0.24)):0;
    const barH=Math.max(1,h-caption);
    ctx.save();ctx.fillStyle="#000";
    for(let i=0;i<result.bits.length;i++)
      if(result.bits[i]==="1")ctx.fillRect(Math.round(x+result.offset+i*result.moduleDots),y,result.moduleDots,barH);
    if(readable){
      ctx.font=Math.min(14,Math.max(9,caption-1))+"px Menlo, monospace";
      ctx.textBaseline="top";ctx.textAlign="center";
      ctx.fillText(result.display,x+w/2,y+h-caption);
    }
    ctx.restore();
    return result;
  }
  root.EZ2Barcodes={generate,layout,draw,checksumEAN};
})(window);
