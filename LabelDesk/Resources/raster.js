/* LabelDesk: browser Canvas -> EZ-2 ESC Gnn raster.
   Adaptive label-height rows with the original 3-mm bottom safety reserve;
   no Node, Python, server or external libraries. Width <=55 bytes. */
(function (root) {
  "use strict";
  const DOTS = 8, MAX_DOTS = 440, BOTTOM_MARGIN_MM = 3;
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
      const lines=wrap(ctx,String(item.prefix||"")+String(item.value||""),w);
      if(lines.length*lineHeight>h+0.5){
        throw Error("Текст не помещается по высоте: требуется "+
          (lines.length*lineHeight/DOTS).toFixed(1)+" мм, доступно "+
          (h/DOTS).toFixed(1)+" мм. Увеличьте блок или уменьшите шрифт.");
      }
      for(const line of lines){
        if(ctx.measureText(line).width>w+0.5){
          throw Error("Символ шире текстового блока. Увеличьте ширину или уменьшите шрифт.");
        }
      }
      lines.forEach((line,i)=>ctx.fillText(line,anchor,y+i*lineHeight));
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


  // A real raster object: frame geometry and contained text share one coordinate
  // system and are clipped together. The source document is not modified.
  function framedText(ctx,item,x,y,w,h){
    const border=Math.max(1,Math.min(24,Math.round(Number(item.frameBorderMM??0.25)*DOTS)));
    const pad=Math.max(0,Math.min(15,Number(item.framePaddingMM??1.5)))*DOTS;
    const left=x+border/2,right=x+w-border/2,top=y+border/2,bottom=y+h-border/2;
    if(pad*2+border*2>=Math.min(w,h))throw Error("Отступ внутри рамки больше размера объекта");
    ctx.save();
    ctx.lineWidth=border;ctx.strokeStyle="#000";
    ctx.strokeRect(left,top,Math.max(0,right-left),Math.max(0,bottom-top));
    if(String(item.value||"").length){
      text(ctx,{...item,prefix:"",rotation:0},x+pad+border,y+pad+border,
        w-2*(pad+border),h-2*(pad+border));
    }
    ctx.restore();
  }
  function barcode(ctx, item, x,y,w,h) {
    if(!root.EZ2Barcodes)throw new Error("Генератор штрихкодов не загружен");
    return root.EZ2Barcodes.draw(ctx,item,x,y,w,h);
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
    // A preview of the printer's sequential buffered layout. It is only a
    // visual approximation: resident glyph bitmaps remain inside firmware.
    if(label.printMode==="text"){
      if(!root.EZ2Text)throw Error("Компилятор текста не загружен");
      const compiled=root.EZ2Text.plan(label,{allowPlaceholders:true});
      let rowY=0;
      for(const row of compiled.rows){
        if(row.kind==="barcode"){
          const barcodeItem={...row.element,value:row.data};
          barcode(ctx,barcodeItem,8,rowY,440,110);
          rowY+=120;
        }else{
          const f=row.font;
          ctx.save();
          ctx.font=Math.max(8,Math.floor(f.heightDots*0.85))+'px Menlo,monospace';
          ctx.fillStyle="#000";ctx.textBaseline="top";ctx.textAlign="left";
          ctx.fillText(row.text,Math.round(row.margin*DOTS),rowY);
          ctx.restore();
          rowY+=f.heightDots;
        }
      }
      return canvas;
    }
    for(const e of label.elements) {
      const x=e.xMM*DOTS,y=e.yMM*DOTS,w=e.widthMM*DOTS,h=e.heightMM*DOTS;
      ctx.save();
      if(e.kind==="line"){ctx.fillRect(x,y,w,h);}
      else if(e.kind==="rectangle"){ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,Math.max(0,w-2),Math.max(0,h-2));}
      else if(e.kind==="text"){text(ctx,e,x,y,w,h);}
      else if(e.kind==="framedText"){framedText(ctx,e,x,y,w,h);}
      else if(e.kind==="barcode"){barcode(ctx,e,x,y,w,h);}
      else throw new Error("Неизвестный вид слоя: "+e.kind);
      ctx.restore();
    }
    return canvas;
  }

  function encode(label, threshold=128) {
    // ESC qNNN is height + gap; gapless stock requires a different sensor mode.
    if(Number(label.gapMM)===0)throw Error("Для печати требуется рулон с зазором от 1 мм.");
    const canvas=draw(label);
    const image=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height);
    const pixels=image.data;
    let lastRow=-1,lastByte=-1;
    const dots=MAX_DOTS, rows=(label.heightMM-BOTTOM_MARGIN_MM)*DOTS;
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<canvas.width;x++){
        const p=(y*canvas.width+x)*4;
        const ink=pixels[p]<threshold && pixels[p+1]<threshold && pixels[p+2]<threshold;
        if(!ink)continue;
        if(y>=rows)throw new Error("Пиксели ниже "+(rows/DOTS)+" мм: оставьте 3 мм до нижнего края этикетки.");
        if(x>=dots)throw new Error("Пиксели правее 55 мм: переместите слой в область печати.");
        lastRow=Math.max(lastRow,y);
        lastByte=Math.max(lastByte,Math.floor(x/8));
      }
    }
    // 38 mm retains the exact original 280 lines; compress only row width.
    const height=rows;
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
  function labelPitch(media) {
    const m=validateMedia(media);
    if(m.gapMM<1)throw Error("Для датчика просвета требуется зазор от 1 мм.");
    return m.heightMM+m.gapMM; // ESC qNNN: label height + gap in mm
  }
  function transportReady(media) {
    return validateMedia(media).gapMM>=1; // F0 see-through sensor
  }
  root.EZ2Raster={draw,encode,defaultMedia,mediaFromProfile,validateMedia,compatibility,transportReady,labelPitch};
})(window);
