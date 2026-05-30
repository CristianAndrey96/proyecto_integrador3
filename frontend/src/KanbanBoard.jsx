import { useState, useCallback, useRef } from 'react';

// ─── Configuración de columnas ───────────────────────────────────
const COLUMNS = [
    {
        id: 'todo',
        label: 'Por hacer',
        accent: 'var(--kb-col-todo)',
        icon: '○',
    },
    {
        id: 'in_progress',
        label: 'En progreso',
        accent: 'var(--kb-col-progress)',
        icon: '◑',
    },
    {
        id: 'done',
        label: 'Completado',
        accent: 'var(--kb-col-done)',
        icon: '●',
    },
];

const PRIORITY_META = {
    high:   { label: 'Alta',   color: 'var(--kb-priority-high)' },
    medium: { label: 'Media',  color: 'var(--kb-priority-medium)' },
    low:    { label: 'Baja',   color: 'var(--kb-priority-low)' },
};

// ─── Tarjeta de tarea ─────────────────────────────────────────────
function TaskCard({
    task,
    isDragging,
    onDragStart,
    onEdit,
    onDelete,
    onMoveLeft,
    onMoveRight,
    columnIndex,
    totalColumns,
}) {
    const isAlarmDue =
        task.AlarmTime && !task.Completed && new Date(task.AlarmTime) <= new Date();

    const deadlineStr = task.Deadline
        ? new Date(task.Deadline).toLocaleDateString('es', {
              day: '2-digit',
              month: 'short',
          })
        : null;

    const priority = PRIORITY_META[task.Priority] || PRIORITY_META.medium;

    return (
        <div
            className={[
                'kb-card',
                isDragging ? 'kb-card--dragging' : '',
                isAlarmDue ? 'kb-card--alarm' : '',
                task.Completed ? 'kb-card--done' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            draggable
            onDragStart={e => onDragStart(e, task)}
            aria-label={`Tarea: ${task.Name}`}
        >
            {/* Barra de prioridad */}
            <span
                className="kb-card__priority-bar"
                style={{ background: priority.color }}
                title={`Prioridad: ${priority.label}`}
            />

            <div className="kb-card__body">
                <p className="kb-card__title">{task.Name}</p>

                {task.Description && (
                    <p className="kb-card__desc">{task.Description}</p>
                )}

                <div className="kb-card__meta">
                    {deadlineStr && (
                        <span className={`kb-chip kb-chip--date${isAlarmDue ? ' kb-chip--overdue' : ''}`}>
                            📅 {deadlineStr}
                        </span>
                    )}
                    <span
                        className="kb-chip"
                        style={{
                            background: priority.color + '22',
                            color: priority.color,
                            border: `1px solid ${priority.color}44`,
                        }}
                    >
                        {priority.label}
                    </span>
                    {task.Tags &&
                        task.Tags.slice(0, 2).map(tag => (
                            <span key={tag} className="kb-chip kb-chip--tag">
                                {tag}
                            </span>
                        ))}
                    {task.Tags && task.Tags.length > 2 && (
                        <span className="kb-chip kb-chip--tag">
                            +{task.Tags.length - 2}
                        </span>
                    )}
                </div>
            </div>

            <div className="kb-card__actions">
                {columnIndex > 0 && (
                    <button
                        className="kb-card__btn"
                        onClick={() => onMoveLeft(task)}
                        title="Mover a columna anterior"
                    >
                        ←
                    </button>
                )}
                {columnIndex < totalColumns - 1 && (
                    <button
                        className="kb-card__btn"
                        onClick={() => onMoveRight(task)}
                        title="Mover a siguiente columna"
                    >
                        →
                    </button>
                )}
                <button
                    className="kb-card__btn kb-card__btn--edit"
                    onClick={() => onEdit(task)}
                    title="Editar tarea"
                >
                    ✎
                </button>
                <button
                    className="kb-card__btn kb-card__btn--delete"
                    onClick={() => onDelete(task.TaskId)}
                    title="Eliminar tarea"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

// ─── Modal de edición/creación ────────────────────────────────────
function TaskModal({ task, onSave, onClose }) {
    const isNew = !task;
    const [form, setForm] = useState({
        name:        task?.Name        ?? '',
        description: task?.Description ?? '',
        deadline:    task?.Deadline
            ? new Date(task.Deadline).toISOString().slice(0, 10)
            : '',
        priority:    task?.Priority    ?? 'medium',
        tags:        task?.Tags?.join(', ') ?? '',
        alarmDate:   task?.AlarmTime
            ? new Date(task.AlarmTime).toISOString().slice(0, 10)
            : '',
        alarmTime:   task?.AlarmTime
            ? new Date(task.AlarmTime).toTimeString().slice(0, 5)
            : '',
    });

    const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

    const handleSave = () => {
        if (!form.name.trim()) return;
        const alarmTime =
            form.alarmDate && form.alarmTime
                ? new Date(`${form.alarmDate}T${form.alarmTime}`)
                : null;
        onSave({
            ...(task ?? {}),
            Name:        form.name.trim(),
            Description: form.description.trim(),
            Deadline:    form.deadline ? new Date(form.deadline) : new Date(),
            Priority:    form.priority,
            Tags:        form.tags
                .split(',')
                .map(t => t.trim())
                .filter(Boolean),
            AlarmTime:   alarmTime,
        });
    };

    return (
        <div className="kb-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="kb-modal" role="dialog" aria-modal="true">
                <div className="kb-modal__header">
                    <h3>{isNew ? 'Nueva tarea' : 'Editar tarea'}</h3>
                    <button className="kb-modal__close" onClick={onClose}>✕</button>
                </div>

                <div className="kb-modal__body">
                    <label className="kb-label">
                        <span>Nombre *</span>
                        <input
                            className="kb-input"
                            type="text"
                            placeholder="¿Qué hay que hacer?"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                            autoFocus
                        />
                    </label>

                    <label className="kb-label">
                        <span>Descripción</span>
                        <textarea
                            className="kb-input kb-textarea"
                            placeholder="Detalles opcionales..."
                            rows={3}
                            value={form.description}
                            onChange={e => set('description', e.target.value)}
                        />
                    </label>

                    <div className="kb-modal__row">
                        <label className="kb-label">
                            <span>Fecha límite</span>
                            <input
                                className="kb-input"
                                type="date"
                                value={form.deadline}
                                onChange={e => set('deadline', e.target.value)}
                            />
                        </label>

                        <label className="kb-label">
                            <span>Prioridad</span>
                            <select
                                className="kb-input kb-select"
                                value={form.priority}
                                onChange={e => set('priority', e.target.value)}
                            >
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                            </select>
                        </label>
                    </div>

                    <div className="kb-modal__row">
                        <label className="kb-label">
                            <span>Fecha de alarma</span>
                            <input
                                className="kb-input"
                                type="date"
                                value={form.alarmDate}
                                onChange={e => set('alarmDate', e.target.value)}
                            />
                        </label>
                        <label className="kb-label">
                            <span>Hora de alarma</span>
                            <input
                                className="kb-input"
                                type="time"
                                value={form.alarmTime}
                                onChange={e => set('alarmTime', e.target.value)}
                            />
                        </label>
                    </div>

                    <label className="kb-label">
                        <span>Etiquetas <small>(separadas por coma)</small></span>
                        <input
                            className="kb-input"
                            type="text"
                            placeholder="diseño, urgente, bug…"
                            value={form.tags}
                            onChange={e => set('tags', e.target.value)}
                        />
                    </label>
                </div>

                <div className="kb-modal__footer">
                    <button className="kb-btn kb-btn--ghost" onClick={onClose}>
                        Cancelar
                    </button>
                    <button className="kb-btn kb-btn--primary" onClick={handleSave}>
                        {isNew ? 'Crear tarea' : 'Guardar cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Columna Kanban ───────────────────────────────────────────────
function KanbanColumn({
    column,
    tasks,
    columnIndex,
    totalColumns,
    draggingTask,
    dragOverColumn,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onEdit,
    onDelete,
    onMoveLeft,
    onMoveRight,
}) {
    const isOver = dragOverColumn === column.id;

    return (
        <div
            className={`kb-column${isOver ? ' kb-column--over' : ''}`}
            onDragOver={e => onDragOver(e, column.id)}
            onDrop={e => onDrop(e, column.id)}
        >
            {/* Encabezado columna */}
            <div className="kb-column__header">
                <span
                    className="kb-column__dot"
                    style={{ background: column.accent }}
                />
                <span className="kb-column__title">{column.label}</span>
                <span className="kb-column__count">{tasks.length}</span>
            </div>

            {/* Tarjetas */}
            <div className="kb-column__cards">
                {tasks.length === 0 && (
                    <div className={`kb-column__empty${isOver ? ' kb-column__empty--over' : ''}`}>
                        Suelta aquí
                    </div>
                )}
                {tasks.map(task => (
                    <TaskCard
                        key={task.TaskId}
                        task={task}
                        isDragging={draggingTask?.TaskId === task.TaskId}
                        columnIndex={columnIndex}
                        totalColumns={totalColumns}
                        onDragStart={onDragStart}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onMoveLeft={onMoveLeft}
                        onMoveRight={onMoveRight}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Componente principal ─────────────────────────────────────────
export default function KanbanBoard({ tasks, onMoveTask, onUpdateTask, onDeleteTask, onAddTask }) {
    const [draggingTask, setDraggingTask] = useState(null);
    const [dragOverColumn, setDragOverColumn] = useState(null);
    const [modalTask, setModalTask] = useState(undefined); // undefined=cerrado, null=nuevo, task=editar
    const [filterPriority, setFilterPriority] = useState('all');
    const [search, setSearch] = useState('');
    const dragLeaveTimer = useRef(null);

    // Normaliza status para tareas que venían sin él
    const normalizeStatus = task => {
        if (task.Status) return task.Status;
        return task.Completed ? 'done' : 'todo';
    };

    // Filtrado
    const filtered = tasks.filter(task => {
        const matchesPriority =
            filterPriority === 'all' || task.Priority === filterPriority;
        const matchesSearch =
            !search ||
            task.Name.toLowerCase().includes(search.toLowerCase()) ||
            (task.Description || '').toLowerCase().includes(search.toLowerCase());
        return matchesPriority && matchesSearch;
    });

    // Agrupar por columna
    const byColumn = col =>
        filtered
            .filter(t => normalizeStatus(t) === col)
            .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));

    // ── Drag & drop ────────────────────────────────────────────────
    const handleDragStart = useCallback((e, task) => {
        setDraggingTask(task);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragOver = useCallback((e, columnId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearTimeout(dragLeaveTimer.current);
        setDragOverColumn(columnId);
    }, []);

    const handleDrop = useCallback(
        (e, columnId) => {
            e.preventDefault();
            setDragOverColumn(null);
            if (!draggingTask) return;
            const currentStatus = normalizeStatus(draggingTask);
            if (currentStatus !== columnId) {
                onMoveTask(draggingTask.TaskId, columnId);
            }
            setDraggingTask(null);
        },
        [draggingTask, onMoveTask]
    );

    const handleDragEnd = useCallback(() => {
        setDraggingTask(null);
        setDragOverColumn(null);
    }, []);

    // ── Botones de flecha ──────────────────────────────────────────
    const handleMoveLeft = useCallback(
        task => {
            const idx = COLUMNS.findIndex(c => c.id === normalizeStatus(task));
            if (idx > 0) onMoveTask(task.TaskId, COLUMNS[idx - 1].id);
        },
        [onMoveTask]
    );

    const handleMoveRight = useCallback(
        task => {
            const idx = COLUMNS.findIndex(c => c.id === normalizeStatus(task));
            if (idx < COLUMNS.length - 1) onMoveTask(task.TaskId, COLUMNS[idx + 1].id);
        },
        [onMoveTask]
    );

    // ── Modal ──────────────────────────────────────────────────────
    const handleSaveModal = useCallback(
        taskData => {
            if (!taskData.TaskId) {
                // Nueva tarea
                onAddTask({ ...taskData, TaskId: Date.now() });
            } else {
                // Edición
                onUpdateTask(taskData);
            }
            setModalTask(undefined);
        },
        [onAddTask, onUpdateTask]
    );

    return (
        <section className="kb-root">
            {/* Toolbar */}
            <div className="kb-toolbar">
                <div className="kb-toolbar__left">
                    <span className="panel-kicker">Tablero</span>
                    <h2>Kanban</h2>
                </div>
                <div className="kb-toolbar__right">
                    <input
                        className="kb-search"
                        type="search"
                        placeholder="Buscar tarea…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <select
                        className="kb-filter-select"
                        value={filterPriority}
                        onChange={e => setFilterPriority(e.target.value)}
                    >
                        <option value="all">Todas las prioridades</option>
                        <option value="high">Alta</option>
                        <option value="medium">Media</option>
                        <option value="low">Baja</option>
                    </select>
                    <button
                        className="kb-btn kb-btn--primary"
                        onClick={() => setModalTask(null)}
                    >
                        + Nueva tarea
                    </button>
                </div>
            </div>

            {/* Columnas */}
            <div className="kb-board" onDragEnd={handleDragEnd}>
                {COLUMNS.map((col, idx) => (
                    <KanbanColumn
                        key={col.id}
                        column={col}
                        tasks={byColumn(col.id)}
                        columnIndex={idx}
                        totalColumns={COLUMNS.length}
                        draggingTask={draggingTask}
                        dragOverColumn={dragOverColumn}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        onEdit={task => setModalTask(task)}
                        onDelete={onDeleteTask}
                        onMoveLeft={handleMoveLeft}
                        onMoveRight={handleMoveRight}
                    />
                ))}
            </div>

            {/* Modal */}
            {modalTask !== undefined && (
                <TaskModal
                    task={modalTask}
                    onSave={handleSaveModal}
                    onClose={() => setModalTask(undefined)}
                />
            )}
        </section>
    );
}