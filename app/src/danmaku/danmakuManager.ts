/**
 * Created by yjh on 15/10/24.
 */
///<reference path='../player/Player.ts'/>
///<reference path='LayoutManager.ts'/>
///<reference path='Renderer.ts'/>
///<reference path='DanmakuItem.ts'/>
module Moe2 {
    export module Danmaku {


        export class DanmakuManager extends EventBase {
            p:number = window['devicePixelRatio'];
            drawSettings = {
                color: "ffffff",
                fontFamily: '"Simhei","Heiti","黑体","Microsoft Yahei",Arial,Helvetica,sans-serif',
                fontSize: 28,
                strokeColor: '#222222',
                strokeWidth: 2.8,
                pixelRatio: this.p,
                p: this.p,
                duration: 10,
                rowSpace: 4
            };

            width:number;
            height:number;

            renderer:Renderer;
            layoutManager:LayoutManager;

            canvas:HTMLCanvasElement;
            player:Player;

            isPlaying:boolean = false;

            private _visible:boolean = true;

            forceUpdate = true;

            networkManager=null;

            set visible(v:boolean) {
                this._visible = v;
                if (this._visible) {
                    this.canvas.style.display = null;
                } else {
                    this.canvas.style.display = 'none'
                }
            }
            get visible(){
                return this._visible
            }

            set opacity(v:number) {
                this.canvas.style.opacity = v.toString()
            }


            constructor(vid) {
                super();


                this.layoutManager = new LayoutManager(this);
                if(vid){
                    //this.networkManager=new NetworkManager(vid,this)
                }
            }

            init(player) {

                this.player=player;
                this.player.addEventListener(PlayerEvent.play, this.play.bind(this));
                this.player.addEventListener(PlayerEvent.pause, this.pause.bind(this));
                this.player.addEventListener(PlayerEvent.buffer,this.pause.bind(this));
                this.player.addEventListener(PlayerEvent.seeked, this.seek.bind(this));
                this.player.addEventListener(PlayerEvent.seeking, this.seeking.bind(this));
                this.player.addEventListener(PlayerEvent.resize, this.resize.bind(this));
                PlayerEventBus.addEventListener('sendDanmaku', this.sendDanmaku.bind(this));
                PlayerEventBus.addEventListener('setDanmakuVisible', function (visible:boolean) {
                    this.visible = visible
                });
                PlayerEventBus.addEventListener('setDanmakuOpacity', function (opacity:boolean) {
                    this.opacity = opacity
                });
                this.canvas = document.createElement('canvas');
                if(this.player.use3D==true&&supportWebGL()){
                    this.renderer = new WebglRender(this);
                }else{
                    this.renderer=new Canvas2DRender(this);
                }
                this.renderer.enableVR=this.player.useVR;
                //this.renderer = new WebglRender(this);
                //this.renderer.enableVR=true;
                this.renderer.init(this.canvas);
                this.update()
            }
            loadDanmaku(src:string,type='bilibili'){
                var x=new XMLHttpRequest();
                x.open('GET',src);
                x.onload= function () {
                    let list;
                    if(type='bilibili'){
                        list=Moe2.Danmaku.DMKParser.parseBilibili(x.responseText);
                    }else if(type='acfun'){
                        list=Moe2.Danmaku.DMKParser.parseAcfun(JSON.parse(x.responseText))
                    }

                    this.setInitialDanmakuList(list)
                }.bind(this);
                x.send();
            }

            set useVR(v){
                this.renderer.enableVR=v
            }

            resize() {
                this.width = this.canvas.offsetWidth;
                this.height = this.canvas.offsetHeight;
                if (this.layoutManager) {
                    this.layoutManager.resize(this.width, this.height)
                }
                if (this.renderer) {
                    this.renderer.resize(this.width, this.height)
                }
            }


            update() {
                requestAnimationFrame(this.update.bind(this));
                if (!this.isPlaying) {
                    this.renderer.update(true);
                    return
                }
                if (!((this.isPlaying = this.player.isPlaying) || this.forceUpdate)) {
                    return
                }
                this.forceUpdate = false;
                this.layoutManager.update();
                if (this._visible) {
                    this.renderer.update()
                }
            }


            play() {
                if (this.isPlaying) {
                    return;
                }
                //console.log('play');
                this.isPlaying = true;
                this.layoutManager.start();
                //this.update();
            }

