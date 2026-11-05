'use strict';
const catalog=require('./gaucho-appearance.json');

function appearance(value,{strict=false}={}){
  if(value===undefined)return {...catalog.defaults};
  if(!value||typeof value!=='object'||Array.isArray(value)){
    if(strict)throw new Error('Aparência do gauchinho inválida.');
    return {...catalog.defaults};
  }
  const result={...catalog.defaults};
  if(strict&&Object.keys(value).some(key=>!Object.hasOwn(result,key)))throw new Error('Opção de aparência desconhecida.');
  for(const field of catalog.fields){
    if(value[field.key]===undefined)continue;
    if(field.options.some(option=>option[0]===value[field.key]))result[field.key]=value[field.key];
    else if(strict)throw new Error(`${field.label}: escolha uma opção do catálogo.`);
  }
  if(typeof value.animated==='boolean')result.animated=value.animated;
  else if(strict&&value.animated!==undefined)throw new Error('Escolha se as animações ficam ligadas.');
  return result;
}

module.exports={appearance,catalog};
