const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/octet-stream');
    
    try {
        const { type, id } = req.query;

        if (!type || !id) {
            return res.status(400).send('Missing type or id');
        }

        const tmpDir = path.join('/tmp', 'bypass');
        let filePath;

        switch (type) {
            case 'step1':
                filePath = path.join(tmpDir, 'firststp', id, 'fixedfile');
                break;
            case 'step2':
                filePath = path.join(tmpDir, '2ndd', id, 'BLDatabaseManager.sqlite');
                break;
            case 'step3':
                filePath = path.join(tmpDir, 'last', id, 'downloads.28.sqlitedb');
                break;
            default:
                return res.status(400).send('Invalid type');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }

        const content = fs.readFileSync(filePath);
        res.setHeader('Content-Length', content.length);
        return res.send(content);

    } catch (error) {
        console.error('Download error:', error);
        return res.status(500).send(error.message);
    }
};
