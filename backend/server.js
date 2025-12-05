require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

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

// iPhone 17 Pro style characteristics based on research:
// - Lively, rich colors with neutral white balance
// - Wide dynamic range with smooth shadow/highlight transitions
// - Sharp detail with natural rendering
// - Warm, slightly saturated skin tones
// - Deep Fusion processing for texture detail
// - Smart HDR 5 for balanced exposure

const IPHONE_17_PRO_STYLE_PROMPT = `Transform this photo to match the iPhone 17 Pro camera style with these characteristics:
- Rich, lively colors with accurate neutral white balance
- Wide dynamic range with smooth transitions between shadows and highlights
- Sharp detail with natural texture rendering (avoid painterly/artificial look)
- Warm, naturally saturated skin tones if people are present
- Deep Fusion-style processing that preserves fine textures and reduces noise
- Smart HDR 5-style balanced exposure across the entire frame
- Professional-grade clarity and contrast
- Natural bokeh if depth is present
Keep the composition identical, only enhance the color grading, dynamic range, and overall processing quality to match flagship iPhone 17 Pro output.`;

const MONACO_SUPERCAR_PROMPT = `Replace the background of this photo with a luxurious Monaco setting featuring:
- A stunning supercar (Lamborghini, Ferrari, or McLaren) parked nearby
- The iconic Monaco harbor with luxury yachts in the background
- Mediterranean blue sky with soft clouds
- Palm trees and elegant architecture
- Golden hour lighting with warm, cinematic tones
- Reflective surfaces showing the glamorous atmosphere
Keep the person/subject in the foreground perfectly preserved with natural lighting that matches the new background. Make the composite look completely realistic and seamless, as if the photo was actually taken in Monaco.`;

// Helper: Convert image file to base64
function imageToBase64(filePath) {
  const imageBuffer = fs.readFileSync(filePath);
  return imageBuffer.toString('base64');
}

// Helper: Call OpenAI Image API
async function callOpenAIImageEdit(base64Image, prompt, mimeType = 'image/png') {
  const response = await axios.post(
    'https://api.openai.com/v1/images/edits',
    {
      model: 'gpt-image-1',
      image: `data:${mimeType};base64,${base64Image}`,
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json'
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 2 minute timeout for image processing
    }
  );
  return response.data;
}

// Alternative: Use chat completions with vision for analysis + generation
async function callOpenAIVisionAndGenerate(base64Image, prompt, mimeType = 'image/png') {
  // First analyze the image
  const analysisResponse = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this image in detail. Describe the subject, their pose, clothing, and any important visual elements that need to be preserved.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const imageDescription = analysisResponse.data.choices[0].message.content;

  // Then generate new image with the prompt
  const generationResponse = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: 'gpt-image-1',
      prompt: `${prompt}\n\nSubject to preserve: ${imageDescription}`,
      n: 1,
      size: '1024x1024',
      quality: 'high',
      response_format: 'b64_json'
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    }
  );

  return generationResponse.data;
}

// POST /api/upload - Upload an image
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  res.json({
    success: true,
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    fullPath: req.file.path
  });
});

// POST /api/enhance/iphone17pro - Apply iPhone 17 Pro style
app.post('/api/enhance/iphone17pro', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const base64Image = imageToBase64(req.file.path);
    const mimeType = req.file.mimetype;

    // Use OpenAI to enhance the image
    const result = await callOpenAIImageEdit(base64Image, IPHONE_17_PRO_STYLE_PROMPT, mimeType);

    // Save the result
    const outputFilename = `iphone17pro-${Date.now()}.png`;
    const outputPath = path.join(outputsDir, outputFilename);
    const outputBuffer = Buffer.from(result.data[0].b64_json, 'base64');
    fs.writeFileSync(outputPath, outputBuffer);

    res.json({
      success: true,
      original: `/uploads/${req.file.filename}`,
      enhanced: `/outputs/${outputFilename}`,
      style: 'iPhone 17 Pro'
    });
  } catch (error) {
    console.error('Enhancement error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to enhance image',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// POST /api/enhance/monaco - Apply Monaco supercar background
app.post('/api/enhance/monaco', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const base64Image = imageToBase64(req.file.path);
    const mimeType = req.file.mimetype;

    // Use vision + generation for background replacement
    const result = await callOpenAIVisionAndGenerate(base64Image, MONACO_SUPERCAR_PROMPT, mimeType);

    // Save the result
    const outputFilename = `monaco-${Date.now()}.png`;
    const outputPath = path.join(outputsDir, outputFilename);
    const outputBuffer = Buffer.from(result.data[0].b64_json, 'base64');
    fs.writeFileSync(outputPath, outputBuffer);

    res.json({
      success: true,
      original: `/uploads/${req.file.filename}`,
      enhanced: `/outputs/${outputFilename}`,
      style: 'Monaco Supercar'
    });
  } catch (error) {
    console.error('Monaco enhancement error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to apply Monaco background',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// POST /api/enhance/full - Apply both: iPhone 17 Pro style + Monaco background
app.post('/api/enhance/full', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const base64Image = imageToBase64(req.file.path);
    const mimeType = req.file.mimetype;

    const FULL_PROMPT = `${MONACO_SUPERCAR_PROMPT}

Additionally, apply iPhone 17 Pro camera processing:
- Rich, lively colors with neutral white balance
- Wide dynamic range with smooth shadow/highlight transitions
- Sharp detail with natural texture rendering
- Professional-grade clarity and cinematic color grading`;

    const result = await callOpenAIVisionAndGenerate(base64Image, FULL_PROMPT, mimeType);

    const outputFilename = `flex-photo-${Date.now()}.png`;
    const outputPath = path.join(outputsDir, outputFilename);
    const outputBuffer = Buffer.from(result.data[0].b64_json, 'base64');
    fs.writeFileSync(outputPath, outputBuffer);

    res.json({
      success: true,
      original: `/uploads/${req.file.filename}`,
      enhanced: `/outputs/${outputFilename}`,
      style: 'iPhone 17 Pro + Monaco Supercar'
    });
  } catch (error) {
    console.error('Full enhancement error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to process image',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Flex Photo API running on http://localhost:${PORT}`);
  console.log(`📸 Endpoints:`);
  console.log(`   POST /api/upload - Upload an image`);
  console.log(`   POST /api/enhance/iphone17pro - Apply iPhone 17 Pro style`);
  console.log(`   POST /api/enhance/monaco - Apply Monaco supercar background`);
  console.log(`   POST /api/enhance/full - Apply both enhancements`);
  console.log(`   GET  /api/health - Health check`);
});
