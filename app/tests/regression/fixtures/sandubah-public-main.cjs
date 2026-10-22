'use strict';
const {app,BrowserWindow}=require('electron');
app.setPath('userData',process.env.SANDUBAH_PUBLIC_TEST_PROFILE);
app.whenReady().then(()=>{
  const preview=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  preview.loadFile(process.env.SANDUBAH_PUBLIC_TEST_FILE);
});
app.on('window-all-closed',()=>app.quit());
