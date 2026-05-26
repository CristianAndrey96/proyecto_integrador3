# Todo Task

Proyecto separado en dos carpetas:

- `backend`: API en Node.js/Express conectada a MongoDB.
- `frontend`: interfaz en React con Vite.

## Ejecutar el backend

```bash
cd backend
npm install
npm run dev
```

Por defecto corre en `http://localhost:3000`.

## Ejecutar el frontend

```bash
cd frontend
npm install
npm run dev
```

Por defecto corre en `http://localhost:5173` y consume la API desde `http://localhost:3000/api`.

## Variables de entorno

Backend:

```env
DBMONGO=YOUR_DB_NAME
DBMONGOPASS=YOUR_USER_PASSWORD
DBMONGOSERV=YOUR_CLUSTER_SERVER
DBMONGOUSER=YOUR_USER
FRONTEND_URL=http://localhost:5173
```

Frontend:

```env
VITE_API_URL=http://localhost:3000/api
```
