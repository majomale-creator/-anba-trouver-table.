let PEOPLE=[];

function parseCSV(text){
  text=text.replace(/^\uFEFF/,"");
  const lines=text.split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2) return [];
  const sep=lines[0].includes(";")?";":",";
  function row(line){
    const a=[]; let s="",q=false;
    for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(ch===sep&&!q){a.push(s);s="";}else s+=ch;}a.push(s);return a;
  }
  const h=row(lines[0]).map(x=>x.trim().toUpperCase());
  const ni=h.indexOf("NOM"),pi=h.indexOf("PRENOM"),ti=h.indexOf("TABLE");
  return lines.slice(1).map(row).filter(r=>r[ni]||r[pi]).map(r=>({nom:(r[ni]||"").trim(),prenom:(r[pi]||"").trim(),table:(r[ti]||"").trim()}));
}

async function loadPeople(){
  const status=document.querySelector("#status"), mic=document.querySelector("#mic"), q=document.querySelector("#q");
  try{
    const r=await fetch("./invites.csv?v="+Date.now(),{cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    PEOPLE=parseCSV(await r.text());
    if(!PEOPLE.length) throw new Error("liste vide");
    document.querySelector("#count").textContent=PEOPLE.length+" invités chargés";
    initApp();
  }catch(e){
    status.textContent="Impossible de charger invites.csv. Vérifiez Internet puis rechargez la page.";
    mic.disabled=true; q.disabled=true;
    document.querySelector("#count").textContent="Liste non chargée";
  }
}

function initApp(){
function norm(s){return(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim()}
PEOPLE.forEach(p=>{p.full=(p.prenom+" "+p.nom).trim();p.key=norm(p.full);p.nkey=norm(p.nom);p.pkey=norm(p.prenom)});
function lev(a,b){let d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]!=b[j-1]));return d[a.length][b.length]}

// Clé phonétique légère : elle ne remplace jamais les correspondances exactes.
// Elle sert uniquement de filet de sécurité quand Safari écrit un nom comme il l'entend
// (lettres doublées, ph/f, qu/k, y/i, etc.).
function phon(s){
  return norm(s).split(" ").filter(Boolean).map(w=>w
    .replace(/eaux|aux/g,"o").replace(/eau/g,"o")
    .replace(/ph/g,"f").replace(/th/g,"t").replace(/rh/g,"r")
    .replace(/qu|ck|ch/g,"k").replace(/c(?=[aou])/g,"k").replace(/c(?=[ei])/g,"s")
    .replace(/gu(?=[ei])/g,"g").replace(/g(?=[ei])/g,"j")
    .replace(/y/g,"i").replace(/ou/g,"u")
    .replace(/([a-z])\1+/g,"$1")
    .replace(/h/g,"")
  ).join(" ");
}
function sim(a,b){if(!a||!b)return 0;return 1-lev(a,b)/Math.max(a.length,b.length)}
function score(t,p){
  t=norm(t).replace(/\b(monsieur|madame|mr|mme|mister|mrs|miss)\b/g,"").trim();if(!t)return 0;
  let best=0;
  for(const k of[p.key,p.nkey,p.pkey]){
    if(!k)continue;
    if(k===t)best=Math.max(best,1);
    if(k.includes(t)||t.includes(k))best=Math.max(best,.94);
    best=Math.max(best,sim(t,k));
    const ps=sim(phon(t),phon(k));
    // La phonétique reste volontairement plafonnée : elle aide à classer,
    // mais ne doit pas écraser une bonne correspondance orthographique.
    if(ps>=.72) best=Math.max(best,Math.min(.90,.58+.36*ps));
  }
  let z=t.split(" ").filter(x=>x.length>1);if(z.length&&z.every(x=>p.key.includes(x)))best=Math.max(best,.97);
  return best
}
function rank(t){return PEOPLE.map(p=>({p,s:score(t,p)})).sort((a,b)=>b.s-a.s)}
const q=document.querySelector("#q"),c=document.querySelector("#cands"),res=document.querySelector("#result");
function announceTable(table){
  try{
    if(!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance("Table numéro "+table);
    u.lang="fr-FR";
    speechSynthesis.speak(u);
  }catch(e){}
}
function show(p){document.querySelector("#rname").textContent=p.full;document.querySelector("#rtable").textContent=p.table||"—";res.style.display="block";res.scrollIntoView({behavior:"smooth",block:"center"});if(p.table)announceTable(p.table)}
function choices(t,voice=false){c.innerHTML="";if(!norm(t))return;let r=rank(t),a=r[0],b=r[1];if(voice&&a&&a.s>=.82&&(!b||a.s-b.s>=.08)){show(a.p);return}r.slice(0,5).filter(x=>x.s>.35).forEach(x=>{let b=document.createElement("button");b.className="cand";b.textContent=x.p.full+" — table "+x.p.table;b.onclick=()=>show(x.p);c.appendChild(b)})}
q.oninput=e=>choices(e.target.value);
document.querySelector("#again").onclick=()=>{res.style.display="none";q.value="";c.innerHTML="";q.focus()};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition,mic=document.querySelector("#mic"),status=document.querySelector("#status"),heard=document.querySelector("#heard");
if(SR){let rec=new SR();
rec.lang="fr-FR";
rec.interimResults=false;
rec.maxAlternatives=10;

// Test de contextual biasing : uniquement si Safari expose réellement cette API.
// Sinon, rien n'est modifié dans le fonctionnement du micro.
try {
  const Phrase = window.SpeechRecognitionPhrase || window.webkitSpeechRecognitionPhrase;
  if (Phrase && ("phrases" in rec)) {
    const noms = [...new Set(PEOPLE.map(p => p.nom).filter(Boolean))];
    rec.phrases = noms.map(n => new Phrase(n, 10));
  }
} catch (err) {
  console.log("Contextual biasing non disponible; reconnaissance normale conservée.", err);
}mic.onclick=()=>{try{rec.start()}catch(e){}};rec.onstart=()=>{mic.classList.add("on");mic.textContent="● J'ÉCOUTE…";status.textContent="Prononcez le nom.";heard.textContent=""};rec.onend=()=>{mic.classList.remove("on");mic.textContent="🎤 DIRE LE NOM"};rec.onerror=e=>status.textContent="Erreur micro : "+e.error;rec.onresult=e=>{
  let alts=[];
  for(let i=0;i<e.results[0].length;i++) alts.push(e.results[0][i].transcript);
  heard.textContent='Entendu : “'+alts[0]+'”';

  // Si Safari donne exactement une personne dans l'une de ses hypothèses,
  // cette personne gagne immédiatement.
  const ex=x=>norm(x).replace(/\\s+/g," ").trim();
  for(const t of alts){
    const h=ex(t);
    for(const p of PEOPLE){
      if(h===ex(p.nom+" "+p.prenom) || h===ex(p.prenom+" "+p.nom)){
        show(p); return;
      }
    }
  }

  // Si seul le nom est entendu et qu'il est unique dans la liste.
  for(const t of alts){
    const h=ex(t);
    const ms=PEOPLE.filter(p=>ex(p.nom)===h);
    if(ms.length===1){ show(ms[0]); return; }
  }

  // Sinon seulement : rapprochement approximatif.
  let all=[];
  alts.forEach(t=>rank(t).slice(0,3).forEach(x=>all.push({...x,text:t})));
  all.sort((a,b)=>b.s-a.s);
  if(all[0]){
    // Garde le meilleur score par personne sur TOUTES les hypothèses de Safari.
    const bestByPerson=new Map();
    for(const x of all){const old=bestByPerson.get(x.p);if(!old||x.s>old.s)bestByPerson.set(x.p,x)}
    const uniq=[...bestByPerson.values()].sort((a,b)=>b.s-a.s);
    const first=uniq[0], next=uniq[1];
    if(first&&first.s>=.82&&(!next||first.s-next.s>=.08)) show(first.p);
    else{
      c.innerHTML="";
      uniq.slice(0,5).filter(x=>x.s>.35).forEach(x=>{let b=document.createElement("button");b.className="cand";b.textContent=x.p.full+" — table "+x.p.table;b.onclick=()=>show(x.p);c.appendChild(b)});
    }
  }
}}
else{mic.disabled=true;mic.textContent="🎤 MICRO NON DISPONIBLE";status.textContent="Safari ne fournit pas ici l'interface de reconnaissance vocale. La recherche clavier reste disponible."}


}

loadPeople();
