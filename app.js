"use strict";
(function(){
var $=function(i){return document.getElementById(i)};
var pixels=null,palette=[],srcImg=null;
function hex(c){return"#"+c.map(function(v){return v.toString(16).padStart(2,"0")}).join("").toUpperCase()}
function toast(t){$("toast").textContent=t;clearTimeout(toast.t);toast.t=setTimeout(function(){$("toast").textContent=""},2000)}
function sample(img){var M=160,s=Math.min(1,M/Math.max(img.naturalWidth,img.naturalHeight));
 var w=Math.max(1,Math.round(img.naturalWidth*s)),h=Math.max(1,Math.round(img.naturalHeight*s));
 var c=document.createElement("canvas");c.width=w;c.height=h;var x=c.getContext("2d",{willReadFrequently:true});
 x.imageSmoothingEnabled=false;x.drawImage(img,0,0,w,h);var d=x.getImageData(0,0,w,h).data,out=[];
 for(var i=0;i<d.length;i+=4)if(d[i+3]>=128)out.push([d[i],d[i+1],d[i+2]]);return out}
function lin(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function gam(v){v=v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055;return Math.max(0,Math.min(255,Math.round(v*255)))}
function toLab(c){var r=lin(c[0]),g=lin(c[1]),b=lin(c[2]);
 var l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return[100*(.2104542553*l+.793617785*m-.0040720468*s),100*(1.9779984951*l-2.428592205*m+.4505937099*s),100*(.0259040371*l+.7827717662*m-.808675766*s)]}
function d2(a,b){var x=a[0]-b[0],y=a[1]-b[1],z=a[2]-b[2];return x*x+y*y+z*z}
var MERGE=8; // OKLab×100 での ΔE。これ未満は同じ色とみなす
function extract(px,k){if(!px.length)return[];
 // 1) 同じ色をまとめる（重み付き）
 var map=new Map();px.forEach(function(p){var key=(p[0]<<16)|(p[1]<<8)|p[2];var e=map.get(key);if(e)e.w++;else map.set(key,{rgb:p,w:1})});
 var U=[],keys=Array.from(map.keys()).sort(function(a,b){return a-b});keys.forEach(function(q){var e=map.get(q);U.push({rgb:e.rgb,lab:toLab(e.rgb),w:e.w})});
 // 2) OKLab で k=16 の k-means（決定論的 farthest-point 初期化）
 var K=Math.min(16,U.length),W=px.length,i,j,m=[0,0,0];
 U.forEach(function(u){m[0]+=u.lab[0]*u.w;m[1]+=u.lab[1]*u.w;m[2]+=u.lab[2]*u.w});m=m.map(function(v){return v/W});
 var cs=[],dist=U.map(function(u){return d2(u.lab,m)});
 for(j=0;j<K;j++){var bi=0;for(i=1;i<U.length;i++)if(dist[i]>dist[bi])bi=i;if(j>0&&dist[bi]===0)break;cs.push(U[bi].lab.slice());
  for(i=0;i<U.length;i++)dist[i]=j===0?d2(U[i].lab,cs[0]):Math.min(dist[i],d2(U[i].lab,cs[j]))}
 var as=new Int32Array(U.length),cnt;
 for(var it=0;it<20;it++){var sum=cs.map(function(){return[0,0,0]});cnt=cs.map(function(){return 0});
  for(i=0;i<U.length;i++){var b=0,bd=1e18;for(j=0;j<cs.length;j++){var dd=d2(U[i].lab,cs[j]);if(dd<bd){bd=dd;b=j}}as[i]=b;cnt[b]+=U[i].w;var w=U[i].w;sum[b][0]+=U[i].lab[0]*w;sum[b][1]+=U[i].lab[1]*w;sum[b][2]+=U[i].lab[2]*w}
  var mv=false;for(j=0;j<cs.length;j++)if(cnt[j]){var n=sum[j].map(function(v){return v/cnt[j]});if(d2(n,cs[j])>.01)mv=true;cs[j]=n}if(!mv)break}
 // 代表色：クラスタ内で重心に一番近い実在の色（平均で濁らないように）
 var cl=[];for(j=0;j<cs.length;j++){if(!cnt[j])continue;var best=-1,bd2=1e18;for(i=0;i<U.length;i++)if(as[i]===j){var e2=d2(U[i].lab,cs[j]);if(e2<bd2){bd2=e2;best=i}}
  cl.push({rgb:U[best].rgb,lab:U[best].lab,n:cnt[j],share:cnt[j]/W,chroma:Math.hypot(cs[j][1],cs[j][2])})}
 // 3) 選択：最大シェアから始め、以降は「シェア^0.5 ×（既選択との最小ΔE）×（彩度ボーナス）」が最大のものを選ぶ。ΔE<MERGE は除外
 cl.sort(function(a,b){return b.n-a.n});var sel=[cl[0]];
 while(sel.length<k){var pick=null,ps=0;cl.forEach(function(c){if(sel.indexOf(c)>=0)return;
   var md=Math.min.apply(null,sel.map(function(s){return Math.sqrt(d2(c.lab,s.lab))}));if(md<MERGE)return;
   var sc=Math.sqrt(c.share)*md*(1+c.chroma/15);if(sc>ps){ps=sc;pick=c}});if(!pick)break;sel.push(pick)}
 // 4) 残りのクラスタを一番近い選択色に合算
 var out=sel.map(function(s){return{rgb:s.rgb,lab:s.lab,n:0}});
 cl.forEach(function(c){var b=0,bd=1e18;out.forEach(function(o,q){var dd=d2(c.lab,o.lab);if(dd<bd){bd=dd;b=q}});out[b].n+=c.n});
 return out.sort(function(a,b){return b.n-a.n})}
function render(){var ul=$("swatches");ul.innerHTML="";var tot=palette.reduce(function(s,c){return s+c.n},0);
 palette.forEach(function(c){var li=document.createElement("li"),h=hex(c.rgb);li.tabIndex=0;li.title="クリックでコピー";li.dataset.hex=h;
  li.innerHTML='<span class="chip" style="background:'+h+'"></span><span class="hex">'+h+'</span><span class="pct">'+(100*c.n/tot).toFixed(1)+'%</span>';
  li.onclick=li.onkeydown=function(e){if(e.type==="keydown"&&e.key!=="Enter")return;copy(h)};ul.appendChild(li)});
 ["exPng","exTxt","exCss"].forEach(function(i){$(i).disabled=!palette.length})}
function copy(t){function ok(){toast(t+" をコピーしたよ")}
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(ok,fb);else fb();
 function fb(){var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();try{document.execCommand("copy");ok()}catch(e){toast("コピーできなかった… "+t)}a.remove()}}
function run(){if(!pixels)return;TsukiLoader.show({caption:"色を拾ってるよ…",size:3});
 setTimeout(function(){try{var k=+$("count").value;var t0=performance.now();palette=extract(pixels,k);window.__tsukiMs=performance.now()-t0;render();if(palette.length<k)toast("この画像には "+palette.length+" 色しかなかったよ")}finally{TsukiLoader.hide()}},30)}
function load(file){$("toast").textContent="";if(!file||!/^image\//.test(file.type)){toast("画像ファイルを選んでね");return}
 TsukiLoader.show({caption:"読み込み中…",size:3});var url=URL.createObjectURL(file),img=new Image();
 img.onload=function(){srcImg=img;var p=$("preview");p.src=url;p.hidden=false;$("dropText").hidden=true;pixels=sample(img);TsukiLoader.hide();
  if(!pixels.length){toast("透明な画像みたい");return}run()};
 img.onerror=function(){TsukiLoader.hide();URL.revokeObjectURL(url);toast("この画像は開けなかった…（HEIC などはブラウザによって読めないことがあるよ。PNG か JPEG に変換してみてね）")};img.src=url}
function dl(name,blob){var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},1000)}
$("file").onchange=function(e){load(e.target.files[0])};
var dr=$("drop");dr.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();$("file").click()}});
["dragenter","dragover"].forEach(function(t){dr.addEventListener(t,function(e){e.preventDefault();dr.classList.add("over")})});
["dragleave","drop"].forEach(function(t){dr.addEventListener(t,function(e){e.preventDefault();dr.classList.remove("over")})});
dr.addEventListener("drop",function(e){load(e.dataTransfer.files[0])});
document.addEventListener("paste",function(e){var it=[].slice.call(e.clipboardData.items||[]).find(function(i){return i.type.indexOf("image/")===0});if(it)load(it.getAsFile());else toast("貼り付けられたのは画像じゃないみたい。画像をコピーしてからもう一度試してね")});
var deb;$("count").oninput=function(){$("countVal").textContent=this.value;clearTimeout(deb);deb=setTimeout(run,120)};
$("exPng").onclick=function(){var W=120,c=document.createElement("canvas");c.width=W*palette.length;c.height=W;var x=c.getContext("2d");
 palette.forEach(function(p,i){x.fillStyle=hex(p.rgb);x.fillRect(i*W,0,W,W)});c.toBlob(function(b){dl("palette.png",b)})};
$("exTxt").onclick=function(){dl("palette.txt",new Blob([palette.map(function(p){return hex(p.rgb)}).join("\n")+"\n"],{type:"text/plain"}))};
$("exCss").onclick=function(){dl("palette.css",new Blob([":root {\n"+palette.map(function(p,i){return"  --tsuki-color-"+(i+1)+": "+hex(p.rgb)+";"}).join("\n")+"\n}\n"],{type:"text/css"}))};
window.__tsukiLab=toLab;window.__tsukiPalette=function(){return palette.map(function(p){return hex(p.rgb)})};
})();
