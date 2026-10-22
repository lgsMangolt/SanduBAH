'use strict';

const MODELS = Object.freeze([
  {id:'qwen-0.8b',name:'Qwen3.5-0.8B',tier:'Leve',repository:'Qwen/Qwen3.5-0.8B',revision:'2fc06364715b967f1860aea9cf38778875588b17',supported:true,
    downloadGB:1.77,disk:'8 GiB livres para baixar, preparar e manter margem',vram:'Teste curto desta cópia: pico de 2,31 GB na GPU inteira; teto de 3,9 GB. Qualidade ainda não aprovada.',ram:'8 GiB instalados sugeridos; exige 4 GiB livres e 6 GiB de memória virtual disponível',
    description:'Instalação NF4 concluída neste PC. O teste atual errou a conversa e transcreveu o diagrama incompleto; envio bloqueado até corrigir e validar esta integração.'},
  {id:'qwen-2b',name:'Qwen3.5-2B',tier:'Médio',repository:'Qwen/Qwen3.5-2B',revision:'15852e8c16360a2fea060d615a32b45270f8a8fc',supported:true,
    downloadGB:4.57,disk:'10 GiB livres para baixar, preparar e manter margem',vram:'Diagnóstico curto: 3,47 GB na GPU inteira; teto de execução: 3,9 GB',ram:'16 GiB instalados sugeridos; exige 4 GiB livres e 6 GiB de memória virtual disponível',
    description:'Seu Qwen atual. AirLLM híbrido: matrizes NF4 e visão FP16. Leitura completa depende da validação desta versão.'},
  {id:'kimi-k3',name:'Kimi K3',tier:'Alto',repository:'moonshotai/Kimi-K3',supported:false,
    downloadGB:null,disk:'Escala de terabytes; download automático indisponível neste perfil',vram:'Não cabe no orçamento de 3,9 GB. Requer infraestrutura especializada; não há mínimo validado aqui.',ram:'Não há recomendação validada para este adaptador. Não é compatível com o perfil local da GTX 1660 SUPER.',
    description:'Modelo MoE de 2,8 trilhões de parâmetros. Só os pesos a 4 bits equivalem a ~1,4 TB, sem overhead: cálculo teórico, não requisito oficial. Não será baixado nem enviado a uma API automaticamente.'},
].map(model=>Object.freeze({...model,url:`https://huggingface.co/${model.repository}`})));

function modelById(id){const model=MODELS.find(item=>item.id===id);if(!model)throw new Error('Modelo não permitido.');return model;}
function modelDirectory(root,id){const {join}=require('node:path');modelById(id);return join(root,'build/sandubah/airllm',...(id==='qwen-2b'?[]:['models',id]));}

module.exports={MODELS,modelById,modelDirectory};
