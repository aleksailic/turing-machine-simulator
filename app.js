let __size=100;
let __id="list";
let __defaults=[{key:'TM.interval',val:500},{key:'TM.alphabet',val:'b01'},{key:'TM.data',val:'b10101b'}];

String.prototype.forEach=function(callback){
    for(let i=0;i<this.length;i++){
        callback(this.charAt(i),i,this);
    }
};

let CONSOLE=new function(){
    /*
        Status codes:
        -1 ERROR
        0 NEUTRAL INFO
        1 JOB SUCCESS
    */
    let _id='console';
    this.print=function(msg,from,status,c){
        let html="<p>";
        if(c===undefined || c===null)
            c="#fff";
        if(from!==undefined)
            html+=from+':';
        if(status===undefined || status===null)
            status=0;

        let txt=msg.replace(/%(.+)%/,`<span style="color:${c};">`+'$1'+"</span>");
        html+=txt;
        html+=`<span class="status" data-val="${status}"></span>`;
        html+='</p>';

        document.getElementById(_id).innerHTML+=html;
    };
}();

let DB=new function(){
    let engine=window;
    if (typeof(Storage) !== "undefined")
        engine=localStorage;
    let self=this;
    this.init=function(){
        __defaults.forEach(function(el){
            self.setDefault(el.key,el.val);
        });
    };
    this.get=function(elem){
        return engine[elem];
    };
    this.set=function(elem,val){
        engine[elem]=val;
    };
    this.setDefault=function(elem,val){
        if(this.get(elem)===undefined || this.get(elem)===null)
            this.set(elem,val);
    };
    this.erase=function(){engine.clear();};
};
let TM=new function(){
    this.offset=0;
    let list=null;
    let self=this;

    this.playing=false;
    this.paused=false;
    this.finished=true;
    this.current=0;

    this.clock=null;

    this.init=function(){
            CONSOLE.print("%initializing%...","TM",0,'green');

            self.offset=1; //uvek kreni od prvog elementa
            self.alphabet=DB.get('TM.alphabet');
            self.data=DB.get('TM.data');
            self.interval=DB.get('TM.interval');

            let html="";
            self.data.forEach((el)=>{
                console.log(el);
                html+=`<li class="elem">${el}</li>`;
            });
            list=document.getElementById(__id);
            list.innerHTML=html;
            list.style.transitionDuration=self.interval+'ms';

            self.load();
            self.update();
    };
    this.load=function(p){ //Ucitaj program
        if(p===undefined)
            p=DB.get("TM.program");

        try{
            self.program=PARSER.parse(p);
        }catch(e){
            console.log(e.msg);
            return -1;
        }

        UI.STEPS.init();
        console.log(self.program);
    };
    this.pause=function(){
        self.paused=true;
        clearInterval(self.clock);
    };
    this.start=function(){
        if(self.program === undefined) throw {msg:'program not set!'};
        self.playing=true;
        self.finished=false;

        if(!self.paused){ //start new
            self.current=0;
            self.offset=1;
        }else{ //resume
            self.paused=false;
        }
        self.clock=setInterval(function(){
            let tm_el=list.getElementsByTagName('li')[self.offset];
            let val=tm_el.innerHTML;

            let state = self.program[self.current].data[val];
            self.offset+=parseInt(state.move);
            self.current=state.next_id;
            tm_el.innerHTML=state.out;

            TM.update();
            console.log(self.current);
            if(self.current==="+" || self.current==="-")
                self.stop();

            UI.update();
        },self.interval);
    };
    this.stop=function(code){
        self.finished=true;
        self.playing=false;
        clearInterval(self.clock);
    };
    this.update=function(){
        self.interval=DB.get('TM.interval'); //interval can be dynamic
        list.style.transitionDuration=self.interval+'ms';

        list.style.transform='translate('+(-this.offset*__size)+'px,0)';
        list.style.marginLeft=window.innerWidth/2-__size/2-10+'px';
    };
};

let PARSER=new function(){
    let self=this;
    this.init=function(){

    };
    this.parse=function(txt){
        if(txt===undefined) throw {msg:'nothing to parse.'};
        txt=txt.replace(/\s/g, ''); //ukloni whitespace
        let S = DB.get("TM.alphabet");

        let line="";
        let txtArr=[];
        txt.forEach((c)=>{
            if(line!=="" && c==='f'){
                txtArr.push(line);
                line="";
            }
            line+=c;
        });
        txtArr.push(line);

        let S_str=S.toString().replace(/[,]/g,""); //pretvori u string ali ukloni zareze
        let exp_str="f\\(q(\\d+),(["+S_str+"])\\)=\\(q(\\d+|[-+]).(["+S_str+"]),([+-])1\\)";
        let exp=new RegExp(exp_str,"");


        //some tests
        if(txtArr.length % S.length !== 0 ) throw {msg:'instruction_mismatch!'};
        let prev_id=null;

        let State=function(id,program){
            this.id=id;
            this.data=program;
        };
        let buffer={};
        let program=[];
        let i=0;
        while(i<txtArr.length){
            let match=exp.exec(txtArr[i]);
            if(!match)throw {msg:'syntax_error!'};

            let id=match[1];
            buffer[match[2]]={
                next_id:match[3],
                out:match[4],
                move:match[5]=='+' ? 1 : -1,
                txt:match[0]
            };
            i++;
            if(i%S.length === 0){  //stavljamo instrukcije u unificiran objekat
                program.push(new State(prev_id,buffer));
                buffer={};
            }
            else if(i%S.length===1 && id==prev_id && prev_id!=null)
                throw {msg:'instruction_mismatch!'};
            prev_id = id;
        }
        return program;
    };
};

