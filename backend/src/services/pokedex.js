
// Pokedex service with Firestore-backed cache + PokeAPI fetch
import { db } from "../firestore.js";

const SEARCH_COLL = "cache_pokedexSearch";

function normalizeName(name=""){ return String(name).trim().toLowerCase(); }
function slugify(name=""){ return normalizeName(name).replace(/\s+/g,'-'); }
function titleCase(s=""){ return s.replace(/\b\w/g, c=>c.toUpperCase()); }

async function getDoc(ref){ const d = await ref.get(); return d.exists ? d.data() : null; }
async function setDoc(ref, data){ await ref.set(data, { merge: true }); return data; }

export async function getPokemonBySlug(slug){
  slug = slugify(slug);
  const doc = await db.collection("pokedex").doc(slug).get();
  if (doc.exists) return doc.data();
  const p = await fetchFromPokeApi(slug).catch(()=>null);
  if (!p) return null;
  await db.collection("pokedex").doc(slug).set(p, { merge: true });
  return p;
}

export async function searchPokemon(q){
  q = normalizeName(q);
  if (!q || q.length < 2) return [];
  const qHash = Buffer.from(q).toString('base64url');
  const cacheRef = db.collection(SEARCH_COLL).doc(qHash);
  const cached = await getDoc(cacheRef);
  const now = Date.now();
  if (cached && cached.expiresAt && cached.expiresAt > now) return cached.items || [];

  let items = [];
  // prefer existing pokedex docs
  const snap = await db.collection("pokedex").limit(2000).get();
  snap.forEach(d => {
    const { slug, name, imageUrl } = d.data();
    if (normalizeName(name).includes(q)) items.push({ slug, name, image: imageUrl });
  });

  if (items.length < 5){
    const list = await listFromPokeApi().catch(()=>[]);
    items = list.filter(p=>normalizeName(p.name).includes(q)).slice(0,20).map(p => ({ slug: slugify(p.name), name: titleCase(p.name), image: p.imageUrl }));
  }

  await setDoc(cacheRef, { q, items, expiresAt: now + 24*60*60*1000 });
  return items;
}

async function listFromPokeApi(){
  const url = "https://pokeapi.co/api/v2/pokemon?limit=2000";
  const r = await fetch(url);
  if (!r.ok) throw new Error("pokeapi list");
  const j = await r.json();
  return (j.results||[]).map(it => {
    const m = it.url.match(/\/pokemon\/(\d+)\/?$/);
    const id = m ? m[1] : null;
    const imageUrl = id ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` : null;
    return { name: it.name, imageUrl };
  });
}

async function fetchFromPokeApi(slug){
  const url = `https://pokeapi.co/api/v2/pokemon/${slug}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("pokeapi item");
  const j = await r.json();
  const id = j.id;
  const name = j.name;
  const imageUrl = j.sprites?.other?.['official-artwork']?.front_default || j.sprites?.front_default || null;
  return { slug, name: titleCase(name), imageUrl, id };
}


export async function isKnownPokemon(nameOrSlug){
  const name = String(nameOrSlug||"").trim();
  if (!name) return false;
  const slug = slugify(name);
  // 1) try by slug in pokedex collection
  const doc = await db.collection("pokedex").doc(slug).get();
  if (doc.exists) return true;
  // 2) try by name (case-insensitive) among cached docs
  const snap = await db.collection("pokedex").where("name","==", titleCase(name)).limit(1).get();
  if (!snap.empty) return true;
  // 3) fallback: fetch from PokeAPI to validate and cache
  const p = await fetchFromPokeApi(slug).catch(()=>null);
  if (!p) return false;
  await db.collection("pokedex").doc(slug).set(p, { merge: true });
  return true;
}
