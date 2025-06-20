module.exports = {
    sessionSecret: 'your-secret-key-here',
    defaultBufferSize: 30, // Default buffer size in seconds
    database: {
        url: process.env.DB_URL || 'mongodb://localhost:27017/mediaserver'
    },
    storage: {
        path: './media'
    }
};