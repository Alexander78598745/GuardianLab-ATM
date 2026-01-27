// --- VARIABLES GLOBALES ---
let partidoLive = { 
    config: {}, acciones: [], marcador: {local:0, rival:0}, 
    porterosJugaron: new Set(), minutosJugados: {}, porteroActualId: null, 
    parteActual: 'Pre-Partido', crono: {seg:0, int:null, run:false} 
};
let accionTemporal = null;
let porteroEnEdicionId = null;

// COLA TEMPORAL Y VARIABLE PARA SELECCIÓN DE COMPETENCIA
let evaluacionesTemporales = [];
let competenciaSeleccionada = null; 

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

document.addEventListener('DOMContentLoaded', () => {
    cargarPorteros();
    const today = new Date().toISOString().split('T')[0];
    const fSes = document.getElementById('fechaSesion'); if(fSes) fSes.value=today;
    const fConf = document.getElementById('conf-fecha'); if(fConf) fConf.value=today;
    const fObj = document.getElementById('obj-fecha'); if(fObj) fObj.value=today;
    
    cargarHistorialReportes(); 
    cargarPartidosHistorial();
    if(localStorage.getItem('guardian_theme') === 'light'){ document.body.classList.add('light-mode'); document.querySelector('.theme-toggle').innerText = '🌙'; }
});

function alternarTema() { document.body.classList.toggle('light-mode'); const isLight = document.body.classList.contains('light-mode'); document.querySelector('.theme-toggle').innerText = isLight ? '🌙' : '☀️'; localStorage.setItem('guardian_theme', isLight ? 'light' : 'dark'); }

// NAVEGACIÓN
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

// --- PORTEROS (CON COMPRESOR) ---
function previsualizarFoto(){const file=document.getElementById('fotoPorteroInput').files[0];if(file){const r=new FileReader();r.onload=(e)=>document.getElementById('fotoPreview').src=e.target.result;r.readAsDataURL(file);}}
function actualizarEquipos(){const cat=document.getElementById('catPortero').value;const sel=document.getElementById('equipoPortero');sel.innerHTML='<option value="">Equipo...</option>';if(!cat)return;['A','B','C','D','E','F'].forEach(l=>sel.innerHTML+=`<option value="${cat} ${l}">${cat} ${l}</option>`);}
function cargarPorteros(){ const l=JSON.parse(localStorage.getItem('guardian_porteros'))||[]; const tot=document.getElementById('total-porteros'); if(tot) tot.innerText=l.length; const c=document.getElementById('lista-porteros'); if(c){ c.innerHTML=''; const def="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDIxdi0yYTQgNCAwIDAgMC00LTRoLThhNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PC9zdmc+"; l.forEach(p=>{ c.innerHTML+=`<div class="portero-card"><div style="display:flex; align-items:center;"><img src="${p.foto||def}" class="mini-foto-list"><div><div class="card-title">${p.nombre}</div><div class="card-subtitle">${p.equipo} (${p.anio||'-'})</div></div></div><div><button class="btn-icon-action" onclick="cargarDatosEdicion(${p.id})" style="border-color:#00ff88; color:#00ff88; margin-right:5px;">✏️</button><button class="btn-trash" onclick="borrarPortero(${p.id})">🗑️</button></div></div>`; }); } const opts = '<option value="">Seleccionar Portero...</option>' + l.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join(''); if(document.getElementById('obj-portero')) document.getElementById('obj-portero').innerHTML = opts; if(document.getElementById('select-stats-portero')) document.getElementById('select-stats-portero').innerHTML = opts; if(document.getElementById('eval-portero')) document.getElementById('eval-portero').innerHTML = opts; }

