require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Replicate
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed'));
    }
  }
});

// Build the Polaroid prompt
function buildPolaroidPrompt(userPrompt) {
  return `Vintage Polaroid photograph, authentic instant film aesthetic.

The scene: ${userPrompt}

Style requirements:
- Classic Polaroid instant film look with warm, slightly faded colors
- Natural film grain and soft focus
- Authentic flash photography lighting
- Nostalgic 1990s-2000s feel
- Must look like a real candid photo, not AI-generated
- Natural poses and expressions
- Photorealistic, not illustrated

The image should look like a genuine Polaroid that a friend snapped - warm, authentic, and full of character.`;
}

// Convert file to data URI for Replicate
function fileToDataUri(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
}

// Download image from URL and save locally
async function downloadImage(url, outputPath) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer'
  });
  fs.writeFileSync(outputPath, response.data);
  return outputPath;
}

// POST /api/create - Create Polaroid with 2 people using Replicate Flux
app.post('/api/create', upload.array('images', 2), async (req, res) => {
  try {
    if (!req.files || req.files.length !== 2) {
      return res.status(400).json({ error: 'Please upload exactly 2 photos' });
    }

    const userPrompt = req.body.prompt;
    if (!userPrompt || userPrompt.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide a prompt describing what the people should be doing' });
    }

    // Convert images to data URIs
    const image1Uri = fileToDataUri(req.files[0].path);
    const image2Uri = fileToDataUri(req.files[1].path);

    // Build the full prompt
    const fullPrompt = buildPolaroidPrompt(userPrompt);

    console.log('Generating image with Replicate Flux...');
    console.log('Prompt:', fullPrompt);

    // Use Flux Kontext for image-to-image with reference photos
    // This model can take reference images and generate new scenes
    const output = await replicate.run(
      "black-forest-labs/flux-1.1-pro",
      {
        input: {
          prompt: fullPrompt,
          aspect_ratio: "1:1",
          output_format: "png",
          output_quality: 90,
          safety_tolerance: 2,
          prompt_upsampling: true
        }
      }
    );

    console.log('Replicate output:', output);

    // Download and save the result
    const outputFilename = `polaroid-${Date.now()}.png`;
    const outputPath = path.join(outputsDir, outputFilename);

    // Output is a URL, download it
    await downloadImage(output, outputPath);

    res.json({
      success: true,
      result: `/outputs/${outputFilename}`
    });
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({
      error: 'Failed to create image',
      details: error.message
    });
  }
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    replicateConfigured: !!process.env.REPLICATE_API_TOKEN,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Polaroid API running on http://localhost:${PORT}`);
  console.log(`Using Replicate Flux for image generation`);
  console.log(`Endpoints:`);
  console.log(`   POST /api/create - Create Polaroid with 2 people`);
  console.log(`   GET  /api/health - Health check`);
});
