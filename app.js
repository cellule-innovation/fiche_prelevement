// --- Initialisation carte ---
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: { 
      "esri-hybrid": { 
        type: "raster", 
        tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], 
        tileSize: 256, 
        attribution: "© Esri" 
      },
      "esri-labels": {
        type: "raster",
        tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "© Esri"
      }
    },
    layers: [
      { id:"satellite", type:"raster", source:"esri-hybrid", minzoom:0, maxzoom:22 },
      { id:"labels", type:"raster", source:"esri-labels", minzoom:0, maxzoom:22 }
    ]
  },
  center: [-1.68,48.11],
  zoom: 8,
  maxZoom: 18,
  preserveDrawingBuffer:true
});

// --- Variables ---
let selectedParcelleId = null;
let parcelles = { type: "FeatureCollection", features: [] };
let drawArrowMode = false;
let arrowStartPoint = null;
let samplingArrows = { type: "FeatureCollection", features: [] };
let samplingMode = false;
let samplingPoints = [];
let currentDrawnFeature = null;
let parcelleFormCallback = null;

// --- MapLibre Draw ---
const draw = new MapboxDraw({ displayControlsDefault:false, controls:{}, defaultMode:"simple_select" });
map.addControl(draw,"top-left");

// --- Fonctions liste/parcelle ---
function updateParcellesList() {
  const list = document.getElementById("parcelles-list");
  if(parcelles.features.length===0){
    list.innerHTML=`<div class="empty-state"><div class="empty-state-icon">🌾</div><p>Aucune parcelle pour le moment</p><p style="font-size:12px;margin-top:5px;">Cliquez sur "Dessiner" pour commencer</p></div>`;
    return;
  }
  list.innerHTML="";
  parcelles.features.forEach(f=>{
    const p=f.properties;
    const bioClass=`bio-${p.bio.toLowerCase()}`;
    const selected=p.id===selectedParcelleId?"selected":"";
    const card=document.createElement("div");
    card.className=`parcelle-card ${bioClass} ${selected}`;
    card.dataset.id=p.id;
    card.innerHTML=`
      <div class="parcelle-header">
        <span class="parcelle-id">${p.id}</span>
        <span class="parcelle-bio ${bioClass}">${p.bio}</span>
      </div>
      <div class="parcelle-culture">🌱 ${p.culture}</div>
      <div class="parcelle-operateur">
        <input type="checkbox" ${p.isOperateur?'checked':''} onclick="toggleOperateur('${p.id}',event)">
        <span>Parcelle de l'opérateur</span>
      </div>`;
    card.addEventListener("click",e=>{if(e.target.type!=='checkbox') selectParcelle(p.id);});
    list.appendChild(card);
  });
}

function updateButtonsDisplay(){
  const drawBtn=document.getElementById("draw-polygon");
  const modifyBtn=document.getElementById("modify-parcelle");
  const editInfoBtn=document.getElementById("edit-info");
  if(selectedParcelleId){ 
    drawBtn.style.display="none"; 
    modifyBtn.style.display="block"; 
    editInfoBtn.style.display="block";
  }
  else{ 
    drawBtn.style.display="block"; 
    modifyBtn.style.display="none"; 
    editInfoBtn.style.display="none";
  }
}

function selectParcelle(id){
  selectedParcelleId=id;
  // Filtrer la couche normale pour exclure la parcelle sélectionnée
  map.setFilter("parcelles-outline",["!=",["get","id"],id]);
  // Filtrer la couche sélectionnée pour n'afficher que la parcelle sélectionnée
  map.setFilter("parcelles-outline-selected",["==",["get","id"],id]);
  updateParcellesList();
  updateButtonsDisplay();
  const parcelle=parcelles.features.find(f=>f.properties.id===id);
  if(parcelle){
    const coords=parcelle.geometry.coordinates[0];
    const center=[coords.reduce((a,c)=>a+c[0],0)/coords.length, coords.reduce((a,c)=>a+c[1],0)/coords.length];
    map.flyTo({center, zoom:16, speed:1.2});
  }
  console.log("Parcelle sélectionnée:",id);
}

function toggleOperateur(id,event){
  event.stopPropagation();
  parcelles.features.forEach(f=>{if(f.properties.id===id) f.properties.isOperateur=event.target.checked;});
  map.getSource("parcelles")?.setData(parcelles);
  updateParcellesList();
  console.log(`Parcelle ${id} opérateur:`,event.target.checked);
}

