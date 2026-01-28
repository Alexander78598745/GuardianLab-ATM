// --- FUNCIONES GLOBALES ---
function cerrarModal(id){ document.getElementById(id).style.display='none'; }

// --- CONFIGURACIÓN BASE DE DATOS ---
const DB_NAME = 'GuardianProDB';
const DB_VERSION = 1;
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('porteros')) db.createObjectStore('porteros', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('partidos')) db.createObjectStore('partidos', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('seguimientos')) db.createObjectStore('seguimientos', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('reportes')) db.createObjectStore('reportes', { keyPath: 'id' });
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onerror = (e) => { console.error("DB Error", e); resolve(null); };
    });
}

// HELPERS DB
function dbSave(storeName, data) {
    if(!db) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(data);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(false);
    });
}
function dbGetAll(storeName) {
    if(!db) return Promise.resolve([]);
    return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
    });
}
function dbDelete(storeName, id) {
    if(!db) return Promise.resolve(false);
    return new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
    });
}

// --- VARIABLES GLOBALES ---
let partidoLive = { 
    config: {}, 
    acciones: [], 
    marcador: {local:0, rival:0}, 
    porterosJugaron: new Set(), 
    minutosJugados: {}, 
    porteroActualId: null, 
    parteActual: 'Pre-Partido', 
    crono: { seg: 0, int: null, run: false, startTs: 0, savedSeg: 0, lastUpdate: 0 } 
};
let accionTemporal = null;
let porteroEnEdicionId = null;
let evaluacionesTemporales = [];
let competenciaSeleccionada = null; 
let partidoEnEdicion = null;

const CATALOGO_ACCIONES = {
    "DEFENSIVAS": { id: "def", grupos: { "BLOCAJES": ["Blocaje Frontal Raso", "Blocaje Lateral Raso", "Blocaje Frontal Media Altura", "Blocaje Lateral Media Altura", "Blocaje Aéreo"], "DESVÍOS": ["Desvío Mano Natural", "Desvío Mano Cambiada", "Desvío 2 Manos"], "JUEGO AÉREO": ["Despeje 1 Puño", "Despeje 2 Puños", "Prolongación"], "1 VS 1": ["Reducción de Espacios", "Posición Cruz", "Apertura", "Caída Lateral"], "OTRAS": ["Rechace"] } },
    "OFENSIVAS": { id: "of", grupos: { "PASES CON LA MANO": ["Pase Mano Raso", "Pase Mano Alto", "Pase Mano Picado"], "PASES CON PIE": ["Volea", "Pase Corto", "Pase Largo", "Despeje", "Despeje Orientado"], "CONTINUIDAD": ["Perfil + Control + Pase Corto", "Perfil + Control + Pase Largo", "Largo Control Previo", "Largo en Movimiento"] } },
    "TÁCTICAS": { id: "tac", grupos: { "POSICIONAMIENTO": ["Posición y Bisectriz", "Visión de Juego", "Saltar Líneas", "Posición Fase Ofensiva", "Posición Fase Defensiva", "Barrera"], "COMUNICACIÓN": ["Comunicación Verbal", "Comunicación NO Verbal"], "CONSTRUCCIÓN": ["Pase Espalda Defensa", "Desmarque de Apoyo"] } },
    "REINCORPORACIONES": { id: "rein", grupos: { "TIPOS": ["A Posición Básica", "A Mismo Lado", "A Lado Contrario", "Tras Blocaje"] } }
};

const ACCIONES_EVALUACION = {
    "DEFENSIVAS": ["Blocaje Frontales Medio y Raso", "Blocaje lateral raso", "Blocaje lateral media altura", "Desvío raso", "Desvío a Media Altura", "Reducción de espacios y Posición Cruz", "Apertura", "Reincorporaciones", "Blocaje Aéreo", "Despeje de Puños"],
    "OFENSIVAS": ["Pase mano raso", "Pase mano alto", "Pase mano picado", "Perfilamiento y Controles", "Pase Raso con el Píe", "Pase alto con el Píe", "Voleas"]
};

let categoriaAccionActiva = "DEFENSIVAS";

// --- INICIO ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        cargarPorteros();
        cargarHistorialReportes(); 
        cargarPartidosHistorial();
        recuperarPartidoEnCurso();
    } catch(e) { console.log(e); }

    const today = new Date().toISOString().split('T')[0];
    const fConf = document.getElementById('conf-fecha'); if(fConf) fConf.value=today;
    const fObj = document.getElementById('obj-fecha'); if(fObj) fObj.value=today;

    if(localStorage.getItem('guardian_theme') === 'light'){ document.body.classList.add('light-mode'); document.querySelector('.theme-toggle').innerText = '🌙'; }
});

window.onbeforeunload = function() {
    if (partidoLive.crono.run || partidoLive.parteActual === '1ª Parte' || partidoLive.parteActual === '2ª Parte') {
        return "Hay un partido en curso. ¿Seguro?";
    }
};

function alternarTema() { document.body.classList.toggle('light-mode'); const isLight = document.body.classList.contains('light-mode'); document.querySelector('.theme-toggle').innerText = isLight ? '🌙' : '☀️'; localStorage.setItem('guardian_theme', isLight ? 'light' : 'dark'); }

function cambiarSeccion(sec) { 
    document.getElementById('modal-pdf-preview').style.display = 'none'; 
    document.getElementById('modal-fin-partido').style.display = 'none'; 
    ['porteros','sesiones','partidos','datos','live'].forEach(id=>{ 
        const el = document.getElementById('section-'+id);
        const btn = document.getElementById('btn-'+id);
        if(el) el.style.display='none';
        if(btn) btn.classList.remove('active'); 
    }); 
    const target = document.getElementById('section-'+sec);
    if(target) target.style.display='block'; 
    const targetBtn = document.getElementById('btn-'+sec);
    if(targetBtn) targetBtn.classList.add('active'); 
    
    if(sec === 'sesiones') cargarHistorialReportes(); 
    if(sec === 'partidos') cargarPartidosHistorial(); 
}

