function getUser() {
  return JSON.parse(localStorage.getItem('user') || '{}');
}
function getUserRole() { return getUser().role || ''; }
function hasRole(...roles) { return roles.includes(getUserRole()); }
function canWrite() { return hasRole('ADMINISTRADOR', 'GESTION_HUMANA'); }
function canAccess(page) {
  if (page === 'usuarios' || page === 'festivos' || page === 'configuracion') return hasRole('ADMINISTRADOR');
  if (canWrite()) return true;
  return ['resumen', 'jornadas', 'reportes', 'historico'].includes(page);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

let lastReportData = null;
const MAIN_ADMIN_EMAIL = 'admin@empresa.com';

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

let _empSearchController = null;

async function searchEmployees(query, isActiveOnly = true) {
  if (_empSearchController) _empSearchController.abort();
  _empSearchController = new AbortController();
  const params = new URLSearchParams({ search: query, limit: '10' });
  if (isActiveOnly) params.set('isActive', 'true');
  try {
    const res = await fetch(`${API}/empleados?${params}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
      signal: _empSearchController.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    if (e.name === 'AbortError') return null;
    return [];
  } finally {
    _empSearchController = null;
  }
}

function formatMinutesToHours(m) {
  if (m === null || m === undefined || m === '-' || isNaN(m)) return '-';
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${h}:${String(min).padStart(2, '0')}`;
}

function downloadXLSX(filename, headers, data) {
  if (typeof XLSX === 'undefined') { snackbar('Error: Librería XLSX no disponible', true); return; }
  const wsData = [headers.map(h => (typeof h === 'string' ? h : h.label || h).toUpperCase())];
  data.forEach(row => wsData.push(headers.map(h => {
    const key = typeof h === 'string' ? h : h.key || h;
    return row[key] ?? '';
  })));
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, filename.replace(/\.xlsx$/, '') + '.xlsx');
}

function createSearchableSelect(selectEl, placeholder) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ss-wrap';
  const input = document.createElement('input');
  input.className = 'ss-input';
  input.type = 'text';
  input.placeholder = placeholder || 'Buscar...';
  input.autocomplete = 'off';

  const dropdown = document.createElement('div');
  dropdown.className = 'ss-dropdown';

  selectEl.style.display = 'none';
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);
  wrapper.appendChild(selectEl);

  let open = false;

  function renderOptions(filter) {
    const q = (filter || '').toLowerCase().trim();
    dropdown.innerHTML = '';
    let hasVisible = false;
    Array.from(selectEl.options).forEach(opt => {
      if (!opt.value) return;
      const text = opt.textContent;
      const match = !q || text.toLowerCase().includes(q);
      if (match) {
        hasVisible = true;
        const item = document.createElement('div');
        item.className = 'ss-item' + (opt.selected ? ' ss-selected' : '');
        item.textContent = text;
        item.dataset.value = opt.value;
        item.addEventListener('click', () => {
          selectEl.value = opt.value;
          input.value = text;
          dropdown.querySelectorAll('.ss-selected').forEach(el => el.classList.remove('ss-selected'));
          item.classList.add('ss-selected');
          wrapper.classList.remove('ss-open');
          open = false;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        });
        dropdown.appendChild(item);
      }
    });
    if (!hasVisible) {
      const empty = document.createElement('div');
      empty.className = 'ss-empty';
      empty.textContent = 'Sin resultados';
      dropdown.appendChild(empty);
    }
  }

  input.addEventListener('focus', () => {
    wrapper.classList.add('ss-open');
    open = true;
    renderOptions(input.value);
  });

  input.addEventListener('input', () => renderOptions(input.value));

  wrapper.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      wrapper.classList.remove('ss-open');
      open = false;
      if (!selectEl.value) input.value = '';
      else {
        const sel = selectEl.options[selectEl.selectedIndex];
        input.value = sel ? sel.textContent : '';
      }
    }
  });

  selectEl.addEventListener('ss-update', () => {
    input.value = '';
    renderOptions('');
  });

  if (selectEl.value) {
    const sel = selectEl.options[selectEl.selectedIndex];
    if (sel) input.value = sel.textContent;
  }
  renderOptions('');

  return { input, selectEl, wrapper };
}

function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  try {
    const data = await post('/auth/login', { email, password });
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    initApp();
  } catch (err) {
    errEl.textContent = err.mensaje || 'Error al iniciar sesión';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showLogin();
}

function initApp() {
  const user = getUser();
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = user.role;
  showApp();
  renderSidebar();
  navigate('resumen');
}

function renderSidebar() {
  const menu = document.getElementById('sidebarMenu');
  const pages = [
    { id: 'resumen', label: 'Resumen', icon: 'dashboard', roles: ['ADMINISTRADOR', 'GESTION_HUMANA', 'SUPERVISOR'] },
    { id: 'empleados', label: 'Empleados', icon: 'people', roles: ['ADMINISTRADOR', 'GESTION_HUMANA'] },
    { id: 'jornadas', label: 'Jornadas', icon: 'event_note', roles: ['ADMINISTRADOR', 'GESTION_HUMANA', 'SUPERVISOR'] },
    { id: 'historico', label: 'Hist\u00f3rico', icon: 'history', roles: ['ADMINISTRADOR', 'GESTION_HUMANA', 'SUPERVISOR'] },
    { id: 'reportes', label: 'Reportes', icon: 'bar_chart', roles: ['ADMINISTRADOR', 'GESTION_HUMANA', 'SUPERVISOR'] },
    { id: 'importacion', label: 'Importar', icon: 'upload_file', roles: ['ADMINISTRADOR', 'GESTION_HUMANA'] },
    { id: 'festivos', label: 'Festivos', icon: 'celebration', roles: ['ADMINISTRADOR'] },
    { id: 'configuracion', label: 'Config. laboral', icon: 'schedule', roles: ['ADMINISTRADOR'] },
    { id: 'usuarios', label: 'Usuarios', icon: 'manage_accounts', roles: ['ADMINISTRADOR'] },
  ];
  menu.innerHTML = pages
    .filter(p => p.roles.includes(getUserRole()))
    .map(p => `<a data-page="${p.id}" href="#"><span class="material-icons">${p.icon}</span>${p.label}</a>`)
    .join('');
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); navigate(a.dataset.page); });
  });
}

function navigate(page) {
  if (!canAccess(page)) { showAccessDenied(); return; }
  document.querySelectorAll('#sidebarMenu a').forEach(a => a.classList.remove('active'));
  const link = document.querySelector(`#sidebarMenu a[data-page="${page}"]`);
  if (link) link.classList.add('active');
  document.getElementById('pageContent').innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
  switch (page) {
    case 'resumen': renderResumen(); break;
    case 'empleados': renderEmpleados(); break;
    case 'configuracion': renderWorkConfig(); break;
    case 'jornadas': renderJornadas(); break;
    case 'historico': renderHistorico(); break;
    case 'festivos': renderFestivos(); break;
    case 'reportes': renderReportes(); break;
    case 'importacion': renderImportacion(); break;
    case 'usuarios': renderUsuarios(); break;
  }
}

function showAccessDenied() {
  document.getElementById('pageContent').innerHTML = `
    <div class="access-denied">
      <div class="access-denied-icon"></div>
      <h2>Acceso no autorizado</h2>
      <p>Tu rol <strong>${escapeHtml(getUserRole())}</strong> no tiene permisos para acceder a esta secci&oacute;n.</p>
      <p style="margin-top:8px;font-size:14px;color:#888">Contacta al administrador si necesitas acceso.</p>
    </div>
  `;
}

function snackbar(msg, isError) {
  const el = document.getElementById('snackbar');
  el.textContent = msg;
  el.className = 'snackbar show' + (isError ? ' error' : '');
  setTimeout(() => el.className = 'snackbar', 3000);
}

/* ------- RESUMEN ------- */
async function renderResumen() {
  const user = getUser();
  const content = document.getElementById('pageContent');
  content.innerHTML = `
    <div class="page-header"><h1>Resumen</h1></div>
    <div class="stats" id="resStats">
      <div class="stat-card"><div class="stat-spinner"></div></div>
      <div class="stat-card"><div class="stat-spinner"></div></div>
      <div class="stat-card"><div class="stat-spinner"></div></div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-avatar">${escapeHtml(user.name.charAt(0))}</span>
        <div>
          <h3>Bienvenido, ${escapeHtml(user.name)}</h3>
          <span class="badge role-badge-${escapeHtml(user.role)}">${escapeHtml(user.role)}</span>
        </div>
      </div>
      <p class="card-desc">Sistema de control y clasificaci&oacute;n de jornadas laborales.</p>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 class="card-title">Jornadas recientes</h3>
      <div id="resRecentSessions" style="margin-top:12px"><div class="loader-container"><div class="loader"></div></div></div>
    </div>
  `;
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const [empData, sesData, recent] = await Promise.all([
      get('/empleados?limit=1').catch(() => null),
      get(`/reportes/mensual?year=${year}&month=${month}`).catch(() => null),
      get('/jornadas?limit=5').catch(() => null),
    ]);
    function fmtHoras(h) {
      if (h == null || h === '?') return '?';
      const total = Math.round(parseFloat(h) * 60);
      const hrs = Math.floor(total / 60);
      const mins = total % 60;
      return hrs + ':' + String(mins).padStart(2, '0');
    }
    document.getElementById('resStats').innerHTML = `
      <div class="stat-card"><div class="stat-icon stat-icon-users"></div><h3>Empleados activos</h3><p>${empData?.meta?.total ?? '?'}</p></div>
      <div class="stat-card"><div class="stat-icon stat-icon-calendar"></div><h3>Jornadas (este mes)</h3><p>${sesData?.totalJornadas ?? '?'}</p></div>
      <div class="stat-card"><div class="stat-icon stat-icon-clock"></div><h3>Horas (este mes)</h3><p>${sesData ? fmtHoras(sesData.totalHoras) : '?'}</p></div>
    `;
    if (recent?.data?.length) {
      document.getElementById('resRecentSessions').innerHTML = `<table><thead><tr>
        <th>Empleado</th><th>Inicio</th><th>Fin</th><th>Total</th>
      </tr></thead><tbody>
        ${recent.data.map(s => `<tr>
          <td>${escapeHtml(s.employee?.firstName || '')} ${escapeHtml(s.employee?.lastName || '')}</td>
          <td>${new Date(s.startTime).toLocaleString('es-CO')}</td>
          <td>${new Date(s.endTime).toLocaleString('es-CO')}</td>
          <td><strong>${formatMinutesToHours(s.totalMinutes)}</strong></td>
        </tr>`).join('')}
      </tbody></table>`;
    } else {
      document.getElementById('resRecentSessions').innerHTML = '<p class="empty">Sin jornadas recientes.</p>';
    }
  } catch (e) { /* ignore */ }
}

/* ------- EMPLEADOS ------- */
let empPage = 1;

const debouncedLoadEmpleados = debounce(() => loadEmpleados(1), 300);