function procesarPortero(){ 
    const n=document.getElementById('nombrePortero').value; 
    const a=document.getElementById('anioPortero').value; 
    const c=document.getElementById('catPortero').value; 
    const eq=document.getElementById('equipoPortero').value; 
    const file=document.getElementById('fotoPorteroInput').files[0]; 

    // FIX TABLET: Si hay categoría pero no equipo, intentar actualizar y avisar
    if(c && (!eq || eq === "")) {
        actualizarEquipos();
        return alert("⚠️ Por favor, selecciona el EQUIPO de la lista.");
    }

    if(!n||!c||!eq) return alert("Faltan datos"); 

    const save=(foto)=>{ 
        let l=JSON.parse(localStorage.getItem('guardian_porteros'))||[]; 
        if(porteroEnEdicionId){ 
            const idx=l.findIndex(p=>p.id===porteroEnEdicionId); 
            if(idx!==-1){ l[idx].nombre=n; l[idx].anio=a; l[idx].categoria=c; l[idx].equipo=eq; if(foto) l[idx].foto=foto; } 
        } else { 
            l.push({id:Date.now(),nombre:n,anio:a,categoria:c,equipo:eq,foto:foto}); 
        } 
        try {
            localStorage.setItem('guardian_porteros',JSON.stringify(l)); 
            cancelarEdicion(); 
            cargarPorteros(); 
        } catch (e) {
            alert("⚠️ Memoria llena. El compresor debería evitar esto.");
        }
    }; 
    
    if(file){
        // --- COMPRESOR DE IMAGEN (SOLUCIÓN TABLET) ---
        const r=new FileReader(); 
        r.onload=(e)=>{
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                // Redimensionar a 200px (Suficiente para miniatura y PDF)
                const max = 200;
                let w = img.width; let h = img.height;
                if(w>h){ if(w>max){ h*=max/w; w=max; } } else { if(h>max){ w*=max/h; h=max; } }
                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                // Guardar como JPEG calidad baja (0.6)
                save(canvas.toDataURL('image/jpeg', 0.6)); 
            };
        };
        r.readAsDataURL(file);
    } else {
        save(null); 
    }
}

