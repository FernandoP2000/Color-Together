let socket = io();

let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d", { willReadFrequently: true });
let isBrushMode = false;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let accumulatedPoints = [];
let lineWidthSlider = document.getElementById("lineWidthSlider");
let canvasHistory = [];
let tolerancia = 98

function saveCanvasState() {
    canvasHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    console.log(canvasHistory);
}

function undoLastChange() {
    console.log(canvasHistory);
    if (canvasHistory.length > 0) {
        ctx.putImageData(canvasHistory.pop(), 0, 0);
    }
}
document.getElementById("btnUpload").addEventListener("click", function () {
    document.getElementById("fileInput").click();
});
document.getElementById("undoBtn").addEventListener("click", () => {
    undoLastChange();
});

document.getElementById("brushModeBtn").addEventListener("click", () => {
    isBrushMode = true;
});

document.getElementById("fillModeBtn").addEventListener("click", () => {
    isBrushMode = false;
});

canvas.addEventListener("mousedown", (event) => {
    if (event.button === 0 && isBrushMode) {
        isDrawing = true;
        [lastX, lastY] = [event.offsetX, event.offsetY];
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
    }
});

canvas.addEventListener("mousemove", (event) => {
    if (isBrushMode && isDrawing) {
        const currentX = event.offsetX;
        const currentY = event.offsetY;
        accumulatedPoints.push({ x: currentX, y: currentY });
        ctx.lineTo(currentX, currentY);
        ctx.strokeStyle = document.getElementById("colorPicker").value;
        ctx.lineWidth = parseInt(
            document.getElementById("lineWidthSlider").value,
        );
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        saveCanvasState();
    }
});

canvas.addEventListener("mouseleave", () => {
    if (isBrushMode && isDrawing) {
        alert("Borde detectado");
        isDrawing = false;
        sendPointsToServer();
    }
});

canvas.addEventListener("mouseup", () => {
    if (isBrushMode && isDrawing) {
        isDrawing = false;
        sendPointsToServer();
    }
});

function sendPointsToServer() {
    if (accumulatedPoints.length > 0) {
        const lineWidth = parseInt(
            document.getElementById("lineWidthSlider").value,
        );
        socket.emit("pincel", {
            points: accumulatedPoints,
            color: ctx.strokeStyle,
            lineWidth: lineWidth,
        });
        accumulatedPoints = [];
    }
}

document.getElementById("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    const chunkSize = 1000;

    reader.onload = function () {
        let offset = 0;

        while (offset < reader.result.length) {
            const chunk = reader.result.slice(offset, offset + chunkSize);
            socket.emit("imageChunk", {chunk,offset,totalSize: reader.result.length,});
            offset += chunkSize;
        }
    };

    reader.onerror = function () {
        console.error("Error al leer el archivo");
    };

    reader.readAsDataURL(file);
});

function floodFill(x, y, fillColor, tolerance) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const targetColor = getPixelColor(imageData, x, y);
    if (targetColor === fillColor) return;
    if (targetColor === "#000000") return;
    console.log(targetColor);
    socket.emit("fill", { x, y, color: fillColor });
    const stack = [];
    stack.push([x, y]);

    while (stack.length) {
        const [currentX, currentY] = stack.pop();

        if (
            currentX < 0 ||
            currentY < 0 ||
            currentX >= canvas.width ||
            currentY >= canvas.height
        )
            continue;

        const currentColor = getPixelColor(imageData, currentX, currentY);

        if (colorsAreSimilar(currentColor, targetColor, tolerance)) {
            setPixelColor(imageData, currentX, currentY, fillColor);
            stack.push([currentX + 1, currentY]);
            stack.push([currentX - 1, currentY]);
            stack.push([currentX, currentY + 1]);
            stack.push([currentX, currentY - 1]);
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function colorsAreSimilar(color1, color2, tolerance) {
    // Convertir los colores a RGB
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    // Calcular la diferencia absoluta en cada componente de color
    const dr = Math.abs(rgb1[0] - rgb2[0]);
    const dg = Math.abs(rgb1[1] - rgb2[1]);
    const db = Math.abs(rgb1[2] - rgb2[2]);

    // Si la diferencia absoluta es menor que la tolerancia, los colores son similares
    return dr <= tolerance && dg <= tolerance && db <= tolerance;
}

function getPixelColor(imageData, x, y) {
    const index = (y * imageData.width + x) * 4;
    return (
        "#" + (
            (1 << 24) +
            (imageData.data[index] << 16) +
            (imageData.data[index + 1] << 8) +
            imageData.data[index + 2]
        ).toString(16).slice(1)
    );
}

function setPixelColor(imageData, x, y, color) {
    const index = (y * imageData.width + x) * 4;
    const [r, g, b] = hexToRgb(color);
    imageData.data[index] = r;
    imageData.data[index + 1] = g;
    imageData.data[index + 2] = b;
    imageData.data[index + 3] = 255;
}

function hexToRgb(hex) {
    hex = hex.replace(/^#/, "");
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
}

canvas.addEventListener("click", (event) => {
    if (!isBrushMode) {
        const x = event.offsetX;
        const y = event.offsetY;
        const color = document.getElementById("colorPicker").value;
        floodFill(x, y, color, tolerancia);
        saveCanvasState();
    }
});

socket.on("fill", (data) => {
    const { x, y, color } = data;
    floodFill(x, y, color, tolerancia);
});

socket.on("pincel", (data) => {
    const { points, color, lineWidth } = data;

    if (points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
    }
});

socket.on("image", (imgDataUrl) => {
    console.log("Colocando img nueva");
    let img = new Image();
    img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);
    };
    img.src = imgDataUrl;
});
