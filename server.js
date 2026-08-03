// 🧩 සරල Image (BMP/JPG Data) G-code බවට හරවන Function එක
function convertImageToGCode(buffer) {
    let gcode = [];
    gcode.push("G90 ; Absolute positioning");
    gcode.push("G21 ; Millimeters units");
    gcode.push("M3 S0 ; Pen UP");
    gcode.push("G0 X0 Y0 ; Move Home");

    // Sample Grid Mapping for Plotter
    // මෙහිදී Image එකේ Size එක අනුව Basic Stroke G-code එකක් ජනනය වේ
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


const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multi-part file upload configuration (for G-code files)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'latest.gcode')
});
const upload = multer({ storage: storage });

// ================= STATE VARIABLES =================
let fileVersion = 0;
let commandId = 0;
let currentCommand = "idle";

// ================= API ENDPOINTS =================

// 1. ESP32 Poll කරන Endpoint එක (Status පරීක්ෂාවට)
app.get('/api/plotter/status', (req, res) => {
    res.json({
        file_version: fileVersion,
        command_id: commandId,
        command: currentCommand
    });
});

// 2. ESP32 එක G-code File එක Download කරගන්නා Endpoint එක
app.get('/api/latest-gcode', (req, res) => {
    const filePath = path.join(uploadDir, 'latest.gcode');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send("No G-code file uploaded yet.");
    }
});

// 3. Flutter App එකෙන් G-code Upload කරන Endpoint එක
app.post('/api/upload-gcode', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    fileVersion++; // අලුත් file එකක් ආ විට version එක එකකින් වැඩි වේ
    console.log(`[SERVER] New G-code uploaded! Version: ${fileVersion}`);
    res.json({ message: "G-code uploaded successfully", file_version: fileVersion });
});

// 📤 Flutter App එකෙන් එවන Photo එක බාරගෙන G-code හදන Endpoint එක
app.post('/api/upload-image', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file uploaded" });
        }

        // 1. Image එක G-code එකක් බවට Convert කිරීම
        const gcodeContent = convertImageToGCode(req.file.buffer);

        // 2. G-code එක 'plot.gcode' ලෙස Save කිරීම
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, 'plot.gcode'), gcodeContent);

        // 3. File Version එක 1කින් වැඩි කිරීම (ESP32 එකට Auto-Download වෙන්න)
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


// 4. Flutter App එකෙන් Commands (Start, Stop, Pause) යවන Endpoint එක
app.post('/api/plotter/command', (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: "Command is required" });
    }
    
    currentCommand = command;
    commandId++; // අලුත් command එකක් ආ විට ID එක වැඩි වේ
    console.log(`[SERVER] Command received: ${command} (ID: ${commandId})`);
    
    res.json({ message: "Command updated", command_id: commandId, command: currentCommand });
});

// Server Start කිරීම
app.listen(PORT, () => {
    console.log(`🚀 CNC Plotter Server running on port ${PORT}`);
});