'use strict';
const DEFAULT_KEYS = Object.freeze({overlay:'Control+Shift+V',interaction:'Control+Shift+I'});
function normalizeKey(value) {
  if(typeof value!=='string')return null;
  const parts=value.split('+');const key=parts.pop();
  const order=['Control','Alt','Shift','Super'];
  if(!parts.every(x=>order.includes(x))||new Set(parts).size!==parts.length)return null;
  if(!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(key))return null;
  if(!parts.length&&!/^F/.test(key))return null;
  return [...order.filter(x=>parts.includes(x)),key].join('+');
}
// Keep the last working bindings if a replacement is taken by another app.
class Shortcuts {
  constructor(api,callbacks){this.api=api;this.callbacks=callbacks;this.current=null;this.error='';}
  apply(keys){
    const next={overlay:normalizeKey(keys.overlay),interaction:normalizeKey(keys.interaction)};
    if(!next.overlay||!next.interaction||next.overlay===next.interaction)throw new Error('Choose two different shortcuts. Use modifiers with a letter/number, or a function key.');
    if(this.current&&Object.keys(next).every(k=>next[k]===this.current[k]))return;
    const old=this.current;this.api.unregisterAll();const registered=[];
    try{
      for(const name of Object.keys(next)){
        if(!this.api.register(next[name],this.callbacks[name]))throw new Error(next[name]+' is unavailable. Choose another shortcut.');
        registered.push(next[name]);
      }
      this.current=next;this.error='';
    }catch(error){
      registered.forEach(k=>this.api.unregister(k));this.current=null;
      if(old){let restored=true;for(const name of Object.keys(old))if(!this.api.register(old[name],this.callbacks[name]))restored=false;if(restored)this.current=old;else this.api.unregisterAll();}
      this.error=error.message;throw error;
    }
  }
}
module.exports={DEFAULT_KEYS,normalizeKey,Shortcuts};