window.toggleOperateur=toggleOperateur;

// --- Boutons dessin ---
document.getElementById("draw-polygon").addEventListener("click",()=>{ 
  draw.changeMode("draw_polygon"); 
  document.getElementById("draw-polygon").style.display="none"; 
  document.getElementById("cancel-draw").style.display="block"; 
  console.log("Mode dessin activé");
});

document.getElementById("cancel-draw").addEventListener("click",()=>{ 
  draw.changeMode("simple_select"); 
  document.getElementById("draw-polygon").style.display="block"; 
  document.getElementById("cancel-draw").style.display="none"; 
  updateButtonsDisplay(); 
  console.log("Mode dessin annulé");
});

// --- Bouton modifier les informations ---
document.getElementById("edit-info").addEventListener("click",()=>{
  if(!selectedParcelleId) return;
  const parcelle = parcelles.features.find(f=>f.properties.id===selectedParcelleId);
  if(!parcelle) return;
  
  // Ouvrir le formulaire avec les données actuelles
  const modal = document.getElementById("modal-parcelle");
  const form = document.getElementById("form-parcelle");
  
  document.getElementById("parcelle-id").value = parcelle.properties.id;
  document.getElementById("parcelle-bio").value = parcelle.properties.bio;
  document.getElementById("parcelle-culture").value = parcelle.properties.culture;
  
  modal.classList.add("active");
  
  // Gestion annulation
  document.getElementById("modal-cancel").onclick = () => {
    modal.classList.remove("active");
  };
  
  // Gestion soumission
  form.onsubmit = (e) => {
    e.preventDefault();
    
    const newId = document.getElementById("parcelle-id").value;
    const newBio = document.getElementById("parcelle-bio").value;
    const newCulture = document.getElementById("parcelle-culture").value;
    
    // Validation : vérifier que l'ID n'est pas juste "Ilot " sans numéro
    if (newId.trim() === "Ilot" || newId.trim() === "") {
      alert("⚠️ Veuillez renseigner un numéro d'ilot (ex: Ilot 1.1)");
      return;
    }
    
    // Mettre à jour les propriétés
    parcelle.properties.id = newId;
    parcelle.properties.bio = newBio;
    parcelle.properties.culture = newCulture;
    
    // Rafraîchir la carte et la liste
    map.getSource("parcelles")?.setData(parcelles);
    updateParcellesList();
    selectedParcelleId = parcelle.properties.id;
    updateButtonsDisplay();
    
    modal.classList.remove("active");
    console.log("Informations parcelle mises à jour:", parcelle.properties);
  };
});

// --- Bouton modifier parcelle ---
document.getElementById("modify-parcelle").addEventListener("click",()=>{
  if(!selectedParcelleId) return;
  const parcelle = parcelles.features.find(f=>f.properties.id===selectedParcelleId);
  if(!parcelle) return;
  
  // Supprimer toutes les features existantes dans Draw avant d'en ajouter une nouvelle
  draw.deleteAll();
  
  // Ajouter la géométrie à MapLibre Draw pour modification
  const drawId = draw.add(parcelle);
  draw.changeMode("direct_select", {featureId: drawId[0]});
  
  console.log("Mode modification activé pour:", selectedParcelleId);
});

// --- Bouton supprimer parcelle ---
document.getElementById("delete-parcelle").addEventListener("click",()=>{
  if(!selectedParcelleId) return;
  if(!confirm(`Voulez-vous vraiment supprimer la parcelle ${selectedParcelleId} ?`)) return;
  
  parcelles.features = parcelles.features.filter(f=>f.properties.id!==selectedParcelleId);
  map.getSource("parcelles")?.setData(parcelles);
  selectedParcelleId = null;
  updateParcellesList();
  updateButtonsDisplay();
  map.setFilter("parcelles-outline",["!=",["get","id"],""]);
  map.setFilter("parcelles-outline-selected",["==",["get","id"],""]);
  
  console.log("Parcelle supprimée");
});

// --- Écouter les modifications de géométrie ---
map.on("draw.update", e=>{
  const feature = e.features[0];
  const parcelleIndex = parcelles.features.findIndex(f=>f.properties.id===selectedParcelleId);
  if(parcelleIndex !== -1) {
    parcelles.features[parcelleIndex].geometry = feature.geometry;
    map.getSource("parcelles")?.setData(parcelles);
    draw.delete(feature.id);
    draw.changeMode("simple_select");
    console.log("Parcelle modifiée:", selectedParcelleId);
  }
});

