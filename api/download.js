// Almacenamiento compartido en memoria
const payloadStorage = new Map();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/octet-stream');
    
    try {
        const { type, id } = req.query;

        if (!type || !id) {
            return res.status(400).send('Missing type or id');
        }

        const key = `${type}_${id}`;
        const data = payloadStorage.get(key);

        if (!data) {
            return res.status(404).send('File not found or expired');
        }

        res.setHeader('Content-Length', data.length);
        return res.send(data);

    } catch (error) {
        console.error('Download error:', error);
        return res.status(500).send(error.message);
    }
};

// Exportar storage para compartir
module.exports.payloadStorage = payloadStorage;
