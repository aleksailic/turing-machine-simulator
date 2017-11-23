let __defaults=[{key:'TM.interval',val:500},{key:'TM.alphabet',val:'b01'},{key:'TM.data',val:'b10101b'}];
let __size=100;
let __id="list";
String.prototype.forEach=function(callback){
    for(let i=0;i<this.length;i++){
        callback(this.charAt(i),i,this);
    }
};
/*
Sistem za uvid u rad programa, UI delovi u sastavu objekta jer je nezavisan entitet
Status codes:
   -1 ERROR
    0 GENERAL INFO
    1 JOB SUCCESS
*/
let CONSOLE=new function(){
    let _id='input';
    let c={'-1':'red','0':'orange','1':'green'};
    this.print=function(msg,from,status,debug){
        let html="";
        if(debug!==undefined)
            html+='<p class="debug">';
        else
            html+="<p>";
        if(from!==undefined)
            html+=from+': ';
        if(status===undefined || status===null)
            status=0;

        let date = new Date();
        let timestamp = '['+date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds()+']';

        html+=msg.replace(/%(.+)%/,`<span style="color:${c[status]};">`+'$1'+"</span>");
        html+=`<span class="timestamp">${timestamp}</span>`;
        html+='</p>';

        document.getElementById(_id).innerHTML+=html;
        document.getElementById('signal').style.color=c[status];
    };

    //Sredjuje prikazivanje konzole na klik
    this.init=function(){
        document.getElementById('console').getElementsByTagName('header')[0].addEventListener("click",function(){
            this.parentNode.classList.toggle('show');
            document.getElementById('signal').style.color='inherit';
        });
    };
}();
//Sistem za dugorocno cuvanje informacija
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

    this.paused=false;
    this.finished=true;
    this.current=0;

    this.clock=null;

    this.init=function(){
        self.offset=1; //uvek kreni od prvog elementa
        self.alphabet=DB.get('TM.alphabet');
        self.data=DB.get('TM.data');
        self.interval=DB.get('TM.interval');

        let html="";

        try{
            self.data.forEach((el)=>{
                if(!self.alphabet.includes(el))throw {msg:'Data not from alphabet'};
                html+=`<li class="elem">${el}</li>`;
            });
        }catch(e){
            CONSOLE.print(`%${e.msg}%`,"TM",-1);
        }

        list=document.getElementById(__id);
        list.innerHTML=html;
        list.style.transitionDuration=(self.interval-50)+'ms'; //Animacija mora biti za par stotinki brza da bi sve islo glatko

        self.load();
        self.update();
    };
    this.load=function(p){ //Ucitaj program
        if(p===undefined)
            p=DB.get("TM.program");

        try{
            self.program=PARSER.parse(p);
        }catch(e){
            CONSOLE.print(`%${e.msg}%`,"PARSER",-1);
            return -1;
        }

        UI.STEPS.init();
        CONSOLE.print("program %loaded%.","TM",1);
    };
    this.pause=function(){
        CONSOLE.print("paused","TM");
        self.paused=true;
        clearInterval(self.clock);
    };
    this.start=function(){
        CONSOLE.print("started","TM");
        if(self.program === undefined) throw {msg:'%program not set%!'};
        self.playing=true;
        self.finished=false;

        if(!self.paused){ //start new
            self.current=0;
            self.offset=1;
        }else{ //resume
            CONSOLE.print("resumed","TM");
            self.paused=false;
        }
        self.clock=setInterval(function(){
            let tm_el=list.getElementsByTagName('li')[self.offset];
            let val=tm_el.innerHTML;

            let state = self.program[self.current].data[val];
            self.offset+=parseInt(state.move);
            self.current=state.next_id;
            tm_el.innerHTML=state.out;

            if(self.current==="+")
                self.stop(1);
            else if(self.current==="-")
                self.stop(-1);

            TM.update();
            UI.update();
        },self.interval);
    };
    this.stop=function(code){
        CONSOLE.print("%stopped%","TM",code);
        self.finished=true;
        self.playing=false;
        clearInterval(self.clock);
    };
    this.update=function(){
        //Ovo bi trebalo biti deo UI komponente, ali ostavicu ovde kako bi TM modul bio kompletan
        //Podesi traku u zavisnosti od offseta i centriraj
        let margin=window.innerWidth/2-__size/2-10;
        list.style.transform='translate('+(-TM.offset*__size)+'px,0)';
        list.style.marginLeft=margin+'px';
    };
};

