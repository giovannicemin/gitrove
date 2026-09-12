/* The one mutable object the whole app reads from.
   Modules import S and mutate it in place; nothing else is shared. */

export const S = { data:null, nodes:[], byId:new Map(), branches:new Map(), tree:new Map(), order:[],
            layout:null, k:1, tx:0, ty:0, sel:null, hover:null, allLabels:true, collapsed:new Set(),
            labelMode:'auto', timeMode:'date', branchSide:'below', theme:'dark' };
