"use strict";(self.webpackChunkfirebird=self.webpackChunkfirebird||[]).push([[871],{6871:(F,S,v)=>{v.r(S),v.d(S,{RHistStatsPainter:()=>y,RLegendPainter:()=>E,RPavePainter:()=>k,RPaveTextPainter:()=>T});var w=v(467),x=v(6998),C=v(9041),R=v(8631),b=v(4797),A=v(4952),O=v(6370);class k extends R.D{drawContent(){var t=this;return(0,w.A)(function*(){return t})()}drawPave(){var t=this;return(0,w.A)(function*(){const e=t.getPadPainter().getPadRect(),i=t.getFramePainter();t.onFrame=i&&t.v7EvalAttr("onFrame",!0),t.corner=t.v7EvalAttr("corner",2);const a=t.v7EvalAttr("visible",!0),r=t.v7EvalLength("offsetX",e.width,.02),l=t.v7EvalLength("offsetY",e.height,.02),d=t.v7EvalLength("width",e.width,.3),s=t.v7EvalLength("height",e.height,.3);if(t.createG(),t.draw_g.classed("most_upper_primitives",!0),!a)return t;t.createv7AttLine("border_"),t.createv7AttFill();const n=t.onFrame?i.getFrameRect():e;let o=0,c=0;switch(t.corner){case 1:o=n.x+r,c=n.y+l;break;case 3:o=n.x+r,c=n.y+n.height-l-s;break;case 4:o=n.x+n.width-r-d,c=n.y+n.height-l-s;break;default:o=n.x+n.width-r-d,c=n.y+l}return(0,C.bk)(t.draw_g,o,c),t.draw_g.append("svg:rect").attr("x",0).attr("width",d).attr("y",0).attr("height",s).call(t.lineatt.func).call(t.fillatt.func),t.pave_width=d,t.pave_height=s,t.drawContent().then(()=>(t.isBatchMode()||(x.settings.ContextMenu&&t.paveContextMenu&&t.draw_g.on("contextmenu",g=>t.paveContextMenu(g)),(0,A.WJ)(t,{x:o,y:c,width:d,height:s,minwidth:20,minheight:20,redraw:g=>t.sizeChanged(g)})),t))})()}sizeChanged(t){this.pave_width=t.width,this.pave_height=t.height;const e=t.x,i=t.y,a=this.getPadPainter().getPadRect(),r=this.onFrame?this.getFramePainter().getFrameRect():a,l={};let d=0,s=0;switch(this.corner){case 1:d=e-r.x,s=i-r.y;break;case 3:d=e-r.x,s=r.y+r.height-i-this.pave_height;break;case 4:d=r.x+r.width-e-this.pave_width,s=r.y+r.height-i-this.pave_height;break;default:d=r.x+r.width-e-this.pave_width,s=i-r.y}this.v7AttrChange(l,"offsetX",d/a.width),this.v7AttrChange(l,"offsetY",s/a.height),this.v7AttrChange(l,"width",this.pave_width/a.width),this.v7AttrChange(l,"height",this.pave_height/a.height),this.v7SendAttrChanges(l,!1),this.draw_g.selectChild("rect").attr("width",this.pave_width).attr("height",this.pave_height),this.drawContent()}redraw(){var t=this;return(0,w.A)(function*(){return t.drawPave()})()}static draw(t,e,i){return(0,w.A)(function*(){const a=new k(t,e,i,"pave");return(0,b.ensureRCanvas)(a,!1).then(()=>a.drawPave())})()}}class E extends k{drawContent(){var t=this;return(0,w.A)(function*(){const e=t.getObject(),i=t.v7EvalFont("text",{size:12,color:"black",align:22}),a=t.pave_width,r=t.pave_height,l=t.getPadPainter();let d=e.fEntries.length;if(e.fTitle&&d++,!d||!l)return t;const s=r/d,n=.02*a;let o=0;i.setSize(r/(1.2*d)),t.startTextDrawing(i,"font"),e.fTitle&&(t.drawText({latex:1,width:a-2*n,height:s,x:n,y:o,text:e.fTitle}),o+=s);for(let c=0;c<e.fEntries.length;++c){const g=e.fEntries[c],_=Math.round(a/4);let f=null;t.drawText({latex:1,width:.75*a-3*n,height:s,x:2*n+_,y:o,text:g.fLabel}),"custom"!==g.fDrawableId?f=l.findSnap(g.fDrawableId,!0):g.fDrawable.fIO&&(f=new R.D(t.getDom(),g.fDrawable.fIO),g.fLine&&f.createv7AttLine(),g.fFill&&f.createv7AttFill(),g.fMarker&&f.createv7AttMarker()),g.fFill&&f?.fillatt&&t.draw_g.append("svg:path").attr("d",`M${Math.round(n)},${Math.round(o+.1*s)}h${_}v${Math.round(.8*s)}h${-_}z`).call(f.fillatt.func),g.fLine&&f?.lineatt&&t.draw_g.append("svg:path").attr("d",`M${Math.round(n)},${Math.round(o+s/2)}h${_}`).call(f.lineatt.func),g.fError&&f?.lineatt&&t.draw_g.append("svg:path").attr("d",`M${Math.round(n+a/8)},${Math.round(o+.2*s)}v${Math.round(.6*s)}`).call(f.lineatt.func),g.fMarker&&f?.markeratt&&t.draw_g.append("svg:path").attr("d",f.markeratt.create(n+a/8,o+s/2)).call(f.markeratt.func),o+=s}return t.finishTextDrawing()})()}static draw(t,e,i){return(0,w.A)(function*(){const a=new E(t,e,i,"legend");return(0,b.ensureRCanvas)(a,!1).then(()=>a.drawPave())})()}}class T extends k{drawContent(){const t=this.getObject(),e=this.v7EvalFont("text",{size:12,color:"black",align:22}),i=this.pave_width,a=this.pave_height,r=t.fText.length;if(!r)return;const l=a/r,d=.02*i;let s=0;e.setSize(a/(1.2*r)),this.startTextDrawing(e,"font");for(let n=0;n<t.fText.length;++n)this.drawText({latex:1,width:i-2*d,height:l,x:d,y:s,text:t.fText[n]}),s+=l;return this.finishTextDrawing(void 0,!0)}static draw(t,e,i){return(0,w.A)(function*(){const a=new T(t,e,i,"pavetext");return(0,b.ensureRCanvas)(a,!1).then(()=>a.drawPave())})()}}class y extends k{clearStat(){this.stats_lines=[]}addText(t){this.stats_lines.push(t)}updateStatistic(t){this.stats_lines=t.lines,this.drawStatistic(this.stats_lines)}fillStatistic(){if(this.getPadPainter()?._fast_drawing)return!1;const e=this.getObject();if(void 0!==e.fLines)return this.stats_lines=e.fLines,delete e.fLines,!0;if(this.v7OfflineMode()){const i=this.getMainPainter();return!!(0,x.isFunc)(i?.fillStatistic)&&i.fillStatistic(this,x.gStyle.fOptStat,x.gStyle.fOptFit)}return void 0!==this.stats_lines}format(t,e){switch(e||(e="stat"),e){case"stat":e=x.gStyle.fStatFormat;break;case"fit":e=x.gStyle.fFitFormat;break;case"entries":if(Math.abs(t)<1e9&&Math.round(t)===t)return t.toFixed(0);e="14.7g";break;case"last":e=this.lastformat}const i=(0,C.lg)(t,e||"6.4g",!0);return this.lastformat=i[1],i[0]}drawContent(){var t=this;return(0,w.A)(function*(){return t.fillStatistic()?t.drawStatistic(t.stats_lines):t})()}changeMask(t){const e=this.getObject(),i=1<<t;e.fShowMask=e.fShowMask&i?e.fShowMask&~i:e.fShowMask|i,this.fillStatistic()&&this.drawStatistic(this.stats_lines)}statsContextMenu(t){t.preventDefault(),t.stopPropagation(),(0,O.ES)(t,this).then(e=>{const i=this.getObject(),a=this.changeMask.bind(this);e.add("header: StatBox");for(let r=0;r<i.fEntries.length;++r)e.addchk(i.fShowMask&1<<r,i.fEntries[r],r,a);return this.fillObjectExecMenu(e)}).then(e=>e.show())}drawStatistic(t){var e=this;return(0,w.A)(function*(){if(!t)return e;const i=e.v7EvalFont("stats_text",{size:12,color:"black",align:22}),a=e.pave_width,r=e.pave_height,l=t.length;let d=0,s=0,n=0;for(let h=0;h<l;++h){const P=t[h];if(h>0&&(n=Math.max(n,P.length)),0===h||P.indexOf("|")<0)continue;0===d&&(d=h);const u=P.split("|");u.length>s&&(s=u.length)}const o=r/l,c=.02*a;let g=!1,_=e.draw_g.selectChild(".statlines");if(_.empty()?_=e.draw_g.append("svg:g").attr("class","statlines"):_.selectAll("*").remove(),i.setSize(r/(1.2*l)),e.startTextDrawing(i,"font",_),1===l)e.drawText({width:a,height:r,text:t[0],latex:1,draw_g:_});else for(let h=0;h<l;++h){const P=h*o;if(d&&h>=d){const u=t[h].split("|");for(let M=0;M<u.length;++M)e.drawText({align:"middle",x:a*M/s,y:P,latex:0,width:a/s,height:o,text:u[M],draw_g:_})}else if(t[h].indexOf("=")<0){if(0===h){g=!0;const u=Math.max(n,Math.round((a-2*c)/o/.65));t[h].length>u+5&&(t[h]=t[h].slice(0,u+2)+"...")}e.drawText({align:0===h?"middle":"start",x:c,y:P,width:a-2*c,height:o,text:t[h],draw_g:_})}else{const u=t[h].split("="),M=[];for(let m=0;m<2;++m)M.push({align:0===m?"start":"end",x:c,y:P,width:a-2*c,height:o,text:u[m],draw_g:_,_expected_width:a-2*c,_args:M,post_process(L){this._args[0].ready&&this._args[1].ready&&L.scaleTextDrawing(1.05*(this._args[0].result_width&&this._args[1].result_width)/this.__expected_width,this.draw_g)}});for(let m=0;m<2;++m)e.drawText(M[m])}}let f="";if(g&&(f+="M0,"+Math.round(o)+"h"+a),d>0&&s>1){for(let h=d;h<l;++h)f+="M0,"+Math.round(h*o)+"h"+a;for(let h=0;h<s-1;++h)f+="M"+Math.round(a/s*(h+1))+","+Math.round(d*o)+"V"+r}return f&&e.draw_g.append("svg:path").attr("d",f),e.finishTextDrawing(_)})()}redraw(t){var e=this;return(0,w.A)(function*(){if(t&&(0,x.isStr)(t)&&0===t.indexOf("zoom")&&e.v7NormalMode()){const i={_typename:`${x.nsREX}RHistStatBoxBase::RRequest`,mask:e.getObject().fShowMask};e.v7SubmitRequest("stat",i,a=>e.updateStatistic(a))}return e.drawPave()})()}static draw(t,e,i){return(0,w.A)(function*(){const a=new y(t,e,i,e);return(0,b.ensureRCanvas)(a,!1).then(()=>a.drawPave())})()}}}}]);