//Ovo je moglo biti u sastavu TM, ali posto je nezavisan entitet ovako je preglednije
let PARSER=new function(){
    this.parse=function(txt){
        if(txt===undefined) throw {msg:'Nothing to parse'};
        txt=txt.replace(/\s/g, ''); //ukloni whitespace
        let S = DB.get("TM.alphabet");


        //Rabijam tekst u niz zarad lakse manipulacije
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

        //Magija regexpa!
        let S_str=S.toString().replace(/[,]/g,""); //pretvori u string ali ukloni zareze
        let exp_str="f\\(q(\\d+),(["+S_str+"])\\)=\\(q(\\d+|[-+]).(["+S_str+"]),([+-])1\\)";
        let exp=new RegExp(exp_str,"");

        //Proveravamo da li uneti kod ima neke lako uocljive greske
        if(txtArr.length % S.length !== 0 ) throw {msg:'Instruction number mismatch'};

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
            if(!match)throw {msg:'Syntax error!'};
            if(buffer.hasOwnProperty(match[2]))throw {msg:'Syntax error. Same char different instructions'};

            let id=match[1];
            buffer[match[2]]={
                next_id:match[3],
                out:match[4],
                move:match[5]==='+' ? 1 : -1,
                txt:match[0]
            };
            i++;
            if(i%S.length === 0){  //stavljamo instrukcije u unificiran objekat
                program.push(new State(prev_id,buffer));
                buffer={};
            }
            else if(i%S.length===1 && id===prev_id && prev_id!==null) //broj instrukcija po stanju mora biti kompletan tj. jednak alfabetu
                throw {msg:'Instruction number mismatch'};
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
        id:null,//ne moze se dodeliti vrednost pre inita
        init:function(){
            if(!TM.program)return -1; //Ne valja nam posao vizuelizacije koraka ukoliko program ne postoji
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
                else if(i===parseInt(TM.current))
                    states[i].classList.add('active');
                else
                    states[i].classList.remove('active');
            }
        }
    };

    this.init=function(){
        for(const prop in btn_ids) //Pronadji sve dugmice u DOM-u
            self.btns[prop]=document.getElementById(btn_ids[prop]);

        //Dodaj strelice za rucno pomeranje TM
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

        //Dodaj dogadjaje za pop-up prozor koji sluzi za ucitavanje programa
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

        //Dodaj dogadjaje vezane za UI Parsera
        let parser=(function(){
            let btn=self.btns['MODAL_SUBMIT'];
            let textbox_id='program_txt';
            btn.addEventListener("click",()=> {
                let txt=document.getElementById(textbox_id).value;
                DB.set('TM.program',txt);
                TM.load(txt);
            });
        })();

        //Koristim biblioteku dat.GUI kako bi korisniku omogucio lako manipulisanje parametrima TM a sebi smanjio posao pravljenja UI
        self.control = new dat.GUI();

        //Vezujem kontroler sa DB-om i TM-om
        let bind=function(controllers){
            controllers.forEach(function(controller){
                controller.onFinishChange((value)=>{
                    DB.set('TM.'+controller.property,value);
                    TM.update();
                });
            });
        };

        bind([
            self.control.add(TM, 'alphabet'),
            self.control.add(TM, 'interval', -5, 5),
            self.control.add(TM, 'data'),
            self.control.add(TM, 'offset').step(1).listen()

        ]);
        self.control.add(TM,'init')

        self.btns["START"].addEventListener("click",function(){
            if(this.dataset['func']==='start'){
                TM.start();
                this.dataset['func']='pause';
            }else if(this.dataset['func']==='pause') {
                TM.pause();
                this.dataset['func']='start';
            }
            else
                throw {msg:'Unknown data func'};

            this.innerHTML=this.dataset['func'];
        });
        self.btns["STOP"].addEventListener("click",()=>TM.stop(0));
        self.STEPS.init();
    };

    this.update=function(){
        self.STEPS.update(); //Azuriraj trenutni korak

        if(TM.finished){
            self.btns["START"].dataset['func']='start';
            self.btns["START"].innerHTML='start';
        }
    };

    //Zgodna animacija elemenata, ukoliko zatreba
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

window.addEventListener("load",function(){
    DB.init();
    TM.init();
    UI.init();
    CONSOLE.init();
    window.addEventListener("resize",TM.update);
});