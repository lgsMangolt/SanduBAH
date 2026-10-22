'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel,payload) {
  const response=await ipcRenderer.invoke(channel,payload);
  if(!response.ok)throw new Error(response.error);
  return response.value;
}
function subscribe(channel,listener) {
  const callback=(_event,value)=>listener(value);
  ipcRenderer.on(channel,callback);
  return ()=>ipcRenderer.removeListener(channel,callback);
}
contextBridge.exposeInMainWorld('sandubah',Object.freeze({
  onNotice:listener=>subscribe('sandubah:notice',listener),
  notices:()=>invoke('sandubah:notices'),readNotice:payload=>invoke('sandubah:notice-read',payload),
  testNotice:()=>invoke('sandubah:notice-test'),
  preview:id=>invoke('sandubah:preview',{id}),previewFile:payload=>invoke('sandubah:preview-file',payload),buildProject:payload=>invoke('sandubah:build-project',payload),
  previewData:payload=>invoke('sandubah:preview-data',payload),
  mediaList:scope=>invoke('sandubah:media-list',{scope}),mediaChoose:payload=>invoke('sandubah:media-choose',payload),mediaRemove:payload=>invoke('sandubah:media-remove',payload),mediaFrames:payload=>invoke('sandubah:media-frames',payload),
  onPlanningReview:listener=>subscribe('sandubah:planning-review',listener),
  respondPlanningReview:payload=>invoke('sandubah:planning-review-response',payload),
  initialize:()=>invoke('sandubah:initialize'),connect:()=>invoke('sandubah:connect'),
  releaseNotes:payload=>invoke('sandubah:release-notes',payload),
  updatesStatus:()=>invoke('sandubah:updates-status'),checkUpdates:()=>invoke('sandubah:updates-check'),downloadUpdate:()=>invoke('sandubah:updates-download'),installUpdate:()=>invoke('sandubah:updates-install'),onUpdates:listener=>subscribe('sandubah:updates',listener),
  execute:payload=>invoke('sandubah:execute',payload),help:id=>invoke('sandubah:help',{id}),
  readSource:id=>invoke('sandubah:source',{id}),development:payload=>invoke('sandubah:development',payload),
  copyRequest:payload=>invoke('sandubah:copy-request',payload),openCodex:()=>invoke('sandubah:open-codex'),
  brain:()=>invoke('sandubah:brain'),document:payload=>invoke('sandubah:document',payload),saveDocument:payload=>invoke('sandubah:save-document',payload),
  knowledge:payload=>invoke('sandubah:knowledge',payload),
  project:payload=>invoke('sandubah:project',payload),runProject:payload=>invoke('sandubah:run-project',payload),stopQueue:()=>invoke('sandubah:stop-queue'),handoff:id=>invoke('sandubah:handoff',{id}),
  onProject:listener=>subscribe('sandubah:project-state',listener),
  interruptWorker:()=>invoke('sandubah:interrupt-worker'),artifacts:id=>invoke('sandubah:artifacts',{id}),artifact:payload=>invoke('sandubah:artifact',payload),applyArtifact:payload=>invoke('sandubah:apply-artifact',payload),checkpoints:id=>invoke('sandubah:checkpoints',{id}),checkpoint:payload=>invoke('sandubah:checkpoint',payload),restoreCheckpoint:payload=>invoke('sandubah:restore-checkpoint',payload),history:payload=>invoke('sandubah:history',payload),gaucho:payload=>invoke('sandubah:gaucho',payload),
  onWorker:listener=>subscribe('sandubah:worker',listener),
  plannerStatus:()=>invoke('sandubah:planner-status'),plannerChat:payload=>invoke('sandubah:planner-chat',payload),
  plannerContext:payload=>invoke('sandubah:planner-context',payload),
  plannerSelect:payload=>invoke('sandubah:planner-select',payload),plannerQuota:provider=>invoke('sandubah:planner-quota',{provider}),
  plannerImage:()=>invoke('sandubah:planner-image'),plannerStop:()=>invoke('sandubah:planner-stop'),
  onPlanner:listener=>subscribe('sandubah:planner-event',listener),
  modelsStatus:()=>invoke('sandubah:models-status'),modelsSelect:id=>invoke('sandubah:models-select',{id}),
  memoryStatus:()=>invoke('sandubah:memory-status'),
  modelsInstall:(id,action)=>invoke('sandubah:models-install',{id,action}),modelsCancel:id=>invoke('sandubah:models-cancel',{id}),
  modelsLink:id=>invoke('sandubah:models-link',{id}),onModels:listener=>subscribe('sandubah:models-event',listener),
  onState:listener=>subscribe('sandubah:state',listener),onOutput:listener=>subscribe('sandubah:output',listener),
}));