// --- PORTEROS ---
function previsualizarFoto(){const file=document.getElementById('fotoPorteroInput').files[0];if(file){const r=new FileReader();r.onload=(e)=>document.getElementById('fotoPreview').src=e.target.result;r.readAsDataURL(file);}}
function actualizarEquipos(){const cat=document.getElementById('catPortero').value;const sel=document.getElementById('equipoPortero');sel.innerHTML='<option value="">Selecciona Categoría...</option>';if(!cat)return;['A','B','C','D','E','F'].forEach(l=>sel.innerHTML+=`<option value="${cat} ${l}">${cat} ${l}</option>`);}

async function cargarPorteros(){ 
    const l = await dbGetAll('porteros');
    const tot=document.getElementById('total-porteros'); if(tot) tot.innerText=l.length; 
    const c=document.getElementById('lista-porteros'); 
    if(c){ 
        c.innerHTML=''; 
        const def="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgOGEzIDMgMCAxIDAgMCA2IDMgMyAwIDAgMCAwLTZ6bS01IDlsMTAgMGE3IDcgMCAwIDEtMTAgMHoiLz48L3N2Zz4="; 
        l.forEach(p=>{ 
            c.innerHTML+=`<div class="portero-card"><div style="display:flex; align-items:center;"><img src="${p.foto||def}" class="mini-foto-list"><div><div class="card-title">${p.nombre}</div><div class="card-subtitle">${p.equipo} (${p.anio||'-'})</div></div></div><div><button class="btn-icon-action" onclick="cargarDatosEdicion(${p.id})" style="border-color:#00ff88; color:#00ff88; margin-right:5px;">✏️</button><button class="btn-trash" onclick="borrarPortero(${p.id})">🗑️</button></div></div>`; 
        }); 
    } 
    const opts = '<option value="">Seleccionar Portero...</option>' + l.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join(''); 
    if(document.getElementById('obj-portero')) document.getElementById('obj-portero').innerHTML = opts; 
    if(document.getElementById('select-stats-portero')) document.getElementById('select-stats-portero').innerHTML = opts; 
}

function procesarPortero(){ 
    const n=document.getElementById('nombrePortero').value; 
    const a=document.getElementById('anioPortero').value; 
    const c=document.getElementById('catPortero').value; 
    const eq=document.getElementById('equipoPortero').value; 
    const file=document.getElementById('fotoPorteroInput').files[0]; 

    if(c && (!eq || eq === "")) { actualizarEquipos(); return alert("⚠️ Selecciona el EQUIPO."); }
    if(!n||!c||!eq) return alert("Faltan datos"); 

    const save = async (foto) => { 
        let p = { id: porteroEnEdicionId || Date.now(), nombre:n, anio:a, categoria:c, equipo:eq, foto:foto };
        await dbSave('porteros', p);
        cancelarEdicion(); 
        cargarPorteros(); 
    }; 
    
    if(file){
        const r=new FileReader(); 
        r.onload=(e)=>{
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const max = 200; 
                let w = img.width; let h = img.height;
                if(w>h){ if(w>max){ h*=max/w; w=max; } } else { if(h>max){ w*=max/h; h=max; } }
                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                save(canvas.toDataURL('image/jpeg', 0.6)); 
            };
        };
        r.readAsDataURL(file);
    } else {
        if(porteroEnEdicionId) {
            dbGetAll('porteros').then(list => {
                const old = list.find(x=>x.id === porteroEnEdicionId);
                save(old ? old.foto : null);
            });
        } else {
            save(null); 
        }
    }
}

async function cargarDatosEdicion(id){
    const l = await dbGetAll('porteros');
    const p = l.find(x=>x.id===id); 
    if(p){ 
        document.getElementById('nombrePortero').value=p.nombre; 
        document.getElementById('anioPortero').value=p.anio; 
        document.getElementById('catPortero').value=p.categoria; 
        actualizarEquipos(); 
        document.getElementById('equipoPortero').value=p.equipo; 
        document.getElementById('fotoPreview').src=p.foto||""; 
        porteroEnEdicionId=id; 
        document.getElementById('btn-save').innerText="Guardar Cambios"; 
        document.getElementById('btn-cancel').style.display="inline-block"; 
        window.scrollTo({top:0,behavior:'smooth'});
    }
}

