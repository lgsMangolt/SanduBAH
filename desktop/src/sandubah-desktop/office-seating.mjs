export const officeSeats={
  desks:[
    {left:350,top:435,width:96,height:128,flip:true,place:'Computador 1'},
    {left:501,top:401,width:94,height:126,flip:true,place:'Computador 2'},
    {left:639,top:364,width:92,height:123,flip:true,place:'Computador 3'},
    {left:463,top:284,width:79,height:106,flip:true,place:'Notebook'},
  ],
  lounge:[
    {left:783,top:306,width:80,height:120,hipAnchor:.78,flip:false,place:'Banco do arcade'},
    {left:842,top:349,width:66,height:88,flip:false,place:'Café · cadeira esquerda'},
    {left:914,top:352,width:66,height:88,flip:false,place:'Café · cadeira direita'},
    {left:77,top:371,width:66,height:88,flip:false,place:'Banco de descanso'},
  ],
};
export const chairBacks=[
  [[554,665],[615,642],[626,651],[613,725],[556,746],[543,737]],
  [[796,614],[849,595],[864,601],[852,674],[801,692],[788,681]],
  [[1017,554],[1066,539],[1082,544],[1069,609],[1023,627],[1007,616]],
  [[736,441],[774,426],[785,431],[777,479],[740,492],[729,485]],
];
export function officeSeat(index,state){
  if(!Number.isInteger(index)||index<0||index>3)throw new RangeError('Cada bloco comporta até quatro assentos.');
  return {...officeSeats[state==='idle'||state==='done'?'lounge':'desks'][index]};
}
export function spritePlacement(position,walking=false){
  const width=position.width||72,height=position.height||96;
  return {left:position.left-width/2,top:position.top-height*(walking ? .95 : position.hipAnchor??.72),width,height};
}
export function officePose(index,state,time=0,motion=true,parcel=false){
  officeSeat(index,state);
  const resting=!parcel&&(state==='idle'||state==='done');
  const activities=['arcade','chimarrao','servir','leitura'],intervals=[450,1800,2200,2600];
  return {activity:parcel?'entrega':resting?activities[index]:'computador',sheet:resting?'gaucho-activities':'gaucho-agents',column:index,row:resting?(motion?Math.floor(Math.max(0,time)/intervals[index])%2:0):parcel?1:0,inset:resting&&index===1?1/12:0,extension:resting&&index===0?1/12:0};
}
