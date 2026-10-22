'use strict';

const MAX_COMPLETE_CONTEXT=120000;
function contextLimit(provider,mode){return provider==='local'?6000:provider==='codex'&&mode==='complete'?MAX_COMPLETE_CONTEXT:36000;}
function requestLimit(provider){return provider==='codex'?200000:58000;}
function reviewLimit(request){return request.entry?.kind==='cloud-planning'&&request.arguments?.selection?.provider==='codex'?220000:64000;}
module.exports={MAX_COMPLETE_CONTEXT,contextLimit,requestLimit,reviewLimit};