function cancelarEdicion(){porteroEnEdicionId=null; document.getElementById('nombrePortero').value=''; document.getElementById('anioPortero').value=''; document.getElementById('catPortero').value=''; document.getElementById('equipoPortero').innerHTML=''; document.getElementById('fotoPreview').src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgOGEzIDMgMCAxIDAgMCA2IDMgMyAwIDAgMCAwLTZ6bS01IDlsMTAgMGE3IDcgMCAwIDEtMTAgMHoiLz48L3N2Zz4="; document.getElementById('btn-save').innerText="Añadir Jugador"; document.getElementById('btn-cancel').style.display="none";}
function borrarPortero(id){if(confirm("¿Borrar?")){ dbDelete('porteros', id).then(() => cargarPorteros()); }}

// --- OBJETIVOS ---
function resetearEvaluacionTemporal() { evaluacionesTemporales = []; competenciaSeleccionada = null; selectCompetencia(null); renderizarListaTemporal(); document.getElementById('contenedor-evaluacion-temporal').style.display = 'none'; cargarAccionesObjetivos(); }
function cargarAccionesObjetivos() { const tipo = document.getElementById('obj-tipo').value; const sel = document.getElementById('obj-accion'); sel.innerHTML = '<option value="">Seleccionar Acción...</option>'; sel.disabled = true; if (tipo && ACCIONES_EVALUACION[tipo]) { sel.disabled = false; ACCIONES_EVALUACION[tipo].forEach(acc => { if (!evaluacionesTemporales.some(e => e.accion === acc)) { sel.innerHTML += `<option value="${acc}">${acc}</option>`; } }); } }
function selectCompetencia(val) { competenciaSeleccionada = val; document.querySelectorAll('.btn-comp').forEach(b => b.classList.remove('active')); if(val) document.querySelector(`.btn-comp.comp-${val}`).classList.add('active'); document.getElementById('obj-competencia-val').value = val; }
function agregarEvaluacionTemporal() { const pid = document.getElementById('obj-portero').value; const tipo = document.getElementById('obj-tipo').value; const accion = document.getElementById('obj-accion').value; const comp = competenciaSeleccionada; const score = document.getElementById('obj-puntaje').value; if(!pid || !accion || !comp) return alert("Completa los datos"); evaluacionesTemporales.push({ accion: accion, tipo: tipo, competencia: parseInt(comp), puntaje: parseInt(score) }); renderizarListaTemporal(); document.getElementById('obj-accion').value = ""; selectCompetencia(null); document.getElementById('obj-puntaje').value = "1"; cargarAccionesObjetivos(); document.getElementById('contenedor-evaluacion-temporal').style.display = 'block'; }
function renderizarListaTemporal() { const cont = document.getElementById('lista-temp-evaluaciones'); cont.innerHTML = ''; evaluacionesTemporales.forEach(item => { let col = '#ccc', txt = ''; if(item.competencia === 1) { col = 'var(--comp-1)'; txt = 'Inc. Inconsciente'; } if(item.competencia === 2) { col = 'var(--comp-2)'; txt = 'Inc. Consciente'; } if(item.competencia === 3) { col = 'var(--comp-3)'; txt = 'Comp. Consciente'; } if(item.competencia === 4) { col = 'var(--comp-4)'; txt = 'Comp. Inconsciente'; } cont.innerHTML += `<div class="item-temp-eval" style="border-left: 4px solid ${col}"><strong>${item.accion}</strong><br><span style="color:${col}">${txt}</span> | Nota: ${item.puntaje}</div>`; }); }
async function guardarReporteCompleto() { const pid = document.getElementById('obj-portero').value; const fecha = document.getElementById('obj-fecha').value; if(!pid || !fecha || evaluacionesTemporales.length === 0) return alert("Sin datos"); const nuevoReporte = { id: Date.now(), porteroId: parseInt(pid), fecha: fecha, acciones: evaluacionesTemporales }; await dbSave('reportes', nuevoReporte); evaluacionesTemporales.forEach(async item => { await dbSave('seguimientos', { id: Date.now() + Math.random(), porteroId: parseInt(pid), fecha: fecha, accion: item.accion, competencia: item.competencia, puntaje: item.puntaje }); }); generarPDFReporteLote(nuevoReporte); resetearEvaluacionTemporal(); cargarHistorialReportes(); }
async function generarPDFReporteLote(reporte) { const ps = await dbGetAll('porteros'); const p = ps.find(x => x.id == reporte.porteroId); const foto = p.foto || "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgOGEzIDMgMCAxIDAgMCA2IDMgMyAwIDAgMCAwLTZ6bS01IDlsMTAgMGE3IDcgMCAwIDEtMTAgMHoiLz48L3N2Zz4="; let filas = ''; reporte.acciones.forEach(item => { let bg = '#ccc', fg = 'white', label = ''; if(item.competencia === 1) { bg = '#E74C3C'; label = 'INCOMP. INCONSCIENTE'; } if(item.competencia === 2) { bg = '#E67E22'; label = 'INCOMP. CONSCIENTE'; } if(item.competencia === 3) { bg = '#F1C40F'; label = 'COMP. CONSCIENTE'; fg = 'black'; } if(item.competencia === 4) { bg = '#27AE60'; label = 'COMP. INCONSCIENTE'; } filas += `<tr><td style="padding:8px; border-bottom:1px solid #eee;">${item.accion}</td><td style="padding:8px; border-bottom:1px solid #eee; text-align:center;"><span style="background:${bg}; color:${fg}; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:bold;">${label}</span></td><td style="padding:8px; border-bottom:1px solid #eee; text-align:center; font-weight:bold;">${item.puntaje}</td></tr>`; }); const html = `<div class="pdf-container"><div class="pdf-header-pro"><img src="ESCUDO ATM.png" class="pdf-logo" alt="ATM"><div class="pdf-title-box"><h1>ATLÉTICO DE MADRID</h1><h2>SEGUIMIENTO TÉCNICO</h2></div></div><div class="pdf-divider-red"></div><div class="pdf-portero-ficha" style="margin-bottom:20px;"><img src="${foto}" class="pdf-portero-foto" style="width:80px!important;height:80px!important;border-radius:50%!important;"><div class="pdf-portero-datos" style="margin-left:20px;"><h2 style="margin:0;color:#CB3524;">${p.nombre}</h2><p style="margin:5px 0;">${p.equipo} - ${p.categoria}</p><p>Fecha Reporte: <strong>${reporte.fecha}</strong></p></div></div><div class="pdf-section-pro"><h3 class="pdf-section-title">EVALUACIÓN DE COMPETENCIAS</h3><table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#f0f0f0;"><th style="padding:10px;">Acción Técnica</th><th style="padding:10px;text-align:center;">Nivel</th><th style="padding:10px;text-align:center;">Nota</th></tr></thead><tbody>${filas}</tbody></table></div><div class="pdf-footer"><p>Guardian Lab ATM Pro - Reporte de Seguimiento</p></div></div>`; document.getElementById('preview-content').innerHTML = html; document.getElementById('printable-area').innerHTML = html; document.getElementById('modal-pdf-preview').style.display = 'flex'; }
async function cargarHistorialReportes() { const reportes = await dbGetAll('reportes'); const ps = await dbGetAll('porteros'); const cont = document.getElementById('lista-seguimientos'); if(!cont) return; cont.innerHTML = ''; const ultimos = reportes.slice(-10).reverse(); ultimos.forEach(rep => { const p = ps.find(x => x.id === rep.porteroId); if(!p) return; cont.innerHTML += `<div class="eval-card" style="border-left: 5px solid var(--atm-blue)"><div><div style="font-weight:bold;font-size:0.9rem;">${p.nombre}</div><div style="font-size:0.8rem;color:var(--text-sec);">Reporte Completo (${rep.acciones.length} acciones)</div><div style="font-size:0.75rem;margin-top:4px;">${rep.fecha}</div></div><div style="display:flex; gap:5px;"><button class="btn-icon-action" onclick="verPDFReporte(${rep.id})" title="Ver PDF">📄</button><button class="btn-trash" onclick="borrarReporte(${rep.id})">🗑️</button></div></div>`; }); }
async function verPDFReporte(id) { const reportes = await dbGetAll('reportes'); const reporte = reportes.find(r => r.id === id); if(reporte) generarPDFReporteLote(reporte); }
function borrarReporte(id) { if(confirm("¿Borrar?")) { dbDelete('reportes', id).then(() => cargarHistorialReportes()); } }
async function actualizarGrafica() { const pid = document.getElementById('select-stats-portero').value; if(!pid) return; const lista = await dbGetAll('seguimientos'); const evs = lista.filter(x => x.porteroId == pid); let totalScore = 0; evs.forEach(e => totalScore += e.puntaje); const media = evs.length ? (totalScore / evs.length).toFixed(1) : "-"; document.getElementById('kpi-media').innerText = media; document.getElementById('kpi-clean-sheets').innerText = evs.length; const ultimas = evs.slice(0, 10).reverse(); const labels = ultimas.map(e => e.fecha.substring(5)); const data = ultimas.map(e => e.puntaje); const ctx = document.getElementById('graficaRendimiento').getContext('2d'); if(window.myChart) window.myChart.destroy(); window.myChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Puntaje', data: data, borderColor: '#CB3524', backgroundColor: 'rgba(203,53,36,0.1)', tension: 0.4, fill: true }] }, options: { scales: { y: { min: 0, max: 5 } }, plugins: { legend: { display: false } } } }); }

// --- LIVE MATCH ---
async function abrirConfigPartido() { if(partidoLive.parteActual !== 'Pre-Partido' && partidoLive.parteActual !== 'Final') { if(!confirm("⚠️ ¡HAY UN PARTIDO EN JUEGO!")) return; } const ps = await dbGetAll('porteros'); const equipos=[...new Set(ps.map(p=>p.equipo))].sort(); const selE=document.getElementById('conf-equipo'); selE.innerHTML='<option value="">Equipo ATM...</option>'; equipos.forEach(e=>selE.innerHTML+=`<option value="${e}">${e}</option>`); document.getElementById('modal-config-partido').style.display='flex'; }
async function filtrarPorterosPorEquipo() { const eq = document.getElementById('conf-equipo').value; const ps = await dbGetAll('porteros'); const sel=document.getElementById('conf-portero-titular'); sel.innerHTML='<option value="">Titular...</option>'; ps.filter(p=>p.equipo===eq).forEach(p=>sel.innerHTML+=`<option value="${p.id}">${p.nombre}</option>`); }

async function actualizarUI() { 
    const ps = await dbGetAll('porteros');
    const p = ps.find(x=>x.id===partidoLive.porteroActualId); 
    document.getElementById('live-portero-nombre').innerText = p ? p.nombre : "Desconocido"; 
    document.getElementById('live-portero-foto').src = p && p.foto ? p.foto : "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDIxdi0yYTQgNCAwIDAgMC00LTRoLThhNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PC9zdmc+"; 
}

function renderizarPanelAcciones() { const panel = document.getElementById('panel-acciones-avanzado'); panel.innerHTML = ''; const tabsContainer = document.createElement('div'); tabsContainer.className = 'tabs-container'; Object.keys(CATALOGO_ACCIONES).forEach(catNombre => { const catData = CATALOGO_ACCIONES[catNombre]; const btn = document.createElement('button'); btn.innerText = catNombre; btn.className = `tab-btn ${categoriaAccionActiva === catNombre ? 'active' : ''}`; btn.dataset.cat = catData.id; btn.onclick = () => { categoriaAccionActiva = catNombre; renderizarPanelAcciones(); }; tabsContainer.appendChild(btn); }); panel.appendChild(tabsContainer); const grupos = CATALOGO_ACCIONES[categoriaAccionActiva].grupos; const catId = CATALOGO_ACCIONES[categoriaAccionActiva].id; Object.keys(grupos).forEach(grupoNombre => { const titulo = document.createElement('div'); titulo.className = 'action-group-title'; titulo.innerText = grupoNombre; panel.appendChild(titulo); const grid = document.createElement('div'); grid.className = 'actions-grid-new'; grupos[grupoNombre].forEach(accionNombre => { const btn = document.createElement('button'); btn.innerText = accionNombre; btn.className = `action-btn-new btn-${catId}`; btn.onclick = () => prepararAccion(accionNombre); grid.appendChild(btn); }); panel.appendChild(grid); }); }
function gestionarGol(equipo, accion) { if(!partidoLive.crono.run) return alert("Crono parado"); if (equipo === 'local') { if (accion === 'sumar') { partidoLive.marcador.local++; regEv('GOL_FAVOR', 'Gol ATM'); } else { if (partidoLive.marcador.local > 0) { partidoLive.marcador.local--; regEv('GOL_ANULADO', 'Gol ATM Anulado', null, 'Corrección Marcador'); } } document.getElementById('score-local').innerText = partidoLive.marcador.local; } else if (equipo === 'rival') { if (accion === 'sumar') { abrirModalGolRival(); } else { if (partidoLive.marcador.rival > 0) { partidoLive.marcador.rival--; regEv('GOL_ANULADO', 'Gol Rival Anulado', null, 'Corrección Marcador'); document.getElementById('score-rival').innerText = partidoLive.marcador.rival; } } } guardarEstadoLive(); }
function abrirModalFin(){ document.getElementById('fin-res-local').innerText=partidoLive.marcador.local; document.getElementById('fin-res-rival').innerText=partidoLive.marcador.rival; const cont = document.getElementById('container-analisis-porteros'); cont.innerHTML = ''; const ps = partidoLive.porterosJugaron; [...ps].forEach(async pid => { const allP = await dbGetAll('porteros'); const p = allP.find(x=>x.id===pid); cont.innerHTML += `<div class="pdf-obs-box"><div class="pdf-obs-header">ANÁLISIS: ${p.nombre}</div><textarea id="pos_${pid}" class="pdf-input-read" placeholder="Lo POSITIVO..."></textarea><textarea id="neg_${pid}" class="pdf-input-read" placeholder="Lo NEGATIVO..."></textarea><textarea id="tras_${pid}" class="pdf-input-read" placeholder="Trascendencia..."></textarea></div>`; }); document.getElementById('modal-fin-partido').style.display='flex'; localStorage.removeItem('guardian_live_backup'); }

function guardarEstadoLive() { const estado = { ...partidoLive, porterosJugaron: [...partidoLive.porterosJugaron] }; localStorage.setItem('guardian_live_backup', JSON.stringify(estado)); }
async function recuperarPartidoEnCurso() { const backup = localStorage.getItem('guardian_live_backup'); if (backup) { if (confirm("⚠️ Se detectó un partido en curso. ¿Deseas recuperarlo?")) { const estado = JSON.parse(backup); estado.porterosJugaron = new Set(estado.porterosJugaron); partidoLive = estado; cambiarSeccion('live'); document.getElementById('live-equipo-local').innerText = partidoLive.config.equipo; document.getElementById('live-equipo-rival').innerText = partidoLive.config.rival; document.getElementById('score-local').innerText = partidoLive.marcador.local; document.getElementById('score-rival').innerText = partidoLive.marcador.rival; const log = document.getElementById('live-log'); log.innerHTML = ''; partidoLive.acciones.forEach(ev => { let cl='',ic=''; if(ev.tipo==='ACCION'){cl=ev.res==='CORRECTO'?'log-ok':'log-error';ic=ev.res==='CORRECTO'?'✅':'❌';} if(ev.tipo==='GOL_FAVOR'){cl='log-gol-atm';ic='⚽';} if(ev.tipo==='GOL_CONTRA'){cl='log-gol-rival';ic='🥅';} if(ev.tipo==='GOL_ANULADO'){cl='log-anulado';ic='🚫';} if(ev.tipo==='HITO'){ log.innerHTML=`<div class="log-item" style="background:#444;color:white;justify-content:center;"><strong>${ev.nom}</strong></div>` + log.innerHTML; return; } log.innerHTML=`<div class="log-item ${cl}"><div><strong>${ev.min}</strong> ${ev.nom} (${ev.pnom})</div><div>${ic}</div></div>`+log.innerHTML; }); actualizarUI(); if (partidoLive.crono.run) { partidoLive.crono.int = setInterval(() => { const now = Date.now(); const diff = Math.floor((now - partidoLive.crono.startTs) / 1000); partidoLive.crono.seg = partidoLive.crono.savedSeg + diff; updCrono(); }, 1000); } else { updCrono(); } ['btn-start-partido','btn-fin-1','btn-ini-2','btn-fin-partido'].forEach(i=>document.getElementById(i).style.display='none'); if(partidoLive.parteActual === 'Pre-Partido') document.getElementById('btn-start-partido').style.display='block'; else if(partidoLive.parteActual === '1ª Parte') document.getElementById('btn-fin-1').style.display='block'; else if(partidoLive.parteActual === 'Descanso') document.getElementById('btn-ini-2').style.display='block'; else if(partidoLive.parteActual === '2ª Parte') document.getElementById('btn-fin-partido').style.display='block'; renderizarPanelAcciones(); } else { localStorage.removeItem('guardian_live_backup'); } } }

// --- CONTROL CRONO (CORREGIDO PARA MINUTOS JUGADOS) ---
function controlCrono(act) {
    const c = partidoLive.crono;
    
    if (act === 'start' || act === 'ini2') {
        if (c.run) return;
        c.run = true;
        c.startTs = Date.now(); 
        c.savedSeg = c.seg;
        c.lastUpdate = Date.now(); // Marca de tiempo para minutos jugados

        c.int = setInterval(() => {
            const now = Date.now();
            const diff = Math.floor((now - c.startTs) / 1000);
            c.seg = c.savedSeg + diff;
            updCrono();
            
            // --- ACTUALIZACIÓN MINUTOS JUGADOS (REAL TIME) ---
            if(partidoLive.porteroActualId && c.run) {
                const delta = (now - c.lastUpdate) / 1000;
                if(delta > 0) {
                    if(!partidoLive.minutosJugados[partidoLive.porteroActualId]) partidoLive.minutosJugados[partidoLive.porteroActualId] = 0;
                    partidoLive.minutosJugados[partidoLive.porteroActualId] += delta;
                    c.lastUpdate = now;
                }
            }
        }, 1000);

        partidoLive.parteActual = (act === 'start') ? '1ª Parte' : '2ª Parte';
        regEv('HITO', partidoLive.parteActual);
    }

    if (act === 'fin1' || act === 'fin') {
        clearInterval(c.int);
        c.run = false;
        c.savedSeg = c.seg; 
        
        partidoLive.parteActual = (act === 'fin1') ? 'Descanso' : 'Final';
        regEv('HITO', partidoLive.parteActual);
        
        if (act === 'fin') abrirModalFin();
    }

    guardarEstadoLive(); 
    
    ['btn-start-partido','btn-fin-1','btn-ini-2','btn-fin-partido'].forEach(i=>document.getElementById(i).style.display='none');
    if(act==='start') document.getElementById('btn-fin-1').style.display='block';
    if(act==='fin1') document.getElementById('btn-ini-2').style.display='block';
    if(act==='ini2') document.getElementById('btn-fin-partido').style.display='block';
}

function updCrono(){ const m=Math.floor(partidoLive.crono.seg/60); const s=partidoLive.crono.seg%60; document.getElementById('crono').innerText=`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }
async function regEv(tipo, nom, res=null, obs=null){ const min=Math.floor(partidoLive.crono.seg/60)+1; const ps = await dbGetAll('porteros'); const p=ps.find(x=>x.id===partidoLive.porteroActualId); const ev={id:Date.now(), min:min+"'", parte:partidoLive.parteActual, seg:partidoLive.crono.seg, tipo, nom, pid:partidoLive.porteroActualId, pnom:p?p.nombre:'-', res, obs}; partidoLive.acciones.push(ev); const log=document.getElementById('live-log'); let cl='',ic=''; if(tipo==='ACCION'){cl=res==='CORRECTO'?'log-ok':'log-error';ic=res==='CORRECTO'?'✅':'❌';} if(tipo==='GOL_FAVOR'){cl='log-gol-atm';ic='⚽';} if(tipo==='GOL_CONTRA'){cl='log-gol-rival';ic='🥅';} if(tipo==='GOL_ANULADO'){cl='log-anulado';ic='🚫';} if(tipo==='HITO'){ log.innerHTML=`<div class="log-item" style="background:#444;color:white;justify-content:center;"><strong>${nom}</strong></div>` + log.innerHTML; } else { log.innerHTML=`<div class="log-item ${cl}"><div><strong>${ev.min}</strong> ${nom} (${ev.pnom})</div><div>${ic}</div></div>`+log.innerHTML; } guardarEstadoLive(); }
function prepararAccion(n){if(!partidoLive.crono.run)return alert("Crono parado"); accionTemporal=n; document.getElementById('accion-titulo').innerText=n; document.getElementById('modal-accion').style.display='flex';}
function guardarAccionLive(r){ regEv('ACCION', accionTemporal, r, document.getElementById('accion-obs').value); document.getElementById('modal-accion').style.display='none'; document.getElementById('accion-obs').value=''; }
function registrarGol(tipo){ if(!partidoLive.crono.run)return alert("Crono parado"); if(tipo==='favor'){ partidoLive.marcador.local++; document.getElementById('score-local').innerText=partidoLive.marcador.local; regEv('GOL_FAVOR','Gol ATM'); } guardarEstadoLive(); }
function abrirModalGolRival(){ if(!partidoLive.crono.run)return alert("Crono parado"); document.getElementById('modal-gol-rival').style.display='flex'; }
function mostrarInputError(){ document.getElementById('div-error-detalle').style.display='block'; }
function registrarGolContra(isError){ partidoLive.marcador.rival++; document.getElementById('score-rival').innerText=partidoLive.marcador.rival; let obs = isError ? "ERROR: " + document.getElementById('gol-error-detalle').value : ""; regEv('GOL_CONTRA', 'Gol Rival', isError?'ERROR':null, obs); document.getElementById('div-error-detalle').style.display='none'; document.getElementById('gol-error-detalle').value=''; document.getElementById('modal-gol-rival').style.display='none'; guardarEstadoLive(); }
async function abrirModalCambio(){ if(!partidoLive.crono.run && partidoLive.parteActual!=='Descanso') return alert("Solo en juego o descanso"); const ps = await dbGetAll('porteros'); const sel=document.getElementById('select-cambio-portero'); sel.innerHTML=''; const sups = ps.filter(p => p.equipo === partidoLive.config.equipo && p.id !== partidoLive.porteroActualId); if(sups.length===0) return alert("No hay suplentes de este equipo"); sups.forEach(p=>sel.innerHTML+=`<option value="${p.id}">${p.nombre}</option>`); document.getElementById('modal-cambio').style.display='flex'; }

async function confirmarCambio(){ 
    const pid = parseInt(document.getElementById('select-cambio-portero').value); 
    const ps = await dbGetAll('porteros'); 
    const entra = ps.find(p=>p.id===pid); 
    const sale = ps.find(p=>p.id===partidoLive.porteroActualId); 
    
    // Guardar tiempo del que sale antes de cambiar
    if (partidoLive.crono.run && partidoLive.porteroActualId) {
        const now = Date.now();
        const delta = (now - partidoLive.crono.lastUpdate) / 1000;
        if (!partidoLive.minutosJugados[partidoLive.porteroActualId]) partidoLive.minutosJugados[partidoLive.porteroActualId] = 0;
        partidoLive.minutosJugados[partidoLive.porteroActualId] += delta;
        partidoLive.crono.lastUpdate = now; // Reset para el nuevo
    }

    partidoLive.porteroActualId = pid; 
    partidoLive.porterosJugaron.add(pid); 
    if (!partidoLive.minutosJugados[pid]) partidoLive.minutosJugados[pid] = 0; 
    
    regEv('CAMBIO', `Entra ${entra.nombre}, Sale ${sale.nombre}`); 
    actualizarUI(); 
    document.getElementById('modal-cambio').style.display='none'; 
    guardarEstadoLive(); 
}

async function prepararVistaPreviaPDF() {
    const cfg = partidoLive.config;
    const ps = await dbGetAll('porteros');
    
    // Capturar datos del análisis del DOM antes de generar el HTML
    let analisisData = {};
    partidoLive.porterosJugaron.forEach(pid => {
        analisisData[pid] = {
            pos: document.getElementById('pos_'+pid).value || "-",
            neg: document.getElementById('neg_'+pid).value || "-",
            tras: document.getElementById('tras_'+pid).value || "-"
        };
    });

    const htmlContent = generarHTMLPartido(partidoLive, ps, analisisData);
    
    // Guardar partido con datos RAW para poder editar luego
    const partidoGuardado = {
        id: Date.now(),
        equipo: cfg.equipo,
        rival: cfg.rival,
        res: `${partidoLive.marcador.local}-${partidoLive.marcador.rival}`,
        fecha: cfg.fecha,
        total: partidoLive.acciones.length,
        htmlData: htmlContent,
        raw: { ...partidoLive, porterosJugaron: [...partidoLive.porterosJugaron], analisis: analisisData } // Guardar estado crudo + analisis
    };

    await dbSave('partidos', partidoGuardado);
    
    document.getElementById('preview-content').innerHTML = htmlContent;
    document.getElementById('printable-area').innerHTML = htmlContent;
    document.getElementById('modal-pdf-preview').style.display = 'flex';
    
    cerrarModal('modal-fin-partido');
    cambiarSeccion('partidos');
    localStorage.removeItem('guardian_live_backup');
}

function generarHTMLPartido(datosPartido, listaPorteros, analisis) {
    const cfg = datosPartido.config;
    const ptit = listaPorteros.find(p => p.id === cfg.titular);
    
    // Generar Stats Porteros
    let porterosHTML = '';
    let analisisHTML = '';
    
    [...datosPartido.porterosJugaron].forEach(pid => {
        const p = listaPorteros.find(x => x.id === pid);
        if(!p) return;
        
        const acs = datosPartido.acciones.filter(a => a.pid === pid && a.tipo === 'ACCION');
        const ok = acs.filter(a => a.res === 'CORRECTO').length;
        const perc = acs.length ? Math.round((ok / acs.length) * 100) : 0;
        const segs = datosPartido.minutosJugados[pid] || 0;
        const minsCalc = segs > 0 ? Math.ceil(segs / 60) : 0;
        const foto = p.foto || "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgOGEzIDMgMCAxIDAgMCA2IDMgMyAwIDAgMCAwLTZ6bS01IDlsMTAgMGE3IDcgMCAwIDEtMTAgMHoiLz48L3N2Zz4=";

        porterosHTML += `<div class="pdf-portero-ficha"><img src="${foto}" class="pdf-portero-foto" style="width:50px!important; height:50px!important; object-fit:cover!important; border-radius:50%!important;"><div class="pdf-portero-datos"><h4>${p.nombre}</h4><p>${acs.length} Acciones (${perc}% Acierto) | ✅${ok} ❌${acs.length-ok} | ⏱️ ${minsCalc}'</p></div></div>`;
        
        // Datos Análisis (si existen)
        const ana = analisis[pid] || { pos: "-", neg: "-", tras: "-" };
        analisisHTML += `<div class="pdf-obs-box"><div class="pdf-obs-header">${p.nombre} (${minsCalc}')</div><div style="font-size:11px; margin-bottom:5px;"><strong>(+)</strong> ${ana.pos}</div><div style="font-size:11px; margin-bottom:5px;"><strong>(-)</strong> ${ana.neg}</div><div style="font-size:11px;"><strong>Trascendencia:</strong> ${ana.tras}</div></div>`;
    });

    // Generar Cronología
    let cronoHTML = '';
    const accionesOrdenadas = [...datosPartido.acciones].sort((a,b) => a.seg - b.seg);
    accionesOrdenadas.forEach(a => {
        let resTxt = a.res || '-';
        let cl = '';
        if(a.res === 'CORRECTO') resTxt = '<span class="text-success">CORRECTO</span>';
        if(a.res === 'ERROR') resTxt = '<span class="text-danger">ERROR</span>';
        if(a.tipo === 'GOL_FAVOR') cl = 'pdf-crono-gol-atm';
        if(a.tipo === 'GOL_CONTRA') cl = 'pdf-crono-gol-rival';
        if(a.tipo === 'GOL_ANULADO') cl = 'pdf-crono-gol-rival';
        
        if (a.tipo === 'HITO') {
             cronoHTML += `<tr style="background:#444; color:white;"><td colspan="5" style="text-align:center; font-weight:bold; padding:4px;">${a.nom}</td></tr>`;
        } else {
             cronoHTML += `<tr class="${cl}"><td><strong>${a.min}</strong><br><span style="font-size:9px;color:#666">${a.parte}</span></td><td class="pdf-crono-evento">${a.nom}</td><td>${a.pnom}</td><td>${resTxt}</td><td style="font-style:italic;font-size:10px">${a.obs||''}</td></tr>`;
        }
    });

    return `
        <div class="pdf-container">
            <div class="pdf-header-pro"><img src="ESCUDO ATM.png" class="pdf-logo" alt="ATM"><div class="pdf-title-box"><h1>ATLÉTICO DE MADRID</h1><h2>SEGUIMIENTO DE PORTEROS</h2></div></div><div class="pdf-divider-red"></div>
            <div class="pdf-section-pro"><h3 class="pdf-section-title">INFORMACIÓN DEL PARTIDO</h3><table class="pdf-table-info"><tr><td><strong>Equipo:</strong> ${cfg.equipo}</td><td><strong>Categoría:</strong> ${ptit ? ptit.categoria : '-'}</td><td><strong>Tipo:</strong> ${cfg.tipo}</td><td><strong>Jornada:</strong> ${cfg.jornada}</td></tr><tr><td><strong>Rival:</strong> ${cfg.rival}</td><td><strong>Fecha:</strong> ${cfg.fecha}</td><td><strong>Dificultad:</strong> ${cfg.dificultad}</td><td><strong>Entrenador:</strong> ${cfg.entrenador}</td></tr><tr><td><strong>Campo:</strong> ${cfg.campo || "-"}</td><td><strong>Condición:</strong> ${cfg.condicion || "-"}</td><td colspan="2"></td></tr><tr><td colspan="4" style="background-color: #f4f4f4; text-align: center; font-size: 14px; padding: 10px;"><strong>RESULTADO:</strong> ATM <span style="color:#CB3524; font-size:16px; font-weight:bold">${datosPartido.marcador.local}</span> - <span style="color:#CB3524; font-size:16px; font-weight:bold">${datosPartido.marcador.rival}</span> RIVAL</td></tr></table></div>
            <div class="pdf-section-pro"><h3 class="pdf-section-title">PORTEROS Y ESTADÍSTICAS</h3>${porterosHTML}</div>
            <div class="pdf-section-pro"><h3 class="pdf-section-title">REGISTRO CRONOLÓGICO</h3><table class="pdf-crono-table"><thead><tr><th width="8%">Min</th><th width="35%">Acción</th><th width="20%">Portero</th><th width="12%">Calif.</th><th width="25%">Obs.</th></tr></thead><tbody id="print-cronologia-body">${cronoHTML}</tbody></table></div>
            <div class="pdf-section-pro"><h3 class="pdf-section-title">ANÁLISIS TÉCNICO INDIVIDUAL</h3>${analisisHTML}</div>
            <div class="pdf-footer"><p>Guardian Lab ATM Pro - Informe Técnico</p></div>
        </div>
    `;
}

