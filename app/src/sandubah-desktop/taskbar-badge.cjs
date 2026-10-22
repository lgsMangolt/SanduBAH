'use strict';
const digits={'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],'3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],'6':['011','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','110'],'+':['000','010','111','010','000']};
function badgeLabel(count){if(!Number.isSafeInteger(count)||count<0)throw new Error('Contador de avisos inválido.');return count===0?'':count>9?'9+':String(count);}
function badgeBitmap(count){
  const label=badgeLabel(count),size=32,bytes=Buffer.alloc(size*size*4);if(!label)return bytes;
  const pixel=(x,y,red,green,blue)=>{const index=(y*size+x)*4;bytes[index]=blue;bytes[index+1]=green;bytes[index+2]=red;bytes[index+3]=255;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if((x-15.5)**2+(y-15.5)**2<=15**2)pixel(x,y,224,61,72);
  const scale=3,width=(label.length*4-1)*scale,startX=Math.floor((size-width)/2),startY=8;
  for(const [characterIndex,character]of [...label].entries())for(const [rowIndex,row]of digits[character].entries())for(const [columnIndex,bit]of [...row].entries())if(bit==='1')for(let offsetY=0;offsetY<scale;offsetY++)for(let offsetX=0;offsetX<scale;offsetX++)pixel(startX+(characterIndex*4+columnIndex)*scale+offsetX,startY+rowIndex*scale+offsetY,255,255,255);
  return bytes;
}
function createTaskbarBadge({window,nativeImage,platform=process.platform}){const cache=new Map();let count=0;return {update(value){const label=badgeLabel(value);count=value;if(platform!=='win32'||window.isDestroyed?.())return;let icon=null;if(label){if(!cache.has(label))cache.set(label,nativeImage.createFromBitmap(badgeBitmap(value),{width:32,height:32}).resize({width:16,height:16,quality:'best'}));icon=cache.get(label);}window.setOverlayIcon(icon,value?`${value} aviso${value===1?'':'s'} não lido${value===1?'':'s'} do SanduBAH`:'Sem avisos não lidos');},get count(){return count;}};}
module.exports={badgeLabel,badgeBitmap,createTaskbarBadge};
