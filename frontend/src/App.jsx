import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import KanbanBoard from './KanbanBoard';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const PRIORITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' };
const STATUS_LABELS = { todo: 'Por hacer', in_progress: 'En progreso', done: 'Completado' };

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('user')); }
  catch { return null; }
}

function formatDateForInput(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  const pad = v => String(v).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

function formatTimeForInput(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  const pad = v => String(v).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildAlarmDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  return new Date(`${dateValue}T${timeValue}`);
}

function formatAlarmDisplay(dateValue) {
  const date = new Date(dateValue);
  return `${date.toLocaleDateString()} - ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Notificaciones anticipadas ─────────────────────────────────────
const DEADLINE_THRESHOLDS = [
  { key: '24h', label: '24 horas', ms: 24 * 60 * 60 * 1000, warn: 25 * 60 * 60 * 1000 },
  { key: '1h',  label: '1 hora',   ms: 60 * 60 * 1000,       warn: 2 * 60 * 60 * 1000 }
];

function App() {
  const [tasks, setTasks] = useState([]);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [authMode, setAuthMode] = useState('login');
  const [authMessage, setAuthMessage] = useState(null);
  const [authForm, setAuthForm] = useState({ username: '', password: '', email: '' });
  const [newTask, setNewTask] = useState({ name: '', description: '', deadline: '', priority: 'medium', alarmDate: '', alarmTime: '' });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', deadline: '', priority: 'medium', alarmDate: '', alarmTime: '' });
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return saved || (systemDark ? 'dark' : 'light');
  });
  const [alarmStatus, setAlarmStatus] = useState('Haz clic en Activar alarmas para permitir notificaciones y sonido');
  const [alarmStatusClass, setAlarmStatusClass] = useState('alarm-status');
  const [alarmButtonText, setAlarmButtonText] = useState('Activar alarmas');
  const [alarmButtonDisabled, setAlarmButtonDisabled] = useState(false);
  const [alarmModalTask, setAlarmModalTask] = useState(null);
  const [completePromptTask, setCompletePromptTask] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState('list'); // 'list' | 'kanban'
  const [profileModal, setProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ email: '', emailReminders: true });
  const [profileMsg, setProfileMsg] = useState(null);

  const alarmIntervalRef = useRef(null);
  const alarmAudioContextRef = useRef(null);
  const serviceWorkerRegistrationRef = useRef(null);
  const notifiedAlarmTaskIdsRef = useRef(new Set());
  const notifiedDeadlineRef = useRef(new Set());
  const tasksRef = useRef([]);

  const isAuthenticated = Boolean(token && currentUser);
  const authTitle = authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse';
  const authSubtitle = authMode === 'login'
    ? 'Ingresa tus credenciales para acceder a tus tareas'
    : 'Crea una cuenta nueva para organizar tus tareas';
  const authSubmitText = authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta';
  const alarmMessage = alarmModalTask ? `Alarma de tarea: ${alarmModalTask.Name}` : '';

  const requestApi = useCallback(async (endpoint, options = {}) => {
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('token'); localStorage.removeItem('user');
      setToken(null); setCurrentUser(null);
    }
    return response;
  }, [token]);

  const updateAlarmStatus = useCallback(() => {
    const hasAudio = Boolean(alarmAudioContextRef.current);
    const granted = 'Notification' in window && Notification.permission === 'granted';
    const denied = 'Notification' in window && Notification.permission === 'denied';

    if (granted && hasAudio) {
      setAlarmStatus('Alarmas activas con notificación y sonido');
      setAlarmStatusClass('alarm-status active');
      setAlarmButtonText('Alarmas activas');
      setAlarmButtonDisabled(true);
      return;
    }
    if (denied && hasAudio) {
      setAlarmStatus('Sonido activo. Las notificaciones están bloqueadas en el navegador');
      setAlarmStatusClass('alarm-status warning');
      setAlarmButtonText('Sonido activo');
      setAlarmButtonDisabled(true);
      return;
    }
    if (denied) {
      setAlarmStatus('Notificaciones bloqueadas. Actívalas desde los permisos del navegador');
      setAlarmStatusClass('alarm-status warning');
      setAlarmButtonText('Activar sonido');
      setAlarmButtonDisabled(false);
      return;
    }
    setAlarmStatus('Haz clic en Activar alarmas para permitir notificaciones y sonido');
    setAlarmStatusClass('alarm-status');
    setAlarmButtonText('Activar alarmas');
    setAlarmButtonDisabled(false);
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;
    try {
      serviceWorkerRegistrationRef.current = await navigator.serviceWorker.register('/sw.js');
      return serviceWorkerRegistrationRef.current;
    } catch (error) {
      console.error('No se pudo registrar el service worker:', error);
      return null;
    }
  }, []);

  const getAlarmAudioContext = useCallback(() => {
    if (!('AudioContext' in window) && !('webkitAudioContext' in window)) return null;
    if (!alarmAudioContextRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      alarmAudioContextRef.current = new AC();
    }
    if (alarmAudioContextRef.current.state === 'suspended') alarmAudioContextRef.current.resume();
    return alarmAudioContextRef.current;
  }, []);

  const playAlarmSound = useCallback((isTest = false) => {
    const ctx = getAlarmAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [{ start: 0, f: 880 }, { start: 0.22, f: 660 }, { start: 0.44, f: 880 }].forEach(({ start, f }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + start);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(isTest ? 0.12 : 0.25, now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + start); osc.stop(now + start + 0.2);
    });
  }, [getAlarmAudioContext]);

  const showSystemNotification = useCallback(async (task, message) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body: message, tag: `task-${task.TaskId}`, requireInteraction: true, renotify: true };
    try {
      const reg = serviceWorkerRegistrationRef.current || await navigator.serviceWorker.ready;
      if (reg?.showNotification) { await reg.showNotification('Taskerly', options); return; }
    } catch {}
    const n = new Notification('Taskerly', options);
    n.onclick = () => { window.focus(); n.close(); };
  }, []);

  const loadTasks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await requestApi('/all-tasks');
      if (!res.ok) return;
      setTasks(await res.json());
    } catch (e) { console.error('Error cargando tareas:', e); }
  }, [requestApi, token]);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const checkTaskAlarms = useCallback(() => {
    const now = new Date();
    tasksRef.current.forEach(task => {
      if (task.Completed) return;

      // Alarma puntual
      if (task.AlarmTime && !notifiedAlarmTaskIdsRef.current.has(task.TaskId)) {
        if (new Date(task.AlarmTime) <= now) {
          notifiedAlarmTaskIdsRef.current.add(task.TaskId);
          setAlarmModalTask(task);
          playAlarmSound();
          showSystemNotification(task, `Alarma: ${task.Name}`);
        }
      }

      // Notificaciones anticipadas de deadline
      if (task.Deadline) {
        const msLeft = new Date(task.Deadline) - now;
        DEADLINE_THRESHOLDS.forEach(({ key, label, ms, warn }) => {
          if (msLeft > 0 && msLeft <= warn && msLeft > ms - 30 * 60 * 1000) {
            const dKey = `${task.TaskId}:deadline:${key}`;
            if (!notifiedDeadlineRef.current.has(dKey)) {
              notifiedDeadlineRef.current.add(dKey);
              showSystemNotification(task, `⏰ "${task.Name}" vence en ${label}`);
            }
          }
        });
      }
    });
  }, [playAlarmSound, showSystemNotification]);

  const stopAlarmChecker = useCallback((clearNotified = false) => {
    if (clearNotified) { notifiedAlarmTaskIdsRef.current.clear(); notifiedDeadlineRef.current.clear(); }
    if (!alarmIntervalRef.current) return;
    clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = null;
  }, []);

  const startAlarmChecker = useCallback(() => {
    if (alarmIntervalRef.current) return;
    alarmIntervalRef.current = setInterval(checkTaskAlarms, 5000);
  }, [checkTaskAlarms]);

  const logout = useCallback(() => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setToken(null); setCurrentUser(null);
    stopAlarmChecker(true);
  }, [stopAlarmChecker]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = e => { if (!localStorage.getItem('theme')) setTheme(e.matches ? 'dark' : 'light'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => { registerServiceWorker(); }, [registerServiceWorker]);

  useEffect(() => {
    if (isAuthenticated) { updateAlarmStatus(); loadTasks(); startAlarmChecker(); }
    else { stopAlarmChecker(true); localStorage.removeItem('token'); localStorage.removeItem('user'); }
    return () => stopAlarmChecker();
  }, [isAuthenticated, loadTasks, startAlarmChecker, stopAlarmChecker, updateAlarmStatus]);

  useEffect(() => { checkTaskAlarms(); }, [checkTaskAlarms]);

  // ── Auth ───────────────────────────────────────────────────────────
  const switchAuthTab = mode => { setAuthMode(mode); setAuthMessage(null); setAuthForm({ username: '', password: '', email: '' }); };

  const handleAuthSubmit = async event => {
    event.preventDefault();
    setAuthMessage(null);
    const usernameInput = authForm.username.trim();
    if (!usernameInput || !authForm.password) {
      setAuthMessage({ type: 'error', text: 'Por favor llena todos los campos' });
      return;
    }
    const url = authMode === 'login' ? '/login' : '/register';
    try {
      const body = { Username: usernameInput, Password: authForm.password };
      if (authMode === 'register' && authForm.email.trim()) body.Email = authForm.email.trim();
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) { setAuthMessage({ type: 'error', text: data.message || 'Credenciales o datos incorrectos' }); return; }
      if (authMode === 'login') {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setAuthMessage({ type: 'success', text: 'Sesión iniciada correctamente. Cargando...' });
        setTimeout(() => { setToken(data.token); setCurrentUser(data.user); setAuthForm({ username: '', password: '', email: '' }); setAuthMessage(null); }, 800);
      } else {
        setAuthMessage({ type: 'success', text: '¡Registro exitoso! Ya puedes iniciar sesión.' });
        setTimeout(() => { setAuthMode('login'); setAuthForm({ username: usernameInput, password: '', email: '' }); }, 1200);
      }
    } catch { setAuthMessage({ type: 'error', text: 'Error al conectar con el servidor' }); }
  };

  // ── Tareas ─────────────────────────────────────────────────────────
  const addTask = async () => {
    const name = newTask.name.trim();
    if (!name) return;
    const deadline = newTask.deadline ? new Date(newTask.deadline) : new Date();
    const alarmTime = buildAlarmDateTime(newTask.alarmDate, newTask.alarmTime);
    try {
      const response = await requestApi('/create-task', {
        method: 'POST',
        body: JSON.stringify({
          TaskId: Date.now(), Name: name, Description: newTask.description.trim(),
          Deadline: deadline, Priority: newTask.priority, AlarmTime: alarmTime
        })
      });
      if (response.ok) { setNewTask({ name: '', description: '', deadline: '', priority: 'medium', alarmDate: '', alarmTime: '' }); loadTasks(); }
    } catch (e) { console.error('Error agregando tarea:', e); }
  };

  const deleteTask = async taskId => {
    try { await requestApi('/delete-task', { method: 'DELETE', body: JSON.stringify({ TaskId: taskId }) }); loadTasks(); }
    catch (e) { console.error('Error eliminando tarea:', e); }
  };

  const startEdit = task => {
    if (task.Completed) return;
    setEditingTaskId(task.TaskId);
    setEditForm({
      name: task.Name, description: task.Description || '',
      deadline: formatDateForInput(task.Deadline), priority: task.Priority || 'medium',
      alarmDate: formatDateForInput(task.AlarmTime), alarmTime: formatTimeForInput(task.AlarmTime)
    });
  };

  const saveTask = async taskId => {
    const task = tasks.find(t => t.TaskId === taskId);
    const name = editForm.name.trim();
    if (!name) return;
    const deadline = editForm.deadline ? new Date(editForm.deadline) : new Date();
    const alarmTime = buildAlarmDateTime(editForm.alarmDate, editForm.alarmTime);
    try {
      const response = await requestApi('/update-task', {
        method: 'PUT',
        body: JSON.stringify({
          TaskId: taskId, Name: name, Description: editForm.description.trim(),
          Deadline: deadline, Priority: editForm.priority, AlarmTime: alarmTime,
          Completed: task ? task.Completed : false, Status: task?.Status
        })
      });
      if (response.ok) { setEditingTaskId(null); loadTasks(); }
    } catch (e) { console.error('Error actualizando tarea:', e); }
  };

  const completeTask = async taskId => {
    try {
      const response = await requestApi('/complete-task', { method: 'PUT', body: JSON.stringify({ TaskId: taskId }) });
      if (response.ok) {
        if (editingTaskId === taskId) setEditingTaskId(null);
        setTasks(cur => cur.map(t => t.TaskId === taskId ? { ...t, Completed: true, Status: 'done' } : t));
        await loadTasks();
      }
    } catch (e) { console.error('Error completando tarea:', e); }
  };

  // ── Kanban handlers ────────────────────────────────────────────────
  const handleKanbanMove = useCallback(async (taskId, status) => {
    setTasks(cur => cur.map(t => t.TaskId === taskId ? { ...t, Status: status, Completed: status === 'done' } : t));
    try {
      await requestApi('/move-task', { method: 'PUT', body: JSON.stringify({ TaskId: taskId, Status: status }) });
    } catch (e) { console.error('Error moviendo tarea:', e); loadTasks(); }
  }, [requestApi, loadTasks]);

  const handleKanbanUpdate = useCallback(async taskData => {
    setTasks(cur => cur.map(t => t.TaskId === taskData.TaskId ? { ...t, ...taskData } : t));
    try {
      await requestApi('/update-task', { method: 'PUT', body: JSON.stringify(taskData) });
    } catch (e) { console.error('Error actualizando tarea Kanban:', e); loadTasks(); }
  }, [requestApi, loadTasks]);

  const handleKanbanAdd = useCallback(async taskData => {
    const newTaskData = { ...taskData, TaskId: taskData.TaskId || Date.now() };
    try {
      const res = await requestApi('/create-task', { method: 'POST', body: JSON.stringify(newTaskData) });
      if (res.ok) loadTasks();
    } catch (e) { console.error('Error creando tarea Kanban:', e); }
  }, [requestApi, loadTasks]);

  // ── Alarmas ────────────────────────────────────────────────────────
  const enableAlarms = async () => {
    await registerServiceWorker();
    const ctx = getAlarmAudioContext();
    if (ctx?.state === 'suspended') await ctx.resume();
    let notificationsAllowed = false;
    if ('Notification' in window) {
      if (Notification.permission === 'granted') notificationsAllowed = true;
      else if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        notificationsAllowed = perm === 'granted';
      }
    }
    playAlarmSound(true);
    if (notificationsAllowed) await showSystemNotification({ TaskId: 'test' }, 'Alarmas activadas correctamente');
    updateAlarmStatus(); checkTaskAlarms();
  };

  const toggleTheme = () => { const n = theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', n); setTheme(n); };

  const acceptAlarmNotification = () => {
    setAlarmModalTask(null);
    window.focus();
    document.getElementById('taskList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (alarmModalTask && !alarmModalTask.Completed) setCompletePromptTask(alarmModalTask);
  };

  const confirmCompleteAlarmTask = async () => {
    if (!completePromptTask) return;
    await completeTask(completePromptTask.TaskId);
    setCompletePromptTask(null);
  };

  // ── Perfil / email ─────────────────────────────────────────────────
  const openProfileModal = () => {
    setProfileForm({ email: currentUser?.Email || '', emailReminders: currentUser?.EmailReminders ?? true });
    setProfileMsg(null);
    setProfileModal(true);
  };

  const saveProfile = async () => {
    setProfileMsg({ type: 'loading', text: 'Guardando...' });
    try {
      const res = await requestApi('/update-profile', {
        method: 'PUT',
        body: JSON.stringify({ Email: profileForm.email.trim(), EmailReminders: profileForm.emailReminders })
      });
      if (res.ok) {
        const data = await res.json();
        const updatedUser = { ...currentUser, ...data.user };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
        setProfileMsg({ type: 'success', text: '✓ Perfil actualizado correctamente' });
        setTimeout(() => setProfileModal(false), 1500);
      } else {
        let errText = 'Error al guardar. Intenta de nuevo.';
        try {
          const errData = await res.json();
          errText = errData.message || errText;
        } catch {}
        console.error('saveProfile error:', res.status, errText);
        setProfileMsg({ type: 'error', text: `Error ${res.status}: ${errText}` });
      }
    } catch (err) {
      console.error('saveProfile network error:', err);
      setProfileMsg({ type: 'error', text: 'No se pudo conectar con el servidor. ¿Está corriendo el backend?' });
    }
  };

  // ── Reporte PDF mejorado ───────────────────────────────────────────
  const downloadReport = async () => {
    let logoDataUrl = null;
    try {
      const resp = await fetch('/taskerly-logo.jpg');
      const blob = await resp.blob();
      logoDataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {}

    const now = new Date();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Encabezado
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 44, 'F');
    if (logoDataUrl) doc.addImage(logoDataUrl, 'JPEG', 8, 4, 34, 34);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Taskerly', logoDataUrl ? 46 : 14, 16);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Informe de Tareas', logoDataUrl ? 46 : 14, 24);
    doc.text(`Generado: ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, logoDataUrl ? 46 : 14, 32);
    doc.text(`Usuario: ${currentUser?.Username || ''}`, pageWidth - 14, 24, { align: 'right' });
    doc.text(`Fecha: ${now.toLocaleDateString()}`, pageWidth - 14, 32, { align: 'right' });

    // Estadísticas principales
    const stats = [
      { label: 'Total de tareas', value: dashboardStats.total, color: [37, 99, 235] },
      { label: 'Pendientes',       value: dashboardStats.pending, color: [15, 118, 110] },
      { label: 'Completadas',      value: dashboardStats.completed, color: [22, 163, 74] },
      { label: 'Alarmas vencidas', value: dashboardStats.dueAlarms, color: [217, 119, 6] }
    ];

    const boxW = (pageWidth - 28 - 9) / 4;
    let bx = 14;
    const statsY = 50;
    stats.forEach(stat => {
      doc.setFillColor(...stat.color);
      doc.roundedRect(bx, statsY, boxW, 22, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(String(stat.value), bx + boxW / 2, statsY + 9, { align: 'center' });
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(stat.label, bx + boxW / 2, statsY + 16, { align: 'center' });
      bx += boxW + 3;
    });

    // Estadísticas por prioridad
    const byPriority = {
      high: tasks.filter(t => t.Priority === 'high').length,
      medium: tasks.filter(t => t.Priority === 'medium').length,
      low: tasks.filter(t => t.Priority === 'low').length
    };
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
    doc.text('Distribución por prioridad:', 14, 81);
    const prioData = [
      ['Alta', byPriority.high, '#dc2626'],
      ['Media', byPriority.medium, '#d97706'],
      ['Baja', byPriority.low, '#16a34a']
    ];
    let px = 14;
    prioData.forEach(([label, count]) => {
      const pw = (pageWidth - 28 - 6) / 3;
      doc.setFillColor(241, 245, 249); doc.roundedRect(px, 84, pw, 14, 2, 2, 'F');
      doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(String(count), px + pw / 2, 91.5, { align: 'center' });
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(label, px + pw / 2, 96, { align: 'center' });
      px += pw + 3;
    });

    // Tabla de tareas
    const tableRows = tasks.map(task => {
      const isAlarmDue = task.AlarmTime && !task.Completed && new Date(task.AlarmTime) <= now;
      const estado = task.Completed ? 'Completada' : isAlarmDue ? 'Alarma vencida' : 'Pendiente';
      const kanbanStatus = STATUS_LABELS[task.Status] || (task.Completed ? 'Completado' : 'Por hacer');
      return [
        task.Name,
        task.Description ? (task.Description.length > 40 ? task.Description.slice(0, 40) + '…' : task.Description) : '—',
        PRIORITY_LABELS[task.Priority] || 'Media',
        kanbanStatus,
        task.Deadline ? new Date(task.Deadline).toLocaleDateString() : '—',
        estado
      ];
    });

    autoTable(doc, {
      startY: 103,
      head: [['Tarea', 'Descripción', 'Prioridad', 'Estado Kanban', 'Fecha límite', 'Estado']],
      body: tableRows,
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 42 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 24, halign: 'center' }
      },
      didParseCell: data => {
        if (data.section === 'body') {
          if (data.column.index === 2) {
            const v = data.cell.raw;
            data.cell.styles.textColor = v === 'Alta' ? [220, 38, 38] : v === 'Media' ? [217, 119, 6] : [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.column.index === 5) {
            const v = data.cell.raw;
            if (v === 'Completada') data.cell.styles.textColor = [22, 163, 74];
            else if (v === 'Alarma vencida') data.cell.styles.textColor = [217, 119, 6];
            else data.cell.styles.textColor = [15, 118, 110];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 14, right: 14 }
    });

    // Pie de página
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Taskerly · Página ${i} de ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    }

    const fileName = `taskerly_informe_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.pdf`;
    doc.save(fileName);
  };

  // ── Stats ──────────────────────────────────────────────────────────
  const usernameInitial = useMemo(() => {
    if (!currentUser?.Username) return 'U';
    return currentUser.Username.charAt(0).toUpperCase();
  }, [currentUser]);

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const total = tasks.length;
    const completed = tasks.filter(t => t.Completed).length;
    const pending = total - completed;
    const dueAlarms = tasks.filter(t => t.AlarmTime && !t.Completed && new Date(t.AlarmTime) <= now).length;
    const inProgress = tasks.filter(t => t.Status === 'in_progress').length;
    const highPriority = tasks.filter(t => t.Priority === 'high' && !t.Completed).length;
    return { total, pending, completed, dueAlarms, inProgress, highPriority };
  }, [tasks]);

  // ── Auth UI ────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="auth-wrapper">
        <div className="auth-container" id="authApp">
          <div className="auth-card">
            <div className="auth-header">
              <img src="/taskerly-logo.jpg" alt="Taskerly logo" className="auth-logo" />
              <h1 className="auth-brand-title">Bienvenido a Taskerly</h1>
              <h2>{authTitle}</h2>
              <p>{authSubtitle}</p>
            </div>

            <div className="auth-error" style={{ display: authMessage?.type === 'error' ? 'block' : 'none' }}>
              {authMessage?.text}
            </div>
            <div className="auth-success" style={{ display: authMessage?.type === 'success' ? 'block' : 'none' }}>
              {authMessage?.text}
            </div>

            <div className="auth-tabs">
              <button className={`auth-tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => switchAuthTab('login')}>Ingresar</button>
              <button className={`auth-tab ${authMode === 'register' ? 'active' : ''}`} onClick={() => switchAuthTab('register')}>Registrarse</button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              <div className="auth-form-group">
                <label htmlFor="usernameInput">Usuario</label>
                <input type="text" id="usernameInput" className="auth-input" placeholder="Tu nombre de usuario" required autoComplete="username"
                  value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} />
              </div>
              <div className="auth-form-group">
                <label htmlFor="passwordInput">Contraseña</label>
                <input type="password" id="passwordInput" className="auth-input" placeholder="••••••••" required
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
              </div>
              {authMode === 'register' && (
                <div className="auth-form-group">
                  <label htmlFor="emailInput">Correo electrónico <span style={{ color: '#94a3b8', fontWeight: 400 }}>(opcional, para recordatorios)</span></label>
                  <input type="email" id="emailInput" className="auth-input" placeholder="tu@correo.com"
                    value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} />
                </div>
              )}
              <button type="submit" className="btn-auth-submit">{authSubmitText}</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── App UI ─────────────────────────────────────────────────────────
  return (
    <div id="todoApp">
      <div className="dashboard-shell">
        {/* Header */}
        <div className="todo-header">
          <div className="user-profile">
            <div className="avatar">{usernameInitial}</div>
            <div className="user-info">
              <span className="username-display">{currentUser.Username}</span>
              <span className="user-role">Organizador de Tareas</span>
            </div>
          </div>

          <button className={`hamburger-menu ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Alternar menú">
            <span /><span /><span />
          </button>

          <div className={`header-actions ${isMobileMenuOpen ? 'show' : ''}`}>
            <button className="btn-theme-toggle" onClick={() => { toggleTheme(); setIsMobileMenuOpen(false); }}>
              {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            </button>
            <button className="btn-enable-alarms" disabled={alarmButtonDisabled} onClick={() => { enableAlarms(); setIsMobileMenuOpen(false); }}>
              {alarmButtonText}
            </button>
            <button className="btn-profile" onClick={() => { openProfileModal(); setIsMobileMenuOpen(false); }} title="Configurar perfil y email">
              ✉ Mi perfil
            </button>
            <button className="btn-download-report" onClick={() => { downloadReport(); setIsMobileMenuOpen(false); }} title="Descargar informe PDF">
              📄 Descargar informe
            </button>
            <button className="btn-logout" onClick={logout}>Cerrar sesión</button>
          </div>
        </div>

        {/* Hero */}
        <section className="dashboard-hero">
          <div>
            <span className="dashboard-kicker">Panel de productividad</span>
            <h1>Taskerly</h1>
            <p>Gestiona tus pendientes, fechas límite y alarmas desde un solo lugar.</p>
          </div>
          <div className={alarmStatusClass}>{alarmStatus}</div>
        </section>

        {/* Stats */}
        <section className="stats-grid" aria-label="Resumen de tareas">
          <div className="stat-card">
            <span>Total</span>
            <strong>{dashboardStats.total}</strong>
          </div>
          <div className="stat-card">
            <span>Pendientes</span>
            <strong>{dashboardStats.pending}</strong>
          </div>
          <div className="stat-card">
            <span>En progreso</span>
            <strong>{dashboardStats.inProgress}</strong>
          </div>
          <div className="stat-card">
            <span>Completadas</span>
            <strong>{dashboardStats.completed}</strong>
          </div>
          <div className="stat-card warning">
            <span>Prioridad alta</span>
            <strong>{dashboardStats.highPriority}</strong>
          </div>
          <div className="stat-card warning">
            <span>Alarmas vencidas</span>
            <strong>{dashboardStats.dueAlarms}</strong>
          </div>
        </section>

        {/* View switcher */}
        <div className="view-switcher">
          <button className={`view-tab ${activeView === 'list' ? 'active' : ''}`} onClick={() => setActiveView('list')}>
            ☰ Lista
          </button>
          <button className={`view-tab ${activeView === 'kanban' ? 'active' : ''}`} onClick={() => setActiveView('kanban')}>
            ⊞ Kanban
          </button>
        </div>

        {/* Modales de alarma */}
        <div className={`alarm-modal ${alarmModalTask ? 'show' : ''}`} aria-hidden={!alarmModalTask}>
          <div className="alarm-modal-content">
            <div className="alarm-modal-icon">🔔</div>
            <h2>Alarma de tarea</h2>
            <p>{alarmMessage || 'Tienes una tarea pendiente.'}</p>
            <button onClick={acceptAlarmNotification}>Aceptar</button>
          </div>
        </div>

        <div className={`complete-modal ${completePromptTask ? 'show' : ''}`} aria-hidden={!completePromptTask}>
          <div className="complete-modal-content">
            <h2>¿Completar tarea?</h2>
            <p>{completePromptTask ? `¿Quieres marcar "${completePromptTask.Name}" como completada?` : ''}</p>
            <div className="complete-modal-actions">
              <button className="btn-complete-confirm" onClick={confirmCompleteAlarmTask}>Sí, completar</button>
              <button className="btn-complete-dismiss" onClick={() => setCompletePromptTask(null)}>No, volver</button>
            </div>
          </div>
        </div>

        {/* Modal de perfil */}
        {profileModal && (
          <div className="kb-overlay" onClick={e => e.target === e.currentTarget && setProfileModal(false)}>
            <div className="kb-modal" role="dialog" aria-modal="true">
              <div className="kb-modal__header">
                <h3>✉ Mi perfil — Recordatorios</h3>
                <button className="kb-modal__close" onClick={() => setProfileModal(false)}>✕</button>
              </div>

              {/* Mensaje de estado FUERA del body scrollable */}
              {profileMsg && (
                <div style={{
                  margin: '0 1.25rem',
                  padding: '10px 14px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  background: profileMsg.type === 'success' ? '#ecfdf5' : profileMsg.type === 'loading' ? '#eff6ff' : '#fef2f2',
                  color: profileMsg.type === 'success' ? '#15803d' : profileMsg.type === 'loading' ? '#1d4ed8' : '#b91c1c',
                  border: `1px solid ${profileMsg.type === 'success' ? '#bbf7d0' : profileMsg.type === 'loading' ? '#bfdbfe' : '#fecaca'}`
                }}>
                  {profileMsg.text}
                </div>
              )}

              <div className="kb-modal__body">
                <label className="kb-label">
                  <span>Correo electrónico <small>(para recordatorios)</small></span>
                  <input
                    className="kb-input"
                    type="email"
                    placeholder="tu@correo.com"
                    value={profileForm.email}
                    onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveProfile(); }}
                  />
                </label>
                <label className="kb-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={profileForm.emailReminders}
                    onChange={e => setProfileForm(f => ({ ...f, emailReminders: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>Recibir recordatorios por correo antes del vencimiento</span>
                </label>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
                  Se enviarán recordatorios automáticos 24h y 1h antes de que venzan tus tareas pendientes.
                </p>
              </div>

              <div className="kb-modal__footer">
                <button className="kb-btn kb-btn--ghost" onClick={() => setProfileModal(false)}>Cancelar</button>
                <button
                  className="kb-btn kb-btn--primary"
                  onClick={saveProfile}
                  disabled={profileMsg?.type === 'loading'}
                  style={{ opacity: profileMsg?.type === 'loading' ? 0.7 : 1 }}
                >
                  {profileMsg?.type === 'loading' ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vista Lista */}
        {activeView === 'list' && (
          <main className="dashboard-grid">
            <section className="task-panel task-create-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Nueva tarea</span>
                  <h2>Crear pendiente</h2>
                </div>
              </div>

              <div className="task-form">
                <label>
                  <span>Tarea</span>
                  <input type="text" placeholder="Escribe una nueva tarea..." value={newTask.name}
                    onChange={e => setNewTask({ ...newTask, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') addTask(); }} />
                </label>
                <label>
                  <span>Descripción</span>
                  <textarea className="task-textarea" placeholder="Detalles opcionales..." rows={2}
                    value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} />
                </label>
                <label>
                  <span>Prioridad</span>
                  <select className="task-select" value={newTask.priority}
                    onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
                <label>
                  <span>Fecha límite</span>
                  <input type="date" value={newTask.deadline} onChange={e => setNewTask({ ...newTask, deadline: e.target.value })} />
                </label>
                <label>
                  <span>Fecha de alarma</span>
                  <input type="date" value={newTask.alarmDate} onChange={e => setNewTask({ ...newTask, alarmDate: e.target.value })} />
                </label>
                <label>
                  <span>Hora de alarma</span>
                  <input type="time" value={newTask.alarmTime} onChange={e => setNewTask({ ...newTask, alarmTime: e.target.value })} />
                </label>
                <button onClick={addTask}>Agregar tarea</button>
              </div>
            </section>

            <section className="task-panel task-list-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Gestión</span>
                  <h2>Tareas recientes</h2>
                </div>
                <span className="panel-count">{dashboardStats.pending} pendientes</span>
              </div>

              <ul className="task-list" id="taskList">
                {tasks.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <p>No hay tareas. ¡Agrega una nueva!</p>
                  </div>
                )}

                {tasks.map(task => {
                  const isEditing = editingTaskId === task.TaskId;
                  const isAlarmDue = task.AlarmTime && !task.Completed && new Date(task.AlarmTime) <= new Date();
                  const itemClass = ['task-item', task.Completed ? 'completed' : '', isAlarmDue ? 'alarm-due' : '', isEditing ? 'editing' : ''].filter(Boolean).join(' ');
                  const priorityColor = task.Priority === 'high' ? '#dc2626' : task.Priority === 'low' ? '#16a34a' : '#d97706';

                  if (isEditing) {
                    return (
                      <li className={itemClass} key={task.TaskId}>
                        <div className="task-content">
                          <input type="text" className="task-edit-input" value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                          <textarea className="task-edit-textarea" rows={2} placeholder="Descripción..."
                            value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                          <select className="task-edit-select" value={editForm.priority}
                            onChange={e => setEditForm({ ...editForm, priority: e.target.value })}>
                            <option value="low">Baja</option>
                            <option value="medium">Media</option>
                            <option value="high">Alta</option>
                          </select>
                          <input type="date" className="task-edit-date" value={editForm.deadline}
                            onChange={e => setEditForm({ ...editForm, deadline: e.target.value })} />
                          <input type="date" className="task-edit-alarm-date" value={editForm.alarmDate}
                            onChange={e => setEditForm({ ...editForm, alarmDate: e.target.value })} />
                          <input type="time" className="task-edit-alarm-time" value={editForm.alarmTime}
                            onChange={e => setEditForm({ ...editForm, alarmTime: e.target.value })} />
                        </div>
                        <div className="task-actions">
                          <button className="btn-save" onClick={() => saveTask(task.TaskId)}>Guardar</button>
                          <button className="btn-cancel" onClick={() => setEditingTaskId(null)}>Cancelar</button>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li className={itemClass} key={task.TaskId}>
                      <div className="task-content">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span className="task-priority-dot" style={{ background: priorityColor }} title={`Prioridad ${PRIORITY_LABELS[task.Priority]}`} />
                          <div className="task-title">{task.Name}</div>
                        </div>
                        {task.Description && <div className="task-description">{task.Description}</div>}
                        {task.Deadline && <div className="task-description">📅 {new Date(task.Deadline).toLocaleDateString()}</div>}
                        {task.AlarmTime && <div className="task-alarm">🔔 Alarma: {formatAlarmDisplay(task.AlarmTime)}</div>}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <span className="task-badge" style={{ background: priorityColor + '20', color: priorityColor, border: `1px solid ${priorityColor}40` }}>
                            {PRIORITY_LABELS[task.Priority] || 'Media'}
                          </span>
                          {task.Status && <span className="task-badge task-badge--status">{STATUS_LABELS[task.Status] || task.Status}</span>}
                          {task.Completed && <span className="task-badge task-badge--done">✓ Completada</span>}
                        </div>
                      </div>
                      <div className="task-actions">
                        {!task.Completed && <button className="btn-complete" onClick={() => completeTask(task.TaskId)}>Completar</button>}
                        {!task.Completed && <button className="btn-edit" onClick={() => startEdit(task)}>Editar</button>}
                        <button className="btn-delete" onClick={() => deleteTask(task.TaskId)}>Eliminar</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </main>
        )}

        {/* Vista Kanban */}
        {activeView === 'kanban' && (
          <KanbanBoard
            tasks={tasks}
            onMoveTask={handleKanbanMove}
            onUpdateTask={handleKanbanUpdate}
            onDeleteTask={deleteTask}
            onAddTask={handleKanbanAdd}
          />
        )}
      </div>
    </div>
  );
}

export default App;