async function renderEmpleados() {
  const write = canWrite();
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Empleados</h1>
      ${write ? '<button class="btn btn-primary" onclick="showEmpModal()">+ Nuevo</button>' : ''}
    </div>
    <div class="filters">
      <input id="empSearch" placeholder="Buscar nombre, apellido o documento..." oninput="debouncedLoadEmpleados()">
      <select id="empFilter" onchange="loadEmpleados(1)">
        <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option>
      </select>
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Documento</th><th>Nombre</th><th>Cargo</th><th>Área</th><th>Estado</th>${write ? '<th>Acciones</th>' : ''}
    </tr></thead><tbody id="empTbody"></tbody></table></div>
    <div class="pagination" id="empPagination"></div>
    <div class="modal-overlay" id="empModal"><div class="modal"><h2 id="empModalTitle">Nuevo Empleado</h2>
      <div class="modal-body">
        <div class="form-row"><div class="form-group half"><label>Tipo Doc.</label><select id="f_docType"><option value="CC">CC</option><option value="CE">CE</option><option value="PASAPORTE">Pasaporte</option></select></div>
        <div class="form-group half"><label>N&uacute;mero</label><input id="f_docNum"></div></div>
        <div class="form-row"><div class="form-group half"><label>Nombres</label><input id="f_firstName"></div>
        <div class="form-group half"><label>Apellidos</label><input id="f_lastName"></div></div>
        <div class="form-row"><div class="form-group half"><label>Email</label><input id="f_email" type="email"></div>
        <div class="form-group half"><label>Tel&eacute;fono</label><input id="f_phone"></div></div>
        <div class="form-row"><div class="form-group half"><label>Cargo</label>
          <select id="f_position">
            <option value="">Seleccionar...</option>
            <option value="Practicante">Practicante</option>
            <option value="Profesional universitario(a)">Profesional universitario(a)</option>
            <option value="Profesional universitario(a) de gestion misional">Profesional universitario(a) de gesti&oacute;n misional</option>
            <option value="Profesional universitario(a) responsable de proceso">Profesional universitario(a) responsable de proceso</option>
            <option value="Promotor(a) de apoyo">Promotor(a) de apoyo</option>
            <option value="Promotor(a) de gestion">Promotor(a) de gesti&oacute;n</option>
            <option value="Tecnico(a)">T&eacute;cnico(a)</option>
            <option value="Tecnologo(a) responsable de proceso">Tecnol&oacute;go(a) responsable de proceso</option>
            <option value="Tecnologo(a)">Tecnol&oacute;go(a)</option>
          </select></div>
        <div class="form-group half"><label>&Aacute;rea / Componente</label>
          <select id="f_area">
            <option value="">Seleccionar...</option>
            <option value="Administrativo">Administrativo</option>
            <option value="Territorio">Territorio</option>
          </select></div></div>
        <div class="form-row"><div class="form-group half"><label>Config. laboral</label><select id="f_workConfigId"><option value="">Por defecto</option></select></div>
        <div class="form-group half"><label>Modalidad</label><select id="f_workModality"><option value="ADMINISTRATIVO">Administrativo</option><option value="TERRITORIO">Territorio</option></select></div></div>
        <div class="form-group"><label>Min. Semanales</label><input id="f_weeklyMinutes" type="number" min="1" value="2520"></div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal('empModal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveEmpleado()">Guardar</button>
      </div>
    </div></div>
  `;
  await loadSchedSelect();
  loadEmpleados(1);
}

async function loadSchedSelect() {
  try {
    const data = await get('/configuracion-laboral');
    const sel = document.getElementById('f_workConfigId');
    data.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name + ' (' + (c.modality === 'ADMINISTRATIVO' ? 'Admin' : 'Territorio') + ')'; sel.appendChild(o); });
  } catch (e) { /* ignore */ }
}

async function loadEmpleados(page) {
  empPage = page;
  const search = document.getElementById('empSearch')?.value || '';
  const filter = document.getElementById('empFilter')?.value || '';
  const write = canWrite();
  try {
    let q = `/empleados?page=${page}&limit=10`;
    if (search) q += `&search=${encodeURIComponent(search)}`;
    if (filter) q += `&isActive=${filter}`;
    const data = await get(q);
    document.getElementById('empTbody').innerHTML = data.data.map(e => `<tr>
      <td><span class="doc-badge">${escapeHtml(e.documentNumber)}</span></td>
      <td><strong>${escapeHtml(e.firstName)} ${escapeHtml(e.lastName)}</strong></td>
      <td>${escapeHtml(e.position) || '-'}</td>
      <td>${escapeHtml(e.area) || '-'}</td>
      <td><span class="badge ${e.isActive ? 'badge-active' : 'badge-inactive'}">${e.isActive ? 'Activo' : 'Inactivo'}</span></td>
      ${write ? `<td>
        <button class="btn btn-sm btn-secondary" onclick="editEmp(${e.id})">Editar</button>
        <button class="btn btn-sm ${e.isActive ? 'btn-warning' : 'btn-primary'}" onclick="toggleEmp(${e.id},${e.isActive})">${e.isActive ? 'Desactivar' : 'Activar'}</button>
      </td>` : ''}
    </tr>`).join('');
    renderPagination('empPagination', page, data.meta.totalPages, loadEmpleados);
  } catch (e) { snackbar('Error al cargar empleados', true); }
}

let editingEmpId = null;
function showEmpModal(emp) {
  editingEmpId = emp?.id || null;
  document.getElementById('empModalTitle').textContent = emp ? 'Editar Empleado' : 'Nuevo Empleado';
  document.getElementById('f_docType').value = emp?.documentType || 'CC';
  document.getElementById('f_docNum').value = emp?.documentNumber || '';
  document.getElementById('f_firstName').value = emp?.firstName || '';
  document.getElementById('f_lastName').value = emp?.lastName || '';
  document.getElementById('f_email').value = emp?.email || '';
  document.getElementById('f_phone').value = emp?.phone || '';
  document.getElementById('f_position').value = emp?.position || '';
  document.getElementById('f_area').value = emp?.area || '';
  if (emp?.workConfigId) document.getElementById('f_workConfigId').value = emp.workConfigId;
  document.getElementById('f_workModality').value = emp?.workModality || 'ADMINISTRATIVO';
  document.getElementById('f_weeklyMinutes').value = emp?.weeklyTargetMinutes || 2520;
  document.getElementById('empModal').classList.add('show');
}

function editEmp(id) {
  get(`/empleados/${id}`).then(emp => showEmpModal(emp)).catch(() => snackbar('Error al cargar empleado', true));
}

async function saveEmpleado() {
  const data = {
    documentType: document.getElementById('f_docType').value,
    documentNumber: document.getElementById('f_docNum').value,
    firstName: document.getElementById('f_firstName').value,
    lastName: document.getElementById('f_lastName').value,
    email: document.getElementById('f_email').value || undefined,
    phone: document.getElementById('f_phone').value || undefined,
    position: document.getElementById('f_position').value || undefined,
    area: document.getElementById('f_area').value || undefined,
    workConfigId: parseInt(document.getElementById('f_workConfigId').value) || undefined,
    workModality: document.getElementById('f_workModality').value,
    weeklyTargetMinutes: parseInt(document.getElementById('f_weeklyMinutes').value) || 2520,
  };
  try {
    if (editingEmpId) {
      await patch(`/empleados/${editingEmpId}`, data);
      snackbar('Empleado actualizado');
    } else {
      await post('/empleados', data);
      snackbar('Empleado creado');
    }
    closeModal('empModal');
    loadEmpleados(empPage);
  } catch (e) { snackbar(e.mensaje || 'Error al guardar', true); }
}

async function toggleEmp(id, active) {
  try {
    await patch(`/empleados/${id}/estado`, { activo: !active });
    snackbar(active ? 'Empleado desactivado' : 'Empleado activado');
    loadEmpleados(empPage);
  } catch (e) { snackbar('Error al cambiar estado', true); }
}

/* ------- CONFIGURACIÓN LABORAL ------- */
let editingWcId = null;

async function renderWorkConfig() {
  const write = canWrite();
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Configuración laboral</h1>
      ${write ? '<button class="btn btn-primary" onclick="showWcModal()">+ Nueva</button>' : ''}
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Nombre</th><th>Modalidad</th><th>Descanso</th><th>Semanal</th><th>Estado</th><th>Empleados</th>${write ? '<th>Acciones</th>' : ''}
    </tr></thead><tbody id="wcTbody"></tbody></table></div>
    <div class="modal-overlay" id="wcModal"><div class="modal"><h2 id="wcModalTitle">Nueva Configuración</h2>
      <div class="modal-body">
        <div class="form-row"><div class="form-group half"><label>Nombre</label><input id="wf_name"></div>
        <div class="form-group half"><label>Modalidad</label>
          <select id="wf_modality"><option value="ADMINISTRATIVO">Administrativo</option><option value="TERRITORIO">Territorio</option></select>
        </div></div>
        <div class="form-row"><div class="form-group half"><label>Descanso (min)</label><input id="wf_break" type="number" min="0" value="60"></div>
        <div class="form-group half"><label>Umbral descanso (min) — Territorio</label><input id="wf_breakThreshold" type="number" min="0" value="480" placeholder="480"></div></div>
        <div class="form-group"><label>Meta semanal (min)</label><input id="wf_weekly" type="number" min="0" value="2520"></div>
        <div class="form-group"><label>Descripción</label><textarea id="wf_description" rows="2"></textarea></div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal('wcModal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveWorkConfig()">Guardar</button>
      </div>
    </div></div>
  `;
  loadWorkConfigs();
}

async function loadWorkConfigs() {
  const write = canWrite();
  try {
    const data = await get('/configuracion-laboral');
    document.getElementById('wcTbody').innerHTML = data.map(c => {
      const dist = c.ordinaryDistributions || [];
      const info = dist.filter(d => d.ordinaryMinutesCap > 0).map(d =>
        `${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.dayOfWeek]}:${Math.round(d.ordinaryMinutesCap/60)}h`
      ).join(', ');
      return `<tr>
        <td><strong>${escapeHtml(c.name)}</strong>${c.description ? `<br><small style="color:var(--text-muted)">${escapeHtml(c.description)}</small>` : ''}</td>
        <td><span class="badge badge-${c.modality === 'ADMINISTRATIVO' ? 'primary' : 'info'}">${c.modality === 'ADMINISTRATIVO' ? 'Admin' : 'Territorio'}</span></td>
        <td>${c.breakMinutes}min${c.breakThresholdMinutes ? ' (≥'+c.breakThresholdMinutes+'min)' : ''}</td>
        <td><small>${c.weeklyTargetMinutes}min (${Math.round(c.weeklyTargetMinutes/60)}h)</small></td>
        <td><span class="badge ${c.isActive ? 'badge-active' : 'badge-inactive'}">${c.isActive ? 'Activo' : 'Inactivo'}</span></td>
        <td>${c._count?.employees ?? 0}</td>
        ${write ? `<td>
          <button class="btn btn-sm btn-secondary" onclick="editWc(${c.id})">Editar</button>
          <button class="btn btn-sm btn-secondary" onclick="showDistModal(${c.id})">Distribución</button>
          <button class="btn btn-sm ${c.isActive ? 'btn-warning' : 'btn-primary'}" onclick="toggleWc(${c.id})">${c.isActive ? 'Desactivar' : 'Activar'}</button>
        </td>` : ''}
      </tr>`;
    }).join('');
  } catch (e) { snackbar('Error al cargar configuraciones', true); }
}

function showWcModal(c) {
  editingWcId = c?.id || null;
  document.getElementById('wcModalTitle').textContent = c ? 'Editar Configuración' : 'Nueva Configuración';
  document.getElementById('wf_name').value = c?.name || '';
  document.getElementById('wf_modality').value = c?.modality || 'ADMINISTRATIVO';
  document.getElementById('wf_break').value = c?.breakMinutes ?? 60;
  document.getElementById('wf_breakThreshold').value = c?.breakThresholdMinutes ?? '';
  document.getElementById('wf_weekly').value = c?.weeklyTargetMinutes ?? 2520;
  document.getElementById('wf_description').value = c?.description || '';
  document.getElementById('wcModal').classList.add('show');
}

async function editWc(id) {
  try {
    const c = await get(`/configuracion-laboral/${id}`);
    showWcModal(c);
  } catch (e) { snackbar('Error'); }
}

async function saveWorkConfig() {
  const data = {
    name: document.getElementById('wf_name').value,
    modality: document.getElementById('wf_modality').value,
    breakMinutes: parseInt(document.getElementById('wf_break').value) || 60,
    weeklyTargetMinutes: parseInt(document.getElementById('wf_weekly').value) || 2520,
    description: document.getElementById('wf_description').value || undefined,
  };
  const bt = document.getElementById('wf_breakThreshold').value;
  if (bt) data.breakThresholdMinutes = parseInt(bt);
  try {
    if (editingWcId) {
      await patch(`/configuracion-laboral/${editingWcId}`, data);
      snackbar('Configuración actualizada');
    } else {
      await post('/configuracion-laboral', data);
      snackbar('Configuración creada');
    }
    closeModal('wcModal');
    loadWorkConfigs();
  } catch (e) { snackbar(e.mensaje || 'Error al guardar', true); }
}

async function toggleWc(id) {
  try {
    await patch(`/configuracion-laboral/${id}/estado`);
    snackbar('Estado cambiado');
    loadWorkConfigs();
  } catch (e) { snackbar('Error', true); }
}

/* ------- DISTRIBUCIÓN ORDINARIA ------- */
let editingDistConfigId = null;

const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

async function showDistModal(configId) {
  editingDistConfigId = configId;
  const old = document.getElementById('distModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay show';
  modal.id = 'distModal';
  modal.innerHTML = `
    <div class="modal" style="max-width:550px"><h2>Distribución ordinaria — <span id="distName">#${configId}</span></h2>
      <div class="modal-body">
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">Defina el tope de minutos ordinarios por día de semana. 0 = no hay ordinarios (todo es extra).</p>
        <div id="distFields"></div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeDistModal()">Cerrar</button>
        <button class="btn btn-primary" onclick="saveDist()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  try {
    const cfg = await get(`/configuracion-laboral/${configId}`);
    document.getElementById('distName').textContent = cfg.name;

    try {
      const dists = await get(`/configuracion-laboral/${configId}/distribucion`);
      renderDistFields(dists);
    } catch (e) {
      renderDistFields([]);
    }
  } catch (e) {
    snackbar('Error al cargar configuración', true);
    closeDistModal();
  }
}

function renderDistFields(existingDists) {
  const container = document.getElementById('distFields');
  const map = {};
  existingDists.forEach(d => { map[d.dayOfWeek] = d; });

  container.innerHTML = DAY_NAMES.map((name, dow) => {
    const d = map[dow];
    const cap = d?.ordinaryMinutesCap ?? '';
    return `
      <div class="form-row" style="align-items:center;margin-bottom:6px;padding:6px;background:var(--bg);border-radius:6px">
        <div class="form-group" style="flex:0 0 100px;margin:0"><label style="margin:0;font-weight:600">${name}</label></div>
        <div class="form-group" style="flex:1;margin:0"><input type="number" class="dist-cap" data-dow="${dow}" value="${cap}" placeholder="Minutos ordinarios" min="0" style="width:100%"></div>
        <span style="flex:0 0 50px;font-size:12px;color:var(--text-muted)">min</span>
      </div>`;
  }).join('');
}

async function saveDist() {
  const caps = document.querySelectorAll('.dist-cap');
  let hasError = false;

  for (const el of caps) {
    const dow = parseInt(el.dataset.dow);
    const val = el.value.trim();

    if (val === '') continue;

    const cap = parseInt(val);
    if (isNaN(cap) || cap < 0) {
      snackbar(`Valor inválido para ${DAY_NAMES[dow]}`, true);
      hasError = true;
      continue;
    }

    try {
      await post(`/configuracion-laboral/${editingDistConfigId}/distribucion`, {
        dayOfWeek: dow,
        ordinaryMinutesCap: cap,
      });
    } catch (e) {
      hasError = true;
      snackbar('Error al guardar distribución', true);
    }
  }

  if (!hasError) {
    snackbar('Distribución guardada');
    closeDistModal();
  }
}

function closeDistModal() {
  const modal = document.getElementById('distModal');
  if (modal) modal.remove();
}

/* ------- JORNADAS ------- */
let sesPage = 1;

const debouncedLoadJornadas = debounce(() => loadJornadas(1), 300);

let jornadaImportState = null;

async function renderJornadas() {
  const write = canWrite();
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Jornadas</h1></div>
    <div class="import-tabs" style="margin-bottom:16px">
      <button class="import-tab active" data-tab="listado" onclick="switchJornadasTab('listado')">Listado</button>
      <button class="import-tab" data-tab="importar" onclick="switchJornadasTab('importar')">Importar</button>
    </div>
    <div class="import-tab-content active" id="tabJorListado">
      ${write ? '<div style="margin-bottom:12px"><button class="btn btn-primary" onclick="showSesModal()">+ Nueva</button></div>' : ''}
      <div class="filters">
        <input id="sesSearch" type="date" onchange="debouncedLoadJornadas()" title="Fecha inicio">
        <input id="sesEnd" type="date" onchange="debouncedLoadJornadas()" title="Fecha fin">
        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('sesSearch').value='';document.getElementById('sesEnd').value='';debouncedLoadJornadas()">Limpiar</button>
      </div>
      <div class="table-wrap"><table><thead><tr>
        <th>Empleado</th><th>Inicio</th><th>Fin</th><th>Total</th><th title="Horas ordinarias trabajadas">Ordinarias</th><th title="Tiempo trabajado con recargo nocturno">Rec. noct.</th><th title="Horas extra diurnas">Extra diur.</th><th title="Horas extra nocturnas">Extra noct.</th><th title="Tiempo trabajado en domingo">Dominical</th><th title="Tiempo trabajado en d&iacute;a festivo">Festiva</th><th title="Horas extra festivas diurnas">Ex.fest.diur.</th><th title="Horas extra festivas nocturnas">Ex.fest.noct.</th><th title="Recargo nocturno dominical/festivo">Rec.ndf</th><th title="Tipo compensatorio">Comp.</th><th>Auditar</th>${write ? '<th>Acciones</th>' : ''}
      </tr></thead><tbody id="sesTbody"></tbody></table></div>
      <div class="pagination" id="sesPagination"></div>
    </div>
    <div class="import-tab-content" id="tabJorImportar" style="display:none">
      <div class="card">
        <h3 class="card-title">Importar jornadas desde Excel</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Selecciona un archivo Excel con los registros de jornadas. El sistema importar\u00e1 y clasificar\u00e1 cada jornada usando el motor laboral.</p>
        <div class="import-upload-area" id="jorUploadArea">
          <div class="import-upload-icon">
            <span class="material-icons" style="font-size:48px;color:var(--primary)">cloud_upload</span>
          </div>
          <p>Arrastra un archivo aqu\u00ed o haz clic para seleccionar</p>
          <p style="font-size:12px;color:var(--text-muted)">Formatos soportados: Excel (.xlsx), CSV, ODS</p>
          <input type="file" id="jorImportFileInput" accept=".xlsx,.xls,.csv,.ods" style="display:none" onchange="onJorImportFileSelect(event)">
        </div>
        <div id="jorImportFileInfo" style="display:none;margin-top:12px"></div>
        <div style="display:flex;gap:8px;margin-top:16px;align-items:center">
          <button class="btn btn-secondary" id="btnJorDownloadTemplate" onclick="downloadWorkdayTemplate()">Descargar plantilla</button>
          <button class="btn btn-secondary" id="btnJorPreview" disabled onclick="previewJorImport()">Vista previa</button>
          <button class="btn btn-primary" id="btnJorExecute" disabled onclick="executeJorImport()">Ejecutar importaci\u00f3n</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-left:auto">
            <input type="checkbox" id="jorDryRun" checked> Modo simulaci\u00f3n
          </label>
        </div>
      </div>
      <div id="jorImportPreviewSection" style="display:none;margin-top:16px">
        <div class="card">
          <h3 class="card-title">Resultado de validaci\u00f3n</h3>
          <div id="jorImportPreviewSummary"></div>
          <div id="jorImportPreviewErrors" style="margin-top:12px"></div>
        </div>
      </div>
      <div id="jorImportResultSection" style="display:none;margin-top:16px">
        <div class="card">
          <h3 class="card-title">Resultado de importaci\u00f3n</h3>
          <div id="jorImportResultContent"></div>
        </div>
      </div>
    </div>
    <div class="modal-overlay" id="sesModal"><div class="modal"><h2 id="sesModalTitle">Nueva Jornada</h2>
      <div class="modal-body">
        <div class="form-group"><label>Empleado</label>
          <div class="ss-wrap" id="sesf_empWrap">
            <input id="sesf_empSearch" type="text" autocomplete="off" placeholder="Buscar por nombre, apellido o c&eacute;dula..." class="ss-input">
            <input id="sesf_empId" type="hidden" value="">
            <div id="sesf_empResults" class="ss-dropdown"></div>
          </div>
          <div id="sesf_empSelected" style="display:none;margin-top:6px;padding:6px 10px;background:#e8f5e9;border-radius:6px;font-size:12px;font-weight:500;color:#2e7d32"></div>
        </div>
        <div class="form-row"><div class="form-group half"><label>Fecha inicio</label><input id="sesf_startDate" type="date"></div>
        <div class="form-group half"><label>Hora inicio</label><input id="sesf_startTime" type="time"></div></div>
        <div class="form-row"><div class="form-group half"><label>Fecha fin</label><input id="sesf_endDate" type="date"></div>
        <div class="form-group half"><label>Hora fin</label><input id="sesf_endTime" type="time"></div></div>
        <div id="sesPreview" class="form-row" style="display:none;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:var(--text-secondary)">
          <span class="material-icons" style="font-size:16px">schedule</span>
          <span id="sesDuration"></span>
        </div>
        <div id="sesCrossMsg" style="display:none;font-size:11px;padding:0 0 4px;font-style:italic;color:#888">La hora de fin es anterior a la de inicio. La fecha se ajust\u00f3 al d\u00eda siguiente (la jornada cruza medianoche).</div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal('sesModal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveJornada()">Guardar</button>
      </div>
    </div></div>
    <div class="modal-overlay" id="voidModal"><div class="modal" style="max-width:400px"><h2>Anular Jornada</h2>
      <div class="modal-body">
        <div class="form-group"><label>Motivo de anulaci&oacute;n</label><textarea id="voidReason" rows="3" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;resize:vertical"></textarea></div>
        <p id="voidError" style="color:var(--danger);font-size:13px;display:none"></p>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal('voidModal')">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmVoid()">Anular</button>
      </div>
    </div></div>
    <div class="modal-overlay" id="compModal" style="display:none"><div class="modal" style="max-width:450px"><h2>Decisi\u00f3n Compensatoria</h2>
      <div class="modal-body">
        <div class="form-group"><label>Tipo</label>
          <select id="compf_type" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px">
            <option value="CON_COMPENSATORIO">Compensar con descanso</option>
            <option value="SIN_COMPENSATORIO">Pago dominical/festivo</option>
            <option value="PENDIENTE_DEFINICION">Pendiente definición</option>
            <option value="NO_APLICA">No aplica</option>
          </select>
        </div>
        <div class="form-group"><label>Observación</label>
          <textarea id="compf_obs" rows="3" style="width:100%;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;resize:vertical" placeholder="Opcional"></textarea>
        </div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="document.getElementById('compModal').style.display='none'">Cancelar</button>
        <button class="btn btn-primary" onclick="saveCompDecision()">Guardar</button>
      </div>
    </div></div>
    <div class="modal-overlay" id="auditModal"><div class="modal audit-modal"><h2>Auditor\u00eda de Jornada</h2>
      <div class="modal-body" id="auditContent" style="max-height:65vh;overflow-y:auto"></div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="exportAuditPDF()">Exportar PDF</button>
        <button class="btn btn-secondary" onclick="closeModal('auditModal')">Cerrar</button>
      </div>
    </div></div>
  `;
  document.getElementById('sesf_empSearch').addEventListener('input', onSesEmpSearchInput);
  document.getElementById('sesf_empSearch').addEventListener('blur', function () {
    setTimeout(function () {
      document.getElementById('sesf_empResults').style.display = 'none';
    }, 180);
  });
  const jorUploadArea = document.getElementById('jorUploadArea');
  jorUploadArea.addEventListener('click', () => { document.getElementById('jorImportFileInput').click(); });
  jorUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); jorUploadArea.classList.add('import-drag-over'); });
  jorUploadArea.addEventListener('dragleave', () => { jorUploadArea.classList.remove('import-drag-over'); });
  jorUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    jorUploadArea.classList.remove('import-drag-over');
    if (e.dataTransfer.files.length > 0) handleJorImportFile(e.dataTransfer.files[0]);
  });
  loadJornadas(1);
}