// --- Carte chargée ---
map.on("load",()=>{
  map.addSource("parcelles",{type:"geojson", data:parcelles});
  map.addLayer({
    id:"parcelles-fill", 
    type:"fill", 
    source:"parcelles", 
    paint:{
      "fill-color":["case",
        ["==",["get","bio"],"OUI"],"#4CAF50",
        ["==",["get","bio"],"CONVERSION"],"#FF9800",
        "#F44336"
      ],
      "fill-opacity":0.5
    }
  });
  map.addLayer({
    id:"parcelles-outline", 
    type:"line", 
    source:"parcelles", 
    paint:{
      "line-color":["case",["boolean",["get","isOperateur"],false],"#00FF00","#FF0000"],
      "line-width":3
    }, 
    filter:["!=",["get","id"],selectedParcelleId || ""]
  });
  map.addLayer({
    id:"parcelles-outline-selected", 
    type:"line", 
    source:"parcelles", 
    paint:{
      "line-color":["case",["boolean",["get","isOperateur"],false],"#00FF00","#FF0000"],
      "line-width":6
    }, 
    filter:["==",["get","id"],""]
  });
  map.addLayer({
    id:"parcelles-label", 
    type:"symbol", 
    source:"parcelles", 
    layout:{
      "text-field":["get","culture"],
      "text-size":12,
      "text-allow-overlap":true,
      "text-anchor":"center"
    }, 
    paint:{
      "text-color":"#FFFFFF",
      "text-halo-color":"#000000",
      "text-halo-width":2
    }
  });

  // --- Source flèches ---
  map.addSource("sampling-arrows",{type:"geojson", data:samplingArrows});
  map.addLayer({
    id:"sampling-arrows-line", 
    type:"line", 
    source:"sampling-arrows", 
    filter:["==",["geometry-type"],"LineString"], 
    paint:{
      "line-color":"#FF0000",
      "line-width":3
    }
  });

  // --- Source points de prélèvement ---
  map.addSource("sampling-points",{type:"geojson", data:{type:"FeatureCollection",features:[]}});
  map.addLayer({
    id:"sampling-points-circles", 
    type:"circle", 
    source:"sampling-points", 
    filter:["==",["geometry-type"],"Point"], 
    paint:{
      "circle-radius":8,
      "circle-color":"#FF0000",
      "circle-stroke-width":3,
      "circle-stroke-color":"#FFFFFF"
    }
  });
  map.addLayer({
    id:"sampling-points-lines", 
    type:"line", 
    source:"sampling-points", 
    filter:["==",["geometry-type"],"LineString"], 
    paint:{
      "line-color":"#FF0000",
      "line-width":3,
      "line-dasharray":[2,2]
    }
  });
  map.addLayer({
    id:"sampling-points-labels", 
    type:"symbol", 
    source:"sampling-points", 
    filter:["==",["geometry-type"],"Point"], 
    layout:{
      "text-field":["get","order"],
      "text-size":12,
      "text-allow-overlap":true
    }, 
    paint:{
      "text-color":"#FFFFFF"
    }
  });
});

// --- Dessin parcelle ---
map.on("draw.create",e=>{
  currentDrawnFeature = e.features[0];
  showParcelleForm({id:`Ilot `, bio:"OUI", culture:""});
});

