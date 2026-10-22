'use strict';
const {ipcRenderer}=require('electron');
ipcRenderer.on('sandubah:loading',(_event,message)=>{if(typeof message==='string'&&message.length<200)document.getElementById('progress').textContent=message;});
