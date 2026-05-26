import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function formatDateForInput(dateValue) {
  if (!dateValue) return '';

  const date = new Date(dateValue);
  const pad = value => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-');
}

function formatTimeForInput(dateValue) {
  if (!dateValue) return '';

  const date = new Date(dateValue);
  const pad = value => String(value).padStart(2, '0');

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildAlarmDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;

  return new Date(`${dateValue}T${timeValue}`);
}

function formatAlarmDisplay(dateValue) {
  const date = new Date(dateValue);

  return `${date.toLocaleDateString()} - ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [authMode, setAuthMode] = useState('login');
  const [authMessage, setAuthMessage] = useState(null);
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [newTask, setNewTask] = useState({ name: '', deadline: '', alarmDate: '', alarmTime: '' });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', deadline: '', alarmDate: '', alarmTime: '' });
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return savedTheme || (systemPrefersDark ? 'dark' : 'light');
  });
  const [alarmStatus, setAlarmStatus] = useState('Haz clic en Activar alarmas para permitir notificaciones y sonido');
  const [alarmStatusClass, setAlarmStatusClass] = useState('alarm-status');
  const [alarmButtonText, setAlarmButtonText] = useState('Activar alarmas');
  const [alarmButtonDisabled, setAlarmButtonDisabled] = useState(false);
  const [alarmModalTask, setAlarmModalTask] = useState(null);
  const [completePromptTask, setCompletePromptTask] = useState(null);

  const alarmIntervalRef = useRef(null);
  const alarmAudioContextRef = useRef(null);
  const serviceWorkerRegistrationRef = useRef(null);
  const notifiedAlarmTaskIdsRef = useRef(new Set());
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

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setCurrentUser(null);
      return response;
    }

    return response;
  }, [token]);

  const updateAlarmStatus = useCallback(() => {
    const hasAudio = Boolean(alarmAudioContextRef.current);
    const notificationsGranted = 'Notification' in window && Notification.permission === 'granted';
    const notificationsDenied = 'Notification' in window && Notification.permission === 'denied';

    if (notificationsGranted && hasAudio) {
      setAlarmStatus('Alarmas activas con notificación y sonido');
      setAlarmStatusClass('alarm-status active');
      setAlarmButtonText('Alarmas activas');
      setAlarmButtonDisabled(true);
      return;
    }

    if (notificationsDenied && hasAudio) {
      setAlarmStatus('Sonido activo. Las notificaciones están bloqueadas en el navegador');
      setAlarmStatusClass('alarm-status warning');
      setAlarmButtonText('Sonido activo');
      setAlarmButtonDisabled(true);
      return;
    }

    if (notificationsDenied) {
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
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      alarmAudioContextRef.current = new AudioContextClass();
    }

    if (alarmAudioContextRef.current.state === 'suspended') {
      alarmAudioContextRef.current.resume();
    }

    return alarmAudioContextRef.current;
  }, []);

  const playAlarmSound = useCallback((isTest = false) => {
    const audioContext = getAlarmAudioContext();
    if (!audioContext) return;

    const now = audioContext.currentTime;
    const notes = [
      { start: 0, frequency: 880 },
      { start: 0.22, frequency: 660 },
      { start: 0.44, frequency: 880 }
    ];

    notes.forEach(note => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(isTest ? 0.12 : 0.25, now + note.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + 0.18);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + 0.2);
    });
  }, [getAlarmAudioContext]);

  const showSystemNotification = useCallback(async (task, message) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options = {
      body: message,
      tag: `task-${task.TaskId}`,
      requireInteraction: true,
      renotify: true,
      silent: false,
      data: {
        taskId: task.TaskId
      }
    };

    try {
      const registration = serviceWorkerRegistrationRef.current || await navigator.serviceWorker.ready;

      if (registration && registration.showNotification) {
        await registration.showNotification('Todo Tasks', options);
        return;
      }
    } catch (error) {
      console.error('No se pudo mostrar la notificación con service worker:', error);
    }

    const notification = new Notification('Todo Tasks', options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, []);

  const loadTasks = useCallback(async () => {
    if (!token) return;

    try {
      const response = await requestApi('/all-tasks');
      if (!response.ok) return;

      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error('Error cargando tareas:', error);
    }
  }, [requestApi, token]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const checkTaskAlarms = useCallback(() => {
    const now = new Date();

    tasksRef.current.forEach(task => {
      if (task.Completed || !task.AlarmTime || notifiedAlarmTaskIdsRef.current.has(task.TaskId)) return;

      const alarmDate = new Date(task.AlarmTime);
      if (alarmDate <= now) {
        notifiedAlarmTaskIdsRef.current.add(task.TaskId);
        const message = `Alarma de tarea: ${task.Name}`;
        setAlarmModalTask(task);
        playAlarmSound();
        showSystemNotification(task, message);
      }
    });
  }, [playAlarmSound, showSystemNotification]);

  const stopAlarmChecker = useCallback((clearNotified = false) => {
    if (clearNotified) {
      notifiedAlarmTaskIdsRef.current.clear();
    }

    if (!alarmIntervalRef.current) return;

    clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = null;
  }, []);

  const startAlarmChecker = useCallback(() => {
    if (alarmIntervalRef.current) return;

    alarmIntervalRef.current = setInterval(checkTaskAlarms, 5000);
  }, [checkTaskAlarms]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
    stopAlarmChecker(true);
  }, [stopAlarmChecker]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = event => {
      if (!localStorage.getItem('theme')) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, [registerServiceWorker]);

  useEffect(() => {
    if (isAuthenticated) {
      updateAlarmStatus();
      loadTasks();
      startAlarmChecker();
    } else {
      stopAlarmChecker(true);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }

    return () => stopAlarmChecker();
  }, [isAuthenticated, loadTasks, startAlarmChecker, stopAlarmChecker, updateAlarmStatus]);

  useEffect(() => {
    checkTaskAlarms();
  }, [checkTaskAlarms]);

  const switchAuthTab = mode => {
    setAuthMode(mode);
    setAuthMessage(null);
    setAuthForm({ username: '', password: '' });
  };

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
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          Username: usernameInput,
          Password: authForm.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setAuthMessage({ type: 'error', text: data.message || 'Credenciales o datos incorrectos' });
        return;
      }

      if (authMode === 'login') {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setAuthMessage({ type: 'success', text: 'Sesión iniciada correctamente. Cargando...' });

        setTimeout(() => {
          setToken(data.token);
          setCurrentUser(data.user);
          setAuthForm({ username: '', password: '' });
          setAuthMessage(null);
        }, 800);
      } else {
        setAuthMessage({ type: 'success', text: '¡Registro exitoso! Ya puedes iniciar sesión.' });

        setTimeout(() => {
          setAuthMode('login');
          setAuthForm({ username: usernameInput, password: '' });
        }, 1200);
      }
    } catch (error) {
      console.error('Error de autenticación:', error);
      setAuthMessage({ type: 'error', text: 'Error al conectar con el servidor' });
    }
  };

  const addTask = async () => {
    const name = newTask.name.trim();
    const deadline = newTask.deadline ? new Date(newTask.deadline) : new Date();
    const alarmTime = buildAlarmDateTime(newTask.alarmDate, newTask.alarmTime);

    if (!name) return;

    try {
      const response = await requestApi('/create-task', {
        method: 'POST',
        body: JSON.stringify({
          TaskId: Date.now(),
          Name: name,
          Deadline: deadline,
          AlarmTime: alarmTime
        })
      });

      if (response.ok) {
        setNewTask({ name: '', deadline: '', alarmDate: '', alarmTime: '' });
        loadTasks();
      }
    } catch (error) {
      console.error('Error agregando tarea:', error);
    }
  };

  const deleteTask = async taskId => {
    try {
      await requestApi('/delete-task', {
        method: 'DELETE',
        body: JSON.stringify({ TaskId: taskId })
      });
      loadTasks();
    } catch (error) {
      console.error('Error eliminando tarea:', error);
    }
  };

  const startEdit = task => {
    if (task.Completed) return;

    setEditingTaskId(task.TaskId);
    setEditForm({
      name: task.Name,
      deadline: formatDateForInput(task.Deadline),
      alarmDate: formatDateForInput(task.AlarmTime),
      alarmTime: formatTimeForInput(task.AlarmTime)
    });
  };

  const saveTask = async taskId => {
    const task = tasks.find(item => item.TaskId === taskId);
    const name = editForm.name.trim();
    const deadline = editForm.deadline ? new Date(editForm.deadline) : new Date();
    const alarmTime = buildAlarmDateTime(editForm.alarmDate, editForm.alarmTime);

    if (!name) return;

    try {
      const response = await requestApi('/update-task', {
        method: 'PUT',
        body: JSON.stringify({
          TaskId: taskId,
          Name: name,
          Deadline: deadline,
          AlarmTime: alarmTime,
          Completed: task ? task.Completed : false
        })
      });

      if (response.ok) {
        setEditingTaskId(null);
        loadTasks();
      }
    } catch (error) {
      console.error('Error actualizando tarea:', error);
    }
  };

  const completeTask = async taskId => {
    try {
      const response = await requestApi('/complete-task', {
        method: 'PUT',
        body: JSON.stringify({ TaskId: taskId })
      });

      if (response.ok) {
        if (editingTaskId === taskId) {
          setEditingTaskId(null);
        }
        setTasks(currentTasks => currentTasks.map(task => (
          task.TaskId === taskId ? { ...task, Completed: true } : task
        )));
        await loadTasks();
      }
    } catch (error) {
      console.error('Error completando tarea:', error);
    }
  };

  const enableAlarms = async () => {
    await registerServiceWorker();

    const audioContext = getAlarmAudioContext();
    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    let notificationsAllowed = false;
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        notificationsAllowed = true;
      } else if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        notificationsAllowed = permission === 'granted';
      }
    }

    playAlarmSound(true);
    if (notificationsAllowed) {
      await showSystemNotification(
        { TaskId: 'test' },
        'Alarmas activadas correctamente'
      );
    }
    updateAlarmStatus();
    checkTaskAlarms();
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
  };

  const downloadReport = async () => {
    // Cargar el logo como base64 para incrustarlo en el PDF
    let logoDataUrl = null;
    try {
      const resp = await fetch('/taskerly-logo.jpg');
      const blob = await resp.blob();
      logoDataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (_) { /* si falla, se omite el logo */ }

    const now = new Date();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- Encabezado ---
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 44, 'F');
    // Logo en el PDF
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'JPEG', 8, 4, 34, 34);
    }
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

    // --- Resumen estadístico ---
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
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(String(stat.value), bx + boxW / 2, statsY + 9, { align: 'center' });
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(stat.label, bx + boxW / 2, statsY + 16, { align: 'center' });
      bx += boxW + 3;
    });

    // --- Tabla de tareas ---
    const tableRows = tasks.map(task => {
      const isAlarmDue = task.AlarmTime && !task.Completed && new Date(task.AlarmTime) <= now;
      const estado = task.Completed ? 'Completada' : isAlarmDue ? 'Alarma vencida' : 'Pendiente';
      return [
        task.Name,
        task.Deadline ? new Date(task.Deadline).toLocaleDateString() : '—',
        task.AlarmTime ? new Date(task.AlarmTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—',
        estado
      ];
    });

    autoTable(doc, {
      startY: 78,
      head: [['Tarea', 'Fecha límite', 'Alarma', 'Estado']],
      body: tableRows,
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: { fontSize: 9, cellPadding: 3 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 36, halign: 'center' },
        3: { cellWidth: 28, halign: 'center' }
      },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw;
          if (val === 'Completada')     data.cell.styles.textColor = [22, 163, 74];
          else if (val === 'Alarma vencida') data.cell.styles.textColor = [217, 119, 6];
          else                          data.cell.styles.textColor = [15, 118, 110];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 14, right: 14 }
    });

    // --- Pie de página ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Taskerly · Página ${i} de ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    }

    const fileName = `taskerly_informe_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.pdf`;
    doc.save(fileName);
  };

  const acceptAlarmNotification = () => {
    setAlarmModalTask(null);
    window.focus();
    document.getElementById('taskList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (alarmModalTask && !alarmModalTask.Completed) {
      setCompletePromptTask(alarmModalTask);
    }
  };

  const confirmCompleteAlarmTask = async () => {
    if (!completePromptTask) return;

    await completeTask(completePromptTask.TaskId);
    setCompletePromptTask(null);
  };

  const usernameInitial = useMemo(() => {
    if (!currentUser?.Username) return 'U';
    return currentUser.Username.charAt(0).toUpperCase();
  }, [currentUser]);

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const total = tasks.length;
    const completed = tasks.filter(task => task.Completed).length;
    const pending = total - completed;
    const dueAlarms = tasks.filter(task => (
      task.AlarmTime && !task.Completed && new Date(task.AlarmTime) <= now
    )).length;

    return { total, pending, completed, dueAlarms };
  }, [tasks]);

  if (!isAuthenticated) {
    return (
      <div className="auth-wrapper">
        <div className="auth-container" id="authApp">
          <div className="auth-card">
          <div className="auth-header">
            <img
              src="/taskerly-logo.jpg"
              alt="Taskerly logo"
              className="auth-logo"
            />
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
            <button className={`auth-tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => switchAuthTab('login')}>
              Ingresar
            </button>
            <button className={`auth-tab ${authMode === 'register' ? 'active' : ''}`} onClick={() => switchAuthTab('register')}>
              Registrarse
            </button>
          </div>

          <form onSubmit={handleAuthSubmit}>
            <div className="auth-form-group">
              <label htmlFor="usernameInput">Usuario</label>
              <input
                type="text"
                id="usernameInput"
                className="auth-input"
                placeholder="Tu nombre de usuario"
                required
                autoComplete="username"
                value={authForm.username}
                onChange={event => setAuthForm({ ...authForm, username: event.target.value })}
              />
            </div>

            <div className="auth-form-group">
              <label htmlFor="passwordInput">Contraseña</label>
              <input
                type="password"
                id="passwordInput"
                className="auth-input"
                placeholder="••••••••"
                required
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={authForm.password}
                onChange={event => setAuthForm({ ...authForm, password: event.target.value })}
              />
            </div>

            <button type="submit" className="btn-auth-submit">{authSubmitText}</button>
          </form>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div id="todoApp">
      <div className="dashboard-shell">
        <div className="todo-header">
          <div className="user-profile">
            <div className="avatar">{usernameInitial}</div>
            <div className="user-info">
              <span className="username-display">{currentUser.Username}</span>
              <span className="user-role">Organizador de Tareas</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn-theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            </button>
            <button className="btn-enable-alarms" disabled={alarmButtonDisabled} onClick={enableAlarms}>
              {alarmButtonText}
            </button>
            <button className="btn-download-report" id="btnDownloadReport" onClick={downloadReport} title="Descargar informe PDF">
              📄 Descargar informe
            </button>
            <button className="btn-logout" onClick={logout}>Cerrar sesión</button>
          </div>
        </div>

        <section className="dashboard-hero">
          <div>
            <span className="dashboard-kicker">Panel de productividad</span>
            <h1>Taskerly</h1>
            <p>Gestiona tus pendientes, fechas límite y alarmas desde un solo lugar.</p>
          </div>
          <div className={alarmStatusClass}>{alarmStatus}</div>
        </section>

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
            <span>Completadas</span>
            <strong>{dashboardStats.completed}</strong>
          </div>
          <div className="stat-card warning">
            <span>Alarmas vencidas</span>
            <strong>{dashboardStats.dueAlarms}</strong>
          </div>
        </section>

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
            <p>{completePromptTask ? `¿Quieres marcar "${completePromptTask.Name}" como completada?` : '¿Quieres marcar esta tarea como completada?'}</p>
            <div className="complete-modal-actions">
              <button className="btn-complete-confirm" onClick={confirmCompleteAlarmTask}>Sí, completar</button>
              <button className="btn-complete-dismiss" onClick={() => setCompletePromptTask(null)}>No, volver</button>
            </div>
          </div>
        </div>

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
                <input
                  type="text"
                  placeholder="Escribe una nueva tarea..."
                  value={newTask.name}
                  onChange={event => setNewTask({ ...newTask, name: event.target.value })}
                  onKeyDown={event => {
                    if (event.key === 'Enter') addTask();
                  }}
                />
              </label>
              <label>
                <span>Fecha límite</span>
                <input
                  type="date"
                  value={newTask.deadline}
                  onChange={event => setNewTask({ ...newTask, deadline: event.target.value })}
                />
              </label>
              <label>
                <span>Fecha de alarma</span>
                <input
                  type="date"
                  title="Fecha de alarma"
                  value={newTask.alarmDate}
                  onChange={event => setNewTask({ ...newTask, alarmDate: event.target.value })}
                />
              </label>
              <label>
                <span>Hora de alarma</span>
                <input
                  type="time"
                  title="Hora de alarma"
                  value={newTask.alarmTime}
                  onChange={event => setNewTask({ ...newTask, alarmTime: event.target.value })}
                />
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
            const itemClass = [
              'task-item',
              task.Completed ? 'completed' : '',
              isAlarmDue ? 'alarm-due' : '',
              isEditing ? 'editing' : ''
            ].filter(Boolean).join(' ');

            if (isEditing) {
              return (
                <li className={itemClass} key={task.TaskId}>
                  <div className="task-content">
                    <input
                      type="text"
                      className="task-edit-input"
                      value={editForm.name}
                      onChange={event => setEditForm({ ...editForm, name: event.target.value })}
                    />
                    <input
                      type="date"
                      className="task-edit-date"
                      value={editForm.deadline}
                      onChange={event => setEditForm({ ...editForm, deadline: event.target.value })}
                    />
                    <input
                      type="date"
                      className="task-edit-alarm-date"
                      value={editForm.alarmDate}
                      onChange={event => setEditForm({ ...editForm, alarmDate: event.target.value })}
                    />
                    <input
                      type="time"
                      className="task-edit-alarm-time"
                      value={editForm.alarmTime}
                      onChange={event => setEditForm({ ...editForm, alarmTime: event.target.value })}
                    />
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
                  <div className="task-title">{task.Name}</div>
                  {task.Deadline && <div className="task-description">{new Date(task.Deadline).toLocaleDateString()}</div>}
                  {task.AlarmTime && <div className="task-alarm">Alarma: {formatAlarmDisplay(task.AlarmTime)}</div>}
                  {task.Completed && <div className="task-status">Completada</div>}
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
      </div>
    </div>
  );
}

export default App;
