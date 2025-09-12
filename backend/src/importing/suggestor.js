// src/importing/suggestor.js
import { isKnownPokemon } from "../services/pokedex.js";
import { hintForNames } from "../services/deckHints.js";

const TRAINER_WHITELIST = new Set([
  "Arven","Sada","Turo","Penny","Clavell","Giacomo","Iono","Grusha","Brassius","Ryme",
  "Mela","Katy","Larry","Tulip","Hassel","Rika","Poppy","Kofu","Nemona","Geeta"
]);

function stripDiacritics(s=""){ return s.normalize("NFKD").replace(/[\u0300-\u036f]/g,""); }
function titleCaseFromSlug(slug=""){ return String(slug).split("-").map(w=>w? w[0].toUpperCase()+w.slice(1):w).join(" "); }
function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function slugifyPokemon(name=""){
  let s = stripDiacritics(String(name||""))
    .replace(/\b(ex|in the active spot)\b/gi," ")
    .replace(/[.,!?]/g," ")
    .replace(/\s+/g," ")
    .trim();
  s = s.replace(/^[A-Za-z][A-Za-z\-]+['’]s\s+/, "");
  s = s.split(" ").slice(0,3).join(" ").toLowerCase();
  s = s.replace(/['’]/g,"").replace(/\s+/g,"-");
  return s;
}

function preprocess(rawLog="", youName="", oppName=""){
  const youRe = new RegExp("^\\s*"+escapeRe(youName)+"\\b","i");
  const oppRe = new RegExp("^\\s*"+escapeRe(oppName)+"\\b","i");
  const rows = String(rawLog||"").replace(/\r/g,"").split(/\n+/);
  return rows.map(r=>{
    const norm = String(r||"").replace(/^\s*(?:[-•>]\s*)+/, "").trim();
    const side = youRe.test(norm) ? "you" : (oppRe.test(norm) ? "opp" : null);
    return { raw:r, norm, side };
  });
}

function classifyUsed(pre, idx){
  const who = pre[idx]?.side;
  let attack=false, ability=false, totalDamage=0;
  for(let j=idx+1;j<Math.min(pre.length, idx+6);j++){
    if(pre[j]?.side!==who) break;
    const ln = pre[j].norm;
    if (/drew\b/i.test(ln)) ability = true;
    if (/discard pile|knocked out|damage|for\s+\d+\s+damage/i.test(ln)) attack = true;
    const m = ln.match(/\bfor\s+(\d+)\s+damage\b|\bdeals?\s+(\d+)\s+damage\b|\bdealt\s+(\d+)\s+damage\b/i);
    if (m) totalDamage += parseInt(m[1]||m[2]||m[3]||"0",10);
  }
  if(!attack && !ability) attack = true;
  return { isAttack: attack, isAbility: ability, damage: totalDamage };
}

function ensure(map, slug){
  if(!slug) return null;
  if(!map[slug]) map[slug] = { attacks:0, firstSeenOrder:null, totalDamage:0, ability:0, active:0, evolveTo:0 };
  return map[slug];
}

function computeFromRaw(rawLog, youName="", oppName=""){
  const pre = preprocess(rawLog, youName, oppName);
  const sides = { you:{}, opp:{} };
  const firstIndex = { you:0, opp:0 };
  for(let i=0;i<pre.length;i++){
    const row = pre[i]; const ln=row.norm; const who=row.side;
    if(!ln || !who) continue;
    let m = ln.match(/^[A-Za-zÀ-ÿ0-9'’\- ]+['’]s\s+([A-Za-z0-9 .\-’']+?)\s+used\b/i);
    if(m){
      const slug = slugifyPokemon(m[1]);
      const st = ensure(sides[who], slug); if(!st) continue;
      const cls = classifyUsed(pre,i);
      if(cls.isAttack){ st.attacks++; st.totalDamage += cls.damage||0; if(st.firstSeenOrder==null){ st.firstSeenOrder = firstIndex[who]++; } }
      else if(cls.isAbility){ st.ability++; }
      continue;
    }
    m = ln.match(/['’]s\s+([A-Za-z0-9 .\-’']+?)\s+is now in the Active Spot/i);
    if(m){ const st = ensure(sides[who], slugifyPokemon(m[1])); if(st) st.active++; continue; }
    m = ln.match(/\bevolved\s+([A-Za-z0-9 .\-’']+?)\s+(?:to|into)\s+([A-Za-z0-9 .\-’']+)/i);
    if(m){ const st = ensure(sides[who], slugifyPokemon(m[2])); if(st) st.evolveTo++; continue; }
  }
  function rankTwo(map){
    const arr = Object.entries(map);
    arr.sort((a,b)=>{
      const A=a[1], B=b[1];
      if (B.attacks!==A.attacks) return B.attacks-A.attacks;
      const fa=(A.firstSeenOrder==null?1e9:A.firstSeenOrder), fb=(B.firstSeenOrder==null?1e9:B.firstSeenOrder);
      if (fa!==fb) return fa-fb;
      if (B.totalDamage!==A.totalDamage) return B.totalDamage-A.totalDamage;
      if (B.ability!==A.ability) return B.ability-A.ability;
      if (B.active!==A.active) return B.active-A.active;
      if (B.evolveTo!==A.evolveTo) return B.evolveTo-A.evolveTo;
      return 0;
    });
    return arr.slice(0,2).map(([slug])=>slug);
  }
  return { youTop: rankTwo(sides.you), oppTop: rankTwo(sides.opp), pre };
}

function detectTrainerForTop(pre, side, topSlug){
  if(!topSlug) return null;
  const nameWord = titleCaseFromSlug(topSlug).split(" ")[0];
  const pat = new RegExp("([A-Z][A-Za-z]+)['’]s\\s+"+escapeRe(nameWord), "i");
  for(const row of pre){
    if(row.side!==side) continue;
    const m = row.norm.match(pat);
    if(m){
      const trainerName = m[1];
      if(TRAINER_WHITELIST.has(trainerName)) return `${trainerName}'s`;
    }
  }
  return null;
}

export async function suggestFromParsed(parsed, rawLog){
  const you = parsed?.players?.player || "";
  const opp = parsed?.players?.opponent || "";
  const { youTop, oppTop, pre } = computeFromRaw(rawLog||"", you, opp);

  async function keep(slugs){
    const out=[]; for(const s of slugs){ if(!s) continue; try{ const ok=await isKnownPokemon(s); out.push(ok?s:s);}catch(_){out.push(s);} } return out;
  }
  const playerPokemons = await keep(youTop);
  const opponentPokemons = await keep(oppTop);

  function deckFrom(arr, side){
    if(!arr?.length) return null;
    const hint = hintForNames(arr);
    if(hint?.deckName){ return hint.deckName.split("-").map(w=>w? w[0].toUpperCase()+w.slice(1):w).join(" "); }
    const trainer = detectTrainerForTop(pre, side, arr[0]);
    const label = [titleCaseFromSlug(arr[0]||""), titleCaseFromSlug(arr[1]||"")].filter(Boolean).join(" / ");
    return trainer ? `${trainer} ${label}` : (label || null);
  }

  const playerDeckName = deckFrom(playerPokemons, "you");
  const opponentDeckName = deckFrom(opponentPokemons, "opp");

  return { playerPokemons, opponentPokemons, playerDeckName, opponentDeckName };
}