function cargarDatosEdicion(id){const l=JSON.parse(localStorage.getItem('guardian_porteros')); const p=l.find(x=>x.id===id); if(p){ document.getElementById('nombrePortero').value=p.nombre; document.getElementById('anioPortero').value=p.anio; document.getElementById('catPortero').value=p.categoria; actualizarEquipos(); document.getElementById('equipoPortero').value=p.equipo; document.getElementById('fotoPreview').src=p.foto||""; porteroEnEdicionId=id; document.getElementById('btn-save').innerText="Guardar Cambios"; document.getElementById('btn-cancel').style.display="inline-block"; window.scrollTo({top:0,behavior:'smooth'});}}
function cancelarEdicion(){porteroEnEdicionId=null; document.getElementById('nombrePortero').value=''; document.getElementById('anioPortero').value=''; document.getElementById('catPortero').value=''; document.getElementById('equipoPortero').innerHTML=''; document.getElementById('fotoPreview').src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgOGEzIDMgMCAxIDAgMCA2IDMgMyAwIDAgMCAwLTZ6bS01IDlsMTAgMGE3IDcgMCAwIDEtMTAgMHoiLz48L3N2Zz4="; document.getElementById('btn-save').innerText="Añadir Jugador"; document.getElementById('btn-cancel').style.display="none";}
function borrarPortero(id){if(confirm("¿Borrar?")){let l=JSON.parse(localStorage.getItem('guardian_porteros'))||[];l=l.filter(p=>p.id!==id);localStorage.setItem('guardian_porteros',JSON.stringify(l));cargarPorteros();}}
function agregarSesion(){} function cargarSesiones(){} function borrarSesion(id){} function cargarOpcionesStats(){} function actualizarGrafica(){}

// --- MÓDULO OBJETIVOS (LÓGICA ACUMULATIVA & PACKS) ---
function resetearEvaluacionTemporal() { evaluacionesTemporales = []; competenciaSeleccionada = null; selectCompetencia(null); renderizarListaTemporal(); document.getElementById('contenedor-evaluacion-temporal').style.display = 'none'; cargarAccionesObjetivos(); }

function cargarAccionesObjetivos() {
    const tipo = document.getElementById('obj-tipo').value;
    const sel = document.getElementById('obj-accion');
    sel.innerHTML = '<option value="">Seleccionar Acción...</option>';
    sel.disabled = true;
    if (tipo && ACCIONES_EVALUACION[tipo]) {
        sel.disabled = false;
        // Filtrar acciones YA usadas
        ACCIONES_EVALUACION[tipo].forEach(acc => {
            if (!evaluacionesTemporales.some(e => e.accion === acc)) {
                sel.innerHTML += `<option value="${acc}">${acc}</option>`;
            }
        });
    }
}

function selectCompetencia(val) {
    competenciaSeleccionada = val;
    document.querySelectorAll('.btn-comp').forEach(b => b.classList.remove('active'));
    if(val) document.querySelector(`.btn-comp.comp-${val}`).classList.add('active');
    document.getElementById('obj-competencia-val').value = val;
}

function agregarEvaluacionTemporal() {
    const pid = document.getElementById('obj-portero').value;
    const tipo = document.getElementById('obj-tipo').value;
    const accion = document.getElementById('obj-accion').value;
    const comp = competenciaSeleccionada;
    const score = document.getElementById('obj-puntaje').value;

    if(!pid || !accion || !comp) return alert("Completa los datos");

    evaluacionesTemporales.push({ accion: accion, tipo: tipo, competencia: parseInt(comp), puntaje: parseInt(score) });
    renderizarListaTemporal();
    
    // Resetear solo campos de acción
    document.getElementById('obj-accion').value = "";
    selectCompetencia(null);
    document.getElementById('obj-puntaje').value = "1";
    
    cargarAccionesObjetivos(); // Recargar dropdown
    document.getElementById('contenedor-evaluacion-temporal').style.display = 'block';
}

function renderizarListaTemporal() {
    const cont = document.getElementById('lista-temp-evaluaciones');
    cont.innerHTML = '';
    evaluacionesTemporales.forEach(item => {
        let col = '#ccc', txt = '';
        if(item.competencia === 1) { col = 'var(--comp-1)'; txt = 'Inc. Inconsciente'; }
        if(item.competencia === 2) { col = 'var(--comp-2)'; txt = 'Inc. Consciente'; }
        if(item.competencia === 3) { col = 'var(--comp-3)'; txt = 'Comp. Consciente'; }
        if(item.competencia === 4) { col = 'var(--comp-4)'; txt = 'Comp. Inconsciente'; }
        cont.innerHTML += `<div class="item-temp-eval" style="border-left: 4px solid ${col}"><strong>${item.accion}</strong><br><span style="color:${col}">${txt}</span> | Nota: ${item.puntaje}</div>`;
    });
}

function guardarReporteCompleto() {
    const pid = document.getElementById('obj-portero').value;
    const fecha = document.getElementById('obj-fecha').value;
    if(!pid || !fecha || evaluacionesTemporales.length === 0) return alert("Sin datos");

    // 1. GUARDAR REPORTE "PACK" (Para Historial - 1 Línea)
    let reportes = JSON.parse(localStorage.getItem('guardian_reportes_completo')) || [];
    const nuevoReporte = {
        id: Date.now(),
        porteroId: parseInt(pid),
        fecha: fecha,
        acciones: evaluacionesTemporales // Guardamos el array completo
    };
    reportes.push(nuevoReporte);
    localStorage.setItem('guardian_reportes_completo', JSON.stringify(reportes));

    // 2. GUARDAR DATOS DESGLOSADOS (Para Gráfica)
    let listaGlobal = JSON.parse(localStorage.getItem('guardian_seguimientos')) || [];
    evaluacionesTemporales.forEach(item => {
        listaGlobal.push({
            id: Date.now() + Math.random(),
            porteroId: parseInt(pid),
            fecha: fecha,
            accion: item.accion,
            competencia: item.competencia,
            puntaje: item.puntaje
        });
    });
    localStorage.setItem('guardian_seguimientos', JSON.stringify(listaGlobal));
    
    // 3. GENERAR PDF
    generarPDFReporteLote(nuevoReporte);

    // 4. LIMPIAR
    resetearEvaluacionTemporal();
    cargarHistorialReportes();
}

function generarPDFReporteLote(reporte) {
    const ps = JSON.parse(localStorage.getItem('guardian_porteros'));
    const p = ps.find(x => x.id == reporte.porteroId);
    const foto = p.foto || "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgOGEzIDMgMCAxIDAgMCA2IDMgMyAwIDAgMCAwLTZ6bS01IDlsMTAgMGE3IDcgMCAwIDEtMTAgMHoiLz48L3N2Zz4=";

    let filas = '';
    reporte.acciones.forEach(item => {
        let bg = '#ccc', fg = 'white', label = '';
        if(item.competencia === 1) { bg = '#E74C3C'; label = 'INCOMP. INCONSCIENTE'; }
        if(item.competencia === 2) { bg = '#E67E22'; label = 'INCOMP. CONSCIENTE'; }
        if(item.competencia === 3) { bg = '#F1C40F'; label = 'COMP. CONSCIENTE'; fg = 'black'; }
        if(item.competencia === 4) { bg = '#27AE60'; label = 'COMP. INCONSCIENTE'; }
        
        filas += `
            <tr>
                <td style="padding:8px; border-bottom:1px solid #eee;">${item.accion}</td>
                <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;"><span style="background:${bg}; color:${fg}; padding:4px 8px; border-radius:4px; font-size:10px; font-weight:bold;">${label}</span></td>
                <td style="padding:8px; border-bottom:1px solid #eee; text-align:center; font-weight:bold;">${item.puntaje}</td>
            </tr>`;
    });

    const html = `
        <div class="pdf-container">
            <div class="pdf-header-pro">
                <img src="ESCUDO ATM.png" class="pdf-logo" alt="ATM">
                <div class="pdf-title-box"><h1>ATLÉTICO DE MADRID</h1><h2>SEGUIMIENTO TÉCNICO</h2></div>
            </div>
            <div class="pdf-divider-red"></div>
            
            <div class="pdf-portero-ficha" style="margin-bottom:20px;">
                <img src="${foto}" class="pdf-portero-foto" style="width:80px!important;height:80px!important;border-radius:50%!important;">
                <div class="pdf-portero-datos" style="margin-left:20px;">
                    <h2 style="margin:0;color:#CB3524;">${p.nombre}</h2>
                    <p style="margin:5px 0;">${p.equipo} - ${p.categoria}</p>
                    <p>Fecha Reporte: <strong>${reporte.fecha}</strong></p>
                </div>
            </div>

            <div class="pdf-section-pro">
                <h3 class="pdf-section-title">EVALUACIÓN DE COMPETENCIAS</h3>
                <table style="width:100%; border-collapse:collapse; font-size:12px;">
                    <thead><tr style="background:#f0f0f0;"><th style="padding:10px;">Acción Técnica</th><th style="padding:10px;text-align:center;">Nivel</th><th style="padding:10px;text-align:center;">Nota</th></tr></thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>
            <div class="pdf-footer"><p>Guardian Lab ATM Pro - Reporte de Seguimiento</p></div>
        </div>`;

    document.getElementById('preview-content').innerHTML = html;
    document.getElementById('printable-area').innerHTML = html;
    document.getElementById('modal-pdf-preview').style.display = 'flex';
}

function cargarHistorialReportes() {
    const reportes = JSON.parse(localStorage.getItem('guardian_reportes_completo')) || [];
    const ps = JSON.parse(localStorage.getItem('guardian_porteros')) || [];
    const cont = document.getElementById('lista-seguimientos');
    if(!cont) return;
    cont.innerHTML = '';
    const ultimos = reportes.slice(-10).reverse();

    ultimos.forEach(rep => {
        const p = ps.find(x => x.id === rep.porteroId);
        if(!p) return;
        cont.innerHTML += `
            <div class="eval-card" style="border-left: 5px solid var(--atm-blue)">
                <div>
                    <div style="font-weight:bold;font-size:0.9rem;">${p.nombre}</div>
                    <div style="font-size:0.8rem;color:var(--text-sec);">Reporte Completo (${rep.acciones.length} acciones)</div>
                    <div style="font-size:0.75rem;margin-top:4px;">${rep.fecha}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-icon-action" onclick="verPDFReporte(${rep.id})" title="Ver PDF">📄</button>
                    <button class="btn-trash" onclick="borrarReporte(${rep.id})">🗑️</button>
                </div>
            </div>`;
    });
}

function verPDFReporte(id) {
    const reportes = JSON.parse(localStorage.getItem('guardian_reportes_completo'));
    const reporte = reportes.find(r => r.id === id);
    if(reporte) generarPDFReporteLote(reporte);
}

function borrarReporte(id) { 
    if(confirm("¿Borrar este reporte?")) { 
        let reportes = JSON.parse(localStorage.getItem('guardian_reportes_completo')) || []; 
        reportes = reportes.filter(x => x.id !== id); 
        localStorage.setItem('guardian_reportes_completo', JSON.stringify(reportes)); 
        cargarHistorialReportes(); 
    } 
}

function actualizarGrafica() {
    const pid = document.getElementById('select-stats-portero').value;
    if(!pid) return;
    const lista = JSON.parse(localStorage.getItem('guardian_seguimientos')) || [];
    const evs = lista.filter(x => x.porteroId == pid);
    
    let totalScore = 0; evs.forEach(e => totalScore += e.puntaje);
    const media = evs.length ? (totalScore / evs.length).toFixed(1) : "-";
    document.getElementById('kpi-media').innerText = media;
    document.getElementById('kpi-clean-sheets').innerText = evs.length;

    const ultimas = evs.slice(0, 10).reverse();
    const labels = ultimas.map(e => e.fecha.substring(5));
    const data = ultimas.map(e => e.puntaje);

    const ctx = document.getElementById('graficaRendimiento').getContext('2d');
    if(window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Puntaje Objetivos', data: data, borderColor: '#CB3524', backgroundColor: 'rgba(203,53,36,0.1)', tension: 0.4, fill: true }] }, options: { scales: { y: { min: 0, max: 5 } }, plugins: { legend: { display: false } } } });
}

// --- RESTO FUNCIONES PARTIDOS, LIVE, ETC. (SIN CAMBIOS) ---
function abrirConfigPartido() { if(partidoLive.parteActual !== 'Pre-Partido' && partidoLive.parteActual !== 'Final') { if(!confirm("⚠️ ¡HAY UN PARTIDO EN JUEGO!")) return; } const ps=JSON.parse(localStorage.getItem('guardian_porteros'))||[]; const equipos=[...new Set(ps.map(p=>p.equipo))].sort(); const selE=document.getElementById('conf-equipo'); selE.innerHTML='<option value="">Equipo ATM...</option>'; equipos.forEach(e=>selE.innerHTML+=`<option value="${e}">${e}</option>`); filtrarPorterosPorEquipo(); document.getElementById('modal-config-partido').style.display='flex'; }
function filtrarPorterosPorEquipo() { const eq = document.getElementById('conf-equipo').value; const ps=JSON.parse(localStorage.getItem('guardian_porteros'))||[]; const sel=document.getElementById('conf-portero-titular'); sel.innerHTML='<option value="">Titular...</option>'; ps.filter(p=>p.equipo===eq).forEach(p=>sel.innerHTML+=`<option value="${p.id}">${p.nombre}</option>`); }
function cerrarModal(id){document.getElementById(id).style.display='none';}
function iniciarLivePro() { const cfg = { equipo: document.getElementById('conf-equipo').value, tipo: document.getElementById('conf-tipo').value, titular: parseInt(document.getElementById('conf-portero-titular').value), rival: document.getElementById('conf-rival').value, fecha: document.getElementById('conf-fecha').value, jornada: document.getElementById('conf-jornada').value, dificultad: document.getElementById('conf-dificultad').value, entrenador: document.getElementById('conf-entrenador').value, campo: document.getElementById('conf-campo').value, condicion: document.getElementById('conf-condicion').value }; if(!cfg.equipo||!cfg.titular||!cfg.rival) return alert("Faltan datos"); if(partidoLive.crono.int) clearInterval(partidoLive.crono.int); partidoLive = { config:cfg, acciones:[], marcador:{local:0,rival:0}, porterosJugaron:new Set([cfg.titular]), minutosJugados:{}, porteroActualId:cfg.titular, parteActual:'Pre-Partido', crono:{seg:0,int:null,run:false} }; partidoLive.minutosJugados[cfg.titular]=0; document.getElementById('live-equipo-local').innerText=cfg.equipo; document.getElementById('live-equipo-rival').innerText=cfg.rival; document.getElementById('score-local').innerText='0'; document.getElementById('score-rival').innerText='0'; document.getElementById('crono').innerText='00:00'; document.getElementById('live-log').innerHTML=''; actualizarUI(); categoriaAccionActiva = "DEFENSIVAS"; renderizarPanelAcciones(); cerrarModal('modal-config-partido'); cambiarSeccion('live'); }
function actualizarUI() { const ps=JSON.parse(localStorage.getItem('guardian_porteros')); const p=ps.find(x=>x.id===partidoLive.porteroActualId); document.getElementById('live-portero-nombre').innerText = p ? p.nombre : "Desconocido"; document.getElementById('live-portero-foto').src = p && p.foto ? p.foto : "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDIxdi0yYTQgNCAwIDAgMC00LTRoLThhNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSI3IiByPSI0Ii8+PC9zdmc+"; }
function renderizarPanelAcciones() { const panel = document.getElementById('panel-acciones-avanzado'); panel.innerHTML = ''; const tabsContainer = document.createElement('div'); tabsContainer.className = 'tabs-container'; Object.keys(CATALOGO_ACCIONES).forEach(catNombre => { const catData = CATALOGO_ACCIONES[catNombre]; const btn = document.createElement('button'); btn.innerText = catNombre; btn.className = `tab-btn ${categoriaAccionActiva === catNombre ? 'active' : ''}`; btn.dataset.cat = catData.id; btn.onclick = () => { categoriaAccionActiva = catNombre; renderizarPanelAcciones(); }; tabsContainer.appendChild(btn); }); panel.appendChild(tabsContainer); const grupos = CATALOGO_ACCIONES[categoriaAccionActiva].grupos; const catId = CATALOGO_ACCIONES[categoriaAccionActiva].id; Object.keys(grupos).forEach(grupoNombre => { const titulo = document.createElement('div'); titulo.className = 'action-group-title'; titulo.innerText = grupoNombre; panel.appendChild(titulo); const grid = document.createElement('div'); grid.className = 'actions-grid-new'; grupos[grupoNombre].forEach(accionNombre => { const btn = document.createElement('button'); btn.innerText = accionNombre; btn.className = `action-btn-new btn-${catId}`; btn.onclick = () => prepararAccion(accionNombre); grid.appendChild(btn); }); panel.appendChild(grid); }); }
function gestionarGol(equipo, accion) { if(!partidoLive.crono.run) return alert("Crono parado"); if (equipo === 'local') { if (accion === 'sumar') { partidoLive.marcador.local++; regEv('GOL_FAVOR', 'Gol ATM'); } else { if (partidoLive.marcador.local > 0) { partidoLive.marcador.local--; regEv('GOL_ANULADO', 'Gol ATM Anulado', null, 'Corrección Marcador'); } } document.getElementById('score-local').innerText = partidoLive.marcador.local; } else if (equipo === 'rival') { if (accion === 'sumar') { abrirModalGolRival(); } else { if (partidoLive.marcador.rival > 0) { partidoLive.marcador.rival--; regEv('GOL_ANULADO', 'Gol Rival Anulado', null, 'Corrección Marcador'); document.getElementById('score-rival').innerText = partidoLive.marcador.rival; } } } }
function prepararVistaPreviaPDF(){ const cfg=partidoLive.config; const ps=JSON.parse(localStorage.getItem('guardian_porteros')); document.getElementById('print-equipo').innerText=cfg.equipo; document.getElementById('print-campo').innerText=cfg.campo||"-"; document.getElementById('print-condicion').innerText=cfg.condicion||"-"; const ptit=ps.find(p=>p.id===cfg.titular); document.getElementById('print-categoria').innerText=ptit?ptit.categoria:'-'; document.getElementById('print-tipo').innerText=cfg.tipo; document.getElementById('print-jornada').innerText=cfg.jornada; document.getElementById('print-rival').innerText=cfg.rival; document.getElementById('print-fecha').innerText=cfg.fecha; document.getElementById('print-dificultad').innerText=cfg.dificultad; document.getElementById('print-entrenador').innerText=cfg.entrenador; document.getElementById('print-res-local').innerText=partidoLive.marcador.local; document.getElementById('print-res-rival').innerText=partidoLive.marcador.rival; const stCont = document.getElementById('print-porteros-stats'); stCont.innerHTML=''; const anCont = document.getElementById('print-analisis-individual'); anCont.innerHTML=''; partidoLive.porterosJugaron.forEach(pid=>{ const p=ps.find(x=>x.id===pid); const acs=partidoLive.acciones.filter(a=>a.pid===pid && a.tipo==='ACCION'); const ok=acs.filter(a=>a.res==='CORRECTO').length; const perc=acs.length?Math.round((ok/acs.length)*100):0; const segs = partidoLive.minutosJugados[pid] || 0; const minsCalc = segs > 0 ? Math.ceil(segs / 60) : 0; const foto=p.foto||"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48cGF0aCBkPSJNMTIgOGEzIDMgMCAxIDAgMCA2IDMgMyAwIDAgMCAwLTZ6bS01IDlsMTAgMGE3IDcgMCAwIDEtMTAgMHoiLz48L3N2Zz4="; stCont.innerHTML+=`<div class="pdf-portero-ficha"><img src="${foto}" class="pdf-portero-foto" style="width:50px!important; height:50px!important; object-fit:cover!important; border-radius:50%!important;"><div class="pdf-portero-datos"><h4>${p.nombre}</h4><p>${acs.length} Acciones (${perc}% Acierto) | ✅${ok} ❌${acs.length-ok} | ⏱️ ${minsCalc}'</p></div></div>`; const posVal = document.getElementById('pos_'+pid).value || "-"; const negVal = document.getElementById('neg_'+pid).value || "-"; const trasVal = document.getElementById('tras_'+pid).value || "-"; anCont.innerHTML += `<div class="pdf-obs-box"><div class="pdf-obs-header">${p.nombre} (${minsCalc}')</div><div style="font-size:11px; margin-bottom:5px;"><strong>(+)</strong> ${posVal}</div><div style="font-size:11px; margin-bottom:5px;"><strong>(-)</strong> ${negVal}</div><div style="font-size:11px;"><strong>Trascendencia:</strong> ${trasVal}</div></div>`; }); const tb=document.getElementById('print-cronologia-body'); tb.innerHTML=''; partidoLive.acciones.sort((a,b)=>a.seg-b.seg); partidoLive.acciones.forEach(a=>{ let resTxt = a.res || '-'; let cl = ''; if(a.res === 'CORRECTO') resTxt = '<span class="text-success">CORRECTO</span>'; if(a.res === 'ERROR') resTxt = '<span class="text-danger">ERROR</span>'; if(a.tipo === 'GOL_FAVOR') cl = 'pdf-crono-gol-atm'; if(a.tipo === 'GOL_CONTRA') cl = 'pdf-crono-gol-rival'; if(a.tipo === 'GOL_ANULADO') cl = 'pdf-crono-gol-rival'; tb.innerHTML+=`<tr class="${cl}"><td><strong>${a.min}</strong><br><span style="font-size:9px;color:#666">${a.parte}</span></td><td class="pdf-crono-evento">${a.nom}</td><td>${a.pnom}</td><td>${resTxt}</td><td style="font-style:italic;font-size:10px">${a.obs||''}</td></tr>`; }); const template = document.getElementById('plantilla-pdf-pro'); document.getElementById('preview-content').innerHTML = template.innerHTML; document.getElementById('printable-area').innerHTML = template.innerHTML; guardarHistorial(cfg, partidoLive.marcador, 0, cfg.fecha, template.innerHTML); cerrarModal('modal-fin-partido'); document.getElementById('modal-pdf-preview').style.display = 'flex'; cambiarSeccion('partidos'); }
function imprimirPDFNativo() { window.print(); }
function guardarHistorial(cfg, marc, total, fecha, htmlData){const nuevo={id:Date.now(), equipo:cfg.equipo, rival:cfg.rival, res:`${marc.local}-${marc.rival}`, fecha, total, htmlData}; let h=JSON.parse(localStorage.getItem('guardian_historial'))||[]; h.push(nuevo); localStorage.setItem('guardian_historial',JSON.stringify(h)); cargarPartidosHistorial();}
function cargarPartidosHistorial(){const h=JSON.parse(localStorage.getItem('guardian_historial'))||[]; const c=document.getElementById('lista-partidos'); if(!c) return; c.innerHTML=''; h.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)); h.forEach(p=>{c.innerHTML+=`<div class="match-card"><div style="display:flex; align-items:center;"><div style="margin-right:15px; font-size:1.5rem;">⚽</div><div><div class="card-title">${p.equipo} vs ${p.rival} (${p.res})</div><div class="card-subtitle">${p.fecha}</div></div></div><div><button class="btn-icon-action" onclick="verPDFHistorial(${p.id})" title="Ver PDF">📄 Ver</button><button class="btn-icon-action" onclick="borrarHistorial(${p.id})" title="Borrar" style="border-color:#ff4444; color:#ff4444;">🗑️</button></div></div>`;}); const liveBanner = document.getElementById('live-match-banner'); if(partidoLive.parteActual !== 'Pre-Partido' && partidoLive.parteActual !== 'Final'){ liveBanner.style.display = 'block'; } else { liveBanner.style.display = 'none'; }}
function verPDFHistorial(id){const h=JSON.parse(localStorage.getItem('guardian_historial')).find(x=>x.id===id); if(h && h.htmlData){ document.getElementById('preview-content').innerHTML = h.htmlData; document.getElementById('printable-area').innerHTML = h.htmlData; document.getElementById('modal-pdf-preview').style.display = 'flex'; }}
function borrarHistorial(id){if(confirm("¿Borrar?")){let h=JSON.parse(localStorage.getItem('guardian_historial'))||[];h=h.filter(x=>x.id!==id);localStorage.setItem('guardian_historial',JSON.stringify(h));cargarPartidosHistorial();}}
function agregarSesion(){} function cargarSesiones(){} function borrarSesion(id){} function cargarOpcionesStats(){}
function controlCrono(act){ const c=partidoLive.crono; if(act==='start'||act==='ini2'){ if(c.run)return; c.run=true; c.int=setInterval(()=>{ c.seg++; updCrono(); if(partidoLive.porteroActualId) { if(!partidoLive.minutosJugados[partidoLive.porteroActualId]) partidoLive.minutosJugados[partidoLive.porteroActualId]=0; partidoLive.minutosJugados[partidoLive.porteroActualId]++; } },1000); partidoLive.parteActual=(act==='start')?'1ª Parte':'2ª Parte'; regEv('HITO', partidoLive.parteActual); } if(act==='fin1'||act==='fin'){ clearInterval(c.int); c.run=false; partidoLive.parteActual=(act==='fin1')?'Descanso':'Final'; regEv('HITO', partidoLive.parteActual); if(act==='fin') abrirModalFin(); } ['btn-start-partido','btn-fin-1','btn-ini-2','btn-fin-partido'].forEach(i=>document.getElementById(i).style.display='none'); if(act==='start') document.getElementById('btn-fin-1').style.display='block'; if(act==='fin1') document.getElementById('btn-ini-2').style.display='block'; if(act==='ini2') document.getElementById('btn-fin-partido').style.display='block'; }
function updCrono(){ const m=Math.floor(partidoLive.crono.seg/60), s=partidoLive.crono.seg%60; document.getElementById('crono').innerText=`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }
function regEv(tipo, nom, res=null, obs=null){ const min=Math.floor(partidoLive.crono.seg/60)+1; const ps=JSON.parse(localStorage.getItem('guardian_porteros')); const p=ps.find(x=>x.id===partidoLive.porteroActualId); const ev={id:Date.now(), min:min+"'", parte:partidoLive.parteActual, seg:partidoLive.crono.seg, tipo, nom, pid:partidoLive.porteroActualId, pnom:p?p.nombre:'-', res, obs}; partidoLive.acciones.push(ev); const log=document.getElementById('live-log'); let cl='',ic=''; if(tipo==='ACCION'){cl=res==='CORRECTO'?'log-ok':'log-error';ic=res==='CORRECTO'?'✅':'❌';} if(tipo==='GOL_FAVOR'){cl='log-gol-atm';ic='⚽';} if(tipo==='GOL_CONTRA'){cl='log-gol-rival';ic='🥅';} if(tipo==='GOL_ANULADO'){cl='log-anulado';ic='🚫';} log.innerHTML=`<div class="log-item ${cl}"><div><strong>${ev.min}</strong> ${nom} (${ev.pnom})</div><div>${ic}</div></div>`+log.innerHTML; }
function prepararAccion(n){if(!partidoLive.crono.run)return alert("Crono parado"); accionTemporal=n; document.getElementById('accion-titulo').innerText=n; document.getElementById('modal-accion').style.display='flex';}
function guardarAccionLive(r){ regEv('ACCION', accionTemporal, r, document.getElementById('accion-obs').value); document.getElementById('modal-accion').style.display='none'; document.getElementById('accion-obs').value=''; }
function registrarGol(tipo){ if(!partidoLive.crono.run)return alert("Crono parado"); if(tipo==='favor'){ partidoLive.marcador.local++; document.getElementById('score-local').innerText=partidoLive.marcador.local; regEv('GOL_FAVOR','Gol ATM'); } }
function abrirModalGolRival(){ if(!partidoLive.crono.run)return alert("Crono parado"); document.getElementById('modal-gol-rival').style.display='flex'; }
function mostrarInputError(){ document.getElementById('div-error-detalle').style.display='block'; }
function registrarGolContra(isError){ partidoLive.marcador.rival++; document.getElementById('score-rival').innerText=partidoLive.marcador.rival; let obs = isError ? "ERROR: " + document.getElementById('gol-error-detalle').value : ""; regEv('GOL_CONTRA', 'Gol Rival', isError?'ERROR':null, obs); document.getElementById('div-error-detalle').style.display='none'; document.getElementById('gol-error-detalle').value=''; document.getElementById('modal-gol-rival').style.display='none'; }
function abrirModalCambio(){ if(!partidoLive.crono.run && partidoLive.parteActual!=='Descanso') return alert("Solo en juego o descanso"); const ps=JSON.parse(localStorage.getItem('guardian_porteros')); const sel=document.getElementById('select-cambio-portero'); sel.innerHTML=''; const sups = ps.filter(p => p.equipo === partidoLive.config.equipo && p.id !== partidoLive.porteroActualId); if(sups.length===0) return alert("No hay suplentes de este equipo"); sups.forEach(p=>sel.innerHTML+=`<option value="${p.id}">${p.nombre}</option>`); document.getElementById('modal-cambio').style.display='flex'; }
function confirmarCambio(){ const pid = parseInt(document.getElementById('select-cambio-portero').value); const ps=JSON.parse(localStorage.getItem('guardian_porteros')); const entra = ps.find(p=>p.id===pid); const sale = ps.find(p=>p.id===partidoLive.porteroActualId); partidoLive.porteroActualId = pid; partidoLive.porterosJugaron.add(pid); if (!partidoLive.minutosJugados[pid]) partidoLive.minutosJugados[pid] = 0; regEv('CAMBIO', `Entra ${entra.nombre}, Sale ${sale.nombre}`); actualizarUI(); document.getElementById('modal-cambio').style.display='none'; }
function abrirModalFin(){ document.getElementById('fin-res-local').innerText=partidoLive.marcador.local; document.getElementById('fin-res-rival').innerText=partidoLive.marcador.rival; const cont = document.getElementById('container-analisis-porteros'); cont.innerHTML = ''; const ps = JSON.parse(localStorage.getItem('guardian_porteros')); partidoLive.porterosJugaron.forEach(pid => { const p = ps.find(x=>x.id===pid); cont.innerHTML += `<div class="pdf-obs-box"><div class="pdf-obs-header">ANÁLISIS: ${p.nombre}</div><textarea id="pos_${pid}" class="pdf-input-read" placeholder="Lo POSITIVO..."></textarea><textarea id="neg_${pid}" class="pdf-input-read" placeholder="Lo NEGATIVO..."></textarea><textarea id="tras_${pid}" class="pdf-input-read" placeholder="Trascendencia..."></textarea></div>`; }); document.getElementById('modal-fin-partido').style.display='flex'; }