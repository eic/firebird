"use strict";(self.webpackChunkfirebird=self.webpackChunkfirebird||[]).push([[563],{6563:(A,_,g)=>{g.d(_,{G:()=>z});var y=g(467),d=g(6998),b=g(8631);function c(f){f._typename===`${d.nsREX}RAxisEquidistant`||f._typename===`${d.nsREX}RAxisLabels`?(0===f.fInvBinWidth&&(f.$dummy=!0,f.fInvBinWidth=1,f.fNBinsNoOver=0,f.fLow=0),f.min=f.fLow,f.max=f.fLow+f.fNBinsNoOver/f.fInvBinWidth,f.GetNumBins=function(){return this.fNBinsNoOver},f.GetBinCoord=function(i){return this.fLow+i/this.fInvBinWidth},f.FindBin=function(i,e){return Math.floor((i-this.fLow)*this.fInvBinWidth+e)}):f._typename===`${d.nsREX}RAxisIrregular`&&(f.min=f.fBinBorders[0],f.max=f.fBinBorders[f.fBinBorders.length-1],f.GetNumBins=function(){return this.fBinBorders.length},f.GetBinCoord=function(i){const e=Math.round(i);if(e<=0)return this.fBinBorders[0];if(e>=this.fBinBorders.length)return this.fBinBorders[this.fBinBorders.length-1];if(e===i)return this.fBinBorders[e];const t=i<e?e-1:e+1;return this.fBinBorders[e]*Math.abs(i-t)+this.fBinBorders[t]*Math.abs(i-e)},f.FindBin=function(i,e){for(let t=1;t<this.fBinBorders.length;++t)if(i<this.fBinBorders[t])return Math.floor(t-1+e);return this.fBinBorders.length-1}),f.GetBinCenter=function(i){return this.GetBinCoord(i-.5)},f.GetBinLowEdge=function(i){return this.GetBinCoord(i-1)}}function p(f){return f?.fHistImpl?.fIO||null}class z extends b.D{constructor(i,e){super(i,e),this.csstype="hist",this.draw_content=!0,this.nbinsx=0,this.nbinsy=0,this.accept_drops=!0,this.mode3d=!1,this.getHisto(!0)}isDisplayItem(){return this.getObject()?.fAxes}getHisto(i){const e=this.getObject();let t=p(e);return!t||t.getBinContent&&!i?!t&&e?.fAxes&&(t=e,(!t.getBinContent||i)&&(3===t.fAxes.length?(c(t.fAxes[0]),c(t.fAxes[1]),c(t.fAxes[2]),t.nx=t.fIndicies[1]-t.fIndicies[0],t.dx=t.fIndicies[0]+1,t.stepx=t.fIndicies[2],t.ny=t.fIndicies[4]-t.fIndicies[3],t.dy=t.fIndicies[3]+1,t.stepy=t.fIndicies[5],t.nz=t.fIndicies[7]-t.fIndicies[6],t.dz=t.fIndicies[6]+1,t.stepz=t.fIndicies[8],t.getBin=function(s,o,r){return s-1+this.fAxes[0].GetNumBins()*(o-1)+this.fAxes[0].GetNumBins()*this.fAxes[1].GetNumBins()*(r-1)},t.getBin0=t.stepx>1||t.stepy>1||t.stepz>1?function(s,o,r){return Math.floor((s-this.dx)/this.stepx)+this.nx/this.stepx*Math.floor((o-this.dy)/this.stepy)+this.nx/this.stepx*this.ny/this.stepy*Math.floor((r-this.dz)/this.stepz)}:function(s,o,r){return s-this.dx+this.nx*(o-this.dy)+this.nx*this.ny*(r-this.dz)},t.getBinContent=function(s,o,r){return this.fBinContent[this.getBin0(s,o,r)]},t.getBinError=function(s,o,r){return Math.sqrt(Math.abs(this.getBinContent(s,o,r)))}):2===t.fAxes.length?(c(t.fAxes[0]),c(t.fAxes[1]),t.nx=t.fIndicies[1]-t.fIndicies[0],t.dx=t.fIndicies[0]+1,t.stepx=t.fIndicies[2],t.ny=t.fIndicies[4]-t.fIndicies[3],t.dy=t.fIndicies[3]+1,t.stepy=t.fIndicies[5],t.getBin=function(s,o){return s-1+this.fAxes[0].GetNumBins()*(o-1)},t.getBin0=t.stepx>1||t.stepy>1?function(s,o){return Math.floor((s-this.dx)/this.stepx)+this.nx/this.stepx*Math.floor((o-this.dy)/this.stepy)}:function(s,o){return s-this.dx+this.nx*(o-this.dy)},t.getBinContent=function(s,o){return this.fBinContent[this.getBin0(s,o)]},t.getBinError=function(s,o){return Math.sqrt(Math.abs(this.getBinContent(s,o)))}):(c(t.fAxes[0]),t.nx=t.fIndicies[1]-t.fIndicies[0],t.dx=t.fIndicies[0]+1,t.stepx=t.fIndicies[2],t.getBin=function(s){return s-1},t.getBin0=t.stepx>1?function(s){return Math.floor((s-this.dx)/this.stepx)}:function(s){return s-this.dx},t.getBinContent=function(s){return this.fBinContent[this.getBin0(s)]},t.getBinError=function(s){return Math.sqrt(Math.abs(this.getBinContent(s)))}))):t.fAxes._2?(c(t.fAxes._0),c(t.fAxes._1),c(t.fAxes._2),t.getBin=function(s,o,r){return s-1+this.fAxes._0.GetNumBins()*(o-1)+this.fAxes._0.GetNumBins()*this.fAxes._1.GetNumBins()*(r-1)},t.getBinContent=function(s,o,r){return this.fStatistics.fBinContent[this.getBin(s,o,r)]},t.getBinError=function(s,o,r){const n=this.getBin(s,o,r);return this.fStatistics.fSumWeightsSquared?Math.sqrt(this.fStatistics.fSumWeightsSquared[n]):Math.sqrt(Math.abs(this.fStatistics.fBinContent[n]))}):t.fAxes._1?(c(t.fAxes._0),c(t.fAxes._1),t.getBin=function(s,o){return s-1+this.fAxes._0.GetNumBins()*(o-1)},t.getBinContent=function(s,o){return this.fStatistics.fBinContent[this.getBin(s,o)]},t.getBinError=function(s,o){const r=this.getBin(s,o);return this.fStatistics.fSumWeightsSquared?Math.sqrt(this.fStatistics.fSumWeightsSquared[r]):Math.sqrt(Math.abs(this.fStatistics.fBinContent[r]))}):(c(t.fAxes._0),t.getBin=function(s){return s-1},t.getBinContent=function(s){return this.fStatistics.fBinContent[s-1]},t.getBinError=function(s){return this.fStatistics.fSumWeightsSquared?Math.sqrt(this.fStatistics.fSumWeightsSquared[s-1]):Math.sqrt(Math.abs(this.fStatistics.fBinContent[s-1]))}),t}decodeOptions(){this.options||(this.options={Hist:1,System:1})}copyOptionsFrom(i){i!==this&&(this.options.Mode3D=i.options.Mode3D)}copyOptionsToOthers(){this.forEachPainter(i=>{i!==this&&(0,d.isFunc)(i.copyOptionsFrom)&&i.copyOptionsFrom(this)},"objects")}clear3DScene(){const i=this.getFramePainter();(0,d.isFunc)(i?.create3DScene)&&i.create3DScene(-1),this.mode3d=!1}cleanup(){this.clear3DScene(),delete this.options,super.cleanup()}getDimension(){return 1}scanContent(){}drawFrameAxes(){var i=this;return(0,y.A)(function*(){const e=i.getFramePainter();return!!e&&(!i.draw_content||(i.isMainPainter()?(e.cleanupAxes(),e.xmin=e.xmax=0,e.ymin=e.ymax=0,e.zmin=e.zmax=0,e.setAxesRanges(i.getAxis("x"),i.xmin,i.xmax,i.getAxis("y"),i.ymin,i.ymax,i.getAxis("z"),i.zmin,i.zmax),e.drawAxes()):!i.options.second_x&&!i.options.second_y||(e.setAxes2Ranges(i.options.second_x,i.getAxis("x"),i.xmin,i.xmax,i.options.second_y,i.getAxis("y"),i.ymin,i.ymax),e.drawAxes2(i.options.second_x,i.options.second_y))))})()}createHistDrawAttributes(){this.createv7AttFill(),this.createv7AttLine()}updateDisplayItem(i,e){return!(!i||!e||(i.fAxes=e.fAxes,i.fIndicies=e.fIndicies,i.fBinContent=e.fBinContent,i.fContMin=e.fContMin,i.fContMinPos=e.fContMinPos,i.fContMax=e.fContMax,this.getHisto(!0),0))}updateObject(i){const e=this.getObject();if(i!==e){if(!this.matchObjectType(i))return!1;if(this.isDisplayItem())this.updateDisplayItem(e,i);else{const t=p(e),s=p(i);if(!t||!s)return!1;t.fStatistics=s.fStatistics,e.fTitle=i.fTitle}}return this.scanContent(),this.histogram_updated=!0,!0}getAxis(i){const e=this.getHisto(),t=this.getObject();let s;if(t?.fAxes)switch(i){case"x":default:s=t.fAxes[0];break;case"y":s=t.fAxes[1];break;case"z":s=t.fAxes[2]}else if(e?.fAxes)switch(i){case"x":default:s=e.fAxes._0;break;case"y":s=e.fAxes._1;break;case"z":s=e.fAxes._2}return s&&!s.GetBinCoord&&c(s),s}getAxisBinTip(i,e,t){const s=this.getFramePainter(),o=s[`${i}_handle`],r=this.getAxis(i),n=r.GetBinCoord(e);if("labels"===o.kind)return s.axisAsText(i,n);const h=r.GetBinCoord(e+(t||1));return"time"===o.kind?s.axisAsText(i,(n+h)/2):`[${s.axisAsText(i,n)}, ${s.axisAsText(i,h)})`}extractAxesProperties(i){if(!this.getHisto())return;this.nbinsx=this.nbinsy=this.nbinsz=0;let t=this.getAxis("x");this.nbinsx=t.GetNumBins(),this.xmin=t.min,this.xmax=t.max,!(i<2)&&(t=this.getAxis("y"),this.nbinsy=t.GetNumBins(),this.ymin=t.min,this.ymax=t.max,!(i<3)&&(t=this.getAxis("z"),this.nbinsz=t.GetNumBins(),this.zmin=t.min,this.zmax=t.max))}addInteractivity(){const i=this.isMainPainter(),e=this.options.second_x||this.options.second_y;return(i||e?this.getFramePainter():null)?.addInteractivity(!i&&e)??!0}processItemReply(i,e){if(!this.isDisplayItem())return console.error("Get item when display normal histogram");e.reqid===this.current_item_reqid&&(null!==i&&this.updateDisplayItem(this.getObject(),i.item),e.resolveFunc(!0))}drawingBins(i){var e=this;return(0,y.A)(function*(){let t=!1;return i&&(0,d.isStr)(i)&&0===i.indexOf("zoom")&&(i.indexOf("0")>0&&(t=!0),e.getDimension()>1&&i.indexOf("1")>0&&(t=!0),e.getDimension()>2&&i.indexOf("2")>0&&(t=!0)),!(e.isDisplayItem()&&t&&e.v7NormalMode()&&e.prepareDraw({only_indexes:!0}).incomplete)||new Promise(o=>{const r=e.v7SubmitRequest("",{_typename:`${d.nsREX}RHistDrawableBase::RRequest`},e.processItemReply.bind(e));r?(e.current_item_reqid=r.reqid,r.resolveFunc=o,setTimeout(e.processItemReply.bind(e,null,r),1e3)):o(!0)})})()}toggleStat(){}getSelectIndex(i,e,t){const s=this.getAxis(i),o=this["nbins"+i]||0;let r=0;this.options.second_x&&"x"===i&&(i="x2"),this.options.second_y&&"y"===i&&(i="y2");const n=this.getFramePainter(),h=n?n[`zoom_${i}min`]:0,a=n?n[`zoom_${i}max`]:0;return h!==a&&s?(r="left"===e?s.FindBin(h,t||0):s.FindBin(a,(t||0)+.5),r<0?r=0:r>o&&(r=o)):r="left"===e?0:o,r}autoZoom(){}clickButton(i){const e=this.getFramePainter();if(!e)return!1;switch(i){case"ToggleZoom":if(this.zoom_xmin!==this.zoom_xmax||this.zoom_ymin!==this.zoom_ymax||this.zoom_zmin!==this.zoom_zmax){const t=this.unzoom();return e.zoomChangedInteractive("reset"),t}if(this.draw_content)return this.autoZoom();break;case"ToggleLogX":return e.toggleAxisLog("x");case"ToggleLogY":return e.toggleAxisLog("y");case"ToggleLogZ":return e.toggleAxisLog("z");case"ToggleStatBox":return(0,d.getPromise)(this.toggleStat())}return!1}fillToolbar(i){const e=this.getPadPainter();e&&(e.addPadButton("auto_zoom","Toggle between unzoom and autozoom-in","ToggleZoom","Ctrl *"),e.addPadButton("arrow_right","Toggle log x","ToggleLogX","PageDown"),e.addPadButton("arrow_up","Toggle log y","ToggleLogY","PageUp"),this.getDimension()>1&&e.addPadButton("arrow_diag","Toggle log z","ToggleLogZ"),this.draw_content&&e.addPadButton("statbox","Toggle stat box","ToggleStatBox"),i||e.showPadButtons())}get3DToolTip(i){const e=this.getHisto(),t={bin:i,name:e.fName||"histo",title:e.fTitle};switch(this.getDimension()){case 1:t.ix=i+1,t.iy=1,t.value=e.getBinContent(t.ix),t.error=e.getBinError(t.ix),t.lines=this.getBinTooltips(i-1);break;case 2:t.ix=i%this.nbinsx+1,t.iy=(i-(t.ix-1))/this.nbinsx+1,t.value=e.getBinContent(t.ix,t.iy),t.error=e.getBinError(t.ix,t.iy),t.lines=this.getBinTooltips(t.ix-1,t.iy-1);break;case 3:t.ix=i%this.nbinsx+1,t.iy=(i-(t.ix-1))/this.nbinsx%this.nbinsy+1,t.iz=(i-(t.ix-1)-(t.iy-1)*this.nbinsx)/this.nbinsx/this.nbinsy+1,t.value=e.getBinContent(t.ix,t.iy,t.iz),t.error=e.getBinError(t.ix,t.iy,t.iz),t.lines=this.getBinTooltips(t.ix-1,t.iy-1,t.iz-1)}return t}createContour(i,e,t){if(!i||!e)return;t||(t={});let s=d.gStyle.fNumberContours,o=this.minbin,r=this.maxbin,n=this.minposbin;t.scatter_plot&&(s>50&&(s=50),o=this.minposbin),o===r&&(o=this.gminbin,r=this.gmaxbin,n=this.gminposbin),this.getDimension()<3&&(i.zoom_zmin!==i.zoom_zmax?(o=i.zoom_zmin,r=i.zoom_zmax):t.full_z_range&&(o=i.zmin,r=i.zmax)),e.setFullRange(i.zmin,i.zmax),e.createContour(i.logz,s,o,r,n),this.getDimension()<3&&(i.scale_zmin=e.colzmin,i.scale_zmax=e.colzmax)}changeValuesRange(i,e){const t=this.getFramePainter();if(!t)return;const s=t.isAxisZoomed(e)?"zoom_"+e:e;i.input("Enter values range for axis "+e+" like [0,100] or empty string to unzoom","["+t[`${s}min`]+","+t[`${s}max`]+"]").then(r=>{r=r?JSON.parse(r):[],(0,d.isObject)(r)&&2===r.length&&Number.isFinite(r[0])&&Number.isFinite(r[1])?t.zoom(e,r[0],r[1]):t.unzoom(e)})}fillContextMenuItems(i){this.draw_content&&(i.addchk(this.toggleStat("only-check"),"Show statbox",()=>this.toggleStat()),2===this.getDimension()&&i.add("Values range",()=>this.changeValuesRange(i,"z")),(0,d.isFunc)(this.fillHistContextMenu)&&this.fillHistContextMenu(i));const e=this.getFramePainter();if(this.options.Mode3D){i.size()>0&&i.add("separator");const t=this.getMainPainter()||this;i.addchk(t.isTooltipAllowed(),"Show tooltips",()=>t.setTooltipAllowed("toggle")),i.addchk(e.enable_highlight,"Highlight bins",()=>{e.enable_highlight=!e.enable_highlight,!e.enable_highlight&&t.mode3d&&(0,d.isFunc)(t.highlightBin3D)&&t.highlightBin3D(null)}),(0,d.isFunc)(e?.render3D)&&(i.addchk(t.options.FrontBox,"Front box",()=>{t.options.FrontBox=!t.options.FrontBox,e.render3D()}),i.addchk(t.options.BackBox,"Back box",()=>{t.options.BackBox=!t.options.BackBox,e.render3D()})),this.draw_content&&(i.addchk(!this.options.Zero,"Suppress zeros",()=>{this.options.Zero=!this.options.Zero,this.redrawPad()}),(12===this.options.Lego||14===this.options.Lego)&&this.fillPaletteMenu(i)),(0,d.isFunc)(t.control?.reset)&&i.add("Reset camera",()=>t.control.reset())}this.histogram_updated&&e.zoomChangedInteractive()&&i.add("Let update zoom",()=>e.zoomChangedInteractive("reset"))}updatePaletteDraw(){this.isMainPainter()&&this.getPadPainter().findPainterFor(void 0,void 0,`${d.nsREX}RPaletteDrawable`)?.drawPalette()}fillPaletteMenu(i){i.addPaletteMenu(this.options.Palette||d.settings.Palette,e=>{this.options.Palette=parseInt(e),this.redraw()})}toggleMode3D(){return this.options.Mode3D=!this.options.Mode3D,this.options.Mode3D&&!this.options.Surf&&!this.options.Lego&&!this.options.Error&&(this.options.Lego=this.nbinsx>=50||this.nbinsy>=50?this.options.Color?14:13:this.options.Color?12:1,this.options.Zero=!1),this.copyOptionsToOthers(),this.interactiveRedraw("pad","drawopt")}prepareDraw(i){i||(i={rounding:!0,extra:0,middle:0}),void 0===i.extra&&(i.extra=0),void 0===i.right_extra&&(i.right_extra=i.extra),void 0===i.middle&&(i.middle=0);const e=this.getHisto(),t=this.getAxis("x"),s=this.getAxis("y"),o=this.getFramePainter(),r=this.getDimension(),n={i1:this.getSelectIndex("x","left",0-i.extra),i2:this.getSelectIndex("x","right",1+i.right_extra),j1:r<2?0:this.getSelectIndex("y","left",0-i.extra),j2:r<2?1:this.getSelectIndex("y","right",1+i.right_extra),k1:r<3?0:this.getSelectIndex("z","left",0-i.extra),k2:r<3?1:this.getSelectIndex("z","right",1+i.right_extra),stepi:1,stepj:1,stepk:1,min:0,max:0,sumz:0,xbar1:0,xbar2:1,ybar1:0,ybar2:1};let h,a,x,m,u,B;if(this.isDisplayItem()&&e.fIndicies&&(n.i1<e.fIndicies[0]&&(n.i1=e.fIndicies[0],n.incomplete=!0),n.i2>e.fIndicies[1]&&(n.i2=e.fIndicies[1],n.incomplete=!0),n.stepi=e.fIndicies[2],n.stepi>1&&(n.incomplete=!0),r>1&&e.fIndicies.length>5&&(n.j1<e.fIndicies[3]&&(n.j1=e.fIndicies[3],n.incomplete=!0),n.j2>e.fIndicies[4]&&(n.j2=e.fIndicies[4],n.incomplete=!0),n.stepj=e.fIndicies[5],n.stepj>1&&(n.incomplete=!0)),r>2&&e.fIndicies.length>8&&(n.k1<e.fIndicies[6]&&(n.k1=e.fIndicies[6],n.incomplete=!0),n.k2>e.fIndicies[7]&&(n.k2=e.fIndicies[7],n.incomplete=!0),n.stepk=e.fIndicies[8],n.stepk>1&&(n.incomplete=!0))),i.only_indexes)return n;n.grx=new Array(n.i2+n.stepi+1),n.gry=new Array(n.j2+n.stepj+1),i.original&&(n.original=!0,n.origx=new Array(n.i2+1),n.origy=new Array(n.j2+1)),i.pixel_density&&(i.rounding=!0);const l=o.getGrFuncs(this.options.second_x,this.options.second_y);for(h=n.i1;h<=n.i2;++h)x=t.GetBinCoord(h+i.middle),l.logx&&x<=0?n.i1=h+1:(n.origx&&(n.origx[h]=x),n.grx[h]=l.grx(x),i.rounding&&(n.grx[h]=Math.round(n.grx[h])),i.use3d&&(n.grx[h]<-o.size_x3d&&(n.i1=h,n.grx[h]=-o.size_x3d),n.grx[h]>o.size_x3d&&(n.i2=h,n.grx[h]=o.size_x3d)));for(i.use3d&&(n.i1<n.i2-2&&n.grx[n.i1]===n.grx[n.i1+1]&&n.i1++,n.i1<n.i2-2&&n.grx[n.i2-1]===n.grx[n.i2]&&n.i2--);h<n.i2+n.stepi+1;)n.grx[h++]=n.grx[n.i2];if(1===r)n.gry[0]=l.gry(0),n.gry[1]=l.gry(1);else for(a=n.j1;a<=n.j2;++a)m=s.GetBinCoord(a+i.middle),l.logy&&m<=0?n.j1=a+1:(n.origy&&(n.origy[a]=m),n.gry[a]=l.gry(m),i.rounding&&(n.gry[a]=Math.round(n.gry[a])),i.use3d&&(n.gry[a]<-o.size_y3d&&(n.j1=a,n.gry[a]=-o.size_y3d),n.gry[a]>o.size_y3d&&(n.j2=a,n.gry[a]=o.size_y3d)));if(i.use3d&&r>1&&(n.j1<n.j2-2&&n.gry[n.j1]===n.gry[n.j1+1]&&n.j1++,n.j1<n.j2-2&&n.gry[n.j2-1]===n.gry[n.j2]&&n.j2--),r>1)for(;a<n.j2+n.stepj+1;)n.gry[a++]=n.gry[n.j2];for(this.maxbin=this.minbin=this.minposbin=null,h=n.i1;h<n.i2;h+=n.stepi)for(a=n.j1;a<n.j2;a+=n.stepj)if(u=e.getBinContent(h+1,a+1),Number.isFinite(u)){if(n.sumz+=u,i.pixel_density){if(B=(n.grx[h+n.stepi]-n.grx[h])*(n.gry[a]-n.gry[a+n.stepj]),B<=0)continue;n.max=Math.max(n.max,u),u>0&&(u<n.min||0===n.min)&&(n.min=u),u/=B}null===this.maxbin?this.maxbin=this.minbin=u:(this.maxbin=Math.max(this.maxbin,u),this.minbin=Math.min(this.minbin,u)),u>0&&(null===this.minposbin||u<this.minposbin)&&(this.minposbin=u)}return n.palette=o.getHistPalette(),n.palette&&this.createContour(o,n.palette,i),n}}}}]);