// --- Formulaire parcelle ---
function showParcelleForm(defaultData, isEdit = false) {
  const modal = document.getElementById("modal-parcelle");
  const form = document.getElementById("form-parcelle");
  const modalHeader = document.querySelector(".modal-header");
  
  // Changer le titre selon le mode
  modalHeader.textContent = isEdit ? "✏️ Modifier Parcelle" : "🌾 Nouvelle Parcelle";
  
  document.getElementById("parcelle-id").value = defaultData.id;
  document.getElementById("parcelle-bio").value = defaultData.bio;
  document.getElementById("parcelle-culture").value = defaultData.culture;
  
  modal.classList.add("active");
  
  // Gestion annulation
  document.getElementById("modal-cancel").onclick = () => {
    modal.classList.remove("active");
    if(currentDrawnFeature) {
      draw.delete(currentDrawnFeature.id);
      currentDrawnFeature = null;
    }
    draw.changeMode("simple_select");
    document.getElementById("draw-polygon").style.display="block";
    document.getElementById("cancel-draw").style.display="none";
  };
  
  // Gestion soumission
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = {
      id: document.getElementById("parcelle-id").value,
      bio: document.getElementById("parcelle-bio").value,
      culture: document.getElementById("parcelle-culture").value
    };
    
    // Validation : vérifier que l'ID n'est pas juste "Ilot " sans numéro
    if (data.id.trim() === "Ilot" || data.id.trim() === "") {
      alert("⚠️ Veuillez renseigner un numéro d'ilot (ex: Ilot 1.1)");
      return;
    }
    
    modal.classList.remove("active");
    
    if(currentDrawnFeature) {
      const newF = {
        type: "Feature",
        properties: { id: data.id, bio: data.bio, culture: data.culture, isOperateur: false },
        geometry: currentDrawnFeature.geometry
      };
      draw.delete(currentDrawnFeature.id);
      parcelles.features.push(newF);
      map.getSource("parcelles")?.setData(parcelles);
      updateParcellesList();
      selectParcelle(data.id);
      currentDrawnFeature = null;
    }
    
    draw.changeMode("simple_select");
    document.getElementById("draw-polygon").style.display="block";
    document.getElementById("cancel-draw").style.display="none";
    updateButtonsDisplay();
    console.log("Parcelle ajoutée:", data);
  };
}

// --- Mode flèche sur carte ---
map.on("click",(e)=>{
  // Mode points de prélèvement
  if(samplingMode){
    const coords=[e.lngLat.lng,e.lngLat.lat];
    samplingPoints.push(coords);
    console.log("Point ajouté :",coords,"Total:",samplingPoints.length);
    updateSamplingPointsDisplay();
    return;
  }
  
  if(drawArrowMode){
    if(!arrowStartPoint){ 
      arrowStartPoint=[e.lngLat.lng,e.lngLat.lat]; 
      console.log("Début flèche :",arrowStartPoint); 
      return; 
    }
    const arrowEndPoint=[e.lngLat.lng,e.lngLat.lat];
    const dx=arrowEndPoint[0]-arrowStartPoint[0], dy=arrowEndPoint[1]-arrowStartPoint[1];
    const bearing=Math.atan2(dy,dx)*180/Math.PI;
    const lineFeature={type:"Feature", geometry:{type:"LineString", coordinates:[arrowStartPoint,arrowEndPoint]}, properties:{date:new Date().toISOString()}};
    const headFeature={type:"Feature", geometry:{type:"Point", coordinates:arrowEndPoint}, properties:{bearing}};
    samplingArrows.features.push(lineFeature,headFeature);
    map.getSource("sampling-arrows").setData(samplingArrows);
    console.log("Flèche ajoutée :", arrowStartPoint, "→", arrowEndPoint);
    arrowStartPoint=null;
    return;
  }
  const currentMode=draw.getMode();
  if(currentMode==="draw_polygon") return;
  const features=map.queryRenderedFeatures(e.point,{layers:["parcelles-fill"]});
  if(features.length>0) selectParcelle(features[0].properties.id);
  else{ 
    selectedParcelleId=null; 
    map.setFilter("parcelles-outline",["!=",["get","id"],""]);
    map.setFilter("parcelles-outline-selected",["==",["get","id"],""]); 
    updateParcellesList(); 
    updateButtonsDisplay(); 
  }
});

// --- Fonction mise à jour affichage points ---
function updateSamplingPointsDisplay(){
  const features=[];
  samplingPoints.forEach((coords,i)=>{
    features.push({type:"Feature", geometry:{type:"Point",coordinates:coords}, properties:{order:i+1}});
    if(i>0){
      const prev=samplingPoints[i-1];
      features.push({type:"Feature", geometry:{type:"LineString",coordinates:[prev,coords]}, properties:{}});
    }
  });
  map.getSource("sampling-points").setData({type:"FeatureCollection",features});
}

// --- Bouton points de prélèvement ---
document.getElementById("sampling-points").addEventListener("click",()=>{
  const btn=document.getElementById("sampling-points");
  if(!samplingMode){
    samplingMode=true;
    samplingPoints=[];
    btn.classList.add("active");
    btn.textContent="✅ Terminer la saisie";
    console.log("Mode points de prélèvement ACTIVÉ");
  }else{
    samplingMode=false;
    btn.classList.remove("active");
    btn.textContent="📍 Ajouter points de prélèvement";
    console.log("Mode points de prélèvement TERMINÉ. Points:",samplingPoints.length);
  }
});

