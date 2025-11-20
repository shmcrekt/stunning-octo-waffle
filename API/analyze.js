// Node.js Serverless Function Blueprint for Vercel
// This file runs on the backend to handle the file upload and analysis.
// (Currently mocked to return sample data for deployment validation).

import formidable from 'formidable';

// Configuration for Forge is mocked for now
const FORGE_CLIENT_ID = process.env.FORGE_CLIENT_ID || 'MOCK_CLIENT_ID';
const FORGE_CLIENT_SECRET = process.env.FORGE_CLIENT_SECRET || 'MOCK_CLIENT_SECRET';

// Helper function to handle multipart form data
const parseMultipartForm = (req) => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false,
      maxFileSize: 100 * 1024 * 1024, // 100MB limit
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        return reject(err);
      }
      const file = files.cadFile ? files.cadFile[0] : null;
      resolve(file);
    });
  });
};

// Mocks the complex logic of analyzing a CAD file using an external API
const mockForgeAnalysis = async (file) => {
  const fileName = file.originalFilename || 'unknown.stl';
  const extension = fileName.split('.').pop().toLowerCase();
  
  // Simulate high accuracy for most target formats
  const isHighAccuracyFormat = ['step', 'stp', 'sldprt', 'ipt'].includes(extension) || extension === 'stl';

  const result = {
    volume: 187.35, // cm³ 
    dimensions: { length: 65, width: 42, height: 75 }, // mm
    wallThickness: 1.8, // mm
    surfaceArea: 210.5, // cm²
    boundingBox: {},
    accuracy: isHighAccuracyFormat ? 'high' : 'medium', 
  };

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500)); 

  return result;
};


// Main serverless function handler
export default async function handler(req, res) {
  // CORS setup for Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const file = await parseMultipartForm(req);

    if (!file) {
      return res.status(400).json({ message: 'No CAD file uploaded in the request body.' });
    }

    const analysisResult = await mockForgeAnalysis(file);

    return res.status(200).json({
      message: 'Analysis successful (simulated via Forge blueprint).',
      analysisData: analysisResult,
    });

  } catch (error) {
    console.error('CAD Analysis Error:', error);
    return res.status(500).json({ 
        message: 'Internal Server Error during analysis simulation.', 
        error: error.message 
    });
  }
}
