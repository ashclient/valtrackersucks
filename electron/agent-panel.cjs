'use strict';
function shouldShowAgentPanel(snapshot){
  return Boolean(snapshot&&(snapshot.phase==='agent-select'||snapshot.phase==='loading'));
}
function panelBounds(display){
  const area=display.workArea;const width=Math.min(376,area.width-24),height=Math.min(480,area.height-24);
  return {width,height,x:area.x+area.width-width-16,y:area.y+area.height-height-16};
}
module.exports={shouldShowAgentPanel,panelBounds};
