const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    // console.log('Usuario conectado');
    let receivedChunks = {};

    socket.on('imageChunk', (data) => {
        const { chunk, offset, totalSize } = data;
    
        if (!receivedChunks[socket.id]) {
            receivedChunks[socket.id] = {
                data: [],
                totalSize
            };
        }
    
        receivedChunks[socket.id].data.push(chunk);
    
        if (receivedChunks[socket.id].data.length === Math.ceil(totalSize / 1000)) {
            const imageDataUrl = receivedChunks[socket.id].data.join('');
            delete receivedChunks[socket.id];
            io.emit('image', imageDataUrl);
        }
    });

    socket.on('pincel', (data) => {
        console.log("Pincelando")
        socket.broadcast.emit('pincel', data);
    });

    // socket.on('image', (imgDataUrl) => {
    //     console.log("Imagen nueva")
    //     socket.broadcast.emit('image', imgDataUrl);
    // });

    socket.on('fill', (data) => {
        console.log("Rellenando")
        io.emit('fill', data);
    });

    socket.on('disconnect', () => {
        // console.log('Usuario desconectado');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
