// api/forge-webhook.js
// Receives POST requests from the Autodesk Platform when a translation job is complete.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const webhookData = req.body;
    
    // --- SECURITY & DATA RETRIEVAL (BLUEPRINT) ---
    // 1. Webhook Validation: Verify the x-adsk-signature using FORGE_WEBHOOK_SECRET
    // 2. Job Status Check: Ensure status is 'success'.
    const jobId = webhookData.payload?.context?.jobId || 'unknown_job'; 
    
    // 3. RETRIEVE ANALYSIS DATA from Forge using the URN:
    // This section would use the Forge SDK to download the geometry properties.
    
    // MOCK DATA STORAGE (Replace with Redis or Firestore write):
    const MOCK_STORAGE = global.MOCK_STORAGE || {};
    
    // Only save the result if the job was successful
    if (webhookData.status === 'success') {
      const geometryResult = {
        volume: 187.35,
        dimensions: { length: 65, width: 42, height: 75 },
        wallThickness: 1.8,
        accuracy: 'high'
      };
      
      // Store the final, completed geometry data keyed by jobId
      MOCK_STORAGE[jobId] = { status: 'complete', analysisData: geometryResult };
      global.MOCK_STORAGE = MOCK_STORAGE;
      console.log(`Webhook: Results stored successfully for Job ID: ${jobId}`);
      
    } else {
      // Store failed status
      MOCK_STORAGE[jobId] = { status: 'failed', analysisData: null };
      global.MOCK_STORAGE = MOCK_STORAGE;
      console.error(`Webhook: Job failed for Job ID: ${jobId}`);
    }

    return res.status(204).end(); 

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ message: 'Webhook failed to process.' });
  }
}