function imprimirPDFNativo() { window.print(); }

async function cargarPartidosHistorial(){
    const h = await dbGetAll('partidos'); 
    const c=document.getElementById('lista-partidos'); if(!c) return; 
    c.innerHTML=''; 
    h.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)); 
    h.forEach(p=>{
        c.innerHTML+=`
            <div class="match-card">
                <div style="display:flex; align-items:center;">
                    <div style="margin-right:15px; font-size:1.5rem;">⚽</div>
                    <div><div class="card-title">${p.equipo} vs ${p.rival} (${p.res})</div><div class="card-subtitle">${p.fecha}</div></div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-icon-action" onclick="abrirEdicionAnalisis(${p.id})" title="Editar Análisis">✏️</button>
                    <button class="btn-icon-action" onclick="verPDFHistorial(${p.id})" title="Ver PDF">📄</button>
                    <button class="btn-icon-action" onclick="borrarHistorial(${p.id})" title="Borrar" style="border-color:#ff4444; color:#ff4444;">🗑️</button>
                </div>
            </div>`;
    }); 
    const liveBanner = document.getElementById('live-match-banner'); 
    if(partidoLive.parteActual !== 'Pre-Partido' && partidoLive.parteActual !== 'Final'){ liveBanner.style.display = 'block'; } else { liveBanner.style.display = 'none'; }
}

