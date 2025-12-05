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

// Build the prompt for 2 people doing something together
function buildPolaroidPrompt(userPrompt) {
  return `Create an authentic vintage Polaroid photograph of the two people from the uploaded photos.

POLAROID AESTHETIC (critical for realism):
- Classic Polaroid instant film look with slightly faded, warm colors
- Natural film grain throughout the image
- Soft focus with slight blur at edges
- That authentic "flash photography" look
- White Polaroid frame border around the image

WHAT THEY'RE DOING:
${userPrompt}

PRESERVE BOTH PEOPLE:
- Keep both people's faces, features, and likeness EXACTLY as they appear in their uploaded photos
- Their clothing, hair, and distinguishing features should match the originals
- Natural poses and expressions that fit the scene

The final image should look like a genuine Polaroid that a friend snapped - nostalgic, warm, and authentic. Make it feel like a real captured moment between these two people.`;
}

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

// Analyze two photos and generate combined image
async function generateTwoPeoplePolaroid(image1Base64, image2Base64, userPrompt, mimeType1 = 'image/png', mimeType2 = 'image/png') {
  // First analyze both people
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
              text: 'Analyze these two photos. For each person, describe in detail: their face (skin tone, facial features, hair color/style), their clothing, their body type, and any distinguishing features. Label them as Person 1 and Person 2.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType1};base64,${image1Base64}`
              }
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType2};base64,${image2Base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 800
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const peopleDescription = analysisResponse.data.choices[0].message.content;
  const fullPrompt = buildPolaroidPrompt(userPrompt);

  // Generate the combined image
  const generationResponse = await axios.post(
    'https://api.openai.com/v1/images/generations',
    {
      model: 'gpt-image-1',
      prompt: `${fullPrompt}\n\nDETAILED DESCRIPTION OF THE TWO PEOPLE TO INCLUDE:\n${peopleDescription}`,
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

// POST /api/create - Create Polaroid with 2 people
app.post('/api/create', upload.array('images', 2), async (req, res) => {
  try {
    if (!req.files || req.files.length !== 2) {
      return res.status(400).json({ error: 'Please upload exactly 2 photos' });
    }

    const userPrompt = req.body.prompt;
    if (!userPrompt || userPrompt.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide a prompt describing what the people should be doing' });
    }

    const image1Base64 = imageToBase64(req.files[0].path);
    const image2Base64 = imageToBase64(req.files[1].path);
    const mimeType1 = req.files[0].mimetype;
    const mimeType2 = req.files[1].mimetype;

    // Generate the Polaroid
    const result = await generateTwoPeoplePolaroid(image1Base64, image2Base64, userPrompt, mimeType1, mimeType2);

    // Save the result
    const outputFilename = `polaroid-${Date.now()}.png`;
    const outputPath = path.join(outputsDir, outputFilename);
    const outputBuffer = Buffer.from(result.data[0].b64_json, 'base64');
    fs.writeFileSync(outputPath, outputBuffer);

    res.json({
      success: true,
      result: `/outputs/${outputFilename}`
    });
  } catch (error) {
    console.error('Create error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create image',
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
  console.log(`Polaroid API running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`   POST /api/create - Create Polaroid with 2 people`);
  console.log(`   GET  /api/health - Health check`);
});