// --- Bouton flèche ---
document.getElementById("draw-sampling").addEventListener("click",()=>{
  drawArrowMode=!drawArrowMode;
  arrowStartPoint=null;
  const btn=document.getElementById("draw-sampling");
  if(drawArrowMode){ 
    btn.style.background="#D32F2F"; 
    btn.textContent="➜ Dessin flèche actif"; 
    console.log("Mode flèche ACTIVÉ"); 
  }
  else{ 
    btn.style.background=""; 
    btn.textContent="✚ Flèche prélèvement"; 
    console.log("Mode flèche DÉSACTIVÉ"); 
  }
});

// --- Export image et GeoJSON ---
document.getElementById("export").addEventListener("click", async ()=>{
  try{
    // Vérifier qu'il y a au moins une parcelle
    if(parcelles.features.length === 0) {
      alert("⚠️ Aucune parcelle dessinée ! Veuillez dessiner au moins une parcelle avant d'exporter.");
      return;
    }
    
    // Vérifier qu'il y a au moins un point de prélèvement
    if(samplingPoints.length === 0) {
      alert("⚠️ Aucun point de prélèvement ! Veuillez ajouter au moins un point de prélèvement avant d'exporter.");
      return;
    }
    
    // Désélectionner la parcelle avant l'export
    const wasSelected = selectedParcelleId;
    if(selectedParcelleId) {
      selectedParcelleId = null;
      map.setFilter("parcelles-outline",["!=",["get","id"],""]);
      map.setFilter("parcelles-outline-selected",["==",["get","id"],""]);
      updateParcellesList();
      updateButtonsDisplay();
    }
    
    // Attendre un peu que le rendu se mette à jour
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const canvas=await html2canvas(document.getElementById("map"));
    const base64=canvas.toDataURL("image/png").split(",")[1];
    const params=new URLSearchParams(window.location.search);
    const imageId=params.get("imgid")||"image";
    await fetch("https://defaultfb09ecdc8906448c868740d3a97d87.07.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/31d2874a36a6410ab1b732d079226083/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=2CtG7Oi0jme9Y7oUKZT0jEdAZwwiP26pu2S2_PgjSoU",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        imageBase64:base64,
        fileName:`carte_${imageId}.png`,
        parcelleId:wasSelected||"Aucune",
        date:new Date().toISOString()
      })
    });
    alert("Image envoyée, vous pouvez retourner sur la saisie de la fiche de prélèvement ✅");
  }catch(err){ 
    console.error(err); 
    alert("Erreur lors de l'export vers Power Automate"); 
  }
});

document.getElementById("export-geojson").addEventListener("click",()=>{
  if(parcelles.features.length===0){ 
    alert("Aucune parcelle à exporter"); 
    return; 
  }
  const blob=new Blob([JSON.stringify(parcelles,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=`parcelles_${new Date().toISOString().split('T')[0]}.geojson`;
  link.click();
});

// --- Géocodage ArcGIS ---
function geocodeAddress(address){
  fetch('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine='+encodeURIComponent(address))
  .then(r=>r.json()).then(data=>{
    if(data.candidates&&data.candidates.length>0){
      const loc=data.candidates[0].location;
      map.flyTo({center:[loc.x,loc.y],zoom:16,speed:1.2});
      if(!map.getSource('geocode-point')){ 
        map.addSource('geocode-point',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); 
        map.addLayer({
          id:'geocode-point-layer',
          type:'circle',
          source:'geocode-point',
          paint:{
            'circle-radius':8,
            'circle-color':'#FF0000',
            'circle-stroke-width':2,
            'circle-stroke-color':'#FFFFFF'
          }
        }); 
      }
      map.getSource('geocode-point').setData({
        type:'FeatureCollection',
        features:[{
          type:'Feature',
          geometry:{type:'Point',coordinates:[loc.x,loc.y]},
          properties:{address}
        }]
      });
    }else alert('Adresse non trouvée : '+address);
  }).catch(err=>{ console.error(err); alert('Erreur lors du géocodage'); });
}

// --- Géocodage auto depuis URL ---
window.addEventListener('DOMContentLoaded',()=>{
  const params=new URLSearchParams(window.location.search);
  const adresseParam=params.get('adresse');
  if(adresseParam){
    const adresse=adresseParam.replace(/_/g,' ');
    geocodeAddress(adresse);
    console.log('Géocodage automatique de l\'adresse :',adresse);
  }

});