async function verPDFHistorial(id){const h = await dbGetAll('partidos'); const match = h.find(x=>x.id===id); if(match && match.htmlData){ document.getElementById('preview-content').innerHTML = match.htmlData; document.getElementById('printable-area').innerHTML = match.htmlData; document.getElementById('modal-pdf-preview').style.display = 'flex'; }}
function borrarHistorial(id){if(confirm("¿Borrar?")){ dbDelete('partidos', id).then(() => cargarPartidosHistorial()); }}

// --- EDICIÓN DE ANÁLISIS ---
async function abrirEdicionAnalisis(id) {
    const h = await dbGetAll('partidos');
    const match = h.find(x => x.id === id);
    if (!match || !match.raw) return alert("Este partido es antiguo y no se puede editar el análisis.");
    
    partidoEnEdicion = match;
    const container = document.getElementById('container-editar-analisis');
    container.innerHTML = '';
    
    const ps = await dbGetAll('porteros');
    
    match.raw.porterosJugaron.forEach(pid => {
        const p = ps.find(x => x.id === pid);
        const nombre = p ? p.nombre : "Portero";
        // Si el valor guardado es un guión, lo mostramos vacío para editar
        const prev = match.raw.analisis && match.raw.analisis[pid] ? match.raw.analisis[pid] : { pos: '', neg: '', tras: '' };
        const valPos = (prev.pos === '-' || prev.pos === '') ? '' : prev.pos;
        const valNeg = (prev.neg === '-' || prev.neg === '') ? '' : prev.neg;
        const valTras = (prev.tras === '-' || prev.tras === '') ? '' : prev.tras;
        
        container.innerHTML += `
            <div class="pdf-obs-box">
                <div class="pdf-obs-header">EDITAR ANÁLISIS: ${nombre}</div>
                <textarea id="edit_pos_${pid}" class="pdf-input-read" placeholder="Lo POSITIVO...">${valPos}</textarea>
                <textarea id="edit_neg_${pid}" class="pdf-input-read" placeholder="Lo NEGATIVO...">${valNeg}</textarea>
                <textarea id="edit_tras_${pid}" class="pdf-input-read" placeholder="Trascendencia...">${valTras}</textarea>
            </div>
        `;
    });
    
    document.getElementById('modal-editar-analisis').style.display = 'flex';
}

async function guardarEdicionAnalisis() {
    if (!partidoEnEdicion) return;
    const ps = await dbGetAll('porteros');
    
    let nuevoAnalisis = {};
    partidoEnEdicion.raw.porterosJugaron.forEach(pid => {
        nuevoAnalisis[pid] = {
            pos: document.getElementById('edit_pos_'+pid).value,
            neg: document.getElementById('edit_neg_'+pid).value,
            tras: document.getElementById('edit_tras_'+pid).value
        };
    });
    
    partidoEnEdicion.raw.analisis = nuevoAnalisis;
    
    const nuevoHTML = generarHTMLPartido(partidoEnEdicion.raw, ps, nuevoAnalisis);
    partidoEnEdicion.htmlData = nuevoHTML;
    
    await dbSave('partidos', partidoEnEdicion);
    
    alert("Análisis actualizado y PDF regenerado.");
    document.getElementById('modal-editar-analisis').style.display = 'none';
    cargarPartidosHistorial(); 
}