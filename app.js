// --- Initialisation carte avec fond satellite ---
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        attribution: "© Esri"
      }
    },
    layers: [
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
        minzoom: 0,
        maxzoom: 22
      }
    ]
  },
  center: [-1.68, 48.11],
  zoom: 8,
  preserveDrawingBuffer: true
});

// --- Variables globales ---
let selectedParcelleId = null;
let parcelles = {
  type: "FeatureCollection",
  features: []
};

// --- Initialiser MapLibre Draw ---
const draw = new MapboxDraw({
  displayControlsDefault: false,
  controls: {},
  defaultMode: "simple_select"
});
map.addControl(draw, "top-left");

// --- Fonction pour mettre à jour la liste des parcelles ---
function updateParcellesList() {
  const listContainer = document.getElementById("parcelles-list");
  
  if (parcelles.features.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🌾</div>
        <p>Aucune parcelle pour le moment</p>
        <p style="font-size: 12px; margin-top: 5px;">Cliquez sur "Dessiner" pour commencer</p>
      </div>
    `;
    return;
  }
  
  listContainer.innerHTML = "";
  
  parcelles.features.forEach(feature => {
    const props = feature.properties;
    const bioClass = `bio-${props.bio.toLowerCase()}`;
    const isSelected = props.id === selectedParcelleId;
    
    const card = document.createElement("div");
    card.className = `parcelle-card ${bioClass} ${isSelected ? 'selected' : ''}`;
    card.dataset.id = props.id;
    
    card.innerHTML = `
      <div class="parcelle-header">
        <span class="parcelle-id">${props.id}</span>
        <span class="parcelle-bio ${bioClass}">${props.bio}</span>
      </div>
      <div class="parcelle-culture">🌱 ${props.culture}</div>
      <div class="parcelle-prelevee">
        <input type="checkbox" ${props.prelevee ? 'checked' : ''} onclick="togglePrelevee('${props.id}', event)">
        <span>Prélevée</span>
      </div>
    `;
    
    card.addEventListener("click", (e) => {
      if (e.target.type !== 'checkbox') {
        selectParcelle(props.id);
      }
    });
    
    listContainer.appendChild(card);
  });
}

// --- Fonction pour sélectionner une parcelle ---
function selectParcelle(id) {
  selectedParcelleId = id;
  
  // Mettre à jour le filtre de sélection sur la carte
  map.setFilter("parcelles-outline-selected", ["==", ["get", "id"], id]);
  
  // Mettre à jour la liste visuelle
  updateParcellesList();
  
  // Centrer la carte sur la parcelle
  const parcelle = parcelles.features.find(f => f.properties.id === id);
  if (parcelle) {
    const coords = parcelle.geometry.coordinates[0];
    let sumLng = 0, sumLat = 0;
    coords.forEach(c => { sumLng += c[0]; sumLat += c[1]; });
    const centerLng = sumLng / coords.length;
    const centerLat = sumLat / coords.length;
    
    map.flyTo({ center: [centerLng, centerLat], zoom: 16, speed: 1.2 });
  }
  
  console.log("Parcelle sélectionnée:", id);
}

// --- Fonction pour basculer l'état prélevée ---
function togglePrelevee(id, event) {
  event.stopPropagation();
  
  parcelles.features.forEach(f => {
    if (f.properties.id === id) {
      f.properties.prelevee = event.target.checked;
    }
  });
  
  map.getSource("parcelles").setData(parcelles);
  updateParcellesList();
  
  console.log(`Parcelle ${id} prélevée:`, event.target.checked);
}

// Rendre la fonction accessible globalement
window.togglePrelevee = togglePrelevee;

// --- Boutons de dessin ---
document.getElementById("draw-polygon").addEventListener("click", () => {
  draw.changeMode("draw_polygon");
  document.getElementById("draw-polygon").style.display = "none";
  document.getElementById("cancel-draw").style.display = "block";
  console.log("Mode dessin activé");
});

document.getElementById("cancel-draw").addEventListener("click", () => {
  draw.changeMode("simple_select");
  document.getElementById("draw-polygon").style.display = "block";
  document.getElementById("cancel-draw").style.display = "none";
  console.log("Mode dessin annulé");
});

document.getElementById("delete-parcelle").addEventListener("click", () => {
  if (!selectedParcelleId) {
    alert("Sélectionnez d'abord une parcelle dans la liste");
    return;
  }
  
  if (confirm(`Voulez-vous vraiment supprimer la parcelle ${selectedParcelleId} ?`)) {
    parcelles.features = parcelles.features.filter(f => f.properties.id !== selectedParcelleId);
    map.getSource("parcelles").setData(parcelles);
    selectedParcelleId = null;
    map.setFilter("parcelles-outline-selected", ["==", ["get", "id"], ""]);
    
    updateParcellesList();
    console.log("Parcelle supprimée");
  }
});

// --- Charger la carte ---
map.on("load", async () => {
  // Créer la source vide
  map.addSource("parcelles", { type: "geojson", data: parcelles });

  // Couche remplissage
  map.addLayer({
    id: "parcelles-fill",
    type: "fill",
    source: "parcelles",
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "bio"], "OUI"], "#4CAF50",
        ["==", ["get", "bio"], "CONVERSION"], "#FF9800",
        "#F44336"
      ],
      "fill-opacity": 0.5
    }
  });

  // Contour
  map.addLayer({
    id: "parcelles-outline",
    type: "line",
    source: "parcelles",
    paint: {
      "line-color": "#FFFFFF",
      "line-width": 2
    }
  });

  // Contour sélection
  map.addLayer({
    id: "parcelles-outline-selected",
    type: "line",
    source: "parcelles",
    paint: {
      "line-color": "#FFFF00",
      "line-width": 4
    },
    filter: ["==", ["get", "id"], ""]
  });

  // Parcelle prélevée
  map.addLayer({
    id: "parcelles-outline-prelevee",
    type: "line",
    source: "parcelles",
    paint: {
      "line-color": "#FF00FF",
      "line-width": 6
    },
    filter: ["==", ["get", "prelevee"], true]
  });

  // Label culture
  map.addLayer({
    id: "parcelles-label",
    type: "symbol",
    source: "parcelles",
    layout: {
      "text-field": ["get", "culture"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-anchor": "center"
    },
    paint: {
      "text-color": "#FFFFFF",
      "text-halo-color": "#000000",
      "text-halo-width": 2
    }
  });

  // Charger fichier GeoJSON si disponible
  try {
    const response = await fetch("parcelles.geojson");
    if (response.ok) {
      const data = await response.json();
      parcelles.features = data.features;
      map.getSource("parcelles").setData(parcelles);
      updateParcellesList();
      console.log(`${parcelles.features.length} parcelles chargées`);
    }
  } catch (err) {
    console.log("Pas de fichier GeoJSON, carte vierge");
  }
});

// --- Sélection de parcelle sur la carte ---
map.on("click", (e) => {
  const currentMode = draw.getMode();
  if (currentMode === "draw_polygon") {
    return;
  }
  
  const features = map.queryRenderedFeatures(e.point, { layers: ["parcelles-fill"] });
  
  if (features.length > 0) {
    const feature = features[0];
    selectParcelle(feature.properties.id);
  } else {
    selectedParcelleId = null;
    map.setFilter("parcelles-outline-selected", ["==", ["get", "id"], ""]);
    updateParcellesList();
  }
});

// --- Création de parcelle ---
map.on("draw.create", (e) => {
  console.log("Parcelle dessinée, événement déclenché");
  
  const feature = e.features[0];

  const id = prompt("ID de la parcelle :", `PARCELLE_${Date.now()}`);
  if (!id) {
    draw.delete(feature.id);
    draw.changeMode("simple_select");
    document.getElementById("draw-polygon").style.display = "block";
    document.getElementById("cancel-draw").style.display = "none";
    return;
  }

  const bio = prompt("Statut BIO (OUI/CONVERSION/NON) :", "NON");
  if (!bio) {
    draw.delete(feature.id);
    draw.changeMode("simple_select");
    document.getElementById("draw-polygon").style.display = "block";
    document.getElementById("cancel-draw").style.display = "none";
    return;
  }

  const culture = prompt("Type de culture :", "Blé");
  if (!culture) {
    draw.delete(feature.id);
    draw.changeMode("simple_select");
    document.getElementById("draw-polygon").style.display = "block";
    document.getElementById("cancel-draw").style.display = "none";
    return;
  }

  const newFeature = {
    type: "Feature",
    properties: { 
      id, 
      bio: bio.toUpperCase(), 
      culture, 
      prelevee: false 
    },
    geometry: feature.geometry
  };

  draw.delete(feature.id);
  parcelles.features.push(newFeature);
  
  // SOLUTION: Forcer le rafraîchissement en récupérant et remettant les données
  const source = map.getSource("parcelles");
  if (source) {
    // Créer une copie profonde pour forcer MapLibre à détecter le changement
    const updatedData = JSON.parse(JSON.stringify(parcelles));
    source.setData(updatedData);
    console.log("Données de la source mises à jour");
    
    // Forcer un re-render de la carte
    map.triggerRepaint();
  } else {
    console.error("Source 'parcelles' introuvable!");
  }
  
  updateParcellesList();
  selectParcelle(id);
  
  console.log("Parcelle ajoutée:", newFeature);
  console.log("Total parcelles:", parcelles.features.length);
  console.log("Géométrie:", newFeature.geometry);
  
  draw.changeMode("simple_select");
  document.getElementById("draw-polygon").style.display = "block";
  document.getElementById("cancel-draw").style.display = "none";
});

// --- Export image ---
document.getElementById("export").addEventListener("click", async () => {
  try {
    const canvas = await html2canvas(document.getElementById("map"));
    const image = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = image;
    link.download = `carte_parcelles_${new Date().toISOString().split('T')[0]}.png`;
    link.click();
    console.log("Image exportée");
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'export");
  }
});

// --- Export GeoJSON ---
document.getElementById("export-geojson").addEventListener("click", () => {
  if (parcelles.features.length === 0) {
    alert("Aucune parcelle à exporter");
    return;
  }
  const blob = new Blob([JSON.stringify(parcelles, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `parcelles_${new Date().toISOString().split('T')[0]}.geojson`;
  link.click();
  console.log("GeoJSON exporté");
});