            pause() {
                //console.log('pause');
                this.isPlaying = false;
                //this.layoutManager.pause();
            }

            seeking(time) {
                this.isPlaying = false;
                this.layoutManager.seeking(time);
                this.forceUpdate = true;
                //this.renderer.update();
            }

            seek() {
                this.layoutManager.seek(this.player.currentTime);
                this.isPlaying = this.player.isPlaying;
                this.forceUpdate = true;
                //this.update();
            }

            sendDanmaku(content:DanmakuItem) {
                this.layoutManager.insert(content);
                if(this.networkManager){
                    this.networkManager.send(content);
                }
            }

            setInitialDanmakuList(list:Array<DanmakuItem>) {
                for(var i=0,il=list.length;i<il;i++){
                    list[i].danmakuManager=this
                }
                this.layoutManager.loadDanmakuList(list)
            }

        }


        export class NetworkManager extends EventBase{
            dmkManager=null;
            socket;
            vid;
                constructor(vid,dmkmanager){
                    super();
                    this.vid=vid;
                    this.dmkManager=dmkmanager;
                    this.socket=window['io'].connect('/');
                    this.socket.emit('subscribe',{'room':this.vid});
                    this.socket.on('newdmk',function(item){
                        this.dmkManager.layoutManager.insert(new DanmakuItem(this.dmkManager,item['content'],item['time'],item['type'],'#'+item['color'].toString('16'),item.fontSize))
                    }.bind(this))

                }
            send(dmk){
                var newdmk={};
                newdmk['vid']=this.vid;
                newdmk['contnet']=dmk.content;
                newdmk['time']=dmk.time;
                newdmk['color']=dmk.color;
                newdmk['fontSize']=dmk.fontSize;
                newdmk['type']=dmk.type;
                this.socket.emit('senddmk',newdmk)
            }
        }

        export class DMKParser {
            static parseBilibili(xmlString:string) {
                var doc = (new DOMParser()).parseFromString(xmlString, "text/xml");
                var dlist = doc.getElementsByTagName('d');
                var result:Array<DanmakuItem> = [];
                for (var i = 0, il = dlist.length; i < il; i++) {
                    try{
                        var p = dlist[i].attributes['p'].nodeValue;
                        var content = dlist[i].childNodes[0]['data'].trim();
                        var plist = p.split(',');
                        var time =parseFloat(plist[0]);
                        var type:DanmakuType;
                        switch (parseInt(plist[1])) {
                            case 1:
                            {
                                type = DanmakuType.NORMAL;
                                break;
                            }
                            case 4:
                            {
                                type = DanmakuType.BOTTOM;
                                break
                            }
                            case 5:
                            {
                                type = DanmakuType.TOP;
                                break
                            }
                            default :{
                                continue
                            }
                        }
                        var fontSize=parseInt(plist[2]);
                        var color='#'+parseInt(plist[3]).toString(16);
                        var dmk = new DanmakuItem(null,content,time,type,color,fontSize);
                        result.push(dmk);
                    }catch(e){

                    }

                }
                return result
            }
            static parseAcfun(list:Array<any>){
                var result:Array<DanmakuItem>=[];
                for (var i=0;i<list.length;i++){
                    var sublist=list[i];
                    for (var j=0;j<sublist.length;j++){
                        try{
                            var item=sublist[j];
                            var p=item['c'];
                            var content=item['m'];
                            var plist = p.split(',');
                            var time =parseFloat(plist[0]);
                            var type:DanmakuType;
                            switch (parseInt(plist[2])) {
                                case 1:
                                {
                                    type = DanmakuType.NORMAL;
                                    break;
                                }
                                case 4:
                                {
                                    type = DanmakuType.BOTTOM;
                                    break
                                }
                                case 5:
                                {
                                    type = DanmakuType.TOP;
                                    break
                                }
                                default :{
                                    continue
                                }
                            }
                            var fontSize=parseInt(plist[3]);
                            var color='#'+parseInt(plist[1]).toString(16);
                            var dmk = new DanmakuItem(null,content,time,type,color,fontSize);
                            result.push(dmk);
                        }catch(e){

                        }
                    }
                }
                return result
            }
            static parse(content,type):any{
                switch (type){
                    case 'ac':{
                       return DMKParser.parseAcfun(content)
                    }
                    case 'bi':{
                        return DMKParser.parseBilibili(content)
                    }
                }
            }
        }
    }
}


