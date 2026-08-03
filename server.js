const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔓 CORS සහ Middleware පිහිටුවීම
app.use(cors());
app.use(express.json());

// 📁 Multer File Upload configuration (Memory storage for image conversion)
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------
// Global Variables (ESP32 එක සමඟ Sync වීමට)
let fileVersion = 1;
let currentCommand = 'idle';
let commandId = 0;

// ---------------------------------------------------------------------
// 🧩 Image (BMP/JPG Buffer) එකක් G-code බවට හරවන Function එක
function convertImageToGCode(buffer) {
    let gcode = [];
    gcode.push("G90 ; Absolute positioning");
    gcode.push("G21 ; Millimeters units");
    gcode.push("M3 S0 ; Pen UP");
    gcode.push("G0 X0 Y0 ; Move Home");

    // Sample Plotter Bounds / Boundary Square
    const width = 50; 
    const height = 50;

    gcode.push("G0 X5 Y5");
    gcode.push("M3 S1000 ; Pen DOWN");
    gcode.push("G1 X" + width + " Y5 F1000");
    gcode.push("G1 X" + width + " Y" + height);
    gcode.push("G1 X5 Y" + height);
    gcode.push("G1 X5 Y5");
    gcode.push("M3 S0 ; Pen UP");
    gcode.push("G0 X0 Y0 ; Return Home");

    return gcode.join("\n");
}

// ---------------------------------------------------------------------
// 1. Root Test Endpoint
app.get('/', (req, res) => {
    res.send("CNC Pen Plotter Server is Running!");
});

// ---------------------------------------------------------------------
// 2. Direct G-code File Upload Endpoint (.gcode files සඳහා)
app.post('/api/upload-gcode', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No G-code file uploaded" });
        }

        fs.writeFileSync(path.join(__dirname, 'plot.gcode'), req.file.buffer);
        fileVersion++;
        currentCommand = 'idle';

        console.log(`[SERVER] G-code uploaded directly! New fileVersion: ${fileVersion}`);

        res.json({
            message: "G-code uploaded successfully!",
            file_version: fileVersion
        });
    } catch (err) {
        console.error("Error uploading G-code:", err);
        res.status(500).json({ error: "Failed to upload G-code" });
    }
});

// ---------------------------------------------------------------------
// 3. Image Upload & G-code Conversion Endpoint (Flutter Photo Upload සඳහා)
app.post('/api/upload-image', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file uploaded" });
        }

        // Image එක G-code එකක් බවට Convert කිරීම
        const gcodeContent = convertImageToGCode(req.file.buffer);

        // G-code එක 'plot.gcode' ලෙස Save කිරීම
        fs.writeFileSync(path.join(__dirname, 'plot.gcode'), gcodeContent);

        fileVersion++;
        currentCommand = 'idle';

        console.log(`[SERVER] Image converted to G-code successfully! New fileVersion: ${fileVersion}`);

        res.json({
            message: "Photo uploaded & converted to G-code successfully!",
            file_version: fileVersion
        });
    } catch (err) {
        console.error("Error converting image:", err);
        res.status(500).json({ error: "Failed to convert image to G-code" });
    }
});

// ---------------------------------------------------------------------
// 4. Flutter App Control Commands Endpoint (Start, Stop, Pause)
app.post('/api/plotter/command', (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: "Command is required" });
    }

    currentCommand = command;
    commandId++;

    console.log(`[SERVER] New Command Received: ${command} (ID: ${commandId})`);

    res.json({
        message: `Command '${command}' received successfully`,
        command: currentCommand,
        command_id: commandId
    });
});

// ---------------------------------------------------------------------
// 5. ESP32 Polling Endpoint (ESP32 එක මඟින් Status/G-code ලබා ගන්නා ස්ථානය)
app.get('/api/plotter/status', (req, res) => {
    res.json({
        file_version: fileVersion,
        command: currentCommand,
        command_id: commandId
    });
});

// ---------------------------------------------------------------------
// 6. ESP32 G-code Download Endpoint
app.get('/api/plotter/download-gcode', (req, res) => {
    const filePath = path.join(__dirname, 'plot.gcode');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send("No G-code file found on server.");
    }
});

// ---------------------------------------------------------------------
// Server Start
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});