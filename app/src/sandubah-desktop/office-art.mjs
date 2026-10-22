import {officeSeats,officeSeat,spritePlacement,chairBacks,officePose} from './office-seating.mjs';
const assets={};
function loadImage(name){
  if(!assets[name]){
    const picture=new Image();picture.src=new URL(`./assets/office/${name}.png`,import.meta.url).href;
    assets[name]=picture;
  }
  return assets[name];
}
export function createPixelRoom(canvas){
  const context=canvas.getContext('2d'),background=loadImage('gaucho-room-activities'),sprites=loadImage('gaucho-agents'),activities=loadImage('gaucho-activities');
  const pictures=[background,sprites,activities];
  canvas.width=960;canvas.height=640;context.imageSmoothingEnabled=false;
  let hits=[],latest;
  function paintCharacter(index,position,state,time,motion,parcel){
    const seated=state==='running'&&!parcel,pose=officePose(index,state,time,motion,parcel),sheet=pose.sheet==='gaucho-activities'?activities:sprites;
    const placement=spritePlacement(position,parcel),{width,height}=placement,bounce=parcel?Math.round(Math.sin(time/100)*2):seated?Math.round(Math.sin(time/170)):0;
    context.save();context.translate(position.left,placement.top+bounce);if(position.flip)context.scale(-1,1);
    const span=1-pose.inset+pose.extension;
    context.drawImage(sheet,(pose.column+pose.inset)*sheet.width/4,pose.row*sheet.height/2,span*sheet.width/4,sheet.height/2,-width/2+pose.inset*width,0,span*width,height);context.restore();
    if(!parcel&&!seated){
      const resting=state==='idle'||state==='done',labelTop=resting?placement.top+height+2:placement.top-17;
      context.fillStyle=resting?'#eaf0df':'#fff1d8';context.fillRect(position.left-27,labelTop,54,14);
      context.fillStyle='#4e6146';context.font='9px monospace';context.textAlign='center';context.fillText(resting?'LIVRE':state==='pending'?'NA FILA':'REVISAR',position.left,labelTop+10);
    }
    if(seated){context.fillStyle='#9cca7f';context.fillRect(position.left+26,placement.top+6,5,5);}
    context.textAlign='left';
  }
  function draw(input){
    latest=input;const {agents,states,time=0,motion=true,handoffs=[]}=input;hits=[];context.clearRect(0,0,960,640);
    if(pictures.some(picture=>!picture.complete||!picture.naturalWidth)){
      context.fillStyle='#f6eddf';context.fillRect(0,0,960,640);context.fillStyle='#5f6b52';context.font='16px sans-serif';context.fillText('Carregando a arte do galpão…',30,50);return;
    }
    context.drawImage(background,0,0,960,640);
    canvas.dataset.artReady='true';
    const positions=new Map(agents.map((agent,index)=>[agent.id,officeSeats.desks[index]]));
    const characters=agents.map((agent,index)=>{
      const state=states.get(agent.id)?.status||'idle',resting=state==='idle'||state==='done';
      let position=officeSeat(index,state),parcel=false;
      const delivery=handoffs.find(item=>item.from===agent.id&&time>=item.at&&time-item.at<5500);
      if(delivery){
        const source=positions.get(delivery.from),target=positions.get(delivery.to)||{left:885,top:420};
        const from={left:source.left,top:source.top+32},to={left:target.left-54,top:target.top+42};
        const path=[from,{left:from.left+22,top:from.top+40},{left:to.left+22,top:to.top+40},to];
        const fraction=motion?Math.min(1,(time-delivery.at)/4000):1,segment=Math.min(2,Math.floor(fraction*3)),step=fraction*3-segment;
        position={left:path[segment].left+(path[segment+1].left-path[segment].left)*step,top:path[segment].top+(path[segment+1].top-path[segment].top)*step};parcel=true;
      }
      return {agent,index,state,position,parcel,resting};
    }).sort((first,second)=>first.position.top-second.position.top);
    for(const item of characters){
      paintCharacter(item.index,item.position,item.state,motion?time:0,motion,item.parcel);
      if(!item.resting&&!item.parcel){
        context.save();context.beginPath();chairBacks[item.index].forEach(([left,top],index)=>index?context.lineTo(left*.625,top*.625):context.moveTo(left*.625,top*.625));context.closePath();context.clip();context.drawImage(background,0,0,960,640);context.restore();
      }
      hits.push({id:item.agent.id,...spritePlacement(item.position,item.parcel)});
    }
  }
  const redraw=()=>{if(latest)draw(latest);};
  for(const picture of pictures)picture.addEventListener('load',redraw,{once:true});
  return {draw,hit(left,top){return [...hits].reverse().find(item=>left>=item.left&&left<=item.left+item.width&&top>=item.top&&top<=item.top+item.height)?.id;},dispose(){for(const picture of pictures)picture.removeEventListener('load',redraw);}};
}
