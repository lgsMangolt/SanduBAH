'use strict';

// Dataset e ajuste fino do gauchinho. Monta pares pergunta → resposta a partir das lições e de arquivos do usuário,
// valida, separa treino/validação e exporta no formato de chat usado por treinadores LoRA.
// O treino em si não roda aqui sem GPU compatível: o verificador diz isso e o script fica pronto para outra máquina.
const {createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest('hex');
const LIMITS={records:5000,field:8000,upload:2000000,minimum:50,recommended:200};
const BASE_MODEL=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
// Estimativas aproximadas para QLoRA em 4 bits com sequências curtas; variam com o treinador, o lote e o tamanho do texto.
const MODELS=[
  {id:'Qwen/Qwen2.5-0.5B-Instruct',label:'0,5 B · mais leve',vram:4},
  {id:'Qwen/Qwen2.5-1.5B-Instruct',label:'1,5 B · equilíbrio',vram:6},
  {id:'Qwen/Qwen2.5-3B-Instruct',label:'3 B · melhor resposta, mais pesado',vram:10}
];

const pairKey=(prompt,response)=>digest(`${prompt.trim()}\u0000${response.trim()}`);

// Correções viram pergunta → resposta ideal; exemplos aprovados, pergunta → resposta; tarefas com nota 4 ou 5, pedido → entrega.
function fromLessons(lessons,tasks=[]){
  const records=[];
  for(const lesson of lessons){
    if(lesson.kind==='correction'&&lesson.prompt&&lesson.ideal)records.push({prompt:lesson.prompt,response:lesson.ideal,source:'correction',lessonId:lesson.id});
    else if(lesson.kind==='example'&&lesson.prompt&&lesson.answer)records.push({prompt:lesson.prompt,response:lesson.answer,source:'example',lessonId:lesson.id});
    else if(lesson.kind==='task'&&lesson.score>=4){const task=tasks.find(item=>item.id===lesson.taskId);if(task?.result)records.push({prompt:task.instructions,response:task.result,source:'task',lessonId:lesson.id});}
  }
  return records;
}

// Aceita JSONL com {prompt, response} ou {messages:[{role:'user'},{role:'assistant'}]}. Linhas ruins são contadas, não ignoradas em silêncio.
function parseJsonl(text){
  if(typeof text!=='string'||!text.trim())throw new Error('Arquivo vazio.');
  if(text.length>LIMITS.upload)throw new Error('Arquivo maior que 2 MB. Divida em partes.');
  const records=[],rejected=[];
  text.split(/\r?\n/).forEach((line,index)=>{
    if(!line.trim())return;
    try{
      const value=JSON.parse(line);let prompt=value.prompt??value.pergunta,response=value.response??value.resposta;
      if(Array.isArray(value.messages)){prompt=value.messages.find(item=>item.role==='user')?.content;response=value.messages.find(item=>item.role==='assistant')?.content;}
      if(typeof prompt!=='string'||typeof response!=='string'||!prompt.trim()||!response.trim())throw new Error('sem pergunta e resposta');
      records.push({prompt,response,source:'upload'});
    }catch(error){rejected.push({line:index+1,reason:error instanceof SyntaxError?'JSON inválido':error.message.slice(0,120)});}
  });
  return {records,rejected};
}

// Divide de forma estável pelo conteúdo: o mesmo par fica sempre do mesmo lado entre exportações.
function split(records){
  if(records.length<10)return {train:records,validation:[]};
  const validation=records.filter(record=>parseInt(record.key.slice(0,4),16)%10===0);
  if(!validation.length)validation.push(records[records.length-1]);
  return {train:records.filter(record=>!validation.includes(record)),validation};
}

function report(records){
  const included=records.filter(record=>record.include);
  const tooLong=included.filter(record=>record.prompt.length+record.response.length>LIMITS.field);
  const bySource={};for(const record of included)bySource[record.source]=(bySource[record.source]||0)+1;
  const level=included.length>=LIMITS.recommended?'good':included.length>=LIMITS.minimum?'minimum':'insufficient';
  return {total:records.length,included:included.length,excluded:records.length-included.length,tooLong:tooLong.length,bySource,level,minimum:LIMITS.minimum,recommended:LIMITS.recommended,...(()=>{const parts=split(included);return {train:parts.train.length,validation:parts.validation.length};})()};
}

function chatLine(record,system){return JSON.stringify({messages:[{role:'system',content:system},{role:'user',content:record.prompt},{role:'assistant',content:record.response}]});}

// Verificador honesto: compara a VRAM detectada com a estimativa do modelo base e a quantidade de exemplos.
function readiness({memory,records,model}){
  const target=MODELS.find(item=>item.id===model)||{id:model,label:'modelo informado',vram:null};
  const gpu=memory?.gpu||null,gib=gpu?gpu.total/1073741824:0,data=report(records);
  const checks=[
    {id:'data',ok:data.level!=='insufficient',message:data.level==='insufficient'?`${data.included} exemplos incluídos; o mínimo sugerido é ${LIMITS.minimum} e o recomendado, ${LIMITS.recommended}.`:`${data.included} exemplos incluídos${data.level==='minimum'?`; com ${LIMITS.recommended} ou mais o resultado tende a ser mais estável`:''}.`},
    {id:'gpu',ok:Boolean(gpu),message:gpu?`GPU detectada com ${gib.toFixed(1).replace('.',',')} GiB de VRAM.`:'Nenhuma GPU detectada pelo SanduBAH neste PC.'},
    {id:'vram',ok:Boolean(gpu&&target.vram&&gib>=target.vram),message:target.vram?`${target.label}: estimativa de ${target.vram} GiB de VRAM para QLoRA (aproximada).`:'Modelo fora da lista: confira a VRAM necessária na página do modelo.'}
  ];
  return {canTrainHere:checks.every(check=>check.ok),checks,model:target,note:'Treinar na CPU é possível só em teoria para modelos minúsculos e leva horas ou dias; o SanduBAH não inicia esse treino. O script exportado roda numa máquina com GPU NVIDIA e CUDA, ou num serviço de notebook com GPU.'};
}

function trainingScript({model,name}){
  return `# Treino LoRA do gauchinho ${String(name).replace(/\s+/g,' ')} · gerado pelo SanduBAH
# ATENÇÃO: este script não foi executado pelo SanduBAH. Rode numa máquina com GPU NVIDIA e CUDA.
# Instale as bibliotecas por conta própria (por exemplo: pip install torch transformers peft trl datasets bitsandbytes)
# e confira na documentação delas se os parâmetros abaixo ainda valem para as versões instaladas.
from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

BASE_MODEL = ${JSON.stringify(model)}
data = load_dataset("json", data_files={"train": "train.jsonl", "validation": "validation.jsonl"})

trainer = SFTTrainer(
    model=BASE_MODEL,
    train_dataset=data["train"],
    eval_dataset=data["validation"] if len(data["validation"]) else None,
    peft_config=LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM"),
    args=SFTConfig(output_dir="gauchinho-lora", num_train_epochs=3, per_device_train_batch_size=2, gradient_accumulation_steps=4, learning_rate=2e-4, logging_steps=10, save_strategy="epoch"),
)
trainer.train()
trainer.save_model("gauchinho-lora")
print("Adaptador LoRA salvo em gauchinho-lora/. Teste antes de usar: o treino não garante qualidade.")
`;
}

function exportReadme({name,model,stats,readinessResult,exportedAt}){
  return `# Dataset do gauchinho ${name}

Exportado pelo SanduBAH em ${exportedAt}.

- Exemplos de treino: ${stats.train}
- Exemplos de validação: ${stats.validation}
- Origem: ${Object.entries(stats.bySource).map(([source,count])=>`${{correction:'correções',example:'exemplos aprovados',task:'tarefas bem avaliadas',upload:'arquivos enviados',manual:'pares escritos à mão'}[source]||source}: ${count}`).join(' · ')||'nenhuma'}
- Modelo base sugerido: ${model}

## Formato

Cada linha de \`train.jsonl\` e \`validation.jsonl\` é uma conversa: mensagem de sistema (personalidade), pergunta do usuário e resposta esperada.

## Treinar

${readinessResult.canTrainHere?'Este PC passou na verificação do SanduBAH, mas o app não inicia o treino: rode o script manualmente.':'Este PC não passou na verificação do SanduBAH. Rode o script numa máquina com GPU compatível.'}

\`\`\`bash
python train_lora.py
\`\`\`

O script não foi executado pelo SanduBAH. Os requisitos de VRAM são estimativas. Revise o dataset antes de compartilhar: ele contém as suas conversas e correções.
`;
}

module.exports={LIMITS,MODELS,BASE_MODEL,pairKey,fromLessons,parseJsonl,split,report,chatLine,readiness,trainingScript,exportReadme};