function switchJornadasTab(tab) {
  document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.import-tab-content').forEach(c => { c.style.display = 'none'; c.classList.remove('active'); });
  document.querySelector(`.import-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById('tabJor' + tab.charAt(0).toUpperCase() + tab.slice(1)).style.display = '';
  if (tab === 'listado') loadJornadas(1);
}

/* ---- JORNADAS IMPORT ---- */
function onJorImportFileSelect(event) {
  if (event.target.files.length > 0) handleJorImportFile(event.target.files[0]);
}

async function handleJorImportFile(file) {
  jornadaImportState = { file, filePath: null, preview: null };
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
    snackbar('Formato no soportado. Use Excel, CSV o ODS.', true);
    return;
  }
  document.getElementById('jorImportFileInfo').style.display = 'block';
  document.getElementById('jorImportFileInfo').innerHTML = `
    <div class="import-file-info">
      <span class="material-icons" style="color:var(--primary)">description</span>
      <div>
        <strong>${escapeHtml(file.name)}</strong>
        <span style="color:var(--text-muted);font-size:12px;margin-left:8px">${(file.size / 1024).toFixed(1)} KB</span>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="clearJorImportFile()" style="margin-left:auto">Quitar</button>
    </div>
  `;
  document.getElementById('btnJorPreview').disabled = false;
  document.getElementById('btnJorExecute').disabled = true;
  document.getElementById('jorImportPreviewSection').style.display = 'none';
  document.getElementById('jorImportResultSection').style.display = 'none';
}

function clearJorImportFile() {
  jornadaImportState = null;
  document.getElementById('jorImportFileInput').value = '';
  document.getElementById('jorImportFileInfo').style.display = 'none';
  document.getElementById('btnJorPreview').disabled = true;
  document.getElementById('btnJorExecute').disabled = true;
  document.getElementById('jorImportPreviewSection').style.display = 'none';
  document.getElementById('jorImportResultSection').style.display = 'none';
}

async function previewJorImport() {
  if (!jornadaImportState?.file) { snackbar('Seleccione un archivo primero', true); return; }
  document.getElementById('btnJorPreview').disabled = true;
  document.getElementById('btnJorPreview').textContent = 'Validando...';
  document.getElementById('jorImportPreviewSection').style.display = 'none';
  try {
    const formData = new FormData();
    formData.append('file', jornadaImportState.file);
    const token = localStorage.getItem('token');
    const upRes = await fetch(`${API}/import/upload`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData,
    });
    if (!upRes.ok) { let e; try { e = (await upRes.json()).mensaje; } catch(_) {} throw new Error(e || 'Error al subir archivo'); }
    const upData = await upRes.json();
    jornadaImportState.filePath = upData.filePath;
    const prevRes = await fetch(`${API}/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ filePath: upData.filePath, module: 'WORKDAYS', autoCreateReferences: true, updateExisting: true }),
    });
    if (!prevRes.ok) { let e; try { e = (await prevRes.json()).mensaje; } catch(_) {} throw new Error(e || 'Error al validar'); }
    const prevData = await prevRes.json();
    jornadaImportState.preview = prevData;
    renderJorImportPreview(prevData);
    if (prevData.summary && prevData.summary.invalidRows === 0) {
      document.getElementById('btnJorExecute').disabled = false;
    }
  } catch (e) {
    snackbar(e.message || 'Error al procesar archivo', true);
  } finally {
    document.getElementById('btnJorPreview').disabled = false;
    document.getElementById('btnJorPreview').textContent = 'Vista previa';
  }
}

function renderJorImportPreview(data) {
  const section = document.getElementById('jorImportPreviewSection');
  section.style.display = '';
  const s = data.summary;
  document.getElementById('jorImportPreviewSummary').innerHTML = `
    <div class="import-summary-grid">
      <div class="import-summary-item">
        <span class="import-summary-value">${s.totalRows}</span>
        <span class="import-summary-label">Total filas</span>
      </div>
      <div class="import-summary-item import-summary-valid">
        <span class="import-summary-value">${s.validRows}</span>
        <span class="import-summary-label">V\u00e1lidas</span>
      </div>
      <div class="import-summary-item import-summary-warning">
        <span class="import-summary-value">${s.warningRows}</span>
        <span class="import-summary-label">Advertencias</span>
      </div>
      <div class="import-summary-item import-summary-error">
        <span class="import-summary-value">${s.invalidRows}</span>
        <span class="import-summary-label">Errores</span>
      </div>
    </div>
  `;
  if (data.rows && data.rows.length > 0) {
    const errorRows = data.rows.filter(r => !r.isValid);
    const warningRows = data.rows.filter(r => r.warnings && r.warnings.length > 0 && r.isValid);
    let html = '';
    if (errorRows.length > 0) {
      html += `<h4 style="margin-bottom:8px;color:var(--danger)">Errores (${errorRows.length})</h4>
        <div class="table-wrap"><table><thead><tr><th>Fila</th><th>Documento</th><th>Nombre</th><th>Errores</th></tr></thead><tbody>
        ${errorRows.map(r => `<tr>
          <td>${r.rowNumber}</td>
          <td>${escapeHtml(String(r.data?.DOCUMENT_NUMBER || ''))}</td>
          <td>${escapeHtml(String(r.data?.FIRST_NAME || '') + ' ' + String(r.data?.LAST_NAME || ''))}</td>
          <td style="color:var(--danger)">${r.errors.map(e => escapeHtml(e.message)).join('<br>')}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
    }
    if (warningRows.length > 0) {
      html += `<h4 style="margin:16px 0 8px;color:var(--warning)">Advertencias (${warningRows.length})</h4>
        <div class="table-wrap"><table><thead><tr><th>Fila</th><th>Documento</th><th>Nombre</th><th>Advertencias</th></tr></thead><tbody>
        ${warningRows.map(r => `<tr>
          <td>${r.rowNumber}</td>
          <td>${escapeHtml(String(r.data?.DOCUMENT_NUMBER || ''))}</td>
          <td>${escapeHtml(String(r.data?.FIRST_NAME || '') + ' ' + String(r.data?.LAST_NAME || ''))}</td>
          <td style="color:var(--warning)">${r.warnings.map(w => escapeHtml(w.message)).join('<br>')}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
    }
    document.getElementById('jorImportPreviewErrors').innerHTML = html;
  }
}

async function executeJorImport() {
  if (!jornadaImportState?.filePath) { snackbar('Primero valide el archivo', true); return; }
  const isDryRun = document.getElementById('jorDryRun').checked;
  if (!isDryRun) {
    if (!confirm('\u00bfEst\u00e1 seguro de ejecutar la importaci\u00f3n?\n\nSe crear\u00e1 un backup autom\u00e1tico antes de proceder.')) return;
  }
  document.getElementById('btnJorExecute').disabled = true;
  document.getElementById('btnJorExecute').textContent = 'Importando...';
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/import/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        filePath: jornadaImportState.filePath,
        module: 'WORKDAYS',
        autoCreateReferences: true,
        updateExisting: true,
        dryRun: isDryRun,
      }),
    });
    if (!res.ok) { let e; try { e = (await res.json()).mensaje; } catch(_) {} throw new Error(e || 'Error al ejecutar importaci\u00f3n'); }
    const result = await res.json();
    document.getElementById('jorImportResultSection').style.display = '';
    const s = result.summary;
    document.getElementById('jorImportResultContent').innerHTML = `
      <div class="import-summary-grid">
        <div class="import-summary-item import-summary-valid">
          <span class="import-summary-value">${s.insertedRows}</span>
          <span class="import-summary-label">Insertadas</span>
        </div>
        <div class="import-summary-item import-summary-valid">
          <span class="import-summary-value">${s.updatedRows}</span>
          <span class="import-summary-label">Actualizadas</span>
        </div>
        <div class="import-summary-item import-summary-error">
          <span class="import-summary-value">${s.errorRows}</span>
          <span class="import-summary-label">Errores</span>
        </div>
        <div class="import-summary-item">
          <span class="import-summary-value">${(s.durationMs / 1000).toFixed(1)}s</span>
          <span class="import-summary-label">Duraci\u00f3n</span>
        </div>
      </div>
    `;
    snackbar(isDryRun ? 'Simulaci\u00f3n completada' : 'Importaci\u00f3n completada');
  } catch (e) {
    snackbar(e.message || 'Error al importar', true);
  } finally {
    document.getElementById('btnJorExecute').disabled = false;
    document.getElementById('btnJorExecute').textContent = 'Ejecutar importaci\u00f3n';
  }
}