let UI=new function(){
    let self=this;
    let btn_ids={
        'LOAD':"load_btn",
        'START':"start_btn",
        'STOP':'stop_btn',
        'MODAL_SUBMIT':'load_submit_btn'
    };
    this.btns={};
    this.STEPS={
        id:null,//cannot init yet
        init:function(){
            if(!TM.program)return -1;
            let id = self.STEPS.id = document.getElementById("steps").getElementsByTagName("ul")[0];
            let html="";
            for(let i=0;i<TM.program.length;i++){
                let state=TM.program[i];

                let txt="";
                for(const prop in state.data)
                    txt+="<p>"+state.data[prop].txt;

                html+=`<li>${i}<div class="desc">${txt}</div></li>`;
            }

            id.innerHTML=html;
            self.slideDown(id);
        },
        update:function() {
            let states=self.STEPS.id.getElementsByTagName("li");
            for(let i=0;i<states.length;i++){
                if(TM.current==="+" || TM.current==="-")
                    console.log("hihi");
                else if(i===TM.current)
                    states[i].classList.add('active');
                else
                    states[i].classList.remove('active');
            }
        }
    };

    this.init=function(){
        for(const prop in btn_ids)
            self.btns[prop]=document.getElementById(btn_ids[prop]);

        let els = document.getElementsByClassName("arr");
        Array.prototype.forEach.call(els, function(el) {
            el.addEventListener("click",function(){
                if (el.className.includes("arr-l"))
                    TM.offset--;
                else TM.offset++;
                TM.update();
                console.log(TM.offset);
            });
        });

        let modal=(function(){
            let id=document.getElementsByClassName("modal")[0];
            let span = document.getElementsByClassName("close")[0];
            document.getElementById('program_txt').value=DB.get("TM.program");

            self.btns['LOAD'].addEventListener("click",function(){// When the user clicks on the button, open the modal
                id.style.display = "block";
            });
            span.onclick = function() { // When the user clicks on <span> (x), close the modal
                id.style.display = "none";
            };
            window.onclick = function(event) {
                if (event.target === id) {
                    id.style.display = "none";
                }
            };
            return id;
        })();

        let parser=(function(){
            let btn=self.btns['MODAL_SUBMIT'];
            let textbox_id='program_txt';
            btn.addEventListener("click",()=> {
                let txt=document.getElementById(textbox_id).value;
                DB.set('TM.program',txt);
                TM.load(txt);
            });
        })();

        let console=(function(){
            document.getElementById('console').getElementsByTagName('header')[0].addEventListener("click",function(){
                this.parentNode.classList.toggle('show');
            });
        })();

        self.control = new dat.GUI();

        let bind=function(controllers){
            controllers.forEach(function(controller){
                controller.onFinishChange((value)=>{
                    DB.set('TM.'+controller.property,value);
                    TM.update();
                });
            });
        };

        let TMf=self.control.addFolder('Turing Machine');
        bind([
            TMf.add(TM, 'alphabet'),
            TMf.add(TM, 'interval', -5, 5),
            TMf.add(TM, 'data')
        ]);
        TMf.add(TM,'init');


        self.btns["START"].addEventListener("click",function(){
            console.log(this.dataset['func']);
            if(this.dataset['func']=='start'){
                TM.start();
                this.dataset['func']='pause';
            }else if(this.dataset['func']=='pause') {
                TM.pause();
                this.dataset['func']='start';
            }
            else
                throw {msg:'Unknown data func'};

            this.innerHTML=this.dataset['func'];
        });
        self.btns["STOP"].addEventListener("click",TM.stop);

        self.STEPS.init();
    };

    this.update=function(){
        self.STEPS.update();
        if(TM.finished){
            self.btns["START"].dataset['func']='start';
            self.btns["START"].innerHTML='start';
        }
    };

    let once=function(seconds, callback) {
        let counter = 0;
        let time = window.setInterval( function () {
            counter++;
            if ( counter >= seconds ) {
                callback();
                window.clearInterval( time );
            }
        }, 400 );
    };
    this.slideDown=function(elem) {
        elem.style.maxHeight = '1000px';
        // We're using a timer to set opacity = 0 because setting max-height = 0 doesn't (completely) hide the element.
        elem.style.opacity   = '1';
    };
    this.slideUp=function(elem) {
        elem.style.maxHeight = '0';
        once( 1, function () {
            elem.style.opacity = '0';
        });
    };
};

let TOAST=new function(){
    this.push=function(txt){
        alert(txt);
    };
};

window.addEventListener("load",function(){
    DB.init();
    TM.init();
    PARSER.init();
    UI.init();
    window.addEventListener("resize",TM.update);
});