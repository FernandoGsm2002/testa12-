# ArepaTool A12+ Bypass Server - Vercel Edition

## Despliegue en Vercel (GRATIS)

### Paso 1: Crear cuenta en Vercel
1. Ve a https://vercel.com
2. Regístrate con GitHub (recomendado)

### Paso 2: Subir a GitHub
1. Crea un nuevo repositorio en GitHub
2. Sube esta carpeta `VercelServer` completa al repositorio

### Paso 3: Desplegar en Vercel
1. En Vercel, click "Add New" -> "Project"
2. Importa tu repositorio de GitHub
3. Click "Deploy"
4. Espera 1-2 minutos

### Paso 4: Obtener URL
Una vez desplegado, obtendrás una URL como:
```
https://tu-proyecto.vercel.app
```

### Paso 5: Configurar ArepaTool
1. Abre ArepaTool
2. Crea el archivo `apple_server.txt` en la carpeta de instalación
3. Escribe la URL: `https://tu-proyecto.vercel.app`

## Prueba del Servidor
Accede a:
```
https://tu-proyecto.vercel.app/api/get2?prd=iPhone11,2&guid=TEST-GUID-1234&sn=C00000000
```

Deberías recibir un JSON con:
```json
{
  "success": true,
  "links": {
    "step1_fixedfile": "https://...",
    "step2_bldatabase": "https://...",
    "step3_final": "https://..."
  }
}
```

## Estructura de Archivos
```
VercelServer/
├── api/
│   ├── get2.js       <- API principal
│   └── download.js   <- Sirve archivos generados
├── public/
│   ├── Maker/        <- Plists de dispositivos
│   ├── BLDatabaseManager.png
│   ├── downloads.28.png
│   └── badfile.plist
├── package.json
└── vercel.json
```

## Notas
- Vercel tiene tier gratuito generoso (100GB bandwidth/mes)
- Los archivos en /tmp se borran automáticamente (no necesita limpieza manual)
- HTTPS automático incluido