async function downloadWorkdayTemplate() {
  try {
    const token = localStorage.getItem('token');
    if (window.__TAURI_INTERNALS__) {
      const absUrl = window.location.origin + '/api/v1/import/template/workdays';
      const path = await window.__TAURI_INTERNALS__.invoke('save_download_file_post', {
        url: absUrl, token, defaultName: 'plantilla_jornadas.xlsx',
      });
      snackbar('Plantilla descargada en: ' + path);
    } else {
      const res = await fetch(`${API}/import/template/workdays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'plantilla_jornadas.xlsx'; document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      snackbar('Plantilla descargada');
    }
  } catch (e) { snackbar('Error al descargar plantilla: ' + (e || ''), true); }
}

async function loadJornadas(page) {
  sesPage = page;
  const write = canWrite();
  try {
    let q = `/jornadas?page=${page}&limit=15`;
    const sd = document.getElementById('sesSearch')?.value;
    const ed = document.getElementById('sesEnd')?.value;
    if (sd) q += `&startDate=${sd}`;
    if (ed) q += `&endDate=${ed}`;
    const data = await get(q);
    document.getElementById('sesTbody').innerHTML = data.data.map(s => {
      const compLabel = ({NO_APLICA:'-',CON_COMPENSATORIO:'Descanso',SIN_COMPENSATORIO:'Pago',PENDIENTE_DEFINICION:'Pend.'})[s.compensatoryType] || '-';
      return `<tr${s.isVoided ? ' class="voided"' : ''}>
        <td><strong>${escapeHtml(s.employee?.firstName || '')} ${escapeHtml(s.employee?.lastName || '')}</strong></td>
        <td>${new Date(s.startTime).toLocaleString('es-CO')}</td>
        <td>${new Date(s.endTime).toLocaleString('es-CO')}</td>
        <td><strong>${formatMinutesToHours(s.totalMinutes)}</strong></td>
        <td>${formatMinutesToHours(s.ordinaryMinutes)}</td>
        <td>${formatMinutesToHours(s.nightSurchargeMinutes)}</td>
        <td>${formatMinutesToHours(s.extraDayMinutes)}</td>
        <td>${formatMinutesToHours(s.extraNightMinutes)}</td>
        <td>${formatMinutesToHours(s.sundayMinutes)}</td>
        <td>${formatMinutesToHours(s.holidayMinutes)}</td>
        <td>${formatMinutesToHours(s.extraHolidayDayMinutes)}</td>
        <td>${formatMinutesToHours(s.extraHolidayNightMinutes)}</td>
        <td>${formatMinutesToHours(s.sundayNightSurchargeMinutes)}</td>
        <td><span class="badge ${s.compensatoryType !== 'NO_APLICA' && s.compensatoryType ? 'badge-active' : ''}" style="font-size:10px">${compLabel}</span></td>
        <td><button class="btn btn-sm btn-secondary" onclick="auditJornada(${s.id})" title="Auditar clasificaci\u00f3n">Auditar</button></td>
        ${write ? `<td style="white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="editSes(${s.id})">Editar</button>
          ${s.isVoided ? '' : `<button class="btn btn-sm btn-danger" onclick="showVoidModal(${s.id})">Anular</button>`}
          ${canWrite() && s.isVoided === false ? `<button class="btn btn-sm btn-primary" onclick="showCompModal(${s.id})">Comp.</button>` : ''}
        </td>` : ''}
      </tr>`;
    }).join('');
    renderPagination('sesPagination', page, data.meta.totalPages, loadJornadas);
  } catch (e) { snackbar('Error al cargar jornadas', true); }
}

let editingSesId = null;
function showSesModal(s) {
  editingSesId = s?.id || null;
  document.getElementById('sesModalTitle').textContent = s ? 'Editar Jornada' : 'Nueva Jornada';
  if (s) {
    const sd = new Date(s.startTime);
    const ed = new Date(s.endTime);
    document.getElementById('sesf_startDate').value = sd.toISOString().slice(0,10);
    document.getElementById('sesf_startTime').value = sd.toISOString().slice(11,16);
    document.getElementById('sesf_endDate').value = ed.toISOString().slice(0,10);
    document.getElementById('sesf_endTime').value = ed.toISOString().slice(11,16);
  } else {
    document.getElementById('sesf_startDate').value = '';
    document.getElementById('sesf_startTime').value = '';
    document.getElementById('sesf_endDate').value = '';
    document.getElementById('sesf_endTime').value = '';
    document.getElementById('sesf_empId').value = '';
    document.getElementById('sesf_empSearch').value = '';
    document.getElementById('sesf_empResults').style.display = 'none';
    document.getElementById('sesf_empSelected').style.display = 'none';
  }
  ['sesf_startDate','sesf_startTime','sesf_endDate','sesf_endTime'].forEach(id => {
    document.getElementById(id).oninput = updateJornadaPreview;
  });
  updateJornadaPreview();
  document.getElementById('sesModal').classList.add('show');
}

function editSes(id) {
  get(`/jornadas/${id}`).then(s => {
    showSesModal(s);
    const emp = s.employee;
    if (emp) {
      document.getElementById('sesf_empId').value = emp.id;
      document.getElementById('sesf_empSearch').value = emp.firstName + ' ' + emp.lastName + ' - ' + emp.documentNumber;
      const sel = document.getElementById('sesf_empSelected');
      sel.textContent = '\u2713 ' + emp.firstName + ' ' + emp.lastName + ' - ' + emp.documentNumber;
      sel.style.display = 'block';
    }
  }).catch(() => snackbar('Error', true));
}

function updateJornadaPreview() {
  const sd = document.getElementById('sesf_startDate').value;
  const st = document.getElementById('sesf_startTime').value;
  const ed = document.getElementById('sesf_endDate').value;
  const et = document.getElementById('sesf_endTime').value;
  const preview = document.getElementById('sesPreview');
  const durEl = document.getElementById('sesDuration');
  const msgEl = document.getElementById('sesCrossMsg');
  if (!sd || !st || !ed || !et) { preview.style.display = 'none'; msgEl.style.display = 'none'; return; }
  const sameDate = sd === ed;
  const crossesMidnight = sameDate && et < st;
  if (crossesMidnight) {
    const end = new Date(ed + 'T' + et);
    end.setDate(end.getDate() + 1);
    document.getElementById('sesf_endDate').value = end.toISOString().slice(0, 10);
  }
  msgEl.style.display = crossesMidnight ? 'block' : 'none';
  const finalEd = document.getElementById('sesf_endDate').value;
  const start = new Date(sd + 'T' + st);
  const end = new Date(finalEd + 'T' + et);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs > 0) {
    const totalMin = Math.round(diffMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    durEl.textContent = h + 'h ' + String(m).padStart(2, '0') + 'm';
    preview.style.display = 'flex';
  } else {
    preview.style.display = 'none';
    msgEl.style.display = 'none';
  }
}

async function saveJornada() {
  const sd = document.getElementById('sesf_startDate').value;
  const st = document.getElementById('sesf_startTime').value;
  const ed = document.getElementById('sesf_endDate').value;
  const et = document.getElementById('sesf_endTime').value;
  if (!sd || !st || !ed || !et) { snackbar('Complete fecha y hora de inicio y fin', true); return; }
  const data = {
    employeeId: parseInt(document.getElementById('sesf_empId').value),
    startTime: sd + 'T' + st,
    endTime: ed + 'T' + et,
  };
  try {
    if (editingSesId) {
      await patch(`/jornadas/${editingSesId}`, data);
      snackbar('Jornada actualizada');
    } else {
      await post('/jornadas', data);
      snackbar('Jornada creada');
    }
    closeModal('sesModal');
    loadJornadas(sesPage);
  } catch (e) { snackbar(e.mensaje || 'Error al guardar', true); }
}

let voidSesId = null;

function showVoidModal(id) {
  voidSesId = id;
  document.getElementById('voidReason').value = '';
  document.getElementById('voidError').style.display = 'none';
  document.getElementById('voidModal').classList.add('show');
}

async function confirmVoid() {
  const reason = document.getElementById('voidReason').value.trim();
  if (!reason) { document.getElementById('voidError').textContent = 'Debe ingresar un motivo'; document.getElementById('voidError').style.display = 'block'; return; }
  try {
    await patch(`/jornadas/${voidSesId}/anular`, { reason });
    snackbar('Jornada anulada');
    closeModal('voidModal');
    loadJornadas(sesPage);
  } catch (e) { document.getElementById('voidError').textContent = e.mensaje || 'Error al anular'; document.getElementById('voidError').style.display = 'block'; }
}

/* ------- COMPENSATORIOS ------- */
let compSesId = null;

function showCompModal(sessionId) {
  compSesId = sessionId;
  document.getElementById('compf_type').value = 'PENDIENTE_DEFINICION';
  document.getElementById('compf_obs').value = '';
  document.getElementById('compModal').style.display = '';
}

async function saveCompDecision() {
  if (!compSesId) return;
  try {
    await patch(`/jornadas/${compSesId}/compensatorio`, {
      compensatoryType: document.getElementById('compf_type').value,
      compensatoryObservation: document.getElementById('compf_obs').value || undefined,
    });
    snackbar('Decisión compensatoria registrada');
    document.getElementById('compModal').style.display = 'none';
    loadJornadas(sesPage);
  } catch (e) {
    snackbar(e.mensaje || 'Error al registrar compensatorio', true);
  }
}

/* ------- HISTORICO ------- */
async function renderHistorico() {
  const year = new Date().getFullYear();
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Hist&oacute;rico por empleado</h1></div>
    <div class="card">
      <div class="filters" style="margin-bottom:0">
        <div style="flex:1;min-width:220px">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;font-weight:500">EMPLEADO</label>
          <div class="ss-wrap" id="histSearchWrap">
            <input id="histSearch" type="text" autocomplete="off" placeholder="Buscar por nombre, apellido o c&eacute;dula..." class="ss-input">
            <input id="histEmpId" type="hidden" value="">
            <div id="histSearchResults" class="ss-dropdown"></div>
          </div>
          <div id="histSelectedEmp" style="display:none;margin-top:8px;padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:13px;font-weight:500;color:#2e7d32"></div>
        </div>
        <div>
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;font-weight:500">PERIODO</label>
          <div style="display:flex;gap:8px">
            <select id="histPeriod" onchange="toggleHistRange()">
              <option value="week">Semanal</option>
              <option value="month">Mensual</option>
              <option value="range">Rango</option>
            </select>
            <input id="histWeekYear" type="number" value="${year}" style="width:80px" placeholder="Año">
            <input id="histWeekNum" type="number" min="1" max="53" style="width:70px" placeholder="Sem." title="Número de semana">
            <input id="histMonthNum" type="number" min="1" max="12" style="width:70px;display:none" placeholder="Mes" title="Número de mes">
            <input id="histRangeStart" type="date" style="width:140px;display:none" title="Fecha inicio">
            <input id="histRangeEnd" type="date" style="width:140px;display:none" title="Fecha fin">
          </div>
        </div>
        <div style="align-self:flex-end">
          <button class="btn btn-primary" onclick="loadHistorico()">Consultar</button>
        </div>
      </div>
    </div>
    <div id="histResult" style="margin-top:16px"></div>
  `;
  document.getElementById('histSearch').addEventListener('input', onHistSearchInput);
  document.getElementById('histSearch').addEventListener('blur', function () {
    setTimeout(function () {
      document.getElementById('histSearchResults').style.display = 'none';
    }, 180);
  });
}

const onHistSearchInput = debounce(async function () {
  const q = document.getElementById('histSearch').value;
  const results = document.getElementById('histSearchResults');
  const empIdInput = document.getElementById('histEmpId');
  const selectedDiv = document.getElementById('histSelectedEmp');

  if (empIdInput.value) {
    empIdInput.value = '';
    selectedDiv.style.display = 'none';
  }

  const text = q.trim();
  if (text.length < 2) {
    results.innerHTML = '';
    results.style.display = 'none';
    return;
  }

  results.innerHTML = '<div class="ss-empty">Cargando...</div>';
  results.style.display = 'block';

  const matches = await searchEmployees(text, false);

  if (matches === null) return;

  if (matches.length === 0) {
    results.innerHTML = '<div class="ss-empty">No se encontraron empleados.</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = matches.map(e =>
    '<div class="ss-item" data-id="' + e.id + '">' +
      escapeHtml(e.firstName) + ' ' + escapeHtml(e.lastName) + ' - ' + escapeHtml(e.documentNumber) +
      (e.position ? ' (' + escapeHtml(e.position) + ')' : '') +
    '</div>'
  ).join('');
  results.style.display = 'block';

  results.querySelectorAll('.ss-item').forEach(el => {
    el.addEventListener('click', function () {
      selectHistEmployee(this.dataset.id, this.textContent);
    });
  });
}, 300);

function selectHistEmployee(id, text) {
  document.getElementById('histEmpId').value = id;
  document.getElementById('histSearch').value = text;
  document.getElementById('histSearchResults').style.display = 'none';
  const sel = document.getElementById('histSelectedEmp');
  sel.textContent = '\u2713 ' + text;
  sel.style.display = 'block';
}

const onSesEmpSearchInput = debounce(async function () {
  const q = document.getElementById('sesf_empSearch').value;
  const results = document.getElementById('sesf_empResults');
  const empIdInput = document.getElementById('sesf_empId');
  const selectedDiv = document.getElementById('sesf_empSelected');

  if (empIdInput.value) {
    empIdInput.value = '';
    selectedDiv.style.display = 'none';
  }

  const text = q.trim();
  if (text.length < 2) {
    results.innerHTML = '';
    results.style.display = 'none';
    return;
  }

  results.innerHTML = '<div class="ss-empty">Cargando...</div>';
  results.style.display = 'block';

  const matches = await searchEmployees(text, true);

  if (matches === null) return;

  if (matches.length === 0) {
    results.innerHTML = '<div class="ss-empty">No se encontraron empleados.</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = matches.map(e =>
    '<div class="ss-item" data-id="' + e.id + '">' +
      escapeHtml(e.firstName) + ' ' + escapeHtml(e.lastName) + ' - ' + escapeHtml(e.documentNumber) +
      (e.position ? ' (' + escapeHtml(e.position) + ')' : '') +
    '</div>'
  ).join('');
  results.style.display = 'block';

  results.querySelectorAll('.ss-item').forEach(el => {
    el.addEventListener('click', function () {
      selectSesEmployee(this.dataset.id, this.textContent);
    });
  });
}, 300);

function selectSesEmployee(id, text) {
  document.getElementById('sesf_empId').value = id;
  document.getElementById('sesf_empSearch').value = text;
  document.getElementById('sesf_empResults').style.display = 'none';
  const sel = document.getElementById('sesf_empSelected');
  sel.textContent = '\u2713 ' + text;
  sel.style.display = 'block';
}

function toggleHistRange() {
  const p = document.getElementById('histPeriod').value;
  document.getElementById('histWeekYear').style.display = p === 'week' ? 'inline-block' : 'none';
  document.getElementById('histWeekNum').style.display = p === 'week' ? 'inline-block' : 'none';
  document.getElementById('histMonthNum').style.display = p === 'month' ? 'inline-block' : 'none';
  document.getElementById('histRangeStart').style.display = p === 'range' ? 'inline-block' : 'none';
  document.getElementById('histRangeEnd').style.display = p === 'range' ? 'inline-block' : 'none';
}

function calcHistDates() {
  let startDate, endDate, label;
  const period = document.getElementById('histPeriod').value;

  if (period === 'week') {
    const year = parseInt(document.getElementById('histWeekYear').value);
    const week = parseInt(document.getElementById('histWeekNum').value);
    if (!week) return null;
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    startDate = monday.toISOString().split('T')[0];
    endDate = sunday.toISOString().split('T')[0];
    label = `Semana ${week} de ${year} (${monday.toLocaleDateString('es-CO')} - ${sunday.toLocaleDateString('es-CO')})`;
  } else if (period === 'month') {
    const year = parseInt(document.getElementById('histWeekYear').value);
    const month = parseInt(document.getElementById('histMonthNum').value);
    if (!month) return null;
    startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;
    label = `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][month-1]} ${year}`;
  } else {
    startDate = document.getElementById('histRangeStart').value;
    endDate = document.getElementById('histRangeEnd').value;
    if (!startDate || !endDate) return null;
    label = `${startDate} a ${endDate}`;
  }
  return { startDate, endDate, label };
}

async function loadHistorico() {
  const empId = document.getElementById('histEmpId').value;
  if (!empId) { snackbar('Seleccione un empleado', true); return; }
  const result = document.getElementById('histResult');
  result.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';

  const dates = calcHistDates();
  if (!dates) { snackbar('Ingrese período válido', true); result.innerHTML = ''; return; }
  const { startDate, endDate, label } = dates;

  try {
    const [empData, sesData] = await Promise.all([
      get(`/empleados/${empId}`),
      get(`/jornadas?employeeId=${empId}&startDate=${startDate}&endDate=${endDate}&limit=100`),
    ]);

    const sessions = sesData.data || [];
    const active = sessions.filter(s => !s.isVoided);
    const voided = sessions.filter(s => s.isVoided);

    const totals = {
      totalMinutes: 0, ordinaryMinutes: 0, nightSurchargeMinutes: 0,
      extraDayMinutes: 0, extraNightMinutes: 0, sundayMinutes: 0, holidayMinutes: 0,
      extraHolidayDayMinutes: 0, extraHolidayNightMinutes: 0, sundayNightSurchargeMinutes: 0,
    };
    active.forEach(s => {
      totals.totalMinutes += s.totalMinutes || 0;
      totals.ordinaryMinutes += s.ordinaryMinutes || 0;
      totals.nightSurchargeMinutes += s.nightSurchargeMinutes || 0;
      totals.extraDayMinutes += s.extraDayMinutes || 0;
      totals.extraNightMinutes += s.extraNightMinutes || 0;
      totals.sundayMinutes += s.sundayMinutes || 0;
      totals.holidayMinutes += s.holidayMinutes || 0;
      totals.extraHolidayDayMinutes += s.extraHolidayDayMinutes || 0;
      totals.extraHolidayNightMinutes += s.extraHolidayNightMinutes || 0;
      totals.sundayNightSurchargeMinutes += s.sundayNightSurchargeMinutes || 0;
    });

    const daily = {};
    active.forEach(s => {
      const d = new Date(s.startTime);
      const key = d.toLocaleDateString('es-CO');
      if (!daily[key]) daily[key] = { totalMinutes: 0 };
      daily[key].totalMinutes += s.totalMinutes || 0;
    });

    result.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h3>${escapeHtml(empData.firstName)} ${escapeHtml(empData.lastName)}</h3>
            <p style="font-size:13px;color:#666">${escapeHtml(empData.documentNumber)} ${empData.position ? '· ' + escapeHtml(empData.position) : ''} ${empData.area ? '· ' + escapeHtml(empData.area) : ''}</p>
          </div>
          <span class="badge ${empData.isActive ? 'badge-active' : 'badge-inactive'}">${empData.isActive ? 'Activo' : 'Inactivo'}</span>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 class="card-title">${label}</h3>
        <div class="hist-summary">
          <div class="hist-item"><span class="hist-label">Total trabajado</span><span class="hist-value">${formatMinutesToHours(totals.totalMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Ordinarias</span><span class="hist-value">${formatMinutesToHours(totals.ordinaryMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Extra diurna</span><span class="hist-value">${formatMinutesToHours(totals.extraDayMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Extra nocturna</span><span class="hist-value">${formatMinutesToHours(totals.extraNightMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Recargo nocturno</span><span class="hist-value">${formatMinutesToHours(totals.nightSurchargeMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Dominical</span><span class="hist-value">${formatMinutesToHours(totals.sundayMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Festivo</span><span class="hist-value">${formatMinutesToHours(totals.holidayMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Ex.fest.diur.</span><span class="hist-value">${formatMinutesToHours(totals.extraHolidayDayMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Ex.fest.noct.</span><span class="hist-value">${formatMinutesToHours(totals.extraHolidayNightMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Rec.ndf</span><span class="hist-value">${formatMinutesToHours(totals.sundayNightSurchargeMinutes)}</span></div>
          <div class="hist-item"><span class="hist-label">Jornadas</span><span class="hist-value">${active.length}</span></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3 class="card-title">Desglose diario</h3>
        <div class="table-wrap" style="margin-top:12px">
          <table><thead><tr><th>D&iacute;a</th><th>Total</th></tr></thead>
          <tbody>${Object.entries(daily).map(([day, t]) =>
            `<tr><td>${day}</td><td><strong>${formatMinutesToHours(t.totalMinutes)}</strong></td></tr>`
          ).join('')}</tbody></table>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 class="card-title" style="margin:0">Detalle de jornadas</h3>
          <button class="btn btn-sm btn-secondary" onclick="exportHistoricXLSX()" style="margin-bottom:8px">Excel</button>
        </div>
        <div class="table-wrap" style="margin-top:12px">
          <table><thead><tr>
            <th>Fecha</th><th>Entrada</th><th>Salida</th><th>Total</th><th>Ord</th><th>Noct</th><th>ExtD</th><th>ExtN</th><th>Dom</th><th>Fest</th><th>ExFD</th><th>ExFN</th><th>Rndf</th><th>Comp</th><th>Estado</th>
          </tr></thead><tbody>
            ${active.sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(s => `<tr>
              <td>${new Date(s.startTime).toLocaleDateString('es-CO')}</td>
              <td>${new Date(s.startTime).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</td>
              <td>${new Date(s.endTime).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</td>
              <td><strong>${formatMinutesToHours(s.totalMinutes)}</strong></td>
              <td>${formatMinutesToHours(s.ordinaryMinutes)}</td>
              <td>${formatMinutesToHours(s.nightSurchargeMinutes)}</td>
              <td>${formatMinutesToHours(s.extraDayMinutes)}</td>
              <td>${formatMinutesToHours(s.extraNightMinutes)}</td>
              <td>${formatMinutesToHours(s.sundayMinutes)}</td>
              <td>${formatMinutesToHours(s.holidayMinutes)}</td>
              <td>${formatMinutesToHours(s.extraHolidayDayMinutes)}</td>
              <td>${formatMinutesToHours(s.extraHolidayNightMinutes)}</td>
              <td>${formatMinutesToHours(s.sundayNightSurchargeMinutes)}</td>
              <td><span class="badge" style="font-size:10px">${({NO_APLICA:'-',CON_COMPENSATORIO:'Desc',SIN_COMPENSATORIO:'Pago',PENDIENTE_DEFINICION:'Pend.'})[s.compensatoryType] || '-'}</span></td>
              <td><span class="badge ${s.isVoided ? 'badge-inactive' : 'badge-active'}">${s.isVoided ? 'Anulada' : 'Activa'}</span></td>
            </tr>`).join('')}
            ${voided.length > 0 ? voided.sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(s => `<tr class="voided">
              <td>${new Date(s.startTime).toLocaleDateString('es-CO')}</td>
              <td>${new Date(s.startTime).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</td>
              <td>${new Date(s.endTime).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</td>
              <td>${formatMinutesToHours(s.totalMinutes)}</td>
              <td colspan="10" style="color:#999;font-style:italic">Anulada: ${escapeHtml(s.voidedReason || 'Sin motivo')}</td>
              <td><span class="badge badge-inactive">Anulada</span></td>
            </tr>`).join('') : ''}
          </tbody></table>
        </div>
      </div>
    `;
  } catch (e) {
    result.innerHTML = '<div class="empty-state">Error al cargar el hist\u00f3rico. <button class="btn btn-primary" onclick="loadHistorico()" style="margin-top:8px">Reintentar</button></div>';
    snackbar('Error al cargar hist\u00f3rico', true);
  }
}

/* ------- FESTIVOS ------- */
async function renderFestivos() {
  const write = canWrite();
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Festivos</h1>
      ${write ? '<button class="btn btn-primary" onclick="showHolModal()">+ Nuevo</button>' : ''}
    </div>
    <div class="table-wrap"><table><thead><tr>
      <th>Fecha</th><th>Nombre</th>${write ? '<th>Acciones</th>' : ''}
    </tr></thead><tbody id="holTbody"></tbody></table></div>
    <div class="modal-overlay" id="holModal"><div class="modal"><h2>Nuevo Festivo</h2>
      <div class="modal-body">
        <div class="form-row"><div class="form-group half"><label>Fecha</label><input id="hf_date" type="date"></div>
        <div class="form-group half"><label>Nombre</label><input id="hf_name"></div></div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal('holModal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveHoliday()">Guardar</button>
      </div>
    </div></div>
  `;
  loadHolidays();
}

async function loadHolidays() {
  const write = canWrite();
  try {
    const data = await get('/festivos');
    document.getElementById('holTbody').innerHTML = data.map(h => `<tr>
      <td>${new Date(h.date).toLocaleDateString('es-CO')}</td>
      <td><strong>${escapeHtml(h.name)}</strong></td>
      ${write ? `<td><button class="btn btn-sm btn-danger" onclick="delHoliday(${h.id})">Eliminar</button></td>` : ''}
    </tr>`).join('');
  } catch (e) { snackbar('Error al cargar festivos', true); }
}

function showHolModal() {
  document.getElementById('hf_date').value = '';
  document.getElementById('hf_name').value = '';
  document.getElementById('holModal').classList.add('show');
}

async function saveHoliday() {
  const data = { date: document.getElementById('hf_date').value, name: document.getElementById('hf_name').value };
  try {
    await post('/festivos', data);
    snackbar('Festivo creado');
    closeModal('holModal');
    loadHolidays();
  } catch (e) { snackbar(e.mensaje || 'Error al guardar', true); }
}

async function delHoliday(id) {
  if (!confirm('\u00bfEliminar este festivo?')) return;
  try {
    await del(`/festivos/${id}`);
    snackbar('Festivo eliminado');
    loadHolidays();
  } catch (e) { snackbar('Error al eliminar', true); }
}

/* ------- REPORTES ------- */
async function renderReportes() {
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Reportes</h1></div>
    <div class="card">
      <div class="filters" style="margin-bottom:0">
        <div style="min-width:220px">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;font-weight:500">EMPLEADO</label>
          <select id="repEmp">
            <option value="">Todos los empleados</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;font-weight:500">PERIODO</label>
          <div style="display:flex;gap:8px">
            <select id="repPeriod" onchange="toggleRepPeriod()">
              <option value="week">Semanal</option>
              <option value="month">Mensual</option>
              <option value="range">Rango personalizado</option>
            </select>
            <input id="repYear" type="number" value="${new Date().getFullYear()}" style="width:80px">
            <input id="repWeek" type="number" min="1" max="53" style="width:70px" placeholder="Sem.">
            <input id="repMonth" type="number" min="1" max="12" style="width:70px;display:none" placeholder="Mes">
            <input id="repRangeStart" type="date" style="width:135px;display:none">
            <input id="repRangeEnd" type="date" style="width:135px;display:none">
          </div>
        </div>
        <div style="align-self:flex-end">
          <button class="btn btn-primary" onclick="loadReporte()">Generar reporte</button>
        </div>
      </div>
    </div>
    <div id="repResult" style="margin-top:16px"></div>
  `;
  try {
    const emp = await get('/empleados?limit=200');
    const sel = document.getElementById('repEmp');
    emp.data.forEach(e => {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = `${e.firstName} ${e.lastName} - ${e.documentNumber}`;
      sel.appendChild(o);
    });
    createSearchableSelect(sel, 'Buscar empleado o seleccionar todos...');
  } catch (e) { /* ignore */ }
}

function toggleRepPeriod() {
  const p = document.getElementById('repPeriod').value;
  document.getElementById('repWeek').style.display = p === 'week' ? 'inline-block' : 'none';
  document.getElementById('repMonth').style.display = p === 'month' ? 'inline-block' : 'none';
  document.getElementById('repRangeStart').style.display = p === 'range' ? 'inline-block' : 'none';
  document.getElementById('repRangeEnd').style.display = p === 'range' ? 'inline-block' : 'none';
}

async function loadReporte() {
  const empId = document.getElementById('repEmp').value;
  const period = document.getElementById('repPeriod').value;
  const year = document.getElementById('repYear').value;
  let endpoint;

  if (period === 'week') {
    const week = document.getElementById('repWeek').value;
    if (!week) { snackbar('Ingrese n\u00famero de semana', true); return; }
    endpoint = `/reportes/semanal?year=${year}&week=${week}`;
    if (empId) endpoint += `&employeeId=${empId}`;
  } else if (period === 'month') {
    const month = document.getElementById('repMonth').value;
    if (!month) { snackbar('Ingrese n\u00famero de mes', true); return; }
    endpoint = `/reportes/mensual?year=${year}&month=${month}`;
    if (empId) endpoint += `&employeeId=${empId}`;
  } else {
    const start = document.getElementById('repRangeStart').value;
    const end = document.getElementById('repRangeEnd').value;
    if (!start || !end) { snackbar('Seleccione rango de fechas', true); return; }
    endpoint = `/reportes/rango?startDate=${start}&endDate=${end}`;
    if (empId) endpoint += `&employeeId=${empId}`;
  }

  const el = document.getElementById('repResult');
  el.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
  try {
    const data = await get(endpoint);
    renderReporte('repResult', data);
  } catch (e) { snackbar('Error al cargar reporte', true); }
}

function renderReporte(containerId, data) {
  const el = document.getElementById(containerId);
  if (!data.data || data.data.length === 0) {
    el.innerHTML = '<p class="empty">Sin resultados para este per\u00edodo.</p>';
    return;
  }
  let periodoLabel = data.periodo.replace(/\s+/g, '_');

  lastReportData = data.data;
  const repHeaders = [
    { label: 'Empleado', key: 'empleado' },
    { label: 'Documento', key: 'documento' },
    { label: 'Jornadas', key: 'jornadas' },
    { label: 'Total', key: 'total' },
    { label: 'Ord', key: 'ord' },
    { label: 'Noct', key: 'noct' },
    { label: 'ExtD', key: 'extD' },
    { label: 'ExtN', key: 'extN' },
    { label: 'Dom', key: 'dom' },
    { label: 'Fest', key: 'fest' },
    { label: 'ExFD', key: 'exFD' },
    { label: 'ExFN', key: 'exFN' },
    { label: 'Rndf', key: 'rndf' },
  ];
  el.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="card-title" style="margin:0">${data.periodo}</h3>
        <div class="btn-group">
          <button class="btn btn-sm btn-secondary btn-xlsx-rep" data-periodo="${periodoLabel}">Excel</button>
        </div>
      </div>
      <div class="report-summary">
        <div class="summary-item"><span class="s-label">Total horas</span><span class="s-value">${data.totalHoras}</span></div>
        <div class="summary-item"><span class="s-label">Total jornadas</span><span class="s-value">${data.totalJornadas}</span></div>
        <div class="summary-item"><span class="s-label">Desde</span><span class="s-value" style="font-size:14px">${data.desde}</span></div>
        <div class="summary-item"><span class="s-label">Hasta</span><span class="s-value" style="font-size:14px">${data.hasta}</span></div>
      </div>
      <div class="table-wrap"><table><thead><tr>
        <th>Empleado</th><th>Documento</th><th>Jornadas</th><th>Horas</th><th>Ord</th><th>Noct</th><th>ExtD</th><th>ExtN</th><th>Dom</th><th>Fest</th><th>ExFD</th><th>ExFN</th><th>Rndf</th>
      </tr></thead><tbody>
        ${data.data.map(r => {
          const workedMin = (r.ordinaryMinutes||0) + (r.sundayMinutes||0) + (r.holidayMinutes||0) +
            (r.extraDayMinutes||0) + (r.extraNightMinutes||0) +
            (r.extraHolidayDayMinutes||0) + (r.extraHolidayNightMinutes||0);
          return `<tr>
          <td><strong>${escapeHtml(r.employee.firstName)} ${escapeHtml(r.employee.lastName)}</strong></td>
          <td>${escapeHtml(r.employee.documentNumber)}</td>
          <td>${r.totalSessions}</td>
          <td><strong>${formatMinutesToHours(workedMin)}</strong></td>
          <td>${formatMinutesToHours(r.ordinaryMinutes)}</td>
          <td>${formatMinutesToHours(r.nightSurchargeMinutes)}</td>
          <td>${formatMinutesToHours(r.extraDayMinutes)}</td>
          <td>${formatMinutesToHours(r.extraNightMinutes)}</td>
          <td>${formatMinutesToHours(r.sundayMinutes)}</td>
          <td>${formatMinutesToHours(r.holidayMinutes)}</td>
          <td>${formatMinutesToHours(r.extraHolidayDayMinutes)}</td>
          <td>${formatMinutesToHours(r.extraHolidayNightMinutes)}</td>
          <td>${formatMinutesToHours(r.sundayNightSurchargeMinutes)}</td>
        </tr>`;
        }).join('')}
      </tbody></table></div>
    </div>
  `;
}

async function exportHistoricXLSX() {
  const empId = document.getElementById('histEmpId')?.value;
  if (!empId) { snackbar('Seleccione un empleado', true); return; }
  const dates = calcHistDates();
  if (!dates) { snackbar('Seleccione período válido', true); return; }
  const { startDate, endDate } = dates;
  try {
    const [empData, sesData] = await Promise.all([
      get(`/empleados/${empId}`),
      get(`/jornadas?employeeId=${empId}&startDate=${startDate}&endDate=${endDate}&limit=100`),
    ]);
    const sessions = (sesData.data || []).filter(s => !s.isVoided);
    const filename = `historico_${empData.firstName}_${empData.lastName}_${startDate}_${endDate}`.replace(/\s+/g, '_');
    const headers = [
      { label: 'Fecha', key: 'fecha' },
      { label: 'Entrada', key: 'entrada' },
      { label: 'Salida', key: 'salida' },
      { label: 'Total', key: 'total' },
      { label: '001 Ordinarias', key: 'ord' },
      { label: '006-RECNOC Nocturnas', key: 'noct' },
      { label: '002-HED Extra Diurnas', key: 'extD' },
      { label: '003-HEN Extra Nocturnas', key: 'extN' },
      { label: '013-DOMINGO Dominical', key: 'dom' },
      { label: '014-FESTIVO Festivo', key: 'fest' },
      { label: '004-HEFD Extra Fest. Diurnas', key: 'exFD' },
      { label: '005-HEFN Extra Fest. Nocturnas', key: 'exFN' },
      { label: '012-REC.NDF Recargo NDF', key: 'rndf' },
      { label: 'Compensatorio', key: 'comp' },
    ];
    const rows = sessions.map(s => {
      const workedMinutes = (s.ordinaryMinutes||0) + (s.sundayMinutes||0) + (s.holidayMinutes||0) +
        (s.extraDayMinutes||0) + (s.extraNightMinutes||0) +
        (s.extraHolidayDayMinutes||0) + (s.extraHolidayNightMinutes||0);
      return {
        fecha: new Date(s.startTime).toLocaleDateString('es-CO'),
        entrada: new Date(s.startTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        salida: new Date(s.endTime).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        total: formatMinutesToHours(workedMinutes),
        ord: formatMinutesToHours(s.ordinaryMinutes),
        noct: formatMinutesToHours(s.nightSurchargeMinutes),
        extD: formatMinutesToHours(s.extraDayMinutes),
        extN: formatMinutesToHours(s.extraNightMinutes),
        dom: formatMinutesToHours(s.sundayMinutes),
        fest: formatMinutesToHours(s.holidayMinutes),
        exFD: formatMinutesToHours(s.extraHolidayDayMinutes),
        exFN: formatMinutesToHours(s.extraHolidayNightMinutes),
        rndf: formatMinutesToHours(s.sundayNightSurchargeMinutes),
        comp: ({NO_APLICA:'-',CON_COMPENSATORIO:'Descanso',SIN_COMPENSATORIO:'Pago',PENDIENTE_DEFINICION:'Pendiente'})[s.compensatoryType] || '-',
      };
    });
    downloadXLSX(filename + '.xlsx', headers, rows);
    snackbar('Excel exportado');
  } catch (e) { snackbar('Error al exportar', true); }
}

/* ------- IMPORTACION ------- */
let importState = {
  file: null,
  filePath: null,
  module: 'EMPLOYEES',
  preview: null,
  autoCreateRefs: false,
  updateExisting: true,
  dryRun: false,
};

const MODULE_LABELS = {
  EMPLOYEES: 'Empleados',
  WORK_SESSIONS: 'Jornadas laborales',
  HOLIDAYS: 'Festivos',
  USERS: 'Usuarios',
  COMPANIES: 'Empresas',
  DEPARTMENTS: 'Departamentos',
  POSITIONS: 'Cargos',
  COST_CENTERS: 'Centros de costo',
  WORK_CONFIGURATIONS: 'Configuraciones laborales',
};

/* FRONTEND LOGGER */
async function frontendLog(msg) {
  try {
    if (window.__TAURI_INTERNALS__) {
      await window.__TAURI_INTERNALS__.invoke('append_frontend_log', { message: msg });
    }
  } catch(e) {
    try {
      if (window.__TAURI_INTERNALS__) {
        await window.__TAURI_INTERNALS__.invoke('append_frontend_log', {
          message: 'FRONTEND_LOG_ERROR: cmd=append_frontend_log msg="' + msg + '" error="' + (e.message || String(e)) + '"'
        });
      }
    } catch(_) {}
  }
}

async function renderImportacion() {
  importState = { file: null, filePath: null, module: 'EMPLOYEES', preview: null, autoCreateRefs: false, updateExisting: true, dryRun: false };

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Centro de Importaci\u00f3n</h1></div>
    <div class="import-center">
      <div class="import-tabs">
        <button class="import-tab active" data-tab="upload" onclick="switchImportTab('upload')">Importar</button>
        <button class="import-tab" data-tab="templates" onclick="switchImportTab('templates')">Plantillas</button>
        <button class="import-tab" data-tab="history" onclick="switchImportTab('history')">Historial</button>
      </div>

      <div class="import-tab-content active" id="tabUpload">
        <div class="card">
          <h3 class="card-title">Seleccionar archivo</h3>
          <div class="import-upload-area" id="uploadArea">
            <div class="import-upload-icon">
              <span class="material-icons" style="font-size:48px;color:var(--primary)">cloud_upload</span>
            </div>
            <p>Arrastra un archivo aqu\u00ed o haz clic para seleccionar</p>
            <p style="font-size:12px;color:var(--text-muted)">Formatos soportados: Excel (.xlsx), CSV, ODS</p>
            <input type="file" id="importFileInput" accept=".xlsx,.xls,.csv,.ods" style="display:none" onchange="onImportFileSelect(event)">
          </div>
          <div id="importFileInfo" style="display:none;margin-top:12px"></div>

          <div class="form-row" style="margin-top:16px">
            <div class="form-group half">
              <label>M\u00f3dulo destino</label>
              <select id="importModule" onchange="importState.module=this.value">
                <option value="EMPLOYEES">Empleados</option>
                <option value="WORK_SESSIONS">Jornadas laborales</option>
                <option value="HOLIDAYS">Festivos</option>
              </select>
            </div>
            <div class="form-group half">
              <label>Opciones</label>
              <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                  <input type="checkbox" id="importAutoRefs" onchange="importState.autoCreateRefs=this.checked"> Crear referencias autom\u00e1ticamente
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                  <input type="checkbox" id="importUpdateExisting" checked onchange="importState.updateExisting=this.checked"> Actualizar existentes
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                  <input type="checkbox" id="importDryRun" onchange="importState.dryRun=this.checked"> Modo simulaci\u00f3n
                </label>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn-secondary" id="btnPreviewImport" disabled onclick="previewImportFile()">Vista previa</button>
            <button class="btn btn-primary" id="btnExecuteImport" disabled onclick="executeImportFile()">Ejecutar importaci\u00f3n</button>
          </div>
        </div>

        <div id="importPreviewSection" style="display:none;margin-top:16px">
          <div class="card">
            <h3 class="card-title">Resultado de validaci\u00f3n</h3>
            <div id="importPreviewSummary"></div>
            <div id="importPreviewErrors" style="margin-top:12px"></div>
            <div id="importPreviewTable" style="margin-top:12px"></div>
          </div>
        </div>

        <div id="importResultSection" style="display:none;margin-top:16px">
          <div class="card">
            <h3 class="card-title">Resultado de importaci\u00f3n</h3>
            <div id="importResultContent"></div>
          </div>
        </div>
      </div>

      <div class="import-tab-content" id="tabTemplates" style="display:none">
        <div class="card">
          <h3 class="card-title">Descargar plantillas</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Descarga la plantilla exacta que necesitas para importar datos.</p>
          <div class="import-template-grid">
            <div class="import-template-card">
              <span class="material-icons" style="font-size:32px;color:var(--primary)">people</span>
              <h4>Plantilla de empleados</h4>
              <p style="font-size:12px;color:var(--text-muted)">Formato estándar para importar empleados</p>
              <button class="btn btn-sm btn-primary" onclick="downloadEmployeeTemplate()">Descargar</button>
            </div>
            <div class="import-template-card">
              <span class="material-icons" style="font-size:32px;color:var(--primary)">person_search</span>
              <h4>Plantilla BD Personas EP</h4>
              <p style="font-size:12px;color:var(--text-muted)">Formato BD personas para importar desde Excel del cliente</p>
              <button class="btn btn-sm btn-primary" onclick="downloadBdPersonasEpTemplate()">Descargar</button>
            </div>
            <div class="import-template-card">
              <span class="material-icons" style="font-size:32px;color:var(--primary)">event_note</span>
              <h4>Plantilla de jornadas</h4>
              <p style="font-size:12px;color:var(--text-muted)">Formato del cliente para jornadas laborales</p>
              <button class="btn btn-sm btn-primary" onclick="downloadWorkSessionTemplate()">Descargar</button>
            </div>

            <div class="import-template-card">
              <span class="material-icons" style="font-size:32px;color:var(--primary)">download</span>
              <h4>Exportar empleados</h4>
              <p style="font-size:12px;color:var(--text-muted)">Exporta empleados existentes en formato de plantilla</p>
              <button class="btn btn-sm btn-secondary" onclick="exportEmployeesTemplate()">Exportar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="import-tab-content" id="tabHistory" style="display:none">
        <div class="card">
          <h3 class="card-title">Historial de importaciones</h3>
          <div class="table-wrap" style="margin-top:12px">
            <table><thead><tr>
              <th>Fecha</th><th>Usuario</th><th>Archivo</th><th>M\u00f3dulo</th><th>Duraci\u00f3n</th><th>Total</th><th>Insertadas</th><th>Actualizadas</th><th>Errores</th><th>Estado</th><th>Acciones</th>
            </tr></thead><tbody id="importHistoryTbody"></tbody></table>
          </div>
          <div class="pagination" id="importHistoryPagination"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('uploadArea').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });

  const uploadArea = document.getElementById('uploadArea');
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('import-drag-over'); });
  uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('import-drag-over'); });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('import-drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleImportFile(e.dataTransfer.files[0]);
    }
  });

  loadImportHistory();
}

function switchImportTab(tab) {
  document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.import-tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.import-tab-content').forEach(c => { c.style.display = 'none'; c.classList.remove('active'); });
  const target = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (target) { target.style.display = ''; target.classList.add('active'); }
  if (tab === 'history') loadImportHistory();
}

function onImportFileSelect(event) {
  if (event.target.files.length > 0) {
    handleImportFile(event.target.files[0]);
  }
}

async function handleImportFile(file) {
  importState.file = file;
  importState.preview = null;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
    snackbar('Formato no soportado. Use Excel, CSV o ODS.', true);
    return;
  }

  document.getElementById('importFileInfo').style.display = 'block';
  document.getElementById('importFileInfo').innerHTML = `
    <div class="import-file-info">
      <span class="material-icons" style="color:var(--primary)">description</span>
      <div>
        <strong>${escapeHtml(file.name)}</strong>
        <span style="color:var(--text-muted);font-size:12px;margin-left:8px">${(file.size / 1024).toFixed(1)} KB</span>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="clearImportFile()" style="margin-left:auto">Quitar</button>
    </div>
  `;

  document.getElementById('btnPreviewImport').disabled = false;
  document.getElementById('btnExecuteImport').disabled = true;
  document.getElementById('importPreviewSection').style.display = 'none';
  document.getElementById('importResultSection').style.display = 'none';
}

function clearImportFile() {
  importState.file = null;
  importState.filePath = null;
  importState.preview = null;
  document.getElementById('importFileInput').value = '';
  document.getElementById('importFileInfo').style.display = 'none';
  document.getElementById('btnPreviewImport').disabled = true;
  document.getElementById('btnExecuteImport').disabled = true;
  document.getElementById('importPreviewSection').style.display = 'none';
  document.getElementById('importResultSection').style.display = 'none';
}

async function previewImportFile() {
  await frontendLog('PREVIEW_STEP_1: previewImportFile entered');
  await frontendLog('PREVIEW_STEP_1a: importState.file = ' + (importState.file ? 'present' : 'null'));
  if (!importState.file) { await frontendLog('PREVIEW_STEP_2: EARLY RETURN - no file'); snackbar('Seleccione un archivo primero', true); return; }

  document.getElementById('btnPreviewImport').disabled = true;
  document.getElementById('btnPreviewImport').textContent = 'Validando...';
  document.getElementById('importPreviewSection').style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('file', importState.file);

    await frontendLog('PREVIEW_STEP_3: About to upload file');
    const token = localStorage.getItem('token');
    const uploadRes = await fetch(`${API}/import/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    await frontendLog('PREVIEW_STEP_4: Upload response status = ' + uploadRes.status);

    if (!uploadRes.ok) {
      let uploadErr = 'Error al subir archivo';
      try { const uj = await uploadRes.json(); uploadErr = uj.mensaje || uj.message || JSON.stringify(uj); } catch(_) {}
      throw { mensaje: `Error al subir archivo (${uploadRes.status}): ${uploadErr}` };
    }
    const uploadData = await uploadRes.json();
    importState.filePath = uploadData.filePath;
    await frontendLog('PREVIEW_STEP_5: filePath = ' + importState.filePath);

    await frontendLog('PREVIEW_STEP_6: About to validate preview');
    const previewRes = await fetch(`${API}/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        filePath: importState.filePath,
        module: importState.module,
        autoCreateReferences: importState.autoCreateRefs,
        updateExisting: importState.updateExisting,
      }),
    });
    await frontendLog('PREVIEW_STEP_7: Preview response status = ' + previewRes.status);

    if (!previewRes.ok) {
      let previewErr = 'Error al validar archivo';
      try { const pj = await previewRes.json(); previewErr = pj.mensaje || pj.message || JSON.stringify(pj); } catch(_) {}
      throw { mensaje: `Error al validar archivo (${previewRes.status}): ${previewErr}` };
    }
    const previewData = await previewRes.json();
    importState.preview = previewData;
    await frontendLog('PREVIEW_STEP_8: Preview data received, invalidRows = ' + (previewData.summary ? previewData.summary.invalidRows : 'NO_SUMMARY'));

    renderImportPreview(previewData);
    await frontendLog('PREVIEW_STEP_9: Preview rendered');

    await frontendLog('PREVIEW_STEP_10: Checking invalidRows === 0: ' + (previewData.summary ? (previewData.summary.invalidRows === 0) : 'NO_SUMMARY'));
    if (previewData.summary && previewData.summary.invalidRows === 0) {
      await frontendLog('PREVIEW_STEP_11: Enabling execute button');
      document.getElementById('btnExecuteImport').disabled = false;
      await frontendLog('PREVIEW_STEP_12: Button disabled? = ' + document.getElementById('btnExecuteImport').disabled);
    } else {
      await frontendLog('PREVIEW_STEP_11b: invalidRows !== 0 or summary missing, button stays disabled');
    }
  } catch (e) {
    await frontendLog('PREVIEW_STEP_ERR: Caught exception: ' + (e.mensaje || e.message || String(e)));
    snackbar(e.mensaje || 'Error al procesar archivo', true);
  } finally {
    await frontendLog('PREVIEW_STEP_FINALLY: Re-enabling preview button');
    document.getElementById('btnPreviewImport').disabled = false;
    document.getElementById('btnPreviewImport').textContent = 'Vista previa';
  }
}

function renderImportPreview(data) {
  const section = document.getElementById('importPreviewSection');
  section.style.display = '';

  const s = data.summary;
  document.getElementById('importPreviewSummary').innerHTML = `
    <div class="import-summary-grid">
      <div class="import-summary-item">
        <span class="import-summary-value">${s.totalRows}</span>
        <span class="import-summary-label">Total filas</span>
      </div>
      <div class="import-summary-item import-summary-valid">
        <span class="import-summary-value">${s.validRows}</span>
        <span class="import-summary-label">V\u00e1lidas</span>
      </div>
      <div class="import-summary-item import-summary-warning">
        <span class="import-summary-value">${s.warningRows}</span>
        <span class="import-summary-label">Advertencias</span>
      </div>
      <div class="import-summary-item import-summary-error">
        <span class="import-summary-value">${s.invalidRows}</span>
        <span class="import-summary-label">Errores</span>
      </div>
    </div>
  `;

  if (data.rows && data.rows.length > 0) {
    const errorRows = data.rows.filter(r => !r.isValid);
    const warningRows = data.rows.filter(r => r.warnings && r.warnings.length > 0 && r.isValid);

    let errorsHtml = '';
    if (errorRows.length > 0) {
      errorsHtml = `<h4 style="margin-bottom:8px;color:var(--danger)">Errores (${errorRows.length})</h4>
        <div class="table-wrap"><table><thead><tr><th>Fila</th><th>Documento</th><th>Nombre</th><th>Errores</th></tr></thead><tbody>
        ${errorRows.map(r => `<tr>
          <td>${r.rowNumber}</td>
          <td>${escapeHtml(String(r.data?.DOCUMENT_NUMBER || ''))}</td>
          <td>${escapeHtml(String(r.data?.FIRST_NAME || '') + ' ' + String(r.data?.LAST_NAME || ''))}</td>
          <td style="color:var(--danger)">${r.errors.map(e => escapeHtml(e.message)).join('<br>')}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
    }

    let warningsHtml = '';
    if (warningRows.length > 0) {
      warningsHtml = `<h4 style="margin:16px 0 8px;color:var(--warning)">Advertencias (${warningRows.length})</h4>
        <div class="table-wrap"><table><thead><tr><th>Fila</th><th>Documento</th><th>Nombre</th><th>Advertencias</th></tr></thead><tbody>
        ${warningRows.map(r => `<tr>
          <td>${r.rowNumber}</td>
          <td>${escapeHtml(String(r.data?.DOCUMENT_NUMBER || ''))}</td>
          <td>${escapeHtml(String(r.data?.FIRST_NAME || '') + ' ' + String(r.data?.LAST_NAME || ''))}</td>
          <td style="color:var(--warning)">${r.warnings.map(w => escapeHtml(w.message)).join('<br>')}</td>
        </tr>`).join('')}
        </tbody></table></div>`;
    }

    document.getElementById('importPreviewErrors').innerHTML = errorsHtml + warningsHtml;
  }
}

async function executeImportFile() {
  await frontendLog('EXECUTE_STEP_1: executeImportFile entered');
  const btn = document.getElementById('btnExecuteImport');
  await frontendLog('EXECUTE_STEP_1a: importState.filePath = ' + (importState.filePath || 'null'));
  await frontendLog('EXECUTE_STEP_1b: importState.dryRun = ' + importState.dryRun);
  await frontendLog('EXECUTE_STEP_1c: importState.module = ' + importState.module);
  await frontendLog('EXECUTE_STEP_1d: btnExecuteImport disabled? = ' + btn.disabled);
  await frontendLog('EXECUTE_STEP_1e: btnExecuteImport pointer-events? = ' + getComputedStyle(btn).pointerEvents);
  await frontendLog('EXECUTE_STEP_1f: btnExecuteImport onclick = ' + (btn.getAttribute('onclick') || 'null'));
  await frontendLog('EXECUTE_STEP_1g: btnExecuteImport outerHTML = ' + btn.outerHTML.substring(0, 200));

  if (!importState.filePath) { await frontendLog('EXECUTE_STEP_2: EARLY RETURN - filePath is falsy'); snackbar('Primero valide el archivo', true); return; }
  await frontendLog('EXECUTE_STEP_2b: filePath is truthy, continuing');

  if (!importState.dryRun) {
    await frontendLog('EXECUTE_STEP_3: dryRun is false, showing confirm dialog');
    const ok = confirm('\u00bfEst\u00e1 seguro de ejecutar la importaci\u00f3n?\n\nSe crear\u00e1 un backup autom\u00e1tico antes de proceder.');
    await frontendLog('EXECUTE_STEP_4: confirm result = ' + ok);
    if (!ok) { await frontendLog('EXECUTE_STEP_5: EARLY RETURN - user cancelled'); return; }
    await frontendLog('EXECUTE_STEP_5b: User confirmed');
  } else {
    await frontendLog('EXECUTE_STEP_3b: dryRun is true, skipping confirm');
  }

  await frontendLog('EXECUTE_STEP_6: Disabling button, setting text to Importando...');
  document.getElementById('btnExecuteImport').disabled = true;
  document.getElementById('btnExecuteImport').textContent = 'Importando...';
  await frontendLog('EXECUTE_STEP_7: Button text now = ' + document.getElementById('btnExecuteImport').textContent);

  try {
    await frontendLog('EXECUTE_STEP_8: Getting token');
    const token = localStorage.getItem('token');
    await frontendLog('EXECUTE_STEP_9: Token exists? = ' + !!token);
    await frontendLog('EXECUTE_STEP_10: About to fetch ' + API + '/import/execute');
    const res = await fetch(`${API}/import/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        filePath: importState.filePath,
        module: importState.module,
        autoCreateReferences: importState.autoCreateRefs,
        updateExisting: importState.updateExisting,
        dryRun: importState.dryRun,
      }),
    });
    await frontendLog('EXECUTE_STEP_11: Fetch response status = ' + res.status);

    if (!res.ok) {
      let execErr = 'Error al ejecutar importaci\u00f3n';
      try { const ej = await res.json(); execErr = ej.mensaje || ej.message || JSON.stringify(ej); } catch(_) {}
      throw { mensaje: `Error al ejecutar importaci\u00f3n (${res.status}): ${execErr}` };
    }
    await frontendLog('EXECUTE_STEP_12: Response OK, parsing JSON');
    const result = await res.json();
    await frontendLog('EXECUTE_STEP_13: Result received, summary: ' + JSON.stringify(result.summary));

    document.getElementById('importResultSection').style.display = '';
    const s = result.summary;
    document.getElementById('importResultContent').innerHTML = `
      <div class="import-summary-grid">
        <div class="import-summary-item import-summary-valid">
          <span class="import-summary-value">${s.insertedRows}</span>
          <span class="import-summary-label">Insertadas</span>
        </div>
        <div class="import-summary-item import-summary-valid">
          <span class="import-summary-value">${s.updatedRows}</span>
          <span class="import-summary-label">Actualizadas</span>
        </div>
        <div class="import-summary-item import-summary-error">
          <span class="import-summary-value">${s.errorRows}</span>
          <span class="import-summary-label">Errores</span>
        </div>
        <div class="import-summary-item">
          <span class="import-summary-value">${(s.durationMs / 1000).toFixed(1)}s</span>
          <span class="import-summary-label">Duraci\u00f3n</span>
        </div>
      </div>
      ${result.importHistoryId ? `<p style="margin-top:12px;font-size:13px;color:var(--text-muted)">ID de importaci\u00f3n: ${result.importHistoryId}</p>` : ''}
      ${result.summary.errorRows > 0 ? `<button class="btn btn-sm btn-secondary" style="margin-top:12px" onclick="downloadErrorReport(${result.importHistoryId})">Descargar informe de errores</button>` : ''}
    `;

    snackbar(importState.dryRun ? 'Simulaci\u00f3n completada' : 'Importaci\u00f3n completada');
    loadImportHistory();
  } catch (e) {
    await frontendLog('EXECUTE_STEP_ERR: Caught exception: ' + (e.mensaje || e.message || String(e)));
    snackbar(e.mensaje || 'Error al importar', true);
  } finally {
    await frontendLog('EXECUTE_STEP_FINALLY: Re-enabling execute button');
    document.getElementById('btnExecuteImport').disabled = false;
    document.getElementById('btnExecuteImport').textContent = 'Ejecutar importaci\u00f3n';
  }
}

async function downloadEmployeeTemplate() {
  try {
    const token = localStorage.getItem('token');
    if (window.__TAURI_INTERNALS__) {
      const absUrl = window.location.origin + '/api/v1/import/employees/template';
      const path = await window.__TAURI_INTERNALS__.invoke('save_download_file', {
        url: absUrl,
        token: token,
        defaultName: 'plantilla_empleados.xlsx',
      });
      snackbar('Plantilla descargada en: ' + path);
    } else {
      const res = await fetch(`${API}/import/employees/template`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'plantilla_empleados.xlsx'; document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      snackbar('Plantilla descargada');
    }
  } catch (e) { snackbar('Error al descargar plantilla: ' + (e || ''), true); }
}

async function downloadWorkSessionTemplate() {
  try {
    const token = localStorage.getItem('token');
    if (window.__TAURI_INTERNALS__) {
      const absUrl = window.location.origin + '/api/v1/import/template/work-sessions';
      const path = await window.__TAURI_INTERNALS__.invoke('save_download_file_post', {
        url: absUrl,
        token: token,
        defaultName: 'plantilla_jornadas.xlsx',
      });
      snackbar('Plantilla descargada en: ' + path);
    } else {
      const res = await fetch(`${API}/import/template/work-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'plantilla_jornadas.xlsx'; document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      snackbar('Plantilla descargada');
    }
  } catch (e) { snackbar('Error al descargar plantilla: ' + (e || ''), true); }
}

async function downloadBdPersonasEpTemplate() {
  try {
    const token = localStorage.getItem('token');
    if (window.__TAURI_INTERNALS__) {
      const absUrl = window.location.origin + '/api/v1/import/template/bd-personas-ep';
      const path = await window.__TAURI_INTERNALS__.invoke('save_download_file_post', {
        url: absUrl,
        token: token,
        defaultName: 'plantilla_bd_personas_ep.xlsx',
      });
      snackbar('Plantilla BD Personas EP descargada en: ' + path);
    } else {
      const res = await fetch(`${API}/import/template/bd-personas-ep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'plantilla_bd_personas_ep.xlsx'; document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      snackbar('Plantilla BD Personas EP descargada');
    }
  } catch (e) { snackbar('Error al descargar plantilla BD Personas EP: ' + (e || ''), true); }
}

async function exportEmployeesTemplate() {
  try {
    const token = localStorage.getItem('token');
    if (window.__TAURI_INTERNALS__) {
      const absUrl = window.location.origin + '/api/v1/import/employees/export';
      const path = await window.__TAURI_INTERNALS__.invoke('save_download_file_post', {
        url: absUrl,
        token: token,
        defaultName: 'exportacion_empleados.xlsx',
      });
      snackbar('Empleados exportados en: ' + path);
    } else {
      const res = await fetch(`${API}/import/employees/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'exportacion_empleados.xlsx'; document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      snackbar('Empleados exportados');
    }
  } catch (e) { snackbar('Error al exportar: ' + (e || ''), true); }
}

let importHistPage = 1;
async function loadImportHistory(page) {
  importHistPage = page || 1;
  try {
    const data = await get(`/import/history?page=${importHistPage}&limit=10`);
    const tbody = document.getElementById('importHistoryTbody');
    if (!data.data || data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty">Sin importaciones registradas</td></tr>';
      return;
    }
    const statusLabels = { PENDING: 'Pendiente', PROCESSING: 'Procesando', COMPLETED: 'Completada', FAILED: 'Fallida', ROLLED_BACK: 'Revertida' };
    const statusClasses = { PENDING: 'badge-info', PROCESSING: 'badge-primary', COMPLETED: 'badge-active', FAILED: 'badge-inactive', ROLLED_BACK: 'badge-warning' };
    tbody.innerHTML = data.data.map(h => `<tr>
      <td>${new Date(h.createdAt).toLocaleString('es-CO')}</td>
      <td>${escapeHtml(h.user?.name || '-')}</td>
      <td>${escapeHtml(h.filename)}</td>
      <td>${MODULE_LABELS[h.module] || escapeHtml(h.module)}</td>
      <td>${h.durationMs ? (h.durationMs / 1000).toFixed(1) + 's' : '-'}</td>
      <td>${h.totalRows}</td>
      <td>${h.insertedRows}</td>
      <td>${h.updatedRows}</td>
      <td>${h.errorRows > 0 ? `<span style="color:var(--danger)">${h.errorRows}</span>` : '0'}</td>
      <td><span class="badge ${statusClasses[h.status] || ''}">${statusLabels[h.status] || h.status}</span></td>
      <td>
        ${h.errorRows > 0 ? `<button class="btn btn-sm btn-secondary" onclick="downloadErrorReport(${h.id})">Errores</button>` : ''}
        ${h.status === 'COMPLETED' && h.backupPath ? `<button class="btn btn-sm btn-danger" onclick="rollbackImport(${h.id})">Revertir</button>` : ''}
      </td>
    </tr>`).join('');
    renderPagination('importHistoryPagination', importHistPage, data.meta.totalPages, loadImportHistory);
  } catch (e) { snackbar('Error al cargar historial', true); }
}

async function downloadErrorReport(importId) {
  try {
    const token = localStorage.getItem('token');
    if (window.__TAURI_INTERNALS__) {
      const absUrl = window.location.origin + `/api/v1/import/history/${importId}/error-report`;
      const path = await window.__TAURI_INTERNALS__.invoke('save_download_file', {
        url: absUrl,
        token: token,
        defaultName: `informe_errores_${importId}.xlsx`,
      });
      snackbar('Informe descargado en: ' + path);
    } else {
      const res = await fetch(`${API}/import/history/${importId}/error-report`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `informe_errores_${importId}.xlsx`; document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      snackbar('Informe descargado');
    }
  } catch (e) { snackbar('Error al descargar informe: ' + (e || ''), true); }
}

async function rollbackImport(importId) {
  const ok = confirm('\u00bfEst\u00e1 seguro de revertir esta importaci\u00f3n?\n\nSe restaurar\u00e1 el backup anterior.');
  if (!ok) return;
  try {
    await post('/import/rollback', { importHistoryId: importId });
    snackbar('Importaci\u00f3n revertida');
    loadImportHistory();
  } catch (e) { snackbar(e.mensaje || 'Error al revertir', true); }
}

/* ------- USUARIOS ------- */
let usrPage = 1;

const debouncedLoadUsuarios = debounce(() => loadUsuarios(1), 300);

async function renderUsuarios() {
  document.getElementById('pageContent').innerHTML = `
    <div class="page-header"><h1>Usuarios</h1>
      <button class="btn btn-primary" onclick="showUsrModal()">+ Nuevo</button>
    </div>
    <div class="filters">
      <input id="usrSearch" placeholder="Buscar nombre o email..." oninput="debouncedLoadUsuarios()">
      <select id="usrFilter" onchange="loadUsuarios(1)">
        <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option>
      </select>
      <select id="usrRoleFilter" onchange="loadUsuarios(1)">
        <option value="">Todos los roles</option>
        <option value="ADMINISTRADOR">Administrador</option>
        <option value="GESTION_HUMANA">Gesti&oacute;n Humana</option>
        <option value="SUPERVISOR">Supervisor</option>
      </select>
    </div>
    <div id="usrStats" style="margin-bottom:16px"></div>
    <div class="table-wrap"><table><thead><tr>
      <th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th>
    </tr></thead><tbody id="usrTbody"></tbody></table></div>
    <div class="pagination" id="usrPagination"></div>
    <div class="modal-overlay" id="usrModal"><div class="modal"><h2 id="usrModalTitle">Nuevo Usuario</h2>
      <div class="modal-body">
        <div class="form-group"><label>Nombre completo</label><input id="uf_name"></div>
        <div class="form-group"><label>Email</label><input id="uf_email" type="email"></div>
        <div class="form-group"><label id="uf_pass_label">Contrase&ntilde;a</label><input id="uf_password" type="password" minlength="6"></div>
        <div class="form-group"><label>Rol</label>
          <select id="uf_role">
            <option value="GESTION_HUMANA">Gesti&oacute;n Humana</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="ADMINISTRADOR">Administrador</option>
          </select>
        </div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal('usrModal')">Cancelar</button>
        <button class="btn btn-primary" onclick="saveUsuario()">Guardar</button>
      </div>
    </div></div>
    <div class="modal-overlay" id="resetPwModal"><div class="modal" style="max-width:400px"><h2>Restablecer Contrase&ntilde;a</h2>
      <div class="modal-body">
        <p style="margin-bottom:12px;color:var(--text-muted);font-size:13px" id="resetPwUser"></p>
        <div class="form-group"><label>Nueva contrase&ntilde;a</label><input id="rpf_newPassword" type="password" minlength="6"></div>
      </div>
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="closeModal('resetPwModal')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmResetPassword()">Restablecer</button>
      </div>
    </div></div>
  `;
  loadUsuariosStats();
  loadUsuarios(1);
}

async function loadUsuariosStats() {
  try {
    const s = await get('/usuarios/stats');
    document.getElementById('usrStats').innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <span class="badge badge-primary" style="padding:6px 12px">Total: ${s.total}</span>
        <span class="badge badge-active" style="padding:6px 12px">Activos: ${s.active}</span>
        <span class="badge badge-inactive" style="padding:6px 12px">Inactivos: ${s.inactive}</span>
        ${Object.entries(s.byRole || {}).map(([role, count]) =>
          `<span class="badge badge-info" style="padding:6px 12px">${role}: ${count}</span>`
        ).join('')}
      </div>`;
  } catch (e) { /* ignore */ }
}

async function loadUsuarios(page) {
  usrPage = page;
  const search = document.getElementById('usrSearch')?.value || '';
  const filter = document.getElementById('usrFilter')?.value || '';
  const roleFilter = document.getElementById('usrRoleFilter')?.value || '';
  try {
    let q = `/usuarios?page=${page}&limit=10`;
    if (search) q += `&search=${encodeURIComponent(search)}`;
    if (filter) q += `&isActive=${filter}`;
    if (roleFilter) q += `&role=${roleFilter}`;
    const data = await get(q);
    document.getElementById('usrTbody').innerHTML = data.data.map(u => {
      const roleLabels = { ADMINISTRADOR: 'Administrador', GESTION_HUMANA: 'Gesti\u00f3n Humana', SUPERVISOR: 'Supervisor' };
      return `<tr>
        <td>${u.id}</td>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge badge-primary">${roleLabels[u.role] || u.role}</span></td>
        <td><span class="badge ${u.isActive ? 'badge-active' : 'badge-inactive'}">${u.isActive ? 'Activo' : 'Inactivo'}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="editUsr(${u.id})">Editar</button>
          <button class="btn btn-sm btn-secondary" data-action="resetpw" data-uid="${u.id}" data-uname="${escapeHtml(u.name)}">Contrase&ntilde;a</button>
          ${u.email === MAIN_ADMIN_EMAIL
            ? '<span class="btn btn-sm btn-disabled" title="Cuenta principal protegida">Protegido</span>'
            : `<button class="btn btn-sm ${u.isActive ? 'btn-warning' : 'btn-primary'}" onclick="toggleUsr(${u.id},${u.isActive},${u.email === MAIN_ADMIN_EMAIL})">${u.isActive ? 'Desactivar' : 'Activar'}</button>`
          }
        </td>
      </tr>`;
    }).join('');
    renderPagination('usrPagination', page, data.meta.totalPages, loadUsuarios);
  } catch (e) { snackbar('Error al cargar usuarios', true); }
}

let editingUsrId = null;
function showUsrModal(u) {
  editingUsrId = u?.id || null;
  document.getElementById('usrModalTitle').textContent = u ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('uf_name').value = u?.name || '';
  document.getElementById('uf_email').value = u?.email || '';
  document.getElementById('uf_password').value = '';
  document.getElementById('uf_password').placeholder = u ? 'Dejar vac\u0edano para no cambiar' : '';
  document.getElementById('uf_pass_label').textContent = u ? 'Contrase\u00f1a (opcional)' : 'Contrase\u00f1a';
  document.getElementById('uf_role').value = u?.role || 'GESTION_HUMANA';
  document.getElementById('usrModal').classList.add('show');
}

function editUsr(id) {
  get(`/usuarios/${id}`).then(u => showUsrModal(u)).catch(() => snackbar('Error al cargar usuario', true));
}

async function saveUsuario() {
  const data = {
    name: document.getElementById('uf_name').value,
    email: document.getElementById('uf_email').value,
    role: document.getElementById('uf_role').value,
  };
  const pw = document.getElementById('uf_password').value;
  if (pw) data.password = pw;
  try {
    if (editingUsrId) {
      await patch(`/usuarios/${editingUsrId}`, data);
      snackbar('Usuario actualizado');
    } else {
      if (!pw) { snackbar('La contrase\u00f1a es obligatoria para nuevos usuarios', true); return; }
      await post('/usuarios', data);
      snackbar('Usuario creado');
    }
    closeModal('usrModal');
    loadUsuarios(usrPage);
    loadUsuariosStats();
  } catch (e) { snackbar(e.message || e.mensaje || 'Error al guardar', true); }
}

async function toggleUsr(id, active, isMainAdmin) {
  if (isMainAdmin) { snackbar('La cuenta administradora principal no puede desactivarse', true); return; }
  if (active) {
    const ok = confirm('\u00bfEst\u00e1 seguro de que desea desactivar este usuario?\n\nEl usuario perder\u00e1 inmediatamente el acceso al sistema.\nEsta acci\u00f3n podr\u00e1 revertirse posteriormente reactivando la cuenta.');
    if (!ok) return;
  } else {
    const ok = confirm('\u00bfDesea reactivar este usuario?');
    if (!ok) return;
  }
  try {
    await patch(`/usuarios/${id}/estado`, { activo: !active });
    snackbar(active ? 'Usuario desactivado' : 'Usuario activado');
    loadUsuarios(usrPage);
    loadUsuariosStats();
  } catch (e) { snackbar(e.message || e.mensaje || 'Error al cambiar estado', true); }
}

let resetPwUserId = null;
function showResetPwModal(id, name) {
  resetPwUserId = id;
  document.getElementById('resetPwUser').textContent = `Establecer nueva contrase\u00f1a para: ${name}`;
  document.getElementById('rpf_newPassword').value = '';
  document.getElementById('resetPwModal').classList.add('show');
}

async function confirmResetPassword() {
  const pw = document.getElementById('rpf_newPassword').value;
  if (!pw || pw.length < 6) { snackbar('M\u00ednimo 6 caracteres', true); return; }
  try {
    await patch(`/usuarios/${resetPwUserId}/restablecer-contrasena`, { newPassword: pw });
    snackbar('Contrase\u00f1a restablecida');
    closeModal('resetPwModal');
  } catch (e) { snackbar(e.message || e.mensaje || 'Error al restablecer', true); }
}

/* helpers */
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function renderPagination(elId, page, totalPages, callback) {
  const el = document.getElementById(elId);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  const prev = document.createElement('button');
  prev.textContent = 'Anterior';
  prev.disabled = page <= 1;
  prev.addEventListener('click', () => callback(page - 1));
  const span = document.createElement('span');
  span.textContent = `P\u00e1g ${page} de ${totalPages}`;
  const next = document.createElement('button');
  next.textContent = 'Siguiente';
  next.disabled = page >= totalPages;
  next.addEventListener('click', () => callback(page + 1));
  el.innerHTML = '';
  el.appendChild(prev);
  el.appendChild(span);
  el.appendChild(next);
}

/* ------- AUDITORIA ------- */
async function auditJornada(id) {
  const modal = document.getElementById('auditModal');
  modal.classList.add('show');
  document.getElementById('auditContent').innerHTML = '<div class="loader-container"><div class="loader"></div></div>';

  try {
    const trace = await post(`/jornadas/${id}/auditoria`);
    renderAuditContent(trace);
  } catch (e) {
    document.getElementById('auditContent').innerHTML = '<div class="empty">Error al generar auditor\u00eda.</div>';
    snackbar(e.mensaje || 'Error al auditar', true);
  }
}

function renderAuditContent(trace) {
  const el = document.getElementById('auditContent');
  const g = trace.generalInfo;
  const inp = trace.inputData;
  const brk = trace.breakApplication;
  const cls = trace.legalClassification;
  const wk = trace.weeklyAccumulation;
  const res = trace.finalResult;
  const val = trace.validations;

  const BUCKET_COLORS = {
    ordinarioDiurno: '#2196F3',
    ordinarioNocturno: '#1565C0',
    extraDiurno: '#FF9800',
    extraNocturno: '#E65100',
    dominicalFestivoDiurno: '#4CAF50',
    dominicalFestivoNocturno: '#2E7D32',
    extraDominicalFestivoDiurno: '#9C27B0',
    extraDominicalFestivoNocturno: '#6A1B9A',
  };

  const BUCKET_LABELS = {
    ordinarioDiurno: 'Ord. Diurno',
    ordinarioNocturno: 'Ord. Nocturno',
    extraDiurno: 'Extra Diurno',
    extraNocturno: 'Extra Nocturno',
    dominicalFestivoDiurno: 'Dom/Fest Diurno',
    dominicalFestivoNocturno: 'Dom/Fest Nocturno',
    extraDominicalFestivoDiurno: 'Ex.Fest Diurno',
    extraDominicalFestivoNocturno: 'Ex.Fest Nocturno',
  };

  let html = '';

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Informaci\u00f3n General
    </h3>
    <div class="audit-section-body">
      <div class="audit-kv"><span>Empleado</span><strong>${escapeHtml(g.employeeName)}</strong></div>
      <div class="audit-kv"><span>Documento</span><strong>${escapeHtml(g.documentNumber)}</strong></div>
      <div class="audit-kv"><span>Modalidad</span><strong>${escapeHtml(g.modality)}</strong></div>
      <div class="audit-kv"><span>Configuraci\u00f3n</span><strong>${escapeHtml(g.configName)}</strong></div>
      <div class="audit-kv"><span>Timezone</span><strong>${escapeHtml(g.timezone)}</strong></div>
      <div class="audit-kv"><span>Inicio</span><strong>${new Date(g.startTime).toLocaleString('es-CO')}</strong></div>
      <div class="audit-kv"><span>Fin</span><strong>${new Date(g.endTime).toLocaleString('es-CO')}</strong></div>
      <div class="audit-kv"><span>Meta semanal</span><strong>${g.weeklyTargetMinutes} min</strong></div>
    </div>
  </div>`;

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Datos de Entrada
    </h3>
    <div class="audit-section-body">
      <div class="audit-kv"><span>Total minutos</span><strong>${inp.totalMinutes}</strong></div>
      <div class="audit-kv"><span>Descanso solicitado</span><strong>${inp.breakMinutesInput} min</strong></div>
    </div>
  </div>`;

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Configuraci\u00f3n Utilizada
    </h3>
    <div class="audit-section-body">
      <div class="audit-kv"><span>Tope diario</span><strong>${escapeHtml(JSON.stringify(trace.configUsed.dailyCaps))}</strong></div>
      <div class="audit-kv"><span>Meta semanal</span><strong>${escapeHtml(trace.configUsed.weeklyTargetMinutes + ' min')}</strong></div>
      <div class="audit-kv"><span>Acumulado semanal</span><strong>${escapeHtml(trace.configUsed.accumulatedWeekMinutes + ' min')}</strong></div>
      <div class="audit-kv"><span>Horario nocturno</span><strong>${escapeHtml(trace.configUsed.nightStart + ' - ' + trace.configUsed.nightEnd)}</strong></div>
      <div class="audit-kv"><span>Recargos</span><strong>${escapeHtml(Object.entries(trace.configUsed.recargos).map(([k, v]) => k + ': ' + (v * 100) + '%').join(', '))}</strong></div>
    </div>
  </div>`;

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Aplicaci\u00f3n del Descanso
    </h3>
    <div class="audit-section-body">
      <div class="audit-kv"><span>Total minutos</span><strong>${brk.totalMinutes}</strong></div>
      <div class="audit-kv"><span>Descanso</span><strong>-${brk.breakMinutes} min</strong></div>
      <div class="audit-kv"><span>Min. efectivos</span><strong>${brk.effectiveMinutes} min</strong></div>
      <p class="audit-reasoning">${escapeHtml(brk.reasoning)}</p>
    </div>
  </div>`;

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Clasificaci\u00f3n Legal (8 Buckets)
    </h3>
    <div class="audit-section-body">
      <div class="audit-buckets">`;
  for (const b of cls.buckets) {
    const color = BUCKET_COLORS[b.key] || '#666';
    html += `<div class="audit-bucket-item">
        <div class="audit-bucket-bar" style="background:${color};width:${cls.totalLiquidable > 0 ? Math.round(b.minutes / cls.totalLiquidable * 100) : 0}%"></div>
        <div class="audit-bucket-info">
          <span class="audit-bucket-name">${escapeHtml(b.name)}</span>
          <span class="audit-bucket-legal">${escapeHtml(b.legalBase)} &mdash; ${escapeHtml(b.description)}</span>
        </div>
        <div class="audit-bucket-value">
          <strong>${formatMinutesToHours(b.minutes)}</strong>
          <span class="audit-bucket-pct">${b.percentage}%</span>
        </div>
      </div>`;
  }
  html += `</div>
      <div class="audit-invariant ${cls.invariants.equalsLiquidable ? 'audit-pass' : 'audit-fail'}">
        Invariante \u03a3buckets = liquidable: ${cls.invariants.sumOfBuckets} = ${cls.totalLiquidable} ${cls.invariants.equalsLiquidable ? '\u2705' : '\u274c'}
      </div>
    </div>
  </div>`;

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Acumulaci\u00f3n Semanal
    </h3>
    <div class="audit-section-body">
      <div class="audit-kv"><span>Antes</span><strong>${formatMinutesToHours(wk.beforeMinutes)}</strong></div>
      <div class="audit-kv"><span>Despu\u00e9s</span><strong>${formatMinutesToHours(wk.afterMinutes)}</strong></div>
      <div class="audit-kv"><span>Objetivo</span><strong>${formatMinutesToHours(wk.targetMinutes)}</strong></div>
      <div class="audit-kv"><span>Restante</span><strong>${formatMinutesToHours(wk.remainingMinutes)}</strong></div>
    </div>
  </div>`;

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Resultado Final
    </h3>
    <div class="audit-section-body">
      <div class="audit-kv"><span>Total</span><strong>${formatMinutesToHours(res.totalMinutes)}</strong></div>
      <div class="audit-kv"><span>Descanso</span><strong>${formatMinutesToHours(res.breakMinutes)}</strong></div>
      <div class="audit-kv"><span>Liquidable</span><strong>${formatMinutesToHours(res.liquidableMinutes)}</strong></div>
      <div class="audit-result-grid">
        ${Object.entries(BUCKET_LABELS).map(([key, label]) =>
          `<div class="audit-result-item" style="border-left:4px solid ${BUCKET_COLORS[key]}">
            <span>${label}</span>
            <strong>${formatMinutesToHours(res[key])}</strong>
          </div>`
        ).join('')}
      </div>
    </div>
  </div>`;

  html += `<div class="audit-section">
    <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
      <span class="material-icons audit-toggle-icon">expand_more</span>
      Validaciones
    </h3>
    <div class="audit-section-body">
      ${val.map(v => `<div class="audit-validation ${v.passed ? 'audit-pass' : 'audit-fail'}">
        <span class="material-icons">${v.passed ? 'check_circle' : 'error'}</span>
        <div><strong>${escapeHtml(v.name)}</strong><br><small>${escapeHtml(v.detail)}</small></div>
      </div>`).join('')}
    </div>
  </div>`;

  if (trace.timeline.length > 0 && trace.timeline.length <= 720) {
    html += `<div class="audit-section">
      <h3 class="audit-section-title" onclick="toggleAuditSection(this)">
        <span class="material-icons audit-toggle-icon">expand_more</span>
        L\u00ednea de Tiempo (${trace.timeline.length} min)
      </h3>
      <div class="audit-section-body">
        <div class="audit-timeline">`;
    for (const t of trace.timeline) {
      const color = BUCKET_COLORS[t.bucket] || '#666';
      const title = `Min ${t.minuteIndex}: ${t.bogotaTime} ${t.dayName} ${t.dateStr}\\nBucket: ${t.bucket}\\nNight: ${t.isNight ? 'Si' : 'No'} | Ord: ${t.isOrdinary ? 'Si' : 'No'}\\nDaily: ${t.dailyUsedBefore}/${t.dailyCap} | Weekly: ${t.weeklyUsedBefore}`;
      const cell = document.createElement('div');
      cell.className = 'audit-timeline-cell';
      cell.style.background = color;
      cell.title = title;
      html += cell.outerHTML;
    }
    html += `</div>
        <div class="audit-timeline-legend">`;
    for (const [key, label] of Object.entries(BUCKET_LABELS)) {
      html += `<div class="audit-legend-item"><span class="audit-legend-color" style="background:${BUCKET_COLORS[key]}"></span>${label}</div>`;
    }
    html += `</div></div></div>`;
  }

  el.innerHTML = html;
}

function toggleAuditSection(titleEl) {
  const body = titleEl.nextElementSibling;
  const icon = titleEl.querySelector('.audit-toggle-icon');
  if (body.style.display === 'none') {
    body.style.display = '';
    icon.textContent = 'expand_more';
  } else {
    body.style.display = 'none';
    icon.textContent = 'chevron_right';
  }
}

function exportAuditPDF() {
  const content = document.getElementById('auditContent');
  const printWindow = window.open('', '_blank');
  const safeContent = content.innerHTML;
  printWindow.document.write(`
    <html><head><title>Auditor\u00eda de Jornada</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
      h3 { color: #1A3A6B; border-bottom: 2px solid #1A3A6B; padding-bottom: 4px; }
      .audit-kv { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; }
      .audit-bucket-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
      .audit-bucket-bar { height: 12px; min-width: 2px; border-radius: 2px; }
      .audit-result-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
      .audit-result-item { padding: 6px; border-radius: 4px; background: #f8f9fa; }
      .audit-validation { display: flex; gap: 6px; padding: 4px 0; }
      .audit-pass { color: #2e7d32; }
      .audit-fail { color: #c62828; }
      .audit-reasoning { font-style: italic; color: #555; margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; }
      .audit-timeline { display: flex; flex-wrap: wrap; gap: 1px; }
      .audit-timeline-cell { width: 4px; height: 4px; border-radius: 1px; }
      .audit-timeline-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .audit-legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; }
      .audit-legend-color { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    </style></head><body>
    <h1 style="color:#1A3A6B;font-size:18px">Auditor\u00eda de Jornada Laboral</h1>
    <p style="color:#666;font-size:11px">Generado: ${escapeHtml(new Date().toLocaleString('es-CO'))}</p>
    ${safeContent}
    </body></html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

/* init */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="resetpw"]');
  if (btn) {
    showResetPwModal(parseInt(btn.dataset.uid), btn.dataset.uname);
    return;
  }
  const xlsxBtn = e.target.closest('.btn-xlsx-rep');
  if (xlsxBtn) {
    if (!lastReportData || lastReportData.length === 0) { snackbar('No hay datos del reporte'); return; }
    const periodo = xlsxBtn.dataset.periodo;
    const rows = lastReportData.map(r => {
      const workedMinutes = (r.ordinaryMinutes||0) + (r.sundayMinutes||0) + (r.holidayMinutes||0) +
        (r.extraDayMinutes||0) + (r.extraNightMinutes||0) +
        (r.extraHolidayDayMinutes||0) + (r.extraHolidayNightMinutes||0);
      return {
        empleado: escapeHtml(r.employee.firstName) + ' ' + escapeHtml(r.employee.lastName),
        documento: escapeHtml(r.employee.documentNumber),
        jornadas: r.totalSessions,
        total: formatMinutesToHours(workedMinutes),
        ord: formatMinutesToHours(r.ordinaryMinutes),
        noct: formatMinutesToHours(r.nightSurchargeMinutes),
        extra_diurnas: formatMinutesToHours(r.extraDayMinutes),
        extra_nocturnas: formatMinutesToHours(r.extraNightMinutes),
        dominical: formatMinutesToHours(r.sundayMinutes),
        festivo: formatMinutesToHours(r.holidayMinutes),
        extra_fest_diurnas: formatMinutesToHours(r.extraHolidayDayMinutes),
        extra_fest_nocturnas: formatMinutesToHours(r.extraHolidayNightMinutes),
        recargo_ndf: formatMinutesToHours(r.sundayNightSurchargeMinutes),
      };
    });
    const headers = [
      { label: 'Empleado', key: 'empleado' },
      { label: 'Documento', key: 'documento' },
      { label: 'Jornadas', key: 'jornadas' },
      { label: 'Total', key: 'total' },
      { label: '001 Ordinarias', key: 'ord' },
      { label: '006-RECNOC Nocturnas', key: 'noct' },
      { label: '002-HED Extra Diurnas', key: 'extra_diurnas' },
      { label: '003-HEN Extra Nocturnas', key: 'extra_nocturnas' },
      { label: '013-DOMINGO Dominical', key: 'dominical' },
      { label: '014-FESTIVO Festivo', key: 'festivo' },
      { label: '004-HEFD Extra Fest. Diurnas', key: 'extra_fest_diurnas' },
      { label: '005-HEFN Extra Fest. Nocturnas', key: 'extra_fest_nocturnas' },
      { label: '012-REC.NDF Recargo NDF', key: 'recargo_ndf' },
    ];
    downloadXLSX('reporte_' + periodo + '.xlsx', headers, rows);
    snackbar('Excel exportado');
  }
});
if (localStorage.getItem('token')) {
  frontendLog('APPLICATION_STARTED');
  initApp();
} else {
  frontendLog('APPLICATION_STARTED');
  showLogin();
}
