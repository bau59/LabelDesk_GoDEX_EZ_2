/* LabelDesk: browser Canvas -> original EZ-2 binary ESC Gnn raster.
   No Node, Python, server, or external libraries. Fixed 280 rows, adaptive width <=55 bytes. */
(function (root) {
  "use strict";
  const DOTS = 8, MAX_DOTS = 440, PRINT_ROWS = 280, GAP = 2;
  const patterns = {
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
  const inRange = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;

  function validate(label) {
    if (!label || !inRange(+label.widthMM, 10, 60) ||
        !inRange(+label.heightMM, 10, 100) ||
        !inRange(+label.gapMM, 0, 10) || !Array.isArray(label.elements)) {
      throw new Error("Размеры материала должны быть 10–60 × 10–100 мм, зазор 0–10 мм.");
    }
    if (Math.abs(label.heightMM - Math.round(label.heightMM)) > 0.001 ||
        Math.abs(label.gapMM - Math.round(label.gapMM)) > 0.001) {
      throw new Error("Высота шаблона и зазор должны быть целыми миллиметрами.");
    }
    for (const item of label.elements) {
      const { xMM:x, yMM:y, widthMM:w, heightMM:h } = item;
      if (!inRange(+x,0,60) || !inRange(+y,0,100) ||
          !inRange(+w,0.125,60) || !inRange(+h,0.125,100) ||
          x+w > label.widthMM+0.001 || y+h > label.heightMM+0.001) {
        throw new Error("Слой выходит за границу этикетки.");
      }
    }
  }

  function wrap(ctx, text, maxWidth) {
    const result = [];
    for (const raw of String(text||"").split("\n")) {
      let line="";
      for (const ch of Array.from(raw)) {
        if (line && ctx.measureText(line+ch).width > maxWidth) {
          result.push(line);
          line=ch;
        } else {
          line+=ch;
        }
      }
      result.push(line);
    }
    return result;
  }

  function text(ctx, item, x, y, w, h) {
    const size=Math.max(5, (+item.fontSize||12)*DOTS/2.8346457);
    const lineHeight=size*1.08;
    const align=["left","center","right"].includes(item.textAlignment) ? item.textAlignment : "left";
    ctx.font=(item.isBold ? "bold " : "") + size + 'px -apple-system, "Helvetica Neue", sans-serif';
    ctx.textAlign=align;
    ctx.textBaseline="top";
    const anchor=align==="left"?x:align==="right"?x+w:x+w/2;
    const paint=()=> {
      const lines=wrap(ctx,item.value||"",w);
      lines.forEach((line,i)=> {
        if ((i*lineHeight) >= h) return;
        ctx.fillText(line,anchor,y+i*lineHeight);
      });
    };
    ctx.save();
    ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    if (item.rotation) {
      ctx.translate(x+w/2,y+h/2);
      ctx.rotate((+item.rotation||0)*Math.PI/180);
      ctx.translate(-x-w/2,-y-h/2);
    }
    paint();
    ctx.restore();
  }

  function barcode(ctx, item, x,y,w,h) {
    const value=String(item.value||"").toUpperCase();
    if (!value || value.length>40 || Array.from(value).some(ch=>ch==="*" || !patterns[ch])) {
      throw new Error("Некорректный Code 39: "+value);
    }
    const segments=Array.from("*"+value+"*").map(ch=>patterns[ch]);
    const units=segments.reduce((total,s)=>total+Array.from(s).reduce((n,ch)=>n+(ch==="w"?3:1),0),0)+segments.length-1;
    const narrow=Math.floor(w/units);
    if (narrow<2) throw new Error("Недостаточно ширины для штрихкода "+value);
    const barHeight=Math.max(4,h-(item.showsHumanReadable ? 16:0));
    let pos=x;
    segments.forEach((s,index)=>{
      for (let i=0;i<s.length;i++) {
        const bw=narrow*(s[i]==="w"?3:1);
        if(i%2===0) ctx.fillRect(pos,y,bw,barHeight);
        pos+=bw;
      }
      if(index!==segments.length-1)pos+=narrow;
    });
    if (item.showsHumanReadable) {
      ctx.font='13px Menlo, monospace';
      ctx.textAlign="center";
      ctx.textBaseline="top";
      ctx.fillText(value,x+w/2,y+h-16);
    }
  }

  function draw(label) {
    validate(label);
    const canvas=document.createElement("canvas");
    canvas.width=Math.ceil(label.widthMM*DOTS);
    canvas.height=Math.ceil(label.heightMM*DOTS);
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw new Error("Canvas недоступен");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#000";ctx.strokeStyle="#000";
    for(const e of label.elements) {
      const x=e.xMM*DOTS,y=e.yMM*DOTS,w=e.widthMM*DOTS,h=e.heightMM*DOTS;
      ctx.save();
      if(e.kind==="line"){ctx.fillRect(x,y,w,h);}
      else if(e.kind==="rectangle"){ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,Math.max(0,w-2),Math.max(0,h-2));}
      else if(e.kind==="text"){text(ctx,e,x,y,w,h);}
      else if(e.kind==="barcode"){barcode(ctx,e,x,y,w,h);}
      else throw new Error("Неизвестный вид слоя: "+e.kind);
      ctx.restore();
    }
    return canvas;
  }

  function encode(label, threshold=128) {
    // Preview works for any valid template. The real transport is deliberately
    // restricted to the verified 280-row / q040 geometry.
    if(Math.abs(label.heightMM-38)>0.001 || Math.abs(label.gapMM-GAP)>0.001){
      throw new Error("Для печати проверена только высота 38 мм и зазор 2 мм.");
    }
    const canvas=draw(label);
    const image=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height);
    const pixels=image.data;
    let lastRow=-1,lastByte=-1;
    const dots=MAX_DOTS, rows=PRINT_ROWS;
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<canvas.width;x++){
        const p=(y*canvas.width+x)*4;
        const ink=pixels[p]<threshold && pixels[p+1]<threshold && pixels[p+2]<threshold;
        if(!ink)continue;
        if(y>=rows)throw new Error("Пиксели ниже 35 мм: этикетка не будет обрезана молча.");
        if(x>=dots)throw new Error("Пиксели правее 55 мм: переместите слой в область печати.");
        lastRow=Math.max(lastRow,y);
        lastByte=Math.max(lastByte,Math.floor(x/8));
      }
    }
    // Keep the full tested 280-line mechanical step even for short text.
    // Only the number of bytes per row is compressed.
    const height=PRINT_ROWS;
    const width=Math.min(55,Math.max(10,lastByte+1));
    const bytes=new Uint8Array(height*(4+width)+1);
    let out=0;
    for(let y=0;y<height;y++){
      bytes[out++]=27;bytes[out++]=71;
      bytes[out++]=48+Math.floor(width/10);
      bytes[out++]=48+(width%10);
      for(let b=0;b<width;b++){
        let v=0;
        for(let bit=0;bit<8;bit++){
          const x=b*8+bit;
          if(x>=canvas.width || y>=canvas.height)continue;
          const p=(y*canvas.width+x)*4;
          if(pixels[p]<threshold && pixels[p+1]<threshold && pixels[p+2]<threshold){
            v|=0x80>>bit;
          }
        }
        bytes[out++]=v;
      }
    }
    bytes[out++]=12; // FF
    let binary="";
    for(let i=0;i<bytes.length;i+=2048){
      binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+2048));
    }
    return {base64:btoa(binary),widthBytes:width,rows:height,size:bytes.length,canvas};
  }
  // Physical media in the printer is independent of the template JSON.
  // Preserve templates of other sizes; only their print eligibility changes.
  const defaultMedia=Object.freeze({widthMM:58,heightMM:38,gapMM:2});
  function mediaFromProfile(profile) {
    const widthMM=Number(profile?.mediaWidthMM ?? defaultMedia.widthMM);
    const heightMM=Number(profile?.mediaHeightMM ?? defaultMedia.heightMM);
    const gapMM=Number(profile?.mediaGapMM ?? defaultMedia.gapMM);
    return {widthMM,heightMM,gapMM};
  }
  function validateMedia(media) {
    const m=mediaFromProfile({
      mediaWidthMM:media?.widthMM,
      mediaHeightMM:media?.heightMM,
      mediaGapMM:media?.gapMM
    });
    if (!inRange(m.widthMM,10,60) || !inRange(m.heightMM,10,100) ||
        !inRange(m.gapMM,0,10) ||
        !Number.isInteger(m.heightMM) || !Number.isInteger(m.gapMM)) {
      throw new Error("Рулон: ширина 10–60 мм, высота 10–100 мм, зазор 0–10 мм (высота и зазор целые).");
    }
    return m;
  }
  function compatibility(label, media) {
    const m=validateMedia(media);
    if(!label)return {ok:false,reason:"Шаблон не выбран"};
    const equal=(a,b)=>Number.isFinite(Number(a)) && Math.abs(Number(a)-Number(b))<0.001;
    const ok=equal(label.widthMM,m.widthMM)&&equal(label.heightMM,m.heightMM)&&equal(label.gapMM,m.gapMM);
    return ok?{ok:true,reason:""}:{
      ok:false,reason:"Размер шаблона "+label.widthMM+"×"+label.heightMM+" мм, зазор "+
        label.gapMM+" мм; в принтере "+m.widthMM+"×"+m.heightMM+" мм, зазор "+m.gapMM+" мм."
    };
  }
  function transportReady(media) {
    const m=validateMedia(media);
    // The actual shell transport is currently hardcoded to q040 and 280 rows.
    // Reject other stock rather than falsely claiming the media setting
    // reconfigures the printer hardware. Width is limited separately by G55.
    return m.heightMM===38 && m.gapMM===2;
  }
  root.EZ2Raster={draw,encode,defaultMedia,mediaFromProfile,validateMedia,compatibility,transportReady};
})(window);
